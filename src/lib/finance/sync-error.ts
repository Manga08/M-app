const INTERNAL_DATABASE_ERROR = /(?:null value in column|violates (?:not-null|foreign key|check|unique) constraint|permission denied for (?:table|schema|function)|relation ["'][^"']+["']|SQLSTATE|PGRST\d+)/i;
const IMMUTABLE_ACCOUNT_CURRENCY_ERROR = /account currency cannot change after it has movements/i;

/** Keeps database implementation details out of user-facing sync feedback. */
export function userFacingSyncErrorMessage(error: unknown, fallback = "No pudimos sincronizar este cambio todavía. Moneva volverá a intentarlo automáticamente.") {
  const raw = error && typeof error === "object" && "message" in error && typeof error.message === "string"
    ? error.message.trim()
    : typeof error === "string" ? error.trim() : "";
  if (IMMUTABLE_ACCOUNT_CURRENCY_ERROR.test(raw)) return "La moneda de una cuenta con movimientos no puede cambiar. Conservamos su moneda original para proteger el historial.";
  if (/deadlock detected|could not serialize access/i.test(raw)) return "Hay otro cambio en curso. Inténtalo nuevamente en un momento.";
  if (/failed to fetch|fetch failed|network ?error|load failed/i.test(raw)) return "No pudimos contactar con el servidor. Comprueba la conexión y vuelve a intentarlo; no borres los datos de este dispositivo.";
  if (!raw || INTERNAL_DATABASE_ERROR.test(raw) || /cannot read properties|is not a function|(?:Type|Reference|Syntax)Error:/i.test(raw)) return fallback;
  return raw;
}
