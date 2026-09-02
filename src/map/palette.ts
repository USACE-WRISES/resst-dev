// Map colors for the sedimentation features, centralized so the layer paint,
// the Legend swatches, and the CSS custom properties stay one set of values.
// Chosen to collide with nothing already on the map: sites are red/yellow,
// selection rings cyan, Select highlights teal (#00a0b0). The purple/green
// upstream/downstream pair reads apart under the common color-vision
// deficiencies.

/** Upstream dams in the network highlight. */
export const NET_UP = "#6a51a3";
/** Downstream dams + the schematic downstream connector. */
export const NET_DOWN = "#1b7837";
/** River-mouth nodes. */
export const NET_MOUTH = "#0b3954";
/** Select-tool sketch and highlight (mirrors --select in styles.css). */
export const SELECT = "#00a0b0";
