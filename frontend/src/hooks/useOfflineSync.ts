import { useEffect } from "react";
import { api } from "../api/client";
import { applySyncPayload, flushOutbox, getLastSyncedAt } from "../db/index";

const SYNC_INTERVAL_MS = 60_000;

export async function runSync(): Promise<void> {
  if (!navigator.onLine) return;
  await flushOutbox(async (item) => {
    const res = await fetch(`/api/v1${item.path}`, {
      method: item.method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: item.body ? JSON.stringify(item.body) : undefined,
    });
    if (!res.ok) throw new Error(`Outbox flush failed: ${res.status}`);
    if (res.status === 204) return;
    const data = await res.json().catch(() => null);
    if (data && typeof data === "object" && "id" in data) {
      return { id: Number(data.id) };
    }
    if (data && typeof data === "object" && "transaction" in data) {
      return { id: Number((data as { transaction: { id: number } }).transaction.id) };
    }
  });
  const since = await getLastSyncedAt();
  const payload = await api.sync(since);
  await applySyncPayload(payload);
}

export function useOfflineSync() {
  useEffect(() => {
    function sync() {
      runSync().catch(() => {
        /* retry on next trigger */
      });
    }

    sync();
    const interval = window.setInterval(sync, SYNC_INTERVAL_MS);
    window.addEventListener("online", sync);
    window.addEventListener("focus", sync);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("online", sync);
      window.removeEventListener("focus", sync);
    };
  }, []);
}

export { queueOutbox } from "../db/index";
