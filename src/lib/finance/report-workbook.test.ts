import { describe, expect, it } from "vitest";
import { defaultReportQuery } from "@/lib/finance/report-query";
import { reportWorkbookFilename } from "@/lib/finance/report-workbook";

describe("report workbook", () => {
  it("usa un nombre legible para un mes completo", () => {
    const query = { ...defaultReportQuery(new Date("2026-08-20T00:00:00Z")), preset: "month" as const, startDate: "2026-08-01", endDate: "2026-08-31" };
    expect(reportWorkbookFilename(query)).toBe("Moneva - Reporte - agosto de 2026.xlsx");
  });

  it("describe rangos personalizados sin caracteres inválidos", () => {
    const query = { ...defaultReportQuery(), preset: "custom" as const, startDate: "2026-01-03", endDate: "2026-08-13" };
    expect(reportWorkbookFilename(query)).toContain("3 ene 2026 a 13 ago 2026");
    expect(reportWorkbookFilename(query)).not.toMatch(/[\\/:*?"<>|]/);
  });
});
