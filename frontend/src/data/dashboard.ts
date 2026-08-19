import type { Account, Category, Transaction } from "../api/client";
import { db } from "../db";
import { listAccounts } from "./queries";
import { getChildren, resolveCategoryColor } from "../utils/categoryTree";

export interface DashboardSnapshot {
  plates: Account[];
  totalsByCurrency: Record<string, number>;
  currentBalance: number;
  previousBalance: number;
  period: CashFlow;
  previousPeriod: CashFlow;
  balanceSeries: { labels: string[]; values: number[] };
  previousEndBalance: number;
  expenseByCategory: Map<number, number>;
  categories: Category[];
  primaryCurrency: string;
}

export interface CashFlow {
  income: number;
  expense: number;
  net: number;
}

export interface ExpenseSlice {
  id: number;
  name: string;
  color: string;
  total: number;
  hasChildren: boolean;
  direct?: boolean;
}

function parseYmd(value: string): Date {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

export function previousEqualRange(fromYmd: string, toYmdValue: string): { from: string; to: string } {
  const from = parseYmd(fromYmd);
  const to = parseYmd(toYmdValue);
  const days = Math.round((to.getTime() - from.getTime()) / 86400000) + 1;
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(days - 1));
  return { from: toYmd(prevFrom), to: toYmd(prevTo) };
}

export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function statisticalDelta(tx: Transaction, accounts: Map<number, Account>): number {
  const fromAcc = accounts.get(tx.account);
  const toAcc = tx.to_account ? accounts.get(tx.to_account) : undefined;
  const fromStat = Boolean(fromAcc && !fromAcc.exclude_from_statistics);
  const toStat = Boolean(toAcc && !toAcc.exclude_from_statistics);
  const amt = parseFloat(tx.amount) || 0;
  if (tx.type === "income") return fromStat ? amt : 0;
  if (tx.type === "expense") return fromStat ? -amt : 0;
  if (tx.type !== "transfer") return 0;
  if (tx.transfer_kind === "account_to_account") {
    if (fromStat && !toStat) return -amt;
    if (!fromStat && toStat) return amt;
    return 0;
  }
  if (tx.transfer_kind === "to_nowhere") return fromStat ? -amt : 0;
  if (tx.transfer_kind === "from_nowhere") return fromStat ? amt : 0;
  return 0;
}

function inRange(tx: Transaction, fromMs: number, toMs: number): boolean {
  const t = new Date(tx.date).getTime();
  return t >= fromMs && t <= toMs;
}

function cashFlowFor(
  txs: Transaction[],
  accounts: Map<number, Account>,
  fromMs: number,
  toMs: number
): CashFlow {
  let income = 0;
  let expense = 0;
  for (const tx of txs) {
    if (!inRange(tx, fromMs, toMs)) continue;
    const acc = accounts.get(tx.account);
    if (!acc || acc.exclude_from_statistics) continue;
    const amt = parseFloat(tx.amount) || 0;
    if (tx.type === "income") income += amt;
    if (tx.type === "expense") expense += amt;
  }
  return { income, expense, net: income - expense };
}

function rangeEndMs(toYmdValue: string): number {
  const to = parseYmd(toYmdValue);
  return new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999).getTime();
}

function statisticalBalanceAt(accounts: Account[], txs: Transaction[], beforeMs: number): number {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  let total = 0;
  for (const account of accounts) {
    if (account.exclude_from_statistics) continue;
    total += parseFloat(account.initial_balance || "0") || 0;
  }
  for (const tx of txs) {
    if (new Date(tx.date).getTime() >= beforeMs) continue;
    total += statisticalDelta(tx, byId);
  }
  return total;
}

function topLevelId(categories: Category[], id: number): number {
  const byId = new Map(categories.map((c) => [c.id, c]));
  let current = byId.get(id);
  while (current?.parent) {
    const parent = byId.get(current.parent);
    if (!parent) break;
    current = parent;
  }
  return current?.id ?? id;
}

