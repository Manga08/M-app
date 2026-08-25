import Link from "next/link";
import { Compass, Home, SearchX } from "lucide-react";
import { PublicSurface } from "@/components/public-surface";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return <PublicSurface
    eyebrow="Ruta no encontrada"
    title="Esta dirección no lleva a una pantalla de Moneva."
    description="Puede que el enlace haya cambiado o que la dirección esté incompleta. Tu sesión y tus datos no se modificaron."
    tone="info"
    icon={<SearchX className="size-5" />}
    facts={[
      { label: "Código", value: "404" },
      { label: "Datos", value: "Sin cambios" },
      { label: "Destino seguro", value: "Inicio" },
    ]}
  >
    <p className="text-xs font-medium uppercase tracking-[.13em] text-info">Volver al recorrido</p>
    <h2 className="mt-3 text-2xl font-medium tracking-[-.04em] sm:text-3xl">Elige una ruta conocida</h2>
    <p className="mt-3 text-sm leading-6 text-muted-foreground">Puedes regresar al inicio o entrar de nuevo si todavía no tienes una sesión activa.</p>
    <div className="mt-7 grid gap-3 sm:grid-cols-2">
      <Button asChild className="h-12 rounded-full"><Link href="/"><Home className="size-4" />Ir al inicio</Link></Button>
      <Button asChild variant="outline" className="h-12 rounded-full"><Link href="/login"><Compass className="size-4" />Ir al acceso</Link></Button>
    </div>
  </PublicSurface>;
}
