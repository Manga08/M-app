const INTERNAL_DATABASE_ERROR = /(?:null value in column|violates (?:not-null|foreign key|check|unique) constraint|permission denied for (?:table|schema|function)|relation ["'][^"']+["']|SQLSTATE|PGRST\d+)/i;
const IMMUTABLE_ACCOUNT_CURRENCY_ERROR = /account currency cannot change after it has movements/i;

/** Keeps database implementation details out of user-facing sync feedback. */
export function userFacingSyncErrorMessage(error: unknown, fallback = "No pudimos sincronizar este cambio todavía. Moneva volverá a intentarlo automáticamente.") {
  const raw = error && typeof error === "object" && "message" in error && typeof error.message === "string"
    ? error.message.trim()
    : typeof error === "string" ? error.trim() : "";
  if (IMMUTABLE_ACCOUNT_CURRENCY_ERROR.test(raw)) return "La moneda de una cuenta con movimientos no puede cambiar. Conservamos su moneda original para proteger el historial.";
  if (!raw || INTERNAL_DATABASE_ERROR.test(raw)) return fallback;
  return raw;
}
