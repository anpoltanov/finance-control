import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import type { Budget } from "../api/client";
import BudgetFormModal from "../components/BudgetFormModal";
import { deleteBudget } from "../data/repository";
import { listBudgetsWithStatus } from "../data/reports";
import { formatCurrency } from "../utils/format";

export default function BudgetsPage() {
  const { t } = useTranslation();
  const budgets = useLiveQuery(() => listBudgetsWithStatus(), []) ?? [];
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Budget | null>(null);

  return (
    <div>
      <div className="page-header">
        <h2>{t("budgets.title")}</h2>
        <button type="button" onClick={() => { setEditing(null); setModalOpen(true); }}>{t("budgets.add")}</button>
      </div>
      <div className="grid">
        {budgets.map((b) => (
          <div key={b.id} className="card">
            <strong>{b.name}</strong>
            <p style={{ color: "var(--muted)", margin: "0.25rem 0" }}>
              {b.status.period_start} — {b.status.period_end}
              {b.rollover_enabled && ` · ${t("budgets.rolloverBadge")}`}
            </p>
            <p>
              {formatCurrency(b.status.spent)} / {formatCurrency(b.status.limit)}
            </p>
            <div className={`progress ${b.status.percent_used > 100 ? "over" : ""}`}>
              <div style={{ width: `${Math.min(b.status.percent_used, 100)}%` }} />
            </div>
            <p style={{ color: "var(--muted)" }}>
              {t("budgets.remaining", { amount: formatCurrency(b.status.remaining) })}
            </p>
            <div className="card-actions">
              <button type="button" className="secondary" onClick={() => { setEditing(b); setModalOpen(true); }}>{t("common.edit")}</button>
              <button type="button" className="danger" onClick={() => deleteBudget(b.id)}>{t("common.delete")}</button>
            </div>
          </div>
        ))}
      </div>
      <BudgetFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => undefined}
        budget={editing}
      />
    </div>
  );
}
