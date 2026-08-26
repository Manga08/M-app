"use client";

import { Activity, type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { motionDurations, motionEasings } from "@/lib/motion";
import { cn } from "@/lib/utils";

export type RouteViewChangeSource = "keyboard" | "pointer";

type RouteViewItem<Value extends string> = {
  value: Value;
  label: string;
  detail: string;
  icon: LucideIcon;
};

const indicatorPosition = [
  "translate-x-0",
  "translate-x-[calc(100%_+_0.375rem)]",
  "translate-x-[calc(200%_+_0.75rem)]",
] as const;

export function RouteViewTabs<Value extends string>({
  idPrefix,
  label,
  value,
  items,
  compactOnSmall = false,
  onValueChange,
}: {
  idPrefix: string;
  label: string;
  value: Value;
  items: readonly RouteViewItem<Value>[];
  compactOnSmall?: boolean;
  onValueChange: (value: Value, source: RouteViewChangeSource) => void;
}) {
  const activeIndex = Math.max(0, items.findIndex((item) => item.value === value));
  const [instantIndicator, setInstantIndicator] = useState(false);
  const resetFrames = useRef<number[]>([]);

  useEffect(() => () => resetFrames.current.forEach((frame) => cancelAnimationFrame(frame)), []);

  const select = (nextValue: Value, source: RouteViewChangeSource) => {
    if (nextValue === value) return;
    if (source === "keyboard") {
      resetFrames.current.forEach((frame) => cancelAnimationFrame(frame));
      setInstantIndicator(true);
      const firstFrame = requestAnimationFrame(() => {
        const secondFrame = requestAnimationFrame(() => setInstantIndicator(false));
        resetFrames.current = [secondFrame];
      });
      resetFrames.current = [firstFrame];
    }
    onValueChange(nextValue, source);
  };

  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>, currentValue: Value) => {
    const currentIndex = items.findIndex((item) => item.value === currentValue);
    let nextIndex: number | undefined;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % items.length;
    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + items.length) % items.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = items.length - 1;
    if (nextIndex === undefined) return;

    event.preventDefault();
    const next = items[nextIndex];
    select(next.value, "keyboard");
    requestAnimationFrame(() => document.getElementById(`${idPrefix}-tab-${next.value}`)?.focus());
  };

  return <div
    role="tablist"
    aria-label={label}
    aria-orientation="horizontal"
    className="relative isolate mx-auto grid w-full max-w-3xl grid-cols-3 gap-1.5 rounded-[1.35rem] border border-border/70 bg-secondary/35 p-1.5"
  >
    <span
      aria-hidden="true"
      data-route-tab-indicator
      className={cn(
        "pointer-events-none absolute inset-y-1.5 left-1.5 z-0 w-[calc((100%_-_1.5rem)/3)] rounded-[1rem] bg-background shadow-[0_1px_2px_rgba(0,0,0,.08),0_6px_18px_rgba(0,0,0,.03)] transition-transform duration-[var(--motion-duration-menu)] ease-[var(--motion-ease-move)] motion-reduce:transition-none",
        indicatorPosition[activeIndex],
        instantIndicator && "transition-none",
      )}
    />
    {items.map(({ value: itemValue, label: itemLabel, detail, icon: Icon }) => {
      const active = value === itemValue;
      return <button
        key={itemValue}
        id={`${idPrefix}-tab-${itemValue}`}
        type="button"
        role="tab"
        aria-selected={active}
        aria-controls={`${idPrefix}-panel-${itemValue}`}
        tabIndex={active ? 0 : -1}
        onClick={(event) => select(itemValue, event.detail === 0 ? "keyboard" : "pointer")}
        onKeyDown={(event) => moveFocus(event, itemValue)}
        className={cn(
          "relative z-10 flex min-h-[58px] min-w-0 flex-col items-center justify-center gap-1 rounded-[1rem] px-1.5 text-muted-foreground transition-[color,transform] duration-[var(--motion-duration-menu)] ease-[var(--motion-ease-out)] active:scale-[var(--motion-press-scale)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none sm:min-h-[4.25rem] sm:flex-row sm:justify-start sm:gap-3 sm:px-5",
          compactOnSmall && "max-[359px]:min-h-[52px]",
          active && "text-foreground",
        )}
      >
        <span className={cn("grid size-7 shrink-0 place-items-center rounded-[10px] transition-colors duration-[var(--motion-duration-menu)] motion-reduce:transition-none sm:size-8 sm:rounded-xl", active ? "bg-primary/12 text-primary" : "text-muted-foreground")} aria-hidden="true"><Icon className="size-4 sm:size-[17px]" /></span>
        <span className="min-w-0 text-center sm:text-left"><span className="block truncate text-[11px] font-medium min-[360px]:text-xs sm:text-sm">{itemLabel}</span><span className="hidden truncate text-[11px] leading-4 text-muted-foreground sm:block">{detail}</span></span>
      </button>;
    })}
  </div>;
}

export function RouteViewPanel({
  active,
  id,
  labelledBy,
  instant,
  children,
}: {
  active: boolean;
  id: string;
  labelledBy: string;
  instant: boolean;
  children: ReactNode;
}) {
  const reducedMotion = useReducedMotion();

  return <m.section
    id={id}
    role="tabpanel"
    aria-labelledby={labelledBy}
    aria-hidden={active ? undefined : true}
    tabIndex={active ? 0 : -1}
    data-route-view-panel
    initial={false}
    animate={active
      ? { opacity: 1, transform: "none" }
      : { opacity: 0, transform: reducedMotion ? "none" : "translateY(4px)" }}
    transition={instant
      ? { type: false }
      : { duration: reducedMotion ? motionDurations.reduced : motionDurations.menu, ease: motionEasings.out }}
    className="outline-none focus-visible:ring-2 focus-visible:ring-ring"
  >
    <Activity mode={active ? "visible" : "hidden"}><div>{children}</div></Activity>
  </m.section>;
}
