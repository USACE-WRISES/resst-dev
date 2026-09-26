// Ways from the Dashboard and the Library back to the map: a site, a
// reservoir, a set of sites, or a Screening question. The map stays laid out
// under the other views, so a selection made here flies the camera at once;
// switching views then reveals it in place.

import type { Site } from "../lib/types";
import { mapCommands } from "../map/mapBus";
import type { ScreeningState } from "../sediment/screen";
import type { SedimentCore } from "../sediment/types";
import { actions } from "./store";

export function showSiteOnMap(siteId: string): void {
  actions.selectSite(siteId);
  actions.setView("map");
}

export function showSitesOnMap(sites: readonly Site[]): void {
  actions.selectSites(sites.map((s) => s.site_id));
  mapCommands()?.fitToSites([...sites]);
  actions.setView("map");
}

/** A documented dam opens its site (the first when several share it); any other its reservoir details. */
export function showReservoirOnMap(core: SedimentCore, row: number, sitesBy: ReadonlyMap<number, string[]>): void {
  const siteIds = sitesBy.get(core.ids[row]);
  if (siteIds && siteIds.length > 0) actions.selectSite(siteIds[0]);
  else actions.selectReservoir(String(core.ids[row]));
  actions.setView("map");
}

/** Open the Map view with these criteria in the docked Screening panel and the national layer on. */
export function openInScreening(criteria: ScreeningState): void {
  actions.setNationalLayer(true);
  actions.setScreeningCriteria(criteria);
  actions.setScreeningOpen(true);
  actions.setView("map");
}
