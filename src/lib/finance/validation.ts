/**
 * Keeps client-side writes inside PostgreSQL numeric(18,2) while preserving
 * exact cent arithmetic in JavaScript (amount * 100 remains a safe integer).
 */
export const MAX_FINANCE_AMOUNT = 90_000_000_000_000;

export function assertFinanceAmount(value: number, options: { allowZero?: boolean; allowNegative?: boolean; label?: string } = {}) {
  const label = options.label ?? "El monto";
  if (!Number.isFinite(value)) throw new Error(`${label} debe ser un número válido.`);
  if (!options.allowNegative && value < 0) throw new Error(`${label} no puede ser negativo.`);
  if (!options.allowZero && value === 0) throw new Error(`${label} debe ser mayor que cero.`);
  if (Math.abs(value) > MAX_FINANCE_AMOUNT) throw new Error(`${label} supera el máximo admitido.`);
  const cents = value * 100;
  if (!Number.isSafeInteger(Math.round(cents)) || Math.abs(cents - Math.round(cents)) > 1e-6) {
    throw new Error(`${label} admite como máximo dos decimales.`);
  }
}

export function cleanRequiredText(value: string, label: string, maxLength: number, minLength = 1) {
  const clean = value.trim();
  if (clean.length < minLength || clean.length > maxLength) {
    throw new Error(`${label} debe tener entre ${minLength} y ${maxLength} caracteres.`);
  }
  return clean;
}

export function assertOptionalText(value: string | undefined, label: string, maxLength: number) {
  if (value !== undefined && value.length > maxLength) throw new Error(`${label} admite máximo ${maxLength} caracteres.`);
}
