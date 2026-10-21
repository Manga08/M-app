"use client";

import { useState } from "react";
import { Download, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { useFinance } from "@/components/finance-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { FormDialogContent, FormDialogBody, FormDialogActions } from "@/components/ui/form-dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { downloadBlob } from "@/lib/download";
import type { QueueItem } from "@/lib/finance/types";

export function PendingConflictReview() {
  const { pendingCount, syncError, reviewPendingChanges, keepRemoteChanges, online } = useFinance();
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [backedUp, setBackedUp] = useState(false);
  if (!pendingCount || !syncError?.includes("asistente modificó")) return null;
  async function review() {
    setBusy(true);
    try { setItems(await reviewPendingChanges()); setBackedUp(false); }
    catch { toast.error("No pudimos leer los cambios. Conservamos tu copia local."); }
    finally { setBusy(false); }
  }
  async function resolve() {
    if (!items) return;
    setBusy(true);
    try { await keepRemoteChanges(items.map((item) => item.id)); setItems(null); setConfirm(false); toast.success("La versión de la nube está actualizada. Puedes volver a registrar los cambios que decidas conservar."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "No pudimos resolver el conflicto. No descartamos tu copia local."); }
    finally { setBusy(false); }
  }
  return <>
    <Button variant="outline" className="mt-3 min-h-11" disabled={busy || !online} onClick={() => void review()}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : null}Revisar cambios locales</Button>
    <Dialog open={items !== null} onOpenChange={(open) => { if (!open && !busy) setItems(null); }}>
      <FormDialogContent className="[&_[data-slot=dialog-header]]:pr-12" onExitComplete={() => setBackedUp(false)}>
        <FormDialogBody><DialogHeader><DialogTitle>Hay dos versiones de tus datos</DialogTitle><DialogDescription>Un asistente guardó cambios después de tu última sincronización. Tu trabajo local sigue aquí; no lo hemos sobrescrito ni enviado a ciegas.</DialogDescription></DialogHeader>
          <ol className="mt-5 space-y-3">{items?.map((item, index) => <li key={item.id} className="rounded-xl bg-secondary/45 p-3"><p className="text-sm font-medium">Cambio local {index + 1} · {item.operation.split(".")[0]}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString("es-CO")}</p></li>)}</ol>
          <p className="mt-5 text-sm leading-6 text-muted-foreground">Descarga una copia privada antes de descartar estos cambios. Después podrás abrir la información actual y volver a registrar únicamente lo que aún haga falta. No compartas esta copia: contiene datos financieros.</p>
        </FormDialogBody><FormDialogActions><Button variant="outline" className="min-h-12" onClick={() => { downloadBlob(new Blob([JSON.stringify({ version: 1, purpose: "local-conflict-backup", changes: items }, null, 2)], { type: "application/json" }), "moneva-cambios-locales.private.json"); setBackedUp(true); }}><Download className="size-4" />Guardar copia local</Button><Button variant="outline" className="min-h-12 text-destructive" disabled={!backedUp || busy} onClick={() => setConfirm(true)}>Conservar la versión de la nube</Button></FormDialogActions>
      </FormDialogContent>
    </Dialog>
    <AlertDialog open={confirm} onOpenChange={(open) => { if (!busy) setConfirm(open); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>¿Descartar los cambios locales revisados?</AlertDialogTitle><AlertDialogDescription>Se reemplazará esta copia por la información actual de la nube. Los cambios de tu copia descargada no se importan automáticamente. Esta acción no elimina datos de la nube.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Seguir revisando</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={(event) => { event.preventDefault(); void resolve(); }}>Sí, conservar la nube</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}
