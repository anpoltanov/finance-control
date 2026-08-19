import { useState } from "react";
import { Chart as ChartJS, ArcElement, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from "chart.js";
import { Bar, Doughnut } from "react-chartjs-2";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import DateRangeNav from "../components/DateRangeNav";
import { computeReportSummary } from "../data/reports";
import { runSync } from "../hooks/useOfflineSync";
import { useDateRangePeriod } from "../hooks/useDateRangePeriod";
import { formatCurrency } from "../utils/format";

ChartJS.register(ArcElement, CategoryScale, LinearScale, BarElement, Tooltip, Legend);

export default function ReportsPage() {
  const { t, i18n } = useTranslation();
  const range = useDateRangePeriod("month");
  const [syncStatus, setSyncStatus] = useState("");

  const report = useLiveQuery(
    () => computeReportSummary(range.fromParam || undefined, range.toParam || undefined),
    [range.fromParam, range.toParam, i18n.language]
  );

  async function syncNow() {
    await runSync();
    setSyncStatus(t("reports.syncedAt", { time: new Date().toISOString() }));
  }

  const currencyTooltip = {
    callbacks: {
      label: (ctx: { dataset?: { label?: string }; label?: string; parsed: number | { y?: number } | null }) => {
        const parsed = ctx.parsed;
        const value = typeof parsed === "number" ? parsed : parsed?.y ?? 0;
        const name = ctx.dataset?.label || ctx.label || "";
        return `${name ? `${name}: ` : ""}${formatCurrency(value)}`;
      },
    },
  };

  const categoryData = report
    ? {
        labels: report.by_category.map((c) => c.category_name),
        datasets: [{
          data: report.by_category.map((c) => parseFloat(c.total)),
          backgroundColor: report.by_category.map((c) => c.category_color || "#6366f1"),
        }],
      }
    : null;

  const months = report ? ([...new Set(report.monthly.map((m) => m.month))].filter(Boolean) as string[]) : [];
  const barData = report
    ? {
        labels: months.map((m) => m.slice(0, 7)),
        datasets: [
          {
            label: t("txType.expense"),
            data: months.map((m) => parseFloat(report.monthly.find((x) => x.month === m && x.type === "expense")?.total || "0")),
            backgroundColor: "#ef4444",
          },
          {
            label: t("txType.income"),
            data: months.map((m) => parseFloat(report.monthly.find((x) => x.month === m && x.type === "income")?.total || "0")),
            backgroundColor: "#22c55e",
          },
        ],
      }
    : null;

  return (
    <div>
      <div className="page-header">
        <h2>{t("reports.title")}</h2>
        <DateRangeNav range={range} />
        <button className="secondary" onClick={syncNow}>{t("reports.sync")}</button>
      </div>
      {syncStatus && <p className="muted-text">{syncStatus}</p>}

      {!report ? (
        <p>{t("common.loading")}</p>
      ) : (
        <>
          <div className="grid">
            <div className="card">
              <h3>{t("reports.income")}</h3>
              <p style={{ fontSize: "1.5rem" }}>{formatCurrency(report.income_total)}</p>
            </div>
            <div className="card">
              <h3>{t("reports.expense")}</h3>
              <p style={{ fontSize: "1.5rem" }}>{formatCurrency(report.expense_total)}</p>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div className="card">
              <h3>{t("reports.byCategory")}</h3>
              {report.by_category.length > 0 && categoryData ? (
                <Doughnut
                  data={categoryData}
                  options={{
                    plugins: { tooltip: currencyTooltip },
                  }}
                />
              ) : (
                <p>{t("common.noData")}</p>
              )}
            </div>
            <div className="card">
              <h3>{t("reports.monthlyTrends")}</h3>
              {months.length > 0 && barData ? (
                <Bar
                  data={barData}
                  options={{
                    responsive: true,
                    plugins: { tooltip: currencyTooltip },
                    scales: {
                      y: {
                        ticks: { callback: (value) => formatCurrency(Number(value)) },
                      },
                    },
                  }}
                />
              ) : (
                <p>{t("common.noData")}</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
