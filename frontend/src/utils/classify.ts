import type { Category } from "../api/client";

export function classifyCashFlow(
  tx: { type: string; amount: string | number; category: number | null | undefined },
  categoriesById: Map<number, Pick<Category, "id" | "type">>
): { income: number; expense: number } {
  if (tx.type === "transfer") return { income: 0, expense: 0 };
  const amount = typeof tx.amount === "string" ? parseFloat(tx.amount) : tx.amount;
  if (!amount || Number.isNaN(amount)) return { income: 0, expense: 0 };
  const categoryType = tx.category != null ? categoriesById.get(tx.category)?.type : undefined;

  if (!categoryType) {
    if (tx.type === "income") return { income: amount, expense: 0 };
    if (tx.type === "expense") return { income: 0, expense: amount };
    return { income: 0, expense: 0 };
  }
  if (categoryType === "expense") {
    if (tx.type === "expense") return { income: 0, expense: amount };
    if (tx.type === "income") return { income: 0, expense: -amount };
  }
  if (categoryType === "income") {
    if (tx.type === "income") return { income: amount, expense: 0 };
    if (tx.type === "expense") return { income: -amount, expense: 0 };
  }
  return { income: 0, expense: 0 };
}
