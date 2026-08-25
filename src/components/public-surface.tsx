import type { ReactNode } from "react";
import { BrandMark } from "@/components/brand-mark";
import { cn } from "@/lib/utils";

type PublicTone = "primary" | "warning" | "destructive" | "info";

const toneClasses: Record<PublicTone, { text: string; soft: string; dot: string }> = {
  primary: { text: "text-primary", soft: "bg-primary/10", dot: "bg-primary" },
  warning: { text: "text-warning", soft: "bg-warning/10", dot: "bg-warning" },
  destructive: { text: "text-destructive", soft: "bg-destructive/10", dot: "bg-destructive" },
  info: { text: "text-info", soft: "bg-info/10", dot: "bg-info" },
};

export function PublicSurface({
  eyebrow,
  title,
  description,
  tone = "primary",
  icon,
  facts,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  tone?: PublicTone;
  icon: ReactNode;
  facts: Array<{ label: string; value: string }>;
  children: ReactNode;
}) {
  const colors = toneClasses[tone];
  return <main className="relative min-h-dvh overflow-hidden bg-background" data-public-surface>
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-70 [background-image:linear-gradient(to_right,color-mix(in_oklch,var(--border),transparent_72%)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklch,var(--border),transparent_80%)_1px,transparent_1px)] [background-size:72px_72px] [mask-image:linear-gradient(to_bottom,black,transparent_74%)]" />
    <div aria-hidden="true" className="pointer-events-none absolute -right-36 -top-44 size-[34rem] rounded-full border-[5rem] border-primary/[.035] sm:-right-24 sm:size-[42rem] sm:border-[7rem]" />

    <div className="relative mx-auto flex min-h-dvh w-full max-w-[1536px] flex-col px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:px-8 lg:px-12">
      <header className="flex min-h-14 items-center justify-between border-b" aria-label="Moneva">
        <div className="flex items-center gap-2.5"><BrandMark className="size-9" /><span className="text-[15px] font-semibold tracking-[-.025em]">Moneva</span></div>
        <p className="flex items-center gap-2 text-xs text-muted-foreground"><span className={cn("size-2 rounded-full", colors.dot)} aria-hidden="true" /><span className="hidden sm:inline">Espacio financiero privado</span><span className="sm:hidden">Privado</span></p>
      </header>

      <div className="grid flex-1 content-center gap-10 py-10 sm:py-14 lg:grid-cols-[minmax(0,1fr)_minmax(390px,.68fr)] lg:items-center lg:gap-20 lg:py-16">
        <section aria-labelledby="public-page-title" className="min-w-0">
          <div className={cn("flex items-center gap-3", colors.text)}>
            <span className={cn("grid size-11 shrink-0 place-items-center rounded-2xl", colors.soft)} aria-hidden="true">{icon}</span>
            <p className="text-[11px] font-semibold uppercase tracking-[.15em]">{eyebrow}</p>
          </div>
          <h1 id="public-page-title" className="mt-6 max-w-[14ch] text-[clamp(2.35rem,5vw,4.75rem)] font-medium leading-[1.01] tracking-[-.06em] text-balance">{title}</h1>
          <p className="mt-5 max-w-2xl text-[15px] leading-7 text-muted-foreground text-pretty sm:text-base">{description}</p>

          <dl className="mt-9 grid border-y sm:grid-cols-3 lg:max-w-3xl">
            {facts.map((fact) => <div key={fact.label} className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 border-b py-3 last:border-b-0 sm:block sm:border-b-0 sm:border-r sm:px-4 sm:first:pl-0 sm:last:border-r-0">
              <dt className="text-[11px] uppercase tracking-[.1em] text-muted-foreground">{fact.label}</dt>
              <dd className="mt-0 text-sm font-medium sm:mt-2">{fact.value}</dd>
            </div>)}
          </dl>
        </section>

        <section className="min-w-0 border-y py-7 sm:py-9 lg:w-full lg:max-w-[520px] lg:justify-self-end" aria-label="Acción principal">
          {children}
        </section>
      </div>

      <footer className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-t pt-3 text-[11px] text-muted-foreground">
        <span>Moneva · claridad para decidir</span>
        <span>Hecho para Colombia · COP</span>
      </footer>
    </div>
  </main>;
}
