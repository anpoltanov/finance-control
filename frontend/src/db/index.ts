import Dexie, { type EntityTable } from "dexie";
import type { Account, Budget, Category, PlannedTransaction, SyncPayload, Tag, Transaction } from "../api/client";

export interface OutboxItem {
  id?: number;
  method: "POST" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
  localId?: number;
  entity?: "accounts" | "categories" | "tags" | "transactions" | "budgets" | "planned";
  createdAt: string;
}

class FinanceDB extends Dexie {
  accounts!: EntityTable<Account, "id">;
  categories!: EntityTable<Category, "id">;
  tags!: EntityTable<Tag, "id">;
  transactions!: EntityTable<Transaction, "id">;
  budgets!: EntityTable<Budget, "id">;
  planned!: EntityTable<PlannedTransaction, "id">;
  meta!: EntityTable<{ key: string; value: string }, "key">;
  outbox!: EntityTable<OutboxItem, "id">;

  constructor() {
    super("finance-control");
    this.version(1).stores({
      accounts: "id, title",
      categories: "id, name",
      tags: "id, name",
      transactions: "id, date, account, type",
      budgets: "id",
      planned: "id",
      meta: "key",
      outbox: "++id, createdAt",
    });
    this.version(2).stores({
      accounts: "id, title",
      categories: "id, name, parent",
      tags: "id, name",
      transactions: "id, date, account, to_account, type, category",
      budgets: "id",
      planned: "id, next_occurrence_date",
      meta: "key",
      outbox: "++id, createdAt",
    });
  }
}

export const db = new FinanceDB();

export async function applySyncPayload(payload: SyncPayload) {
  const deleted = payload.deleted_ids;
  await db.transaction(
    "rw",
    [db.accounts, db.categories, db.tags, db.transactions, db.budgets, db.planned, db.meta],
    async () => {
      if (deleted) {
        if (deleted.accounts.length) await db.accounts.bulkDelete(deleted.accounts);
        if (deleted.categories.length) await db.categories.bulkDelete(deleted.categories);
        if (deleted.tags.length) await db.tags.bulkDelete(deleted.tags);
        if (deleted.transactions.length) await db.transactions.bulkDelete(deleted.transactions);
        if (deleted.budgets.length) await db.budgets.bulkDelete(deleted.budgets);
        if (deleted.planned_transactions.length) await db.planned.bulkDelete(deleted.planned_transactions);
      }
      if (payload.accounts.length) await db.accounts.bulkPut(payload.accounts);
      if (payload.categories.length) await db.categories.bulkPut(payload.categories);
      if (payload.tags.length) await db.tags.bulkPut(payload.tags);
      if (payload.transactions.length) await db.transactions.bulkPut(payload.transactions);
      if (payload.budgets.length) await db.budgets.bulkPut(payload.budgets);
      if (payload.planned_transactions.length) await db.planned.bulkPut(payload.planned_transactions);
      await db.meta.put({ key: "last_synced_at", value: payload.synced_at });
    }
  );
}

/** @deprecated use applySyncPayload */
export const cacheSyncPayload = applySyncPayload;

export async function getLastSyncedAt(): Promise<string | undefined> {
  const row = await db.meta.get("last_synced_at");
  return row?.value;
}

export async function flushOutbox(
  fetchFn: (item: OutboxItem) => Promise<{ id: number } | { drop: true } | void>
) {
  const items = await db.outbox.orderBy("createdAt").toArray();
  for (const item of items) {
    const result = await fetchFn(item);
    if (result && typeof result === "object" && "drop" in result && result.drop) {
      if (item.id) await db.outbox.delete(item.id);
      continue;
    }
    if (item.localId && result && typeof result === "object" && "id" in result && item.entity) {
      const table = entityTable(item.entity);
      const local = await table.get(item.localId);
      if (local) {
        await table.delete(item.localId);
        await table.put({ ...local, id: result.id } as never);
      }
    }
    if (item.id) await db.outbox.delete(item.id);
  }
}

function entityTable(entity: NonNullable<OutboxItem["entity"]>) {
  switch (entity) {
    case "accounts":
      return db.accounts;
    case "categories":
      return db.categories;
    case "tags":
      return db.tags;
    case "transactions":
      return db.transactions;
    case "budgets":
      return db.budgets;
    case "planned":
      return db.planned;
  }
}

export async function queueOutbox(item: Omit<OutboxItem, "id" | "createdAt">) {
  await db.outbox.add({ ...item, createdAt: new Date().toISOString() });
}

export async function nextTempId(): Promise<number> {
  const row = await db.meta.get("temp_id_seq");
  const next = (row ? Number(row.value) : 0) - 1;
  await db.meta.put({ key: "temp_id_seq", value: String(next) });
  return next;
}
