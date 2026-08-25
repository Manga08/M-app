"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

const MovementCalendarClient = dynamic(() => import("@/components/movement-calendar-client").then((module) => module.MovementCalendarClient), {
  ssr: false,
  loading: () => <div role="status" aria-live="polite" aria-label="Preparando calendario" aria-busy="true"><Skeleton className="h-[38rem] w-full rounded-[1.5rem]" /></div>,
});

export function MovementCalendar() { return <MovementCalendarClient />; }
