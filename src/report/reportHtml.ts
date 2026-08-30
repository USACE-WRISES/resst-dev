// The download path: serialize the rendered report DOM into a self-contained
// HTML file (embedded stylesheet, PNG map as a data URI, inline SVG chart —
// no scripts, opens offline). Serializing the live article guarantees the
// file matches what the user reviewed; wrapReportHtml stays pure for tests.

import { saveBlob, stamp } from "../utils/exporters";
import type { ReportModel } from "./reportModel";
import REPORT_CSS from "./report.css?inline";

const escapeHtml = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function wrapReportHtml(articleHtml: string, model: ReportModel): string {
  return (
    "<!doctype html>\n" +
    '<html lang="en">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    `<title>${escapeHtml(model.title)} | RESST Report</title>\n` +
    `<style>\nbody.report-page { margin: 0; background: #ffffff; }\n${REPORT_CSS}\n</style>\n` +
    '</head>\n<body class="report-page">\n' +
    articleHtml +
    "\n</body>\n</html>\n"
  );
}

export function downloadReportHtml(articleEl: HTMLElement, model: ReportModel): void {
  const clone = articleEl.cloneNode(true) as HTMLElement;
  for (const el of Array.from(clone.querySelectorAll("[data-report-strip]"))) el.remove();
  const html = wrapReportHtml(clone.outerHTML, model);
  saveBlob(new Blob([html], { type: "text/html;charset=utf-8" }), `resst-report-${model.reportId}-${stamp()}.html`);
}
