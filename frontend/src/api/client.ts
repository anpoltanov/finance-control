const BASE = "/api/v1";

let refreshInFlight: Promise<boolean> | null = null;

async function tryRefreshSession(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = fetch(`${BASE}/auth/refresh/`, { method: "POST", credentials: "include" })
    .then((res) => res.ok)
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

function isAuthPath(path: string): boolean {
  return path.startsWith("/auth/login/") || path.startsWith("/auth/refresh/") || path.startsWith("/auth/logout/");
}

async function request<T>(path: string, options: RequestInit = {}, retried = false): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
    ...((options.headers as Record<string, string>) || {}),
  };
  if (options.body instanceof FormData) {
    delete headers["Content-Type"];
  }
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    ...options,
    headers,
  });
  if (res.status === 401 && !retried && !isAuthPath(path)) {
    const refreshed = await tryRefreshSession();
    if (refreshed) return request<T>(path, options, true);
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }
  if (res.status === 401) {
    if (!isAuthPath(path)) window.location.href = "/login";
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  login: (username: string, password: string) =>
    request<{ username: string }>("/auth/login/", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request("/auth/logout/", { method: "POST" }),
  me: () => request<{ username: string; id: number }>("/auth/me/"),
  accounts: {
    list: () => request<Account[]>("/accounts/"),
    get: (id: number) => request<Account>(`/accounts/${id}/`),
    create: (data: Partial<Account>) => request<Account>("/accounts/", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: Partial<Account>) =>
      request<Account>(`/accounts/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: number) => request(`/accounts/${id}/`, { method: "DELETE" }),
  },
  categories: {
    list: () => request<Category[]>("/categories/"),
    create: (data: Partial<Category>) =>
      request<Category>("/categories/", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: Partial<Category>) =>
      request<Category>(`/categories/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: number) => request(`/categories/${id}/`, { method: "DELETE" }),
  },
  tags: {
    list: () => request<Tag[]>("/tags/"),
    create: (data: Partial<Tag>) => request<Tag>("/tags/", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: Partial<Tag>) =>
      request<Tag>(`/tags/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: number) => request(`/tags/${id}/`, { method: "DELETE" }),
  },
  transactions: {
    list: (params?: Record<string, string>) => {
      const q = params ? "?" + new URLSearchParams(params).toString() : "";
      return request<Paginated<Transaction>>(`/transactions/${q}`);
    },
    create: (data: Partial<Transaction>) =>
      request<Transaction>("/transactions/", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: Partial<Transaction>) =>
      request<Transaction>(`/transactions/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: number) => request(`/transactions/${id}/`, { method: "DELETE" }),
  },
  budgets: {
    list: () => request<Budget[]>("/budgets/"),
    create: (data: Partial<Budget>) => request<Budget>("/budgets/", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: Partial<Budget>) =>
      request<Budget>(`/budgets/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: number) => request(`/budgets/${id}/`, { method: "DELETE" }),
  },
  planned: {
    list: () => request<PlannedTransaction[]>("/planned-transactions/"),
    create: (data: Partial<PlannedTransaction>) =>
      request<PlannedTransaction>("/planned-transactions/", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: Partial<PlannedTransaction>) =>
      request<PlannedTransaction>(`/planned-transactions/${id}/`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    commit: (id: number) =>
      request<{ transaction: Transaction; planned: PlannedTransaction | null }>(
        `/planned-transactions/${id}/commit/`,
        { method: "POST" }
      ),
    delete: (id: number) => request(`/planned-transactions/${id}/`, { method: "DELETE" }),
  },
  sync: (since?: string) => request<SyncPayload>(`/sync/${since ? `?since=${encodeURIComponent(since)}` : ""}`),
  reports: {
    summary: (from?: string, to?: string) => {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const q = params.toString() ? `?${params}` : "";
      return request<ReportSummary>(`/reports/summary/${q}`);
    },
  },
};

export interface Paginated<T> {
  count: number;
  results: T[];
}

export interface Account {
  id: number;
  title: string;
  icon: string;
  color: string;
  sort_order: number;
  archived: boolean;
  exclude_from_statistics: boolean;
  currency_code: string;
  initial_balance: string;
  balance: string;
}

export interface Category {
  id: number;
  name: string;
  icon: string;
  color?: string;
  type: "expense" | "income";
  parent: number | null;
  priority?: "must" | "need" | "want" | null;
}

export interface Tag {
  id: number;
  name: string;
  color: string;
}

export interface Transaction {
  id: number;
  type: "expense" | "income" | "transfer";
  account: number;
  account_title?: string;
  account_color?: string;
  to_account: number | null;
  to_account_title?: string | null;
  transfer_kind: "account_to_account" | "to_nowhere" | "from_nowhere" | null;
  amount: string;
  category: number | null;
  category_name?: string | null;
  category_icon?: string | null;
  category_color?: string | null;
  date: string;
  notes: string;
  recipient: string;
  status: "pending" | "cleared" | "reconciled";
  payment_type: string;
  currency_code: string;
  tag_ids?: number[];
  tag_names?: string[];
}

export interface BudgetStatus {
  period_start: string;
  period_end: string;
  limit: string;
  spent: string;
  remaining: string;
  percent_used: number;
}

export interface Budget {
  id: number;
  name: string;
  amount: string;
  start_date: string;
  period: "monthly" | "yearly";
  rollover_enabled: boolean;
  category_ids: number[];
  status: BudgetStatus;
}

export interface PlannedTransaction {
  id: number;
  type: "expense" | "income" | "transfer";
  account: number;
  to_account: number | null;
  transfer_kind: string | null;
  amount: string;
  category: number | null;
  next_occurrence_date: string;
  end_date: string | null;
  repeat_rule: "once" | "monthly" | "yearly";
  autocommit: boolean;
  notes: string;
  recipient: string;
  payment_type: string;
  currency_code: string;
  tag_ids?: number[];
  last_committed_at: string | null;
}

export interface SyncPayload {
  accounts: Account[];
  categories: Category[];
  tags: Tag[];
  transactions: Transaction[];
  budgets: Budget[];
  planned_transactions: PlannedTransaction[];
  deleted_ids?: {
    accounts: number[];
    categories: number[];
    tags: number[];
    transactions: number[];
    budgets: number[];
    planned_transactions: number[];
  };
  synced_at: string;
}

export interface ReportSummary {
  income_total: string;
  expense_total: string;
  by_category: { category_id: number; category_name: string; category_color?: string; total: string }[];
  monthly: { month: string | null; type: string; total: string }[];
}

export interface ImportPreview {
  paired_transfers: {
    from_account: string;
    to_account: string;
    amount: string;
    currency: string;
    date: string;
    confidence: string;
    outflow_index: number;
    inflow_index: number;
  }[];
  to_nowhere: { index: number; account: string; amount: string; date: string }[];
  from_nowhere: { index: number; account: string; amount: string; date: string }[];
  ambiguous: { outflow_index: number; candidates: number[]; confidence: string }[];
  regular_count: number;
  new_accounts: string[];
  new_categories: string[];
  new_tags: string[];
}

export async function importWalletAppCsv(
  file: File,
  dryRun: boolean,
  resolutions?: Record<string, string>
): Promise<ImportPreview | { created: number; skipped: number; ambiguous_count: number }> {
  const form = new FormData();
  form.append("file", file);
  if (resolutions) {
    form.append("resolutions", JSON.stringify(resolutions));
  }
  const url = `${BASE}/import/walletapp/${dryRun ? "?dry_run=true" : ""}`;
  const res = await fetch(url, { method: "POST", credentials: "include", body: form });
  if (res.status === 401) {
    const refreshed = await tryRefreshSession();
    if (refreshed) return importWalletAppCsv(file, dryRun, resolutions);
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Import failed");
  }
  return res.json();
}
