import { api, type Account, type Budget, type Category, type PlannedTransaction, type Tag, type Transaction } from "../api/client";
import { db, nextTempId, queueOutbox } from "../db";
import { enrichTransaction } from "./queries";
import { computeBudgetStatus } from "./reports";

async function tryOnline<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
  if (!navigator.onLine) return { ok: false };
  try {
    return { ok: true, value: await fn() };
  } catch {
    return { ok: false };
  }
}

// ---- Accounts ----

export async function createAccount(data: Partial<Account>): Promise<Account> {
  const online = await tryOnline(() => api.accounts.create(data));
  if (online.ok) {
    await db.accounts.put(online.value);
    return online.value;
  }
  const id = await nextTempId();
  const local: Account = {
    id,
    title: data.title || "",
    icon: data.icon || "credit_card",
    color: data.color || "#6366f1",
    sort_order: data.sort_order || 0,
    archived: data.archived || false,
    exclude_from_statistics: data.exclude_from_statistics || false,
    currency_code: data.currency_code || "RUB",
    initial_balance: data.initial_balance || "0",
    balance: data.initial_balance || "0",
  };
  await db.accounts.put(local);
  await queueOutbox({ method: "POST", path: "/accounts/", body: data, localId: id, entity: "accounts" });
  return local;
}

export async function updateAccount(id: number, data: Partial<Account>): Promise<Account> {
  const existing = await db.accounts.get(id);
  const merged = { ...(existing as Account), ...data, id };
  await db.accounts.put(merged);
  const online = await tryOnline(() => api.accounts.update(id, data));
  if (online.ok) {
    await db.accounts.put(online.value);
    return online.value;
  }
  if (id > 0) {
    await queueOutbox({ method: "PATCH", path: `/accounts/${id}/`, body: data, entity: "accounts" });
  }
  return merged;
}

export async function deleteAccount(id: number): Promise<void> {
  await db.accounts.delete(id);
  const online = await tryOnline(() => api.accounts.delete(id));
  if (!online.ok && id > 0) {
    await queueOutbox({ method: "DELETE", path: `/accounts/${id}/`, entity: "accounts" });
  }
}

// ---- Categories ----

export async function createCategory(data: Partial<Category>): Promise<Category> {
  const online = await tryOnline(() => api.categories.create(data));
  if (online.ok) {
    await db.categories.put(online.value);
    return online.value;
  }
  const id = await nextTempId();
  const local: Category = {
    id,
    name: data.name || "",
    icon: data.icon || "folder",
    color: data.color || "#6366f1",
    type: data.type || "expense",
    parent: data.parent ?? null,
    priority: data.priority ?? null,
  };
  await db.categories.put(local);
  await queueOutbox({ method: "POST", path: "/categories/", body: data, localId: id, entity: "categories" });
  return local;
}

export async function updateCategory(id: number, data: Partial<Category>): Promise<Category> {
  const existing = await db.categories.get(id);
  const merged = { ...(existing as Category), ...data, id };
  await db.categories.put(merged);
  const online = await tryOnline(() => api.categories.update(id, data));
  if (online.ok) {
    await db.categories.put(online.value);
    return online.value;
  }
  if (id > 0) {
    await queueOutbox({ method: "PATCH", path: `/categories/${id}/`, body: data, entity: "categories" });
  }
  return merged;
}

export async function deleteCategory(id: number): Promise<void> {
  await db.categories.delete(id);
  const online = await tryOnline(() => api.categories.delete(id));
  if (!online.ok && id > 0) {
    await queueOutbox({ method: "DELETE", path: `/categories/${id}/`, entity: "categories" });
  }
}

// ---- Tags ----

export async function createTag(data: Partial<Tag>): Promise<Tag> {
  const online = await tryOnline(() => api.tags.create(data));
  if (online.ok) {
    await db.tags.put(online.value);
    return online.value;
  }
  const id = await nextTempId();
  const local: Tag = { id, name: data.name || "", color: data.color || "#94a3b8" };
  await db.tags.put(local);
  await queueOutbox({ method: "POST", path: "/tags/", body: data, localId: id, entity: "tags" });
  return local;
}

