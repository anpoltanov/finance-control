import type { Budget, BudgetStatus, ReportSummary } from "../api/client";
import { db } from "../db";
import { resolveCategoryColor } from "../utils/categoryTree";

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, date.getDate());
}

function addYears(date: Date, years: number): Date {
  return new Date(date.getFullYear() + years, date.getMonth(), date.getDate());
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseIsoDate(value: string): Date {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function periodBounds(budget: Budget, reference = new Date()): { start: Date; end: Date } {
  const start = parseIsoDate(budget.start_date);
  const deltaMonths = budget.period === "monthly" ? 1 : 12;
  let periodStart = start;
  while (true) {
    const next = budget.period === "monthly" ? addMonths(periodStart, 1) : addYears(periodStart, 1);
    if (next > reference) break;
    periodStart = next;
  }
  const periodEndExclusive = budget.period === "monthly" ? addMonths(periodStart, 1) : addYears(periodStart, 1);
  const periodEnd = new Date(periodEndExclusive.getFullYear(), periodEndExclusive.getMonth(), periodEndExclusive.getDate() - 1);
  void deltaMonths;
  return { start: periodStart, end: periodEnd };
}

async function spentInPeriod(budget: Budget, periodStart: Date, periodEnd: Date): Promise<number> {
  const startMs = periodStart.getTime();
  const endMs = new Date(periodEnd.getFullYear(), periodEnd.getMonth(), periodEnd.getDate(), 23, 59, 59).getTime();
  const txs = await db.transactions
    .filter((tx) => {
      if (tx.type !== "expense") return false;
      const t = new Date(tx.date).getTime();
      if (t < startMs || t > endMs) return false;
      if (budget.category_ids?.length) {
        return tx.category != null && budget.category_ids.includes(tx.category);
      }
      return true;
    })
    .toArray();
  return txs.reduce((sum, tx) => sum + parseFloat(tx.amount), 0);
}

export async function computeBudgetStatus(budget: Budget, reference = new Date()): Promise<BudgetStatus> {
  const { start, end } = periodBounds(budget, reference);
  let spent = await spentInPeriod(budget, start, end);
  let limit = parseFloat(budget.amount);

  if (budget.rollover_enabled) {
    let rollover = 0;
    let cursor = parseIsoDate(budget.start_date);
    while (cursor < start) {
      const cursorEndExclusive = budget.period === "monthly" ? addMonths(cursor, 1) : addYears(cursor, 1);
      const cursorEnd = new Date(cursorEndExclusive.getFullYear(), cursorEndExclusive.getMonth(), cursorEndExclusive.getDate() - 1);
      const periodSpent = await spentInPeriod(budget, cursor, cursorEnd);
      rollover += Math.max(parseFloat(budget.amount) - periodSpent, 0);
      cursor = cursorEndExclusive;
    }
    limit += rollover;
  }

  const remaining = limit - spent;
  return {
    period_start: toIsoDate(start),
    period_end: toIsoDate(end),
    limit: String(limit),
    spent: String(spent),
    remaining: String(remaining),
    percent_used: limit ? (spent / limit) * 100 : 0,
  };
}

export async function listBudgetsWithStatus(): Promise<Budget[]> {
  const budgets = await db.budgets.toArray();
  return Promise.all(
    budgets.map(async (b) => ({
      ...b,
      status: await computeBudgetStatus(b),
    }))
  );
}

export async function computeReportSummary(from?: string, to?: string): Promise<ReportSummary> {
  let txs = await db.transactions.toArray();
  if (from) {
    const fromMs = new Date(from).getTime();
    txs = txs.filter((tx) => new Date(tx.date).getTime() >= fromMs);
  }
  if (to) {
    const toMs = new Date(to).getTime();
    txs = txs.filter((tx) => new Date(tx.date).getTime() <= toMs);
  }

  const categories = await db.categories.toArray();
  let income = 0;
  let expense = 0;
  const byCategoryMap = new Map<number, number>();
  const monthlyMap = new Map<string, { expense: number; income: number }>();

  for (const tx of txs) {
    const amount = parseFloat(tx.amount);
    if (tx.type === "income") income += amount;
    if (tx.type === "expense") {
      expense += amount;
      if (tx.category) {
        byCategoryMap.set(tx.category, (byCategoryMap.get(tx.category) || 0) + amount);
      }
    }
    if (tx.type === "expense" || tx.type === "income") {
      const monthKey = tx.date.slice(0, 7);
      const bucket = monthlyMap.get(monthKey) || { expense: 0, income: 0 };
      bucket[tx.type] += amount;
      monthlyMap.set(monthKey, bucket);
    }
  }

  const by_category = [...byCategoryMap.entries()]
    .map(([category_id, total]) => {
      const cat = categories.find((c) => c.id === category_id);
      return {
        category_id,
        category_name: cat?.name || String(category_id),
        category_color: resolveCategoryColor(categories, category_id),
        total: String(total),
      };
    })
    .sort((a, b) => parseFloat(b.total) - parseFloat(a.total));

  const monthly = [...monthlyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([month, totals]) => [
      { month: `${month}-01T00:00:00`, type: "expense", total: String(totals.expense) },
      { month: `${month}-01T00:00:00`, type: "income", total: String(totals.income) },
    ]);

  return {
    income_total: String(income),
    expense_total: String(expense),
    by_category,
    monthly,
  };
}
