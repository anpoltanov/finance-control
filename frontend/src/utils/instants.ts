/** Transaction times are absolute instants. The UI renders them in a timezone. */

const HAS_ZONE = /(?:Z|[+-]\d{2}:\d{2}|[+-]\d{4})$/i;

export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export interface ZonedParts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
}

export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  let hour = get("hour");
  if (hour === "24") hour = "00";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour,
    minute: get("minute"),
    second: get("second"),
  };
}

function zoneOffsetMs(utcMs: number, timeZone: string): number {
  const parts = zonedParts(new Date(utcMs), timeZone);
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return asUtc - utcMs;
}

/** A datetime-local value is wall time in `timeZone`. Returns the UTC instant. */
export function zonedWallTimeToUtc(value: string, timeZone = browserTimeZone()): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value.trim());
  if (!match) return new Date(NaN);
  const wallAsUtc = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    0
  );
  let utc = wallAsUtc - zoneOffsetMs(wallAsUtc, timeZone);
  const adjusted = wallAsUtc - zoneOffsetMs(utc, timeZone);
  if (adjusted !== utc) utc = adjusted;
  return new Date(utc);
}

export function localInputToIso(value: string, timeZone = browserTimeZone()): string {
  return zonedWallTimeToUtc(value, timeZone).toISOString();
}

/**
 * API datetimes with an offset are that instant.
 * A datetime with no zone is UTC (legacy rows and older responses).
 * A date-only value is that calendar day at local midnight.
 */
export function parseApiDate(value: string): Date {
  const text = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [year, month, day] = text.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  if (HAS_ZONE.test(text)) return new Date(text);
  const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text) ? `${text}:00` : text;
  return new Date(`${normalized}Z`);
}

export function toDateTimeLocalValue(date: Date, timeZone = browserTimeZone()): string {
  const parts = zonedParts(date, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function localDayKey(date: Date, timeZone = browserTimeZone()): string {
  return toDateTimeLocalValue(date, timeZone).slice(0, 10);
}

export function localTodayYmd(timeZone = browserTimeZone(), now = new Date()): string {
  return localDayKey(now, timeZone);
}

/** Inclusive local bounds. A date-only end is 23:59:59.999 in the runtime timezone. */
export function localRangeBoundMs(value: string, edge: "start" | "end"): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?/.exec(value.trim());
  if (!match) return new Date(value).getTime();
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (match[4] == null) {
    return edge === "end"
      ? new Date(year, month, day, 23, 59, 59, 999).getTime()
      : new Date(year, month, day).getTime();
  }
  const second = match[6] ? Number(match[6]) : 0;
  const millis = match[7] ? Number(match[7].padEnd(3, "0")) : 0;
  return new Date(year, month, day, Number(match[4]), Number(match[5]), second, millis).getTime();
}
