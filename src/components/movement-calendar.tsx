"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

const MovementCalendarClient = dynamic(() => import("@/components/movement-calendar-client").then((module) => module.MovementCalendarClient), {
  ssr: false,
  loading: () => <div aria-label="Preparando calendario" aria-busy="true"><Skeleton className="h-[34rem] w-full rounded-[1.25rem]" /></div>,
});

export function MovementCalendar() { return <MovementCalendarClient />; }
