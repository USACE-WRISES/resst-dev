// Help overlay — the five guided workflows ported from the current app's Help
// panel (About, By Reservoir, By HUC, By River, By Category): the original
// illustration for each plus the owner-authored description, with the same
// previous/next + named navigation. Content is generated from the archived
// config (scripts/gen-content.mjs); the HTML is owner-authored app content,
// not user input.

import { useEffect, useState } from "react";
import { HELP_VIEWS } from "../config/helpContent.generated";
import { actions } from "../state/store";
import { useFocusTrap } from "../lib/useFocusTrap";

export function HelpOverlay() {
  const [index, setIndex] = useState(0);
  const view = HELP_VIEWS[index];
  const dialogRef = useFocusTrap<HTMLDivElement>();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") actions.setHelpOpen(false);
      if (e.key === "ArrowRight") setIndex((i) => Math.min(HELP_VIEWS.length - 1, i + 1));
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="dialog-scrim" role="presentation" onClick={(e) => e.target === e.currentTarget && actions.setHelpOpen(false)}>
      <div className="dialog help-dialog" role="dialog" aria-modal="true" aria-label="Help and workflows" ref={dialogRef}>
        <div className="help-head">
          <nav className="help-pills" aria-label="Help topics">
            {HELP_VIEWS.map((v, i) => (
              <button
                key={v.id}
                type="button"
                className={i === index ? "pill active" : "pill"}
                aria-current={i === index}
                onClick={() => setIndex(i)}
              >
                {v.name}
              </button>
            ))}
          </nav>
          <button type="button" className="linklike" onClick={() => actions.setHelpOpen(false)} aria-label="Close help">
            ✕ Close
          </button>
        </div>
        <div className="help-body">
          {view.image && (
            <img
              className="help-image"
              src={`${import.meta.env.BASE_URL}${view.image}`}
              alt={`${view.name} workflow illustration`}
            />
          )}
          {/* Owner-authored help content from the archived app config. */}
          <div className="help-text" dangerouslySetInnerHTML={{ __html: view.html }} />
        </div>
        <div className="help-foot">
          <button type="button" className="pager-btn" disabled={index === 0} onClick={() => setIndex(index - 1)}>
            ◀ Previous
          </button>
          <span>
            {index + 1} of {HELP_VIEWS.length}
          </span>
          <button
            type="button"
            className="pager-btn"
            disabled={index === HELP_VIEWS.length - 1}
            onClick={() => setIndex(index + 1)}
          >
            Next ▶
          </button>
        </div>
      </div>
    </div>
  );
}
