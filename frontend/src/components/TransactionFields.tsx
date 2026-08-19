import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Account, Category, Tag } from "../api/client";
import { accountsForSelect } from "../data/queries";
import { filterCategoriesForTransaction } from "../utils/categoryTree";
import { OUTSIDE, type TransferPicks } from "../utils/transferPicks";
import CategoryTreePicker from "./CategoryTreePicker";

export type TxFieldType = "expense" | "income" | "transfer";

export interface TxFieldValues {
  type: TxFieldType;
  account?: number | null;
  amount: string;
  category: number | null;
  recipient: string;
  notes: string;
  tag_ids: number[];
}

interface TransactionFieldsProps {
  values: TxFieldValues;
  onChange: (patch: Partial<TxFieldValues>) => void;
  picks: TransferPicks;
  onPicksChange: (patch: Partial<TransferPicks>) => void;
  accounts: Account[];
  categories: Category[];
  tags: Tag[];
  lockAccount?: boolean;
  /** Date/datetime input, which differs between one-off and planned transactions. */
  dateField: ReactNode;
  scheduleFields?: ReactNode;
  error?: string;
}

export default function TransactionFields({
  values,
  onChange,
  picks,
  onPicksChange,
  accounts,
  categories,
  tags,
  lockAccount,
  dateField,
  scheduleFields,
  error,
}: TransactionFieldsProps) {
  const { t } = useTranslation();
  const { fromPick, toPick } = picks;

  function changeType(type: TxFieldType) {
    onChange({ type });
    if (type === "transfer") {
      onPicksChange({
        fromPick: values.account ? String(values.account) : fromPick,
        toPick: toPick || OUTSIDE,
      });
    }
  }

  function toggleTag(tagId: number) {
    const current = values.tag_ids || [];
    onChange({
      tag_ids: current.includes(tagId) ? current.filter((id) => id !== tagId) : [...current, tagId],
    });
  }

  function accountOptions(excludeId?: string, keepId?: number | null) {
    return accountsForSelect(accounts, [keepId, excludeId ? Number(excludeId) : undefined])
      .filter((a) => String(a.id) !== excludeId)
      .map((a) => (
        <option key={a.id} value={a.id}>{a.title}</option>
      ));
  }

  return (
    <div className="form-grid">
      <div className="form-group">
        <label>{t("common.type")}</label>
        <select value={values.type} onChange={(e) => changeType(e.target.value as TxFieldType)}>
          <option value="expense">{t("txType.expense")}</option>
          <option value="income">{t("txType.income")}</option>
          <option value="transfer">{t("txType.transfer")}</option>
        </select>
      </div>
      <div className="form-group">
        <label>{t("common.amount")}</label>
        <input value={values.amount} onChange={(e) => onChange({ amount: e.target.value })} required />
      </div>
      {values.type === "transfer" ? (
        <>
          <div className="form-group">
            <label>{t("transfer.fromAccount")}</label>
            <select value={fromPick} onChange={(e) => onPicksChange({ fromPick: e.target.value })} required>
              <option value="">{t("common.select")}</option>
              <option value={OUTSIDE}>{t("transfer.outsideWallet")}</option>
              {accountOptions(toPick === OUTSIDE ? undefined : toPick, fromPick && fromPick !== OUTSIDE ? Number(fromPick) : undefined)}
            </select>
          </div>
          <div className="form-group">
            <label>{t("transfer.toAccount")}</label>
            <select value={toPick} onChange={(e) => onPicksChange({ toPick: e.target.value })} required>
              <option value="">{t("common.select")}</option>
              <option value={OUTSIDE}>{t("transfer.outsideWallet")}</option>
              {accountOptions(fromPick === OUTSIDE ? undefined : fromPick, toPick && toPick !== OUTSIDE ? Number(toPick) : undefined)}
            </select>
          </div>
        </>
      ) : (
        <div className="form-group">
          <label>{t("common.account")}</label>
          <select
            value={values.account || ""}
            onChange={(e) => onChange({ account: Number(e.target.value) })}
            required
            disabled={lockAccount}
          >
            <option value="">{t("common.select")}</option>
            {accountsForSelect(accounts, [values.account]).map((a) => (
              <option key={a.id} value={a.id}>{a.title}</option>
            ))}
          </select>
        </div>
      )}
      {values.type !== "transfer" && (
        <div className="form-group form-group-full">
          <label>{t("common.category")}</label>
          <CategoryTreePicker
            categories={filterCategoriesForTransaction(categories, values.type)}
            mode="single"
            selectedIds={values.category ? [values.category] : []}
            onChange={(ids) => onChange({ category: ids[0] ?? null })}
            allowEmpty
            emptyLabel={t("common.none")}
          />
        </div>
      )}
      <div className="form-group">{dateField}</div>
      {scheduleFields}
      <div className="form-group">
        <label>{t("transactions.recipient")}</label>
        <input value={values.recipient} onChange={(e) => onChange({ recipient: e.target.value })} />
      </div>
      <div className="form-group form-group-full">
        <label>{t("common.notes")}</label>
        <input value={values.notes} onChange={(e) => onChange({ notes: e.target.value })} />
      </div>
      {error && <p className="form-group form-group-full form-error">{error}</p>}
      <div className="form-group form-group-full">
        <label>{t("common.tags")}</label>
        <div className="tag-picker">
          {tags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              className={`tag-chip${(values.tag_ids || []).includes(tag.id) ? " active" : ""}`}
              onClick={() => toggleTag(tag.id)}
            >
              {tag.name}
            </button>
          ))}
          {tags.length === 0 && <span className="muted-text">{t("transactions.noTagsYet")}</span>}
        </div>
      </div>
    </div>
  );
}
