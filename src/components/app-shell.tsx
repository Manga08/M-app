"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { CalendarDays, ChevronRight, CloudOff, Ellipsis, Flag, LayoutDashboard, LineChart, LoaderCircle, Menu, Plus, ReceiptText, Settings2, ShieldCheck, Target, UserRound, WalletCards } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { useFinance } from "@/components/finance-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { monthLabel } from "@/lib/finance/calculations";
import { cn } from "@/lib/utils";

const loadQuickTransaction = () => import("@/components/quick-transaction");
const QuickTransaction = dynamic(() => loadQuickTransaction().then((module) => module.QuickTransaction), { ssr: false });

export const appNav = [
  { label: "Inicio", href: "/", icon: LayoutDashboard },
  { label: "Movimientos", href: "/movimientos", icon: ReceiptText },
  { label: "Plan", href: "/presupuestos", icon: Target },
  { label: "Metas", href: "/metas", icon: Flag },
  { label: "Cuentas", href: "/cuentas", icon: WalletCards },
  { label: "Reportes", href: "/reportes", icon: LineChart },
  { label: "Ajustes", href: "/ajustes", icon: Settings2 },
] as const;

const mobilePrimaryNav = appNav.slice(0, 3);
const morePaths = ["/metas", "/cuentas", "/reportes", "/ajustes", "/perfil"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ownedOverlay = useRef<"movement" | "more" | null>(null);
  const currentOverlay = searchParams.get("overlay");
  const quickAddOpen = currentOverlay === "movement" || searchParams.get("quickAdd") === "1";
  const activeOverlay = currentOverlay === "movement" || searchParams.get("quickAdd") === "1" ? "movement" : currentOverlay === "more" ? "more" : null;
  const previousOverlay = useRef<"movement" | "more" | null>(activeOverlay);
  const moreOpen = currentOverlay === "more";
  const editingTransactionId = quickAddOpen ? searchParams.get("transaction") || undefined : undefined;
  const editingRecurringRuleId = quickAddOpen ? searchParams.get("rule") || undefined : undefined;
  const initialFinancialTargetId = quickAddOpen ? searchParams.get("target") || undefined : undefined;
  const initialTiming = quickAddOpen && searchParams.get("timing") === "recurring" ? "recurring" as const : undefined;
  const initialMovementType = quickAddOpen && ["income", "expense", "transfer"].includes(searchParams.get("type") ?? "")
    ? searchParams.get("type") as "income" | "expense" | "transfer"
    : undefined;
  const initialTargetEffect = quickAddOpen && ["advance", "reverse"].includes(searchParams.get("effect") ?? "")
    ? searchParams.get("effect") as "advance" | "reverse"
    : undefined;
  const initialOccurredOn = quickAddOpen && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.get("date") ?? "")
    ? searchParams.get("date") ?? undefined
    : undefined;
  const { profile, online, pendingCount, syncError, currentMonth, hydrated, syncing, dataSource } = useFinance();

  const writeOverlayUrl = useCallback((overlay: "movement" | "more", transactionId?: string, recurringRuleId?: string, financialTargetId?: string, preset?: { timing?: "recurring"; type?: "income" | "expense" | "transfer"; effect?: "advance" | "reverse"; occurredOn?: string }) => {
    const url = new URL(window.location.href);
    const alreadyOpen = url.searchParams.get("overlay") === overlay;
    url.searchParams.delete("quickAdd");
    url.searchParams.set("overlay", overlay);
    if (transactionId) url.searchParams.set("transaction", transactionId);
    else url.searchParams.delete("transaction");
    if (recurringRuleId) url.searchParams.set("rule", recurringRuleId);
    else url.searchParams.delete("rule");
    if (financialTargetId) url.searchParams.set("target", financialTargetId);
    else url.searchParams.delete("target");
    if (preset?.timing) url.searchParams.set("timing", preset.timing);
    else url.searchParams.delete("timing");
    if (preset?.type) url.searchParams.set("type", preset.type);
    else url.searchParams.delete("type");
    if (preset?.effect) url.searchParams.set("effect", preset.effect);
    else url.searchParams.delete("effect");
    if (preset?.occurredOn) url.searchParams.set("date", preset.occurredOn);
    else url.searchParams.delete("date");
    if (overlay === "movement" && financialTargetId) {
      url.searchParams.delete("meta");
      url.searchParams.delete("editar");
    }
    const nextUrl = `${url.pathname}${url.search}${url.hash}`;

    if (alreadyOpen) window.history.replaceState(null, "", nextUrl);
    else {
      window.history.pushState(null, "", nextUrl);
      ownedOverlay.current = overlay;
    }
  }, []);

  const openMovement = useCallback((transactionId?: string, financialTargetId?: string, preset?: { timing?: "recurring"; type?: "income" | "expense" | "transfer"; effect?: "advance" | "reverse"; occurredOn?: string }) => {
    writeOverlayUrl("movement", transactionId, undefined, financialTargetId, preset);
  }, [writeOverlayUrl]);

  const openRecurringRule = useCallback((ruleId: string) => {
    writeOverlayUrl("movement", undefined, ruleId);
  }, [writeOverlayUrl]);

  const openMore = useCallback(() => {
    writeOverlayUrl("more");
  }, [writeOverlayUrl]);

  const dismissOverlay = useCallback((overlay: "movement" | "more") => {
    const url = new URL(window.location.href);
    const matches = url.searchParams.get("overlay") === overlay
      || (overlay === "movement" && url.searchParams.get("quickAdd") === "1");
    if (!matches) return;

    url.searchParams.delete("overlay");
    url.searchParams.delete("quickAdd");
    url.searchParams.delete("transaction");
    url.searchParams.delete("rule");
    url.searchParams.delete("target");
    url.searchParams.delete("timing");
    url.searchParams.delete("type");
    url.searchParams.delete("effect");
    url.searchParams.delete("date");
    const fallbackUrl = `${url.pathname}${url.search}${url.hash}`;

    if (ownedOverlay.current === overlay) {
      ownedOverlay.current = null;
      window.history.back();
      window.setTimeout(() => {
        const current = new URL(window.location.href);
        const stillOpen = current.searchParams.get("overlay") === overlay
          || (overlay === "movement" && current.searchParams.get("quickAdd") === "1");
        if (stillOpen) window.history.replaceState(null, "", fallbackUrl);
      }, 160);
      return;
    }

    window.history.replaceState(null, "", fallbackUrl);
  }, []);

  useEffect(() => {
    if (!previousOverlay.current && activeOverlay) ownedOverlay.current = activeOverlay;
    if (previousOverlay.current && !activeOverlay) ownedOverlay.current = null;
    previousOverlay.current = activeOverlay;
  }, [activeOverlay]);

  useEffect(() => {
    const openQuickAdd = (event: Event) => {
      const detail = (event as CustomEvent<{ financialTargetId?: string; timing?: "recurring"; type?: "income" | "expense" | "transfer"; effect?: "advance" | "reverse"; occurredOn?: string }>).detail;
      if (hydrated) openMovement(undefined, detail?.financialTargetId, detail);
    };
    const editTransaction = (event: Event) => {
      const id = (event as CustomEvent<{ id: string }>).detail?.id;
      if (id && hydrated) openMovement(id);
    };
    const editRecurringRule = (event: Event) => {
      const id = (event as CustomEvent<{ id: string }>).detail?.id;
      if (id && hydrated) openRecurringRule(id);
    };
    window.addEventListener("moneva:quick-add", openQuickAdd);
    window.addEventListener("moneva:edit-transaction", editTransaction);
    window.addEventListener("moneva:edit-recurring-rule", editRecurringRule);
    return () => {
      window.removeEventListener("moneva:quick-add", openQuickAdd);
      window.removeEventListener("moneva:edit-transaction", editTransaction);
      window.removeEventListener("moneva:edit-recurring-rule", editRecurringRule);
    };
  }, [hydrated, openMovement, openRecurringRule]);

  useEffect(() => {
    const idleWindow = window as Window & { requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number };
    if (typeof idleWindow.requestIdleCallback === "function") {
      const idle = idleWindow.requestIdleCallback(() => { void loadQuickTransaction(); }, { timeout: 2500 });
      return () => window.cancelIdleCallback(idle);
    }
    const timer = globalThis.setTimeout(() => { void loadQuickTransaction(); }, 1800);
    return () => globalThis.clearTimeout(timer);
  }, []);

  const pageName = pathname.startsWith("/ajustes/acceso") ? "Acceso privado"
    : pathname.startsWith("/perfil") ? "Perfil"
      : pathname.startsWith("/estructura") ? "Plan"
        : appNav.find((item) => isActivePath(pathname, item.href))?.label ?? "Tu espacio financiero";
  const moreActive = morePaths.some((path) => pathname.startsWith(path));

  return <div className="min-h-screen min-w-0 bg-background noise">
    <a href="#main-content" className="sr-only fixed left-3 z-[100] rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background shadow-lg focus:not-sr-only focus:top-[max(.75rem,env(safe-area-inset-top))] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">Saltar al contenido principal</a>
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[236px] border-r bg-background px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))] lg:flex lg:flex-col">
      <Link href="/" className="flex h-12 items-center gap-2 px-2" aria-label="Moneva, ir al inicio"><BrandMark /><span className="text-lg font-semibold tracking-[-0.03em]">Moneva</span></Link>
      <nav className="mt-7 space-y-1" aria-label="Navegación principal">{appNav.map(({ label, href, icon: Icon }) => { const active = isActivePath(pathname, href); return <Link key={href} href={href} prefetch aria-current={active ? "page" : undefined} className={cn("tap-target group relative flex h-11 items-center gap-3 rounded-xl px-3 text-sm text-muted-foreground transition-[color,background-color,transform] duration-150 ease-out hover:bg-secondary hover:text-foreground active:scale-[.985] motion-reduce:transition-none", active && "bg-secondary text-foreground")}><span className={cn("grid size-8 place-items-center rounded-lg transition-colors duration-150", active && "bg-primary/12 text-primary")}><Icon className="size-[18px]" strokeWidth={1.8} /></span>{label}{active ? <span className="ml-auto size-1.5 rounded-full bg-primary" aria-hidden="true" /> : null}</Link>; })}</nav>
      <div className="mt-auto space-y-3">
        <Button onPointerDown={() => { void loadQuickTransaction(); }} onClick={() => openMovement()} disabled={!hydrated} className="h-11 w-full rounded-xl shadow-[0_14px_32px_-18px_var(--primary)]"><Plus className="size-[18px]" />Nuevo movimiento</Button>
        {(!online || pendingCount > 0 || syncError) ? <div className="flex items-start gap-2 rounded-xl bg-secondary px-3 py-2 text-xs leading-5 text-muted-foreground"><CloudOff className={cn("mt-0.5 size-4 shrink-0", syncError ? "text-destructive" : "text-warning")} />{syncError ? "Sincronización pendiente de revisión" : online ? `${pendingCount} cambios por sincronizar` : "Trabajando sin conexión"}</div> : null}
        <div className="border-t pt-5"><UserMenu profile={profile} wide /></div>
      </div>
    </aside>

    <div className="min-h-screen min-w-0 lg:ml-[236px]">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/94 pt-[env(safe-area-inset-top)] backdrop-blur-xl supports-[backdrop-filter]:bg-background/88 lg:h-14 lg:pt-0">
        <div className="mx-auto flex h-[52px] w-full max-w-[1536px] items-center justify-between gap-3 px-4 sm:px-5 md:px-8 lg:h-full lg:px-12 2xl:px-16">
          <Link href="/" className="-ml-2 flex min-h-11 min-w-0 items-center gap-2 rounded-xl px-2 transition-colors duration-150 hover:bg-secondary/65 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none lg:hidden" aria-label={`${pageName}, ir al inicio`}><BrandMark className="size-6 shrink-0" /><span className="truncate text-sm font-semibold tracking-[-.02em]">{pageName}</span></Link>
          <p className="hidden truncate text-sm font-medium tracking-[-.015em] lg:block">{pageName}</p>
          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
            <span className="hidden min-h-11 items-center gap-2 px-2 text-xs text-muted-foreground sm:flex"><CalendarDays className="size-4" aria-hidden="true" /><span className="capitalize">{monthLabel(currentMonth)}</span></span>
            <SyncStatusIndicator online={online} pendingCount={pendingCount} syncError={syncError} syncing={syncing} dataSource={dataSource} />
          </div>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} data-app-content aria-busy={!hydrated} className="mx-auto w-full max-w-[1536px] min-w-0 scroll-mt-[calc(52px+env(safe-area-inset-top))] px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-5 outline-none sm:px-5 md:px-8 lg:scroll-mt-14 lg:px-12 lg:pb-10 lg:pt-5 2xl:px-16">{hydrated ? children : <AppLedgerLoading />}</main>
    </div>

    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-30 lg:hidden" aria-label="Navegación móvil">
      <div className="pointer-events-auto border-t border-border/75 bg-background pb-[max(0.25rem,env(safe-area-inset-bottom))] shadow-[0_-12px_32px_-24px_rgba(0,0,0,.72)]">
        <div className="mx-auto grid h-[66px] max-w-lg grid-cols-5 px-2 sm:px-4">
          <MobileNavLink active={isActivePath(pathname, mobilePrimaryNav[0].href)} {...mobilePrimaryNav[0]} />
          <MobileNavLink active={isActivePath(pathname, mobilePrimaryNav[1].href)} {...mobilePrimaryNav[1]} compactLabel="Movs." />
          <button type="button" onPointerDown={() => { void loadQuickTransaction(); }} onClick={() => openMovement()} disabled={!hydrated} className="tap-target group flex h-[66px] min-w-0 flex-col items-center justify-center gap-[3px] px-1 text-[11px] font-medium leading-[13px] text-primary focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary disabled:opacity-45" aria-label="Registrar movimiento" aria-haspopup="dialog" aria-expanded={quickAddOpen}><span className="grid size-10 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_7px_18px_-10px_var(--primary)] transition-transform duration-100 ease-out group-active:scale-[.94] motion-reduce:transition-none"><Plus className="size-[21px]" strokeWidth={2.35} /></span><span>Nuevo</span></button>
          <MobileNavLink active={isActivePath(pathname, mobilePrimaryNav[2].href)} {...mobilePrimaryNav[2]} />
          <button type="button" onClick={openMore} className="tap-target group flex h-[66px] min-w-0 flex-col items-center justify-center gap-[3px] px-1 text-[11px] font-medium leading-[13px] text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary" aria-label="Abrir más opciones" aria-expanded={moreOpen} aria-haspopup="dialog"><MobileDestination active={moreActive} label="Más" icon={Ellipsis} /></button>
        </div>
      </div>
    </nav>

    <MobileMoreSheet open={moreOpen} onOpenChange={(open) => { if (open) openMore(); else dismissOverlay("more"); }} pathname={pathname} profile={profile} online={online} pendingCount={pendingCount} syncing={syncing} dataSource={dataSource} onNavigate={() => { ownedOverlay.current = null; }} />
    {hydrated && quickAddOpen ? <QuickTransaction key={editingTransactionId ?? editingRecurringRuleId ?? `${initialFinancialTargetId ?? "new"}-${initialTiming ?? "now"}-${initialMovementType ?? "expense"}-${initialOccurredOn ?? "today"}`} open transactionId={editingTransactionId} recurringRuleId={editingRecurringRuleId} initialFinancialTargetId={initialFinancialTargetId} initialTiming={initialTiming} initialType={initialMovementType} initialTargetEffect={initialTargetEffect} initialOccurredOn={initialOccurredOn} onOpenChange={(open) => { if (open) { if (editingRecurringRuleId) openRecurringRule(editingRecurringRuleId); else openMovement(editingTransactionId, initialFinancialTargetId, { timing: initialTiming, type: initialMovementType, effect: initialTargetEffect, occurredOn: initialOccurredOn }); } else dismissOverlay("movement"); }} /> : null}
  </div>;
}

