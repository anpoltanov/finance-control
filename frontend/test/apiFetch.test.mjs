import assert from "node:assert/strict";
import { afterEach, before, describe, it } from "node:test";

const location = { href: "" };
globalThis.window = { location };

const originalFetch = globalThis.fetch;
let apiFetch;

function jsonResponse(status, body = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

before(async () => {
  ({ apiFetch } = await import("../src/api/client.ts"));
});

afterEach(() => {
  location.href = "";
  globalThis.fetch = originalFetch;
  if ("navigator" in globalThis) delete globalThis.navigator;
});

describe("apiFetch session refresh", () => {
  it("refreshes once on 401 and retries the original request without redirecting", async () => {
    const calls = [];
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      calls.push({ url, method: init?.method || "GET" });
      if (url.endsWith("/auth/refresh/")) return jsonResponse(200, { detail: "Token refreshed." });
      if (calls.filter((c) => c.url.includes("/transactions/")).length === 1) {
        return jsonResponse(401, { detail: "Unauthorized" });
      }
      return jsonResponse(200, { id: 42 });
    };

    const res = await apiFetch("/transactions/", {
      method: "POST",
      body: JSON.stringify({ amount: "10" }),
    });

    assert.equal(res.status, 200);
    assert.equal(location.href, "");
    assert.deepEqual(
      calls.map((c) => `${c.method} ${c.url}`),
      ["POST /api/v1/transactions/", "POST /api/v1/auth/refresh/", "POST /api/v1/transactions/"]
    );
    const body = await res.json();
    assert.equal(body.id, 42);
  });

  it("redirects to login when refresh fails", async () => {
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/auth/refresh/")) return jsonResponse(401, { detail: "Refresh token missing." });
      return jsonResponse(401, { detail: "Unauthorized" });
    };

    await assert.rejects(() => apiFetch("/accounts/"), { message: "Unauthorized" });
    assert.equal(location.href, "/login");
  });

  it("does not retry refresh in a loop if the retried request is still 401", async () => {
    let refreshCalls = 0;
    let resourceCalls = 0;
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/auth/refresh/")) {
        refreshCalls += 1;
        return jsonResponse(200, { detail: "Token refreshed." });
      }
      resourceCalls += 1;
      return jsonResponse(401, { detail: "Unauthorized" });
    };

    await assert.rejects(() => apiFetch("/sync/"), { message: "Unauthorized" });
    assert.equal(refreshCalls, 1);
    assert.equal(resourceCalls, 2);
    assert.equal(location.href, "/login");
  });

  it("coalesces concurrent 401s onto a single refresh", async () => {
    let refreshCalls = 0;
    const resourceHits = new Map();
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/auth/refresh/")) {
        refreshCalls += 1;
        await new Promise((r) => setTimeout(r, 20));
        return jsonResponse(200, { detail: "Token refreshed." });
      }
      const hits = (resourceHits.get(url) || 0) + 1;
      resourceHits.set(url, hits);
      if (hits === 1) return jsonResponse(401, { detail: "Unauthorized" });
      return jsonResponse(200, { ok: true });
    };

    const [a, b] = await Promise.all([apiFetch("/accounts/"), apiFetch("/categories/")]);
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.equal(refreshCalls, 1);
    assert.equal(location.href, "");
  });

  it("coordinates refresh through navigator.locks when available", async () => {
    let lockCalls = 0;
    let resourceHits = 0;
    globalThis.navigator = {
      locks: {
        request: async (_name, callback) => {
          lockCalls += 1;
          return callback();
        },
      },
    };
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/auth/refresh/")) return jsonResponse(200, { detail: "Token refreshed." });
      resourceHits += 1;
      if (resourceHits === 1) return jsonResponse(401, { detail: "Unauthorized" });
      return jsonResponse(200, { ok: true });
    };

    const res = await apiFetch("/accounts/");
    assert.equal(res.status, 200);
    assert.equal(lockCalls, 1);
    assert.equal(location.href, "");
  });
});
