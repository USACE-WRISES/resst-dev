// Mounts the map engine this page load decided on (engine.ts): the MapLibre
// panel, or the Leaflet panel behind a lazy import so Leaflet stays out of the
// main bundle. Renders no wrapper of its own — the panels' .map-panel-wrap is
// the .center-stack grid child, and layout code measures it.

import { lazy, Suspense } from "react";
import type { MapEngine } from "./engine";
import { MapPanel, type MapPanelProps } from "./MapPanel";

const DomMapPanel = lazy(() => import("./dom/DomMapPanel"));

export function MapHost({ engine, ...props }: MapPanelProps & { engine: MapEngine }) {
  if (engine === "maplibre") return <MapPanel {...props} />;
  return (
    <Suspense
      fallback={
        <div className="map-panel-wrap">
          <div className="map-panel" role="application" aria-label="Map of reservoir sediment sites" aria-busy="true" />
        </div>
      }
    >
      <DomMapPanel {...props} />
    </Suspense>
  );
}
