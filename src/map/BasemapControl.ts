// Pass-through control: MapPanel owns the element and portals the React
// picker into it, while maplibre handles placement — the element carries
// `maplibregl-ctrl` (which supplies float/clear/margin, so it stacks
// automatically under the zoom buttons, plus the pointer-events the corner
// container switches off) but deliberately NOT `maplibregl-ctrl-group`,
// whose `.maplibregl-ctrl-group button` rule out-specifies ours and would
// force display:block, a 29px box, and outline:none onto the trigger.

import type { IControl, Map as MlMap } from "maplibre-gl";

export class BasemapControl implements IControl {
  constructor(private readonly element: HTMLElement) {}

  onAdd(_map: MlMap): HTMLElement {
    return this.element;
  }

  onRemove(): void {
    this.element.remove();
  }
}
