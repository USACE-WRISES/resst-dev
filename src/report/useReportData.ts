// Orchestrates the report's data: run the ensures once, build the frozen
// ReportModel once, expose status. Failures degrade data-shaped where honest
// (a site keeps its team-collected record even when the national dataset is
// down); only a reservoir target with no core has nothing to render.

import { useCallback, useEffect, useState } from "react";
import type { AppData } from "../lib/types";
import { ensureCore, ensureSurveys, ensureTrajectory, getCore, getTrajectory, surveyProvenanceForRow, surveysForRow } from "../sediment/data";
import { findSimilar } from "../sediment/similar";
import { buildNetworkFeatures, type NetworkFeatureSet } from "../map/networkLayer";
import { buildReportModel, type ReportModel, type ReportTarget } from "./reportModel";

export interface ReportData {
  status: "loading" | "ready" | "error";
  model: ReportModel | null;
  mapFeatures: NetworkFeatureSet | null;
  retry: () => void;
}

export function useReportData(target: ReportTarget, data: AppData): ReportData {
  const [state, setState] = useState<Omit<ReportData, "retry">>({ status: "loading", model: null, mapFeatures: null });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  useEffect(() => {
    let cancelled = false;
    const generatedIso = new Date().toISOString().slice(0, 10);
    const finish = (model: ReportModel, mapFeatures: NetworkFeatureSet | null) => {
      if (!cancelled) setState({ status: "ready", model, mapFeatures });
    };

    (async () => {
      setState({ status: "loading", model: null, mapFeatures: null });
      const isSite = target.kind === "site";
      const link = isSite ? target.link : null;
      // A site with no crosswalk builds synchronously: team data only.
      if (isSite && !link) {
        finish(
          buildReportModel({
            target,
            data,
            core: null,
            row: null,
            trajectory: undefined,
            surveys: null,
            surveyProv: null,
            similar: null,
            generatedIso,
          }),
          null,
        );
        return;
      }
      try {
        const core = await ensureCore();
        const shortId = isSite ? link!.short_id : target.shortId;
        const row = core.rowById.get(shortId) ?? null;
        if (row == null) throw new Error(`ShortID ${shortId} not in the inventory`);
        await Promise.allSettled([ensureTrajectory(row), ensureSurveys()]);
        if (cancelled) return;
        finish(
          buildReportModel({
            target,
            data,
            core,
            row,
            trajectory: getTrajectory(row),
            surveys: surveysForRow(row),
            surveyProv: surveyProvenanceForRow(row),
            similar: findSimilar(core, row, new Set(data.siteByShortId.keys())),
            generatedIso,
          }),
          buildNetworkFeatures(core, row, "full"),
        );
      } catch {
        if (cancelled) return;
        if (isSite) {
          // The national dataset failed but the team-collected record stands:
          // headline stats still come from the boot-loaded link.
          finish(
            buildReportModel({
              target,
              data,
              core: getCore(),
              row: null,
              trajectory: undefined,
              surveys: null,
              surveyProv: null,
              similar: null,
              generatedIso,
            }),
            null,
          );
        } else {
          setState({ status: "error", model: null, mapFeatures: null });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  return { ...state, retry };
}
