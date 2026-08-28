import { describe, expect, it } from "vitest";
import { defaultReportQuery, normalizeReportQuery, parseReportQuery, reportDateMatchesQuery, reportGranularity, serializeReportQuery } from "@/lib/finance/report-query";

describe("report query", () => {
  const now = new Date("2026-08-20T12:00:00Z");

  it("crea un periodo de doce meses estable", () => {
    expect(defaultReportQuery(now)).toMatchObject({ startDate: "2025-09-01", endDate: "2026-08-31", preset: "12m", granularity: "month" });
  });

  it("normaliza meses no consecutivos y calcula sus límites", () => {
    const query = normalizeReportQuery({ ...defaultReportQuery(now), preset: "months", selectedMonths: ["2026-08", "2025-12", "2026-08", "mal"] });
    expect(query.selectedMonths).toEqual(["2025-12", "2026-08"]);
    expect(query.startDate).toBe("2025-12-01");
    expect(query.endDate).toBe("2026-08-31");
    expect(reportDateMatchesQuery("2025-12-15", query)).toBe(true);
    expect(reportDateMatchesQuery("2026-04-15", query)).toBe(false);
    expect(reportDateMatchesQuery("2026-08-31", query)).toBe(true);
  });

  it("conserva filtros al serializar y volver a leer", () => {
    const original = normalizeReportQuery({ ...defaultReportQuery(now), preset: "custom", startDate: "2026-01-03", endDate: "2026-02-15", comparison: "year", kind: "expense", groupKeys: ["needs"], accountIds: ["a"], search: "  café  " });
    const parsed = parseReportQuery(serializeReportQuery(original), now);
    expect(parsed).toMatchObject({ preset: "custom", startDate: "2026-01-03", endDate: "2026-02-15", comparison: "year", kind: "expense", groupKeys: ["needs"], accountIds: ["a"], search: "café" });
  });

  it("elige una granularidad legible", () => {
    expect(reportGranularity("2026-08-01", "2026-08-31")).toBe("day");
    expect(reportGranularity("2026-01-01", "2026-05-31")).toBe("week");
    expect(reportGranularity("2025-01-01", "2026-08-31")).toBe("month");
  });
});
