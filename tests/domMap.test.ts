// The map-engine choice and the Leaflet panel's pure helpers. Nothing here may
// import Leaflet itself (it touches window at import time; vitest runs in node).
import { describe, expect, it } from "vitest";
import { classifyRenderer } from "../src/lib/renderClass";
import { classifyRenderer as diagClassifyRenderer, DOM_TRIAL_LABEL_ZOOM } from "../src/diag/probes";
import { parseEngine, resolveEngine } from "../src/map/engine";
import { lz, mz } from "../src/map/dom/zoom";
import {
  LABEL_CHAR_PX,
  LABEL_GAP_PX,
  LABEL_H_PX,
  LABEL_PAD_PX,
  boxesOverlap,
  labelBox,
  placeLabels,
} from "../src/map/dom/labelCollision";

describe("parseEngine", () => {
  it("accepts the two engines and nothing else", () => {
    expect(parseEngine("leaflet")).toBe("leaflet");
    expect(parseEngine("maplibre")).toBe("maplibre");
    for (const bad of [null, undefined, "", "LEAFLET", "webgl", "dom"]) expect(parseEngine(bad)).toBeNull();
  });
});

describe("resolveEngine", () => {
  it("lets the URL override the stored choice, and the stored choice skip the probe", () => {
    let probed = 0;
    const probe = () => {
      probed += 1;
      return "software" as const;
    };
    expect(resolveEngine("maplibre", "leaflet", probe)).toBe("maplibre");
    expect(resolveEngine(null, "maplibre", probe)).toBe("maplibre");
    expect(resolveEngine("junk", "leaflet", probe)).toBe("leaflet");
    expect(probed).toBe(0);
  });

  it("falls back to the software-WebGL rule only when nothing explicit decides", () => {
    expect(resolveEngine(null, null, () => "software")).toBe("leaflet");
    expect(resolveEngine(null, null, () => "hardware")).toBe("maplibre");
    // A masked renderer string is not evidence of software rendering.
    expect(resolveEngine(null, null, () => "unknown")).toBe("maplibre");
  });
});

describe("renderClass", () => {
  it("is the one classifier the diagnostics page also uses", () => {
    expect(diagClassifyRenderer).toBe(classifyRenderer);
    expect(classifyRenderer("ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))")).toBe("software");
    expect(classifyRenderer("ANGLE (Intel, Intel(R) UHD Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)")).toBe("hardware");
    expect(classifyRenderer(null)).toBe("unknown");
  });
});

describe("zoom basis", () => {
  it("converts between Leaflet's 256 px and MapLibre's 512 px zoom bases", () => {
    expect(lz(8)).toBe(9);
    expect(mz(9)).toBe(8);
    expect(mz(lz(6.4))).toBeCloseTo(6.4, 10);
    // The trial's label zoom and the app's label threshold (MapLibre 6) agree.
    expect(lz(6)).toBe(DOM_TRIAL_LABEL_ZOOM);
  });
});

describe("label placement", () => {
  it("sizes a label from its text and hangs it above the marker", () => {
    const b = labelBox({ x: 100, y: 200 }, "Tuttle");
    expect(b.w).toBeCloseTo(6 * LABEL_CHAR_PX + LABEL_PAD_PX, 10);
    expect(b.h).toBe(LABEL_H_PX);
    expect(b.x).toBeCloseTo(100 - b.w / 2, 10);
    expect(b.y).toBe(200 - LABEL_GAP_PX - LABEL_H_PX);
  });

  it("treats boxes that only touch along an edge as clear of each other", () => {
    const a = { x: 0, y: 0, w: 10, h: 10 };
    expect(boxesOverlap(a, { x: 10, y: 0, w: 10, h: 10 })).toBe(false);
    expect(boxesOverlap(a, { x: 9.9, y: 0, w: 10, h: 10 })).toBe(true);
    expect(boxesOverlap(a, { x: 0, y: 10, w: 10, h: 10 })).toBe(false);
  });

  it("keeps the first label of an overlapping pair, in input order, up to the cap", () => {
    const items = [
      { id: "a", box: { x: 0, y: 0, w: 10, h: 10 } },
      { id: "b", box: { x: 5, y: 5, w: 10, h: 10 } }, // overlaps a
      { id: "c", box: { x: 50, y: 0, w: 10, h: 10 } },
      { id: "d", box: { x: 80, y: 0, w: 10, h: 10 } },
    ];
    expect(placeLabels(items, (i) => i.box).map((i) => i.id)).toEqual(["a", "c", "d"]);
    expect(placeLabels(items, (i) => i.box, 2).map((i) => i.id)).toEqual(["a", "c"]);
    expect(placeLabels([], (i: { box: { x: number; y: number; w: number; h: number } }) => i.box)).toEqual([]);
  });
});
