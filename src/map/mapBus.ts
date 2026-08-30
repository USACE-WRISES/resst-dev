// Tiny command channel from UI components to the live map instance
// (the map itself is imperative MapLibre, not React state).

import type { Site } from "../lib/types";
import type { NetworkMode } from "../state/store";

export interface MapCommands {
  /** Fit the view to the given sites' extent. */
  fitToSites(sites: Site[]): void;
  /** Jump/fly to one coordinate. */
  flyTo(lon: number, lat: number, zoom?: number): void;
  /** Drop (replacing any previous) the temporary place-search pin with a named popup. */
  showPlaceMarker(lon: number, lat: number, label: string): void;
  /** Remove the place pin (a site was chosen instead). */
  clearPlaceMarker(): void;
  /** Re-fetch one reference overlay (the Layers panel's Retry). */
  refreshOverlay(key: string): void;
  /** Render the network highlight for an inventory row (requires the national
      core to be loaded — no-ops otherwise) and fit the view to it. */
  highlightNetwork(row: number, mode: NetworkMode): void;
  /** Clear the network highlight. */
  clearNetworkHighlight(): void;
  /** Re-fit the view to the current network highlight (no-op when none). */
  fitNetwork(): void;
  /** Fit the view to arbitrary coordinates (screening's zoom-to-matches). */
  fitToPoints(pts: Array<[number, number]>): void;
}

let current: MapCommands | null = null;

export const registerMapCommands = (cmds: MapCommands | null): void => {
  current = cmds;
};

export const mapCommands = (): MapCommands | null => current;
