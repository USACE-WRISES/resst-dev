// The one place Leaflet is imported. Everything under src/map/dom reaches it
// through here, and the panel is loaded by a dynamic import (MapHost), so
// Leaflet and its stylesheet compile to their own chunk.

import * as L from "leaflet";
import "leaflet/dist/leaflet.css";

export { L };
