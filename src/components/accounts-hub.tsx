"use client";

import { useEffect, useState } from "react";
import { Landmark, WalletCards } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { AccountsPage } from "@/components/accounts-page";
import { CreditCardsPage } from "@/components/credit-cards-page";
import { PageHeader } from "@/components/page-header";
import { RouteViewPanel, RouteViewTabs, type RouteViewChangeSource } from "@/components/route-view-tabs";

type AccountsView = "summary" | "cards";

function viewFromParam(value: string | null): AccountsView {
  if (value === "tarjetas") return "cards";

  return "summary";
}

export function AccountsHub() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = viewFromParam(searchParams.get("vista"));
  const [visited, setVisited] = useState<Set<AccountsView>>(() => new Set([view]));
  const [instant, setInstant] = useState(false);

  useEffect(() => {
    if (searchParams.get("vista") === "ingresos") window.location.replace("/categorias?vista=ingresos");
  }, [searchParams]);

  useEffect(() => {
    if (!instant) return;
    const frame = requestAnimationFrame(() => setInstant(false));
    return () => cancelAnimationFrame(frame);
  }, [instant, view]);

  function selectView(next: AccountsView, source: RouteViewChangeSource) {
    if (next === view) return;
    setInstant(source === "keyboard");
    setVisited((current) => current.has(next) ? current : new Set([...current, next]));
    const params = new URLSearchParams(searchParams.toString());
    if (next === "summary") params.delete("vista");
    if (next === "cards") params.set("vista", "tarjetas");

    const query = params.toString();
    window.history.pushState(null, "", `${pathname}${query ? `?${query}` : ""}`);
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  return <>
    <PageHeader eyebrow="Patrimonio y productos" title="Cuentas" description="Mira dónde tienes tu dinero y gestiona tus tarjetas. Agrupar por entidad es opcional." />
    <nav className="app-sticky-below-header sticky z-20 -mx-4 mb-7 border-b bg-background px-4 pb-3 shadow-[0_12px_22px_-24px_rgba(0,0,0,.8)] sm:static sm:mx-0 sm:mb-9 sm:border-0 sm:bg-transparent sm:px-0 sm:pb-0 sm:shadow-none" aria-label="Secciones de cuentas">
      <RouteViewTabs idPrefix="accounts" label="Vista de cuentas" value={view} compactOnSmall items={[
        { value: "summary", icon: Landmark, label: "Cuentas", detail: "Tu dinero registrado" },
        { value: "cards", icon: WalletCards, label: "Tarjetas", detail: "Cupo y ciclos" },

      ]} onValueChange={selectView} />
    </nav>
    {view === "summary" || visited.has("summary") ? <RouteViewPanel active={view === "summary"} instant={instant} id="accounts-panel-summary" labelledBy="accounts-tab-summary"><AccountsPage view="summary" embedded /></RouteViewPanel> : null}
    {view === "cards" || visited.has("cards") ? <RouteViewPanel active={view === "cards"} instant={instant} id="accounts-panel-cards" labelledBy="accounts-tab-cards"><CreditCardsPage /></RouteViewPanel> : null}

  </>;
}
