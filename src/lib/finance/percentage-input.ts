/**
 * Keeps a percentage editable in either Spanish (12,5) or technical (12.5)
 * notation without treating the decimal point as a thousands separator.
 */
export function sanitizePercentageInput(value: string, fractionDigits = 6) {
  const cleaned = value.replace(/[^0-9.,]/g, "");
  const comma = cleaned.lastIndexOf(",");
  const point = cleaned.lastIndexOf(".");
  const separator = Math.max(comma, point);
  if (separator < 0) return cleaned.replace(/\D/g, "");

  const whole = cleaned.slice(0, separator).replace(/\D/g, "");
  const fraction = cleaned.slice(separator + 1).replace(/\D/g, "").slice(0, fractionDigits);
  return `${whole || "0"}.${fraction}`;
}
