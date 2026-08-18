"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CalendarDays, CloudOff, LayoutDashboard, LineChart, Menu, Plus, ReceiptText, Settings2, Target, UserRound, WalletCards } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { useFinance } from "@/components/finance-provider";
import { QuickTransaction } from "@/components/quick-transaction";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { monthLabel } from "@/lib/finance/calculations";
import { cn } from "@/lib/utils";

export const appNav = [
  { label: "Inicio", shortLabel: "Inicio", href: "/", icon: LayoutDashboard },
  { label: "Movimientos", shortLabel: "Movs.", href: "/movimientos", icon: ReceiptText },
  { label: "Presupuestos", shortLabel: "Plan", href: "/presupuestos", icon: Target },
  { label: "Cuentas", shortLabel: "Cuentas", href: "/cuentas", icon: WalletCards },
  { label: "Reportes", shortLabel: "Reportes", href: "/reportes", icon: LineChart },
  { label: "Ajustes", shortLabel: "Ajustes", href: "/ajustes", icon: Settings2 },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [editingTransactionId, setEditingTransactionId] = useState<string | undefined>();
  const { profile, online, pendingCount, syncError, currentMonth } = useFinance();

  useEffect(() => {
    const openQuickAdd = () => { setEditingTransactionId(undefined); setQuickAddOpen(true); };
    const editTransaction = (event: Event) => {
      const id = (event as CustomEvent<{ id: string }>).detail?.id;
      if (id) { setEditingTransactionId(id); setQuickAddOpen(true); }
    };
    window.addEventListener("moneva:quick-add", openQuickAdd);
    window.addEventListener("moneva:edit-transaction", editTransaction);
    if (new URLSearchParams(window.location.search).get("quickAdd") === "1") openQuickAdd();
    return () => {
      window.removeEventListener("moneva:quick-add", openQuickAdd);
      window.removeEventListener("moneva:edit-transaction", editTransaction);
    };
  }, []);

  const pageName = appNav.find((item) => item.href === "/" ? pathname === "/" : pathname.startsWith(item.href))?.label ?? (pathname.startsWith("/perfil") ? "Perfil" : "Tu espacio financiero");

  return <div className="min-h-screen bg-background noise">
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[236px] border-r bg-background/90 px-4 py-5 backdrop-blur-xl lg:flex lg:flex-col">
      <Link href="/" className="flex h-12 items-center gap-2 px-2" aria-label="Moneva, ir al inicio"><BrandMark /><span className="text-lg font-semibold tracking-[-0.03em]">Moneva</span></Link>
      <nav className="mt-7 space-y-1" aria-label="Navegación principal">{appNav.map(({ label, href, icon: Icon }) => { const active = href === "/" ? pathname === "/" : pathname.startsWith(href); return <Link key={href} href={href} className={cn("group flex h-11 items-center gap-3 rounded-xl px-3 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground", active && "bg-secondary text-foreground")}><span className={cn("grid size-8 place-items-center rounded-lg", active && "bg-primary/12 text-primary")}><Icon className="size-[18px]" strokeWidth={1.8} /></span>{label}{active ? <span className="ml-auto size-1.5 rounded-full bg-primary" /> : null}</Link>; })}</nav>
      <div className="mt-auto space-y-3">
        {(!online || pendingCount > 0 || syncError) ? <div className="flex items-start gap-2 rounded-xl bg-secondary px-3 py-2 text-xs leading-5 text-muted-foreground"><CloudOff className={cn("mt-0.5 size-4 shrink-0", syncError ? "text-destructive" : "text-amber-300")} />{syncError ? "Sincronización pendiente de revisión" : online ? `${pendingCount} cambios por sincronizar` : "Trabajando sin conexión"}</div> : null}
        <div className="border-t pt-5"><UserMenu profile={profile} wide /></div>
      </div>
    </aside>

    <div className="min-h-screen lg:ml-[236px]">
      <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b bg-background/82 px-5 backdrop-blur-xl md:px-8 lg:h-[76px] lg:border-b-0 lg:px-12">
        <Link href="/" className="flex items-center gap-2 lg:hidden"><BrandMark className="size-7" /><span className="font-semibold">Moneva</span></Link>
        <p className="hidden text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground lg:block">{pageName}</p>
        <div className="flex items-center gap-2"><span className="hidden items-center gap-2 px-2 text-xs capitalize text-muted-foreground sm:flex"><CalendarDays className="size-4" />{monthLabel(currentMonth)}</span><div className="lg:hidden"><UserMenu profile={profile} /></div></div>
      </header>
      <main className="mx-auto max-w-[1500px] px-4 pb-44 pt-6 sm:px-5 md:px-8 lg:px-12 lg:pb-10 lg:pt-5">{children}</main>
    </div>

    <Button onClick={() => { setEditingTransactionId(undefined); setQuickAddOpen(true); }} className="fixed bottom-24 right-4 z-20 size-14 rounded-full p-0 shadow-[0_16px_40px_-14px_var(--primary)] sm:right-5 lg:hidden" aria-label="Registrar movimiento"><Plus className="size-6" /></Button>
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/94 px-1 pb-[max(0.55rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl lg:hidden" aria-label="Navegación móvil"><div className="mx-auto grid max-w-xl grid-cols-6">{appNav.map(({ shortLabel, href, icon: Icon }) => { const active = href === "/" ? pathname === "/" : pathname.startsWith(href); return <Link key={href} href={href} className={cn("flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-0.5 text-[9px] text-muted-foreground", active && "text-primary")}><Icon className="size-[18px]" /><span className="w-full truncate text-center">{shortLabel}</span></Link>; })}</div></nav>
    <QuickTransaction key={editingTransactionId ?? (quickAddOpen ? "new-open" : "new-closed")} open={quickAddOpen} transactionId={editingTransactionId} onOpenChange={(open) => { setQuickAddOpen(open); if (!open) setEditingTransactionId(undefined); }} />
  </div>;
}

function UserMenu({ profile, wide = false }: { profile: ReturnType<typeof useFinance>["profile"]; wide?: boolean }) {
  const initials = profile?.displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "ME";
  return <DropdownMenu><DropdownMenuTrigger asChild><button className={cn("flex items-center gap-3 rounded-xl p-1.5 text-left transition-colors hover:bg-secondary", wide ? "w-full" : "rounded-full")} type="button" aria-label="Abrir menú de perfil"><Avatar className="size-9 border"><AvatarImage src={profile?.avatarUrl} alt="" referrerPolicy="no-referrer" /><AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">{initials}</AvatarFallback></Avatar>{wide ? <><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{profile?.displayName || "Tu perfil"}</span><span className="block truncate text-xs text-muted-foreground">Cuenta personal</span></span><Menu className="size-4 text-muted-foreground" /></> : null}</button></DropdownMenuTrigger><DropdownMenuContent align={wide ? "start" : "end"} className="w-56"><DropdownMenuLabel><span className="block truncate text-sm text-foreground">{profile?.displayName}</span><span className="block truncate font-normal text-muted-foreground">{profile?.email}</span></DropdownMenuLabel><DropdownMenuSeparator /><DropdownMenuItem asChild><Link href="/perfil"><UserRound />Perfil</Link></DropdownMenuItem><DropdownMenuItem asChild><Link href="/ajustes"><Settings2 />Ajustes</Link></DropdownMenuItem></DropdownMenuContent></DropdownMenu>;
}
