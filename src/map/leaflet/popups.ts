// Popups on the Leaflet map. autoPan is off: the selection effect in
// MapPanel flies the camera itself and aims it so the popup lands clear of
// the toolbar (viewInsets.ts), and a Leaflet pan would fight that flight.
// closeOnEscapeKey is off because Leaflet's keyboard handler would swallow
// the Escape that disarms a Select tool while a popup is open. The
// "resst-popup" class scopes the card styling in styles.css.

import { L } from "./leaflet";

export const POPUP_OPTIONS: L.PopupOptions = {
  maxWidth: 320,
  minWidth: 240,
  closeButton: true,
  autoPan: false,
  closeOnEscapeKey: false,
  className: "resst-popup",
};

/** The panels a popup's toggles open and close (popupHtml.ts). */
export type PopupAction = "details" | "table";

/** Open a popup; `onAction` answers its panel toggles (they are part of the
    HTML string, so the listener is delegated on the popup's own element,
    which outlives content updates). */
export function openPopup(map: L.Map, lon: number, lat: number, html: string, onAction?: (action: PopupAction) => void): L.Popup {
  const popup = L.popup({ ...POPUP_OPTIONS, offset: L.point(0, -8) })
    .setLatLng([lat, lon])
    .setContent(html)
    .openOn(map);
  if (onAction) {
    popup.getElement()?.addEventListener("click", (e) => {
      const action = (e.target as Element | null)?.closest?.("[data-action]")?.getAttribute("data-action");
      if (action === "details" || action === "table") onAction(action);
    });
  }
  return popup;
}

/** Label a popup's toggles for the panels' current state: "Show details" or
    "Hide details", "Show table" or "Hide table", with aria-expanded to match.
    The popup is plain HTML, so this runs whenever it opens and whenever a
    panel opens or closes, from the popup, the toolbar or an edge tab. */
export function syncPopupActions(popup: L.Popup | null, open: Record<PopupAction, boolean>): void {
  const el = popup?.getElement();
  if (!el) return;
  for (const btn of Array.from(el.querySelectorAll<HTMLButtonElement>("button[data-action]"))) {
    const action: PopupAction = btn.dataset.action === "table" ? "table" : "details";
    const label = `${open[action] ? "Hide" : "Show"} ${action}`;
    if (btn.textContent !== label) btn.textContent = label;
    btn.setAttribute("aria-expanded", String(open[action]));
  }
}
