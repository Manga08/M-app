import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const rowSchema = z.object({
  valor: z.coerce.number().positive(),
  unidad: z.literal("COP"),
  vigenciadesde: z.string(),
  vigenciahasta: z.string(),
});

const sources = ["mcec-87by", "32sa-8pi3"] as const;

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
  if (!isoDate.test(date)) return NextResponse.json({ error: "Fecha inválida." }, { status: 400 });
  const requested = new Date(`${date}T00:00:00Z`);
  const oldest = new Date("1991-12-01T00:00:00Z");
  const latest = new Date();
  latest.setUTCDate(latest.getUTCDate() + 7);
  if (requested < oldest || requested > latest) return NextResponse.json({ error: "La fecha está fuera del rango disponible." }, { status: 400 });

  for (const dataset of sources) {
    try {
      const url = new URL(`https://www.datos.gov.co/resource/${dataset}.json`);
      url.searchParams.set("$select", "valor,unidad,vigenciadesde,vigenciahasta");
      url.searchParams.set("$where", `vigenciadesde <= '${date}T23:59:59' AND vigenciahasta >= '${date}T00:00:00'`);
      url.searchParams.set("$order", "vigenciadesde DESC");
      url.searchParams.set("$limit", "1");
      const response = await fetch(url, { next: { revalidate: 21_600 }, headers: { Accept: "application/json" } });
      if (!response.ok) continue;
      const payload = z.array(rowSchema).safeParse(await response.json());
      const row = payload.success ? payload.data[0] : undefined;
      if (!row) continue;
      return NextResponse.json({
        rate: row.valor,
        currency: "COP",
        validFrom: row.vigenciadesde.slice(0, 10),
        validTo: row.vigenciahasta.slice(0, 10),
        source: "sfc_trm",
        provider: "Superintendencia Financiera de Colombia",
      }, { headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" } });
    } catch {
      // The second official open-data view is an intentional fallback.
    }
  }
  return NextResponse.json({ error: "La TRM oficial no está disponible. Puedes escribir la tasa manualmente." }, { status: 503 });
}
