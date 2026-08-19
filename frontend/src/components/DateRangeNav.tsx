import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatLocale } from "../i18n";
import type { DateRangePeriod, PeriodType } from "../hooks/useDateRangePeriod";
import GlyphIcon from "./GlyphIcon";

interface DateRangeNavProps {
  range: DateRangePeriod;
}

function startOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

function weeksOfYear(year: number): { start: Date; end: Date }[] {
  const weeks: { start: Date; end: Date }[] = [];
  let cursor = startOfWeek(new Date(year, 0, 4));
  if (cursor.getFullYear() < year) cursor = addDays(cursor, 7);
  while (cursor.getFullYear() === year) {
    weeks.push({ start: cursor, end: addDays(cursor, 6) });
    cursor = addDays(cursor, 7);
  }
  return weeks;
}

function PeriodJumpPanel({ range, onClose }: { range: DateRangePeriod; onClose: () => void }) {
  const { t } = useTranslation();
  const [year, setYear] = useState(range.anchorDate.getFullYear());
  const locale = formatLocale();

  function pick(anchor: Date) {
    range.jumpTo(anchor);
    onClose();
  }

  if (range.periodType === "year") {
    const years = Array.from({ length: 12 }, (_, i) => new Date().getFullYear() + 1 - i);
    return (
      <div className="date-range-jump-panel" role="dialog" aria-label={t("dateRange.jumpTo")}>
        <div className="date-range-year-list">
          {years.map((y) => (
            <button
              key={y}
              type="button"
              className={y === range.anchorDate.getFullYear() ? "active" : "secondary"}
              onClick={() => pick(new Date(y, 0, 1))}
            >
              {y}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (range.periodType === "week") {
    return (
      <div className="date-range-jump-panel" role="dialog" aria-label={t("dateRange.jumpTo")}>
        <div className="date-range-jump-header">
          <button type="button" className="secondary date-range-step" onClick={() => setYear((y) => y - 1)} aria-label={t("dateRange.prev")}>
            ‹
          </button>
          <strong>{year}</strong>
          <button type="button" className="secondary date-range-step" onClick={() => setYear((y) => y + 1)} aria-label={t("dateRange.next")}>
            ›
          </button>
        </div>
        <div className="date-range-week-list">
          {weeksOfYear(year).map((week) => {
            const active = week.start.toDateString() === startOfWeek(range.anchorDate).toDateString();
            const startLabel = week.start.toLocaleDateString(locale, { day: "numeric", month: "short" });
            const endLabel = week.end.toLocaleDateString(locale, { day: "numeric", month: "short" });
            return (
              <button
                key={week.start.toISOString()}
                type="button"
                className={active ? "active" : "secondary"}
                onClick={() => pick(week.start)}
              >
                {startLabel} – {endLabel}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const months = Array.from({ length: 12 }, (_, i) => i);
  return (
    <div className="date-range-jump-panel" role="dialog" aria-label={t("dateRange.jumpTo")}>
      <div className="date-range-jump-header">
        <button type="button" className="secondary date-range-step" onClick={() => setYear((y) => y - 1)} aria-label={t("dateRange.prev")}>
          ‹
        </button>
        <strong>{year}</strong>
        <button type="button" className="secondary date-range-step" onClick={() => setYear((y) => y + 1)} aria-label={t("dateRange.next")}>
          ›
        </button>
      </div>
      <div className="date-range-month-grid">
        {months.map((month) => {
          const active = year === range.anchorDate.getFullYear() && month === range.anchorDate.getMonth();
          const label = new Date(year, month, 1).toLocaleDateString(locale, { month: "short" });
          return (
            <button
              key={month}
              type="button"
              className={active ? "active" : "secondary"}
              onClick={() => pick(new Date(year, month, 1))}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function DateRangeNav({ range }: DateRangeNavProps) {
  const { t } = useTranslation();
  const [jumpOpen, setJumpOpen] = useState(false);
  const jumpRef = useRef<HTMLDivElement>(null);
  const hideNav = range.periodType === "all";
  const canJump = range.periodType !== "custom" && range.periodType !== "all";

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!jumpRef.current?.contains(e.target as Node)) setJumpOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    setJumpOpen(false);
  }, [range.periodType]);

  return (
    <div className="date-range-nav">
      {!hideNav && (
        <button type="button" className="secondary date-range-step" onClick={range.prev} aria-label={t("dateRange.prev")}>
          ‹
        </button>
      )}
      <div className="date-range-jump" ref={jumpRef}>
        <button
          type="button"
          className="date-range-jump-btn"
          onClick={() => canJump && setJumpOpen((v) => !v)}
          aria-expanded={jumpOpen}
          aria-haspopup={canJump ? "dialog" : undefined}
          disabled={!canJump}
        >
          <span>{range.label}</span>
          {canJump && <GlyphIcon icon="expand_more" />}
        </button>
        {jumpOpen && canJump && (
          <PeriodJumpPanel range={range} onClose={() => setJumpOpen(false)} />
        )}
      </div>
      {!hideNav && (
        <button type="button" className="secondary date-range-step" onClick={range.next} aria-label={t("dateRange.next")}>
          ›
        </button>
      )}
      <label className="date-range-type-wrap">
        <select
          className="date-range-type"
          value={range.periodType}
          onChange={(e) => range.setPeriodType(e.target.value as PeriodType)}
          aria-label={t("dateRange.periodType")}
        >
          <option value="week">{t("dateRange.week")}</option>
          <option value="month">{t("dateRange.month")}</option>
          <option value="year">{t("dateRange.year")}</option>
          <option value="all">{t("dateRange.allTime")}</option>
          <option value="custom">{t("dateRange.custom")}</option>
        </select>
      </label>
      {range.periodType === "custom" && (
        <div className="date-range-custom">
          <input type="date" value={range.customFrom} onChange={(e) => range.setCustomFrom(e.target.value)} />
          <span className="muted-text">–</span>
          <input type="date" value={range.customTo} onChange={(e) => range.setCustomTo(e.target.value)} />
        </div>
      )}
    </div>
  );
}
