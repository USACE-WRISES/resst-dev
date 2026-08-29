// Help overlay — the five guided workflows (About, By Reservoir, By HUC,
// By River, By Category) in a wide, dense layout: pill navigation, an intro
// band (goal/when/result facets beside the screenshot), then compact numbered
// steps in columns. Content is hand-authored in config/helpContent.ts; its
// Rich fields are owner-authored app content, not user input.

import { useEffect, useRef, useState } from "react";
import { HELP_VIEWS } from "../config/helpContent";
import { actions } from "../state/store";
import { useFocusTrap } from "../lib/useFocusTrap";

/** Owner-authored rich leaf (see the helpContent.ts header for allowed tags). */
function Rich({ as: Tag = "p", className, html }: { as?: "p" | "dd" | "span"; className?: string; html: string }) {
  return <Tag className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function HelpOverlay() {
  const [index, setIndex] = useState(0);
  const view = HELP_VIEWS[index];
  const dialogRef = useFocusTrap<HTMLDivElement>();
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") actions.setHelpOpen(false);
      if (e.key === "ArrowRight") setIndex((i) => Math.min(HELP_VIEWS.length - 1, i + 1));
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Each topic starts at its top, not wherever the last one was scrolled to.
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [index]);

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
        {/* tabIndex + region: the body scrolls, so it must be keyboard-reachable. */}
        <div className="help-body" role="region" aria-label={`${view.name} help content`} tabIndex={0} ref={bodyRef}>
          <h2 className="help-title">{view.title}</h2>
          <div className="help-band">
            <div className="help-band-main">
              {view.lead?.map((p, i) => <Rich key={i} html={p} />)}
              {view.facets && (
                <dl className="help-facets">
                  <div>
                    <dt>Goal</dt>
                    <Rich as="dd" html={view.facets.goal} />
                  </div>
                  <div>
                    <dt>When to use</dt>
                    <Rich as="dd" html={view.facets.when} />
                  </div>
                  <div>
                    <dt>You get</dt>
                    <Rich as="dd" html={view.facets.get} />
                  </div>
                  {view.facets.tip && (
                    <div>
                      <dt>Tip</dt>
                      <Rich as="dd" html={view.facets.tip} />
                    </div>
                  )}
                </dl>
              )}
            </div>
            {view.image && (
              <img className="help-image" src={`${import.meta.env.BASE_URL}${view.image.src}`} alt={view.image.alt} />
            )}
          </div>
          {view.steps && (
            // role="list" restores the semantics list-style:none strips in some AT.
            <ol className="help-steps" role="list">
              {view.steps.map((s, i) => (
                <li key={i}>
                  <div className="step-title">{s.title}</div>
                  <Rich className="step-body" html={s.body} />
                  {s.notes?.map((n, j) => (
                    <p key={j} className="step-note">
                      <b>{n.label}:</b> <Rich as="span" html={n.text} />
                    </p>
                  ))}
                </li>
              ))}
            </ol>
          )}
          {view.credits && (
            <div className="help-credits">
              <h3>Credits</h3>
              {view.credits.map((c, i) => (
                <Rich key={i} html={c} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
