"use client";

import { useEffect } from "react";
import { CircleAlert, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => { console.error(error); }, [error]);

  return <section role="alert" className="grid min-h-[62dvh] place-items-center py-10 text-center">
    <div className="max-w-md">
      <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-destructive/10 text-destructive"><CircleAlert className="size-6" /></span>
      <p className="mt-6 text-[11px] font-medium uppercase tracking-[.14em] text-destructive">Interrupción temporal</p>
      <h1 className="mt-2 text-3xl font-medium tracking-[-.045em]">No pudimos mostrar esta parte</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">Tus datos guardados no se han borrado. Intenta cargar la sección de nuevo; si el problema continúa, revisa el estado de sincronización.</p>
      <Button className="mt-6 h-11 rounded-full px-5" onClick={retry}><RotateCcw className="size-4" />Intentar de nuevo</Button>
      {error.digest ? <p className="mt-4 text-[11px] text-muted-foreground">Referencia: {error.digest}</p> : null}
    </div>
  </section>;
}
