// Building blocks for the Selected Data cards, so every card reads the same
// way: labelled values in a quiet two-column list, keywords as chips, one
// headline number where a card has one, explanations behind an ⓘ, and a
// single source line at the foot. New class names on purpose: the Dam Report
// reuses the panel's older classes (.field-row, .stat-*, …) and inherits the
// global stylesheet in its modal, so those rules stay as they are.

import { useRef, useState, type ReactNode } from "react";
import { useDismissPopover } from "../../map/useDismissPopover";
import type { ProvenanceGroup } from "../../sediment/types";
import { ProvInfo } from "./Provenance";
import { usePanelPopover } from "./usePanelPopover";

export interface KeyValueRow {
  label: ReactNode;
  value: ReactNode;
  /** Muted second line inside the value cell (a range, a qualifier). */
  sub?: ReactNode;
  key?: string;
}

/** Label/value rows (a definition list of div-wrapped pairs). Rows whose
    value is empty or the "—" null placeholder are left out. */
export function KeyValues({ rows, numeric, className }: { rows: KeyValueRow[]; numeric?: boolean; className?: string }) {
  const shown = rows.filter((r) => r.value != null && r.value !== "" && r.value !== "—");
  if (shown.length === 0) return null;
  return (
    <dl className={["kv", numeric ? "kv-num" : "", className ?? ""].filter(Boolean).join(" ")}>
      {shown.map((r, i) => (
        <div key={r.key ?? (typeof r.label === "string" ? r.label : i)} className="kv-row">
          <dt>{r.label}</dt>
          <dd>
            {r.value}
            {r.sub && <span className="kv-sub">{r.sub}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Keyword chips. */
export function Chips({ values, label }: { values: string[]; label?: string }) {
  if (values.length === 0) return null;
  return (
    <ul className="chips" aria-label={label}>
      {values.map((v) => (
        <li key={v} className="chip">
          {v}
        </li>
      ))}
    </ul>
  );
}

/** A headline number with its caption. */
export function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="metric">
      <span className="metric-value">{value}</span>
      <span className="metric-label">{label}</span>
    </div>
  );
}

/** An ⓘ explanation; the popover stays inside its panel (usePanelPopover). */
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const popRef = useRef<HTMLSpanElement>(null);
  useDismissPopover(open, ref, () => setOpen(false));
  usePanelPopover(open, ref, popRef);
  return (
    <span className="info-tip" ref={ref}>
      <button type="button" className="info-tip-btn" aria-expanded={open} aria-label={label} onClick={() => setOpen((o) => !o)}>
        ⓘ
      </button>
      {open && (
        <span className="info-tip-pop" role="note" ref={popRef}>
          {children}
        </span>
      )}
    </span>
  );
}

/** The card's source line: one short line, the citation behind the ⓘ. */
export function SourceLine({ text, group, children }: { text: ReactNode; group?: ProvenanceGroup; children?: ReactNode }) {
  return (
    <p className="source-line">
      <span>{text}</span>
      {children}
      {group && <ProvInfo group={group} />}
    </p>
  );
}
