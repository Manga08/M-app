import { brandIconCatalog } from "@/generated/brand-icon-catalog";
import { bankIconCatalog } from "@/lib/finance/bank-icon-catalog";
import { MAX_FINANCE_AMOUNT } from "@/lib/finance/validation";
import { normalizeImportText } from "@/lib/finance/xlsx-import";

export type CaptureMovementType = "expense" | "income" | "transfer" | "unknown";

export type CaptureWarningCode =
  | "empty_text"
  | "text_truncated"
  | "type_uncertain"
  | "amount_missing"
  | "amount_ambiguous"
  | "amount_ocr_corrected"
  | "date_missing"
  | "date_ambiguous"
  | "date_inferred"
  | "future_date"
  | "merchant_missing"
  | "account_ambiguous"
  | "transfer_accounts_required";

export type CaptureCandidateField = "type" | "amount" | "occurredOn" | "merchant" | "account" | "source";

export type CaptureWarning = {
  code: CaptureWarningCode;
  field?: CaptureCandidateField;
  message: string;
};

export type CaptureCandidateConfidence = {
  overall: number;
  type: number;
  amount: number;
  date: number;
  merchant: number;
  account: number;
};

/**
 * A review-only suggestion produced from OCR text. It is deliberately not a
 * TransactionInput: local recognition must never become a database write
 * without the user confirming account, category and every uncertain field.
 */
export type CaptureCandidate = {
  type: CaptureMovementType;
  amount: number | null;
  currencyCode: "COP";
  occurredOn: string | null;
  merchant: string | null;
  description: string;
  accountLast4: string | null;
  sourceInstitution: string | null;
  icon: string | null;
  confidence: CaptureCandidateConfidence;
  warnings: CaptureWarning[];
};

export type AnalyzeOcrTextOptions = {
  /** ISO date used to resolve “hoy”, “ayer” and dates without a year. */
  referenceDate?: string;
};

type ScoredValue<T> = {
  value: T;
  score: number;
  confidence: number;
  lineIndex: number;
};

type AmountMatch = ScoredValue<number> & { corrected: boolean };
type DateMatch = ScoredValue<string> & { ambiguous: boolean; inferred: boolean };

const MAX_OCR_TEXT_LENGTH = 16_000;
const SPANISH_MONTHS: Record<string, number> = {
  enero: 1,
  ene: 1,
  febrero: 2,
  feb: 2,
  marzo: 3,
  mar: 3,
  abril: 4,
  abr: 4,
  mayo: 5,
  may: 5,
  junio: 6,
  jun: 6,
  julio: 7,
  jul: 7,
  agosto: 8,
  ago: 8,
  septiembre: 9,
  setiembre: 9,
  sep: 9,
  set: 9,
  octubre: 10,
  oct: 10,
  noviembre: 11,
  nov: 11,
  diciembre: 12,
  dic: 12,
};

const TYPE_SIGNALS: Record<Exclude<CaptureMovementType, "unknown">, Array<[string, number]>> = {
  expense: [
    ["pagaste", 7],
    ["compraste", 7],
    ["hiciste una compra", 7],
    ["compra aprobada", 7],
    ["compra realizada", 7],
    ["pago realizado", 6],
    ["pago exitoso", 5],
    ["te descontamos", 6],
    ["retiro exitoso", 6],
    ["retiro", 4],
    ["debito", 4],
    ["cobro", 4],
    ["consumo", 4],
    ["factura de venta", 4],
    ["compra", 3],
  ],
  income: [
    ["recibiste", 7],
    ["has recibido", 7],
    ["pago recibido", 7],
    ["transferencia recibida", 7],
    ["abono recibido", 6],
    ["consignacion recibida", 6],
    ["deposito recibido", 6],
    ["nomina", 5],
    ["salario", 5],
    ["te enviaron", 5],
    ["te consignaron", 6],
    ["abono", 3],
    ["ingreso", 3],
  ],
  transfer: [
    ["transferencia enviada", 7],
    ["transferencia realizada", 6],
    ["transferiste", 7],
    ["enviaste", 6],
    ["moviste dinero", 5],
    ["transferencia exitosa", 4],
    ["transferencia", 2],
  ],
};

