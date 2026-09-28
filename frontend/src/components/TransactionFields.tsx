import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Account, Category, Tag } from "../api/client";
import { accountsForSelect } from "../data/queries";
import { filterCategoriesForTransaction } from "../utils/categoryTree";
import { OUTSIDE, type TransferPicks } from "../utils/transferPicks";
import CategorySelect from "./CategorySelect";

export type TxFieldType = "expense" | "income" | "transfer";

export interface TxFieldValues {
  type: TxFieldType;
  account?: number | null;
  amount: string;
  category: number | null;
  recipient: string;
  notes: string;
  tag_ids: number[];
  /** Names typed in this form that do not have an id yet. */
  new_tag_names: string[];
  new_tag_draft: string;
}

export function collectTagPayload(
  values: Pick<TxFieldValues, "tag_ids" | "new_tag_names" | "new_tag_draft">,
  tags: Tag[]
): { tag_ids: number[]; tag_names: string[] } {
  const ids = (values.tag_ids || []).filter((id) => Number.isFinite(id));
  const names: string[] = [];
  const seen = new Set<string>();

  function addName(name: string | undefined) {
    const trimmed = (name || "").trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    names.push(trimmed);
  }

  for (const id of ids) addName(tags.find((tag) => tag.id === id)?.name);
  for (const name of values.new_tag_names || []) addName(name);
  addName(values.new_tag_draft);
  return { tag_ids: ids, tag_names: names };
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

  function commitDraftTag() {
    const name = (values.new_tag_draft || "").trim();
    if (!name) return;
    const existing = tags.find((tag) => tag.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      const current = values.tag_ids || [];
      onChange({
        new_tag_draft: "",
        tag_ids: current.includes(existing.id) ? current : [...current, existing.id],
      });
      return;
    }
    const pending = values.new_tag_names || [];
    if (pending.some((item) => item.toLowerCase() === name.toLowerCase())) {
      onChange({ new_tag_draft: "" });
      return;
    }
    onChange({ new_tag_draft: "", new_tag_names: [...pending, name] });
  }

  function removeNewTag(name: string) {
    onChange({
      new_tag_names: (values.new_tag_names || []).filter((item) => item !== name),
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
          <CategorySelect
            categories={filterCategoriesForTransaction(categories, values.type)}
            selectedId={values.category}
            onChange={(id) => onChange({ category: id })}
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
          {(values.new_tag_names || []).map((name) => (
            <button
              key={name}
              type="button"
              className="tag-chip active"
              onClick={() => removeNewTag(name)}
            >
              {name}
            </button>
          ))}
          {tags.length === 0 && (values.new_tag_names || []).length === 0 && (
            <span className="muted-text">{t("transactions.noTagsYet")}</span>
          )}
        </div>
        <div className="tag-draft">
          <input
            value={values.new_tag_draft || ""}
            placeholder={t("transactions.newTagPlaceholder")}
            aria-label={t("transactions.newTagPlaceholder")}
            onChange={(e) => onChange({ new_tag_draft: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitDraftTag();
              }
            }}
          />
          <button type="button" className="secondary" onClick={commitDraftTag}>
            {t("transactions.addTag")}
          </button>
        </div>
      </div>
    </div>
  );
}
