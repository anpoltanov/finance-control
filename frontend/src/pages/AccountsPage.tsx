import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import type { Account } from "../api/client";
import AccountFormModal from "../components/AccountFormModal";
import AccountPlate from "../components/AccountPlate";
import { listAccounts } from "../data/queries";

export default function AccountsPage({ embedded = false }: { embedded?: boolean }) {
  const { t } = useTranslation();
  const accounts = useLiveQuery(() => listAccounts(), []) ?? [];
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const navigate = useNavigate();

  return (
    <div>
      <div className="page-header">
        {!embedded && <h2>{t("accounts.title")}</h2>}
        <button
          type="button"
          style={embedded ? { marginLeft: "auto" } : undefined}
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
        >
          {t("accounts.add")}
        </button>
      </div>
      <div className="account-plate-grid settings-accounts">
        {accounts.map((account) => (
          <AccountPlate
            key={account.id}
            account={account}
            compact={false}
            onClick={() => navigate(`/accounts/${account.id}`)}
          />
        ))}
      </div>
      {accounts.length === 0 && <p className="muted-text">{t("accounts.empty")}</p>}
      <AccountFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => undefined}
        account={editing}
      />
    </div>
  );
}