const brandAliases = brandIconCatalog
  .flatMap((entry) => entry.aliases.map((alias) => ({
    alias: normalizeImportText(alias),
    title: entry.title,
    icon: `brand:${entry.slug}`,
    slug: entry.slug,
  })))
  .filter((entry) => entry.alias.length >= 2)
  .sort((left, right) => right.alias.length - left.alias.length);

const bankAliases = bankIconCatalog
  .flatMap((entry) => entry.aliases.map((alias) => ({
    alias: normalizeImportText(alias),
    title: entry.title,
    icon: `bank:${entry.slug}`,
    brandSlug: entry.brandSlug,
  })))
  .filter((entry) => entry.alias.length >= 2)
  .sort((left, right) => right.alias.length - left.alias.length);

/**
 * Turns OCR output into conservative, reviewable transaction defaults.
 * This function is synchronous, deterministic, side-effect free and performs
 * no network, storage or logging operations.
 */
export function analyzeOcrText(ocrText: string, options: AnalyzeOcrTextOptions = {}): CaptureCandidate {
  const warnings: CaptureWarning[] = [];
  const raw = typeof ocrText === "string" ? ocrText : "";
  const truncated = raw.length > MAX_OCR_TEXT_LENGTH;
  const cleaned = cleanOcrText(raw.slice(0, MAX_OCR_TEXT_LENGTH));
  const referenceDate = validReferenceDate(options.referenceDate) ?? localIsoToday();

  if (truncated) warnings.push(warning("text_truncated", "source", "La imagen contiene demasiado texto; revisa que la parte importante haya quedado incluida."));
  if (!cleaned) {
    return {
      type: "unknown",
      amount: null,
      currencyCode: "COP",
      occurredOn: null,
      merchant: null,
      description: "Movimiento capturado",
      accountLast4: null,
      sourceInstitution: null,
      icon: null,
      confidence: { overall: 0, type: 0, amount: 0, date: 0, merchant: 0, account: 0 },
      warnings: [warning("empty_text", "source", "No encontramos texto legible en la imagen."), ...warnings],
    };
  }

  const lines = cleaned.split("\n").map((line) => line.trim()).filter(Boolean);
  const normalizedText = normalizeImportText(cleaned);
  const typeResult = detectType(normalizedText);
  if (typeResult.type === "unknown" || typeResult.confidence < 0.7) {
    warnings.push(warning("type_uncertain", "type", "No pudimos confirmar si es un gasto, ingreso o transferencia."));
  }

  const amountResult = detectAmount(lines);
  if (!amountResult.selected) {
    warnings.push(warning("amount_missing", "amount", "No encontramos un monto COP confiable."));
  } else {
    if (amountResult.ambiguous) warnings.push(warning("amount_ambiguous", "amount", "Encontramos varios montos posibles; confirma el valor total."));
    if (amountResult.selected.corrected) warnings.push(warning("amount_ocr_corrected", "amount", "El OCR parecía confundir la letra O con cero; confirma el monto."));
  }

  const dateResult = detectDate(lines, referenceDate);
  if (!dateResult.selected) {
    warnings.push(warning("date_missing", "occurredOn", "No encontramos una fecha válida; se conservará la fecha elegida en el formulario."));
  } else {
    if (dateResult.ambiguous || dateResult.selected.ambiguous) warnings.push(warning("date_ambiguous", "occurredOn", "La fecha admite más de una interpretación; confírmala."));
    if (dateResult.selected.inferred) warnings.push(warning("date_inferred", "occurredOn", "Inferimos el año usando la fecha actual; confirma la fecha."));
    if (dateResult.selected.value > addDays(referenceDate, 2)) warnings.push(warning("future_date", "occurredOn", "La fecha detectada está en el futuro; confirma que sea correcta."));
  }

  const institution = detectInstitution(normalizedText);
  const merchantResult = detectMerchant(lines, normalizedText, typeResult.type, institution?.brandSlug);
  if (!merchantResult.merchant) warnings.push(warning("merchant_missing", "merchant", "No reconocimos el comercio o la persona; puedes escribirlo manualmente."));

  const accountResult = detectLastFour(lines);
  if (accountResult.ambiguous) warnings.push(warning("account_ambiguous", "account", "La imagen contiene varias terminaciones de cuenta o tarjeta; elige la correcta."));
  if (typeResult.type === "transfer") warnings.push(warning("transfer_accounts_required", "account", "Confirma manualmente la cuenta de origen y la de destino."));

  const typeConfidence = typeResult.confidence;
  const amountConfidence = amountResult.selected?.confidence ?? 0;
  const dateConfidence = dateResult.selected?.confidence ?? 0;
  const merchantConfidence = merchantResult.confidence;
  const accountConfidence = accountResult.confidence;
  let overall = weightedConfidence(typeConfidence, amountConfidence, dateConfidence, merchantConfidence, accountConfidence);
  if (!amountResult.selected) overall = Math.min(overall, 0.25);
  if (typeResult.type === "unknown") overall = Math.min(overall, 0.45);
  if (amountResult.ambiguous || dateResult.ambiguous) overall = Math.min(overall, 0.68);

  return {
    type: typeResult.type,
    amount: amountResult.selected?.value ?? null,
    currencyCode: "COP",
    occurredOn: dateResult.selected?.value ?? null,
    merchant: merchantResult.merchant,
    description: descriptionFor(lines, typeResult.type, merchantResult.merchant),
    accountLast4: accountResult.value,
    sourceInstitution: institution?.title ?? null,
    icon: merchantResult.icon,
    confidence: {
      overall: roundConfidence(overall),
      type: roundConfidence(typeConfidence),
      amount: roundConfidence(amountConfidence),
      date: roundConfidence(dateConfidence),
      merchant: roundConfidence(merchantConfidence),
      account: roundConfidence(accountConfidence),
    },
    warnings,
  };
}

