import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { type Account, type Category, type Tag } from "../api/client";
import { accountsForSelect } from "../data/queries";
import CategoryTreePicker from "./CategoryTreePicker";
import GlyphIcon from "./GlyphIcon";

interface TransactionFiltersProps {
  filters: Record<string, string>;
  onChange: (filters: Record<string, string>) => void;
  accounts?: Account[];
  categories: Category[];
  tags: Tag[];
  hideAccount?: boolean;
}

function FilterSection({
  icon,
  title,
  children,
  defaultOpen = true,
}: {
  icon: string;
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`filter-section${open ? " open" : ""}`}>
      <button type="button" className="filter-section-header" onClick={() => setOpen((v) => !v)}>
        <GlyphIcon icon={icon} className="filter-section-icon" />
        <span className="filter-section-title">{title}</span>
        <GlyphIcon icon={open ? "expand_more" : "chevron_right"} className="filter-section-chevron" />
      </button>
      {open && <div className="filter-section-body">{children}</div>}
    </div>
  );
}

export default function TransactionFilters({
  filters,
  onChange,
  accounts = [],
  categories,
  tags,
  hideAccount = false,
}: TransactionFiltersProps) {
  const { t } = useTranslation();

  function setField(key: string, value: string) {
    onChange({ ...filters, [key]: value });
  }

  function reset() {
    const next: Record<string, string> = {};
    if (hideAccount && filters.account) next.account = filters.account;
    onChange(next);
  }

  const keepAccount = filters.account ? Number(filters.account) : undefined;

  return (
    <div className="filter-panel">
      <FilterSection icon="search" title={t("filters.search")} defaultOpen>
        <input
          type="search"
          placeholder={t("filters.searchPlaceholder")}
          value={filters.search || ""}
          onChange={(e) => setField("search", e.target.value)}
        />
      </FilterSection>

      <FilterSection icon="swap_vert" title={t("filters.sort")} defaultOpen={false}>
        <select value={filters.sort || "date_desc"} onChange={(e) => setField("sort", e.target.value)}>
          <option value="date_desc">{t("filters.sortDateDesc")}</option>
          <option value="date_asc">{t("filters.sortDateAsc")}</option>
          <option value="amount_desc">{t("filters.sortAmountDesc")}</option>
          <option value="amount_asc">{t("filters.sortAmountAsc")}</option>
        </select>
      </FilterSection>

      <FilterSection icon="tune" title={t("common.type")} defaultOpen>
        <select value={filters.type || ""} onChange={(e) => setField("type", e.target.value)}>
          <option value="">{t("filters.allTypes")}</option>
          <option value="expense">{t("txType.expense")}</option>
          <option value="income">{t("txType.income")}</option>
          <option value="transfer">{t("txType.transfer")}</option>
        </select>
      </FilterSection>

      {!hideAccount && (
        <FilterSection icon="account_balance_wallet" title={t("common.account")} defaultOpen>
          <select value={filters.account || ""} onChange={(e) => setField("account", e.target.value)}>
            <option value="">{t("filters.allAccounts")}</option>
            {accountsForSelect(accounts, [keepAccount]).map((a) => (
              <option key={a.id} value={a.id}>{a.title}</option>
            ))}
          </select>
        </FilterSection>
      )}

      <FilterSection icon="folder" title={t("common.category")} defaultOpen={false}>
        <CategoryTreePicker
          categories={categories}
          mode="single"
          selectedIds={filters.category ? [Number(filters.category)] : []}
          onChange={(ids) => setField("category", ids[0] ? String(ids[0]) : "")}
          allowEmpty
          emptyLabel={t("filters.allCategories")}
        />
      </FilterSection>

      <FilterSection icon="sell" title={t("common.tags")} defaultOpen={false}>
        <select value={filters.tag || ""} onChange={(e) => setField("tag", e.target.value)}>
          <option value="">{t("filters.allTags")}</option>
          {tags.map((tag) => (
            <option key={tag.id} value={tag.id}>{tag.name}</option>
          ))}
        </select>
      </FilterSection>

      <FilterSection icon="payments" title={t("filters.amountRange")} defaultOpen={false}>
        <div className="filter-amount-row">
          <input
            type="number"
            inputMode="decimal"
            placeholder={t("filters.amountMin")}
            value={filters.amount_min || ""}
            onChange={(e) => setField("amount_min", e.target.value)}
          />
          <span className="muted-text">–</span>
          <input
            type="number"
            inputMode="decimal"
            placeholder={t("filters.amountMax")}
            value={filters.amount_max || ""}
            onChange={(e) => setField("amount_max", e.target.value)}
          />
        </div>
      </FilterSection>

      <FilterSection icon="swap_horiz" title={t("filters.transfers")} defaultOpen={false}>
        <label className="filter-checkbox">
          <input
            type="checkbox"
            checked={filters.hide_transfers === "1" || filters.hide_transfers === "true"}
            onChange={(e) => setField("hide_transfers", e.target.checked ? "1" : "")}
          />
          {t("filters.hideTransfers")}
        </label>
      </FilterSection>

      <button type="button" className="secondary filter-reset" onClick={reset}>
        {t("filters.reset")}
      </button>
    </div>
  );
}
