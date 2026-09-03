// The report's location figure: a THROWAWAY MapLibre instance that renders
// the dam + its full network on the public-domain USGS basemap, snapshots
// itself to a PNG data URI on 'idle', swaps to a plain <img>, and destroys
// the map. The <img> is what the modal shows from then on, what the download
// serializes, and what print renders — one pixel-identical artifact in all
// three. preserveDrawingBuffer is required for toDataURL and is fine here
// (the instance lives for a second or two). A style error or a 10 s stall
// falls back to a styled placeholder; the live container carries
// data-report-strip so a download can never serialize a half-drawn canvas
// (the footer also disables downloads until this reports "ready"/"failed").

import { useEffect, useRef, useState } from "react";
import type { Map as MlMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { buildUsgsStyle } from "../map/basemaps";
import type { NetworkFeatureSet } from "../map/networkLayer";

// MapLibre is only needed for this snapshot (the interactive map is Leaflet),
// so it loads on demand and stays out of the main bundle.
const loadMaplibre = () => import("maplibre-gl");

export type ReportMapStatus = "pending" | "ready" | "failed";

const NET_UP = "#6a51a3";
const NET_DOWN = "#1b7837";
const NET_MOUTH = "#0b3954";

export function ReportMap({
  lon,
  lat,
  alt,
  features,
  onStatus,
}: {
  lon: number;
  lat: number;
  alt: string;
  features: NetworkFeatureSet | null;
  onStatus: (status: ReportMapStatus) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [png, setPng] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const host: HTMLElement = container;
    let done = false;
    let map: MlMap | null = null;
    const finish = (status: ReportMapStatus, dataUrl?: string) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        map?.remove();
      } catch {
        /* already torn down */
      }
      if (status === "ready" && dataUrl) setPng(dataUrl);
      else setFailed(true);
      onStatus(status);
    };
    const timer = setTimeout(() => finish("failed"), 10000);
    void loadMaplibre().then(
      (ml) => {
        if (done) return;
        start(ml);
      },
      () => finish("failed"),
    );
    function start(ml: typeof import("maplibre-gl")) {
      try {
        map = new ml.Map({
          container: host,
          style: buildUsgsStyle(),
          interactive: false,
          attributionControl: false,
          // MapLibre v5 API: context attributes live under canvasContextAttributes.
          canvasContextAttributes: { preserveDrawingBuffer: true },
          fadeDuration: 0,
          pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
          center: [lon, lat],
          zoom: 8,
        });
      } catch {
        finish("failed");
        return;
      }
      map.on("error", () => {
        // Style/tile-level failure before first idle: fall back rather than stall.
        if (!map?.loaded()) finish("failed");
      });
      map.on("load", () => {
      if (!map || done) return;
      const feats = features ? [...features.features] : [];
      feats.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [lon, lat] },
        properties: { kind: "self" },
      });
      map.addSource("rpt-net", { type: "geojson", data: { type: "FeatureCollection", features: feats } });
      map.addLayer({
        id: "rpt-conn",
        type: "line",
        source: "rpt-net",
        filter: ["==", ["get", "kind"], "conn"],
        paint: { "line-color": NET_DOWN, "line-width": 1.75, "line-dasharray": [2, 2], "line-opacity": 0.85 },
      });
      const dot = (id: string, kind: string, color: string, radius: number) =>
        map!.addLayer({
          id,
          type: "circle",
          source: "rpt-net",
          filter: ["==", ["get", "kind"], kind],
          paint: {
            "circle-radius": radius,
            "circle-color": color,
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 1,
            "circle-opacity": 0.92,
          },
        });
      dot("rpt-up", "up", NET_UP, 3.5);
      dot("rpt-down", "down", NET_DOWN, 5);
      dot("rpt-mouth", "mouth", NET_MOUTH, 6);
      // The selected dam in the app's site symbology: red fill, yellow ring.
      map.addLayer({
        id: "rpt-self",
        type: "circle",
        source: "rpt-net",
        filter: ["==", ["get", "kind"], "self"],
        paint: {
          "circle-radius": 7,
          "circle-color": "#e03131",
          "circle-stroke-color": "#ffd43b",
          "circle-stroke-width": 2,
        },
      });
      const coords = features?.coords ?? [];
      if (coords.length > 1) {
        const bounds = coords.reduce((b, p) => b.extend(p), new ml.LngLatBounds(coords[0], coords[0]));
        map.fitBounds(bounds, { padding: 48, maxZoom: 10, duration: 0 });
      }
      map.once("idle", () => {
        if (!map || done) return;
        try {
          finish("ready", map.getCanvas().toDataURL("image/png"));
        } catch {
          finish("failed");
        }
      });
      });
    }
    return () => {
      // Unmount: tear down silently — no state writes after unmount.
      done = true;
      clearTimeout(timer);
      try {
        map?.remove();
      } catch {
        /* already torn down */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (png) return <img className="report-map" src={png} alt={alt} />;
  if (failed) return <div className="report-map-fallback">Map image unavailable.</div>;
  return <div className="report-map" ref={containerRef} data-report-strip aria-label="Rendering the location map…" />;
}
