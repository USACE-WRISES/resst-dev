// The United States as a grid of state tiles, each coloured by the share of
// its modeled reservoirs that have lost 25% or more of their capacity by
// 2025 (the Screening rule). A tile is a button that drills into its state;
// states with no modeled reservoirs render muted.

import { formatCount } from "../../lib/display";
import { formatPct } from "../../sediment/format";
import { NAT_UNKNOWN, RAMP } from "../../map/nationalLayer";
import { GRID_COLS, GRID_ROWS, STATE_TILES, stateName } from "../states";
import { rampStep, share } from "./chartMath";
import type { StateStat } from "../stats";

const STEP_LABELS = ["0–20%", "20–40%", "40–60%", "60–80%", "80–100%"];
/** Ink on the light ramp steps, white on the dark ones (both pass AA). */
const STEP_TEXT = ["#1c2733", "#1c2733", "#1c2733", "#ffffff", "#ffffff"];

export function StateGrid({
  stats,
  selected,
  onPick,
}: {
  /** Per postal code. */
  stats: ReadonlyMap<string, StateStat>;
  selected: string | null;
  onPick: (code: string) => void;
}) {
  return (
    <div className="dash-states-wrap">
      <div
        className="dash-states"
        role="group"
        aria-label="States by the share of their modeled reservoirs that have lost 25% or more of their capacity by 2025"
        style={{ gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`, gridTemplateRows: `repeat(${GRID_ROWS}, 1fr)` }}
      >
        {STATE_TILES.map((t) => {
          const st = stats.get(t.code);
          const pos = { gridRow: t.row, gridColumn: t.col };
          if (!st || st.dams === 0) {
            return (
              <span key={t.code} className="dash-state dash-state-empty" style={pos} title={`${stateName(t.code)}: no modeled reservoirs`}>
                {t.code}
              </span>
            );
          }
          const pct = share(st.high, st.dams) ?? 0;
          const step = rampStep(pct);
          return (
            <button
              key={t.code}
              type="button"
              className="dash-state"
              style={{ ...pos, background: RAMP[step], color: STEP_TEXT[step] }}
              aria-pressed={selected === t.code}
              aria-label={`${stateName(t.code)}: ${formatPct(pct)} of ${formatCount(st.dams)} modeled reservoirs have lost 25% or more`}
              onClick={() => onPick(t.code)}
            >
              {t.code}
            </button>
          );
        })}
      </div>
      <ul className="dash-states-legend" aria-label="Tile colours">
        {STEP_LABELS.map((l, i) => (
          <li key={l}>
            <i className="dash-swatch" style={{ background: RAMP[i] }} aria-hidden="true" /> {l}
          </li>
        ))}
        <li>
          <i className="dash-swatch" style={{ background: NAT_UNKNOWN }} aria-hidden="true" /> No modeled reservoirs
        </li>
      </ul>
    </div>
  );
}
