import { formatLocale } from "../i18n";

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return value.toLocaleString(formatLocale(), options);
}

export function formatDate(value: Date | string, options?: Intl.DateTimeFormatOptions): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString(formatLocale(), options);
}

export function formatDateTime(value: Date | string, options?: Intl.DateTimeFormatOptions): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString(formatLocale(), options);
}

export function formatCurrency(value: number | string, currencyCode = "RUB"): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(num)) return "";
  try {
    return new Intl.NumberFormat(formatLocale(), {
      style: "currency",
      currency: currencyCode || "RUB",
    }).format(num);
  } catch {
    return `${formatNumber(num, { minimumFractionDigits: 2 })} ${currencyCode}`;
  }
}

export function chartNumericValue(parsed: unknown): number {
  if (typeof parsed === "number") return parsed;
  if (parsed && typeof parsed === "object" && "y" in parsed) {
    const y = (parsed as { y?: number | null }).y;
    return typeof y === "number" ? y : 0;
  }
  return 0;
}

export function formatSignedCurrency(
  value: number | string,
  currencyCode = "RUB",
  sign: "plus" | "minus" | "auto" = "auto"
): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  const formatted = formatCurrency(Math.abs(num), currencyCode);
  if (sign === "plus") return `+${formatted}`;
  if (sign === "minus") return `−${formatted}`;
  if (num < 0) return `−${formatted}`;
  return formatted;
}