function MobileNavLink({ active, href, label, compactLabel, icon: Icon }: { active: boolean; href: string; label: string; compactLabel?: string; icon: typeof LayoutDashboard }) {
  return <Link href={href} prefetch aria-label={label} aria-current={active ? "page" : undefined} className="tap-target group flex h-[66px] min-w-0 flex-col items-center justify-center gap-[3px] px-1 text-[11px] font-medium leading-[13px] text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"><MobileDestination active={active} label={compactLabel ?? label} icon={Icon} /></Link>;
}

function MobileDestination({ active, label, icon: Icon }: { active: boolean; label: string; icon: typeof LayoutDashboard }) {
  return <><span className={cn("grid h-8 w-[3.25rem] place-items-center rounded-full transition-[color,background-color,transform] duration-150 ease-out group-active:scale-[.94] motion-reduce:transition-none", active ? "bg-primary/14 text-primary" : "bg-transparent text-muted-foreground group-active:bg-secondary")}><Icon className="size-5" strokeWidth={active ? 2.2 : 1.8} /></span><span className={cn("w-full truncate text-center transition-colors duration-150 motion-reduce:transition-none", active && "text-primary")}>{label}</span></>;
}

function MobileMoreSheet({ open, onOpenChange, pathname, profile, online, pendingCount, syncing, dataSource, onNavigate }: { open: boolean; onOpenChange: (open: boolean) => void; pathname: string; profile: ReturnType<typeof useFinance>["profile"]; online: boolean; pendingCount: number; syncing: boolean; dataSource: ReturnType<typeof useFinance>["dataSource"]; onNavigate: (href: string) => void }) {
  const initials = profile?.displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "ME";
  const checkingCloud = online && (syncing || dataSource === "local");
  const items = [
    { label: "Metas y deudas", detail: "Objetivos, pagos y avances", href: "/metas", icon: Flag },
    { label: "Cuentas", detail: "Bancos, efectivo y saldos", href: "/cuentas", icon: WalletCards },
    { label: "Reportes", detail: "Tendencias y evolución", href: "/reportes", icon: LineChart },
    { label: "Ajustes", detail: "Temas, datos y seguridad", href: "/ajustes", icon: Settings2 },
    { label: "Perfil", detail: "Nombre y preferencias básicas", href: "/perfil", icon: UserRound },
  ] as const;
  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent side="bottom" showCloseButton={false} className="mobile-scroll max-h-[88dvh] gap-0 overflow-y-auto rounded-t-[1.75rem] border-x px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-24px_70px_-35px_rgba(0,0,0,.65)] motion-reduce:transition-none motion-reduce:data-open:animate-none motion-reduce:data-closed:animate-none"><SheetHeader className="px-1 pb-4 pt-2"><SheetTitle className="text-xl tracking-[-.03em]">Más de Moneva</SheetTitle><SheetDescription>Todo lo secundario, sin recargar tu barra principal.</SheetDescription></SheetHeader><div className="divide-y border-y">{items.map(({ label, detail, href, icon: Icon }) => <Link key={href} href={href} replace prefetch onNavigate={() => onNavigate(href)} className={cn("tap-target flex min-h-16 items-center gap-3 py-3 transition-colors duration-150 active:bg-secondary/70 motion-reduce:transition-none", pathname.startsWith(href) && "text-primary")}><span className="grid size-10 place-items-center rounded-xl bg-secondary"><Icon className="size-[18px]" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{label}</span><span className="block truncate text-xs text-muted-foreground">{detail}</span></span><ChevronRight className="size-4 text-muted-foreground" /></Link>)}</div><div className="mt-4 flex items-center gap-3 rounded-2xl bg-secondary/55 p-3"><Avatar className="size-10 border"><AvatarImage src={profile?.avatarUrl} alt="" referrerPolicy="no-referrer" /><AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">{initials}</AvatarFallback></Avatar><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{profile?.displayName || "Tu perfil"}</p><p className="truncate text-xs text-muted-foreground">{checkingCloud ? "Comprobando la nube…" : online ? pendingCount ? `${pendingCount} cambios por sincronizar` : "Datos sincronizados" : "Trabajando sin conexión"}</p></div>{checkingCloud ? <LoaderCircle className="size-5 animate-spin text-primary motion-reduce:animate-none" /> : online && !pendingCount ? <ShieldCheck className="size-5 text-primary" /> : <CloudOff className="size-5 text-warning" />}</div></SheetContent></Sheet>;
}

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

