// Popup bodies shared by both map engines: plain HTML strings the engine
// wraps in its own popup shell. The classes are styled in styles.css
// (.site-popup, .popup-row, .popup-note).

import type { Site } from "../lib/types";
import { SITE_DETAIL_FIELDS, SITE_FIELD_LABELS } from "../config/fields";
import { formatPct, formatVolumeAcft, pctLost } from "../sediment/format";
import { FLAG, type SedimentCore } from "../sediment/types";

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function popupHtml(site: Site): string {
  const rows = SITE_DETAIL_FIELDS.filter((f) => f !== "site_name")
    .map((f) => {
      const v = site[f];
      return v ? `<div class="popup-row"><span>${esc(SITE_FIELD_LABELS[f] ?? f)}</span><b>${esc(String(v))}</b></div>` : "";
    })
    .join("");
  return `<div class="site-popup"><h3>${esc(site.site_name)}</h3>${rows}</div>`;
}

/** Compact popup for a national-inventory reservoir (not a documented site). */
export function reservoirPopupHtml(core: SedimentCore, row: number): string {
  const name = core.names[row] || `NID ${core.nids[row]}`;
  const state = core.state[row] >= 0 ? core.dicts.state[core.state[row]] : "";
  const lost = pctLost(
    Number.isFinite(core.sed2025[row]) ? core.sed2025[row] : null,
    Number.isFinite(core.capOrig[row]) ? core.capOrig[row] : null,
  );
  const rows = [
    state ? `<div class="popup-row"><span>State</span><b>${esc(state)}</b></div>` : "",
    `<div class="popup-row"><span>Max storage</span><b>${esc(formatVolumeAcft(core.maxStor[row]))}</b></div>`,
    lost != null ? `<div class="popup-row"><span>Est. capacity lost (2025)</span><b>${esc(formatPct(lost))}</b></div>` : "",
    `<div class="popup-row"><span>Evidence</span><b>${core.flags[row] & FLAG.HAS_SURVEYS ? "Measured surveys (RESSED)" : "Modeled only"}</b></div>`,
  ].join("");
  return `<div class="site-popup"><h3>${esc(name)}</h3>${rows}<p class="popup-note">No documented RESST sediment-management record; details in the panel.</p></div>`;
}
