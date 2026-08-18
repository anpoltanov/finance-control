import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatLocale } from "../i18n";

export type PeriodType = "week" | "month" | "year" | "custom";

export interface DateRangePeriod {
  periodType: PeriodType;
  setPeriodType: (type: PeriodType) => void;
  from: string;
  to: string;
  fromParam: string;
  toParam: string;
  label: string;
  prev: () => void;
  next: () => void;
  customFrom: string;
  customTo: string;
  setCustomFrom: (value: string) => void;
  setCustomTo: (value: string) => void;
  isCurrent: boolean;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fromYmd(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function startOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

function boundsFor(periodType: PeriodType, anchor: Date, customFrom: string, customTo: string): { from: Date; to: Date } | null {
  if (periodType === "week") {
    const from = startOfWeek(anchor);
    return { from, to: addDays(from, 6) };
  }
  if (periodType === "month") {
    const from = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const to = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    return { from, to };
  }
  if (periodType === "year") {
    const from = new Date(anchor.getFullYear(), 0, 1);
    const to = new Date(anchor.getFullYear(), 11, 31);
    return { from, to };
  }
  const from = fromYmd(customFrom);
  const to = fromYmd(customTo);
  if (!from || !to) return null;
  return from <= to ? { from, to } : { from: to, to: from };
}

function isCurrentPeriod(periodType: PeriodType, from: Date, to: Date): boolean {
  const today = startOfDay(new Date());
  const current = boundsFor(periodType, today, "", "");
  if (!current) return false;
  return toYmd(from) === toYmd(current.from) && toYmd(to) === toYmd(current.to);
}

function formatRangeLabel(
  periodType: PeriodType,
  from: Date,
  to: Date,
  isCurrent: boolean,
  t: (key: string) => string
): string {
  if (isCurrent && periodType !== "custom") {
    if (periodType === "week") return t("dateRange.thisWeek");
    if (periodType === "month") return t("dateRange.thisMonth");
    if (periodType === "year") return t("dateRange.thisYear");
  }

  const locale = formatLocale();
  if (periodType === "month") {
    return from.toLocaleDateString(locale, { month: "long", year: "numeric" });
  }
  if (periodType === "year") {
    return String(from.getFullYear());
  }

  const sameYear = from.getFullYear() === to.getFullYear();
  const start = from.toLocaleDateString(locale, { day: "numeric", month: "short", year: sameYear ? undefined : "numeric" });
  const end = to.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
  return `${start} – ${end}`;
}

export function useDateRangePeriod(initial: PeriodType = "month"): DateRangePeriod {
  const { t, i18n } = useTranslation();
  const [periodType, setPeriodTypeState] = useState<PeriodType>(initial);
  const [anchorDate, setAnchorDate] = useState(() => startOfDay(new Date()));
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const bounds = useMemo(
    () => boundsFor(periodType, anchorDate, customFrom, customTo),
    [periodType, anchorDate, customFrom, customTo]
  );

  const from = bounds ? toYmd(bounds.from) : "";
  const to = bounds ? toYmd(bounds.to) : "";
  const fromParam = from;
  const toParam = to ? `${to}T23:59:59` : "";
  const isCurrent = bounds ? isCurrentPeriod(periodType, bounds.from, bounds.to) : false;
  const label = useMemo(() => {
    if (!bounds) return t("dateRange.custom");
    return formatRangeLabel(periodType, bounds.from, bounds.to, isCurrent, t);
  }, [bounds, periodType, isCurrent, t, i18n.language]);

  function setPeriodType(type: PeriodType) {
    setPeriodTypeState(type);
    if (type !== "custom") {
      setAnchorDate(startOfDay(new Date()));
    } else if (!customFrom || !customTo) {
      const month = boundsFor("month", startOfDay(new Date()), "", "");
      if (month) {
        setCustomFrom(toYmd(month.from));
        setCustomTo(toYmd(month.to));
      }
    }
  }

  function prev() {
    if (periodType === "custom") {
      const current = boundsFor("custom", anchorDate, customFrom, customTo);
      if (!current) return;
      const length = Math.round((current.to.getTime() - current.from.getTime()) / 86400000) + 1;
      setCustomFrom(toYmd(addDays(current.from, -length)));
      setCustomTo(toYmd(addDays(current.to, -length)));
      return;
    }
    if (periodType === "week") setAnchorDate(addDays(anchorDate, -7));
    else if (periodType === "month") {
      setAnchorDate(new Date(anchorDate.getFullYear(), anchorDate.getMonth() - 1, 1));
    } else {
      setAnchorDate(new Date(anchorDate.getFullYear() - 1, 0, 1));
    }
  }

  function next() {
    if (periodType === "custom") {
      const current = boundsFor("custom", anchorDate, customFrom, customTo);
      if (!current) return;
      const length = Math.round((current.to.getTime() - current.from.getTime()) / 86400000) + 1;
      setCustomFrom(toYmd(addDays(current.from, length)));
      setCustomTo(toYmd(addDays(current.to, length)));
      return;
    }
    if (periodType === "week") setAnchorDate(addDays(anchorDate, 7));
    else if (periodType === "month") {
      setAnchorDate(new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 1));
    } else {
      setAnchorDate(new Date(anchorDate.getFullYear() + 1, 0, 1));
    }
  }

  return {
    periodType,
    setPeriodType,
    from,
    to,
    fromParam,
    toParam,
    label,
    prev,
    next,
    customFrom,
    customTo,
    setCustomFrom,
    setCustomTo,
    isCurrent,
  };
}
