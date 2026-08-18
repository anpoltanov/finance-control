import { FormEvent, useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import type { PlannedTransaction } from "../api/client";
import { listAccounts, listCategories, listTags } from "../data/queries";
import { createPlanned, deletePlanned, updatePlanned } from "../data/repository";
import { picksFromTransfer, resolveTransferPicks, type TransferPicks } from "../utils/transferPicks";
import ModalForm from "./ModalForm";
import TransactionFields, { type TxFieldValues } from "./TransactionFields";

interface PlannedFormModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  planned?: PlannedTransaction | null;
}

type PlannedFormValues = TxFieldValues & {
  next_occurrence_date: string;
  repeat_rule: PlannedTransaction["repeat_rule"];
  autocommit: boolean;
  to_account: number | null;
  transfer_kind: string | null;
  payment_type: string;
  currency_code: string;
};

const empty = (accountId = 0): PlannedFormValues => ({
  type: "expense",
  account: accountId,
  amount: "",
  category: null,
  recipient: "",
  notes: "",
  tag_ids: [],
  next_occurrence_date: new Date().toISOString().slice(0, 10),
  repeat_rule: "once",
  autocommit: false,
  to_account: null,
  transfer_kind: null,
  payment_type: "",
  currency_code: "RUB",
});

function valuesFromPlanned(planned: PlannedTransaction): PlannedFormValues {
  return {
    type: planned.type,
    account: planned.account,
    amount: planned.amount,
    category: planned.category,
    recipient: planned.recipient || "",
    notes: planned.notes || "",
    tag_ids: planned.tag_ids || [],
    next_occurrence_date: planned.next_occurrence_date,
    repeat_rule: planned.repeat_rule,
    autocommit: planned.autocommit,
    to_account: planned.to_account,
    transfer_kind: planned.transfer_kind,
    payment_type: planned.payment_type || "",
    currency_code: planned.currency_code || "RUB",
  };
}

export default function PlannedFormModal({ open, onClose, onSaved, planned }: PlannedFormModalProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState<PlannedFormValues>(empty());
  const [picks, setPicks] = useState<TransferPicks>({ fromPick: "", toPick: "" });
  const [error, setError] = useState("");
  const accounts = useLiveQuery(() => listAccounts(), []) ?? [];
  const categories = useLiveQuery(() => listCategories(), []) ?? [];
  const tags = useLiveQuery(() => listTags(), []) ?? [];

  useEffect(() => {
    if (!open) return;
    const next = planned ? valuesFromPlanned(planned) : empty();
    setForm(next);
    setPicks(picksFromTransfer(next));
    setError("");
  }, [open, planned]);

  useEffect(() => {
    if (!open || planned || form.account) return;
    const first = accounts[0]?.id;
    if (first) setForm((prev) => ({ ...prev, account: first }));
  }, [open, planned, form.account, accounts]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const payload: Partial<PlannedTransaction> = {
      type: form.type,
      amount: form.amount,
      category: form.category ? Number(form.category) : null,
      next_occurrence_date: form.next_occurrence_date,
      repeat_rule: form.repeat_rule,
      autocommit: form.autocommit,
      notes: form.notes,
      recipient: form.recipient,
      payment_type: form.payment_type,
      tag_ids: form.tag_ids,
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
    payload.currency_code = account?.currency_code || form.currency_code;

    if (planned?.id) {
      await updatePlanned(planned.id, payload);
    } else {
      await createPlanned(payload);
    }
    onSaved();
    onClose();
  }

  async function remove() {
    if (!planned?.id) return;
    await deletePlanned(planned.id);
    onSaved();
    onClose();
  }

  return (
    <ModalForm
      open={open}
      title={planned ? t("planned.edit") : t("planned.new")}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={planned ? t("common.update") : t("common.create")}
      onDelete={planned?.id ? remove : undefined}
      deleteConfirmMessage={t("confirm.delete", { label: t("confirm.planned") })}
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
        error={error}
        dateField={
          <>
            <label>{t("planned.nextDate")}</label>
            <input
              type="date"
              value={form.next_occurrence_date}
              onChange={(e) => setForm((prev) => ({ ...prev, next_occurrence_date: e.target.value }))}
              required
            />
          </>
        }
        scheduleFields={
          <>
            <div className="form-group">
              <label>{t("planned.repeat")}</label>
              <select
                value={form.repeat_rule}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    repeat_rule: e.target.value as PlannedTransaction["repeat_rule"],
                  }))
                }
              >
                <option value="once">{t("repeat.once")}</option>
                <option value="monthly">{t("repeat.monthly")}</option>
                <option value="yearly">{t("repeat.yearly")}</option>
              </select>
            </div>
            <div className="form-group">
              <label className="filter-checkbox">
                <input
                  type="checkbox"
                  checked={form.autocommit}
                  onChange={(e) => setForm((prev) => ({ ...prev, autocommit: e.target.checked }))}
                />
                {t("planned.autocommit")}
              </label>
            </div>
          </>
        }
      />
    </ModalForm>
  );
}
