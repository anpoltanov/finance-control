import { FormEvent, useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import type { Transaction } from "../api/client";
import { listAccounts, listCategories, listTags } from "../data/queries";
import { createTransaction, deleteTransaction, updateTransaction } from "../data/repository";
import { picksFromTransfer, resolveTransferPicks, type TransferPicks } from "../utils/transferPicks";
import ModalForm from "./ModalForm";
import TransactionFields, { type TxFieldValues } from "./TransactionFields";

export type TransactionFormValues = TxFieldValues & {
  date: string;
  status: Transaction["status"];
  payment_type: string;
  currency_code: string;
  to_account: number | null;
  transfer_kind: Transaction["transfer_kind"];
};

const defaultValues = (initial?: Partial<TransactionFormValues>): TransactionFormValues => ({
  type: "expense",
  amount: "",
  date: new Date().toISOString().slice(0, 16),
  status: "cleared",
  notes: "",
  recipient: "",
  payment_type: "",
  currency_code: "RUB",
  transfer_kind: null,
  to_account: null,
  category: null,
  tag_ids: [],
  ...initial,
});

function valuesFromTransaction(tx: Transaction): TransactionFormValues {
  return {
    type: tx.type,
    account: tx.account,
    amount: tx.amount,
    category: tx.category,
    recipient: tx.recipient || "",
    notes: tx.notes || "",
    tag_ids: tx.tag_ids || [],
    date: tx.date.slice(0, 16),
    status: tx.status,
    payment_type: tx.payment_type || "",
    currency_code: tx.currency_code,
    to_account: tx.to_account,
    transfer_kind: tx.transfer_kind,
  };
}

interface TransactionFormModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  transaction?: Transaction | null;
  initialValues?: Partial<TransactionFormValues>;
  lockAccount?: boolean;
}

export default function TransactionFormModal({
  open,
  onClose,
  onSaved,
  transaction,
  initialValues,
  lockAccount,
}: TransactionFormModalProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState<TransactionFormValues>(defaultValues(initialValues));
  const [picks, setPicks] = useState<TransferPicks>({ fromPick: "", toPick: "" });
  const [error, setError] = useState("");
  const accounts = useLiveQuery(() => listAccounts(), []) ?? [];
  const categories = useLiveQuery(() => listCategories(), []) ?? [];
  const tags = useLiveQuery(() => listTags(), []) ?? [];

  useEffect(() => {
    if (!open) return;
    const next = transaction ? valuesFromTransaction(transaction) : defaultValues(initialValues);
    setForm(next);
    setPicks(picksFromTransfer(next));
    setError("");
  }, [open, transaction, initialValues]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const { account: _pickedAccount, ...rest } = form;
    const payload: Partial<Transaction> = {
      ...rest,
      category: form.category ? Number(form.category) : null,
    };

    if (form.type === "transfer") {
      const resolved = resolveTransferPicks(picks.fromPick, picks.toPick);
      if (!resolved) {
        setError(t("transfer.bothOutside"));
        return;
      }
      payload.account = resolved.account;
      payload.to_account = resolved.to_account;
      payload.transfer_kind = resolved.transfer_kind;
      payload.category = null;
    } else {
      payload.account = Number(form.account);
      payload.to_account = null;
      payload.transfer_kind = null;
    }

    const account = accounts.find((a) => a.id === payload.account);
    if (account) payload.currency_code = account.currency_code;

    if (transaction?.id) {
      await updateTransaction(transaction.id, payload);
    } else {
      await createTransaction(payload);
    }
    onSaved();
    onClose();
  }

  async function remove() {
    if (!transaction?.id) return;
    await deleteTransaction(transaction.id);
    onSaved();
    onClose();
  }

  return (
    <ModalForm
      open={open}
      title={transaction ? t("transactions.edit") : t("transactions.new")}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={transaction ? t("common.update") : t("common.create")}
      onDelete={transaction?.id ? remove : undefined}
      deleteConfirmMessage={t("confirm.delete", { label: t("confirm.transaction") })}
      wide
    >
      <TransactionFields
        values={form}
        onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
        picks={picks}
        onPicksChange={(patch) => setPicks((prev) => ({ ...prev, ...patch }))}
        accounts={accounts}
        categories={categories}
        tags={tags}
        lockAccount={lockAccount}
        error={error}
        dateField={
          <>
            <label>{t("common.date")}</label>
            <input
              type="datetime-local"
              value={form.date}
              onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))}
              required
            />
          </>
        }
      />
    </ModalForm>
  );
}