function detectType(text: string) {
  const scores = (Object.keys(TYPE_SIGNALS) as Array<Exclude<CaptureMovementType, "unknown">>).map((type) => ({
    type,
    score: TYPE_SIGNALS[type].reduce((total, [signal, weight]) => total + (includesPhrase(text, signal) ? weight : 0), 0),
  })).sort((left, right) => right.score - left.score);
  const winner = scores[0];
  const runnerUp = scores[1];
  if (!winner || winner.score < 3) return { type: "unknown" as const, confidence: 0 };
  const gap = winner.score - (runnerUp?.score ?? 0);
  const confidence = winner.score >= 7 && gap >= 3 ? 0.97 : winner.score >= 5 && gap >= 2 ? 0.86 : gap >= 2 ? 0.72 : 0.55;
  return { type: winner.type as CaptureMovementType, confidence };
}

function detectAmount(lines: string[]) {
  const candidates: AmountMatch[] = [];
  lines.forEach((line, lineIndex) => {
    const normalizedLine = normalizeImportText(line);
    const lineScore = amountLineScore(normalizedLine);
    const currencyPattern = /(?:\bCOP\b\s*\$?\s*|\$\s*)(-?\s*(?:[0-9Oo]{1,3}(?:(?:[.,]\s?[0-9Oo]{3})+|(?:\s[0-9Oo]{3})+)(?:[.,][0-9Oo]{1,2})?|[0-9Oo]{1,15}(?:[.,][0-9Oo]{1,2})?))/giu;
    for (const match of line.matchAll(currencyPattern)) {
      const parsed = parseCopAmount(match[1]);
      if (!parsed || !validAmount(parsed.value)) continue;
      candidates.push({ value: parsed.value, corrected: parsed.corrected, lineIndex, score: lineScore + 4, confidence: amountConfidence(lineScore + 4) });
    }
    const postfixPattern = /(-?\s*(?:[0-9Oo]{1,3}(?:(?:[.,]\s?[0-9Oo]{3})+|(?:\s[0-9Oo]{3})+)(?:[.,][0-9Oo]{1,2})?|[0-9Oo]{1,15}(?:[.,][0-9Oo]{1,2})?))\s*\bCOP\b/giu;
    for (const match of line.matchAll(postfixPattern)) {
      const parsed = parseCopAmount(match[1]);
      if (!parsed || !validAmount(parsed.value)) continue;
      candidates.push({ value: parsed.value, corrected: parsed.corrected, lineIndex, score: lineScore + 4, confidence: amountConfidence(lineScore + 4) });
    }
    if (lineScore >= 4 && !/(?:\bCOP\b|\$)/iu.test(line)) {
      const plainPattern = /(?:^|\D)([0-9Oo]{1,3}(?:(?:[.\s,][0-9Oo]{3})+)(?:,[0-9Oo]{1,2})?|[0-9Oo]{2,15})(?=\D|$)/giu;
      for (const match of line.matchAll(plainPattern)) {
        const parsed = parseCopAmount(match[1]);
        if (!parsed || !validAmount(parsed.value)) continue;
        candidates.push({ value: parsed.value, corrected: parsed.corrected, lineIndex, score: lineScore, confidence: amountConfidence(lineScore) });
      }
    }
  });

  const unique = dedupeScored(candidates, (candidate) => `${candidate.lineIndex}:${candidate.value}`)
    .sort((left, right) => right.score - left.score || right.value - left.value || left.lineIndex - right.lineIndex);
  const selected = unique[0] ?? null;
  const alternatives = selected ? unique.filter((candidate) => candidate.value !== selected.value) : [];
  const ambiguous = Boolean(selected && alternatives.some((candidate) => candidate.score >= selected.score - 1));
  return { selected, ambiguous };
}

