import Dexie, { type EntityTable } from "dexie";
import type { Account, Budget, Category, PlannedTransaction, SyncPayload, Tag, Transaction } from "../api/client";
import { newClientId } from "../utils/clientId";

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
      if (payload.accounts.length) await db.accounts.bulkPut(payload.accounts);
      if (payload.categories.length) await db.categories.bulkPut(payload.categories);
      if (payload.tags.length) await db.tags.bulkPut(payload.tags);
      if (payload.transactions.length) await db.transactions.bulkPut(payload.transactions);
      if (payload.budgets.length) await db.budgets.bulkPut(payload.budgets);
      if (payload.planned_transactions.length) await db.planned.bulkPut(payload.planned_transactions);
      // A sync that started before a delete can list the row and its id together.
      // Removing after the write keeps the delete.
      if (deleted) {
        if (deleted.accounts.length) await db.accounts.bulkDelete(deleted.accounts);
        if (deleted.categories.length) await db.categories.bulkDelete(deleted.categories);
        if (deleted.tags.length) await db.tags.bulkDelete(deleted.tags);
        if (deleted.transactions.length) await db.transactions.bulkDelete(deleted.transactions);
        if (deleted.budgets.length) await db.budgets.bulkDelete(deleted.budgets);
        if (deleted.planned_transactions.length) await db.planned.bulkDelete(deleted.planned_transactions);
      }
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

/** True when IndexedDB already holds records the user can work with. */
export async function hasLocalData(): Promise<boolean> {
  const counts = await Promise.all([
    db.accounts.count(),
    db.categories.count(),
    db.tags.count(),
    db.transactions.count(),
    db.budgets.count(),
    db.planned.count(),
  ]);
  return counts.some((count) => count > 0);
}

export type OutboxFlushResult =
  | void
  | { drop: true; status?: number }
  | { id: number }
  | { transaction: Transaction; planned: PlannedTransaction | null };

const TRANSACTION_CREATE = /^\/transactions\/?$/;
const PLANNED_COMMIT = /^\/planned-transactions\/\d+\/commit\/?$/;

function outboxBody(item: OutboxItem): Record<string, unknown> {
  if (item.body && typeof item.body === "object" && !Array.isArray(item.body)) {
    return { ...(item.body as Record<string, unknown>) };
  }
  return {};
}

/** Give each queued create a client_id before it is sent, and keep that id if the send is retried. */
export async function stampOutboxClientIds(items: OutboxItem[]): Promise<OutboxItem[]> {
  const stamped: OutboxItem[] = [];
  await db.transaction("rw", db.outbox, async () => {
    for (const item of items) {
      if (item.method !== "POST" || (!TRANSACTION_CREATE.test(item.path) && !PLANNED_COMMIT.test(item.path))) {
        stamped.push(item);
        continue;
      }
      const fresh = item.id ? await db.outbox.get(item.id) : item;
      if (!fresh) continue;
      const body = outboxBody(fresh);
      if (typeof body.client_id !== "string" || body.client_id.length === 0) {
        body.client_id = newClientId();
        if (fresh.id) await db.outbox.update(fresh.id, { body });
      }
      stamped.push({ ...fresh, body });
    }
  });
  return stamped;
}

let outboxChain: Promise<void> = Promise.resolve();

function withOutboxLock(fn: () => Promise<void>): Promise<void> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (locks && typeof locks.request === "function") {
    // The lock is held until fn settles. The DOM types don't flatten that promise.
    return locks.request("finance-control-outbox", () => fn()) as unknown as Promise<void>;
  }
  const run = outboxChain.then(fn, fn);
  outboxChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export function flushOutbox(fetchFn: (item: OutboxItem) => Promise<OutboxFlushResult>): Promise<void> {
  return withOutboxLock(() => flushOutboxUnlocked(fetchFn));
}

async function flushOutboxUnlocked(fetchFn: (item: OutboxItem) => Promise<OutboxFlushResult>) {
  const items = await stampOutboxClientIds(await db.outbox.orderBy("createdAt").toArray());
  for (const item of items) {
    const result = await fetchFn(item);
    if (result && typeof result === "object" && "drop" in result && result.drop) {
      const status = "status" in result ? result.status : undefined;
      if ((status === 404 || status === 409) && item.method === "POST" && item.localId && item.entity) {
        await entityTable(item.entity).delete(item.localId);
      }
      if (item.id) await db.outbox.delete(item.id);
      continue;
    }
    if (result && typeof result === "object" && "transaction" in result && result.transaction) {
      if (item.localId) await db.transactions.delete(item.localId);
      await db.transactions.put(result.transaction);
      const plannedMatch = item.path.match(/\/planned-transactions\/(\d+)\/commit\/?$/);
      const plannedId = plannedMatch ? Number(plannedMatch[1]) : undefined;
      if (result.planned) await db.planned.put(result.planned);
      else if (plannedId) await db.planned.delete(plannedId);
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

export async function clearLocalCache(): Promise<void> {
  await db.transaction(
    "rw",
    [db.accounts, db.categories, db.tags, db.transactions, db.budgets, db.planned, db.meta, db.outbox],
    async () => {
      await db.accounts.clear();
      await db.categories.clear();
      await db.tags.clear();
      await db.transactions.clear();
      await db.budgets.clear();
      await db.planned.clear();
      await db.meta.clear();
      await db.outbox.clear();
    }
  );
}

export async function nextTempId(): Promise<number> {
  const row = await db.meta.get("temp_id_seq");
  const next = (row ? Number(row.value) : 0) - 1;
  await db.meta.put({ key: "temp_id_seq", value: String(next) });
  return next;
}
