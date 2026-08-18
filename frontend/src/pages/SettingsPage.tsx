import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import CategoriesPage from "./CategoriesPage";
import ImportPage from "./ImportPage";

type SettingsTab = "categories" | "import";

export default function SettingsPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tabParam = params.get("tab");
  const tab: SettingsTab = tabParam === "import" ? "import" : "categories";
  const [localTab, setLocalTab] = useState<SettingsTab>(tab);

  const active = useMemo(() => (tabParam ? tab : localTab), [tabParam, tab, localTab]);

  function selectTab(next: SettingsTab) {
    setLocalTab(next);
    setParams(next === "categories" ? {} : { tab: next });
  }

  return (
    <div>
      <div className="page-header">
        <h2>{t("settings.title")}</h2>
      </div>
      <div className="tabs settings-tabs">
        <button type="button" className={active === "categories" ? "active" : ""} onClick={() => selectTab("categories")}>
          {t("settings.tabs.categories")}
        </button>
        <button type="button" className={active === "import" ? "active" : ""} onClick={() => selectTab("import")}>
          {t("settings.tabs.import")}
        </button>
      </div>
      {active === "categories" ? <CategoriesPage embedded /> : <ImportPage embedded />}
    </div>
  );
}
