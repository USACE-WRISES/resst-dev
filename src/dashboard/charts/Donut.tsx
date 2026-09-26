// A donut chart in plain SVG. The slices take pointer clicks as a
// convenience; the accessible control is the legend list beside the chart
// (ui.tsx Legend), which names every slice with its count. The selected
// slice slides outward along its middle angle.

import { formatCount } from "../../lib/display";
import { arcPath, explodeOffset, sliceAngles } from "./chartMath";

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  color: string;
}

export function Donut({
  slices,
  selected,
  onSelect,
  centre,
  summary,
}: {
  slices: DonutSlice[];
  selected: string | null;
  onSelect: (key: string) => void;
  /** The number and caption in the hole. */
  centre: { value: string; label: string };
  /** The chart in one sentence (the image's accessible name). */
  summary: string;
}) {
  const angles = sliceAngles(slices.map((s) => s.value));
  return (
    <svg className="dash-donut" viewBox="0 0 200 200" role="img" aria-label={summary}>
      {slices.map((s, i) => {
        const { a0, a1 } = angles[i];
        if (a1 <= a0) return null;
        const off = selected === s.key ? explodeOffset((a0 + a1) / 2, 6) : { dx: 0, dy: 0 };
        return (
          <path
            key={s.key}
            className={selected === s.key ? "dash-slice is-selected" : "dash-slice"}
            d={arcPath(100, 100, 62, 90, a0, a1)}
            fill={s.color}
            fillRule="evenodd"
            style={{ transform: `translate(${off.dx}px, ${off.dy}px)` }}
            onClick={() => onSelect(s.key)}
          >
            <title>{`${s.label}: ${formatCount(s.value)}`}</title>
          </path>
        );
      })}
      <text x="100" y="98" className="dash-centre-value" textAnchor="middle">
        {centre.value}
      </text>
      <text x="100" y="114" className="dash-centre-label" textAnchor="middle">
        {centre.label}
      </text>
    </svg>
  );
}
