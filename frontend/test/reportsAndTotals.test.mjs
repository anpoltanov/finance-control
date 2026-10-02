import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

if (!globalThis.localStorage) {
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (key) => (mem.has(key) ? mem.get(key) : null),
    setItem: (key, value) => mem.set(key, String(value)),
    removeItem: (key) => mem.delete(key),
    clear: () => mem.clear(),
    key: (index) => [...mem.keys()][index] ?? null,
    get length() {
      return mem.size;
    },
  };
}

const { signedTotalsByCurrency } = await import("../src/utils/transactionTotals.ts");
const { buildIncomeExpenseReport } = await import("../src/data/incomeExpense.ts");
const { categoryFilterIds } = await import("../src/utils/categoryIds.ts");
const { offlineCommitOutbox } = await import("../src/data/commitRequest.ts");

function tx(partial) {
  return {
    id: partial.id,
    type: partial.type,
    account: partial.account ?? 1,
    to_account: partial.to_account ?? null,
    transfer_kind: partial.transfer_kind ?? null,
    amount: String(partial.amount),
    category: partial.category ?? null,
    date: partial.date ?? "2026-09-10T12:00:00",
    notes: "",
    recipient: "",
    status: "cleared",
    payment_type: "",
    currency_code: partial.currency_code ?? "RUB",
  };
}

function category(id, name, type, parent = null) {
  return { id, name, icon: "folder", type, parent };
}

describe("filtered transaction totals", () => {
  it("signs income and expenses and ignores transfers on the main list", () => {
    const totals = signedTotalsByCurrency([
      tx({ id: 1, type: "income", amount: 10, currency_code: "RUB" }),
      tx({ id: 2, type: "expense", amount: 3, currency_code: "RUB" }),
      tx({ id: 3, type: "transfer", amount: 100, currency_code: "RUB", transfer_kind: "account_to_account", to_account: 2 }),
      tx({ id: 4, type: "income", amount: 2, currency_code: "USD" }),
    ]);
    assert.deepEqual(totals, [
      { currency: "RUB", total: 7 },
      { currency: "USD", total: 2 },
    ]);
  });

  it("follows the account perspective for transfers", () => {
    const rows = [
      tx({
        id: 1,
        type: "transfer",
        amount: 40,
        account: 1,
        to_account: 2,
        transfer_kind: "account_to_account",
      }),
      tx({ id: 2, type: "transfer", amount: 5, account: 1, transfer_kind: "from_nowhere" }),
    ];
    assert.equal(signedTotalsByCurrency(rows, 1)[0].total, -35);
    assert.equal(signedTotalsByCurrency(rows, 2)[0].total, 40);
  });
});

describe("income and expenses report", () => {
  const categories = [
    category(1, "Food", "expense"),
    category(2, "Groceries", "expense", 1),
    category(3, "Cafe", "expense", 1),
    category(4, "Salary", "income"),
  ];

  const current = [
    tx({ id: 1, type: "expense", amount: 30, category: 2 }),
    tx({ id: 2, type: "expense", amount: 10, category: 3 }),
    tx({ id: 3, type: "expense", amount: 5, category: 1 }),
    tx({ id: 4, type: "income", amount: 20, category: 2 }),
    tx({ id: 5, type: "income", amount: 100, category: 4 }),
    tx({ id: 6, type: "expense", amount: 8, category: null }),
    tx({ id: 7, type: "transfer", amount: 1000, transfer_kind: "to_nowhere" }),
    tx({ id: 8, type: "expense", amount: 50, category: 2, account: 9 }),
  ];
  const previous = [tx({ id: 9, type: "expense", amount: 20, category: 2 })];

  it("rolls children up, keeps a direct row, and compares with the previous window", () => {
    const report = buildIncomeExpenseReport({
      transactions: current,
      previousTransactions: previous,
      categories,
      excludedAccountIds: [9],
    });
    assert.equal(report.income.total, 100);
    assert.equal(report.income.rows[0].name, "Salary");
    const food = report.expense.rows.find((row) => row.name === "Food");
    const uncategorized = report.expense.rows.find((row) => row.uncategorized);
    assert.equal(food.total, 25);
    assert.equal(food.previousTotal, 20);
    assert.equal(food.pct, 25);
    assert.equal(food.hasChildren, true);
    assert.equal(uncategorized.total, 8);
    assert.equal(report.expense.total, 33);

    const drilled = buildIncomeExpenseReport({
      transactions: current,
      previousTransactions: previous,
      categories,
      excludedAccountIds: [9],
      parentId: 1,
    });
    const names = drilled.expense.rows.map((row) => row.name);
    assert.deepEqual(names.sort(), ["Cafe", "Food", "Groceries"]);
    assert.equal(drilled.expense.rows.find((row) => row.key === "direct:1").total, 5);
    assert.equal(drilled.expense.rows.find((row) => row.name === "Groceries").total, 10);
    assert.equal(drilled.expense.total, 25);
  });

  it("includes descendants unless the filter is exact", () => {
    assert.deepEqual([...categoryFilterIds(categories, 1, false)].sort(), [1, 2, 3]);
    assert.deepEqual([...categoryFilterIds(categories, 1, true)], [1]);
    assert.deepEqual([...categoryFilterIds(categories, 2, false)], [2]);
  });
});

describe("offline planned commit", () => {
  it("queues one commit request and keeps the override body", () => {
    const overrides = { amount: "12.50", notes: "edited", date: "2026-10-01T15:00:00" };
    const request = offlineCommitOutbox(5, overrides);
    assert.equal(request.method, "POST");
    assert.equal(request.path, "/planned-transactions/5/commit/");
    assert.deepEqual(request.body, overrides);
    assert.equal(request.path.includes("/transactions/"), false);

    const source = readFileSync(new URL("../src/data/repository.ts", import.meta.url), "utf8");
    const fn = source.slice(source.indexOf("export async function commitPlanned"));
    assert.match(fn, /offlineCommitOutbox/);
    assert.equal(fn.includes('"/transactions/"'), false);
    assert.equal(fn.includes("createTransaction"), false);
  });
});