function UserMenu({ profile, wide = false }: { profile: ReturnType<typeof useFinance>["profile"]; wide?: boolean }) {
  const initials = profile?.displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "ME";
  return <DropdownMenu><DropdownMenuTrigger asChild><button className={cn("flex items-center gap-3 rounded-xl p-1.5 text-left transition-colors duration-150 hover:bg-secondary motion-reduce:transition-none", wide ? "w-full" : "rounded-full")} type="button" aria-label="Abrir menú de perfil"><Avatar className="size-9 border"><AvatarImage src={profile?.avatarUrl} alt="" referrerPolicy="no-referrer" /><AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">{initials}</AvatarFallback></Avatar>{wide ? <><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{profile?.displayName || "Tu perfil"}</span><span className="block truncate text-xs text-muted-foreground">Cuenta personal</span></span><Menu className="size-4 text-muted-foreground" /></> : null}</button></DropdownMenuTrigger><DropdownMenuContent align={wide ? "start" : "end"} className="w-56"><DropdownMenuLabel><span className="block truncate text-sm text-foreground">{profile?.displayName}</span><span className="block truncate font-normal text-muted-foreground">{profile?.email}</span></DropdownMenuLabel><DropdownMenuSeparator /><DropdownMenuItem asChild><Link href="/perfil"><UserRound />Perfil</Link></DropdownMenuItem><DropdownMenuItem asChild><Link href="/ajustes"><Settings2 />Ajustes</Link></DropdownMenuItem></DropdownMenuContent></DropdownMenu>;
}

