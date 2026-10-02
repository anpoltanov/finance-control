import { FormEvent, useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import type { PlannedTransaction, Transaction } from "../api/client";
import type { PlannedCommitOverrides } from "../data/commitRequest";
import { commitPlanned } from "../data/repository";
import { localInputToIso } from "../utils/instants";
import { listAccounts, listCategories, listTags } from "../data/queries";
import { picksFromTransfer, resolveTransferPicks, type TransferPicks } from "../utils/transferPicks";
import ModalForm from "./ModalForm";
import TransactionFields, { copyTagIds, type TxFieldValues } from "./TransactionFields";

interface ReviewValues extends TxFieldValues {
  date: string;
  status: Transaction["status"];
  payment_type: string;
  currency_code: string;
  to_account: number | null;
  transfer_kind: Transaction["transfer_kind"];
}

function valuesFromPlanned(planned: PlannedTransaction): ReviewValues {
  return {
    type: planned.type,
    account: planned.account,
    amount: planned.amount,
    category: planned.category,
    recipient: planned.recipient || "",
    notes: planned.notes || "",
    tag_ids: copyTagIds(planned.tag_ids),
    date: `${planned.next_occurrence_date.slice(0, 10)}T00:00`,
    status: "cleared",
    payment_type: planned.payment_type || "",
    currency_code: planned.currency_code || "RUB",
    to_account: planned.to_account,
    transfer_kind: planned.transfer_kind as Transaction["transfer_kind"],
  };
}

interface PlannedReviewModalProps {
  open: boolean;
  planned: PlannedTransaction | null;
  onClose: () => void;
}

export default function PlannedReviewModal({ open, planned, onClose }: PlannedReviewModalProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState<ReviewValues | null>(null);
  const [picks, setPicks] = useState<TransferPicks>({ fromPick: "", toPick: "" });
  const [error, setError] = useState("");
  const accounts = useLiveQuery(() => listAccounts(), []) ?? [];
  const categories = useLiveQuery(() => listCategories(), []) ?? [];
  const tags = useLiveQuery(() => listTags(), []) ?? [];
  const seedKey = open ? String(planned?.id ?? "") : "";

  useEffect(() => {
    if (!open || !planned) return;
    const next = valuesFromPlanned(planned);
    setForm(next);
    setPicks(picksFromTransfer(next));
    setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!planned || !form) return;
    setError("");
    const payload: PlannedCommitOverrides = {
      type: form.type,
      amount: form.amount,
      category: form.category ? Number(form.category) : null,
      date: localInputToIso(form.date),
      notes: form.notes,
      recipient: form.recipient,
      status: form.status,
      payment_type: form.payment_type,
      currency_code: form.currency_code,
      tag_ids: copyTagIds(form.tag_ids),
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

    const account = accounts.find((item) => item.id === payload.account);
    if (account) payload.currency_code = account.currency_code;
    await commitPlanned(planned.id, payload);
    onClose();
  }

  if (!form) return null;

  return (
    <ModalForm
      open={open}
      title={t("planned.reviewTitle")}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={t("planned.commitNow")}
      wide
    >
      <TransactionFields
        values={form}
        onChange={(patch) => setForm((prev) => (prev ? { ...prev, ...patch } : prev))}
        picks={picks}
        onPicksChange={(patch) => setPicks((prev) => ({ ...prev, ...patch }))}
        accounts={accounts}
        categories={categories}
        tags={tags}
        error={error}
        dateField={
          <>
            <label>{t("common.date")}</label>
            <input
              type="datetime-local"
              value={form.date}
              onChange={(e) => setForm((prev) => (prev ? { ...prev, date: e.target.value } : prev))}
              required
            />
          </>
        }
      />
    </ModalForm>
  );
}
