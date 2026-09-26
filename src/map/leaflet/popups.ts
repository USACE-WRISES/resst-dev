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

/** Open a popup; `onDetails` answers its "Show details" button (the button
    is part of the HTML string, so the listener is delegated on the popup's
    own element, which outlives content updates). */
export function openPopup(map: L.Map, lon: number, lat: number, html: string, onDetails?: () => void): L.Popup {
  const popup = L.popup({ ...POPUP_OPTIONS, offset: L.point(0, -8) })
    .setLatLng([lat, lon])
    .setContent(html)
    .openOn(map);
  if (onDetails) {
    popup.getElement()?.addEventListener("click", (e) => {
      if ((e.target as Element | null)?.closest?.(".popup-more")) onDetails();
    });
  }
  return popup;
}