function SyncStatusIndicator({ online, pendingCount, syncError, syncing, dataSource }: { online: boolean; pendingCount: number; syncError: string | null; syncing: boolean; dataSource: ReturnType<typeof useFinance>["dataSource"] }) {
  const checkingCloud = online && (syncing || dataSource === "local");
  const status = syncError
    ? { label: "Requiere atención", dot: "bg-destructive", text: "text-destructive" }
    : !online
      ? { label: "Sin conexión", dot: "bg-destructive", text: "text-destructive" }
      : pendingCount > 0
        ? { label: pendingCount === 1 ? "1 cambio pendiente" : `${pendingCount} cambios pendientes`, dot: "bg-warning", text: "text-warning" }
        : checkingCloud
          ? { label: "Sincronizando", dot: "bg-info", text: "text-info" }
          : { label: "Sincronizado", dot: "bg-positive", text: "text-positive" };

  return <>
    <Link href="/ajustes#estado" aria-label={`Estado de sincronización: ${status.label}. Abrir detalles`} className={cn("group flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl px-2 text-xs font-medium transition-[color,background-color,transform] duration-150 hover:bg-secondary/65 active:scale-[.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none sm:min-w-0 sm:justify-start sm:px-3", status.text)}>
      <span className="relative grid size-4 shrink-0 place-items-center" aria-hidden="true">
        {checkingCloud && !syncError && pendingCount === 0 ? <span className={cn("absolute size-3 rounded-full opacity-35 motion-safe:animate-ping", status.dot)} /> : null}
        <span className={cn("relative size-2.5 rounded-full ring-2 ring-background", status.dot)} />
      </span>
      <span className="hidden whitespace-nowrap sm:inline">{status.label}</span>
    </Link>
    <span className="sr-only" role="status" aria-live="polite">Estado de sincronización: {status.label}</span>
  </>;
}

