// Welcome dialog — text ported verbatim from the current application's
// splash (captured live 2026-08-28), with the same "Don't show this again"
// behavior implemented via localStorage. One sentence was appended for the
// sedimentation expansion (PARITY row 26).

import { useState } from "react";
import { actions } from "../state/store";
import { useFocusTrap } from "../lib/useFocusTrap";

export function WelcomeDialog() {
  const [dontShow, setDontShow] = useState(false);
  const trapRef = useFocusTrap<HTMLDivElement>();
  return (
    <div className="dialog-scrim" role="presentation">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="welcome-title" ref={trapRef}>
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
            Note: Results are for data collection and research purposes only. Any sediment-management opportunities
            identified should be further evaluated before decision-making.
          </strong>
        </p>
        <div className="dialog-actions">
          <label className="dont-show">
            <input type="checkbox" checked={dontShow} onChange={(e) => setDontShow(e.target.checked)} />
            <span>Don't show this again</span>
          </label>
          <button type="button" className="btn-primary" autoFocus onClick={() => actions.closeWelcome(dontShow)}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
