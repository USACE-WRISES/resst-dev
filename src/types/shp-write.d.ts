// Minimal typings for @mapbox/shp-write (no upstream types).
declare module "@mapbox/shp-write" {
  import type { FeatureCollection } from "geojson";
  export interface ShpWriteOptions {
    folder?: string;
    filename?: string;
    outputType?: "blob" | "base64" | "arraybuffer";
    compression?: "STORE" | "DEFLATE";
    types?: { point?: string; polygon?: string; polyline?: string; multipolygon?: string };
  }
  export function zip(geojson: FeatureCollection, options?: ShpWriteOptions): Promise<Blob | string | ArrayBuffer>;
  export function download(geojson: FeatureCollection, options?: ShpWriteOptions): void;
}