function AppLedgerLoading() {
  return <section role="status" aria-live="polite" aria-label="Cargando tus datos financieros" className="py-2">
    <div className="h-3 w-24 animate-pulse rounded-full bg-muted motion-reduce:animate-none" />
    <div className="mt-4 h-10 w-64 max-w-4/5 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
    <div className="mt-3 h-4 w-full max-w-md animate-pulse rounded-full bg-muted/75 motion-reduce:animate-none" />
    <div className="mt-10 border-y" aria-hidden="true">
      {[0, 1, 2, 3].map((row) => <div key={row} className="flex min-h-20 items-center gap-4 border-b py-4 last:border-b-0">
        <div className="size-10 shrink-0 animate-pulse rounded-xl bg-muted/80 motion-reduce:animate-none" />
        <div className="min-w-0 flex-1 space-y-2"><div className="h-3 w-36 max-w-1/2 animate-pulse rounded-full bg-muted motion-reduce:animate-none" /><div className="h-2.5 w-full max-w-sm animate-pulse rounded-full bg-muted/55 motion-reduce:animate-none" /></div>
        <div className="h-4 w-16 animate-pulse rounded-full bg-muted/70 motion-reduce:animate-none" />
      </div>)}
    </div>
    <span className="sr-only">Preparando tu información. Los importes aparecerán cuando termine la carga.</span>
  </section>;
}
