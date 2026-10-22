"use client";

import { publicHistoryState } from "@/lib/history-state";
import { Pencil, Repeat2 } from "lucide-react";
import { useFinance } from "@/components/finance-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormDialogActions, FormDialogBody, FormDialogContent } from "@/components/ui/form-dialog";
import { accountContextLabel } from "@/lib/finance/account-entities";
import { currencyFormatter, localIsoDate } from "@/lib/finance/calculations";
import { movementIdentityTone } from "@/lib/finance/movement-visuals";
import type { Transaction } from "@/lib/finance/types";

export function TransactionDetails({ transaction, open, onOpenChange, onExitComplete }: { transaction: Transaction; open: boolean; onOpenChange: (open: boolean) => void; onExitComplete?: () => void }) {
  const finance = useFinance();
  const account = finance.accounts.find((item) => item.id === transaction.accountId);
  const category = finance.categories.find((item) => item.id === transaction.categoryId);
  const occurrence = finance.recurringOccurrences.find((item) => item.id === transaction.recurringOccurrenceId);
  const pair = transaction.transferGroupId ? finance.transactions.find((item) => item.transferGroupId === transaction.transferGroupId && item.id !== transaction.id) : undefined;
  const currency = transaction.nativeCurrencyCode ?? account?.currencyCode ?? "COP";
  const type = transaction.kind.startsWith("transfer") ? "Transferencia" : transaction.kind === "income" ? "Ingreso" : transaction.kind === "expense" ? "Gasto" : "Ajuste de saldo";
  const date = (value: string) => new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`));
  const early = transaction.recurringOccurrenceId && localIsoDate(new Date(transaction.createdAt), finance.profile?.timezone) < transaction.occurredOn;
  return <Dialog open={open} onOpenChange={onOpenChange}><FormDialogContent variant="compact" onExitComplete={onExitComplete}><FormDialogBody>
    <DialogHeader className="pr-8"><DialogTitle>Detalle del movimiento</DialogTitle><DialogDescription>{type} · {date(transaction.occurredOn)}</DialogDescription></DialogHeader>
    <p className={`mt-7 break-words text-3xl font-medium tracking-tight tabular-nums ${movementIdentityTone(transaction.kind).text}`}>{currency} {currencyFormatter(currency).format(transaction.amount)}</p>
    <h2 className="mt-3 break-words text-xl font-medium">{transaction.merchant || transaction.description}</h2>
    <dl className="mt-7 space-y-5 text-sm">
      <div><dt className="text-muted-foreground">Cuenta</dt><dd className="mt-1 break-words">{accountContextLabel(account, finance.accountEntities)}</dd></div>
      {pair ? <div><dt className="text-muted-foreground">{transaction.kind === "transfer_in" ? "Desde" : "Hacia"}</dt><dd className="mt-1 break-words">{accountContextLabel(finance.accounts.find((item) => item.id === pair.accountId), finance.accountEntities)} · {currencyFormatter(pair.nativeCurrencyCode ?? finance.accounts.find((item) => item.id === pair.accountId)?.currencyCode ?? "COP").format(pair.amount)}</dd></div> : null}
      {category ? <div><dt className="text-muted-foreground">Categoría</dt><dd className="mt-1">{[finance.groupAllocations.find((item) => item.group === category.group)?.name, category.name].filter(Boolean).join(" · ")}</dd></div> : null}
      <div><dt className="text-muted-foreground">Concepto</dt><dd className="mt-1 break-words">{transaction.description}</dd></div>
      <div><dt className="text-muted-foreground">Registrado en Moneva</dt><dd className="mt-1">{date(localIsoDate(new Date(transaction.createdAt), finance.profile?.timezone))}</dd></div>
      {currency === "USD" && transaction.exchangeRate ? <div><dt className="text-muted-foreground">Tasa histórica aplicada</dt><dd className="mt-1">{currencyFormatter("COP").format(transaction.exchangeRate)} por USD · {transaction.exchangeRateDate}</dd></div> : null}
      {transaction.note ? <div><dt className="text-muted-foreground">Nota</dt><dd className="mt-1 whitespace-pre-wrap break-words">{transaction.note}</dd></div> : null}
    </dl>
    {transaction.recurringOccurrenceId ? <div className="mt-6 rounded-xl bg-warning/10 p-4 text-sm"><p className="flex items-center gap-2 font-medium text-warning"><Repeat2 className="size-4" />{early ? "Registrado por anticipado" : "Registrado desde una programación"}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">{early ? "Se registró antes de su fecha financiera. Ya forma parte del saldo registrado y no se contará otra vez al llegar esa fecha." : "Este es un movimiento registrado, no un gasto futuro pendiente."}</p>{occurrence && finance.recurringRules.some((item) => item.id === occurrence.ruleId && item.status !== "archived") ? <Button variant="ghost" className="mt-2 min-h-11" onClick={() => { const url = new URL(window.location.href); url.searchParams.delete("transaction"); url.searchParams.delete("mode"); url.searchParams.set("rule", occurrence.ruleId); window.history.replaceState(publicHistoryState(window.history.state), "", `${url.pathname}${url.search}`); }}>Ver programación</Button> : null}</div> : null}
  </FormDialogBody><FormDialogActions><Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button><Button onClick={() => { const url = new URL(window.location.href); url.searchParams.set("mode", "edit"); window.history.replaceState(publicHistoryState(window.history.state), "", `${url.pathname}${url.search}`); }}><Pencil className="size-4" />Editar movimiento</Button></FormDialogActions></FormDialogContent></Dialog>;
}
