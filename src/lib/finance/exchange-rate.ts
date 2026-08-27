import { z } from "zod";
import { convertNativeToReporting, REPORTING_CURRENCY_CODE } from "@/lib/finance/currency";

const trmSchema = z.object({
  rate: z.number().positive(),
  validFrom: z.string(),
  validTo: z.string(),
  source: z.literal("sfc_trm"),
  provider: z.string(),
});

export type TrmQuote = z.infer<typeof trmSchema>;
const cache = new Map<string, TrmQuote>();
const pending = new Map<string, Promise<TrmQuote>>();

export async function getOfficialTrm(date: string, signal?: AbortSignal) {
  const cached = cache.get(date);
  if (cached) return cached;
  const existing = pending.get(date);
  const request = existing ?? fetch(`/api/trm?date=${encodeURIComponent(date)}`)
    .then(async (response) => {
      if (!response.ok) throw new Error(response.status === 503
        ? "La TRM oficial no está disponible. Puedes escribir la tasa manualmente."
        : "No pudimos consultar la TRM oficial.");
      const quote = trmSchema.parse(await response.json());
      cache.set(date, quote);
      return quote;
    })
    .finally(() => pending.delete(date));
  if (!existing) pending.set(date, request);
  if (!signal) return request;
  if (signal.aborted) throw new DOMException("The operation was aborted.", "AbortError");
  return Promise.race([
    request,
    new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "AbortError")), { once: true })),
  ]);
}

export function convertToReportingCurrency(amount: number, currencyCode: string, trm?: number) {
  return convertNativeToReporting(amount, currencyCode, REPORTING_CURRENCY_CODE, trm);
}
