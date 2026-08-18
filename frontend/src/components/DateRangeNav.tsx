import { useTranslation } from "react-i18next";
import type { DateRangePeriod } from "../hooks/useDateRangePeriod";

interface DateRangeNavProps {
  range: DateRangePeriod;
}

export default function DateRangeNav({ range }: DateRangeNavProps) {
  const { t } = useTranslation();

  return (
    <div className="date-range-nav">
      <button type="button" className="secondary date-range-step" onClick={range.prev} aria-label={t("dateRange.prev")}>
        ‹
      </button>
      <label className="date-range-select-wrap">
        <span className="date-range-label">{range.label}</span>
        <select
          className="date-range-select"
          value={range.periodType}
          onChange={(e) => range.setPeriodType(e.target.value as DateRangePeriod["periodType"])}
          aria-label={range.label}
        >
          <option value="week">{t("dateRange.week")}</option>
          <option value="month">{t("dateRange.month")}</option>
          <option value="year">{t("dateRange.year")}</option>
          <option value="custom">{t("dateRange.custom")}</option>
        </select>
      </label>
      <button type="button" className="secondary date-range-step" onClick={range.next} aria-label={t("dateRange.next")}>
        ›
      </button>
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
