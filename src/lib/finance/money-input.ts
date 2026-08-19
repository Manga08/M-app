const locale = "es-CO";

function fractionDigits(currencyCode = "COP") {
  if (currencyCode.toUpperCase() === "COP") return 0;
  try {
    return Math.min(new Intl.NumberFormat(locale, { style: "currency", currency: currencyCode }).resolvedOptions().maximumFractionDigits ?? 2, 2);
  } catch {
    return 0;
  }
}

function groupedInteger(value: string) {
  const digits = value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  if (!digits) return "";
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Formats an editable monetary value without adding the currency symbol. */
export function formatMoneyInput(value: string, currencyCode = "COP", { allowNegative = false }: { allowNegative?: boolean } = {}) {
  const negative = allowNegative && value.trimStart().startsWith("-");
  const withSign = (formatted: string) => negative ? `-${formatted}` : formatted;
  const maxFractionDigits = fractionDigits(currencyCode);
  if (maxFractionDigits === 0) {
    const formatted = groupedInteger(value);
    return formatted ? withSign(formatted) : negative ? "-" : "";
  }

  const clean = value.replace(/[^\d.,]/g, "");
  if (!clean) return negative ? "-" : "";
  const lastComma = clean.lastIndexOf(",");
  const lastDot = clean.lastIndexOf(".");
  let decimalIndex = lastComma >= 0 && lastDot >= 0 ? Math.max(lastComma, lastDot) : lastComma;

  // A dot followed by one or two digits is accepted as a decimal shortcut.
  // Three digits are treated as Colombian thousands grouping (1.000).
  if (lastComma < 0 && lastDot >= 0 && clean.length - lastDot - 1 <= maxFractionDigits) decimalIndex = lastDot;

  const integerPart = decimalIndex >= 0 ? clean.slice(0, decimalIndex) : clean;
  const decimalPart = decimalIndex >= 0 ? clean.slice(decimalIndex + 1).replace(/\D/g, "").slice(0, maxFractionDigits) : "";
  const integer = groupedInteger(integerPart) || "0";
  return withSign(decimalIndex >= 0 ? `${integer},${decimalPart}` : integer);
}

export function formatMoneyInputValue(value: number, currencyCode = "COP") {
  if (!Number.isFinite(value)) return "";
  return new Intl.NumberFormat(locale, {
    useGrouping: true,
    maximumFractionDigits: fractionDigits(currencyCode),
  }).format(value);
}

export function parseMoneyInput(value: string) {
  const normalized = value.replace(/\s/g, "").replaceAll(".", "").replace(",", ".").replace(/[^\d.-]/g, "");
  if (!normalized || normalized === "-" || normalized === "." || normalized === "-.") return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}
