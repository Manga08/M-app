import { cn } from "@/lib/utils";

export function PageHeader({ eyebrow, title, description, action, className, descriptionClassName }: { eyebrow?: string; title: string; description: string; action?: React.ReactNode; className?: string; descriptionClassName?: string }) {
  return <header className={cn("mb-5 flex min-w-0 flex-col justify-between gap-4 border-b pb-5 min-[360px]:mb-7 min-[360px]:gap-5 min-[360px]:pb-6 sm:flex-row sm:items-end lg:mb-9 lg:gap-6 lg:pb-7", className)}>
    <div className="min-w-0">
      {eyebrow ? <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-primary sm:text-xs">{eyebrow}</p> : null}
      <h1 className="text-[clamp(1.75rem,7vw,3rem)] font-medium leading-[1.02] tracking-[-0.05em] text-balance">{title}</h1>
      <p className={cn("mt-3 max-w-2xl text-[13px] leading-5 text-muted-foreground text-pretty sm:text-sm sm:leading-6", descriptionClassName)}>{description}</p>
    </div>
    {action ? <div className="shrink-0 sm:self-end">{action}</div> : null}
  </header>;
}
