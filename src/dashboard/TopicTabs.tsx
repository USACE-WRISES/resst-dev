// The Dashboard's headline tiles, which are also its tabs: each tile names a
// topic and shows its headline number, and the chosen one owns the panel
// below. The WAI-ARIA tabs pattern: one tab in the tab order, and the arrow
// keys (Home, End) move between the tabs and select them.

import { useRef, type KeyboardEvent } from "react";
import { actions, type DashTopic } from "../state/store";
import { ChevronDown, ChevronRight } from "../components/icons";

export interface TopicTile {
  topic: DashTopic;
  /** The tab's name. */
  label: string;
  /** The headline number. */
  value: string;
  unit: string;
  note: string;
}

export const tabId = (topic: DashTopic): string => `dash-tab-${topic}`;
export const panelId = (topic: DashTopic): string => `dash-panel-${topic}`;

export function TopicTabs({ tiles, active }: { tiles: readonly TopicTile[]; active: DashTopic }) {
  const listRef = useRef<HTMLDivElement>(null);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = tiles.findIndex((t) => t.topic === active);
    const n = tiles.length;
    const j =
      e.key === "ArrowRight" ? (i + 1) % n : e.key === "ArrowLeft" ? (i - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (j < 0) return;
    e.preventDefault();
    actions.setDashboardTopic(tiles[j].topic);
    listRef.current?.querySelector<HTMLButtonElement>(`#${tabId(tiles[j].topic)}`)?.focus();
  };
  return (
    <div className="dash-topics" role="tablist" aria-label="Dashboard topics" ref={listRef} onKeyDown={onKeyDown}>
      {tiles.map((t) => {
        const selected = t.topic === active;
        const id = tabId(t.topic);
        return (
          <button
            key={t.topic}
            type="button"
            role="tab"
            id={id}
            className="dash-topic"
            aria-selected={selected}
            aria-controls={panelId(t.topic)}
            aria-labelledby={`${id}-l ${id}-v ${id}-u`}
            aria-describedby={`${id}-n`}
            tabIndex={selected ? 0 : -1}
            onClick={() => actions.setDashboardTopic(t.topic)}
          >
            <span className="dash-topic-head">
              <span id={`${id}-l`} className="dash-topic-label">
                {t.label}
              </span>
              {/* Down on the open topic ("shown below"), right on the others ("go here"). */}
              {selected ? <ChevronDown className="dash-topic-chev" /> : <ChevronRight className="dash-topic-chev" />}
            </span>
            <span id={`${id}-v`} className="dash-topic-value">
              {t.value}
            </span>
            <span id={`${id}-u`} className="dash-topic-unit">
              {t.unit}
            </span>
            <span id={`${id}-n`} className="dash-topic-note">
              {t.note}
            </span>
          </button>
        );
      })}
    </div>
  );
}
