/** Keep the original decimal lexeme, before JavaScript can round it. Node 22+
 * supplies reviver context.source. Legacy runtimes fail closed for unsafe input. */
export function parseIntegrationJson(text: string): unknown {
  const parse = JSON.parse as (text: string, reviver: (key: string, value: unknown, context?: { source?: string }) => unknown) => unknown;
  return parse(text, (_key, value, context) => {
    if (typeof value !== "number" || (Number.isSafeInteger(value) && Math.abs(value) < 1e12)) return value;
    if (!context?.source) throw new Error("Envía importes y tasas como cadenas decimales.");
    return context.source;
  });
}
