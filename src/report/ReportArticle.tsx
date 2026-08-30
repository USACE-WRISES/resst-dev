// The report body: a deliberately dumb renderer of the frozen ReportModel —
// no hooks, no store, no handlers (the one exception is the ReportMap child,
// which snapshots itself to an <img> and then holds no live state). That
// stasis is what makes the download honest: reportHtml.ts serializes this
// exact DOM, so what the user saw is what the file keeps.

import { forwardRef } from "react";
import { TrajectoryChart } from "../components/charts/TrajectoryChart";
import type { ReportModel } from "./reportModel";
import { ReportMap, type ReportMapStatus } from "./ReportMap";
import type { NetworkFeatureSet } from "../map/networkLayer";

function Fields({ rows }: { rows: ReportModel["identity"] }) {
  return (
    <dl className="field-list">
      {rows.map((r) => (
        <div key={r.label} className="field-row">
          <dt>{r.label}</dt>
          <dd>
            {/^https?:\/\//i.test(r.value) ? (
              <a href={r.value} target="_blank" rel="noopener noreferrer">
                {r.value}
              </a>
            ) : (
              r.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Badge({ type, label }: { type: string; label: string }) {
  return (
    <span className="prov-badge" data-type={type}>
      {label}
    </span>
  );
}

export const ReportArticle = forwardRef<
  HTMLElement,
  {
    model: ReportModel;
    /** Network features for the map figure (null = no map / no core). */
    mapFeatures: NetworkFeatureSet | null;
    onMapStatus: (status: ReportMapStatus) => void;
  }
>(function ReportArticle({ model, mapFeatures, onMapStatus }, ref) {
  const m = model;
  return (
    <article className="report-doc" ref={ref}>
      <header>
        <p className="rpt-kicker">{m.kicker}</p>
        <h1>{m.title}</h1>
        <p className="rpt-meta">Generated {m.generatedIso}</p>
        <p className="rpt-meta">{m.dataVintages}</p>
      </header>

      {m.map && (
        <figure className="report-map-figure">
          <ReportMap lon={m.map.lon} lat={m.map.lat} alt={m.map.alt} features={mapFeatures} onStatus={onMapStatus} />
          <div className="map-legend" aria-hidden="true">
            <span>
              <i style={{ background: "#e03131", boxShadow: "0 0 0 2px #ffd43b" }} /> Selected dam
            </span>
            <span>
              <i style={{ background: "#6a51a3" }} /> Upstream dam
            </span>
            <span>
              <i style={{ background: "#1b7837" }} /> Downstream dam
            </span>
            <span>
              <i style={{ background: "#0b3954" }} /> River mouth
            </span>
            <span>
              <i className="lg-line" /> Downstream path (schematic)
            </span>
          </div>
          <figcaption>
            Basemap: USGS The National Map. Network: ResNet v1; the downstream connector is schematic, not the river
            course.
          </figcaption>
        </figure>
      )}

      <section>
        <h2>Identity and location</h2>
        <Fields rows={m.identity} />
      </section>

      {m.management && (
        <section>
          <h2>
            Sediment Management
            <Badge type="reported" label="Reported" />
          </h2>
          {m.management.length === 0 ? (
            <p className="muted">No sediment management keywords are recorded for this site.</p>
          ) : (
            <Fields rows={m.management} />
          )}
          <p className="rpt-note">Documented by the RESST team from project records and literature.</p>
        </section>
      )}

      {m.literature && (
        <section>
          <h2>Site Literature ({m.literature.length})</h2>
          {m.literature.length === 0 ? (
            <p className="muted">No literature entries are linked to this site.</p>
          ) : (
            <ul className="rpt-list">
              {m.literature.map((e, i) => (
                <li key={i}>
                  <span className="lit-title">{e.title}</span>
                  <span className="lit-meta">{e.meta}</span>
                  {e.doi && (
                    <a className="lit-doi" href={e.doi} target="_blank" rel="noopener noreferrer">
                      {e.doi}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {m.noModelNote && (
        <section>
          <h2>National sedimentation context</h2>
          <p className="muted">{m.noModelNote}</p>
        </section>
      )}

      {m.sustainability && (
        <section>
          <h2>
            Reservoir Sustainability
            <Badge type="modeled" label="Modeled" />
          </h2>
          <div className="stat-grid">
            {m.sustainability.stats.map((s) => (
              <div key={s.label} className={s.big ? "stat-cell stat-big" : "stat-cell"}>
                <span className="stat-label">{s.label}</span>
                <span className="stat-value">{s.value}</span>
              </div>
            ))}
          </div>
          {m.sustainability.chart ? (
            <TrajectoryChart {...m.sustainability.chart} tableOpen />
          ) : (
            <p className="muted">{m.sustainability.chartNote}</p>
          )}
          {m.sustainability.linkNote && <p className="rpt-note">{m.sustainability.linkNote}</p>}
          <p className="rpt-note">RATTES v1.2 · silt scenario · modeled estimate.</p>
        </section>
      )}

      {m.evidence && (
        <section>
          <h2>
            Evidence
            {m.evidence.hasSurveys ? <Badge type="measured" label="Measured" /> : <Badge type="modeled" label="Modeled only" />}
          </h2>
          {m.evidence.noneNote ? (
            <p className="muted">{m.evidence.noneNote}</p>
          ) : (
            <ul className="rpt-list">
              {m.evidence.lines.map((line, i) => (
                <li key={i} className="survey-line">
                  {line}
                </li>
              ))}
            </ul>
          )}
          {m.evidence.allValuesUnpublished && (
            <p className="rpt-note">
              Measured capacities from these surveys were not published in the 2013 RESSED export, so the chart shows
              the modeled trajectory without measured points.
            </p>
          )}
          {m.evidence.rattesClass === 1 && (
            <p className="rpt-note">RATTES calibrates this reservoir's estimate to its repeat sedimentation surveys (Supplementary Data 1).</p>
          )}
          {m.evidence.rattesClass === 2 && (
            <p className="rpt-note">RATTES estimates this reservoir statistically; it has no qualifying repeat surveys in the model's compilation.</p>
          )}
          <p className="rpt-note">
            Measured surveys: USGS RESSED, 2013 public export (survey methods and datums vary).{" "}
            {m.evidence.datasheetUrl && (
              <>
                <a href={m.evidence.datasheetUrl} target="_blank" rel="noopener noreferrer">
                  Original RESSED datasheet (PDF)
                </a>
                {" · "}
              </>
            )}
            <a href={m.evidence.listUrl} target="_blank" rel="noopener noreferrer">
              RESSED reservoir list and datasheets
            </a>
          </p>
          {m.evidence.agencyLine && <p className="rpt-note">{m.evidence.agencyLine}</p>}
        </section>
      )}

      {m.network && (
        <section>
          <h2>
            Reservoir Network
            <Badge type="network" label="Network-derived" />
          </h2>
          {m.network.chips.length > 0 && (
            <p>
              {m.network.chips.map((c) => (
                <Badge key={c} type="network" label={c} />
              ))}
            </p>
          )}
          <Fields rows={m.network.stats} />
          {m.network.sentences.map((s, i) => (
            <p key={i} className="nw-sentence">
              {s}
            </p>
          ))}
          {m.network.connectivity && (
            <div>
              <div className="conn-bar">
                <div className="conn-fill" style={{ width: `${m.network.connectivity.pct}%` }} />
              </div>
              <p className="conn-caption">{m.network.connectivity.label}</p>
            </div>
          )}
          <p className="rpt-note">ResNet v1 · routed on NHDPlusV2 flowlines · downstream path is schematic, not the river course.</p>
        </section>
      )}

      {m.comparables && (
        <section>
          <h2>Comparable Reservoirs</h2>
          <h3 className="rpt-note" style={{ fontSize: "12px", margin: "0 0 4px" }}>
            Documented analogs (RESST sites)
          </h3>
          {m.comparables.documented.length === 0 ? (
            <p className="muted">No documented RESST site ranks as a close analog.</p>
          ) : (
            <table className="sim-table">
              <thead>
                <tr>
                  <th>Reservoir</th>
                  <th>State</th>
                  <th>Score</th>
                  <th>Est. lost (2025)</th>
                  <th>Sediment release</th>
                </tr>
              </thead>
              <tbody>
                {m.comparables.documented.map((r, i) => (
                  <tr key={i}>
                    <td>{r.name}</td>
                    <td>{r.state}</td>
                    <td className="sim-score">{r.score}</td>
                    <td>{r.lost}</td>
                    <td>{r.keywords}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <h3 className="rpt-note" style={{ fontSize: "12px", margin: "10px 0 4px" }}>
            Nearest overall
          </h3>
          {m.comparables.overall.length === 0 ? (
            <p className="muted">No comparable reservoirs found.</p>
          ) : (
            <table className="sim-table">
              <thead>
                <tr>
                  <th>Reservoir</th>
                  <th>State</th>
                  <th>Score</th>
                  <th>Est. lost (2025)</th>
                </tr>
              </thead>
              <tbody>
                {m.comparables.overall.map((r, i) => (
                  <tr key={i}>
                    <td>{r.name}</td>
                    <td>{r.state}</td>
                    <td className="sim-score">{r.score}</td>
                    <td>{r.lost}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="rpt-note">{m.comparables.caveat}</p>
        </section>
      )}

      {m.nid && (
        <section>
          <h2>National Inventory of Dams record</h2>
          <Fields rows={m.nid} />
        </section>
      )}

      <section>
        <h2>References and data sources</h2>
        <ol className="rpt-refs">
          {m.references.map((r, i) => (
            <li key={i}>
              {r.source} ({r.version}).{" "}
              {r.doi && (
                <a href={`https://doi.org/${r.doi}`} target="_blank" rel="noopener noreferrer">
                  doi:{r.doi}
                </a>
              )}
              {r.doi && r.url && " · "}
              {r.url && (
                <a href={r.url} target="_blank" rel="noopener noreferrer">
                  {r.url}
                </a>
              )}{" "}
              <span className="muted">{r.note}</span>
            </li>
          ))}
        </ol>
      </section>
    </article>
  );
});
