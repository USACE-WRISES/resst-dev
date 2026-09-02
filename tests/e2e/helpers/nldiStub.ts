// The USGS NLDI drainage-area calls (position lookup, then basin polygon),
// stubbed with a square around Tuttle Creek. Shared by the network spec and
// the Leaflet map spec. Not collected as a spec (helpers/ is outside both
// runners' patterns).
import type { Page } from "@playwright/test";

export const BASIN_SQUARE = {
  type: "Feature",
  properties: {},
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [-96.9, 39.0],
        [-96.3, 39.0],
        [-96.3, 39.5],
        [-96.9, 39.5],
        [-96.9, 39.0],
      ],
    ],
  },
};

/** Stub the two USGS NLDI calls (position lookup, basin polygon). */
export async function stubNldi(page: Page, opts: { fail?: boolean } = {}): Promise<void> {
  await page.route("**/api.water.usgs.gov/nldi/**", (route) => {
    if (opts.fail) return route.fulfill({ status: 503, body: "unavailable" });
    const url = route.request().url();
    const body = url.includes("/position")
      ? { type: "FeatureCollection", features: [{ type: "Feature", properties: { comid: 111 }, geometry: null }] }
      : { type: "FeatureCollection", features: [BASIN_SQUARE] };
    return route.fulfill({ status: 200, contentType: "application/geo+json", body: JSON.stringify(body) });
  });
}
