// Popups on the Leaflet map, with the MapLibre panel's dimensions. autoPan is
// off because MapLibre popups never move the camera — and a pan here would
// fire moveend, refreshing labels and overlays for nothing. closeOnEscapeKey
// is off for parity too, and because Leaflet's keyboard handler would swallow
// the Escape that disarms a Select tool while a popup is open.

import { L } from "./leaflet";

export const POPUP_OPTIONS: L.PopupOptions = { maxWidth: 320, closeButton: true, autoPan: false, closeOnEscapeKey: false };

export function openPopup(map: L.Map, lon: number, lat: number, html: string): L.Popup {
  return L.popup({ ...POPUP_OPTIONS, offset: L.point(0, -8) })
    .setLatLng([lat, lon])
    .setContent(html)
    .openOn(map);
}
