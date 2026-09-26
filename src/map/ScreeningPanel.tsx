// The national Screening panel: find modeled reservoirs that match
// transparent criteria. Docked under the map toolbar (owner decision
// 2026-09-25) so it stays open while the map is panned, zoomed and clicked;
// ✕, the toolbar toggle, or Escape from inside it closes it (on phones, where
// it covers the map, a tap outside does too). It lives beside Layers but
// deliberately NOT inside the left Data Filters panel — those keyword filters
// drive the parity-tested documented-data tables; screening filters the
// national MAP layer only.
//
// The workflow reads top to bottom: start with one of the four gap-analysis
// questions (each shows how many reservoirs it would find), optionally refine,
// then zoom to or export the matches from the pinned results bar. Wording
// guardrail baked in: results are "potential opportunities … warranting
// further evaluation", never "needs intervention".

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { actions, type AppState } from "../state/store";
import { ensureCore, getCore } from "../sediment/data";
import {
  GAP_PRESETS,
  damCount,
  presetMatches,
  quadrantCounts,
  refineCount,
  screenCore,
  withPreset,
  withoutPreset,
  type ScreeningState,
} from "../sediment/screen";
import { exportCsv } from "../utils/exporters";
import { M3_PER_ACFT, FLAG } from "../sediment/types";
import { CloseIcon, FilterIcon } from "../components/icons";
import { mapCommands } from "./mapBus";
import { useDismissPopover } from "./useDismissPopover";

const n = (v: number) => v.toLocaleString("en-US");

/** The 2025-loss select covers both bounds: "25% or less" is the low-loss
    questions' maximum, the rest are minimums. */
const LOSS_2025: Array<{ value: string; label: string; min: number | null; max: number | null }> = [
  { value: "any", label: "Any", min: null, max: null },
  { value: "max25", label: "25% or less", min: null, max: 25 },
  { value: "min10", label: "10% or more", min: 10, max: null },
  { value: "min25", label: "25% or more", min: 25, max: null },
  { value: "min50", label: "50% or more", min: 50, max: null },
];
const LOSS_2050 = [10, 25, 50];
const STORAGE = [1000, 10000, 100000, 1000000];
const RATE = [10, 100, 1000];

