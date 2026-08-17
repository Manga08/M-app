"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Bell, CalendarDays, CloudOff, LayoutDashboard, LineChart,
  Menu, Plus, ReceiptText, Settings2, Target, WalletCards,
} from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { QuickTransaction } from "@/components/quick-transaction";
import { Button } from "@/components/ui/button";
import { useFinance } from "@/components/finance-provider";
import { cn } from "@/lib/utils";

export const appNav = [
  { label: "Inicio", shortLabel: "Inicio", href: "/", icon: LayoutDashboard },
  { label: "Movimientos", shortLabel: "Movimientos", href: "/movimientos", icon: ReceiptText },
  { label: "Presupuestos", shortLabel: "Presupuesto", href: "/presupuestos", icon: Target },
  { label: "Cuentas", shortLabel: "Cuentas", href: "/cuentas", icon: WalletCards },
  { label: "Reportes", shortLabel: "Reportes", href: "/reportes", icon: LineChart },
  { label: "Ajustes", shortLabel: "Ajustes", href: "/ajustes", icon: Settings2 },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const { online, pendingCount } = useFinance();

  useEffect(() => {
    const openQuickAdd = () => setQuickAddOpen(true);
    window.addEventListener("moneva:quick-add", openQuickAdd);
    return () => window.removeEventListener("moneva:quick-add", openQuickAdd);
  }, []);

  return (
    <div className="min-h-screen bg-background noise">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[236px] border-r bg-background/90 px-4 py-5 backdrop-blur-xl lg:flex lg:flex-col">
        <Link href="/" className="flex h-12 items-center gap-2 px-2" aria-label="Moneva, ir al inicio">
          <BrandMark /><span className="text-lg font-semibold tracking-[-0.03em]">Moneva</span>
        </Link>
        <nav className="mt-7 space-y-1" aria-label="Navegación principal">
          {appNav.map(({ label, href, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return <Link key={href} href={href} className={cn("group flex h-11 items-center gap-3 rounded-xl px-3 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground", active && "bg-secondary text-foreground")}>
              <span className={cn("grid size-8 place-items-center rounded-lg", active && "bg-primary/12 text-primary")}><Icon className="size-[18px]" strokeWidth={1.8} /></span>
              {label}{active && <span className="ml-auto size-1.5 rounded-full bg-primary" />}
            </Link>;
          })}
        </nav>
        <div className="mt-auto space-y-3">
          {(!online || pendingCount > 0) && <div className="flex items-center gap-2 rounded-xl bg-secondary px-3 py-2 text-xs text-muted-foreground"><CloudOff className="size-4 text-amber-300" />{online ? `${pendingCount} cambios por sincronizar` : "Trabajando sin conexión"}</div>}
          <div className="border-t pt-5">
            <button className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-secondary" type="button">
              <span className="grid size-9 place-items-center rounded-full bg-primary/15 text-sm font-semibold text-primary">AM</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">Andrés M.</span><span className="block truncate text-xs text-muted-foreground">Cuenta personal</span></span>
              <Menu className="size-4 text-muted-foreground" />
            </button>
          </div>
        </div>
      </aside>

      <div className="min-h-screen lg:ml-[236px]">
        <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b bg-background/82 px-5 backdrop-blur-xl md:px-8 lg:h-[76px] lg:border-b-0 lg:px-12">
          <Link href="/" className="flex items-center gap-2 lg:hidden"><BrandMark className="size-7" /><span className="font-semibold">Moneva</span></Link>
          <p className="hidden text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground lg:block">{appNav.find((item) => item.href === pathname)?.label ?? "Tu espacio financiero"}</p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="hidden gap-2 text-muted-foreground sm:flex"><CalendarDays className="size-4" />Agosto 2026</Button>
            <Button variant="ghost" size="icon" className="relative rounded-full" aria-label="Notificaciones"><Bell className="size-[19px]" /><span className="absolute right-2.5 top-2.5 size-1.5 rounded-full bg-primary" /></Button>
          </div>
        </header>
        <main className="mx-auto max-w-[1500px] px-5 pb-28 pt-7 md:px-8 lg:px-12 lg:pb-10 lg:pt-5">{children}</main>
      </div>

      <Button onClick={() => setQuickAddOpen(true)} className="fixed bottom-24 right-5 z-20 size-14 rounded-full p-0 shadow-[0_16px_40px_-14px_var(--primary)] lg:hidden" aria-label="Registrar movimiento"><Plus className="size-6" /></Button>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/92 px-2 pb-[max(0.55rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl lg:hidden" aria-label="Navegación móvil">
        <div className="mx-auto grid max-w-md grid-cols-5">{[appNav[0], appNav[1], appNav[2], appNav[3], appNav[5]].map(({ shortLabel, href, icon: Icon }) => { const active = href === "/" ? pathname === "/" : pathname.startsWith(href); return <Link key={href} href={href} className={cn("flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg text-[10px] text-muted-foreground", active && "text-primary")}><Icon className="size-[19px]" /><span>{shortLabel}</span></Link>; })}</div>
      </nav>
      <QuickTransaction open={quickAddOpen} onOpenChange={setQuickAddOpen} />
    </div>
  );
}
