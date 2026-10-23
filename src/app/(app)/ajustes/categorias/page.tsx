import { redirect } from "next/navigation";

export const metadata = { title: "Categorías" };

export default async function Page({ searchParams }: { searchParams: Promise<{ vista?: string }> }) {
  const params = await searchParams;
  redirect(params.vista === "ingresos" ? "/categorias?vista=ingresos" : "/categorias");
}
