// Details for a national-inventory reservoir that is NOT one of the 979
// documented RESST sites: ResNet identity attributes, then the shared
// Sustainability / Evidence / Network sections. No literature, no pager —
// and a standing pointer back to the app's purpose: documented analogs are
// where the management knowledge lives.

import { useEffect, useState } from "react";
import { useAppState } from "../../state/store";
import { ensureCore, getCore } from "../../sediment/data";
import { formatKm2, formatVolumeAcft } from "../../sediment/format";
import { FLAG, PROVENANCE } from "../../sediment/types";
import { CollapsibleSection } from "./CollapsibleSection";
import { ProvBadge, ProvNote } from "./Provenance";
import { SustainabilitySection } from "./SustainabilitySection";
import { EvidenceSection, evidenceBadgeFor } from "./EvidenceSection";
import { NetworkSection } from "./NetworkSection";

export function ReservoirDetails({ shortId }: { shortId: string }) {
  useAppState(); // sedimentStamp re-render
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
  const idRows: Array<[string, string]> = [
    ["NID ID", core.nids[row]],
    ["State", dict(core.dicts.state, core.state[row])],
    ["Owner type", dict(core.dicts.owner, core.owner[row])],
    ["Primary purpose", dict(core.dicts.purpose, core.purpose[row])],
    ["Year completed", core.yrc[row] > 0 ? String(core.yrc[row]) : ""],
    ["Max storage (ResNet)", formatVolumeAcft(core.maxStor[row])],
    ["Drainage area", formatKm2(Number.isFinite(core.da[row]) ? core.da[row] : null)],
  ];

  return (
    <>
      <section className="detail-section">
        <h3>{name}</h3>
        <p className="muted reservoir-kicker">
          National-inventory reservoir — no documented RESST sediment-management record.
        </p>
        <dl className="field-list">
          {idRows
            .filter(([, v]) => v !== "" && v !== "—")
            .map(([label, value]) => (
              <div key={label} className="field-row">
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
        </dl>
        <ProvNote text="Identity and attributes: ResNet v1 (NID-derived)" group={PROVENANCE.resnet} />
      </section>
      <CollapsibleSection id="sust" title="Reservoir Sustainability" badge={<ProvBadge kind="modeled" />}>
        <SustainabilitySection name={name} row={row} link={null} hasSurveys={hasSurveys} />
      </CollapsibleSection>
      <CollapsibleSection id="evid" title="Evidence" defaultOpen={false} badge={evidenceBadgeFor(hasSurveys, null)}>
        <EvidenceSection row={row} hasSurveys={hasSurveys} />
      </CollapsibleSection>
      <CollapsibleSection id="net" title="Reservoir Network" badge={<ProvBadge kind="network" />}>
        <NetworkSection row={row} />
      </CollapsibleSection>
    </>
  );
}
