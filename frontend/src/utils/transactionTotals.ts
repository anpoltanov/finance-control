import type { Transaction } from "../api/client";

export function signedNetContribution(tx: Transaction, perspectiveAccountId?: number): number {
  const amount = parseFloat(tx.amount) || 0;
  if (tx.type === "expense") return -amount;
  if (tx.type === "income") return amount;
  if (tx.type === "transfer") {
    if (!perspectiveAccountId) return 0;
    if (tx.to_account === perspectiveAccountId) return amount;
    if (tx.account === perspectiveAccountId && tx.transfer_kind === "from_nowhere") return amount;
    if (tx.account === perspectiveAccountId) return -amount;
    return 0;
  }
  return 0;
}

export interface CurrencyTotal {
  currency: string;
  total: number;
}

/** One signed total per currency for the rows already on screen. */
export function signedTotalsByCurrency(
  transactions: Transaction[],
  perspectiveAccountId?: number
): CurrencyTotal[] {
  const totals = new Map<string, number>();
  for (const tx of transactions) {
    const currency = tx.currency_code || "RUB";
    totals.set(currency, (totals.get(currency) || 0) + signedNetContribution(tx, perspectiveAccountId));
  }
  return [...totals.entries()]
    .map(([currency, total]) => ({ currency, total }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}
