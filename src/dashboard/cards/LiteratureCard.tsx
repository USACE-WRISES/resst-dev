// Card 2: what the literature covers, one keyword field at a time over the
// publications in scope (all, site-linked, general), as a donut whose slices
// drill into the publications behind them and open the Library on that
// keyword.

import { useId, useMemo } from "react";
import { formatCount, literatureLink } from "../../lib/display";
import { actions, dropDrill, type DashboardState, type LitScope } from "../../state/store";
import { ExternalLink } from "../../components/icons";
import { LIT_FIELDS, groupOfField, inScope, type Publication } from "../../library/index";
import { groupOther, tallyRecords } from "../stats";
import { sliceColor } from "../charts/chartMath";
import { Donut } from "../charts/Donut";
import { BarList } from "../charts/BarList";
import { Card, Hint, Legend, Seg } from "../ui";
import { DrillPanel, MoreButton, usePage } from "../DrillPanel";

const MAX_SLICES = 7;

function PublicationList({ pubs, label }: { pubs: readonly Publication[]; label: string }) {
  const page = usePage(pubs);
  return (
    <>
      <ul className="dash-pubs" aria-label={label}>
        {page.shown.map((p) => {
          const src = literatureLink(p.lit.doi);
          const meta = [p.lit.author, p.lit.year, p.lit.document_type].filter(Boolean).join(" · ");
          const names = [...p.sites.map((s) => s.site_name), ...p.legacyNames];
          return (
            <li key={p.id}>
              {src.href ? (
                <a className="dash-pub-title" href={src.href} target="_blank" rel="noopener noreferrer">
                  {p.title} <ExternalLink />
                </a>
              ) : (
                <span className="dash-pub-title">{p.title}</span>
              )}
              {meta && <span className="dash-pub-meta">{meta}</span>}
              {names.length > 0 && (
                <ul className="chips dash-pub-sites" aria-label="Sites">
                  {names.slice(0, 3).map((n) => (
                    <li key={n} className="chip">
                      {n}
                    </li>
                  ))}
                  {names.length > 3 && <li className="chip">+{names.length - 3}</li>}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      <MoreButton more={page.more} onClick={page.showMore} />
    </>
  );
}

export function LiteratureCard({
  pubs,
  scopes,
  dash,
}: {
  pubs: readonly Publication[];
  scopes: Record<LitScope, number>;
  dash: DashboardState;
}) {
  const dim = LIT_FIELDS.find((f) => f.field === dash.litDim) ?? LIT_FIELDS[0];
  const scoped = useMemo(() => pubs.filter((p) => inScope(p, dash.litScope)), [pubs, dash.litScope]);
  const tally = useMemo(() => tallyRecords(scoped, (p) => p.tokens[dim.field] ?? []), [scoped, dim.field]);
  const groups = useMemo(() => groupOther(tally.tallies, MAX_SLICES, (p) => p.id), [tally]);
  const slices = groups.map((g, i) => ({ key: g.key, label: g.label, value: g.count, color: sliceColor(i, g.key) }));

  const keywordId = useId();
  const drill = dash.drills.literature ?? null;
  const drillKey = drill?.key ?? null;
  const open = drillKey ? (groups.find((g) => g.key === drillKey) ?? null) : null;
  const select = (key: string) => actions.setDashboardDrill("literature", drillKey === key ? null : { card: "lit", key, dim: null });
  const close = () => actions.setDashboardDrill("literature", null);
  const clearOwn = { drills: dropDrill(dash.drills, "literature") };

  const breakDims = LIT_FIELDS.filter((f) => f.field !== dim.field);
  const breakDim = breakDims.find((f) => f.field === drill?.dim) ?? breakDims[0];
  const sub = useMemo(() => (open ? tallyRecords(open.items, (p) => p.tokens[breakDim.field] ?? []) : null), [open, breakDim.field]);

  const scopeNoun = dash.litScope === "all" ? "publications" : dash.litScope === "site" ? "site-linked publications" : "general publications";
  return (
    <Card
      title="What the literature covers"
      subtitle={
        <>
          {formatCount(tally.withValue)} of {formatCount(tally.total)} {scopeNoun} record {dim.noun}
          {tally.multi > 0 ? "; publications may carry several keywords" : ""}
        </>
      }
      toolbar={
        <>
          <Seg<LitScope>
            label="Publications"
            options={(
              [
                ["all", "All"],
                ["site", "Site literature"],
                ["general", "General"],
              ] as const
            ).map(([value, label]) => ({
              value,
              label: (
                <>
                  {label} <span className="dash-seg-count">{formatCount(scopes[value])}</span>
                </>
              ),
            }))}
            value={dash.litScope}
            onChange={(scope) => actions.setDashboard({ litScope: scope, ...clearOwn })}
          />
          {/* An explicit label, so the select's name is "Keyword" alone (a
              wrapping label would add the selected option to it). */}
          <span className="dash-field">
            <label htmlFor={keywordId}>Keyword</label>
            <select
              id={keywordId}
              className="dash-select"
              value={dim.field}
              onChange={(e) => actions.setDashboard({ litDim: e.target.value, ...clearOwn })}
            >
              {LIT_FIELDS.map((f) => (
                <option key={f.field} value={f.field}>
                  {f.label}
                </option>
              ))}
            </select>
          </span>
        </>
      }
      hint={<Hint due={dash.hints.explore.literature}>Click a slice or a keyword to see its publications</Hint>}
    >
      {slices.length === 0 ? (
        <p className="dash-drill-note">No publication records {dim.noun}.</p>
      ) : (
        <div className="dash-chart">
          <Donut
            slices={slices}
            selected={drillKey}
            onSelect={select}
            centre={{ value: formatCount(tally.withValue), label: "publications" }}
            summary={`${dim.label} across ${formatCount(tally.withValue)} ${scopeNoun}: ${slices.map((s) => `${s.label} ${formatCount(s.value)}`).join(", ")}`}
          />
          <Legend
            slices={slices}
            counts={groups.map((g) => g.items.length)}
            unit="publications"
            selected={drillKey}
            onSelect={select}
            label={`${dim.label} keywords`}
          />
        </div>
      )}
      {open && sub && (
        <DrillPanel
          title={open.label}
          sub={`${formatCount(open.items.length)} ${scopeNoun}`}
          actions={
            open.key !== "other" && (
              <button
                type="button"
                className="btn-sm"
                onClick={() => actions.openLibrary({ facet: { field: dim.field, value: open.label }, scope: dash.litScope, group: groupOfField(dim.field) })}
              >
                Open in Library
              </button>
            )
          }
          onClose={close}
        >
          <div className="dash-drill-row">
            <label className="dash-field">
              <span>Break down by</span>
              <select
                className="dash-select"
                value={breakDim.field}
                onChange={(e) => actions.setDashboardDrill("literature", { card: "lit", key: open.key, dim: e.target.value })}
              >
                {breakDims.map((f) => (
                  <option key={f.field} value={f.field}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <BarList
              rows={sub.tallies.slice(0, 8).map((t) => ({ key: t.key, label: t.label, count: t.count }))}
              label={`${open.label} publications by ${breakDim.label.toLowerCase()}`}
            />
            <p className="dash-drill-note">
              {formatCount(sub.withValue)} of {formatCount(open.items.length)} record {breakDim.noun}.
            </p>
          </div>
          <PublicationList pubs={open.items} label={`${open.label} publications`} />
        </DrillPanel>
      )}
    </Card>
  );
}
