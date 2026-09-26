// The Dashboard's building blocks: a card with one title and one subtitle, a
// hint, a segmented control, the donut legend (the chart's
// accessible control), and the loading / error status for the national
// dataset. The headline tiles are TopicTabs.tsx.

import { useId, useState, type ReactNode } from "react";
import { formatCount } from "../lib/display";
import { formatPct } from "../sediment/format";
import { PointerIcon } from "../components/icons";
import { share } from "./charts/chartMath";
import type { DonutSlice } from "./charts/Donut";

/** A hint (the store's `dashboard.hints`): muted text with a pointer.
    Drawn only if it was due when its card or the page mounted; once retired
    it fades but keeps its space until the page is loaded again, so nothing
    moves under the click that retired it. Every page load shows it again. */
export function Hint({ due, children }: { due: boolean; children: ReactNode }) {
  const [shown] = useState(due);
  if (!shown) return null;
  return (
    <p className={due ? "dash-hint" : "dash-hint is-done"}>
      <PointerIcon className="dash-hint-icon" />
      {children}
    </p>
  );
}

/** A topic's card. With a `toolbar` (the chart's view switch), the switch sits
    centred above the chart and the subtitle becomes the chart's caption under
    it, so title, switch, caption and chart read as one figure. A `hint` sits
    under the title, above the switch (or after the subtitle). */
export function Card({
  title,
  subtitle,
  toolbar,
  hint,
  footnote,
  children,
}: {
  title: string;
  subtitle: ReactNode;
  toolbar?: ReactNode;
  hint?: ReactNode;
  footnote?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section className="dash-card" aria-labelledby={id}>
      <div className="dash-card-head">
        <h2 id={id}>{title}</h2>
      </div>
      {toolbar ? (
        <>
          {hint}
          <div className="dash-toolbar">
            <div className="dash-toolbar-controls">{toolbar}</div>
            <p className="dash-caption">{subtitle}</p>
          </div>
        </>
      ) : (
        <>
          <p className="dash-sub">{subtitle}</p>
          {hint}
        </>
      )}
      {children}
      {footnote && <p className="dash-foot">{footnote}</p>}
    </section>
  );
}

/** A segmented control: joined buttons, one pressed. */
export function Seg<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: ReadonlyArray<{ value: T; label: ReactNode }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="dash-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className="dash-seg-btn" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** The donut's legend: one button per slice with its count and share. */
export function Legend({
  slices,
  counts,
  unit,
  selected,
  onSelect,
  label,
}: {
  slices: DonutSlice[];
  /** Records per slice when that differs from the slice value (mentions). */
  counts?: number[];
  unit: string;
  selected: string | null;
  onSelect: (key: string) => void;
  label: string;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  return (
    <ul className="dash-legend" aria-label={label}>
      {slices.map((s, i) => (
        <li key={s.key}>
          <button type="button" className="dash-legend-btn" aria-pressed={selected === s.key} onClick={() => onSelect(s.key)}>
            {/* The spaces keep the accessible name readable ("Dam Removal 8 sites 4%"). */}
            <i className="dash-swatch" style={{ background: s.color }} aria-hidden="true" />
            <span className="dash-legend-label">{s.label}</span>{" "}
            <span className="dash-legend-count">
              {formatCount(counts ? counts[i] : s.value)} <span className="dash-legend-unit">{unit}</span>
            </span>{" "}
            <span className="dash-legend-share">{formatPct(share(s.value, total))}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** The national dataset's load state, in the Screening panel's words. */
export function CoreStatus({ status, onRetry }: { status: "loading" | "error"; onRetry: () => void }) {
  return (
    <p className="dash-status" data-status={status} role="status">
      {status === "error" ? (
        <>
          National dataset failed to load.{" "}
          <button type="button" className="ov-retry" onClick={onRetry}>
            Retry
          </button>
        </>
      ) : (
        "Loading national dataset…"
      )}
    </p>
  );
}
