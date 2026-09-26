// "How is this reservoir connected?" — ResNet network context, laid out as
// the thing to do first (show it on the map), then what it means:
//   1. Show on map: Upstream N | Downstream N | Both, plus the drainage area.
//      The counts live on the buttons; colour dots match the map layer.
//   2. Downstream path: the chain as a vertical schematic (dams, the river
//      junctions it passes, the mouth), long dam runs collapsed.
//   3. Drainage area and the share not behind another dam (ResNet SCA2025).
// The highlight itself is drawn by MapPanel via mapBus; this card owns which
// reservoir + mode are active (store.networkView resets on every selection
// change). The card body stays mounted while collapsed, so a highlight
// survives opening another card.

import { useEffect, useId, useState } from "react";
import { actions, useMapViewState, type AppState, type NetworkMode } from "../../state/store";
import { ensureCore, getCore } from "../../sediment/data";
import { downstreamPath, networkStats } from "../../sediment/network";
import { formatKm2 } from "../../sediment/format";
import { basinBounds, fetchBasin, type BasinFeature } from "../../sediment/nldi";
import { PROVENANCE } from "../../sediment/types";
import { mapCommands } from "../../map/mapBus";
import { InfoTip, KeyValues, SourceLine } from "./ui";

/** Session cache of NLDI basins by inventory row ("error" = a completed miss). */
const basinCache = new Map<number, BasinFeature | "error">();

const n = (v: number) => v.toLocaleString("en-US");

/** Header peek for the Network card: the counts, or what is on the map. */
export function networkPeek(row: number | null, view: AppState["networkView"]): string | null {
  if (view.mode !== "none" || view.basin) return "Shown on map";
  const core = getCore();
  if (!core || row == null) return null;
  const s = networkStats(core, row);
  return `${n(s.upCount)} up · ${n(s.downCount)} down`;
}

/** Share of the drainage area not behind another dam, e.g. "<1% (0.893 km²)". */
function directShare(daSqKm: number, scaSqKm: number): string {
  if (!Number.isFinite(daSqKm) || !Number.isFinite(scaSqKm) || daSqKm <= 0) return "";
  // ResNet's SCA2025 is a CONNECTIVITY metric: the area draining here without
  // passing any other dam. It is not a sediment-delivery fraction — upstream
  // dams pass part of their sediment load (that's RATTES's trap-efficiency
  // job). Heavily dammed basins legitimately sit near 0%.
  const pct = Math.max(0, Math.min(100, (scaSqKm / daSqKm) * 100));
  const pctText = pct > 0 && pct < 1 ? "<1%" : `${Math.round(pct)}%`;
  return `${pctText} (${formatKm2(scaSqKm)})`;
}