function amountLineScore(line: string) {
  let score = 0;
  if (/\b(total a pagar|total pagado|valor total|monto total|total compra|total)\b/u.test(line)) score += 8;
  else if (/\b(monto|valor|importe)\b/u.test(line)) score += 5;
  if (/\b(pagaste|recibiste|enviaste|transferiste|compraste|compra aprobada|pago realizado|abono recibido)\b/u.test(line)) score += 6;
  if (/\b(subtotal|iva|impuesto|propina|descuento)\b/u.test(line)) score -= 7;
  if (/\b(saldo|disponible|cupo|balance|antes|despues)\b/u.test(line)) score -= 9;
  return score;
}

function parseCopAmount(raw: string) {
  const compact = raw.trim().replace(/\s+/g, "").replace(/^[^0-9Oo-]+|[^0-9Oo.,]+$/g, "");
  if (!compact) return null;
  const corrected = /[Oo]/u.test(compact);
  const digits = compact.replace(/[Oo]/gu, "0");
  const negative = digits.startsWith("-");
  const unsigned = digits.replace(/-/g, "");
  if (!/^\d[\d.,]*$/u.test(unsigned)) return null;
  const lastComma = unsigned.lastIndexOf(",");
  const lastDot = unsigned.lastIndexOf(".");
  const separatorIndex = Math.max(lastComma, lastDot);
  const fractionLength = separatorIndex >= 0 ? unsigned.length - separatorIndex - 1 : 0;
  const separator = separatorIndex >= 0 ? unsigned[separatorIndex] : "";
  const occurrences = separator ? unsigned.split(separator).length - 1 : 0;
  const decimal = separatorIndex >= 0 && fractionLength > 0 && fractionLength <= 2 && (separator === "," || occurrences === 1 && unsigned.includes(","));
  const normalized = decimal
    ? `${unsigned.slice(0, separatorIndex).replace(/[.,]/g, "")}.${unsigned.slice(separatorIndex + 1)}`
    : unsigned.replace(/[.,]/g, "");
  const value = Number(normalized) * (negative ? -1 : 1);
  return Number.isFinite(value) && value !== 0 ? { value: Math.abs(value), corrected } : null;
}

