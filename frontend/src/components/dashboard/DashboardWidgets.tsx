import { useMemo, useState } from "react";
import {
  Chart as ChartJS,
  ArcElement,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Filler,
  Tooltip,
  Legend,
  type ChartEvent,
  type ActiveElement,
} from "chart.js";
import { Doughnut, Line } from "react-chartjs-2";
import { useTranslation } from "react-i18next";
import { expenseSlices, pctChange, type DashboardSnapshot } from "../../data/dashboard";
import { formatCurrency, chartNumericValue } from "../../utils/format";
import GlyphIcon from "../GlyphIcon";
import SemiGauge, { PctBadge, trendColor } from "./SemiGauge";

ChartJS.register(ArcElement, CategoryScale, LinearScale, LineElement, PointElement, Filler, Tooltip, Legend);

interface DashboardWidgetsProps {
  data: DashboardSnapshot;
}

function gaugeMax(current: number, previous: number): number {
  return Math.max(Math.abs(current), Math.abs(previous), 1);
}

export default function DashboardWidgets({ data }: DashboardWidgetsProps) {
  const { t, i18n } = useTranslation();
  const currency = data.primaryCurrency;
  const [drill, setDrill] = useState<number[]>([]);

  const parentId = drill.length ? drill[drill.length - 1] : null;
  const slices = useMemo(
    () => expenseSlices(data.categories, data.expenseByCategory, parentId),
    [data.categories, data.expenseByCategory, parentId]
  );
  const parentName = parentId ? data.categories.find((c) => c.id === parentId)?.name : null;

  const series = data.balanceSeries;
  const endBalance = series.values.length ? series.values[series.values.length - 1] : data.currentBalance;
  const flowMax = Math.max(data.period.income, data.period.expense, 1);
  const balancePct = pctChange(data.currentBalance, data.previousBalance);
  const cashFlowPct = pctChange(data.period.net, data.previousPeriod.net);
  const expensePct = pctChange(data.period.expense, data.previousPeriod.expense);

  function onSliceClick(_event: ChartEvent, elements: ActiveElement[]) {
    const index = elements[0]?.index;
    if (index == null) return;
    const slice = slices[index];
    if (slice?.hasChildren && !slice.direct) setDrill((path) => [...path, slice.id]);
  }

  return (
    <div className="dashboard-widgets">
      <section className="card widget-card widget-gauges">
        <h3>{t("dashboard.gauges")}</h3>
        <div className="gauge-row">
          <SemiGauge
            label={t("dashboard.totalBalance")}
            display={formatCurrency(data.currentBalance, currency)}
            value={data.currentBalance}
            max={gaugeMax(data.currentBalance, data.previousBalance)}
            color={trendColor(balancePct)}
            pct={balancePct}
          />
          <SemiGauge
            label={t("dashboard.periodCashFlow")}
            display={formatCurrency(data.period.net, currency)}
            value={data.period.net}
            max={gaugeMax(data.period.net, data.previousPeriod.net)}
            color={trendColor(cashFlowPct)}
            pct={cashFlowPct}
          />
          <SemiGauge
            label={t("dashboard.periodExpenses")}
            display={formatCurrency(data.period.expense, currency)}
            value={data.period.expense}
            max={gaugeMax(data.period.expense, data.previousPeriod.expense)}
            color={trendColor(expensePct, true)}
            pct={expensePct}
            invert
          />
        </div>
      </section>

      <section className="card widget-card">
        <div className="widget-header">
          <h3>{t("dashboard.balanceDynamics")}</h3>
          <PctBadge pct={pctChange(endBalance, data.previousEndBalance)} />
        </div>
        <p className="widget-hero">{formatCurrency(endBalance, currency)}</p>
        {series.labels.length > 1 ? (
          <div className="widget-chart">
            <Line
            data={{
              labels: series.labels.map((d) =>
                new Date(`${d}T00:00:00`).toLocaleDateString(i18n.language, { day: "numeric", month: "short" })
              ),
              datasets: [
                {
                  data: series.values,
                  borderColor: "#6366f1",
                  backgroundColor: "rgba(99, 102, 241, 0.18)",
                  fill: true,
                  tension: 0.3,
                  pointRadius: 0,
                  borderWidth: 2,
                },
              ],
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: {
                  callbacks: {
                    label: (ctx) => formatCurrency(chartNumericValue(ctx.parsed), currency),
                  },
                },
              },
              scales: {
                x: { grid: { display: false } },
                y: {
                  grid: { color: "rgba(100,116,139,0.2)" },
                  ticks: { callback: (value) => formatCurrency(Number(value), currency) },
                },
              },
            }}
          />
          </div>
        ) : (
          <p className="muted-text">{t("common.noData")}</p>
        )}
      </section>

      <section className="card widget-card">
        <div className="widget-header">
          <h3>{t("dashboard.cashFlow")}</h3>
          <PctBadge pct={cashFlowPct} />
        </div>
        <p className="widget-hero">{formatCurrency(data.period.net, currency)}</p>
        <div className="cashflow-bars">
          <div className="cashflow-bar-row">
            <span>{t("reports.income")}</span>
            <div className="cashflow-track">
              <div className="cashflow-fill income" style={{ width: `${(data.period.income / flowMax) * 100}%` }} />
            </div>
            <strong>{formatCurrency(data.period.income, currency)}</strong>
          </div>
          <div className="cashflow-bar-row">
            <span>{t("reports.expense")}</span>
            <div className="cashflow-track">
              <div className="cashflow-fill expense" style={{ width: `${(data.period.expense / flowMax) * 100}%` }} />
            </div>
            <strong>{formatCurrency(data.period.expense, currency)}</strong>
          </div>
        </div>
      </section>

      <section className="card widget-card">
        <div className="widget-header">
          <h3>{t("dashboard.expensesStructure")}</h3>
          {drill.length > 0 && (
            <button
              type="button"
              className="secondary widget-back"
              onClick={() => setDrill((path) => path.slice(0, -1))}
            >
              <GlyphIcon icon="arrow_back" />
              {parentName || t("common.back")}
            </button>
          )}
        </div>
        {slices.length === 0 ? (
          <p className="muted-text">{t("common.noData")}</p>
        ) : (
          <div className="expense-doughnut">
            <Doughnut
              data={{
                labels: slices.map((s) => s.name),
                datasets: [
                  {
                    data: slices.map((s) => s.total),
                    backgroundColor: slices.map((s) => s.color),
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                onClick: onSliceClick,
                plugins: {
                  legend: {
                    position: "bottom",
                    onClick: (_e, item) => {
                      const slice = slices[item.index ?? -1];
                      if (slice?.hasChildren && !slice.direct) setDrill((path) => [...path, slice.id]);
                    },
                  },
                  tooltip: {
                    callbacks: {
                      label: (ctx) => {
                        const name = ctx.label ? `${ctx.label}: ` : "";
                        return `${name}${formatCurrency(chartNumericValue(ctx.parsed), currency)}`;
                      },
                    },
                  },
                },
              }}
            />
          </div>
        )}
      </section>
    </div>
  );
}
