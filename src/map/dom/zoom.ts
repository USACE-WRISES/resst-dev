// Leaflet's zoom runs one step above MapLibre's for the same scale (256 px
// tiles against 512 px world tiles). The app's contract — map commands,
// zoomTick, overlay zoom gates, label thresholds, gazetteer zooms,
// metersPerPixel — stays in the MapLibre basis; convert only at the edge of
// the Leaflet panel.

/** MapLibre zoom → Leaflet zoom. */
export const lz = (mapZoom: number): number => mapZoom + 1;
/** Leaflet zoom → MapLibre zoom. */
export const mz = (leafletZoom: number): number => leafletZoom - 1;
