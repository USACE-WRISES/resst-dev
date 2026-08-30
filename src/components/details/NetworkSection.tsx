// "How is this reservoir connected?" — ResNet network context: upstream and
// downstream counts, the terminal/mouth relationship, the DA-vs-SCA
// connectivity bar, and the map highlight buttons (Upstream / Downstream /
// Full network). The highlight itself is drawn by MapPanel via mapBus; this
// section owns which reservoir + mode are active (store.networkView resets on
// every selection change).

import { useEffect, useState } from "react";
import { actions, useAppState, type NetworkMode } from "../../state/store";
import { ensureCore, getCore } from "../../sediment/data";
import { buildNetworkSentences, networkStats } from "../../sediment/network";
import { formatKm2 } from "../../sediment/format";
import { PROVENANCE } from "../../sediment/types";
import { mapCommands } from "../../map/mapBus";
import { ProvBadge, ProvNote } from "./Provenance";

function ConnectivityBar({ daSqKm, scaSqKm }: { daSqKm: number; scaSqKm: number }) {
  if (!Number.isFinite(daSqKm) || !Number.isFinite(scaSqKm) || daSqKm <= 0) return null;
  const pct = Math.max(0, Math.min(100, (scaSqKm / daSqKm) * 100));
  const pctText = pct > 0 && pct < 1 ? "<1%" : `${Math.round(pct)}%`;
  // ResNet's SCA2025 is a CONNECTIVITY metric: the area draining here without
  // passing any other dam. It is not a sediment-delivery fraction — upstream
  // dams pass part of their sediment load (that's RATTES's trap-efficiency
  // job). Heavily dammed basins legitimately sit near 0%.
  const label =
    `${formatKm2(scaSqKm)} of the ${formatKm2(daSqKm)} total drainage area (${pctText}) reaches this reservoir ` +
    `without first passing another dam` +
    (pct < 99.5 ? "; the rest drains through at least one upstream reservoir" : "");
  return (
    <div className="conn-wrap" role="img" aria-label={label}>
      <div className="conn-bar">
        <div className="conn-fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="conn-caption">{label}</p>
    </div>
  );
}

export function NetworkSection({ row }: { row: number | null }) {
  const state = useAppState(); // sedimentStamp + networkView re-renders
  const mode = state.networkView.mode;
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

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
  const sentences = buildNetworkSentences(core, row);
  const modeBtn = (m: Exclude<NetworkMode, "none">, label: string) => (
    <button
      type="button"
      className="nw-btn"
      aria-pressed={mode === m}
      onClick={() => actions.setNetworkMode(mode === m ? "none" : m)}
    >
      {label}
    </button>
  );

  return (
    <>
      {(stats.terminal || stats.headwater || stats.lock) && (
        <p className="nw-chips">
          {stats.terminal && <ProvBadge kind="network" label="Terminal dam" />}
          {stats.headwater && <ProvBadge kind="network" label="Headwater dam" />}
          {stats.lock && <ProvBadge kind="network" label="Navigation lock" />}
        </p>
      )}
      <div className="stat-grid">
        <div className="stat-cell">
          <span className="stat-label">Upstream dams</span>
          <span className="stat-value">{stats.upCount.toLocaleString("en-US")}</span>
        </div>
        <div className="stat-cell">
          <span className="stat-label">Downstream dams</span>
          <span className="stat-value">{stats.downCount.toLocaleString("en-US")}</span>
        </div>
        {stats.immediateDownRow != null && (
          <div className="stat-cell">
            <span className="stat-label">Immediate downstream</span>
            <span className="stat-value">{core.names[stats.immediateDownRow] || core.nids[stats.immediateDownRow]}</span>
          </div>
        )}
        {stats.mouthRow != null && (
          <div className="stat-cell">
            <span className="stat-label">Drains to</span>
            <span className="stat-value">{core.names[stats.mouthRow]}</span>
          </div>
        )}
      </div>
      {sentences.map((s, i) => (
        <p key={i} className="nw-sentence">
          {s}
        </p>
      ))}
      <ConnectivityBar daSqKm={core.da[row]} scaSqKm={core.sca[row]} />
      <div className="nw-actions" role="group" aria-label="Network map highlight">
        {modeBtn("up", "Upstream")}
        {modeBtn("down", "Downstream")}
        {modeBtn("full", "Full network")}
        {mode !== "none" && (
          <>
            <button type="button" className="nw-btn" onClick={() => mapCommands()?.fitNetwork()}>
              Zoom to network
            </button>
            <button type="button" className="linklike" onClick={() => actions.setNetworkMode("none")}>
              Clear
            </button>
          </>
        )}
      </div>
      <ProvNote
        text="ResNet v1 · routed on NHDPlusV2 flowlines · downstream path is schematic, not the river course"
        group={PROVENANCE.resnet}
      />
    </>
  );
}
