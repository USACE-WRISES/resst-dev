// Plain-GeoJSON stand-ins for the static overlay snapshots
// (public/overlays/*.json) — specs route "**/overlays/…json" onto these so
// CI never depends on the real multi-MB files' content. The geometry matches
// what the old quantized fixtures decoded to, anchored to real site
// coordinates where the selection spec counts on them.
// (Not *.spec.* / *.test.ts so neither runner collects this file.)

/** 2°×2° box in the plains — inside the default CONUS viewport. */
export const HUC2_FC = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { huc2: "10", name: "Test basin" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-105, 42],
            [-103, 42],
            [-103, 40],
            [-105, 40],
            [-105, 42],
          ],
        ],
      },
    },
  ],
};

/** The Kansas fixture basin [-96.9,-96.3]×[39.0,39.5] — holds EXACTLY Tuttle
 * Creek (-96.5943, 39.2562), Milford Dam (-96.8978, 39.0833), and Kansas
 * River (-96.3056, 39.1977): 3 sites (verified against sites.json). Carries
 * every huc field so one fixture serves whichever level a test arms. */
export const KANSAS_BASIN_FC = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { huc2: "10", huc4: "1027", huc6: "102701", huc8: "10270101", name: "Test Basin" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-96.9, 39.5],
            [-96.3, 39.5],
            [-96.3, 39.0],
            [-96.9, 39.0],
            [-96.9, 39.5],
          ],
        ],
      },
    },
  ],
};

/** The full test-river course down lon −96.55 from lat 39.8 to 38.5 —
 * 1 site within 10 mi (Tuttle Creek @ 2.4), 4 within 25 (adds Kansas River
 * @ 13.1, Milford @ 18.7, Lake Wabaunsee @ 19.0). */
export const TEST_RIVER_FC = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { NameEn: "Test River" },
      geometry: {
        type: "MultiLineString",
        coordinates: [
          [
            [-96.55, 39.8],
            [-96.55, 38.5],
          ],
        ],
      },
    },
  ],
};
