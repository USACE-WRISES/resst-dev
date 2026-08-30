// The Dam Report modal: EASI's document-viewer pattern adapted to a static
// app. Portals to document.body (the app shell's overflow:hidden would clip
// multi-page print output), toggles body.report-open so the print stylesheet
// can isolate the article, and keeps exactly one scroll region (.report-body).
// Downloads are gated until the map figure resolves so the file never
// serializes a half-drawn canvas.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { AppData } from "../lib/types";
import { useFocusTrap } from "../lib/useFocusTrap";
import type { ReportTarget } from "./reportModel";
import { useReportData } from "./useReportData";
import { ReportArticle } from "./ReportArticle";
import type { ReportMapStatus } from "./ReportMap";
import { downloadReportHtml } from "./reportHtml";
import REPORT_CSS from "./report.css?inline";

export function ReportModal({ target, data, onClose }: { target: ReportTarget; data: AppData; onClose: () => void }) {
  const { status, model, mapFeatures, retry } = useReportData(target, data);
  const trapRef = useFocusTrap<HTMLDivElement>();
  const articleRef = useRef<HTMLElement>(null);
  const [mapStatus, setMapStatus] = useState<ReportMapStatus>("pending");

  useEffect(() => {
    document.body.classList.add("report-open");
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("report-open");
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const mapSettled = model?.map == null || mapStatus !== "pending";
  const downloadsReady = status === "ready" && model != null && mapSettled;

  return createPortal(
    <div className="dialog-scrim report-scrim" role="presentation" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="report-dialog" role="dialog" aria-modal="true" aria-labelledby="report-title" ref={trapRef}>
        {/* One stylesheet, two consumers: this tag styles the modal; reportHtml.ts embeds the same string in the download. */}
        <style>{REPORT_CSS}</style>
        <div className="report-head">
          <h2 id="report-title">{model ? model.title : "Dam Report"}</h2>
          <button type="button" className="linklike" onClick={onClose} aria-label="Close the report">
            ✕ Close
          </button>
        </div>
        <div className="report-body" role="region" aria-label="Report content" tabIndex={0}>
          {status === "loading" && (
            <p className="sec-status" data-status="loading" style={{ padding: "24px" }}>
              Compiling the report…
            </p>
          )}
          {status === "error" && (
            <p className="sec-status" data-status="error" style={{ padding: "24px" }}>
              The national dataset failed to load, so this report cannot be compiled.{" "}
              <button type="button" className="linklike" onClick={retry}>
                Retry
              </button>
            </p>
          )}
          {status === "ready" && model && (
            <>
              <ReportArticle ref={articleRef} model={model} mapFeatures={mapFeatures} onMapStatus={setMapStatus} />
              <div className="report-footer">
                <button
                  type="button"
                  className="btn-outline"
                  disabled={!downloadsReady}
                  onClick={() => articleRef.current && downloadReportHtml(articleRef.current, model)}
                >
                  Download HTML
                </button>
                <button type="button" className="btn-outline" disabled={!downloadsReady} onClick={() => window.print()}>
                  Print / save as PDF
                </button>
                <button type="button" className="btn-primary" onClick={onClose}>
                  Close
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
