export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description: string; action?: React.ReactNode }) {
  return <header className="mb-8 flex flex-col justify-between gap-5 border-b pb-7 sm:flex-row sm:items-end"><div>{eyebrow && <p className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-primary">{eyebrow}</p>}<h1 className="text-[clamp(2rem,4vw,3rem)] font-medium leading-none tracking-[-0.055em]">{title}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p></div>{action}</header>;
}
