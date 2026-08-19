import { FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Account } from "../api/client";
import { createAccount, deleteAccount, updateAccount } from "../data/repository";
import ColorField from "./ColorField";
import IconPicker from "./IconPicker";
import ModalForm from "./ModalForm";

interface AccountFormModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  account?: Account | null;
}

const empty = () => ({
  title: "",
  icon: "credit_card",
  color: "#6366f1",
  currency_code: "RUB",
  initial_balance: "0",
  archived: false,
  exclude_from_statistics: false,
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
        archived: account.archived,
        exclude_from_statistics: Boolean(account.exclude_from_statistics),
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
      onDelete={
        account?.id
          ? async () => {
              await deleteAccount(account.id);
              onSaved();
              onClose();
            }
          : undefined
      }
      deleteConfirmMessage={
        account ? t("confirm.delete", { label: t("confirm.account", { name: account.title }) }) : undefined
      }
    >
      <div className="form-grid">
        <div className="form-group">
          <label>{t("accounts.titleField")}</label>
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
        </div>
        <div className="form-group">
          <label>{t("accounts.currency")}</label>
          <input value={form.currency_code} onChange={(e) => setForm({ ...form, currency_code: e.target.value })} />
        </div>
        <div className="form-group">
          <label>{t("accounts.initialBalance")}</label>
          <input value={form.initial_balance} onChange={(e) => setForm({ ...form, initial_balance: e.target.value })} />
        </div>
        <div className="form-group">
          <label>{t("common.color")}</label>
          <ColorField value={form.color} onChange={(color) => setForm({ ...form, color })} />
        </div>
        <div className="form-group form-group-full">
          <label>{t("common.icon")}</label>
          <IconPicker value={form.icon} onChange={(icon) => setForm({ ...form, icon })} />
        </div>
        <div className="form-group form-group-full form-checks">
          <label className="filter-checkbox">
            <input
              type="checkbox"
              checked={form.archived}
              onChange={(e) => setForm({ ...form, archived: e.target.checked })}
            />
            {t("accounts.archived")}
          </label>
          <p className="field-hint">{t("accounts.archivedHint")}</p>
          <label className="filter-checkbox">
            <input
              type="checkbox"
              checked={form.exclude_from_statistics}
              onChange={(e) => setForm({ ...form, exclude_from_statistics: e.target.checked })}
            />
            {t("accounts.excludeFromStatistics")}
          </label>
          <p className="field-hint">{t("accounts.excludeHint")}</p>
        </div>
      </div>
    </ModalForm>
  );
}
