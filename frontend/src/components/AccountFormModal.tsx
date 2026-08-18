import { FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Account } from "../api/client";
import { createAccount, updateAccount } from "../data/repository";
import ModalForm from "./ModalForm";

interface AccountFormModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  account?: Account | null;
}

const empty = () => ({
  title: "",
  icon: "💳",
  color: "#6366f1",
  currency_code: "RUB",
  initial_balance: "0",
});

export default function AccountFormModal({ open, onClose, onSaved, account }: AccountFormModalProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState(empty());

  useEffect(() => {
    if (!open) return;
    if (account) {
      setForm({
        title: account.title,
        icon: account.icon,
        color: account.color,
        currency_code: account.currency_code,
        initial_balance: account.initial_balance,
      });
    } else {
      setForm(empty());
    }
  }, [open, account]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (account?.id) {
      await updateAccount(account.id, form);
    } else {
      await createAccount(form);
    }
    onSaved();
    onClose();
  }

  return (
    <ModalForm
      open={open}
      title={account ? t("accounts.edit") : t("accounts.new")}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={account ? t("common.update") : t("common.create")}
    >
      <div className="form-grid">
        <div className="form-group">
          <label>{t("accounts.titleField")}</label>
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
        </div>
        <div className="form-group">
          <label>{t("common.icon")}</label>
          <input value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} />
        </div>
        <div className="form-group">
          <label>{t("common.color")}</label>
          <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
        </div>
        <div className="form-group">
          <label>{t("accounts.currency")}</label>
          <input value={form.currency_code} onChange={(e) => setForm({ ...form, currency_code: e.target.value })} />
        </div>
        <div className="form-group">
          <label>{t("accounts.initialBalance")}</label>
          <input value={form.initial_balance} onChange={(e) => setForm({ ...form, initial_balance: e.target.value })} />
        </div>
      </div>
    </ModalForm>
  );
}
