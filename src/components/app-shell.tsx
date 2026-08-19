"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as m from "motion/react-m";
import { useEffect, useState } from "react";
import { CalendarDays, ChevronRight, CloudOff, Ellipsis, LayoutDashboard, LineChart, Menu, Plus, ReceiptText, Settings2, ShieldCheck, Target, UserRound, WalletCards } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { useFinance } from "@/components/finance-provider";
import { QuickTransaction } from "@/components/quick-transaction";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { monthLabel } from "@/lib/finance/calculations";
import { cn } from "@/lib/utils";

export const appNav = [
  { label: "Inicio", href: "/", icon: LayoutDashboard },
  { label: "Movimientos", href: "/movimientos", icon: ReceiptText },
  { label: "Plan", href: "/presupuestos", icon: Target },
  { label: "Cuentas", href: "/cuentas", icon: WalletCards },
  { label: "Reportes", href: "/reportes", icon: LineChart },
  { label: "Ajustes", href: "/ajustes", icon: Settings2 },
] as const;

const mobilePrimaryNav = appNav.slice(0, 4);
const morePaths = ["/reportes", "/ajustes", "/perfil"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [pendingPath, setPendingPath] = useState<string>();
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
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

  const visualPendingPath = pendingPath && !isActivePath(pathname, pendingPath) ? pendingPath : undefined;
  const visualPath = visualPendingPath ?? pathname;
  const pageName = visualPath.startsWith("/ajustes/acceso") ? "Acceso privado"
    : visualPath.startsWith("/perfil") ? "Perfil"
      : visualPath.startsWith("/estructura") ? "Plan"
        : appNav.find((item) => isActivePath(visualPath, item.href))?.label ?? "Tu espacio financiero";
  const moreActive = morePaths.some((path) => visualPath.startsWith(path));
  const hideQuickAdd = pathname.startsWith("/presupuestos") || pathname.startsWith("/perfil") || pathname.startsWith("/ajustes");
  const startNavigation = (href: string) => {
    if (!isActivePath(pathname, href)) setPendingPath(href);
  };

  return <div className="min-h-screen bg-background noise">
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[236px] border-r bg-background px-4 py-5 lg:flex lg:flex-col">
      <Link href="/" className="flex h-12 items-center gap-2 px-2" aria-label="Moneva, ir al inicio"><BrandMark /><span className="text-lg font-semibold tracking-[-0.03em]">Moneva</span></Link>
      <nav className="mt-7 space-y-1" aria-label="Navegación principal">{appNav.map(({ label, href, icon: Icon }) => { const active = isActivePath(visualPath, href); return <Link key={href} href={href} prefetch onNavigate={() => startNavigation(href)} className={cn("tap-target group relative flex h-11 items-center gap-3 rounded-xl px-3 text-sm text-muted-foreground transition-[color,background-color,transform] hover:bg-secondary hover:text-foreground active:scale-[.985]", active && "bg-secondary text-foreground")}><span className={cn("grid size-8 place-items-center rounded-lg transition-colors", active && "bg-primary/12 text-primary")}><Icon className="size-[18px]" strokeWidth={1.8} /></span>{label}{active ? <m.span layoutId="desktop-active-dot" className="ml-auto size-1.5 rounded-full bg-primary" /> : null}</Link>; })}</nav>
      <div className="mt-auto space-y-3">
        {(!online || pendingCount > 0 || syncError) ? <div className="flex items-start gap-2 rounded-xl bg-secondary px-3 py-2 text-xs leading-5 text-muted-foreground"><CloudOff className={cn("mt-0.5 size-4 shrink-0", syncError ? "text-destructive" : "text-amber-300")} />{syncError ? "Sincronización pendiente de revisión" : online ? `${pendingCount} cambios por sincronizar` : "Trabajando sin conexión"}</div> : null}
        <div className="border-t pt-5"><UserMenu profile={profile} wide /></div>
      </div>
    </aside>

    <div className="min-h-screen lg:ml-[236px]">
      <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b bg-background px-4 sm:px-5 md:px-8 lg:h-[76px] lg:border-b-0 lg:px-12">
        <Link href="/" className="-ml-2 flex min-h-11 min-w-0 items-center gap-2 rounded-xl px-2 lg:hidden" aria-label={`${pageName}, ir al inicio`}><BrandMark className="size-7 shrink-0" /><span className="truncate font-semibold tracking-[-.02em]">{pageName}</span></Link>
        <p className="hidden text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground lg:block">{pageName}</p>
        <div className="flex items-center gap-2"><span className="hidden items-center gap-2 px-2 text-xs capitalize text-muted-foreground sm:flex"><CalendarDays className="size-4" />{monthLabel(currentMonth)}</span><div className="lg:hidden"><UserMenu profile={profile} /></div></div>
      </header>
      <m.main key={pathname} initial={{ opacity: 0.72, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.14, ease: [0.2, 0, 0, 1] }} aria-busy={Boolean(visualPendingPath)} className="mx-auto max-w-[1500px] px-4 pb-40 pt-5 sm:px-5 md:px-8 lg:px-12 lg:pb-10 lg:pt-5">{children}</m.main>
    </div>

    {!hideQuickAdd ? <Button onClick={() => { setEditingTransactionId(undefined); setQuickAddOpen(true); }} className="fixed bottom-[5.65rem] right-4 z-20 size-14 rounded-full p-0 shadow-[0_16px_40px_-14px_var(--primary)] transition-transform active:scale-90 sm:right-5 lg:hidden" aria-label="Registrar movimiento"><Plus className="size-6" /></Button> : null}
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-background px-2 pb-[max(0.55rem,env(safe-area-inset-bottom))] pt-1.5 lg:hidden" aria-label="Navegación móvil">
      <div className="mx-auto grid max-w-xl grid-cols-5 gap-1">{mobilePrimaryNav.map(({ label, href, icon: Icon }) => { const active = isActivePath(visualPath, href); return <MobileNavLink key={href} active={active} href={href} label={label} icon={Icon} onNavigate={startNavigation} />; })}<button type="button" onClick={() => setMoreOpen(true)} className={cn("tap-target relative flex min-h-[54px] min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[9px] font-medium text-muted-foreground transition-[color,transform] active:scale-[.97] min-[360px]:text-[10px]", moreActive && "text-primary")} aria-label="Abrir más opciones" aria-current={moreActive ? "page" : undefined}>{moreActive ? <m.span layoutId="mobile-active-pill" className="absolute inset-x-1 top-0 h-10 rounded-xl bg-primary/10" transition={{ type: "spring", stiffness: 600, damping: 44, mass: 0.55 }} /> : null}<Ellipsis className="relative size-[19px]" /><span className="relative truncate">Más</span></button></div>
    </nav>

    <MobileMoreSheet open={moreOpen} onOpenChange={setMoreOpen} pathname={visualPath} profile={profile} online={online} pendingCount={pendingCount} onNavigate={startNavigation} />
    <QuickTransaction key={editingTransactionId ?? (quickAddOpen ? "new-open" : "new-closed")} open={quickAddOpen} transactionId={editingTransactionId} onOpenChange={(open) => { setQuickAddOpen(open); if (!open) setEditingTransactionId(undefined); }} />
  </div>;
}

