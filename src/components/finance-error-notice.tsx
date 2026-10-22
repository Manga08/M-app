"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { userFacingSyncErrorMessage } from "@/lib/finance/sync-error";
import { cn } from "@/lib/utils";

/** Explain recovery first; internal diagnostics stay opt-in and on this device. */
export function FinanceErrorNotice({ error, fallback, id, className }: { error: string; fallback: string; id?: string; className?: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  const message = userFacingSyncErrorMessage(error, fallback);
  const diagnostic = error.slice(0, 2000);
  return <div id={id} className={cn("rounded-xl border border-destructive/35 bg-destructive/8 px-4 py-3 text-sm", className)}>
    <p role="alert" className="text-destructive">{message}</p>
    {message !== error ? <details className="mt-2 text-foreground"><summary className="flex min-h-11 cursor-pointer items-center text-xs font-medium">Detalle para soporte</summary><p className="text-xs leading-5 text-muted-foreground">No se envía automáticamente. Compártelo solo con alguien de confianza.</p><pre className="mt-2 whitespace-pre-wrap break-words text-xs [overflow-wrap:anywhere]">{diagnostic}</pre><Button type="button" variant="ghost" className="mt-2 min-h-11" onClick={async () => { try { await navigator.clipboard.writeText(diagnostic); setCopied("Detalle copiado."); } catch { setCopied("No pudimos copiarlo. Puedes seleccionar el texto y copiarlo manualmente."); } }}><Copy className="size-4" />Copiar detalle</Button>{copied ? <p role="status" className="mt-1 text-xs text-muted-foreground">{copied}</p> : null}</details> : null}
  </div>;
}
