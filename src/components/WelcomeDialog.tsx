// Welcome dialog — text ported verbatim from the current application's
// splash (captured live 2026-08-28), with the same "Don't show this again"
// behavior implemented via localStorage. One sentence was appended for the
// sedimentation expansion (PARITY row 26). Beside the text, one photo from
// the original splash's collage: a Water Injection Dredging release at
// Tuttle Creek Dam (scripts/welcome-photo.mjs crops it; PARITY row 33). The
// research-use note is the owner's wording (reworded 2026-09-26).

import { useState } from "react";
import { actions } from "../state/store";
import { useFocusTrap } from "../lib/useFocusTrap";

export function WelcomeDialog() {
  const [dontShow, setDontShow] = useState(false);
  const trapRef = useFocusTrap<HTMLDivElement>();
  return (
    <div className="dialog-scrim" role="presentation">
      <div className="dialog welcome-dialog" role="dialog" aria-modal="true" aria-labelledby="welcome-title" ref={trapRef}>
        <figure className="welcome-photo">
          <img
            src={`${import.meta.env.BASE_URL}welcome/tuttle-creek-release.jpg`}
            alt="Sediment-laden water surging down a dam outlet channel"
            decoding="async"
          />
          <figcaption>
            {/* The space keeps the two lines apart for screen readers. */}
            <span className="welcome-photo-place">Tuttle Creek Dam, Kansas</span>{" "}
            <span>Water Injection Dredging release</span>
          </figcaption>
        </figure>
        <div className="welcome-body">
          <h2 id="welcome-title">Welcome to ReSST</h2>
          <p>
            The Reservoir Sustainable Sediment Tool (ReSST) is a web-based application developed to compile and synthesize
            case studies, analytical approaches, and literature related to sediment release from reservoirs. ReSST is
            intended to support reservoir managers and environmental engineers by providing a centralized, searchable
            resource to explore precedent projects, sediment management strategies, ecological concerns, and analytical
            methods across sites and regions. ReSST allows users to interact with an interactive map, apply keyword-based
            filters, review sites and general literature, and export results for analysis. ReSST also places the
            documented sites in national context: modeled reservoir sedimentation (RATTES), measured surveys (RESSED),
            and the connected dam network (ResNet) for more than 57,000 U.S. reservoirs. Workflow examples are available
            in the Help button on the toolbar.
          </p>
          <p className="welcome-note">
            <strong>
              For research and data collection only. Evaluate any sediment-management opportunity further before
              making decisions.
            </strong>
          </p>
          <div className="dialog-actions">
            <label className="dont-show">
              <input type="checkbox" checked={dontShow} onChange={(e) => setDontShow(e.target.checked)} />
              <span>Don't show this again</span>
            </label>
            <button type="button" className="btn-primary" onClick={() => actions.closeWelcome(dontShow)}>
              OK
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
