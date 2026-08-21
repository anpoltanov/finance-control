import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import type { Transaction } from "../api/client";
import AccountFormModal from "../components/AccountFormModal";
import GlyphIcon from "../components/GlyphIcon";
import TransactionList from "../components/TransactionList";
import { useAddTransaction } from "../context/AddTransactionContext";
import { getAccount, listTransactions } from "../data/queries";
import { formatCurrency } from "../utils/format";

export default function AccountDetailPage() {
  const { t } = useTranslation();
  const { accountId } = useParams<{ accountId: string }>();
  const id = Number(accountId);
  const { openAddTransaction, openEditTransaction } = useAddTransaction();
  const [editOpen, setEditOpen] = useState(false);

  const queryFilters = useMemo(() => ({ account: String(id) }), [id]);

  const account = useLiveQuery(() => getAccount(id), [id]);
  const transactions = useLiveQuery(() => listTransactions(queryFilters), [queryFilters]) ?? [];

  if (!account) {
    return <p className="muted-text">{t("accounts.loading")}</p>;
  }

  return (
    <div>
      <div className="account-detail-header card">
        <div className="account-detail-info">
          <Link to="/settings?tab=accounts" className="muted-text account-back-link">{t("accounts.back")}</Link>
          <div className="account-detail-title">
            <span className="account-detail-icon" style={{ borderColor: account.color }}>
              <GlyphIcon icon={account.icon} fallback="credit_card" />
            </span>
            <div>
              <h2>{account.title}</h2>
              <p className="account-detail-balance">
                {formatCurrency(account.balance, account.currency_code)}
              </p>
            </div>
          </div>
        </div>
        <div className="account-detail-actions">
          <button type="button" className="secondary" onClick={() => setEditOpen(true)}>
            {t("common.edit")}
          </button>
          <button type="button" onClick={() => openAddTransaction({ account: id })}>
            {t("transactions.add")}
          </button>
        </div>
      </div>

      <p className="muted-text tx-count">{t("transactions.count", { count: transactions.length })}</p>

      <TransactionList
        transactions={transactions}
        perspectiveAccountId={id}
        hideAccountColumn
        onEdit={(tx: Transaction) => openEditTransaction(tx)}
      />
      <AccountFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={() => undefined}
        account={account}
      />
    </div>
  );
}
