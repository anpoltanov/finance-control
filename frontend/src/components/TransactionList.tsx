import type { Transaction } from "../api/client";
import { useTranslation } from "react-i18next";
import { formatDate, formatSignedCurrency } from "../utils/format";
import { formatSignedAmount, transferRoute } from "../utils/transactionDisplay";
import GlyphIcon from "./GlyphIcon";

interface TransactionListProps {
  transactions: Transaction[];
  onEdit: (tx: Transaction) => void;
  perspectiveAccountId?: number;
  hideAccountColumn?: boolean;
}

interface DayGroup {
  key: string;
  label: string;
  net: number;
  currency: string;
  items: Transaction[];
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function signedNetContribution(tx: Transaction, perspectiveAccountId?: number): number {
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

function groupByDay(transactions: Transaction[], perspectiveAccountId?: number): DayGroup[] {
  const map = new Map<string, DayGroup>();
  for (const tx of transactions) {
    const key = dayKey(tx.date);
    let group = map.get(key);
    if (!group) {
      group = {
        key,
        label: formatDate(key, { weekday: "short", day: "numeric", month: "long", year: "numeric" }),
        net: 0,
        currency: tx.currency_code || "RUB",
        items: [],
      };
      map.set(key, group);
    }
    group.items.push(tx);
    group.net += signedNetContribution(tx, perspectiveAccountId);
    if (!group.currency && tx.currency_code) group.currency = tx.currency_code;
  }
  return [...map.values()];
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export default function TransactionList({
  transactions,
  onEdit,
  perspectiveAccountId,
  hideAccountColumn = false,
}: TransactionListProps) {
  const { t } = useTranslation();
  const groups = groupByDay(transactions, perspectiveAccountId);

  if (transactions.length === 0) {
    return <p className="muted-text tx-empty">{t("transactions.empty")}</p>;
  }

  return (
    <div className="tx-day-list">
      {groups.map((group) => (
        <section key={group.key} className="tx-day-group">
          <header className="tx-day-header">
            <h3>{group.label}</h3>
            <span
              className={`tx-day-net ${
                group.net > 0 ? "amount-income" : group.net < 0 ? "amount-expense" : "amount-transfer"
              }`}
            >
              {formatSignedCurrency(
                Math.abs(group.net),
                group.currency,
                group.net > 0 ? "plus" : group.net < 0 ? "minus" : "auto"
              )}
            </span>
          </header>
          <ul className="tx-day-items">
            {group.items.map((tx) => {
              const signed = formatSignedAmount(tx, perspectiveAccountId);
              const tagNames = tx.tag_names || [];
              const time = formatTime(tx.date);
              const route = transferRoute(tx);
              const title =
                route ||
                tx.category_name ||
                tx.recipient ||
                tx.notes ||
                t(`txType.${tx.type}`);
              const showAccount = !hideAccountColumn && !route && tx.account_title;
              const showNotes = tx.notes && tx.notes !== title;
              return (
                <li key={tx.id} className="tx-day-item" onClick={() => onEdit(tx)}>
                  <span
                    className="tx-cat-icon"
                    style={{ background: tx.category_color || "var(--surface2)" }}
                    aria-hidden="true"
                  >
                    {tx.category_icon ? (
                      <GlyphIcon icon={tx.category_icon} />
                    ) : (
                      <GlyphIcon icon={tx.type === "transfer" ? "swap_horiz" : "circle"} />
                    )}
                  </span>
                  <div className="tx-day-main">
                    <div className="tx-day-title">{title}</div>
                    <div className="tx-day-meta">
                      {showAccount && (
                        <span className="tx-account-chip">
                          <span
                            className="account-color-dot"
                            style={{ background: tx.account_color || "var(--muted)" }}
                          />
                          {tx.account_title}
                        </span>
                      )}
                      {route && tx.category_name ? (
                        <span className="muted-text">{tx.category_name}</span>
                      ) : null}
                      {tx.recipient && tx.recipient !== title ? (
                        <span className="muted-text">{tx.recipient}</span>
                      ) : null}
                      {showNotes && <span className="tx-day-notes muted-text">{tx.notes}</span>}
                      {tagNames.map((name) => (
                        <span key={name} className="tag-chip tag-chip-readonly">
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="tx-day-right">
                    <span className={signed.className}>{signed.text}</span>
                    {time && <span className="tx-day-time muted-text">{time}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