function detectDate(lines: string[], referenceDate: string) {
  const candidates: DateMatch[] = [];
  lines.forEach((line, lineIndex) => {
    const normalizedLine = normalizeImportText(line);
    const score = dateLineScore(normalizedLine);
    const relative = normalizedLine.match(/\b(hoy|ayer)\b/u)?.[1];
    if (relative) {
      candidates.push({ value: relative === "hoy" ? referenceDate : addDays(referenceDate, -1), score: score + 3, confidence: 0.82, lineIndex, ambiguous: false, inferred: true });
    }

    for (const match of line.matchAll(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/gu)) {
      const value = isoDate(Number(match[1]), Number(match[2]), Number(match[3]));
      if (value) candidates.push({ value, score: score + 4, confidence: score >= 3 ? 0.98 : 0.9, lineIndex, ambiguous: false, inferred: false });
    }

    for (const match of line.matchAll(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})\b/gu)) {
      const day = Number(match[1]);
      const month = Number(match[2]);
      const year = Number(match[3]) < 100 ? 2000 + Number(match[3]) : Number(match[3]);
      const value = isoDate(year, month, day);
      if (value) candidates.push({ value, score: score + 4, confidence: day <= 12 && month <= 12 ? 0.72 : score >= 3 ? 0.97 : 0.88, lineIndex, ambiguous: day <= 12 && month <= 12, inferred: false });
    }

    const textualPattern = /\b(\d{1,2})\s*(?:de\s+)?(enero|ene|febrero|feb|marzo|mar|abril|abr|mayo|may|junio|jun|julio|jul|agosto|ago|septiembre|setiembre|sep|set|octubre|oct|noviembre|nov|diciembre|dic)(?:\s*(?:de\s+)?(\d{2}|\d{4}))?\b/giu;
    for (const match of normalizedLine.matchAll(textualPattern)) {
      const inferred = !match[3];
      const year = match[3] ? (Number(match[3]) < 100 ? 2000 + Number(match[3]) : Number(match[3])) : Number(referenceDate.slice(0, 4));
      const value = isoDate(year, SPANISH_MONTHS[match[2]], Number(match[1]));
      if (value) candidates.push({ value, score: score + 4, confidence: inferred ? 0.72 : score >= 3 ? 0.98 : 0.9, lineIndex, ambiguous: false, inferred });
    }
  });

  const unique = dedupeScored(candidates, (candidate) => `${candidate.lineIndex}:${candidate.value}`)
    .sort((left, right) => right.score - left.score || right.confidence - left.confidence || left.lineIndex - right.lineIndex);
  const selected = unique[0] ?? null;
  const ambiguous = Boolean(selected && unique.some((candidate) => candidate.value !== selected.value && candidate.score >= selected.score - 1));
  return { selected, ambiguous };
}

function dateLineScore(line: string) {
  let score = 0;
  if (/\b(fecha|realizada|transaccion|operacion|compra|pago)\b/u.test(line)) score += 4;
  if (/\b(vencimiento|fecha limite|paga antes|corte|proximo pago)\b/u.test(line)) score -= 7;
  return score;
}

function detectInstitution(text: string) {
  const match = bankAliases.find((entry) => includesPhrase(text, entry.alias));
  return match ?? null;
}

function detectMerchant(lines: string[], normalizedText: string, type: CaptureMovementType, sourceBrandSlug?: string) {
  const known = brandAliases.find((entry) => entry.slug !== sourceBrandSlug && includesPhrase(normalizedText, entry.alias));
  if (known) return { merchant: known.title, icon: known.icon, confidence: 0.98 };

  for (const line of lines) {
    const labeled = line.match(/(?:comercio|establecimiento|tienda|merchant|beneficiario|destinatario)\s*[:\-]\s*(.+)$/iu)?.[1];
    const cleaned = cleanMerchant(labeled);
    if (cleaned) return { merchant: cleaned, icon: null, confidence: 0.9 };
  }

  const joined = lines.join("\n");
  const actionPatterns = type === "expense"
    ? [/(?:pagaste|compraste)[^\n]{0,45}?\s+en\s+([^\n]+)/iu, /(?:compra|pago)\s+(?:en|a)\s+([^\n]+)/iu]
    : type === "income"
      ? [/(?:recibiste|has recibido)[^\n]{0,45}?\s+de\s+([^\n]+)/iu]
      : type === "transfer"
        ? [/(?:enviaste|transferiste)[^\n]{0,45}?\s+a\s+([^\n]+)/iu]
        : [];
  for (const pattern of actionPatterns) {
    const cleaned = cleanMerchant(joined.match(pattern)?.[1]);
    if (cleaned) return { merchant: cleaned, icon: null, confidence: 0.76 };
  }
  return { merchant: null, icon: null, confidence: 0 };
}

