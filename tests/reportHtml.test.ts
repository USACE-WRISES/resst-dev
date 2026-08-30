// The pure download wrapper: doctype, charset, embedded stylesheet, title
// escaping, and the no-scripts guarantee that keeps the file inert offline.
import { describe, expect, it } from "vitest";
import { wrapReportHtml } from "../src/report/reportHtml";
import type { ReportModel } from "../src/report/reportModel";

const model = { title: "Last <Dam> & Co", reportId: "last-dam" } as ReportModel;

describe("wrapReportHtml", () => {
  const html = wrapReportHtml('<article class="report-doc"><h1>Hi</h1></article>', model);

  it("emits a complete standalone document with the stylesheet embedded", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toMatch(/\.report-doc\s*\{/); // report.css inlined (vite may minify)
    expect(html).toContain('<body class="report-page">');
    expect(html).toContain('<article class="report-doc"><h1>Hi</h1></article>');
  });

  it("escapes the title and ships no scripts", () => {
    expect(html).toContain("<title>Last &lt;Dam&gt; &amp; Co | RESST Report</title>");
    expect(html).not.toContain("<script");
  });
});
