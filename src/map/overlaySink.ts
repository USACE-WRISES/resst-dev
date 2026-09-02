// What the reference-overlay runtime (overlays.ts) needs from a map engine:
// where the camera is, and somewhere to put each overlay's data. Coordinates
// are lon/lat; zoom is MapLibre's basis. The MapLibre sink writes GeoJSON
// sources and layer visibility; the Leaflet sink manages layer groups.

import type { FeatureCollection } from "geojson";

export interface OverlaySink {
  /** [west, south, east, north] of the current view. */
  getBounds(): [number, number, number, number];
  getZoom(): number;
  isMoving(): boolean;
  /** Whether this engine currently has a target for the overlay's data. */
  has(key: string): boolean;
  setData(key: string, fc: FeatureCollection): void;
  setVisible(key: string, on: boolean): void;
}
