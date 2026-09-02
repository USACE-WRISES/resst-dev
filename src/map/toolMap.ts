// What the Select tools (selectTools.ts) need from a map engine. Both the
// MapLibre panel and the Leaflet panel implement it, so the tools themselves
// never import an engine. Coordinates cross the seam as [lon, lat]; pixels are
// CSS px from the top-left of getInteractiveElement(); zoom is MapLibre's
// basis (512 px world tile), the one spatial.ts's metersPerPixel expects.

import type { Feature } from "geojson";

export interface ToolMapEvent {
  lngLat: { lng: number; lat: number };
  originalEvent: MouseEvent;
  /** Suppress the engine's own reaction to the gesture (MapLibre: double-click zoom). */
  preventDefault(): void;
}

export type ToolMapEventType = "click" | "mousemove" | "dblclick";
export type ToolMapHandler = (e: ToolMapEvent) => void;

export interface ToolMap {
  project(lngLat: [number, number]): { x: number; y: number };
  getZoom(): number;
  /** The element that receives the box tool's mousedown and defines project()'s frame. */
  getInteractiveElement(): HTMLElement;
  on(type: ToolMapEventType, h: ToolMapHandler): void;
  off(type: ToolMapEventType, h: ToolMapHandler): void;
  setDragPan(on: boolean): void;
  setBoxZoom(on: boolean): void;
  setDoubleClickZoom(on: boolean): void;
  setCrosshair(on: boolean): void;
  /** The in-progress polygon sketch (ov-draw); null clears it. */
  setSketch(features: Feature[] | null): void;
  /** The completed basin/river/polygon outline (ov-select); null clears it. */
  setHighlight(f: Feature | null): void;
}
