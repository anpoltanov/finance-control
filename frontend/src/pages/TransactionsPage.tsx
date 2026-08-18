import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import type { Transaction } from "../api/client";
import DateRangeNav from "../components/DateRangeNav";
import TransactionFilters from "../components/TransactionFilters";
import TransactionList from "../components/TransactionList";
import { useAddTransaction } from "../context/AddTransactionContext";
import { useFilterSidebar } from "../context/FilterSidebarContext";
import { listAccounts, listCategories, listTags, listTransactions } from "../data/queries";
import { useDateRangePeriod } from "../hooks/useDateRangePeriod";

export default function TransactionsPage() {
  const { t, i18n } = useTranslation();
  const { openEditTransaction } = useAddTransaction();
  const range = useDateRangePeriod("month");
  const [filters, setFilters] = useState<Record<string, string>>({});

  const queryFilters = useMemo(() => {
    const next = { ...filters };
    if (range.fromParam) next.date_from = range.fromParam;
    if (range.toParam) next.date_to = range.toParam;
    return next;
  }, [filters, range.fromParam, range.toParam]);

  const transactions = useLiveQuery(() => listTransactions(queryFilters), [queryFilters]) ?? [];
  const accounts = useLiveQuery(() => listAccounts(), []) ?? [];
  const categories = useLiveQuery(() => listCategories(), []) ?? [];
  const tags = useLiveQuery(() => listTags(), []) ?? [];

  const filterSidebar = useMemo(
    () => (
      <TransactionFilters
        filters={filters}
        onChange={setFilters}
        accounts={accounts}
        categories={categories}
        tags={tags}
      />
    ),
    [filters, accounts, categories, tags, i18n.language]
  );

  useFilterSidebar(filterSidebar, [filters, accounts, categories, tags, i18n.language]);

  return (
    <div>
      <div className="page-header">
        <h2>{t("transactions.title")}</h2>
        <DateRangeNav range={range} />
      </div>

      <TransactionList
        transactions={transactions}
        onEdit={(tx: Transaction) => openEditTransaction(tx)}
      />
    </div>
  );
}