function cleanMerchant(value?: string) {
  if (!value) return null;
  const cleaned = value
    .replace(/\s+(?:con|desde|usando|el|fecha|hora|por)\s+(?:tu\s+)?(?:cuenta|tarjeta|producto|el|la|los|las)?.*$/iu, "")
    .replace(/(?:aprobada|aprobado|exitosa|exitoso)[.!]?$/iu, "")
    .replace(/^[\s:–—-]+|[\s:–—-]+$/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  if (!cleaned || /^\d[\d.,\s]*$/u.test(cleaned) || normalizeImportText(cleaned).length < 2) return null;
  return cleaned;
}

function descriptionFor(lines: string[], type: CaptureMovementType, merchant: string | null) {
  for (const line of lines) {
    const explicit = line.match(/(?:descripcion|concepto|detalle|motivo)\s*[:\-]\s*(.+)$/iu)?.[1];
    const cleaned = cleanDescription(explicit);
    if (cleaned) return cleaned;
  }
  if (merchant) {
    if (type === "income") return `Ingreso de ${merchant}`.slice(0, 200);
    if (type === "transfer") return `Transferencia a ${merchant}`.slice(0, 200);
    if (type === "expense") return `Compra en ${merchant}`.slice(0, 200);
  }
  if (type === "income") return "Ingreso capturado";
  if (type === "expense") return "Gasto capturado";
  if (type === "transfer") return "Transferencia capturada";
  return "Movimiento capturado";
}

function cleanDescription(value?: string) {
  if (!value) return null;
  const clean = value.replace(/\s+/g, " ").trim().slice(0, 200);
  return clean.length >= 2 ? clean : null;
}

function detectLastFour(lines: string[]) {
  const matches: ScoredValue<string>[] = [];
  lines.forEach((line, lineIndex) => {
    for (const match of line.matchAll(/(?:[*xX•·]{2,})\s*(\d{4})\b/gu)) {
      matches.push({ value: match[1], score: 8, confidence: 0.97, lineIndex });
    }
    for (const match of line.matchAll(/\b(?:cuenta|cta|tarjeta|card|producto)\b[^\n\d]{0,24}(?:terminad[ao]\s+en\s+|final\s+|nro\.?\s*)?(\d{4})\b/giu)) {
      matches.push({ value: match[1], score: 6, confidence: 0.88, lineIndex });
    }
    for (const match of line.matchAll(/\bterminad[ao]\s+en\s+(\d{4})\b/giu)) {
      matches.push({ value: match[1], score: 7, confidence: 0.92, lineIndex });
    }
  });
  const unique = dedupeScored(matches, (match) => match.value).sort((left, right) => right.score - left.score || left.lineIndex - right.lineIndex);
  return { value: unique[0]?.value ?? null, confidence: unique[0]?.confidence ?? 0, ambiguous: unique.length > 1 };
}

function cleanOcrText(value: string) {
  return value
    .normalize("NFC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[\t ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function validAmount(value: number) {
  return Number.isFinite(value) && value > 0 && value <= MAX_FINANCE_AMOUNT;
}

function validReferenceDate(value?: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/u.test(value) && isoDate(Number(value.slice(0, 4)), Number(value.slice(5, 7)), Number(value.slice(8, 10))) === value ? value : null;
}

function localIsoToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function isoDate(year: number, month: number, day: number) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day) || year < 2000 || year > 2100) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function amountConfidence(score: number) {
  if (score >= 12) return 0.98;
  if (score >= 9) return 0.94;
  if (score >= 6) return 0.84;
  if (score >= 4) return 0.7;
  return 0.5;
}

function weightedConfidence(type: number, amount: number, date: number, merchant: number, account: number) {
  return type * 0.26 + amount * 0.34 + date * 0.22 + merchant * 0.14 + account * 0.04;
}

function roundConfidence(value: number) {
  return Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;
}

function warning(code: CaptureWarningCode, field: CaptureCandidateField, message: string): CaptureWarning {
  return { code, field, message };
}

function includesPhrase(text: string, phrase: string) {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, "u").test(text);
}

function dedupeScored<T>(items: T[], key: (item: T) => string) {
  const best = new Map<string, T>();
  for (const item of items) {
    const itemWithScore = item as T & { score: number };
    const current = best.get(key(item)) as (T & { score: number }) | undefined;
    if (!current || itemWithScore.score > current.score) best.set(key(item), item);
  }
  return [...best.values()];
}
