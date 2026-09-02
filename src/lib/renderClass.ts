// Which kind of WebGL renderer a page context got. Shared by the ?diag=1
// report and the map engine choice; DOM-free so vitest's node environment can
// exercise it and so the main bundle never absorbs the diagnostics module.

export type RenderClass = "hardware" | "software" | "unknown";

// Chrome names its CPU fallbacks in the unmasked renderer string, and ANGLE
// wraps them: "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device ...))". Match
// on substrings, never equality.
const SOFTWARE_MARKERS = ["swiftshader", "llvmpipe", "softpipe", "basic render", "software"];

/** Classify a WEBGL_debug_renderer_info string. Null or empty means masked. */
export function classifyRenderer(renderer: string | null | undefined): RenderClass {
  if (!renderer) return "unknown";
  const s = renderer.toLowerCase();
  if (SOFTWARE_MARKERS.some((m) => s.includes(m))) return "software";
  return "hardware";
}
