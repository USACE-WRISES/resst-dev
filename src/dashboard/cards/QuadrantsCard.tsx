// Card 3: documented management against modeled loss, the Screening panel's
// four gap-analysis quadrants as a two-by-two of tiles with the same counts
// the panel shows before any refinement. A tile drills into its largest
// reservoirs and opens the question in Screening on the map.

import { useId, useMemo } from "react";
import type { AppData } from "../../lib/types";
import { formatCount } from "../../lib/display";
import { formatPct } from "../../sediment/format";
import type { SedimentCore } from "../../sediment/types";
import { EMPTY_SCREENING, withPreset } from "../../sediment/screen";
import { PROVENANCE } from "../../sediment/types";
import { actions, type DashboardState } from "../../state/store";
import { SourceLine } from "../../components/details/ui";
import { quadrantStats, topByStorage, type Quadrant } from "../stats";
import { share } from "../charts/chartMath";
import { Card, CoreStatus, Hint } from "../ui";
import { DrillPanel, ReservoirTable } from "../DrillPanel";
import { openInScreening } from "../../state/navigate";

const LARGEST = 100;

export function QuadrantsCard({
  core,
  status,
  onRetry,
  documentedIds,
  sitesBy,
  data,
  dash,
}: {
  core: SedimentCore | null;
  status: "loading" | "error" | null;
  onRetry: () => void;
  documentedIds: ReadonlySet<number>;
  sitesBy: ReadonlyMap<number, string[]>;
  data: AppData;
  dash: DashboardState;
}) {
  const ids = useId();
  const stats = useMemo(() => (core ? quadrantStats(core, documentedIds) : null), [core, documentedIds]);
  const drillKey = dash.drills.screening?.key ?? null;
  const open = drillKey && stats ? (stats.list.find((q) => q.preset.key === drillKey) ?? null) : null;
  const largest = useMemo(() => (open && core ? topByStorage(core, open.rows, LARGEST) : []), [open, core]);
  const select = (key: string) => actions.setDashboardDrill("screening", drillKey === key ? null : { card: "quadrants", key, dim: null });
  const close = () => actions.setDashboardDrill("screening", null);
  const byKey = (key: string): Quadrant | undefined => stats?.list.find((q) => q.preset.key === key);

  const tile = (key: string) => {
    const q = byKey(key);
    if (!q || !stats) return <span className="dash-q dash-q-empty" aria-hidden="true" />;
    const base = `${ids}-${key}`;
    return (
      <button
        type="button"
        className="dash-q"
        aria-pressed={drillKey === key}
        aria-labelledby={`${base}-t ${base}-n`}
        aria-describedby={`${base}-c`}
        title={q.preset.hint}
        onClick={() => select(key)}
      >
        <span id={`${base}-t`} className="dash-q-title">
          {q.preset.title}
        </span>
        <span id={`${base}-n`} className="dash-q-count">
          {formatCount(q.count)}
        </span>
        <span id={`${base}-c`} className="dash-q-share">
          {formatPct(share(q.count, stats.dams))} of modeled reservoirs
        </span>
      </button>
    );
  };

  const notes: string[] = [];
  if (stats?.unknown) notes.push(`${formatCount(stats.unknown)} reservoirs have no modeled loss and appear in neither column`);
  if (stats?.overlap) notes.push(`${formatCount(stats.overlap)} at exactly 25% appear in both columns`);

  return (
    <Card
      title="Documented management and modeled loss"
      subtitle={
        <>
          {stats ? `All ${formatCount(stats.dams)} modeled reservoirs` : "All modeled reservoirs"} · documented = linked to a RESST site · loss
          modeled by RATTES v1.2 (2025)
        </>
      }
      footnote={notes.length > 0 ? `${notes.join("; ")}.` : undefined}
      hint={<Hint due={dash.hints.explore.screening}>Click a group to see its reservoirs</Hint>}
    >
      {status ? (
        <CoreStatus status={status} onRetry={onRetry} />
      ) : (
        <div className="dash-matrix" role="group" aria-label="Screening questions">
          <span className="dash-matrix-corner" aria-hidden="true" />
          <span className="dash-matrix-col">25% or more lost by 2025</span>
          <span className="dash-matrix-col">25% or less lost by 2025</span>
          <span className="dash-matrix-row">Documented management</span>
          {tile("managed-high")}
          {tile("managed-low")}
          <span className="dash-matrix-row">Not documented</span>
          {tile("gap-high")}
          {tile("gap-low")}
        </div>
      )}
      {open && core && stats && (
        <DrillPanel
          title={open.preset.title}
          sub={`${formatCount(open.count)} of ${formatCount(stats.dams)} modeled reservoirs · ${open.preset.criteria}`}
          actions={
            <button type="button" className="btn-sm" onClick={() => openInScreening(withPreset(EMPTY_SCREENING, open.preset))}>
              Open in Screening
            </button>
          }
          onClose={close}
        >
          <p className="dash-drill-note">
            The {formatCount(largest.length)} largest by original capacity. {open.preset.hint}.
          </p>
          <ReservoirTable core={core} rows={largest} sitesBy={sitesBy} data={data} label={`${open.preset.title}: largest reservoirs`} />
        </DrillPanel>
      )}
      <SourceLine text="RATTES v1.2 modeled storage · ResNet v1 dam network · RESST crosswalk" group={PROVENANCE.rattes} />
    </Card>
  );
}
