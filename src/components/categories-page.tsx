"use client";

import { BadgeDollarSign, Tags } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { AccountsPage } from "@/components/accounts-page";
import { FinanceStructurePage } from "@/components/finance-structure-page";
import { MotionGesturesProvider } from "@/components/motion-provider";
import { PageHeader } from "@/components/page-header";
import { RouteViewPanel, RouteViewTabs } from "@/components/route-view-tabs";

export function CategoriesPage() {
  const params = useSearchParams();
  const view = params.get("vista") === "ingresos" ? "income" : "expense";
  return <>
    <PageHeader title="Categorías" description="Pon orden a lo que entra y sale. Puedes usar las categorías iniciales o adaptarlas sin configurar porcentajes ni presupuestos." />
    <div className="mb-8"><RouteViewTabs idPrefix="categories" label="Categorías de movimientos" value={view} items={[
      { value: "expense", icon: Tags, label: "Gastos", detail: "Categorías y subcategorías" },
      { value: "income", icon: BadgeDollarSign, label: "Ingresos", detail: "Tipos de ingreso" },
    ]} onValueChange={(next) => {
      const url = new URL(window.location.href);
      if (next === "income") url.searchParams.set("vista", "ingresos"); else url.searchParams.delete("vista");
      window.history.pushState(null, "", `${url.pathname}${url.search}`);
    }} /></div>
    <RouteViewPanel instant={false} active={view === "expense"} id="categories-panel-expense" labelledBy="categories-tab-expense"><MotionGesturesProvider><FinanceStructurePage embedded categoriesOnly /></MotionGesturesProvider></RouteViewPanel>
    <RouteViewPanel instant={false} active={view === "income"} id="categories-panel-income" labelledBy="categories-tab-income"><AccountsPage view="income" embedded /></RouteViewPanel>
  </>;
}
