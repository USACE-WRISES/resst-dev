// The Dam Report's frozen snapshot model — every value the modal shows and
// the downloaded file keeps, built ONCE from already-loaded data (EASI's
// snapshot philosophy: the download provably matches the view). Pure module:
// no DOM, no fetch, no store — vitest exercises it directly. All strings are
// display-ready; missing values render the em-dash placeholder through the
// format helpers (tables keep that convention; new prose avoids em dashes).

import type { AppData, LiteratureEntry, NidRecord, Site } from "../lib/types";
import { NID_DETAIL_FIELDS, SITE_FIELD_LABELS, SITE_ID_FIELDS, SITE_MGMT_FIELDS } from "../config/fields";
import {
  annualRateM3,
  formatKm2,
  formatPct,
  formatRateAcftPerYear,
  formatVolumeAcft,
  pctLost,
  surveyMethodText,
  surveyMonthLabel,
} from "../sediment/format";
import { buildNetworkSentences, networkStats } from "../sediment/network";
import type { SimilarResults } from "../sediment/similar";
import {
  PROVENANCE,
  SURVEY_POOL_LABELS,
  ressedDatasheetUrl,
  type SedimentCore,
  type SiteSedimentLink,
  type SurveyObs,
  type SurveyProvenance,
  type Trajectory,
} from "../sediment/types";
import type { TrajectoryChartInput } from "../sediment/chartGeom";

export type ReportTarget =
  | { kind: "site"; site: Site; entries: LiteratureEntry[]; nid: NidRecord | null; link: SiteSedimentLink | null }
  | { kind: "reservoir"; shortId: number };

export interface ReportField {
  label: string;
  value: string;
}

export interface ReportModel {
  kind: "site" | "reservoir";
  /** Filename slug: the site_id, or reservoir-{shortId}. */
  reportId: string;
  title: string;
  kicker: string;
  generatedIso: string;
  dataVintages: string;
  identity: ReportField[];
  /** Site only; [] = no keywords recorded. */
  management: ReportField[] | null;
  literature: Array<{ title: string; meta: string; doi: string | null }> | null;
  sustainability: {
    stats: Array<ReportField & { big?: boolean }>;
    chart: TrajectoryChartInput | null;
    chartNote: string | null;
    linkNote: string | null;
  } | null;
  /** The honest single note for sites without a crosswalk. */
  noModelNote: string | null;
  evidence: {
    hasSurveys: boolean;
    lines: string[];
    allValuesUnpublished: boolean;
    datasheetUrl: string | null;
    listUrl: string;
    agencyLine: string | null;
    rattesClass: 1 | 2 | null;
    noneNote: string | null;
  } | null;
  network: {
    chips: string[];
    stats: ReportField[];
    sentences: string[];
    connectivity: { pct: number; label: string } | null;
  } | null;
  comparables: {
    documented: Array<{ name: string; state: string; score: number; lost: string; keywords: string }>;
    overall: Array<{ name: string; state: string; score: number; lost: string }>;
    caveat: string;
  } | null;
  nid: ReportField[] | null;
  map: { lon: number; lat: number; alt: string } | null;
  references: Array<{ source: string; version: string; doi: string | null; url: string | null; note: string }>;
}

export interface ReportInputs {
  target: ReportTarget;
  data: AppData;
  core: SedimentCore | null;
  /** Resolved inventory row (null = no crosswalk / core unavailable). */
  row: number | null;
  /** undefined = trajectory unavailable (failed or absent); null = row has none. */
  trajectory: Trajectory | null | undefined;
  surveys: SurveyObs[] | null;
  surveyProv: SurveyProvenance | null;
  similar: SimilarResults | null;
  /** Injected so the builder stays deterministic under test. */
  generatedIso: string;
}

const RESSED_LIST_URL = "https://water.usgs.gov/osw/ressed/list_reservoirs/index.html";

const surveyLine = (s: SurveyObs): string => {
  const parts: string[] = [];
  const month = surveyMonthLabel(s.date);
  parts.push(month ? `${s.year} (${month})` : String(s.year));
  if (s.capM3 != null) parts.push(`measured capacity ${formatVolumeAcft(s.capM3)}`);
  if (s.sedTotM3 != null) parts.push(`interval sediment ${formatVolumeAcft(s.sedTotM3)}`);
  if (s.capM3 == null && s.sedTotM3 == null) parts.push("survey date on record; no measured values in the public 2013 export");
  const method = surveyMethodText(s);
  if (method) parts.push(method);
  if (s.pool) parts.push(SURVEY_POOL_LABELS[s.pool] ?? `pool ${s.pool}`);
  if (s.note) parts.push(s.note);
  return parts.join(" · ");
};

