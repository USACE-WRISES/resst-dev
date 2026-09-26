// The Dashboard view: the whole dataset at a glance, one topic at a time.
// Four headline tiles double as the tabs (TopicTabs.tsx): the documented
// sites' management keywords, the literature's keywords, the Screening
// quadrants, and capacity lost across the country; the chosen topic fills the
// panel below, with its drill-down inside. A topic mounts the first time it is
// opened and then stays (hidden), so switching back is instant. It always
// summarizes everything (the Map view's Data Filters do not apply here; a
// notice says so while they are on). The national topics need the modeled
// inventory, fetched once on first visit.
//
// The page stays mounted (parked) while another view shows, so it takes only
// the props it needs and is memoized: nothing on the Map view re-renders it.

import { memo, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AppData } from "../lib/types";
import { formatCount } from "../lib/display";
import type { DashboardState, DashTopic, OverlayStatus } from "../state/store";
import { ensureCore, getCore } from "../sediment/data";
import { compact, formatPct, formatVolumeAcft, m3ToAcft } from "../sediment/format";
import { publicationsFor, scopeCounts } from "../library/index";
import { nationalHeadline, sitesByShortId, tallyKeyword } from "./stats";
import { share } from "./charts/chartMath";
import { TopicTabs, panelId, tabId, type TopicTile } from "./TopicTabs";
import { Hint } from "./ui";
import { SitesCard } from "./cards/SitesCard";
import { LiteratureCard } from "./cards/LiteratureCard";
import { QuadrantsCard } from "./cards/QuadrantsCard";
import { LossCard } from "./cards/LossCard";

function Dashboard({
  data,
  dash,
  coreStatus,
  filtersActive,
}: {
  data: AppData;
  dash: DashboardState;
  /** The national inventory's load status (src/sediment/data.ts). */
  coreStatus: OverlayStatus | null;
  /** Whether any Data Filter is on in the Map view. */
  filtersActive: boolean;
}) {
  // Start the national download just after this page's first paint: its
  // status update re-renders the (hidden) Map view, which must not hold up
  // the switch to the Dashboard.
  useEffect(() => {
    let timer = 0;
    const frame = requestAnimationFrame(() => {
      timer = window.setTimeout(() => void ensureCore().catch(() => {}), 0);
    });
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, []);
  const retry = () => void ensureCore().catch(() => {});

  // The core is in the module cache by the time its status reads "ready".
  const core = useMemo(() => getCore(), [coreStatus]);
  const status: "loading" | "error" | null = core ? null : coreStatus === "error" ? "error" : "loading";

  const documentedIds = useMemo(() => new Set(data.siteByShortId.keys()), [data]);
  const sitesBy = useMemo(() => sitesByShortId(data.siteSediment), [data]);
  const pubs = useMemo(() => publicationsFor(data), [data]);
  const scopes = useMemo(() => scopeCounts(pubs), [pubs]);
  const headline = useMemo(() => (core ? nationalHeadline(core, documentedIds) : null), [core, documentedIds]);
  const releaseSites = useMemo(() => tallyKeyword(data.sites, "sediment_release").withValue, [data]);

  // A topic mounts the first time it is shown, then stays (hidden) while another shows.
  const [seen, setSeen] = useState<ReadonlySet<DashTopic>>(() => new Set([dash.topic]));
  if (!seen.has(dash.topic)) setSeen(new Set([...seen, dash.topic]));

  const tiles: TopicTile[] = [
    {
      topic: "sites",
      label: "Sediment management",
      value: formatCount(data.sites.length),
      unit: "documented sites",
      note: `${formatCount(releaseSites)} record a sediment release method`,
    },
    {
      topic: "literature",
      label: "Literature",
      value: formatCount(data.literature.length),
      unit: "publications",
      note: `${formatCount(scopes.site)} site-linked · ${formatCount(scopes.general)} general`,
    },
    {
      topic: "screening",
      label: "Management and loss",
      value: formatCount(data.siteSediment.size),
      unit: "sites with modeled data",
      note: headline
        ? `${formatCount(sitesBy.size)} reservoirs · ${formatPct(share(headline.documented.capOrig, headline.capOrig))} of modeled storage`
        : `${formatCount(sitesBy.size)} reservoirs`,
    },
    {
      topic: "capacity",
      label: "Capacity lost",
      value: headline ? formatPct(headline.pctVolume) : "…",
      unit: "of original storage lost by 2025",
      note: headline
        ? `${formatCount(headline.dams)} modeled reservoirs · ${compact(m3ToAcft(headline.sed2025))} of ${formatVolumeAcft(headline.capOrig)}`
        : "Loading national dataset…",
    },
  ];
  const panel = (topic: DashTopic, content: ReactNode) => (
    <section key={topic} role="tabpanel" id={panelId(topic)} aria-labelledby={tabId(topic)} className="dash-panel" hidden={dash.topic !== topic}>
      {seen.has(topic) && content}
    </section>
  );

  return (
    <div className="dash-page">
      {/* The tiles' hint leads the row, right above the first tile; the
          data stamp sits at its right end. */}
      <div className="dash-head">
        <Hint due={dash.hints.topics}>Click a tile to switch topics</Hint>
        {filtersActive && (
          <p className="dash-notice" role="note">
            Data Filters are active on the Map view. The Dashboard always summarizes the whole dataset.
          </p>
        )}
        <p className="dash-vintage">
          Data as of {new Date(data.manifest.generated).toLocaleDateString()} · RATTES v1.2 (2026) · ResNet v1 (2025) · RESSED (2013)
        </p>
      </div>
      <TopicTabs tiles={tiles} active={dash.topic} />
      {panel("sites", <SitesCard data={data} dash={dash} />)}
      {panel("literature", <LiteratureCard pubs={pubs} scopes={scopes} dash={dash} />)}
      {panel(
        "screening",
        <QuadrantsCard core={core} status={status} onRetry={retry} documentedIds={documentedIds} sitesBy={sitesBy} data={data} dash={dash} />,
      )}
      {panel(
        "capacity",
        <LossCard core={core} status={status} onRetry={retry} documentedIds={documentedIds} sitesBy={sitesBy} data={data} dash={dash} />,
      )}
    </div>
  );
}

export default memo(Dashboard);
