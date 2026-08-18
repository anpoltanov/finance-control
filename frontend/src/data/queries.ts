import type { Account, Category, Tag, Transaction } from "../api/client";
import { db } from "../db";
import { resolveCategoryColor } from "../utils/categoryTree";

export interface TransactionFilters {
  account?: string | number;
  category?: string | number;
  tag?: string | number;
  type?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
  amount_min?: string | number;
  amount_max?: string | number;
  hide_transfers?: string | boolean;
  sort?: "date_desc" | "date_asc" | "amount_desc" | "amount_asc";
}

function parseDate(value: string): number {
  return new Date(value).getTime();
}

export async function listAccounts(): Promise<Account[]> {
  const accounts = await db.accounts.toArray();
  const withBalances = await Promise.all(
    accounts.map(async (account) => ({
      ...account,
      balance: String(await computeAccountBalance(account)),
    }))
  );
  return withBalances.sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title));
}

export async function getAccount(id: number): Promise<Account | undefined> {
  const account = await db.accounts.get(id);
  if (!account) return undefined;
  return { ...account, balance: String(await computeAccountBalance(account)) };
}

export async function computeAccountBalance(account: Account): Promise<number> {
  const txs = await db.transactions
    .filter((tx) => tx.account === account.id || tx.to_account === account.id)
    .toArray();
  let balance = parseFloat(account.initial_balance || "0");
  for (const tx of txs) {
    const amount = parseFloat(tx.amount);
    if (tx.type === "income" && tx.account === account.id) balance += amount;
    else if (tx.type === "expense" && tx.account === account.id) balance -= amount;
    else if (tx.type === "transfer") {
      if (tx.transfer_kind === "account_to_account") {
        if (tx.account === account.id) balance -= amount;
        else if (tx.to_account === account.id) balance += amount;
      } else if (tx.transfer_kind === "to_nowhere" && tx.account === account.id) {
        balance -= amount;
      } else if (tx.transfer_kind === "from_nowhere" && tx.account === account.id) {
        balance += amount;
      }
    }
  }
  return balance;
}

export async function listCategories(): Promise<Category[]> {
  return (await db.categories.toArray()).sort((a, b) => a.name.localeCompare(b.name));
}

export async function listTags(): Promise<Tag[]> {
  return (await db.tags.toArray()).sort((a, b) => a.name.localeCompare(b.name));
}

export async function enrichTransaction(
  tx: Transaction,
  accounts?: Account[],
  categories?: Category[],
  tags?: Tag[]
): Promise<Transaction> {
  const accs = accounts || (await db.accounts.toArray());
  const cats = categories || (await db.categories.toArray());
  const allTags = tags || (await db.tags.toArray());
  const account = accs.find((a) => a.id === tx.account);
  const toAccount = tx.to_account ? accs.find((a) => a.id === tx.to_account) : undefined;
  const category = tx.category ? cats.find((c) => c.id === tx.category) : undefined;
  const tagIds = tx.tag_ids || [];
  const tagNames = tagIds
    .map((id) => allTags.find((t) => t.id === id)?.name)
    .filter((n): n is string => Boolean(n));
  return {
    ...tx,
    account_title: account?.title,
    account_color: account?.color,
    to_account_title: toAccount?.title ?? null,
    category_name: category?.name ?? null,
    category_icon: category?.icon ?? null,
    category_color: category ? resolveCategoryColor(cats, category.id) : null,
    tag_names: tagNames,
  };
}

export async function listTransactions(filters: TransactionFilters = {}): Promise<Transaction[]> {
  const [accounts, categories, tags] = await Promise.all([
    db.accounts.toArray(),
    db.categories.toArray(),
    db.tags.toArray(),
  ]);
  let txs = await db.transactions.toArray();

  if (filters.account) {
    const accountId = Number(filters.account);
    txs = txs.filter((tx) => tx.account === accountId || tx.to_account === accountId);
  }
  if (filters.category) {
    const categoryId = Number(filters.category);
    txs = txs.filter((tx) => tx.category === categoryId);
  }
  if (filters.type) {
    txs = txs.filter((tx) => tx.type === filters.type);
  }
  if (filters.tag) {
    const tagId = Number(filters.tag);
    txs = txs.filter((tx) => (tx.tag_ids || []).includes(tagId));
  }
  if (filters.date_from) {
    const from = parseDate(filters.date_from);
    txs = txs.filter((tx) => parseDate(tx.date) >= from);
  }
  if (filters.date_to) {
    const to = parseDate(filters.date_to);
    txs = txs.filter((tx) => parseDate(tx.date) <= to);
  }
  if (filters.hide_transfers === true || filters.hide_transfers === "1" || filters.hide_transfers === "true") {
    txs = txs.filter((tx) => tx.type !== "transfer");
  }
  if (filters.amount_min !== undefined && filters.amount_min !== "") {
    const min = Number(filters.amount_min);
    if (!Number.isNaN(min)) txs = txs.filter((tx) => parseFloat(tx.amount) >= min);
  }
  if (filters.amount_max !== undefined && filters.amount_max !== "") {
    const max = Number(filters.amount_max);
    if (!Number.isNaN(max)) txs = txs.filter((tx) => parseFloat(tx.amount) <= max);
  }
  if (filters.search?.trim()) {
    const q = filters.search.trim().toLowerCase();
    txs = txs.filter((tx) => {
      const hay = [
        tx.notes,
        tx.recipient,
        tx.payment_type,
        accounts.find((a) => a.id === tx.account)?.title,
        tx.to_account ? accounts.find((a) => a.id === tx.to_account)?.title : "",
        tx.category ? categories.find((c) => c.id === tx.category)?.name : "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }

  const sort = filters.sort || "date_desc";
  txs.sort((a, b) => {
    if (sort === "date_asc") return parseDate(a.date) - parseDate(b.date) || a.id - b.id;
    if (sort === "amount_desc") return parseFloat(b.amount) - parseFloat(a.amount) || b.id - a.id;
    if (sort === "amount_asc") return parseFloat(a.amount) - parseFloat(b.amount) || a.id - b.id;
    return parseDate(b.date) - parseDate(a.date) || b.id - a.id;
  });

  return Promise.all(txs.map((tx) => enrichTransaction(tx, accounts, categories, tags)));
}
