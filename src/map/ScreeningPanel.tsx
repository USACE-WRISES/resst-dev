// The national Screening popover: gap-analysis presets (ideas doc §7) plus
// transparent threshold criteria over the modeled inventory. Lives on the map
// toolbar beside Layers, but deliberately NOT inside the left Data Filters
// panel — those keyword filters drive the parity-tested documented-data
// tables; screening filters the national MAP layer only. Wording guardrail
// baked in: results are "potential opportunities … warranting further
// evaluation", never "needs intervention".

import { useEffect, useRef, useState } from "react";
import { actions, type AppState } from "../state/store";
import { ensureCore, getCore } from "../sediment/data";
import { GAP_PRESETS, damCount, screenCore, type ScreeningState } from "../sediment/screen";
import { exportCsv } from "../utils/exporters";
import { M3_PER_ACFT, FLAG } from "../sediment/types";
import { mapCommands } from "./mapBus";
import { useDismissPopover } from "./useDismissPopover";

const PCT_CHOICES = [10, 25, 50];
const STORAGE_CHOICES = [1000, 10000, 100000, 1000000];
const RATE_CHOICES = [10, 100, 1000];

function Segmented({
  label,
  value,
  choices,
  format,
  onPick,
}: {
  label: string;
  value: number | null;
  choices: number[];
  format: (v: number) => string;
  onPick: (v: number | null) => void;
}) {
  return (
    <div className="screen-seg" role="group" aria-label={label}>
      <span className="screen-seg-label">{label}</span>
      <div className="screen-seg-btns">
        <button type="button" className="nw-btn" aria-pressed={value == null} onClick={() => onPick(null)}>
          Any
        </button>
        {choices.map((c) => (
          <button type="button" key={c} className="nw-btn" aria-pressed={value === c} onClick={() => onPick(value === c ? null : c)}>
            {format(c)}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ScreeningPanel({ state, siteByShortId }: { state: AppState; siteByShortId: Map<number, string> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismissPopover(open, ref, () => setOpen(false));
  const s = state.screening;

  // Opening the panel implies working with the national layer (precedent: the
  // HUC Select tools auto-enable their boundary overlay).
  useEffect(() => {
    if (!open) return;
    if (!state.nationalLayer.on) actions.setNationalLayer(true);
    void ensureCore().catch(() => {});
  }, [open, state.nationalLayer.on]);

  const core = getCore();
  const documentedIds = new Set(siteByShortId.keys());
  const summary = core && s.active ? screenCore(core, documentedIds, s) : null;
  const totalDams = core ? damCount(core) : 57307;

  const upd = (partial: Partial<ScreeningState>) => actions.setScreening(partial);

  const exportMatches = () => {
    if (!core || !summary) return;
    const acft = (m3: number) => (Number.isFinite(m3) ? Math.round(m3 / M3_PER_ACFT) : "");
    const pct = (sed: number, cap: number) => (Number.isFinite(cap) && cap > 0 ? Math.round((1000 * sed) / cap) / 10 : "");
    const records = summary.rows.map((r) => ({
      name: core.names[r],
      nid: core.nids[r],
      state: core.state[r] >= 0 ? core.dicts.state[core.state[r]] : "",
      owner_type: core.owner[r] >= 0 ? core.dicts.owner[core.owner[r]] : "",
      primary_purpose: core.purpose[r] >= 0 ? core.dicts.purpose[core.purpose[r]] : "",
      max_storage_acft: acft(core.maxStor[r]),
      pct_capacity_lost_2025: pct(core.sed2025[r], core.capOrig[r]),
      pct_capacity_lost_2050: pct(core.sed2050[r], core.capOrig[r]),
      est_annual_rate_acft_yr: Number.isFinite(core.sed2025[r]) ? Math.round((core.sed2025[r] - core.sed2015[r]) / 10 / M3_PER_ACFT) : "",
      terminal_dam: core.flags[r] & FLAG.TERMINAL ? "yes" : "no",
      measured_surveys: core.flags[r] & FLAG.HAS_SURVEYS ? "yes" : "no",
      resst_site_id: siteByShortId.get(core.ids[r]) ?? "",
    }));
    const columns = Object.keys(records[0] ?? { name: "" }).map((field) => ({ field, label: field }));
    exportCsv(records, columns, "screening"); // exportCsv prefixes "resst-" and the date
  };

  const zoomToMatches = () => {
    if (!core || !summary || summary.rows.length === 0) return;
    mapCommands()?.fitToPoints(summary.rows.map((r) => [core.lon[r], core.lat[r]] as [number, number]));
  };

  const dictSelect = (label: string, list: string[] | undefined, value: number | null, key: "state" | "owner" | "purpose") => (
    <label className="screen-select">
      <span>{label}</span>
      <select
        className="metric-select"
        value={value ?? -1}
        disabled={!list}
        onChange={(e) => upd({ [key]: Number(e.target.value) < 0 ? null : Number(e.target.value) } as Partial<ScreeningState>)}
      >
        <option value={-1}>Any</option>
        {(list ?? []).map((v, i) => (
          <option key={v} value={i}>
            {v}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="tool-popover" ref={ref}>
      <button
        type="button"
        className={open ? "map-tool active" : "map-tool"}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        Screening{s.active ? " ●" : ""} ▾
      </button>
      {open && (
        <div className="tool-popover-panel screening-panel" role="group" aria-label="National screening">
          <p className="screen-intro">
            Combine transparent criteria over the {totalDams.toLocaleString("en-US")} modeled reservoirs. Results are
            <b> potential sediment-management opportunities warranting further evaluation</b> — not a statement that a
            reservoir needs intervention.
          </p>
          <div className="screen-presets" role="group" aria-label="Gap-analysis presets">
            {GAP_PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                className="nw-btn screen-preset"
                title={p.hint}
                onClick={() => actions.applyScreeningPreset(p.apply)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <Segmented
            label="Est. capacity lost by 2025 at least"
            value={s.pctLost2025Min}
            choices={PCT_CHOICES}
            format={(v) => `≥${v}%`}
            onPick={(v) => upd({ pctLost2025Min: v })}
          />
          <Segmented
            label="Projected lost by 2050 at least"
            value={s.pctLost2050Min}
            choices={PCT_CHOICES}
            format={(v) => `≥${v}%`}
            onPick={(v) => upd({ pctLost2050Min: v })}
          />
          <Segmented
            label="Storage at least (ac-ft)"
            value={s.storageMinAcFt}
            choices={STORAGE_CHOICES}
            format={(v) => (v >= 1000000 ? "≥1M" : `≥${v / 1000}k`)}
            onPick={(v) => upd({ storageMinAcFt: v })}
          />
          <Segmented
            label="Est. annual rate at least (ac-ft/yr)"
            value={s.rateMinAcFtYr}
            choices={RATE_CHOICES}
            format={(v) => `≥${v >= 1000 ? "1k" : v}`}
            onPick={(v) => upd({ rateMinAcFtYr: v })}
          />
          <div className="screen-checks">
            <label className="value-option">
              <input type="checkbox" checked={s.terminalOnly} onChange={(e) => upd({ terminalOnly: e.target.checked })} />
              <span>Terminal dams only</span>
            </label>
            <label className="value-option">
              <input type="checkbox" checked={s.surveyedOnly} onChange={(e) => upd({ surveyedOnly: e.target.checked })} />
              <span>Measured surveys only</span>
            </label>
          </div>
          <label className="screen-select">
            <span>Documented management</span>
            <select
              className="metric-select"
              value={s.documented}
              onChange={(e) => upd({ documented: e.target.value as ScreeningState["documented"] })}
            >
              <option value="any">Any</option>
              <option value="documented">RESST documented sites only</option>
              <option value="undocumented">No documented record</option>
            </select>
          </label>
          {dictSelect("State", core?.dicts.state, s.state, "state")}
          {dictSelect("Owner type", core?.dicts.owner, s.owner, "owner")}
          {dictSelect("Primary purpose", core?.dicts.purpose, s.purpose, "purpose")}
          <p className="screen-count" aria-live="polite">
            {!core ? (
              state.sedimentStatus.core === "error" ? "National dataset failed to load." : "Loading national dataset…"
            ) : summary ? (
              <>
                <b>{summary.matches.toLocaleString("en-US")}</b> of {summary.total.toLocaleString("en-US")} modeled
                reservoirs match
              </>
            ) : (
              "Pick a preset or criterion to screen."
            )}
          </p>
          <div className="nw-actions">
            <button type="button" className="nw-btn" disabled={!summary || summary.rows.length === 0} onClick={zoomToMatches}>
              Zoom to matches
            </button>
            <button type="button" className="nw-btn" disabled={!summary || summary.rows.length === 0} onClick={exportMatches}>
              Export matches (CSV)
            </button>
            {s.active && (
              <button type="button" className="linklike" onClick={() => actions.clearScreening()}>
                Clear screening
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
