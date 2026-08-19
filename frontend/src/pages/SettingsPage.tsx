import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { resetLocalCache, runSync } from "../hooks/useOfflineSync";
import AccountsPage from "./AccountsPage";
import CategoriesPage from "./CategoriesPage";
import ImportPage from "./ImportPage";

type SettingsTab = "accounts" | "categories" | "import" | "data";

function parseTab(value: string | null): SettingsTab {
  if (value === "import" || value === "accounts" || value === "data") return value;
  return "categories";
}

export default function SettingsPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tabParam = params.get("tab");
  const tab = parseTab(tabParam);
  const [localTab, setLocalTab] = useState<SettingsTab>(tab);
  const [busy, setBusy] = useState<"sync" | "reset" | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const active = useMemo(() => (tabParam ? tab : localTab), [tabParam, tab, localTab]);

  function selectTab(next: SettingsTab) {
    setLocalTab(next);
    if (next === "categories") setParams({});
    else setParams({ tab: next });
  }

  async function syncNow() {
    setBusy("sync");
    setError("");
    setStatus("");
    try {
      await runSync();
      setStatus(t("settings.data.synced", { time: new Date().toLocaleString() }));
    } catch {
      setError(t("settings.data.syncFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function resetNow() {
    if (!window.confirm(t("settings.data.resetConfirm"))) return;
    setBusy("reset");
    setError("");
    setStatus("");
    try {
      await resetLocalCache();
      setStatus(t("settings.data.resetDone"));
    } catch {
      setError(t("settings.data.resetFailed"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>{t("settings.title")}</h2>
      </div>
      <div className="tabs settings-tabs">
        <button type="button" className={active === "accounts" ? "active" : ""} onClick={() => selectTab("accounts")}>
          {t("settings.tabs.accounts")}
        </button>
        <button type="button" className={active === "categories" ? "active" : ""} onClick={() => selectTab("categories")}>
          {t("settings.tabs.categories")}
        </button>
        <button type="button" className={active === "import" ? "active" : ""} onClick={() => selectTab("import")}>
          {t("settings.tabs.import")}
        </button>
        <button type="button" className={active === "data" ? "active" : ""} onClick={() => selectTab("data")}>
          {t("settings.tabs.data")}
        </button>
      </div>
      {active === "accounts" ? (
        <AccountsPage embedded />
      ) : active === "categories" ? (
        <CategoriesPage embedded />
      ) : active === "import" ? (
        <ImportPage embedded />
      ) : (
        <div className="card settings-data">
          <h3>{t("settings.data.title")}</h3>
          <p className="muted-text">{t("settings.data.hint")}</p>
          <div className="settings-data-actions">
            <button type="button" onClick={syncNow} disabled={busy !== null}>
              {busy === "sync" ? t("settings.data.syncing") : t("settings.data.syncNow")}
            </button>
            <button type="button" className="secondary" onClick={resetNow} disabled={busy !== null}>
              {busy === "reset" ? t("settings.data.resetting") : t("settings.data.reset")}
            </button>
          </div>
          {status && <p className="muted-text">{status}</p>}
          {error && <p className="form-error">{error}</p>}
        </div>
      )}
    </div>
  );
}
