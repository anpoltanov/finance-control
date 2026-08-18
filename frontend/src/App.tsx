import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { useOfflineSync } from "./hooks/useOfflineSync";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import TransactionsPage from "./pages/TransactionsPage";
import AccountsPage from "./pages/AccountsPage";
import AccountDetailPage from "./pages/AccountDetailPage";
import SettingsPage from "./pages/SettingsPage";
import BudgetsPage from "./pages/BudgetsPage";
import PlannedPage from "./pages/PlannedPage";
import ReportsPage from "./pages/ReportsPage";
import { api } from "./api/client";

function Protected({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const [ok, setOk] = useState<boolean | null>(null);
  useOfflineSync();
  useEffect(() => {
    api.me().then(() => setOk(true)).catch(() => setOk(false));
  }, []);
  if (ok === null) return <p style={{ padding: "2rem" }}>{t("common.loading")}</p>;
  if (!ok) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <Protected>
              <Layout />
            </Protected>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="transactions" element={<TransactionsPage />} />
          <Route path="accounts" element={<AccountsPage />} />
          <Route path="accounts/:accountId" element={<AccountDetailPage />} />
          <Route path="budgets" element={<BudgetsPage />} />
          <Route path="planned" element={<PlannedPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="categories" element={<Navigate to="/settings" replace />} />
          <Route path="import" element={<Navigate to="/settings?tab=import" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
