import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import type { Account } from "../api/client";
import AccountFormModal from "../components/AccountFormModal";
import { deleteAccount } from "../data/repository";
import { listAccounts } from "../data/queries";
import { formatCurrency } from "../utils/format";

export default function AccountsPage() {
  const { t } = useTranslation();
  const accounts = useLiveQuery(() => listAccounts(), []) ?? [];
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const navigate = useNavigate();

  return (
    <div>
      <div className="page-header">
        <h2>{t("accounts.title")}</h2>
        <button type="button" onClick={() => { setEditing(null); setModalOpen(true); }}>{t("accounts.add")}</button>
      </div>
      <div className="grid">
        {accounts.map((a) => (
          <div
            key={a.id}
            className="card account-card clickable"
            style={{ borderLeft: `4px solid ${a.color}` }}
            role="button"
            tabIndex={0}
            onClick={() => navigate(`/accounts/${a.id}`)}
            onKeyDown={(e) => e.key === "Enter" && navigate(`/accounts/${a.id}`)}
          >
            <span style={{ fontSize: "1.5rem" }}>{a.icon}</span> <strong>{a.title}</strong>
            <p>{formatCurrency(a.balance, a.currency_code)}</p>
            <div className="card-actions" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
              <button type="button" className="secondary" onClick={() => { setEditing(a); setModalOpen(true); }}>{t("common.edit")}</button>
              <button type="button" className="danger" onClick={() => deleteAccount(a.id)}>{t("common.delete")}</button>
            </div>
          </div>
        ))}
      </div>
      <AccountFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => undefined}
        account={editing}
      />
    </div>
  );
}
