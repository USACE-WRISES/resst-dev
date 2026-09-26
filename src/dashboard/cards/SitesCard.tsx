// Card 1: the team-documented sediment management keywords across the 978
// sites, one field at a time, as a donut whose slices drill into the sites
// behind them (a second keyword breakdown, the modeled loss at the linked
// sites, and the site list with a way to the map).

import { useMemo } from "react";
import type { AppData } from "../../lib/types";
import { formatCount } from "../../lib/display";
import { formatPct } from "../../sediment/format";
import { actions, dropDrill, type DashboardState, type SiteDim } from "../../state/store";
import { SITE_DIMS, groupOther, linkedLoss, tallyKeyword } from "../stats";
import { sliceColor } from "../charts/chartMath";
import { Donut } from "../charts/Donut";
import { BarList } from "../charts/BarList";
import { Card, Hint, Legend, Seg } from "../ui";
import { DrillPanel, SiteTable } from "../DrillPanel";
import { showSitesOnMap } from "../../state/navigate";

const MAX_SLICES = 7;

export function SitesCard({ data, dash }: { data: AppData; dash: DashboardState }) {
  const dim = SITE_DIMS.find((d) => d.field === dash.siteDim) ?? SITE_DIMS[0];
  const tally = useMemo(() => tallyKeyword(data.sites, dim.field), [data, dim.field]);
  const groups = useMemo(() => groupOther(tally.tallies, MAX_SLICES, (s) => s.site_id), [tally]);
  const slices = groups.map((g, i) => ({ key: g.key, label: g.label, value: g.count, color: sliceColor(i, g.key) }));

  const drill = dash.drills.sites ?? null;
  const drillKey = drill?.key ?? null;
  const open = drillKey ? (groups.find((g) => g.key === drillKey) ?? null) : null;
  const select = (key: string) => actions.setDashboardDrill("sites", drillKey === key ? null : { card: "sites", key, dim: null });
  const close = () => actions.setDashboardDrill("sites", null);
  const setDim = (field: SiteDim) => actions.setDashboard({ siteDim: field, drills: dropDrill(dash.drills, "sites") });

  const breakDims = SITE_DIMS.filter((d) => d.field !== dim.field);
  const breakDim = breakDims.find((d) => d.field === drill?.dim) ?? breakDims[0];
  const sub = useMemo(() => (open ? tallyKeyword(open.items, breakDim.field) : null), [open, breakDim.field]);
  const loss = useMemo(() => (open ? linkedLoss(open.items, data.siteSediment) : null), [open, data]);

  return (
    <Card
      title="Sediment management at documented sites"
      subtitle={
        <>
          {formatCount(tally.withValue)} of {formatCount(tally.total)} sites record {dim.noun}
          {tally.multi > 0 ? "; sites may carry several keywords" : ""}
        </>
      }
      toolbar={
        <Seg label="Site keyword" options={SITE_DIMS.map((d) => ({ value: d.field, label: d.label }))} value={dim.field} onChange={setDim} />
      }
      hint={<Hint due={dash.hints.explore.sites}>Click a slice or a keyword to see its sites</Hint>}
    >
      {slices.length === 0 ? (
        <p className="dash-drill-note">No site records {dim.noun}.</p>
      ) : (
        <div className="dash-chart">
          <Donut
            slices={slices}
            selected={drillKey}
            onSelect={select}
            centre={{ value: formatCount(tally.withValue), label: "sites" }}
            summary={`${dim.label} across ${formatCount(tally.withValue)} documented sites: ${slices.map((s) => `${s.label} ${formatCount(s.value)}`).join(", ")}`}
          />
          <Legend
            slices={slices}
            counts={groups.map((g) => g.items.length)}
            unit="sites"
            selected={drillKey}
            onSelect={select}
            label={`${dim.label} keywords`}
          />
        </div>
      )}
      {open && sub && loss && (
        <DrillPanel
          title={open.label}
          sub={`${formatCount(open.items.length)} sites`}
          actions={
            <button type="button" className="btn-sm" onClick={() => showSitesOnMap(open.items)}>
              Show all on map
            </button>
          }
          onClose={close}
        >
          <div className="dash-drill-row">
            <label className="dash-field">
              <span>Break down by</span>
              <select
                className="dash-select"
                value={breakDim.field}
                onChange={(e) => actions.setDashboardDrill("sites", { card: "sites", key: open.key, dim: e.target.value })}
              >
                {breakDims.map((d) => (
                  <option key={d.field} value={d.field}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
            <BarList
              rows={sub.tallies.slice(0, 8).map((t) => ({ key: t.key, label: t.label, count: t.count }))}
              label={`${open.label} sites by ${breakDim.label.toLowerCase()}`}
            />
            <p className="dash-drill-note">
              {formatCount(sub.withValue)} of {formatCount(open.items.length)} record {breakDim.noun}.
            </p>
          </div>
          <p className="dash-drill-note dash-drill-loss">
            {loss.linked === 0
              ? "None of these sites is linked to a modeled reservoir."
              : `${formatCount(loss.linked)} of ${formatCount(open.items.length)} sites are linked to a modeled reservoir · median ${formatPct(loss.median)} of capacity lost by 2025 · ${formatCount(loss.high)} at 25% or more.`}
          </p>
          <SiteTable sites={open.items} data={data} label={`${open.label} sites`} />
        </DrillPanel>
      )}
    </Card>
  );
}