function MobileNavLink({ active, href, label, icon: Icon, onNavigate }: { active: boolean; href: string; label: string; icon: typeof LayoutDashboard; onNavigate: (href: string) => void }) {
  return <Link href={href} prefetch onNavigate={() => onNavigate(href)} aria-label={label} aria-current={active ? "page" : undefined} className={cn("tap-target relative flex min-h-[54px] min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[9px] font-medium text-muted-foreground transition-[color,transform] active:scale-[.97] min-[360px]:text-[10px]", active && "text-primary")}>{active ? <m.span layoutId="mobile-active-pill" className="absolute inset-x-1 top-0 h-10 rounded-xl bg-primary/10" transition={{ type: "spring", stiffness: 600, damping: 44, mass: 0.55 }} /> : null}<m.span className="relative" animate={active ? { y: -1 } : { y: 0 }} transition={{ duration: 0.12 }}><Icon className="size-[19px]" strokeWidth={active ? 2.2 : 1.8} /></m.span><span className="relative w-full truncate text-center"><span className="max-[339px]:hidden">{label}</span><span className="hidden max-[339px]:inline">{label === "Movimientos" ? "Movs." : label}</span></span></Link>;
}

function MobileMoreSheet({ open, onOpenChange, pathname, profile, online, pendingCount, onNavigate }: { open: boolean; onOpenChange: (open: boolean) => void; pathname: string; profile: ReturnType<typeof useFinance>["profile"]; online: boolean; pendingCount: number; onNavigate: (href: string) => void }) {
  const initials = profile?.displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "ME";
  const items = [
    { label: "Reportes", detail: "Tendencias y evolución", href: "/reportes", icon: LineChart },
    { label: "Ajustes", detail: "Temas, datos y seguridad", href: "/ajustes", icon: Settings2 },
    { label: "Perfil", detail: "Nombre y preferencias básicas", href: "/perfil", icon: UserRound },
  ] as const;
  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent side="bottom" showCloseButton={false} className="mobile-scroll max-h-[88dvh] gap-0 overflow-y-auto rounded-t-[1.75rem] border-x px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-24px_70px_-35px_rgba(0,0,0,.65)]"><div className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/25" /><SheetHeader className="px-1 pb-4 pt-2"><SheetTitle className="text-xl tracking-[-.03em]">Más de Moneva</SheetTitle><SheetDescription>Todo lo secundario, sin recargar tu barra principal.</SheetDescription></SheetHeader><div className="divide-y border-y">{items.map(({ label, detail, href, icon: Icon }) => <SheetClose asChild key={href}><Link href={href} prefetch onNavigate={() => onNavigate(href)} className={cn("tap-target flex min-h-16 items-center gap-3 py-3 transition-colors active:bg-secondary/70", pathname.startsWith(href) && "text-primary")}><span className="grid size-10 place-items-center rounded-xl bg-secondary"><Icon className="size-[18px]" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{label}</span><span className="block truncate text-xs text-muted-foreground">{detail}</span></span><ChevronRight className="size-4 text-muted-foreground" /></Link></SheetClose>)}</div><div className="mt-4 flex items-center gap-3 rounded-2xl bg-secondary/55 p-3"><Avatar className="size-10 border"><AvatarImage src={profile?.avatarUrl} alt="" referrerPolicy="no-referrer" /><AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">{initials}</AvatarFallback></Avatar><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{profile?.displayName || "Tu perfil"}</p><p className="truncate text-xs text-muted-foreground">{online ? pendingCount ? `${pendingCount} cambios por sincronizar` : "Datos sincronizados" : "Trabajando sin conexión"}</p></div>{online && !pendingCount ? <ShieldCheck className="size-5 text-primary" /> : <CloudOff className="size-5 text-amber-400" />}</div></SheetContent></Sheet>;
}

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

