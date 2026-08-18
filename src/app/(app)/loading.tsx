export default function AppRouteLoading() {
  return (
    <section role="status" aria-label="Cargando sección" className="py-2">
      <div className="h-3 w-24 animate-pulse rounded-full bg-muted" />
      <div className="mt-4 h-9 w-52 max-w-2/3 animate-pulse rounded-xl bg-muted" />
      <div className="mt-3 h-4 w-full max-w-md animate-pulse rounded-full bg-muted" />
      <div className="mt-10 space-y-4 border-t pt-6">
        <div className="h-16 animate-pulse rounded-2xl bg-muted/70" />
        <div className="h-16 animate-pulse rounded-2xl bg-muted/55" />
        <div className="h-16 animate-pulse rounded-2xl bg-muted/40" />
      </div>
      <span className="sr-only">Preparando la siguiente vista.</span>
    </section>
  );
}
