// Basemap toggle — a single maplibre control button that stacks directly
// under the zoom control (added to "top-right" after NavigationControl).
// A plain IControl: the store's framework-free subscribe/getState cover a
// one-button UI without React plumbing, and the maplibre ctrl-group classes
// provide the native look, focus ring, and hit target. With exactly two
// basemaps the button's accessible name states the action ("Switch basemap
// to …"), which changes with state — no pressed semantics needed.

import type { IControl, Map as MlMap } from "maplibre-gl";
import { actions, getState, subscribe } from "../state/store";
import { BASEMAPS } from "./basemaps";

const LAYERS_ICON =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M12 3 21 8 12 13 3 8Z"/><path d="M3 12l9 5 9-5"/><path d="M3 16l9 5 9-5"/></svg>';

export class BasemapControl implements IControl {
  private container: HTMLDivElement | null = null;
  private button: HTMLButtonElement | null = null;
  private unsubscribe: (() => void) | null = null;

  onAdd(_map: MlMap): HTMLElement {
    const container = document.createElement("div");
    container.className = "maplibregl-ctrl maplibregl-ctrl-group";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "basemap-toggle";
    button.innerHTML = LAYERS_ICON;
    button.addEventListener("click", () => {
      actions.setBasemap(getState().basemap === "usgs" ? "esri" : "usgs");
    });
    container.appendChild(button);
    this.container = container;
    this.button = button;
    this.render();
    this.unsubscribe = subscribe(() => this.render());
    return container;
  }

  onRemove(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.container?.remove();
    this.container = null;
    this.button = null;
  }

  private render(): void {
    const button = this.button;
    if (!button) return;
    const { basemap, basemapStatus } = getState();
    const other = BASEMAPS[basemap === "usgs" ? "esri" : "usgs"];
    const label =
      basemapStatus === "error"
        ? `Switch basemap to ${other.switchLabel} (the last attempt failed — activate to retry)`
        : `Switch basemap to ${other.switchLabel}`;
    button.setAttribute("aria-label", label);
    button.title = label;
    button.dataset.status = basemapStatus ?? "idle";
    button.disabled = basemapStatus === "loading";
  }
}
