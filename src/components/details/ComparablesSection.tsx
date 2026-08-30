// "What are comparable reservoirs doing?" — the analog finder (ideas doc #5).
// Documented analogs list first, each carrying its RESST management keywords:
// the whole point is routing users from a sedimentation problem to relevant
// precedent projects and their literature. Computation is on-demand (button),
// synchronous over the loaded core (<50 ms), and rows click through to the
// normal site/reservoir selection.

import { useState } from "react";
import type { AppData } from "../../lib/types";
import { actions, useAppState } from "../../state/store";
import { ensureCore, getCore } from "../../sediment/data";
import { findSimilar, type SimilarMatch } from "../../sediment/similar";
import { formatPct, pctLost } from "../../sediment/format";
import { ProvBadge, ProvNote } from "./Provenance";
import { PROVENANCE } from "../../sediment/types";

export function ComparablesSection({ row, data }: { row: number | null; data: AppData }) {
  useAppState(); // sedimentStamp re-render
  const [requested, setRequested] = useState(false);
  const [error, setError] = useState(false);

  const core = getCore();
  const run = () => {
    setRequested(true);
    setError(false);
    void ensureCore().catch(() => setError(true));
  };

  if (!requested) {
    return (
      <>
        <p className="muted">Find the most physically similar reservoirs nationwide, documented RESST sites first.</p>
        <button type="button" className="nw-btn" onClick={run}>
          Find similar reservoirs
        </button>
      </>
    );
  }
  if (error) {
    return (
      <p className="sec-status" data-status="error">
        National dataset failed to load.{" "}
        <button type="button" className="linklike" onClick={run}>
          Retry
        </button>
      </p>
    );
  }
  if (!core || row == null) {
    return (
      <p className="sec-status" data-status="loading">
        Loading national dataset…
      </p>
    );
  }

  const results = findSimilar(core, row, new Set(data.siteByShortId.keys()));
  const rowFor = (m: SimilarMatch, documented: boolean) => {
    const name = core.names[m.row] || `NID ${core.nids[m.row]}`;
    const state = core.state[m.row] >= 0 ? core.dicts.state[core.state[m.row]] : "";
    const lost = pctLost(core.sed2025[m.row], core.capOrig[m.row]);
    const siteId = data.siteByShortId.get(core.ids[m.row]);
    const site = siteId ? data.siteById.get(siteId) : undefined;
    return (
      <li key={m.row}>
        <button
          type="button"
          className="sim-row"
          onClick={() => (siteId ? actions.selectSite(siteId) : actions.selectReservoir(String(core.ids[m.row])))}
        >
          <span className="sim-head">
            <b>{name}</b>
            {state && <span className="muted"> · {state}</span>}
            <span className="sim-score">{m.score}</span>
          </span>
          <span className="sim-meta">
            {lost != null && <>Est. {formatPct(lost)} capacity lost (2025)</>}
            {documented && site?.sediment_release && (
              <span className="sim-keywords"> · {site.sediment_release}</span>
            )}
          </span>
        </button>
      </li>
    );
  };

  return (
    <>
      <h4 className="sim-group">
        Documented analogs <ProvBadge kind="reported" label="RESST sites" />
      </h4>
      {results.documented.length === 0 ? (
        <p className="muted">No documented RESST site ranks as a close analog.</p>
      ) : (
        <ul className="sim-list">{results.documented.map((m) => rowFor(m, true))}</ul>
      )}
      <h4 className="sim-group">Nearest overall</h4>
      {results.overall.length === 0 ? (
        <p className="muted">No comparable reservoirs found.</p>
      ) : (
        <ul className="sim-list">{results.overall.map((m) => rowFor(m, false))}</ul>
      )}
      <ProvNote
        text="Similarity compares storage, drainage area, age, modeled capacity lost, sedimentation rate, purpose, and region. It is a relative screening aid, not a hydrologic equivalence"
        group={PROVENANCE.resnet}
      />
    </>
  );
}