export async function updateTag(id: number, data: Partial<Tag>): Promise<Tag> {
  const existing = await db.tags.get(id);
  const merged = { ...(existing as Tag), ...data, id };
  await db.tags.put(merged);
  const online = await tryOnline(() => api.tags.update(id, data));
  if (online.ok) {
    await db.tags.put(online.value);
    return online.value;
  }
  if (id > 0) {
    await queueOutbox({ method: "PATCH", path: `/tags/${id}/`, body: data, entity: "tags" });
  }
  return merged;
}

export async function deleteTag(id: number): Promise<void> {
  await db.tags.delete(id);
  const online = await tryOnline(() => api.tags.delete(id));
  if (!online.ok && id > 0) {
    await queueOutbox({ method: "DELETE", path: `/tags/${id}/`, entity: "tags" });
  }
}

// ---- Transactions ----

export async function createTransaction(data: Partial<Transaction>): Promise<Transaction> {
  const online = await tryOnline(() => api.transactions.create(data));
  if (online.ok) {
    const enriched = await enrichTransaction(online.value);
    await db.transactions.put(enriched);
    return enriched;
  }
  const id = await nextTempId();
  const local = await enrichTransaction({
    id,
    type: data.type || "expense",
    account: Number(data.account),
    to_account: data.to_account ?? null,
    transfer_kind: data.transfer_kind ?? null,
    amount: String(data.amount || "0"),
    category: data.category ?? null,
    date: data.date || new Date().toISOString(),
    notes: data.notes || "",
    recipient: data.recipient || "",
    status: data.status || "cleared",
    payment_type: data.payment_type || "",
    currency_code: data.currency_code || "RUB",
    tag_ids: data.tag_ids || [],
  });
  await db.transactions.put(local);
  await queueOutbox({ method: "POST", path: "/transactions/", body: data, localId: id, entity: "transactions" });
  return local;
}

export async function updateTransaction(id: number, data: Partial<Transaction>): Promise<Transaction> {
  const existing = await db.transactions.get(id);
  const merged = await enrichTransaction({ ...(existing as Transaction), ...data, id });
  await db.transactions.put(merged);
  const online = await tryOnline(() => api.transactions.update(id, data));
  if (online.ok) {
    const enriched = await enrichTransaction(online.value);
    await db.transactions.put(enriched);
    return enriched;
  }
  if (id > 0) {
    await queueOutbox({ method: "PATCH", path: `/transactions/${id}/`, body: data, entity: "transactions" });
  }
  return merged;
}

export async function deleteTransaction(id: number): Promise<void> {
  await db.transactions.delete(id);
  const online = await tryOnline(() => api.transactions.delete(id));
  if (!online.ok && id > 0) {
    await queueOutbox({ method: "DELETE", path: `/transactions/${id}/`, entity: "transactions" });
  }
}

// ---- Budgets ----

export async function createBudget(data: Partial<Budget>): Promise<Budget> {
  const online = await tryOnline(() => api.budgets.create(data));
  if (online.ok) {
    await db.budgets.put(online.value);
    return online.value;
  }
  const id = await nextTempId();
  const local: Budget = {
    id,
    name: data.name || "",
    amount: data.amount || "0",
    start_date: data.start_date || new Date().toISOString().slice(0, 10),
    period: data.period || "monthly",
    rollover_enabled: data.rollover_enabled || false,
    category_ids: data.category_ids || [],
    status: {
      period_start: "",
      period_end: "",
      limit: data.amount || "0",
      spent: "0",
      remaining: data.amount || "0",
      percent_used: 0,
    },
  };
  local.status = await computeBudgetStatus(local);
  await db.budgets.put(local);
  await queueOutbox({ method: "POST", path: "/budgets/", body: data, localId: id, entity: "budgets" });
  return local;
}

export async function updateBudget(id: number, data: Partial<Budget>): Promise<Budget> {
  const existing = await db.budgets.get(id);
  const merged = { ...(existing as Budget), ...data, id };
  merged.status = await computeBudgetStatus(merged);
  await db.budgets.put(merged);
  const online = await tryOnline(() => api.budgets.update(id, data));
  if (online.ok) {
    await db.budgets.put(online.value);
    return online.value;
  }
  if (id > 0) {
    await queueOutbox({ method: "PATCH", path: `/budgets/${id}/`, body: data, entity: "budgets" });
  }
  return merged;
}

