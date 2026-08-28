// Generates map-view and help-content config from the archived Experience
// Builder config + web map, and copies the referenced images into public/:
//
//   src/config/mapViews.generated.ts   — the six bookmark views (name, lon/lat
//                                        bounds, overlay visibility, thumbnail)
//   src/config/helpContent.generated.ts — the five help workflow views
//                                        (name, image, description HTML)
//   public/views/*.jpg, public/help/*.png
//
//   node scripts/gen-content.mjs

import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";

const cfg = JSON.parse(await readFile("RESST-migration/01-experience-configuration/03-resst-published-config.json", "utf8"));
const webmap = JSON.parse(await readFile("RESST-migration/02-web-map-configuration/resst-web-map-data.json", "utf8"));

// ------------------------------------------------------------- map views
// Overlay keys used by src/map/overlays.ts, mapped from the web map's layer ids.
const OVERLAY_BY_JIMU_ID = {
  "1988015e9a1-layer-14": "nid",
  "1987bbff827-layer-14": "gauges",
  "1987bc33d93-layer-17": "ssurgo",
  "1987aba451f-layer-5": "rivers",
};
// The HUC group's sublayers: map web-map sublayer id -> huc level via titles.
const hucGroup = webmap.operationalLayers.find((l) => l.title === "USGS HUCs");
const HUC_BY_SUBID = {};
for (const sub of hucGroup.layers) {
  const m = sub.title.match(/HUC (\d)/);
  if (m) HUC_BY_SUBID[sub.id] = `huc${m[1]}`;
}

const R = 6378137;
const mercToLon = (x) => (x / R) * (180 / Math.PI);
const mercToLat = (y) => ((2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * 180) / Math.PI;

const views = [];
const thumbCopies = [];
for (const b of cfg.widgets.widget_185.config.bookmarks) {
  const e = b.extent;
  const bounds = [mercToLon(e.xmin), mercToLat(e.ymin), mercToLon(e.xmax), mercToLat(e.ymax)].map((v) => +v.toFixed(4));
  const overlays = { nid: false, gauges: false, ssurgo: false, rivers: false, huc2: false, huc4: false, huc6: false, huc8: false };
  for (const [jimuId, lc] of Object.entries(b.layersConfig ?? {})) {
    const key = OVERLAY_BY_JIMU_ID[jimuId];
    if (key) overlays[key] = !!lc.visibility;
    if (jimuId === "1987bc3717e-layer-18") {
      // HUC group: the group itself must be visible AND a sublayer on.
      for (const [subId, sub] of Object.entries(lc.layers ?? {})) {
        const hk = HUC_BY_SUBID[subId];
        if (hk && lc.visibility && sub.visibility) overlays[hk] = true;
      }
    }
  }
  const thumbFile = b.snapParam?.fileName ?? null;
  if (thumbFile) thumbCopies.push(thumbFile);
  views.push({
    id: b.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    name: b.name,
    bounds,
    overlays,
    thumb: thumbFile ? `views/${thumbFile}` : null,
  });
}

// ------------------------------------------------------------- help views
// Resolve each help view's widgets by walking the layout tree, then pick its
// image widget's resource and its text widgets' HTML.
const layouts = cfg.layouts ?? {};
const widgets = cfg.widgets ?? {};

function widgetsInLayout(layoutId, acc) {
  const layout = layouts[layoutId];
  if (!layout) return acc;
  for (const item of Object.values(layout.content ?? {})) {
    if (item.widgetId) {
      acc.add(item.widgetId);
      const w = widgets[item.widgetId];
      // Layout widgets (grid, row, fixed, sidebar…) carry nested layouts.
      for (const sub of Object.values(w?.layouts ?? {})) {
        for (const lid of Object.values(sub)) widgetsInLayout(lid, acc);
      }
    }
    if (item.sectionId) acc.add(item.sectionId);
  }
  return acc;
}

const NAV_ORDER = ["About", "By Reservoir", "By HUC", "By River", "By Category"];
const viewsById = cfg.views ?? {};
const helpViews = [];
const helpCopies = [];
for (const [viewId, view] of Object.entries(viewsById)) {
  if (!NAV_ORDER.includes(view.label)) continue;
  const acc = new Set();
  for (const lid of Object.values(view.layout ?? {})) widgetsInLayout(lid, acc);
  const ws = [...acc].map((id) => widgets[id]).filter(Boolean);
  const imageWidget = ws.find((w) => w.uri === "widgets/common/image/");
  const textWidgets = ws.filter((w) => w.uri === "widgets/common/text/");
  const imgFile = imageWidget?.config?.functionConfig?.imageParam?.fileName ?? null;
  if (imgFile) helpCopies.push({ file: imgFile, widgetId: imageWidget.id ?? null, prefix: imageWidget?.config?.functionConfig?.imageParam?.resourcesPrefix ?? "" });
  const html = textWidgets
    .map((w) => w.config?.text ?? "")
    .join("\n")
    // strip EXB zero-width markers and expression wrappers; keep simple markup
    .replaceAll("﻿", "");
  helpViews.push({ order: NAV_ORDER.indexOf(view.label), id: viewId, name: view.label, image: imgFile ? `help/${imgFile}` : null, html });
}
helpViews.sort((a, b) => a.order - b.order);

// ------------------------------------------------------------- write files
await mkdir("public/views", { recursive: true });
await mkdir("public/help", { recursive: true });
for (const f of thumbCopies) {
  await copyFile(`RESST-migration/04-assets/images/widget_185/${f}`, `public/views/${f}`);
}
// Locate each help image inside the assets tree (prefix folders vary by widget).
const { readdir } = await import("node:fs/promises");
const assetDirs = (await readdir("RESST-migration/04-assets/images", { withFileTypes: true }))
  .filter((d) => d.isDirectory())
  .map((d) => `RESST-migration/04-assets/images/${d.name}`);
for (const c of helpCopies) {
  let src = null;
  for (const dir of assetDirs) {
    const files = await readdir(dir);
    if (files.includes(c.file)) {
      src = `${dir}/${c.file}`;
      break;
    }
  }
  if (!src) throw new Error(`help image not found in assets: ${c.file}`);
  await copyFile(src, `public/help/${c.file}`);
}

const banner = `// GENERATED by scripts/gen-content.mjs — do not edit by hand.
// Source: the archived Experience Builder config (bookmark widget_185,
// help section views) and web map. Regenerate: node scripts/gen-content.mjs
`;
await writeFile(
  "src/config/mapViews.generated.ts",
  `${banner}
export interface MapViewDef {
  id: string;
  name: string;
  /** [west, south, east, north] in lon/lat. */
  bounds: [number, number, number, number];
  overlays: Record<string, boolean>;
  thumb: string | null;
}

export const MAP_VIEWS: MapViewDef[] = ${JSON.stringify(views, null, 2)};
`,
  "utf8",
);
await writeFile(
  "src/config/helpContent.generated.ts",
  `${banner}
export interface HelpViewDef {
  id: string;
  name: string;
  image: string | null;
  html: string;
}

export const HELP_VIEWS: HelpViewDef[] = ${JSON.stringify(helpViews.map(({ order, ...v }) => v), null, 2)};
`,
  "utf8",
);
console.log(`map views: ${views.map((v) => v.name).join(", ")}`);
console.log(`help views: ${helpViews.map((v) => `${v.name}${v.image ? " [img]" : " [NO IMG]"} html:${v.html.length}ch`).join(" | ")}`);