export function NetworkSection({ row }: { row: number | null }) {
  const state = useMapViewState(); // sedimentStamp + networkView re-renders
  const mode = state.networkView.mode;
  const basinOn = state.networkView.basin;
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [basinTick, setBasinTick] = useState(0);
  const labelId = useId();

  useEffect(() => {
    setError(false);
    ensureCore().catch(() => setError(true));
  }, [retryKey]);

  // Drive the map highlight; cleanup clears it (unmount, selection change via
  // the store's networkView reset, or mode "none").
  useEffect(() => {
    const cmds = mapCommands();
    if (!cmds) return;
    if (row != null && mode !== "none") cmds.highlightNetwork(row, mode);
    else cmds.clearNetworkHighlight();
    return () => mapCommands()?.clearNetworkHighlight();
  }, [row, mode, state.sedimentStatus.core]);

  // Drainage-area overlay: one NLDI fetch per reservoir (session-cached),
  // drawn via mapBus with the view extended to the basin. Aborts on toggle
  // off / selection change; a timeout or service miss caches "error" so the
  // card never hammers the API (Retry clears the entry).
  useEffect(() => {
    const cmds = mapCommands();
    if (!basinOn || row == null) {
      cmds?.clearBasin();
      return;
    }
    const core = getCore();
    if (!core) return;
    const cached = basinCache.get(row);
    if (cached === "error") return;
    if (cached) {
      cmds?.showBasin(cached);
      cmds?.fitToPoints(basinBounds(cached));
      return () => mapCommands()?.clearBasin();
    }
    let timedOut = false;
    const ctl = new AbortController();
    const timer = setTimeout(() => {
      timedOut = true;
      ctl.abort();
    }, 20000);
    fetchBasin(core.lon[row], core.lat[row], ctl.signal).then(
      (feature) => {
        clearTimeout(timer);
        basinCache.set(row, feature);
        setBasinTick((t) => t + 1); // re-runs this effect down the cached path to draw
      },
      (err: unknown) => {
        clearTimeout(timer);
        if ((err as Error)?.name === "AbortError" && !timedOut) return; // superseded, not a failure
        basinCache.set(row, "error");
        setBasinTick((t) => t + 1);
      },
    );
    return () => {
      clearTimeout(timer);
      ctl.abort();
      mapCommands()?.clearBasin();
    };
  }, [basinOn, row, basinTick, state.sedimentStatus.core]);

  const core = getCore();
  if (error) {
    return (
      <p className="sec-status" data-status="error">
        National dataset failed to load.{" "}
        <button type="button" className="linklike" onClick={() => setRetryKey((k) => k + 1)}>
          Retry
        </button>
      </p>
    );
  }
  if (!core || row == null) {
    return (
      <p className="sec-status" data-status="loading">
        Loading the national reservoir network…
      </p>
    );
  }

  const stats = networkStats(core, row);
  const path = downstreamPath(core, row);
  const hasUp = stats.upCount > 0;
  const hasDown = core.to[row] >= 0; // a terminal dam still shows its mouth
  const selfName = core.names[row] || core.nids[row];
  const tags = [stats.terminal && "Terminal dam", stats.headwater && "Headwater dam", stats.lock && "Navigation lock"].filter(
    (t): t is string => !!t,
  );
  const mouth = path.steps.find((s) => s.kind === "mouth");

  const modeBtn = (m: Exclude<NetworkMode, "none">, label: string, count: number | null, disabled: boolean) => (
    <button
      type="button"
      className="nw-btn nw-seg-btn"
      aria-pressed={mode === m}
      disabled={disabled}
      onClick={() => actions.setNetworkMode(mode === m ? "none" : m)}
    >
      {m !== "full" && <span className={`nw-dot nw-dot-${m}`} aria-hidden="true" />}
      {label}
      {count != null && <span className="nw-count">{n(count)}</span>}
    </button>
  );

  const caption =
    path.damCount === 0
      ? mouth
        ? "This is the last dam before the river reaches its mouth."
        : "No mapped reservoirs downstream; the chain ends inland of any mapped river mouth."
      : `Sediment passing this dam would encounter ${n(path.damCount)} more reservoir${path.damCount === 1 ? "" : "s"}` +
        (path.endsInland ? "; the mapped chain ends inland." : " before the river reaches its mouth.");

  return (
    <>
      {tags.length > 0 && (
        <p className="nw-tags">
          {tags.map((t) => (
            <span key={t} className="tag">
              {t}
            </span>
          ))}
        </p>
      )}
      <div className="nw-map" role="group" aria-labelledby={labelId}>
        <span id={labelId} className="card-label">
          Show on map
        </span>
        <div className="nw-seg">
          {modeBtn("up", "Upstream", stats.upCount, !hasUp)}
          {modeBtn("down", "Downstream", stats.downCount, !hasDown)}
          {modeBtn("full", "Both", null, !hasUp && !hasDown)}
        </div>
        <div className="nw-map-row">
          <button
            type="button"
            className="nw-btn nw-basin-btn"
            aria-pressed={basinOn}
            onClick={() => actions.setNetworkBasin(!basinOn)}
          >
            <span className="nw-dot nw-dot-basin" aria-hidden="true" />
            Drainage area
          </button>
          {(mode !== "none" || basinOn) && (
            <span className="nw-map-actions">
              {mode !== "none" && (
                <button type="button" className="text-btn" onClick={() => mapCommands()?.fitNetwork()}>
                  Zoom to network
                </button>
              )}
              <button type="button" className="text-btn" onClick={() => actions.clearNetworkView()}>
                Clear highlight
              </button>
            </span>
          )}
        </div>
      </div>
      {basinOn && !basinCache.get(row) && (
        <p className="sec-status" data-status="loading">
          Loading drainage area from USGS…
        </p>
      )}
      {basinOn && basinCache.get(row) === "error" && (
        <p className="sec-status" data-status="error">
          Drainage area unavailable: the USGS NLDI service returned no basin here.{" "}
          <button
            type="button"
            className="linklike"
            onClick={() => {
              basinCache.delete(row);
              setBasinTick((t) => t + 1);
            }}
          >
            Retry
          </button>
        </p>
      )}
      {basinOn && basinCache.get(row) && basinCache.get(row) !== "error" && (
        <p className="card-note nw-basin-note">Drainage area boundary: USGS NLDI (NHDPlusV2), traced upstream of the dam.</p>
      )}

      <h4 className="card-label">
        Downstream path{" "}
        <InfoTip label="How the downstream path is drawn">
          Routed on NHDPlusV2 flowlines. The path is schematic, not the river course, and the counts follow this flow
          path only: dams on other tributaries that join the same rivers downstream are not on it.
        </InfoTip>
      </h4>
      <p className="nw-path-caption">{caption}</p>
      {path.steps.length > 0 && (
        <ol className="flow">
          <li className="flow-step flow-self">
            <span className="flow-name">{selfName}</span> <span className="flow-kind">this dam</span>
          </li>
          {path.steps.map((s, i) =>
            s.kind === "more" ? (
              <li key={`more-${i}`} className="flow-step flow-more">
                {n(s.count)} more dams
              </li>
            ) : (
              <li key={s.row} className={`flow-step flow-${s.kind}`}>
                <span className="flow-name">{s.name}</span>
                {s.kind === "mouth" && <span className="flow-kind"> river mouth</span>}
              </li>
            ),
          )}
          {path.endsInland && <li className="flow-step flow-end">Chain ends inland</li>}
        </ol>
      )}
      {(mode === "down" || mode === "full") && path.steps.length > 0 && (
        // The map's connector runs straight from stop to stop (ResNet stores
        // links, not river geometry), so it crosses unrelated reservoirs;
        // say so exactly while it is on the map.
        <p className="card-note nw-schematic-note">
          On the map, the dashed line joins these stops in order; it does not trace the river.
        </p>
      )}

      <KeyValues
        numeric
        className="nw-area"
        rows={[
          { label: "Drainage area", value: formatKm2(Number.isFinite(core.da[row]) ? core.da[row] : null) },
          {
            key: "direct",
            label: (
              <>
                Not behind another dam{" "}
                <InfoTip label="About the share not behind another dam">
                  The share of the drainage area that reaches this reservoir without first passing another dam
                  (ResNet SCA2025). It measures connectivity, not sediment delivery: upstream dams still pass part of
                  their sediment.
                </InfoTip>
              </>
            ),
            value: directShare(core.da[row], core.sca[row]),
          },
        ]}
      />
      <SourceLine text="ResNet v1 routed dam network" group={PROVENANCE.resnet} />
    </>
  );
}
