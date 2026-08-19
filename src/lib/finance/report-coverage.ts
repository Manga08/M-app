import type { FinanceReport } from "@/lib/finance/types";

export function localReportCoverage(userId: string | null | undefined): FinanceReport["coverage"] {
  return userId === "demo" ? "complete" : "partial";
}

export function reportRequiresConnection({
  online,
  profileId,
  coverage,
}: {
  online: boolean;
  profileId?: string;
  coverage?: FinanceReport["coverage"];
}) {
  return coverage === "partial" || (!online && profileId !== "demo");
}
