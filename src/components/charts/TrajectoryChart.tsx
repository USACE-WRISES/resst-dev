// The storage-trajectory chart: RATTES modeled capacity (line) and sediment
// (area) with measured RESSED surveys as dots — the dots-vs-line contrast IS
// the measured-vs-modeled distinction, spelled out in the legend. Pure SVG
// from src/sediment/chartGeom.ts geometry (no chart library); the <details>
// data table is the accessible/keyboard path to the numbers and doubles as
// an e2e assertion hook.

import { buildTrajectoryGeometry, type TrajectoryChartInput } from "../../sediment/chartGeom";
import { compact, m3ToAcft } from "../../sediment/format";

const acft = (m3: number | null | undefined) => (m3 == null || !Number.isFinite(m3) ? "—" : compact(m3ToAcft(m3)));

export function TrajectoryChart(props: TrajectoryChartInput) {
  const g = buildTrajectoryGeometry(props);
  if (!g) return <p className="muted">No modeled trajectory is available for this reservoir.</p>;
  const surveys = (props.surveys ?? []).filter((s) => s.capM3 != null);
  return (
    <figure className="traj-chart">
      <svg viewBox={`0 0 ${g.width} ${g.height}`} role="img" aria-label={g.summaryText}>
        {g.projectedX != null && (
          <rect
            className="traj-projected"
            x={g.projectedX}
            y={g.plot.y}
            width={g.plot.x + g.plot.w - g.projectedX}
            height={g.plot.h}
          />
        )}
        {g.yTicks.map((t) => (
          <g key={`y${t.y}`}>
            <line className="traj-grid" x1={g.plot.x} x2={g.plot.x + g.plot.w} y1={t.y} y2={t.y} />
            <text className="traj-tick" x={g.plot.x - 4} y={t.y} dy="0.32em" textAnchor="end">
              {t.label}
            </text>
          </g>
        ))}
        {g.xTicks.map((t) => (
          <text key={`x${t.x}`} className="traj-tick" x={t.x} y={g.plot.y + g.plot.h + 13} textAnchor="middle">
            {t.label}
          </text>
        ))}
        <text className="traj-tick traj-unit" x={g.plot.x - 4} y={g.plot.y - 3} textAnchor="end">
          ac-ft
        </text>
        {g.sedArea && <path className="traj-sed-area" d={g.sedArea} />}
        {g.sedSolid && <path className="traj-sed-line" d={g.sedSolid} />}
        {g.sedDashed && <path className="traj-sed-line" d={g.sedDashed} />}
        {g.originalY != null && <line className="traj-orig" x1={g.plot.x} x2={g.plot.x + g.plot.w} y1={g.originalY} y2={g.originalY} />}
        {g.capSolid && <path className="traj-cap" d={g.capSolid} />}
        {g.capDashed && <path className="traj-cap dashed" d={g.capDashed} />}
        {g.whiskers.map((w) => (
          <g key={`w${w.year}`} className="traj-whisker">
            <line x1={w.x} x2={w.x} y1={w.yLo} y2={w.yHi} />
            <line x1={w.x - 3} x2={w.x + 3} y1={w.yHi} y2={w.yHi} />
            <line x1={w.x - 3} x2={w.x + 3} y1={w.yLo} y2={w.yLo} />
          </g>
        ))}
        {g.surveyPts.map((p) => (
          <circle key={`s${p.year}-${p.x}`} className="traj-survey" cx={p.x} cy={p.y} r={3.5} />
        ))}
        {g.projectedX != null && (
          <text className="traj-projlabel" x={g.projectedX + 3} y={g.plot.y + g.plot.h - 4}>
            projected
          </text>
        )}
      </svg>
      <figcaption className="chart-legend">
        <span>
          <i className="lg-cap" aria-hidden="true" /> Modeled capacity (RATTES)
        </span>
        <span>
          <i className="lg-sed" aria-hidden="true" /> Modeled sediment
        </span>
        {surveys.length > 0 && (
          <span>
            <i className="lg-survey" aria-hidden="true" /> Measured survey (RESSED)
          </span>
        )}
      </figcaption>
      <details className="chart-data">
        <summary>View data table</summary>
        <table>
          <caption className="sr-only">Modeled storage trajectory, acre-feet</caption>
          <thead>
            <tr>
              <th scope="col">Year</th>
              <th scope="col">Est. capacity (ac-ft)</th>
              <th scope="col">Est. sediment (ac-ft)</th>
            </tr>
          </thead>
          <tbody>
            {props.years.map((yr, i) => (
              <tr key={yr}>
                <td>{yr}{yr > (props.nowYear ?? 2025) ? "*" : ""}</td>
                <td>{acft(props.capacityM3[i])}</td>
                <td>{acft(props.sedimentM3[i])}</td>
              </tr>
            ))}
            {surveys.map((s) => (
              <tr key={`sv${s.year}`}>
                <td>{s.year} (measured)</td>
                <td>{acft(s.capM3)}</td>
                <td>—</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted">* projected (RATTES v1.2, silt scenario)</p>
      </details>
    </figure>
  );
}
