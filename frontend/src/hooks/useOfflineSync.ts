import { useEffect, useState } from "react";
import { api, apiFetch, type PlannedTransaction, type Transaction } from "../api/client";
import { applySyncPayload, clearLocalCache, flushOutbox, getLastSyncedAt, hasLocalData } from "../db/index";

const SYNC_INTERVAL_MS = 60_000;
const PERMANENT_FAILURE = new Set([400, 404, 409, 422]);

export type InitialSyncStatus = "checking" | "syncing" | "error" | "ready";

export async function runSync(): Promise<void> {
  if (!navigator.onLine) return;
  try {
    await flushOutbox(async (item) => {
      const res = await apiFetch(item.path, {
        method: item.method,
        body: item.body ? JSON.stringify(item.body) : undefined,
      });
      if (PERMANENT_FAILURE.has(res.status)) {
        return { drop: true };
      }
      if (!res.ok) throw new Error(`Outbox flush failed: ${res.status}`);
      if (res.status === 204) return;
      const data = await res.json().catch(() => null);
      if (data && typeof data === "object" && "transaction" in data) {
        const payload = data as { transaction: Transaction; planned?: PlannedTransaction | null };
        return { transaction: payload.transaction, planned: payload.planned ?? null };
      }
      if (data && typeof data === "object" && "id" in data) {
        return { id: Number(data.id) };
      }
    });
  } catch {
    /* Keep pull-sync going even if some outbox items still need a later retry. */
  }
  const since = await getLastSyncedAt();
  const payload = await api.sync(since);
  await applySyncPayload(payload);
}

export async function resetLocalCache(): Promise<void> {
  await clearLocalCache();
  const payload = await api.sync();
  await applySyncPayload(payload);
}

export function useOfflineSync(): { status: InitialSyncStatus; retry: () => void } {
  const [status, setStatus] = useState<InitialSyncStatus>("checking");
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let running = false;
    let needsInitial = false;

    async function openIfUsable(): Promise<boolean> {
      if (cancelled) return true;
      const since = await getLastSyncedAt();
      if (!since && !(await hasLocalData())) return false;
      needsInitial = false;
      if (!cancelled) setStatus("ready");
      return true;
    }

    async function pullInitial() {
      if (running) return;
      running = true;
      if (!cancelled) setStatus("syncing");
      try {
        if (!navigator.onLine) {
          if (!(await openIfUsable()) && !cancelled) setStatus("error");
          return;
        }
        await runSync();
        if (cancelled) return;
        if (!(await openIfUsable()) && !cancelled) setStatus("error");
      } catch {
        if (!(await openIfUsable()) && !cancelled) setStatus("error");
      } finally {
        running = false;
      }
    }

    async function start() {
      const since = await getLastSyncedAt();
      if (cancelled) return;
      // Import drops last_synced_at without clearing IndexedDB. Only an empty
      // database should block the app; existing records stay usable offline.
      if (!since && !(await hasLocalData())) {
        if (cancelled) return;
        needsInitial = true;
        await pullInitial();
        return;
      }
      needsInitial = false;
      setStatus("ready");
      runSync().catch(() => {
        /* retry on next trigger */
      });
    }

    function onBackground() {
      if (needsInitial) {
        void pullInitial();
        return;
      }
      runSync().catch(() => {
        /* retry on next trigger */
      });
    }

    void start();
    const interval = window.setInterval(onBackground, SYNC_INTERVAL_MS);
    window.addEventListener("online", onBackground);
    window.addEventListener("focus", onBackground);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("online", onBackground);
      window.removeEventListener("focus", onBackground);
    };
  }, [retryToken]);

  return {
    status,
    retry: () => setRetryToken((token) => token + 1),
  };
}

export { queueOutbox } from "../db/index";
