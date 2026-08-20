import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReportConnectionRequired } from "@/components/reports-page";
import { localReportCoverage, reportRequiresConnection } from "@/lib/finance/report-coverage";

describe("report coverage guard", () => {
  it("treats only demo local history as complete", () => {
    expect(localReportCoverage("demo")).toBe("complete");
    expect(localReportCoverage("real-user-id")).toBe("partial");
    expect(localReportCoverage(null)).toBe("partial");
  });

  it("blocks partial and real-user offline reports without blocking demo", () => {
    expect(reportRequiresConnection({ online: false, profileId: "real-user-id" })).toBe(true);
    expect(reportRequiresConnection({ online: false, profileId: "demo" })).toBe(false);
    expect(reportRequiresConnection({ online: true, profileId: "real-user-id", coverage: "complete" })).toBe(false);
    expect(reportRequiresConnection({ online: true, profileId: "real-user-id", coverage: "partial" })).toBe(true);
  });

  it("renders an accessible state without financial totals", () => {
    const markup = renderToStaticMarkup(<ReportConnectionRequired />);

    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain("Conéctate para cargar el reporte completo");
    expect(markup.toLowerCase()).toContain("no mostramos cifras incompletas como si fueran el total");
    expect(markup).not.toMatch(/\$\s*\d/);
  });
});
