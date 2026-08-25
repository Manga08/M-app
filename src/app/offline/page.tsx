import Link from "next/link";
import { CloudOff, DatabaseZap, RefreshCw, ShieldCheck } from "lucide-react";
import { PublicSurface } from "@/components/public-surface";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Sin conexión" };

export default function OfflinePage() {
  return <PublicSurface
    eyebrow="Sin conexión a internet"
    title="Tu información sigue en este dispositivo."
    description="La red no está disponible, pero Moneva conserva el estado local. La sincronización se reanudará cuando la conexión vuelva."
    tone="warning"
    icon={<CloudOff className="size-5" />}
    facts={[
      { label: "Nube", value: "En pausa" },
      { label: "Copia local", value: "Disponible" },
      { label: "Sincronización", value: "Automática al volver" },
    ]}
  >
      <p className="text-xs font-medium uppercase tracking-[.13em] text-warning">Mientras vuelves a conectarte</p>
      <h2 className="mt-3 text-2xl font-medium tracking-[-.04em] sm:text-3xl">Moneva no oculta el estado de tus cambios</h2>
      <ul className="mt-6 divide-y border-y" aria-label="Qué ocurre sin conexión">
        <OfflineFact icon={DatabaseZap} title="Trabajo local" text="Los cambios pendientes permanecen en este dispositivo." />
        <OfflineFact icon={ShieldCheck} title="Sin pérdida silenciosa" text="El estado de sincronización te indicará si algo necesita atención." />
      </ul>

      <Button asChild className="mt-8 min-h-11 w-full rounded-full sm:w-auto"><Link href="/" prefetch={false}><RefreshCw className="size-4" />Comprobar conexión</Link></Button>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">Si la conexión todavía no volvió, permanecerás en esta pantalla sin perder cambios.</p>
  </PublicSurface>;
}

function OfflineFact({ icon: Icon, title, text }: { icon: typeof ShieldCheck; title: string; text: string }) {
  return <li className="flex min-h-20 items-center gap-3 py-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary" aria-hidden="true"><Icon className="size-[18px]" /></span><span className="min-w-0"><span className="block text-sm font-medium">{title}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{text}</span></span></li>;
}
