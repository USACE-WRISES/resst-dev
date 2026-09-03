// The national inventory layer on the Leaflet map: all ~57k modeled
// reservoirs drawn on one canvas from typed arrays — one Path2D per colour
// bucket, culled to the view, redrawn at settle. During a zoom animation the
// canvas is CSS-transformed the way Leaflet's image overlays are, so a
// gesture never waits on a redraw (and, under remote browser isolation, the
// canvas is streamed once per settle rather than per frame). Styling mirrors
// the MapLibre nat-circles layer through the pure helpers in nationalLayer.ts.
//
// Clicks are not the canvas's business: it is pointer-transparent, and the
// panel asks hitTest() for the row under a map click after the site markers
// (which sit above it) have had their say.

import { L } from "./leaflet";
import { FLAG, type SedimentCore } from "../../sediment/types";
import { matchesRow, type ScreeningState } from "../../sediment/screen";
import type { NationalMetric } from "../../state/store";
import { colorForRow, natOpacity, natRadius, natStrokeWidth, radiusScale } from "../nationalLayer";
import { mz } from "./zoom";

type DrawFn = (ctx: CanvasRenderingContext2D, width: number, height: number) => void;

/** A full-view canvas that follows the map like an image overlay. */
class ViewCanvas extends L.Layer {
  private canvas: HTMLCanvasElement | null = null;
  private bounds: L.LatLngBounds | null = null;
  private zoomAt = 0;

  constructor(
    private readonly pane: string,
    private readonly draw: DrawFn,
  ) {
    super();
  }

  onAdd(map: L.Map): this {
    const c = L.DomUtil.create("canvas", "leaflet-zoom-animated national-canvas") as HTMLCanvasElement;
    map.getPane(this.pane)?.appendChild(c);
    this.canvas = c;
    this.refresh();
    return this;
  }

  onRemove(): this {
    this.canvas?.remove();
    this.canvas = null;
    return this;
  }

  getEvents(): { [name: string]: L.LeafletEventHandlerFn } {
    const events: { [name: string]: L.LeafletEventHandlerFn } = {
      viewreset: this.refresh,
      moveend: this.refresh,
      resize: this.refresh,
    };
    if ((this._map as unknown as { _zoomAnimated?: boolean })._zoomAnimated) events.zoomanim = this.animateZoom;
    return events;
  }

  /** Re-anchor the canvas to the current view and redraw it. */
  refresh = (): void => {
    const map = this._map;
    const c = this.canvas;
    if (!map || !c) return;
    const size = map.getSize();
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(size.x * dpr);
    c.height = Math.round(size.y * dpr);
    c.style.width = `${size.x}px`;
    c.style.height = `${size.y}px`;
    L.DomUtil.setPosition(c, map.containerPointToLayerPoint(L.point(0, 0)));
    this.bounds = map.getBounds();
    this.zoomAt = map.getZoom();
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.x, size.y);
    this.draw(ctx, size.x, size.y);
  };

  private animateZoom = (ev: L.LeafletEvent): void => {
    const e = ev as L.ZoomAnimEvent;
    const map = this._map as unknown as L.Map & {
      _latLngBoundsToNewLayerBounds(b: L.LatLngBounds, zoom: number, center: L.LatLng): L.Bounds;
    };
    const c = this.canvas;
    if (!c || !this.bounds) return;
    const scale = map.getZoomScale(e.zoom, this.zoomAt);
    const offset = map._latLngBoundsToNewLayerBounds(this.bounds, e.zoom, e.center).min;
    if (offset) L.DomUtil.setTransform(c, offset, scale);
  };
}

/** Extra pixels around a dot that still count as a hit. */
const HIT_SLACK_PX = 2;

export class NationalLayer {
  private readonly view: ViewCanvas;
  private core: SedimentCore | null = null;
  private n = 0;
  /** Core row per point (mouth nodes excluded). */
  private rows = new Int32Array(0);
  /** World pixels at Leaflet zoom 0. */
  private wx = new Float64Array(0);
  private wy = new Float64Array(0);
  private rs = new Float32Array(0);
  private colorIdx = new Uint8Array(0);
  private colors: string[] = [];
  private mask: Uint8Array | null = null;
  /** Last draw, container px (NaN when culled) and radius, for hit-testing. */
  private sx = new Float32Array(0);
  private sy = new Float32Array(0);
  private sr = new Float32Array(0);
  private visible = false;
  private drawnCount = 0;
  private metric: NationalMetric = "pctLost2025";

  constructor(private readonly map: L.Map) {
    this.view = new ViewCanvas("national", (ctx, w, h) => this.draw(ctx, w, h));
  }

  /** Points drawn in the last redraw; 0 while hidden. */
  get drawn(): number {
    return this.visible ? this.drawnCount : 0;
  }

  get isVisible(): boolean {
    return this.visible;
  }

  get currentMetric(): NationalMetric {
    return this.metric;
  }

  /** Whether a screening mask is hiding non-matching dots. */
  get isMasked(): boolean {
    return this.mask !== null;
  }

