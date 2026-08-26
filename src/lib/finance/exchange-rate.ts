import { z } from "zod";

const trmSchema = z.object({
  rate: z.number().positive(),
  validFrom: z.string(),
  validTo: z.string(),
  source: z.literal("sfc_trm"),
  provider: z.string(),
});

export type TrmQuote = z.infer<typeof trmSchema>;
const cache = new Map<string, TrmQuote>();

export async function getOfficialTrm(date: string, signal?: AbortSignal) {
  const cached = cache.get(date);
  if (cached) return cached;
  const response = await fetch(`/api/trm?date=${encodeURIComponent(date)}`, { signal });
  if (!response.ok) throw new Error(response.status === 503
    ? "La TRM oficial no está disponible. Puedes escribir la tasa manualmente."
    : "No pudimos consultar la TRM oficial.");
  const quote = trmSchema.parse(await response.json());
  cache.set(date, quote);
  return quote;
}

export function convertToReportingCurrency(amount: number, currencyCode: string, trm?: number) {
  return currencyCode === "COP" ? amount : amount * (trm ?? 0);
}
