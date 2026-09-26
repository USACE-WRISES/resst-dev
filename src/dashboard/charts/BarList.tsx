// A ranked horizontal bar list in HTML: label, bar (relative to the largest
// row), count. Rows are buttons when a pick handler is given.

import { formatCount } from "../../lib/display";

export interface BarRow {
  key: string;
  label: string;
  count: number;
  color?: string;
}

export function BarList({
  rows,
  label,
  selected,
  onPick,
}: {
  rows: BarRow[];
  /** Accessible name of the list. */
  label: string;
  selected?: string | null;
  onPick?: (key: string) => void;
}) {
  if (rows.length === 0) return <p className="dash-drill-note">Nothing recorded.</p>;
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <ul className="dash-bars" aria-label={label}>
      {rows.map((r) => {
        const body = (
          <>
            <span className="dash-bar-label">{r.label}</span>
            <span className="dash-bar-track" aria-hidden="true">
              <span className="dash-bar-fill" style={{ width: `${(100 * r.count) / max}%`, background: r.color }} />
            </span>
            <span className="dash-bar-count">{formatCount(r.count)}</span>
          </>
        );
        return (
          <li key={r.key}>
            {onPick ? (
              <button type="button" className="dash-bar" aria-pressed={selected === r.key} onClick={() => onPick(r.key)}>
                {body}
              </button>
            ) : (
              <div className="dash-bar">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