export function expenseSlices(
  categories: Category[],
  byCategory: Map<number, number>,
  parentId: number | null
): ExpenseSlice[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const totals = new Map<number, number>();
  let direct = 0;

  for (const [categoryId, amount] of byCategory) {
    if (parentId == null) {
      const top = topLevelId(categories, categoryId);
      totals.set(top, (totals.get(top) || 0) + amount);
      continue;
    }
    let current = byId.get(categoryId);
    if (!current) continue;
    if (current.id === parentId) {
      direct += amount;
      continue;
    }
    while (current) {
      if (current.parent === parentId) {
        totals.set(current.id, (totals.get(current.id) || 0) + amount);
        break;
      }
      current = current.parent ? byId.get(current.parent) : undefined;
    }
  }

  const slices: ExpenseSlice[] = [];
  for (const [id, total] of totals) {
    if (total <= 0) continue;
    const category = byId.get(id);
    if (!category) continue;
    slices.push({
      id,
      name: category.name,
      color: resolveCategoryColor(categories, id),
      total,
      hasChildren: getChildren(categories, id).length > 0,
    });
  }
  if (parentId != null && direct > 0) {
    const parent = byId.get(parentId);
    if (parent) {
      slices.push({
        id: parent.id,
        name: parent.name,
        color: resolveCategoryColor(categories, parent.id),
        total: direct,
        hasChildren: false,
        direct: true,
      });
    }
  }
  return slices.sort((a, b) => b.total - a.total);
}

export async function loadDashboard(from: string, to: string): Promise<DashboardSnapshot> {
  const [accounts, categories, txs] = await Promise.all([
    listAccounts(),
    db.categories.toArray(),
    db.transactions.toArray(),
  ]);
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const fromMs = parseYmd(from).getTime();
  const toMs = rangeEndMs(to);
  const prev = previousEqualRange(from, to);
  const prevFromMs = parseYmd(prev.from).getTime();
  const prevToMs = rangeEndMs(prev.to);

  const statistical = accounts.filter((a) => !a.exclude_from_statistics);
  const plates = accounts.filter((a) => !a.archived);
  const totalsByCurrency = statistical.reduce<Record<string, number>>((acc, account) => {
    acc[account.currency_code] = (acc[account.currency_code] || 0) + parseFloat(account.balance);
    return acc;
  }, {});
  const primaryCurrency = statistical[0]?.currency_code || accounts[0]?.currency_code || "RUB";
  const currentBalance = statistical.reduce((sum, a) => sum + parseFloat(a.balance), 0);
  const previousBalance = statisticalBalanceAt(accounts, txs, prevToMs + 1);

  const period = cashFlowFor(txs, byId, fromMs, toMs);
  const previousPeriod = cashFlowFor(txs, byId, prevFromMs, prevToMs);

  let running = statisticalBalanceAt(accounts, txs, fromMs);
  const labels: string[] = [];
  const values: number[] = [];
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const rangeEnd = parseYmd(to);
  const seriesEnd = rangeEnd.getTime() > todayStart.getTime() ? todayStart : rangeEnd;
  for (let day = parseYmd(from); day.getTime() <= seriesEnd.getTime(); day = addDays(day, 1)) {
    const dayStart = day.getTime();
    const dayEnd = addDays(day, 1).getTime();
    for (const tx of txs) {
      const t = new Date(tx.date).getTime();
      if (t >= dayStart && t < dayEnd) running += statisticalDelta(tx, byId);
    }
    labels.push(toYmd(day));
    values.push(running);
  }

  const expenseByCategory = new Map<number, number>();
  for (const tx of txs) {
    if (tx.type !== "expense" || !tx.category) continue;
    if (!inRange(tx, fromMs, toMs)) continue;
    const acc = byId.get(tx.account);
    if (!acc || acc.exclude_from_statistics) continue;
    expenseByCategory.set(tx.category, (expenseByCategory.get(tx.category) || 0) + parseFloat(tx.amount));
  }

  return {
    plates,
    totalsByCurrency,
    currentBalance,
    previousBalance,
    period,
    previousPeriod,
    balanceSeries: { labels, values },
    previousEndBalance: previousBalance,
    expenseByCategory,
    categories,
    primaryCurrency,
  };
}
