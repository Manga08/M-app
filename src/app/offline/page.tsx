import Link from "next/link";
import { CloudOff } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Sin conexión" };
export default function OfflinePage() {
  return <main className="grid min-h-screen place-items-center bg-background p-6"><div className="max-w-md text-center"><BrandMark className="mx-auto size-12" /><span className="mx-auto mt-8 grid size-12 place-items-center rounded-2xl bg-amber-400/12 text-amber-300"><CloudOff className="size-5" /></span><h1 className="mt-6 text-4xl font-medium tracking-[-.055em]">Estás sin conexión.</h1><p className="mt-4 text-sm leading-6 text-muted-foreground">Moneva seguirá guardando los movimientos desde una pantalla ya abierta. Cuando vuelva internet, tus cambios se sincronizarán.</p><Button asChild className="mt-8 rounded-full"><Link href="/">Volver a intentar</Link></Button></div></main>;
}
