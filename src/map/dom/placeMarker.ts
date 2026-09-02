// The place-search pin: a div icon carrying an inline SVG teardrop in the
// colour of MapLibre's default marker. No image assets, so nothing depends on
// Leaflet's icon-path detection (which the bundler's inlined CSS breaks).

import { L } from "./leaflet";
import { esc } from "../popupHtml";

const PIN_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="27" height="41" viewBox="0 0 27 41" aria-hidden="true" focusable="false">' +
  '<path d="M13.5 0.5C6.3 0.5 0.5 6.3 0.5 13.5c0 9.9 13 27 13 27s13-17.1 13-27C26.5 6.3 20.7 0.5 13.5 0.5z" fill="#3fb1ce" stroke="#2a8aa3" stroke-width="1"/>' +
  '<circle cx="13.5" cy="13.5" r="5.5" fill="#ffffff"/></svg>';

export function createPlaceMarker(map: L.Map, lon: number, lat: number, label: string): L.Marker {
  const icon = L.divIcon({
    className: "dom-place-marker",
    html: PIN_SVG,
    iconSize: [27, 41],
    iconAnchor: [13, 41],
    popupAnchor: [0, -36],
  });
  // `title` doubles as the accessible name Leaflet gives the marker button.
  const m = L.marker([lat, lon], { icon, title: label, keyboard: true }).addTo(map);
  m.bindPopup(esc(label), { maxWidth: 280, closeButton: true, autoPan: false, closeOnEscapeKey: false });
  m.openPopup();
  return m;
}
