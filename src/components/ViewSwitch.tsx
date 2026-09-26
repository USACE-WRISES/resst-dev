// The header's view switch: Map · Dashboard · Library, one segmented control
// at the true centre of the header (the HYPE app's 2D map / 3D view control,
// on this app's tokens). Plain buttons with aria-pressed; the labels give way
// to icons on phones, where the aria-label keeps each name.

import { actions } from "../state/store";
import { VIEWS, type View } from "../state/viewRoute";
import { BookIcon, ChartIcon, MapIcon } from "./icons";

const LABEL: Record<View, string> = { map: "Map", dashboard: "Dashboard", library: "Library" };
const ICON: Record<View, typeof MapIcon> = { map: MapIcon, dashboard: ChartIcon, library: BookIcon };

export function ViewSwitch({ view }: { view: View }) {
  return (
    <div className="view-switch" role="group" aria-label="View">
      {VIEWS.map((v) => {
        const Icon = ICON[v];
        return (
          <button
            key={v}
            type="button"
            className="view-btn"
            aria-pressed={view === v}
            aria-label={LABEL[v]}
            onClick={() => actions.setView(v)}
          >
            <Icon size={15} />
            <span className="view-btn-label">{LABEL[v]}</span>
          </button>
        );
      })}
    </div>
  );
}
