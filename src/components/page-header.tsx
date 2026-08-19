export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description: string; action?: React.ReactNode }) {
  return <header className="mb-7 flex min-w-0 flex-col justify-between gap-5 border-b pb-6 sm:flex-row sm:items-end lg:mb-9 lg:gap-6 lg:pb-7">
    <div className="min-w-0">
      {eyebrow ? <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-primary sm:text-xs">{eyebrow}</p> : null}
      <h1 className="text-[clamp(1.75rem,7vw,3rem)] font-medium leading-[1.02] tracking-[-0.05em] text-balance">{title}</h1>
      <p className="mt-3 max-w-2xl text-[13px] leading-5 text-muted-foreground text-pretty sm:text-sm sm:leading-6">{description}</p>
    </div>
    {action ? <div className="shrink-0 sm:self-end">{action}</div> : null}
  </header>;
}