  setVisible(on: boolean): void {
    if (on === this.visible) return;
    this.visible = on;
    if (on) this.view.addTo(this.map);
    else this.view.remove();
  }

  /** Feed the core once (memoized by identity); recolours for the current metric. */
  setCore(core: SedimentCore): void {
    if (core === this.core) return;
    this.core = core;
    let n = 0;
    for (let i = 0; i < core.n; i++) if (!(core.flags[i] & FLAG.MOUTH)) n++;
    this.n = n;
    this.rows = new Int32Array(n);
    this.wx = new Float64Array(n);
    this.wy = new Float64Array(n);
    this.rs = new Float32Array(n);
    this.sx = new Float32Array(n);
    this.sy = new Float32Array(n);
    this.sr = new Float32Array(n);
    let k = 0;
    for (let i = 0; i < core.n; i++) {
      if (core.flags[i] & FLAG.MOUTH) continue;
      const p = L.CRS.EPSG3857.latLngToPoint(L.latLng(core.lat[i], core.lon[i]), 0);
      this.rows[k] = i;
      this.wx[k] = p.x;
      this.wy[k] = p.y;
      this.rs[k] = radiusScale(core, i);
      k++;
    }
    this.mask = null;
    this.recolor();
    this.redraw();
  }

  setMetric(metric: NationalMetric): void {
    if (metric === this.metric && this.colors.length) return;
    this.metric = metric;
    this.recolor();
    this.redraw();
  }

  /** Screening hides non-matching dots (crisper than fading at 57k scale). */
  setScreening(s: ScreeningState, documentedShortIds: ReadonlySet<number>): void {
    const core = this.core;
    if (!core) return;
    if (!s.active) {
      if (this.mask === null) return;
      this.mask = null;
    } else {
      const mask = new Uint8Array(this.n);
      for (let k = 0; k < this.n; k++) mask[k] = matchesRow(core, documentedShortIds, this.rows[k], s) ? 1 : 0;
      this.mask = mask;
    }
    this.redraw();
  }

  /** The core row of the drawn dot under a container point, or null. */
  hitTest(pt: L.Point): number | null {
    if (!this.visible || !this.core) return null;
    let best = -1;
    let bestD = Infinity;
    for (let k = 0; k < this.n; k++) {
      const x = this.sx[k];
      if (x !== x) continue; // NaN: culled or masked
      const dx = x - pt.x;
      const dy = this.sy[k] - pt.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= this.sr[k] + HIT_SLACK_PX && d < bestD) {
        bestD = d;
        best = k;
      }
    }
    return best < 0 ? null : this.rows[best];
  }

  remove(): void {
    this.view.remove();
    this.visible = false;
  }

  private recolor(): void {
    const core = this.core;
    if (!core) return;
    const index = new Map<string, number>();
    const colors: string[] = [];
    const idx = new Uint8Array(this.n);
    for (let k = 0; k < this.n; k++) {
      const c = colorForRow(core, this.rows[k], this.metric);
      let i = index.get(c);
      if (i === undefined) {
        i = colors.length;
        colors.push(c);
        index.set(c, i);
      }
      idx[k] = i;
    }
    this.colors = colors;
    this.colorIdx = idx;
  }

  private redraw(): void {
    if (this.visible) this.view.refresh();
  }

  private draw(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const map = this.map;
    this.drawnCount = 0;
    if (!this.core) return;
    const zoom = map.getZoom();
    const mapZoom = mz(zoom);
    const scale = map.getZoomScale(zoom, 0);
    const origin = map.getPixelOrigin();
    const pane = map.layerPointToContainerPoint(L.point(0, 0));
    const ox = pane.x - origin.x;
    const oy = pane.y - origin.y;
    const paths = this.colors.map(() => new Path2D());
    const mask = this.mask;
    let drawn = 0;
    for (let k = 0; k < this.n; k++) {
      if (mask && !mask[k]) {
        this.sx[k] = NaN;
        continue;
      }
      const x = this.wx[k] * scale + ox;
      const y = this.wy[k] * scale + oy;
      const r = natRadius(this.rs[k], mapZoom);
      if (x < -r || y < -r || x > width + r || y > height + r) {
        this.sx[k] = NaN;
        continue;
      }
      this.sx[k] = x;
      this.sy[k] = y;
      this.sr[k] = r;
      const p = paths[this.colorIdx[k]];
      p.moveTo(x + r, y);
      p.arc(x, y, r, 0, Math.PI * 2);
      drawn++;
    }
    this.drawnCount = drawn;
    const stroke = natStrokeWidth(mapZoom);
    ctx.globalAlpha = natOpacity(mapZoom);
    ctx.lineWidth = stroke;
    ctx.strokeStyle = "#ffffff";
    for (let i = 0; i < paths.length; i++) {
      ctx.fillStyle = this.colors[i];
      ctx.fill(paths[i]);
      if (stroke > 0) ctx.stroke(paths[i]);
    }
    ctx.globalAlpha = 1;
  }
}
