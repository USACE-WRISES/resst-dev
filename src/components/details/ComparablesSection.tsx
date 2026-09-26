// "What are comparable reservoirs doing?" — the analog finder (ideas doc #5):
// the documented RESST sites most like this reservoir, each with its
// sediment-release methods, as a starting point for relevant case studies.
// It runs when the card opens (the card is lazy, so nothing is computed
// until then; synchronous over the loaded core, <50 ms). Undocumented
// analogs sit behind a disclosure. A row opens that reservoir and the panel
// offers Back to where the user came from.

import { useEffect, useMemo, useState } from "react";
import type { AppData } from "../../lib/types";
import { actions, useMapViewState, type ReturnTarget } from "../../state/store";
import { ensureCore, getCore } from "../../sediment/data";
import { findSimilar, type SimilarMatch } from "../../sediment/similar";
import { formatPct, pctLost } from "../../sediment/format";
import { splitKeywords } from "../../lib/display";
import { ChevronRight } from "../icons";
import { InfoTip, SourceLine } from "./ui";

/** Documented analogs shown before "Show more". */
const FIRST = 5;

export function ComparablesSection({ row, data, from }: { row: number | null; data: AppData; from: ReturnTarget }) {
  useMapViewState(); // sedimentStamp re-render
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    setError(false);
    ensureCore().catch(() => setError(true));
  }, [retryKey]);
  useEffect(() => setShowAll(false), [row]);

  const core = getCore();
  const results = useMemo(
    () => (core && row != null ? findSimilar(core, row, new Set(data.siteByShortId.keys())) : null),
    [core, row, data],
  );

  if (error) {
    return (
      <p className="sec-status" data-status="error">
        National dataset failed to load.{" "}
        <button type="button" className="linklike" onClick={() => setRetryKey((k) => k + 1)}>
          Retry
        </button>
      </p>
    );
  }
  if (!core || !results) {
    return (
      <p className="sec-status" data-status="loading">
        Loading national dataset…
      </p>
    );
  }

  const rowFor = (m: SimilarMatch, documented: boolean) => {
    const name = core.names[m.row] || `NID ${core.nids[m.row]}`;
    const state = core.state[m.row] >= 0 ? core.dicts.state[core.state[m.row]] : "";
    const lost = pctLost(core.sed2025[m.row], core.capOrig[m.row]);
    const siteId = data.siteByShortId.get(core.ids[m.row]);
    const site = siteId ? data.siteById.get(siteId) : undefined;
    const methods = documented ? splitKeywords(site?.sediment_release) : [];
    return (
      <li key={m.row}>
        <button
          type="button"
          className="sim-card"
          title={`Similarity index ${m.score} of 100`}
          onClick={() => actions.openComparable(siteId ? { siteId } : { reservoirId: String(core.ids[m.row]) }, from)}
        >
          <span className="sim-card-head">
            <b className="sim-name">{name}</b>
            {state && <span className="sim-state">{state}</span>}
            <ChevronRight className="sim-go" size={13} />
          </span>
          <span className="sim-card-meta">
            {methods.map((v) => (
              <span key={v} className="chip">
                {v}
              </span>
            ))}
            {lost != null && <span className="sim-lost">{formatPct(lost)} lost by 2025</span>}
          </span>
        </button>
      </li>
    );
  };

  const shown = showAll ? results.documented : results.documented.slice(0, FIRST);
  return (
    <>
      <p className="card-lead">Documented sites most like this reservoir: a starting point for relevant case studies.</p>
      <h4 className="card-label">Documented case studies</h4>
      {results.documented.length === 0 ? (
        <p className="muted">No documented RESST site ranks as a close analog.</p>
      ) : (
        <ul className="sim-cards">{shown.map((m) => rowFor(m, true))}</ul>
      )}
      {results.documented.length > FIRST && (
        <button type="button" className="text-btn sim-toggle" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show fewer" : `Show ${results.documented.length - FIRST} more`}
        </button>
      )}
      {results.overall.length > 0 && (
        // Keyed by reservoir so each one starts in its default state: open
        // when there is no documented analog to show above it.
        <details key={row} className="sim-more" open={results.documented.length === 0 || undefined}>
          <summary>Other similar reservoirs (no RESST record)</summary>
          <ul className="sim-cards">{results.overall.map((m) => rowFor(m, false))}</ul>
        </details>
      )}
      <SourceLine text="Ranked by similarity: a relative screening aid, not a hydrologic equivalence">
        <InfoTip label="How similarity is ranked">
          Compares storage, drainage area, age, modeled capacity lost, sedimentation rate, purpose, and region.
          Verify real suitability in each site's literature.
        </InfoTip>
      </SourceLine>
    </>
  );
}
