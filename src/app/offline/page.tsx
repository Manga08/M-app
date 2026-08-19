import Link from "next/link";
import { CloudOff, DatabaseZap, RefreshCw, ShieldCheck } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Sin conexión" };

export default function OfflinePage() {
  return <main className="grid min-h-screen place-items-center bg-background p-5 sm:p-8">
    <section className="w-full max-w-xl border-y py-10 sm:py-14" aria-labelledby="offline-title" aria-describedby="offline-description">
      <div className="flex items-center gap-2"><BrandMark /><span className="font-semibold tracking-[-.02em]">Moneva</span></div>
      <div className="mt-10 flex items-center gap-3 text-warning" role="status"><span className="grid size-11 place-items-center rounded-2xl bg-warning/10" aria-hidden="true"><CloudOff className="size-5" /></span><span className="text-xs font-medium uppercase tracking-[.14em]">Sin conexión a internet</span></div>
      <h1 id="offline-title" className="mt-5 text-3xl font-medium leading-tight tracking-[-.045em] text-balance sm:text-4xl">Tu información sigue en este dispositivo</h1>
      <p id="offline-description" className="mt-4 max-w-lg text-sm leading-6 text-muted-foreground text-pretty">Las pantallas que ya estaban abiertas pueden seguir guardando cambios localmente. Moneva intentará sincronizarlos cuando vuelva la conexión.</p>

      <ul className="mt-8 divide-y border-y" aria-label="Qué ocurre sin conexión">
        <OfflineFact icon={DatabaseZap} title="Trabajo local" text="Los cambios pendientes permanecen en este dispositivo." />
        <OfflineFact icon={ShieldCheck} title="Sin pérdida silenciosa" text="El estado de sincronización te indicará si algo necesita atención." />
      </ul>

      <Button asChild className="mt-8 min-h-11 w-full rounded-full sm:w-auto"><Link href="/" prefetch={false}><RefreshCw className="size-4" />Comprobar conexión</Link></Button>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">Si todavía estás sin internet, volverás a ver esta pantalla.</p>
    </section>
  </main>;
}

function OfflineFact({ icon: Icon, title, text }: { icon: typeof ShieldCheck; title: string; text: string }) {
  return <li className="flex min-h-20 items-center gap-3 py-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary" aria-hidden="true"><Icon className="size-[18px]" /></span><span className="min-w-0"><span className="block text-sm font-medium">{title}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{text}</span></span></li>;
}
