import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import type { Transaction } from "../api/client";
import DateRangeNav from "../components/DateRangeNav";
import TransactionFilters from "../components/TransactionFilters";
import TransactionList from "../components/TransactionList";
import { PctBadge } from "../components/dashboard/SemiGauge";
import { useAddTransaction } from "../context/AddTransactionContext";
import { useFilterSidebar } from "../context/FilterSidebarContext";
import { buildIncomeExpenseReport, type IncomeExpenseGroup, type IncomeExpenseRow } from "../data/incomeExpense";
import { previousEqualRange } from "../data/dashboard";
import { listAccounts, listCategories, listTags, listTransactions } from "../data/queries";
import { useDateRangePeriod } from "../hooks/useDateRangePeriod";
import { formatCurrency } from "../utils/format";

interface OperationsView {
  title: string;
  categoryId: number | null;
  exact: boolean;
  uncategorized: boolean;
}

export default function ReportsPage() {
  const { t, i18n } = useTranslation();
  const { openEditTransaction } = useAddTransaction();
  const range = useDateRangePeriod("month");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [drill, setDrill] = useState<number[]>([]);
  const [operations, setOperations] = useState<OperationsView | null>(null);

  const parentId = drill.length ? drill[drill.length - 1] : null;

  const periodFilters = useMemo(() => {
    const next = { ...filters };
    if (range.fromParam) next.date_from = range.fromParam;
    if (range.toParam) next.date_to = range.toParam;
    return next;
  }, [filters, range.fromParam, range.toParam]);

  const previousFilters = useMemo(() => {
    if (!range.from || !range.to) return null;
    const prev = previousEqualRange(range.from, range.to);
    return { ...filters, date_from: prev.from, date_to: `${prev.to}T23:59:59` };
  }, [filters, range.from, range.to]);

  const operationFilters = useMemo(() => {
    if (!operations) return periodFilters;
    const next = { ...periodFilters };
    if (operations.uncategorized) next.uncategorized = "1";
    else if (operations.categoryId != null) {
      next.category = String(operations.categoryId);
      if (operations.exact) next.category_exact = "1";
    }
    return next;
  }, [operations, periodFilters]);

  const transactions = useLiveQuery(() => listTransactions(periodFilters), [periodFilters]) ?? [];
  const previousTransactions =
    useLiveQuery(() => (previousFilters ? listTransactions(previousFilters) : Promise.resolve([])), [previousFilters]) ??
    [];
  const operationTransactions = useLiveQuery(() => listTransactions(operationFilters), [operationFilters]) ?? [];
  const accounts = useLiveQuery(() => listAccounts(), []) ?? [];
  const categories = useLiveQuery(() => listCategories(), []) ?? [];
  const tags = useLiveQuery(() => listTags(), []) ?? [];

  const report = useMemo(
    () =>
      buildIncomeExpenseReport({
        transactions,
        previousTransactions,
        categories,
        excludedAccountIds: accounts.filter((account) => account.exclude_from_statistics).map((account) => account.id),
        parentId,
        uncategorizedName: t("reports.uncategorized"),
      }),
    [transactions, previousTransactions, categories, accounts, parentId, t]
  );

  const parentName = parentId ? categories.find((category) => category.id === parentId)?.name : null;

  const filterSidebar = useMemo(
    () => (
      <TransactionFilters
        filters={filters}
        onChange={(next) => {
          setFilters(next);
          setDrill([]);
          setOperations(null);
        }}
        accounts={accounts}
        categories={categories}
        tags={tags}
      />
    ),
    [filters, accounts, categories, tags, i18n.language]
  );
  useFilterSidebar(filterSidebar, [filters, accounts, categories, tags, i18n.language]);

  function openRow(row: IncomeExpenseRow) {
    if (row.hasChildren && row.categoryId != null) {
      setOperations(null);
      setDrill((path) => [...path, row.categoryId as number]);
      return;
    }
    setOperations({
      title: row.name,
      categoryId: row.categoryId,
      exact: row.exact,
      uncategorized: row.uncategorized,
    });
  }

  function goBack() {
    if (operations) {
      setOperations(null);
      return;
    }
    setDrill((path) => path.slice(0, -1));
  }

  return (
    <div>
      <div className="page-header">
        <h2>{t("reports.title")}</h2>
        <DateRangeNav range={range} />
      </div>

      {operations ? (
        <div className="card report-operations">
          <div className="widget-header">
            <h3>{operations.title}</h3>
            <button type="button" className="secondary" onClick={goBack}>
              {t("common.back")}
            </button>
          </div>
          <TransactionList
            transactions={operationTransactions}
            onEdit={(tx: Transaction) => openEditTransaction(tx)}
          />
        </div>
      ) : (
        <div className="card report-table-card">
          {(drill.length > 0 || parentName) && (
            <div className="widget-header">
              <h3>{parentName}</h3>
              <button type="button" className="secondary" onClick={goBack}>
                {t("common.back")}
              </button>
            </div>
          )}
          <table className="report-table">
            <thead>
              <tr>
                <th>{t("common.category")}</th>
                <th className="report-amount">{t("reports.total")}</th>
                <th className="report-amount">{t("reports.change")}</th>
              </tr>
            </thead>
            <tbody>
              {drill.length === 0 && <GroupRows group={report.income} label={t("reports.income")} onOpen={openRow} />}
              {drill.length === 0 && <GroupRows group={report.expense} label={t("reports.expense")} onOpen={openRow} />}
              {drill.length > 0 &&
                report.income.rows.map((row) => (
                  <CategoryRow key={`income-${row.key}`} row={row} onOpen={openRow} />
                ))}
              {drill.length > 0 &&
                report.expense.rows.map((row) => (
                  <CategoryRow key={`expense-${row.key}`} row={row} onOpen={openRow} invert />
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function GroupRows({
  group,
  label,
  onOpen,
}: {
  group: IncomeExpenseGroup;
  label: string;
  onOpen: (row: IncomeExpenseRow) => void;
}) {
  return (
    <>
      <tr className="report-summary-row">
        <th scope="row">{label}</th>
        <td className="report-amount">{formatCurrency(group.total)}</td>
        <td className="report-amount">
          <PctBadge pct={group.pct} invert={group.kind === "expense"} />
        </td>
      </tr>
      {group.rows.map((row) => (
        <CategoryRow key={row.key} row={row} onOpen={onOpen} invert={group.kind === "expense"} />
      ))}
    </>
  );
}

function CategoryRow({
  row,
  onOpen,
  invert = false,
}: {
  row: IncomeExpenseRow;
  onOpen: (row: IncomeExpenseRow) => void;
  invert?: boolean;
}) {
  return (
    <tr className="report-category-row" onClick={() => onOpen(row)}>
      <td>{row.name}</td>
      <td className="report-amount">{formatCurrency(row.total)}</td>
      <td className="report-amount">
        <PctBadge pct={row.pct} invert={invert} />
      </td>
    </tr>
  );
}
