// Card 4: percent capacity lost by 2025 across the United States. A donut of
// the map legend's loss classes (its rounding and colours), one computed
// headline, and the state tile grid coloured by the Screening rule's share of
// reservoirs at 25% or more, so a state's count is what "Screen this state"
// finds on the map. A class or a state drills into its largest reservoirs.

import { useMemo } from "react";
import type { AppData, Site } from "../../lib/types";
import { formatCount } from "../../lib/display";
import { formatPct } from "../../sediment/format";
import { PROVENANCE, type SedimentCore } from "../../sediment/types";
import { EMPTY_SCREENING } from "../../sediment/screen";
import { actions, type DashboardState } from "../../state/store";
import { SourceLine } from "../../components/details/ui";
import { byState, lossClasses, nationalHeadline, topByStorage, type StateStat } from "../stats";
import { stateName } from "../states";
import { share } from "../charts/chartMath";
import { Donut } from "../charts/Donut";
import { StateGrid } from "../charts/StateGrid";
import { Card, CoreStatus, Hint, Legend } from "../ui";
import { DrillPanel, ReservoirTable, SiteTable } from "../DrillPanel";
import { openInScreening } from "../../state/navigate";

const LARGEST = 100;

export function LossCard({
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
  const classes = useMemo(() => (core ? lossClasses(core) : null), [core]);
  const states = useMemo(() => (core ? byState(core) : null), [core]);
  const headline = useMemo(() => (core ? nationalHeadline(core, documentedIds) : null), [core, documentedIds]);
  const byCode = useMemo(() => {
    const m = new Map<string, StateStat>();
    for (const s of states?.states ?? []) if (s.code) m.set(s.code, s);
    return m;
  }, [states]);

  const drill = dash.drills.capacity ?? null;
  const classKey = drill?.card === "loss" ? drill.key : null;
  const stateKey = drill?.card === "state" ? drill.key : null;
  const openClass = classKey && classes ? (classes.find((c) => c.key === classKey) ?? null) : null;
  const openState = stateKey ? (byCode.get(stateKey) ?? null) : null;
  const close = () => actions.setDashboardDrill("capacity", null);
  const selectClass = (key: string) => actions.setDashboardDrill("capacity", classKey === key ? null : { card: "loss", key, dim: null });
  const selectState = (code: string) =>
    actions.setDashboardDrill("capacity", stateKey === code ? null : { card: "state", key: code, dim: null });

  const largest = useMemo(() => {
    if (!core) return [];
    if (openClass) return topByStorage(core, openClass.rows, LARGEST);
    if (openState) return topByStorage(core, openState.rows, LARGEST);
    return [];
  }, [core, openClass, openState]);
  /** Documented sites linked to the open state's reservoirs. */
  const stateSites = useMemo(() => {
    if (!core || !openState) return [];
    const seen = new Set<string>();
    const out: Site[] = [];
    for (const r of openState.rows) {
      for (const id of sitesBy.get(core.ids[r]) ?? []) {
        const site = data.siteById.get(id);
        if (!site || seen.has(id)) continue;
        seen.add(id);
        out.push(site);
      }
    }
    return out;
  }, [core, openState, sitesBy, data]);

  const slices = (classes ?? []).filter((c) => c.count > 0).map((c) => ({ key: c.key, label: c.label, value: c.count, color: c.color }));
  const dams = headline?.dams ?? 0;
  const footnote = states
    ? `Class colours follow the map legend (values rounded to 0.1%); state shares follow the Screening rule (25% or more, unrounded)${
        states.blank > 0 ? `; ${formatCount(states.blank)} reservoirs have no state` : ""
      }.`
    : undefined;

  return (
    <Card
      title="Capacity lost by 2025 across the United States"
      subtitle="Share of original capacity lost per modeled reservoir · RATTES v1.2 (2025)"
      footnote={footnote}
      hint={<Hint due={dash.hints.explore.capacity}>Click a loss class or a state to see its reservoirs</Hint>}
    >
      {status || !core || !classes || !headline ? (
        <CoreStatus status={status ?? "loading"} onRetry={onRetry} />
      ) : (
        <div className="dash-loss">
          <div className="dash-loss-classes">
            <div className="dash-chart dash-chart-stack">
              <Donut
                slices={slices}
                selected={classKey}
                onSelect={selectClass}
                centre={{ value: formatPct(headline.median), label: "median lost" }}
                summary={`Percent capacity lost by 2025 across ${formatCount(dams)} modeled reservoirs: ${slices.map((s) => `${s.label} ${formatCount(s.value)}`).join(", ")}`}
              />
              <Legend slices={slices} unit="reservoirs" selected={classKey} onSelect={selectClass} label="Loss classes" />
            </div>
            <p className="dash-headline">
              <b>{formatPct(headline.pctVolume)}</b> of the nation's original storage is lost; half of all reservoirs have lost{" "}
              <b>{formatPct(headline.median)}</b> or more.
            </p>
          </div>
          <StateGrid stats={byCode} selected={stateKey} onPick={selectState} />
        </div>
      )}
      {core && openClass && (
        <DrillPanel
          title={`${openClass.label} of capacity lost`}
          sub={`${formatCount(openClass.count)} reservoirs · ${formatPct(share(openClass.count, dams))} of modeled reservoirs`}
          onClose={close}
        >
          <p className="dash-drill-note">The {formatCount(largest.length)} largest by original capacity.</p>
          <ReservoirTable core={core} rows={largest} sitesBy={sitesBy} data={data} label={`${openClass.label} lost: largest reservoirs`} />
        </DrillPanel>
      )}
      {core && openState && (
        <DrillPanel
          title={stateName(openState.code ?? openState.name)}
          sub={`${formatCount(openState.high)} of ${formatCount(openState.dams)} modeled reservoirs have lost 25% or more (${formatPct(share(openState.high, openState.dams))})`}
          actions={
            <button
              type="button"
              className="btn-sm"
              onClick={() => openInScreening({ ...EMPTY_SCREENING, state: openState.idx, pctLost2025Min: 25 })}
            >
              Screen this state on the map
            </button>
          }
          onClose={close}
        >
          <h4 className="card-label">Documented sites</h4>
          {stateSites.length > 0 ? (
            <SiteTable sites={stateSites} data={data} label={`Documented sites in ${openState.name}`} />
          ) : (
            <p className="dash-drill-note">No documented RESST site is linked to a modeled reservoir in {openState.name}.</p>
          )}
          <h4 className="card-label">Largest reservoirs</h4>
          <p className="dash-drill-note">The {formatCount(largest.length)} largest by original capacity.</p>
          <ReservoirTable core={core} rows={largest} sitesBy={sitesBy} data={data} label={`Largest reservoirs in ${openState.name}`} />
        </DrillPanel>
      )}
      <SourceLine text="RATTES v1.2 modeled storage, silt scenario" group={PROVENANCE.rattes} />
    </Card>
  );
}