function UserMenu({ profile, wide = false }: { profile: ReturnType<typeof useFinance>["profile"]; wide?: boolean }) {
  const initials = profile?.displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "ME";
  return <DropdownMenu><DropdownMenuTrigger asChild><button className={cn("flex items-center gap-3 rounded-xl p-1.5 text-left transition-colors hover:bg-secondary", wide ? "w-full" : "rounded-full")} type="button" aria-label="Abrir menú de perfil"><Avatar className="size-9 border"><AvatarImage src={profile?.avatarUrl} alt="" referrerPolicy="no-referrer" /><AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">{initials}</AvatarFallback></Avatar>{wide ? <><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{profile?.displayName || "Tu perfil"}</span><span className="block truncate text-xs text-muted-foreground">Cuenta personal</span></span><Menu className="size-4 text-muted-foreground" /></> : null}</button></DropdownMenuTrigger><DropdownMenuContent align={wide ? "start" : "end"} className="w-56"><DropdownMenuLabel><span className="block truncate text-sm text-foreground">{profile?.displayName}</span><span className="block truncate font-normal text-muted-foreground">{profile?.email}</span></DropdownMenuLabel><DropdownMenuSeparator /><DropdownMenuItem asChild><Link href="/perfil"><UserRound />Perfil</Link></DropdownMenuItem><DropdownMenuItem asChild><Link href="/ajustes"><Settings2 />Ajustes</Link></DropdownMenuItem></DropdownMenuContent></DropdownMenu>;
}