export async function deleteBudget(id: number): Promise<void> {
  await db.budgets.delete(id);
  const online = await tryOnline(() => api.budgets.delete(id));
  if (!online.ok && id > 0) {
    await queueOutbox({ method: "DELETE", path: `/budgets/${id}/`, entity: "budgets" });
  }
}

// ---- Planned ----

export async function createPlanned(data: Partial<PlannedTransaction>): Promise<PlannedTransaction> {
  const online = await tryOnline(() => api.planned.create(data));
  if (online.ok) {
    await db.planned.put(online.value);
    return online.value;
  }
  const id = await nextTempId();
  const local: PlannedTransaction = {
    id,
    type: data.type || "expense",
    account: Number(data.account),
    to_account: data.to_account ?? null,
    transfer_kind: data.transfer_kind ?? null,
    amount: String(data.amount || "0"),
    category: data.category ?? null,
    next_occurrence_date: data.next_occurrence_date || new Date().toISOString().slice(0, 10),
    end_date: data.end_date ?? null,
    repeat_rule: data.repeat_rule || "once",
    autocommit: data.autocommit || false,
    notes: data.notes || "",
    recipient: data.recipient || "",
    payment_type: data.payment_type || "",
    currency_code: data.currency_code || "RUB",
    tag_ids: data.tag_ids || [],
    last_committed_at: null,
  };
  await db.planned.put(local);
  await queueOutbox({ method: "POST", path: "/planned-transactions/", body: data, localId: id, entity: "planned" });
  return local;
}

export async function updatePlanned(id: number, data: Partial<PlannedTransaction>): Promise<PlannedTransaction> {
  const existing = await db.planned.get(id);
  const merged = { ...(existing as PlannedTransaction), ...data, id };
  await db.planned.put(merged);
  const online = await tryOnline(() => api.planned.update(id, data));
  if (online.ok) {
    await db.planned.put(online.value);
    return online.value;
  }
  if (id > 0) {
    await queueOutbox({ method: "PATCH", path: `/planned-transactions/${id}/`, body: data, entity: "planned" });
  }
  return merged;
}

export async function deletePlanned(id: number): Promise<void> {
  await db.planned.delete(id);
  const online = await tryOnline(() => api.planned.delete(id));
  if (!online.ok && id > 0) {
    await queueOutbox({ method: "DELETE", path: `/planned-transactions/${id}/`, entity: "planned" });
  }
}

export async function commitPlanned(id: number): Promise<void> {
  const online = await tryOnline(() => api.planned.commit(id));
  if (online.ok) {
    const result = online.value;
    if (result.transaction) await db.transactions.put(await enrichTransaction(result.transaction));
    if (result.planned) await db.planned.put(result.planned);
    else await db.planned.delete(id);
    return;
  }
  // Offline commit: create local transaction and advance/delete planned
  const planned = await db.planned.get(id);
  if (!planned) return;
  await createTransaction({
    type: planned.type,
    account: planned.account,
    to_account: planned.to_account,
    transfer_kind: planned.transfer_kind as Transaction["transfer_kind"],
    amount: planned.amount,
    category: planned.category,
    date: `${planned.next_occurrence_date}T00:00:00`,
    notes: planned.notes,
    recipient: planned.recipient,
    payment_type: planned.payment_type,
    currency_code: planned.currency_code,
    tag_ids: planned.tag_ids,
    status: "cleared",
  });
  if (planned.repeat_rule === "once") {
    await db.planned.delete(id);
  } else {
    const next = new Date(planned.next_occurrence_date);
    if (planned.repeat_rule === "monthly") next.setMonth(next.getMonth() + 1);
    else next.setFullYear(next.getFullYear() + 1);
    await db.planned.put({
      ...planned,
      next_occurrence_date: next.toISOString().slice(0, 10),
      last_committed_at: new Date().toISOString(),
    });
  }
  if (id > 0) {
    await queueOutbox({ method: "POST", path: `/planned-transactions/${id}/commit/`, entity: "planned" });
  }
}
