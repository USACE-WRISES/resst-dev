// Details for a national-inventory reservoir that is NOT one of the
// documented RESST sites: a header card with the ResNet identity, then the
// shared Sustainability / Evidence / Network / Comparables cards. No
// literature, no pager — and a standing pointer back to the app's purpose:
// documented analogs are where the management knowledge lives.

import { useEffect, useState } from "react";
import type { AppData } from "../../lib/types";
import { useAppState } from "../../state/store";
import { ensureCore, getCore } from "../../sediment/data";
import { formatKm2, formatVolumeAcft } from "../../sediment/format";
import { FLAG, PROVENANCE } from "../../sediment/types";
import { CollapsibleSection } from "./CollapsibleSection";
import { ProvBadge } from "./Provenance";
import { SustainabilitySection, sustainabilityPeek } from "./SustainabilitySection";
import { EvidenceSection, evidenceBadgeFor } from "./EvidenceSection";
import { NetworkSection, networkPeek } from "./NetworkSection";
import { ComparablesSection } from "./ComparablesSection";
import { KeyValues, SourceLine } from "./ui";

export function ReservoirDetails({ shortId, data }: { shortId: string; data: AppData }) {
  const state = useAppState(); // sedimentStamp + networkView re-render
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  useEffect(() => {
    setError(false);
    ensureCore().catch(() => setError(true));
  }, [retryKey]);

  const core = getCore();
  const row = core?.rowById.get(Number(shortId));
  if (error) {
    return (
      <p className="sec-status" data-status="error">
        National dataset failed to load.{" "}
        <button type="button" className="linklike" onClick={() => setRetryKey((k) => k + 1)}>
          Retry
        </button>
      </p>
    );
  }
  if (!core || row == null) {
    return (
      <p className="sec-status" data-status="loading">
        Loading reservoir details…
      </p>
    );
  }

  const name = core.names[row] || `NID ${core.nids[row]}`;
  const dict = (list: string[], idx: number) => (idx >= 0 ? list[idx] : "");
  const hasSurveys = (core.flags[row] & FLAG.HAS_SURVEYS) !== 0;
  const meta = [
    dict(core.dicts.state, core.state[row]),
    dict(core.dicts.owner, core.owner[row]),
    dict(core.dicts.purpose, core.purpose[row]),
    core.yrc[row] > 0 ? `Built ${core.yrc[row]}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const num = (v: number) => (Number.isFinite(v) ? v : null);

  return (
    <>
      <section className="site-card">
        <h3 className="site-name">{name}</h3>
        {meta && <p className="site-meta">{meta}</p>}
        <p className="site-kicker">No documented RESST sediment-management record.</p>
        <KeyValues
          numeric
          rows={[
            { label: "NID ID", value: core.nids[row] },
            { label: "Max storage (ResNet)", value: formatVolumeAcft(core.maxStor[row]) },
            { label: "Drainage area", value: formatKm2(num(core.da[row])) },
          ]}
        />
        <SourceLine text="Identity and attributes: ResNet v1 (NID-derived)" group={PROVENANCE.resnet} />
      </section>
      <div className="detail-accordion">
        <CollapsibleSection
          id="sust"
          title="Reservoir Sustainability"
          badge={<ProvBadge kind="modeled" />}
          peek={sustainabilityPeek(num(core.sed2025[row]), num(core.capOrig[row]))}
        >
          <SustainabilitySection name={name} row={row} link={null} hasSurveys={hasSurveys} />
        </CollapsibleSection>
        <CollapsibleSection id="evid" title="Evidence" badge={evidenceBadgeFor(hasSurveys, null)}>
          <EvidenceSection row={row} hasSurveys={hasSurveys} />
        </CollapsibleSection>
        <CollapsibleSection
          id="net"
          title="Reservoir Network"
          badge={<ProvBadge kind="network" />}
          peek={networkPeek(row, state.networkView)}
        >
          <NetworkSection row={row} />
        </CollapsibleSection>
        <CollapsibleSection id="sim" title="Comparable Reservoirs" lazy>
          <ComparablesSection
            row={row}
            data={data}
            from={{ siteId: null, reservoirId: shortId, label: name, openSection: "sim" }}
          />
        </CollapsibleSection>
      </div>
    </>
  );
}