function NumberSelect({
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
    <label className="screen-field">
      <span>{label}</span>
      <select className="metric-select" value={value ?? ""} onChange={(e) => onPick(e.target.value === "" ? null : Number(e.target.value))}>
        <option value="">Any</option>
        {choices.map((c) => (
          <option key={c} value={c}>
            {format(c)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ScreeningPanel({ state, siteByShortId }: { state: AppState; siteByShortId: Map<number, string> }) {
  const open = state.screeningOpen;
  const s = state.screening;
  const hostRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const [refineOpen, setRefineOpen] = useState(() => refineCount(s) > 0);
  const ids = useId();

  // Tap-outside dismissal only where the panel covers the map (phones);
  // Escape is handled locally so an Escape meant for a Select sketch, another
  // popover, or the report never closes the panel.
  useDismissPopover(open, hostRef, (reason) => {
    if (reason === "outside" && window.matchMedia("(max-width: 480px)").matches) actions.setScreeningOpen(false);
  });

  const core = getCore();
  const documentedIds = useMemo(() => new Set(siteByShortId.keys()), [siteByShortId]);
  const totalDams = useMemo(() => (core ? damCount(core) : 57307), [core]);
  const summary = useMemo(() => (core && s.active ? screenCore(core, documentedIds, s) : null), [core, documentedIds, s]);
  const counts = useMemo(() => (open && core ? quadrantCounts(core, documentedIds, s) : null), [open, core, documentedIds, s]);
  const refinements = refineCount(s);

  const openPanel = () => {
    actions.setScreeningOpen(true);
    // Opening implies working with the national layer (precedent: the HUC
    // Select tools switch their boundary overlay on). Only on this user
    // action: turning the layer off afterwards closes the panel instead.
    if (!state.nationalLayer.on) actions.setNationalLayer(true);
    void ensureCore().catch(() => {});
  };
  const closePanel = () => {
    actions.setScreeningOpen(false);
    toggleRef.current?.focus();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && open) closePanel();
  };

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
    <label className="screen-field">
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

  const loss2025 =
    LOSS_2025.find((o) => o.min === s.pctLost2025Min && o.max === s.pctLost2025Max)?.value ?? "any";
  const noMatches = !summary || summary.rows.length === 0;

  return (
    <div className="tool-popover screening-host" ref={hostRef} onKeyDown={onKeyDown}>
      {/* A toggle, not a dropdown: it shows or hides the docked panel below
          it, so no ▾. The dot marks criteria filtering the map. */}
      <button
        ref={toggleRef}
        type="button"
        className={open ? "map-tool map-tool-toggle active" : "map-tool map-tool-toggle"}
        aria-expanded={open}
        aria-controls={open ? `${ids}-dock` : undefined}
        aria-label={s.active ? "Screening (active: criteria are filtering the national layer)" : "Screening"}
        onClick={() => (open ? closePanel() : openPanel())}
      >
        <FilterIcon />
        Screening
        {s.active && <span className="map-tool-dot" aria-hidden="true" />}
      </button>
      {open && (
        <div
          id={`${ids}-dock`}
          className="screening-panel screening-dock"
          role="region"
          aria-labelledby={`${ids}-title`}
        >
          <div className="dock-head">
            <h2 id={`${ids}-title`} className="dock-title">
              Screen reservoirs
            </h2>
            <button type="button" className="icon-btn" aria-label="Close screening" onClick={closePanel}>
              <CloseIcon />
            </button>
          </div>
          <div className="dock-body">
            <p className="screen-intro" title={`${n(totalDams)} modeled reservoirs`}>
              Filter modeled reservoirs with transparent criteria.
            </p>
            <div className="screen-questions" role="group" aria-label="Screening questions">
              {GAP_PRESETS.map((p) => {
                const pressed = presetMatches(s, p);
                const base = `${ids}-${p.key}`;
                return (
                  <button
                    key={p.key}
                    type="button"
                    className="screen-q"
                    aria-pressed={pressed}
                    aria-labelledby={`${base}-t ${base}-n`}
                    aria-describedby={`${base}-c`}
                    title={p.hint}
                    onClick={() => actions.setScreeningCriteria(pressed ? withoutPreset(s) : withPreset(s, p))}
                  >
                    <span id={`${base}-t`} className="screen-q-title">
                      {p.title}
                    </span>
                    <span id={`${base}-n`} className="screen-q-count">
                      {counts ? n(counts[p.key]) : ""}
                    </span>
                    <span id={`${base}-c`} className="screen-q-criteria">
                      {p.criteria}
                    </span>
                  </button>
                );
              })}
            </div>
            <details className="screen-refine" open={refineOpen} onToggle={(e) => setRefineOpen(e.currentTarget.open)}>
              <summary>
                Refine criteria
                {refinements > 0 && <span className="screen-refine-count"> ({refinements} active)</span>}
              </summary>
              <div className="screen-form">
                <label className="screen-field">
                  <span>Capacity lost by 2025</span>
                  <select
                    className="metric-select"
                    value={loss2025}
                    onChange={(e) => {
                      const o = LOSS_2025.find((x) => x.value === e.target.value) ?? LOSS_2025[0];
                      upd({ pctLost2025Min: o.min, pctLost2025Max: o.max });
                    }}
                  >
                    {LOSS_2025.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <NumberSelect
                  label="Projected lost by 2050"
                  value={s.pctLost2050Min}
                  choices={LOSS_2050}
                  format={(v) => `${v}% or more`}
                  onPick={(v) => upd({ pctLost2050Min: v })}
                />
                <NumberSelect
                  label="Storage at least"
                  value={s.storageMinAcFt}
                  choices={STORAGE}
                  format={(v) => `${n(v)} ac-ft`}
                  onPick={(v) => upd({ storageMinAcFt: v })}
                />
                <NumberSelect
                  label="Sedimentation rate at least"
                  value={s.rateMinAcFtYr}
                  choices={RATE}
                  format={(v) => `${n(v)} ac-ft/yr`}
                  onPick={(v) => upd({ rateMinAcFtYr: v })}
                />
                <label className="screen-field">
                  <span>Documented in RESST</span>
                  <select
                    className="metric-select"
                    value={s.documented}
                    onChange={(e) => upd({ documented: e.target.value as ScreeningState["documented"] })}
                  >
                    <option value="any">Any</option>
                    <option value="documented">Documented sites only</option>
                    <option value="undocumented">Not documented</option>
                  </select>
                </label>
                {dictSelect("State", core?.dicts.state, s.state, "state")}
                {dictSelect("Owner type", core?.dicts.owner, s.owner, "owner")}
                {dictSelect("Primary purpose", core?.dicts.purpose, s.purpose, "purpose")}
                <div className="screen-checks">
                  <label className="value-option">
                    <input type="checkbox" checked={s.terminalOnly} onChange={(e) => upd({ terminalOnly: e.target.checked })} />
                    <span>Terminal dams only</span>
                  </label>
                  <label className="value-option">
                    <input type="checkbox" checked={s.surveyedOnly} onChange={(e) => upd({ surveyedOnly: e.target.checked })} />
                    <span>Has measured surveys</span>
                  </label>
                </div>
              </div>
            </details>
          </div>
          <div className="dock-foot">
            <div className="dock-count-row">
              <p className="screen-count" aria-live="polite">
                {!core ? (
                  state.sedimentStatus.core === "error" ? "National dataset failed to load." : "Loading national dataset…"
                ) : summary ? (
                  <>
                    <b>{n(summary.matches)}</b> of {n(summary.total)} modeled reservoirs match
                  </>
                ) : (
                  "Choose a question or refine the criteria."
                )}
              </p>
              {s.active && (
                <button
                  type="button"
                  className="text-btn"
                  aria-label="Clear screening"
                  onClick={() => actions.clearScreening()}
                >
                  Clear
                </button>
              )}
            </div>
            <div className="dock-actions">
              <button type="button" className="btn-sm" disabled={noMatches} onClick={zoomToMatches}>
                Zoom to matches
              </button>
              <button type="button" className="btn-sm" disabled={noMatches} onClick={exportMatches}>
                Export matches (CSV)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
