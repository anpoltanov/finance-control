import { useTranslation } from "react-i18next";
import type { Transaction } from "../api/client";
import { formatSignedCurrency } from "../utils/format";
import { signedTotalsByCurrency } from "../utils/transactionTotals";

interface TransactionTotalsProps {
  transactions: Transaction[];
  perspectiveAccountId?: number;
}

export default function TransactionTotals({ transactions, perspectiveAccountId }: TransactionTotalsProps) {
  const { t } = useTranslation();
  const totals = signedTotalsByCurrency(transactions, perspectiveAccountId);

  return (
    <p className="muted-text tx-count">
      <span>{t("transactions.count", { count: transactions.length })}</span>
      {totals.map((row) => (
        <span key={row.currency}>
          {" · "}
          <span
            className={
              row.total > 0 ? "amount-income" : row.total < 0 ? "amount-expense" : "amount-transfer"
            }
          >
            {formatSignedCurrency(
              Math.abs(row.total),
              row.currency,
              row.total > 0 ? "plus" : row.total < 0 ? "minus" : "auto"
            )}
          </span>
        </span>
      ))}
    </p>
  );
}
