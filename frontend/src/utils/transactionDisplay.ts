import i18n from "../i18n";
import { type Transaction } from "../api/client";
import { formatSignedCurrency } from "./format";

export interface SignedAmount {
  text: string;
  className: "amount-expense" | "amount-income" | "amount-transfer";
}

export function formatSignedAmount(tx: Transaction, perspectiveAccountId?: number): SignedAmount {
  const amount = parseFloat(tx.amount);
  const currency = tx.currency_code || "RUB";

  if (tx.type === "expense") {
    return { text: formatSignedCurrency(amount, currency, "minus"), className: "amount-expense" };
  }

  if (tx.type === "income") {
    return { text: formatSignedCurrency(amount, currency, "plus"), className: "amount-income" };
  }

  let sign: "plus" | "minus" = "minus";

  if (perspectiveAccountId) {
    if (tx.to_account === perspectiveAccountId) {
      sign = "plus";
    } else if (tx.account === perspectiveAccountId && tx.transfer_kind === "from_nowhere") {
      sign = "plus";
    } else {
      sign = "minus";
    }
  } else if (tx.transfer_kind === "from_nowhere") {
    sign = "plus";
  } else {
    sign = "minus";
  }

  const formatted = formatSignedCurrency(amount, currency, sign);
  return {
    text: formatted,
    className: "amount-transfer",
  };
}

/** "Sber → VTB" / "Sber → Outside wallet" / "Outside wallet → Sber" for transfer rows. */
export function transferRoute(tx: Transaction): string | null {
  if (tx.type !== "transfer") return null;
  const outside = i18n.t("transfer.outsideWallet");
  const own = tx.account_title || "";
  if (tx.transfer_kind === "from_nowhere") {
    return own ? `${outside} → ${own}` : null;
  }
  if (tx.transfer_kind === "to_nowhere") {
    return own ? `${own} → ${outside}` : null;
  }
  const target = tx.to_account_title || "";
  if (!own && !target) return null;
  return `${own} → ${target}`;
}

export function transactionDescription(tx: Transaction, hideAccount?: boolean): string {
  const parts: string[] = [];
  const outside = i18n.t("transfer.outsideWallet");

  if (!hideAccount && tx.account_title) {
    let accountPart = tx.account_title;
    if (tx.to_account_title) accountPart += ` → ${tx.to_account_title}`;
    else if (tx.transfer_kind === "to_nowhere") accountPart += ` → ${outside}`;
    else if (tx.transfer_kind === "from_nowhere") accountPart = `${outside} → ${tx.account_title}`;
    parts.push(accountPart);
  } else if (hideAccount) {
    if (tx.to_account_title) parts.push(`→ ${tx.to_account_title}`);
    else if (tx.transfer_kind === "to_nowhere") parts.push(`→ ${outside}`);
    else if (tx.transfer_kind === "from_nowhere") parts.push(`← ${outside}`);
  }

  if (tx.category_name) parts.push(tx.category_name);
  if (tx.recipient) parts.push(tx.recipient);
  if (tx.notes) parts.push(tx.notes);

  return parts.join(" · ") || i18n.t("common.emptyDash");
}
