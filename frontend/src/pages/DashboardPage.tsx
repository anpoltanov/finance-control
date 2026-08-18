import { useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import { listAccounts } from "../data/queries";
import { formatCurrency } from "../utils/format";

export default function DashboardPage() {
  const { t } = useTranslation();
  const accounts = useLiveQuery(() => listAccounts(), []) ?? [];
  const navigate = useNavigate();

  const totalsByCurrency = accounts.reduce<Record<string, number>>((acc, a) => {
    acc[a.currency_code] = (acc[a.currency_code] || 0) + parseFloat(a.balance);
    return acc;
  }, {});

  return (
    <div>
      <h2>{t("nav.dashboard")}</h2>
      <div className="card">
        <p style={{ color: "var(--muted)", margin: 0 }}>{t("dashboard.totalBalance")}</p>
        <p style={{ fontSize: "2rem", margin: "0.25rem 0 0" }}>
          {Object.entries(totalsByCurrency).map(([code, total], i) => (
            <span key={code}>
              {i > 0 ? " · " : ""}
              {formatCurrency(total, code)}
            </span>
          ))}
        </p>
      </div>
      <div className="grid">
        {accounts.map((a) => (
          <div
            key={a.id}
            role="button"
            tabIndex={0}
            className="card account-card clickable"
            style={{ borderLeft: `4px solid ${a.color}` }}
            onClick={() => navigate(`/accounts/${a.id}`)}
            onKeyDown={(e) => e.key === "Enter" && navigate(`/accounts/${a.id}`)}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ fontSize: "1.5rem" }}>{a.icon}</span>
              <strong>{a.title}</strong>
            </div>
            <p style={{ fontSize: "1.25rem", margin: "0.5rem 0 0" }}>
              {formatCurrency(a.balance, a.currency_code)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
