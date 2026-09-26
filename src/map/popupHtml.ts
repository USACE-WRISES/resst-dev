// Popup bodies for the map: plain HTML strings Leaflet wraps in its popup
// shell (class "resst-popup", styled in styles.css). The first look at a dam
// (owner decision 2026-09-25): who and where, its purpose and NID ID, what
// the RESST team documented there (release method, ecological concern,
// analysis), then the two numbers that say whether to dig in: the modeled
// share of capacity lost and how many references exist. The card ends with
// toggles for the panels the Map view starts with collapsed: "Show details" /
// "Hide details" (Selected Data) and, for documented sites, "Show table" /
// "Hide table" (the results table). They are written collapsed here;
// syncPopupActions (leaflet/popups.ts) relabels them for the panels' real
// state. <div>s rather than <p>s: Leaflet's `.leaflet-popup-content p`
// margin would eat the room above the site.

import type { Site } from "../lib/types";
import { splitKeywords, tidyList } from "../lib/display";
import { formatPct, formatVolumeAcft, pctLost } from "../sediment/format";
import { FLAG, type SedimentCore, type SiteSedimentLink } from "../sediment/types";

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const row = (label: string, valueHtml: string) =>
  `<div class="popup-row"><span>${esc(label)}</span><b>${valueHtml}</b></div>`;
const sub = (text: string) => (text ? `<div class="popup-sub">${esc(text)}</div>` : "");
const toggle = (action: "details" | "table") =>
  `<button type="button" class="popup-action" data-action="${action}" aria-expanded="false">Show ${action}</button>`;
/** A documented site's toggles: its details and its row in the results table. */
const SITE_ACTIONS = `<div class="popup-actions">${toggle("details")}${toggle("table")}</div>`;
/** A national reservoir is not a row in the RESST table: details only. */
const RESERVOIR_ACTIONS = `<div class="popup-actions">${toggle("details")}</div>`;

/** A keyword field as prose, or a muted placeholder when it says nothing. */
function keywords(raw: string | null | undefined): string {
  const values = splitKeywords(raw);
  if (values.length) return esc(values.join(", "));
  return `<span class="popup-none">${(raw ?? "").trim() ? "Not applicable" : "Not recorded"}</span>`;
}

export interface SitePopupFacts {
  /** Literature entries linked to the site. */
  references: number;
  /** The site's ResNet/RATTES crosswalk link (null when not modeled). */
  link: SiteSedimentLink | null;
}

export function popupHtml(site: Site, facts: SitePopupFacts): string {
  const types = splitKeywords(site.site_type).join(", ");
  const lost = facts.link ? pctLost(facts.link.sed2025_m3, facts.link.cap_orig_m3) : null;
  const refs =
    facts.references === 0 ? "No linked references" : `${facts.references} reference${facts.references === 1 ? "" : "s"}`;
  return (
    `<div class="site-popup"><h3 class="popup-title">${esc(site.site_name)}</h3>` +
    sub([site.city || site.address, tidyList(site.responsible_districtagency)].filter(Boolean).join(" · ")) +
    sub([types, site.nid_id ? `NID ${site.nid_id}` : ""].filter(Boolean).join(" · ")) +
    `<div class="popup-rows">` +
    row("Sediment release", keywords(site.sediment_release)) +
    row("Ecological concern", keywords(site.ecological_concern)) +
    row("Analysis", keywords(site.analysis)) +
    `</div><div class="popup-facts"><div class="popup-facts-text">` +
    (lost != null
      ? `<div><b>${esc(formatPct(lost))}</b> capacity lost by 2025 <span class="popup-none">(modeled)</span></div>`
      : "") +
    `<div>${esc(refs)}</div></div></div>${SITE_ACTIONS}</div>`
  );
}

/** Popup for a national-inventory reservoir (not a documented site). */
export function reservoirPopupHtml(core: SedimentCore, r: number): string {
  const name = core.names[r] || `NID ${core.nids[r]}`;
  const dict = (list: string[], idx: number) => (idx >= 0 ? list[idx] : "");
  const lost = pctLost(
    Number.isFinite(core.sed2025[r]) ? core.sed2025[r] : null,
    Number.isFinite(core.capOrig[r]) ? core.capOrig[r] : null,
  );
  const meta = [
    dict(core.dicts.state, core.state[r]),
    dict(core.dicts.owner, core.owner[r]),
    dict(core.dicts.purpose, core.purpose[r]),
    core.yrc[r] > 0 ? `Built ${core.yrc[r]}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const storage = formatVolumeAcft(core.maxStor[r]);
  return (
    `<div class="site-popup"><h3 class="popup-title">${esc(name)}</h3>` +
    sub(meta) +
    `<div class="popup-rows">` +
    (lost != null ? row("Est. capacity lost (2025)", esc(formatPct(lost))) : "") +
    (storage !== "—" ? row("Max storage", esc(storage)) : "") +
    row("Evidence", core.flags[r] & FLAG.HAS_SURVEYS ? "Measured surveys" : "Modeled only") +
    `</div><div class="popup-facts"><div class="popup-facts-text popup-note">No documented RESST record</div></div>${RESERVOIR_ACTIONS}</div>`
  );
}
