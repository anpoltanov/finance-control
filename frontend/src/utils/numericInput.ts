export interface NumericInputOptions {
  maxFractionDigits?: number;
  allowNegative?: boolean;
}

const GROUPING = /[\s\u00a0\u202f]/g;

/**
 * Stored values use "." as the only decimal separator and no grouping.
 * A comma is accepted as a decimal separator and converted.
 * Grouping separators, extra fractional digits, and other characters are dropped.
 */
export function normalizeTypedNumeric(raw: string, options: NumericInputOptions = {}): string {
  const maxFractionDigits = options.maxFractionDigits ?? 2;
  const allowNegative = options.allowNegative ?? false;
  const compact = raw.replace(GROUPING, "");
  let negative = false;
  let intPart = "";
  let fracPart = "";
  let seenSep = false;

  for (let i = 0; i < compact.length; i++) {
    const ch = compact[i];
    if (ch >= "0" && ch <= "9") {
      if (!seenSep) intPart += ch;
      else if (fracPart.length < maxFractionDigits) fracPart += ch;
      continue;
    }
    if ((ch === "." || ch === ",") && !seenSep) {
      seenSep = true;
      continue;
    }
    if (ch === "-" && allowNegative && i === 0) negative = true;
  }

  return assembleNumeric(intPart, fracPart, seenSep, negative && allowNegative);
}

export function commitNumericInput(raw: string, options: NumericInputOptions = {}): string {
  const maxFractionDigits = options.maxFractionDigits ?? 2;
  const allowNegative = options.allowNegative ?? false;
  const trimmed = raw.trim();
  const negative = allowNegative && /^-/.test(trimmed.replace(GROUPING, ""));
  const body = trimmed.replace(GROUPING, "").replace(/[^\d.,]/g, "");
  if (!body) return "";

  const commaCount = countChar(body, ",");
  const dotCount = countChar(body, ".");
  let intPart = "";
  let fracPart = "";
  let seenSep = false;

  if (commaCount > 0 && dotCount > 0) {
    const idx = Math.max(body.lastIndexOf(","), body.lastIndexOf("."));
    intPart = body.slice(0, idx).replace(/[.,]/g, "");
    fracPart = body.slice(idx + 1).replace(/[.,]/g, "");
    seenSep = true;
  } else if (commaCount > 1 || dotCount > 1) {
    intPart = body.replace(/[.,]/g, "");
  } else if (commaCount === 1 || dotCount === 1) {
    const sep = commaCount === 1 ? "," : ".";
    const idx = body.indexOf(sep);
    const head = body.slice(0, idx);
    const tail = body.slice(idx + 1);
    const groupedThousands = sep === "," && tail.length === 3 && /^\d{1,3}$/.test(head);
    if (groupedThousands) {
      intPart = head + tail;
    } else {
      intPart = head;
      fracPart = tail;
      seenSep = true;
    }
  } else {
    intPart = body;
  }

  if (fracPart.length > maxFractionDigits) fracPart = fracPart.slice(0, maxFractionDigits);
  return assembleNumeric(intPart, fracPart, seenSep, negative);
}

export function applyNumericChange(raw: string, previousDisplay: string, options: NumericInputOptions = {}): string {
  if (shouldParseAsPaste(raw, previousDisplay)) return commitNumericInput(raw, options);
  return normalizeTypedNumeric(raw, options);
}

export function finalizeNumericInput(value: string): string {
  if (!value || value === "-" || value === "." || value === "-.") return "";
  const trimmed = value.endsWith(".") ? value.slice(0, -1) : value;
  if (trimmed === "-0") return "0";
  return trimmed;
}

export function formatNumericDisplay(value: string): string {
  if (!value) return "";
  if (value === "-") return "-";
  const negative = value.startsWith("-");
  const body = negative ? value.slice(1) : value;
  const trailingSep = body.endsWith(".");
  const dot = body.indexOf(".");
  const intRaw = dot === -1 ? body : body.slice(0, dot);
  const frac = dot === -1 ? "" : body.slice(dot + 1);
  const intPart = intRaw.replace(/^0+(?=\d)/, "") || (dot === -1 && !intRaw ? "" : "0");
  if (!intPart && !frac && !trailingSep) return "";
  const grouped = (intPart || "0").replace(/\B(?=(\d{3})+(?!\d))/g, "\u202f");
  const sign = negative ? "-" : "";
  if (trailingSep && !frac) return `${sign}${grouped}.`;
  if (dot !== -1) return `${sign}${grouped}.${frac}`;
  return `${sign}${grouped}`;
}

export function caretAfterEdit(rawPrefix: string, formatted: string, parse: (value: string) => string): number {
  const canonical = parse(rawPrefix);
  const units = countUnits(canonical);
  return indexForUnits(formatted, units);
}

function assembleNumeric(intPart: string, fracPart: string, seenSep: boolean, negative: boolean): string {
  let digits = intPart.replace(/^0+(?=\d)/, "");
  const trailingSep = seenSep && fracPart.length === 0;
  if (!digits && (fracPart || trailingSep)) digits = "0";
  if (!digits && !fracPart && !trailingSep) return negative ? "-" : "";
  const sign = negative ? "-" : "";
  if (trailingSep) return `${sign}${digits}.`;
  if (fracPart) return `${sign}${digits}.${fracPart}`;
  return `${sign}${digits}`;
}

export function shouldParseAsPaste(raw: string, previousDisplay: string): boolean {
  if (/[^\d.,\-\s\u00a0\u202f]/.test(raw)) return true;
  const compact = raw.replace(GROUPING, "");
  if (compact.includes(",") && compact.includes(".")) return true;
  if (countChar(compact, ",") > 1 || countChar(compact, ".") > 1) return true;
  return raw.length - previousDisplay.length > 1;
}

function countChar(value: string, ch: string): number {
  let count = 0;
  for (const item of value) if (item === ch) count += 1;
  return count;
}

function countUnits(canonical: string): number {
  let count = 0;
  for (const ch of canonical) {
    if ((ch >= "0" && ch <= "9") || ch === "." || ch === "-") count += 1;
  }
  return count;
}

function indexForUnits(formatted: string, units: number): number {
  if (units <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i++) {
    const ch = formatted[i];
    if ((ch >= "0" && ch <= "9") || ch === "." || ch === "-") {
      seen += 1;
      if (seen === units) return i + 1;
    }
  }
  return formatted.length;
}
