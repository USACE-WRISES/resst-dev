// Tiny command channel from UI components to the live map instance
// (the map itself is imperative MapLibre, not React state).

import type { Site } from "../lib/types";

export interface MapCommands {
  /** Fit the view to the given sites' extent. */
  fitToSites(sites: Site[]): void;
  /** Jump/fly to one coordinate. */
  flyTo(lon: number, lat: number, zoom?: number): void;
}

let current: MapCommands | null = null;

export const registerMapCommands = (cmds: MapCommands | null): void => {
  current = cmds;
};

export const mapCommands = (): MapCommands | null => current;
