import type { Category, Transaction } from "../api/client";
import { classifyCashFlow } from "../utils/classify.ts";
import { pctChange } from "../utils/pctChange.ts";

export interface IncomeExpenseRow {
  key: string;
  categoryId: number | null;
  name: string;
  total: number;
  previousTotal: number;
  pct: number | null;
  hasChildren: boolean;
  exact: boolean;
  uncategorized: boolean;
}

export interface IncomeExpenseGroup {
  kind: "income" | "expense";
  total: number;
  previousTotal: number;
  pct: number | null;
  rows: IncomeExpenseRow[];
}

type FlowKind = "income" | "expense";

function childrenOf(categories: Category[], parentId: number | null): Category[] {
  return categories.filter((category) => category.parent === parentId);
}

function topLevelId(categories: Category[], categoryId: number): number {
  const byId = new Map(categories.map((category) => [category.id, category]));
  let current = byId.get(categoryId);
  let top = categoryId;
  const seen = new Set<number>();
  while (current?.parent && !seen.has(current.id)) {
    seen.add(current.id);
    top = current.parent;
    current = byId.get(current.parent);
  }
  return top;
}

/** Direct child of parentId that contains categoryId, or null when it is outside that subtree. */
function childUnder(categories: Category[], categoryId: number, parentId: number): number | null {
  const byId = new Map(categories.map((category) => [category.id, category]));
  let current = byId.get(categoryId);
  const seen = new Set<number>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    if (current.parent === parentId) return current.id;
    if (!current.parent || current.id === parentId) return null;
    current = byId.get(current.parent);
  }
  return null;
}

interface BucketSpec {
  key: string;
  categoryId: number | null;
  name: string;
  hasChildren: boolean;
  exact: boolean;
  uncategorized: boolean;
}

function bucketFor(
  categoryId: number | null | undefined,
  categories: Category[],
  parentId: number | null,
  uncategorizedName: string
): BucketSpec | null {
  const byId = new Map(categories.map((category) => [category.id, category]));
  if (categoryId == null || !byId.has(categoryId)) {
    if (parentId != null) return null;
    return {
      key: "uncategorized",
      categoryId: null,
      name: uncategorizedName,
      hasChildren: false,
      exact: true,
      uncategorized: true,
    };
  }
  if (parentId == null) {
    const top = topLevelId(categories, categoryId);
    const node = byId.get(top);
    if (!node) return null;
    const children = childrenOf(categories, top);
    return {
      key: `cat:${top}`,
      categoryId: top,
      name: node.name,
      hasChildren: children.length > 0,
      exact: children.length === 0,
      uncategorized: false,
    };
  }
  if (categoryId === parentId) {
    const node = byId.get(parentId);
    return {
      key: `direct:${parentId}`,
      categoryId: parentId,
      name: node?.name ?? String(parentId),
      hasChildren: false,
      exact: true,
      uncategorized: false,
    };
  }
  const childId = childUnder(categories, categoryId, parentId);
  if (childId == null) return null;
  const node = byId.get(childId);
  if (!node) return null;
  const children = childrenOf(categories, childId);
  return {
    key: `cat:${childId}`,
    categoryId: childId,
    name: node.name,
    hasChildren: children.length > 0,
    exact: children.length === 0,
    uncategorized: false,
  };
}

function accumulate(
  transactions: Transaction[],
  categories: Category[],
  excluded: Set<number>,
  parentId: number | null,
  uncategorizedName: string
): Map<FlowKind, Map<string, BucketSpec & { total: number }>> {
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const groups = new Map<FlowKind, Map<string, BucketSpec & { total: number }>>([
    ["income", new Map()],
    ["expense", new Map()],
  ]);
  for (const tx of transactions) {
    if (tx.type === "transfer") continue;
    if (excluded.has(tx.account)) continue;
    const flow = classifyCashFlow(tx, categoriesById);
    for (const kind of ["income", "expense"] as const) {
      const amount = flow[kind];
      if (!amount) continue;
      const spec = bucketFor(tx.category, categories, parentId, uncategorizedName);
      if (!spec) continue;
      const map = groups.get(kind)!;
      const existing = map.get(spec.key);
      if (existing) existing.total += amount;
      else map.set(spec.key, { ...spec, total: amount });
    }
  }
  return groups;
}

export function buildIncomeExpenseReport(args: {
  transactions: Transaction[];
  previousTransactions: Transaction[];
  categories: Category[];
  excludedAccountIds?: Iterable<number>;
  parentId?: number | null;
  uncategorizedName?: string;
}): { income: IncomeExpenseGroup; expense: IncomeExpenseGroup } {
  const excluded = new Set(args.excludedAccountIds ?? []);
  const parentId = args.parentId ?? null;
  const uncategorizedName = args.uncategorizedName ?? "Uncategorized";
  const current = accumulate(args.transactions, args.categories, excluded, parentId, uncategorizedName);
  const previous = accumulate(
    args.previousTransactions,
    args.categories,
    excluded,
    parentId,
    uncategorizedName
  );

  function group(kind: FlowKind): IncomeExpenseGroup {
    const cur = current.get(kind)!;
    const prev = previous.get(kind)!;
    const rows: IncomeExpenseRow[] = [];
    for (const key of new Set([...cur.keys(), ...prev.keys()])) {
      const base = cur.get(key) ?? prev.get(key)!;
      const total = cur.get(key)?.total ?? 0;
      const previousTotal = prev.get(key)?.total ?? 0;
      if (total === 0 && previousTotal === 0) continue;
      rows.push({
        key,
        categoryId: base.categoryId,
        name: base.name,
        total,
        previousTotal,
        pct: pctChange(total, previousTotal),
        hasChildren: base.hasChildren,
        exact: base.exact,
        uncategorized: base.uncategorized,
      });
    }
    rows.sort((a, b) => {
      if (a.uncategorized !== b.uncategorized) return a.uncategorized ? 1 : -1;
      return Math.abs(b.total) - Math.abs(a.total) || a.name.localeCompare(b.name);
    });
    const total = rows.reduce((sum, row) => sum + row.total, 0);
    const previousTotal = rows.reduce((sum, row) => sum + row.previousTotal, 0);
    return { kind, total, previousTotal, pct: pctChange(total, previousTotal), rows };
  }

  return { income: group("income"), expense: group("expense") };
}
