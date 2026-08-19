export default function AppRouteLoading() {
  return (
    <section role="status" aria-live="polite" aria-label="Cargando sección" className="py-2">
      <div className="h-3 w-24 animate-pulse rounded-full bg-muted motion-reduce:animate-none" />
      <div className="mt-4 h-9 w-52 max-w-2/3 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
      <div className="mt-3 h-4 w-full max-w-md animate-pulse rounded-full bg-muted/70 motion-reduce:animate-none" />
      <div className="mt-10 border-y" aria-hidden="true">
        {[0, 1, 2].map((row) => <div key={row} className="flex min-h-20 items-center gap-4 border-b py-4 last:border-b-0">
          <div className="size-10 shrink-0 animate-pulse rounded-xl bg-muted/75 motion-reduce:animate-none" />
          <div className="min-w-0 flex-1 space-y-2"><div className="h-3 w-36 max-w-1/2 animate-pulse rounded-full bg-muted motion-reduce:animate-none" /><div className="h-2.5 w-full max-w-sm animate-pulse rounded-full bg-muted/50 motion-reduce:animate-none" /></div>
          <div className="h-4 w-16 animate-pulse rounded-full bg-muted/65 motion-reduce:animate-none" />
        </div>)}
      </div>
      <span className="sr-only">Preparando la siguiente vista sin mostrar importes anteriores.</span>
    </section>
  );
}