export function buildReportModel(inputs: ReportInputs): ReportModel {
  const { target, data, core, row, trajectory, surveys, surveyProv, similar, generatedIso } = inputs;
  const isSite = target.kind === "site";
  const site = isSite ? target.site : null;
  const link = isSite ? target.link : null;

  const dict = (list: string[] | undefined, idx: number | undefined): string =>
    list && idx != null && idx >= 0 ? (list[idx] ?? "") : "";
  const coreName = !isSite && core && row != null ? core.names[row] || `NID ${core.nids[row]}` : "";
  const title = site ? site.site_name : coreName || `Reservoir ${target.kind === "reservoir" ? target.shortId : ""}`.trim();

  // ---- identity -----------------------------------------------------------
  const identity: ReportField[] = [];
  if (site) {
    for (const f of SITE_ID_FIELDS) {
      const value = String(site[f] ?? "");
      if (value !== "") identity.push({ label: SITE_FIELD_LABELS[f] ?? f, value });
    }
    if (site.longitude != null && site.latitude != null) {
      identity.push({ label: "Coordinates", value: `${site.latitude.toFixed(4)}, ${site.longitude.toFixed(4)}` });
    }
  } else if (core && row != null) {
    const rows: Array<[string, string]> = [
      ["NID ID", core.nids[row]],
      ["State", dict(core.dicts.state, core.state[row])],
      ["Owner type", dict(core.dicts.owner, core.owner[row])],
      ["Primary purpose", dict(core.dicts.purpose, core.purpose[row])],
      ["Year completed", core.yrc[row] > 0 ? String(core.yrc[row]) : ""],
      ["Max storage (ResNet)", formatVolumeAcft(core.maxStor[row])],
      ["Drainage area", formatKm2(Number.isFinite(core.da[row]) ? core.da[row] : null)],
      ["Coordinates", `${core.lat[row].toFixed(4)}, ${core.lon[row].toFixed(4)}`],
    ];
    for (const [label, value] of rows) if (value !== "" && value !== "—") identity.push({ label, value });
  }

  // ---- team-collected sections (site only) --------------------------------
  const management = site
    ? SITE_MGMT_FIELDS.map((f) => ({ label: SITE_FIELD_LABELS[f] ?? f, value: String(site[f] ?? "") })).filter(
        (r) => r.value !== "",
      )
    : null;
  const literature = isSite
    ? target.entries.map((e) => ({
        title: e.title || "(untitled)",
        meta: [e.author, e.year, e.document_type].filter(Boolean).join(" · "),
        doi: e.doi && /^https?:\/\//i.test(e.doi) ? e.doi : null,
      }))
    : null;

  // ---- modeled sections ---------------------------------------------------
  const nn = (v: number | undefined) => (v != null && Number.isFinite(v) ? v : null);
  const stats = link
    ? {
        capOrig: link.cap_orig_m3,
        cap2025: link.cap2025_m3,
        sed2025: link.sed2025_m3,
        sed2015: link.sed2015_m3,
        cap2050: link.cap2050_m3,
        sed2050: link.sed2050_m3,
      }
    : core && row != null
      ? {
          capOrig: nn(core.capOrig[row]),
          cap2025: nn(core.cap2025[row]),
          sed2025: nn(core.sed2025[row]),
          sed2015: nn(core.sed2015[row]),
          cap2050: nn(core.cap2050[row]),
          sed2050: nn(core.sed2050[row]),
        }
      : null;

  const hasModel = stats != null;
  let sustainability: ReportModel["sustainability"] = null;
  if (hasModel) {
    const ci2050 = trajectory?.ci.find((c) => c.year === 2050);
    let proj2050 = formatVolumeAcft(stats.cap2050);
    if (ci2050 && ci2050.capLo != null && ci2050.capHi != null) {
      const lo = formatVolumeAcft(ci2050.capLo);
      const hi = formatVolumeAcft(ci2050.capHi);
      if (lo !== hi) proj2050 += ` (${lo.replace(" ac-ft", "")}–${hi})`;
    }
    const chart: TrajectoryChartInput | null =
      trajectory && trajectory.years.length
        ? {
            name: title,
            years: trajectory.years,
            capacityM3: trajectory.capacityM3,
            sedimentM3: trajectory.sedimentM3,
            yr0: trajectory.yr0,
            surveys: (surveys ?? []).map((s) => ({ year: s.year, capM3: s.capM3 })),
            ci: trajectory.ci.map((c) => ({ year: c.year, capHi: c.capHi, capLo: c.capLo })),
          }
        : null;
    sustainability = {
      stats: [
        { big: true, label: "Est. capacity lost (2025)", value: formatPct(pctLost(stats.sed2025, stats.capOrig)) },
        { big: true, label: "Projected lost by 2050", value: formatPct(pctLost(stats.sed2050, stats.capOrig)) },
        { label: "Original storage capacity", value: formatVolumeAcft(stats.capOrig) },
        { label: "Est. remaining capacity (2025)", value: formatVolumeAcft(stats.cap2025) },
        { label: "Est. accumulated sediment (2025)", value: formatVolumeAcft(stats.sed2025) },
        { label: "Est. annual accumulation", value: formatRateAcftPerYear(annualRateM3(stats.sed2025, stats.sed2015)) },
        { label: "Projected capacity (2050)", value: proj2050 },
      ],
      chart,
      chartNote: chart
        ? null
        : trajectory === undefined
          ? "The modeled trajectory was unavailable when this report was generated."
          : "No modeled trajectory is available for this reservoir.",
      linkNote:
        link?.method === "spatial_name"
          ? `Linked to ResNet dam ${link.nid} by location/name (${link.confidence} confidence); see data/site_resnet_crosswalk.csv.`
          : null,
    };
  }

  const noModelNote =
    isSite && !hasModel
      ? "National sedimentation modeling (RATTES/ResNet) covers large CONUS dams; this site is not linked to a modeled reservoir."
      : null;

  // ---- evidence -----------------------------------------------------------
  let evidence: ReportModel["evidence"] = null;
  if (hasModel) {
    const hasSurveys = link ? link.has_surveys : core && row != null ? surveys != null && surveys.length > 0 : false;
    const list = surveys ?? [];
    evidence = {
      hasSurveys,
      lines: hasSurveys ? list.map(surveyLine) : [],
      allValuesUnpublished: hasSurveys && list.length > 0 && list.every((s) => s.capM3 == null),
      datasheetUrl: ressedDatasheetUrl(surveyProv?.ressedId ?? null),
      listUrl: RESSED_LIST_URL,
      agencyLine:
        surveyProv && (surveyProv.agency || surveyProv.supplier)
          ? [
              surveyProv.agency ? `Surveys by ${surveyProv.agency}.` : "",
              surveyProv.supplier ? `Data supplied by ${surveyProv.supplier}.` : "",
            ]
              .filter(Boolean)
              .join(" ")
          : null,
      rattesClass: core && row != null && (core.evd[row] === 1 || core.evd[row] === 2) ? (core.evd[row] as 1 | 2) : null,
      noneNote: hasSurveys
        ? null
        : "No measured sedimentation surveys are on record for this reservoir in RESSED (2013 compilation). The Reservoir Sustainability values are model estimates only.",
    };
  }

  // ---- network (computed on demand from the core) -------------------------
  let network: ReportModel["network"] = null;
  if (core && row != null) {
    const s = networkStats(core, row);
    const chips: string[] = [];
    if (s.terminal) chips.push("Terminal dam");
    if (s.headwater) chips.push("Headwater dam");
    if (s.lock) chips.push("Navigation lock");
    const netStats: ReportField[] = [
      { label: "Upstream dams", value: s.upCount.toLocaleString("en-US") },
      { label: "Downstream dams", value: s.downCount.toLocaleString("en-US") },
    ];
    if (s.immediateDownRow != null)
      netStats.push({ label: "Immediate downstream", value: core.names[s.immediateDownRow] || core.nids[s.immediateDownRow] });
    if (s.mouthRow != null) netStats.push({ label: "Drains to", value: core.names[s.mouthRow] });
    const da = core.da[row];
    const sca = core.sca[row];
    let connectivity: { pct: number; label: string } | null = null;
    if (Number.isFinite(da) && Number.isFinite(sca) && da > 0) {
      const pct = Math.max(0, Math.min(100, (sca / da) * 100));
      const pctText = pct > 0 && pct < 1 ? "<1%" : `${Math.round(pct)}%`;
      connectivity = {
        pct,
        label:
          `${formatKm2(sca)} of the ${formatKm2(da)} total drainage area (${pctText}) reaches this reservoir ` +
          `without first passing another dam` +
          (pct < 99.5 ? "; the rest drains through at least one upstream reservoir" : ""),
      };
    }
    network = { chips, stats: netStats, sentences: buildNetworkSentences(core, row), connectivity };
  }

  // ---- comparables --------------------------------------------------------
  let comparables: ReportModel["comparables"] = null;
  if (core && row != null && similar) {
    const rowOf = (m: { row: number; score: number }) => {
      const name = core.names[m.row] || `NID ${core.nids[m.row]}`;
      const state = dict(core.dicts.state, core.state[m.row]);
      const lost = formatPct(pctLost(nn(core.sed2025[m.row]), nn(core.capOrig[m.row])));
      return { name, state, score: m.score, lost };
    };
    comparables = {
      documented: similar.documented.map((m) => {
        const base = rowOf(m);
        const siteId = data.siteByShortId.get(core.ids[m.row]);
        const s = siteId ? data.siteById.get(siteId) : undefined;
        return { ...base, keywords: s?.sediment_release ?? "" };
      }),
      overall: similar.overall.map(rowOf),
      caveat:
        "Similarity compares storage, drainage area, age, modeled capacity lost, sedimentation rate, purpose, and region. It is a relative screening aid, not a hydrologic equivalence.",
    };
  }

  // ---- NID (site only) ----------------------------------------------------
  const nid =
    isSite && target.nid
      ? NID_DETAIL_FIELDS.map((f) => ({
          label: f.label,
          value: String(target.nid![f.field as keyof NidRecord] ?? ""),
        })).filter((r) => r.value !== "")
      : null;

  // ---- map ----------------------------------------------------------------
  const lon = site ? site.longitude : core && row != null ? core.lon[row] : null;
  const lat = site ? site.latitude : core && row != null ? core.lat[row] : null;
  const map =
    lon != null && lat != null
      ? { lon, lat, alt: `Location of ${title} with its upstream and downstream reservoir network highlighted.` }
      : null;

  // ---- references ---------------------------------------------------------
  const references: ReportModel["references"] = [];
  if (isSite) {
    references.push({
      source: PROVENANCE.resst.source,
      version: PROVENANCE.resst.version,
      doi: null,
      url: "https://usace-wrises.github.io/resst-dev/",
      note: PROVENANCE.resst.note,
    });
  }
  if (hasModel) {
    references.push(
      { source: PROVENANCE.rattes.source, version: PROVENANCE.rattes.version, doi: PROVENANCE.rattes.doi ?? null, url: null, note: PROVENANCE.rattes.note },
      { source: PROVENANCE.resnet.source, version: PROVENANCE.resnet.version, doi: PROVENANCE.resnet.doi ?? null, url: null, note: PROVENANCE.resnet.note },
      { source: PROVENANCE.ressed.source, version: PROVENANCE.ressed.version, doi: null, url: PROVENANCE.ressed.url ?? null, note: PROVENANCE.ressed.note },
    );
  }
  if (isSite && site?.nid_id) {
    references.push({
      source: "National Inventory of Dams (USACE)",
      version: "live service snapshot",
      doi: null,
      url: "https://nid.sec.usace.army.mil/",
      note: "Identity and structural attributes for the linked dam record.",
    });
  }
  references.push({
    source: "Basemap: USGS The National Map",
    version: "topographic raster",
    doi: null,
    url: "https://basemap.nationalmap.gov/",
    note: "US public domain; used for the report's location figure.",
  });

  return {
    kind: target.kind,
    reportId: site ? site.site_id : `reservoir-${target.kind === "reservoir" ? target.shortId : ""}`,
    title,
    kicker: isSite ? "RESST Site Report" : "National Inventory Reservoir Report",
    generatedIso,
    dataVintages: `Data as of ${new Date(data.manifest.generated).toLocaleDateString("en-US")} · RATTES v1.2 (2026, silt scenario) · ResNet v1 (2025) · RESSED (2013)`,
    identity,
    management,
    literature,
    sustainability,
    noModelNote,
    evidence,
    network,
    comparables,
    nid,
    map,
    references,
  };
}
