import { Suspense } from "react";
import { ReportsPage } from "@/components/reports-page";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = { title: "Reportes" };
export default function Page() { return <Suspense fallback={<ReportsFallback />}><ReportsPage /></Suspense>; }

function ReportsFallback() {
  return <div className="space-y-6" role="status" aria-live="polite" aria-label="Preparando reportes" aria-busy="true"><Skeleton className="h-28 w-full rounded-2xl" /><Skeleton className="h-16 w-full rounded-2xl" /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-28 rounded-2xl" />)}</div><Skeleton className="h-96 w-full rounded-2xl" /></div>;
}
