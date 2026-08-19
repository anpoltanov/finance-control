import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Account } from "../api/client";
import { tintedFill, tintedSurface } from "../utils/color";
import { formatCurrency } from "../utils/format";
import GlyphIcon from "./GlyphIcon";

interface AccountPlateProps {
  account: Account;
  onClick?: () => void;
  actions?: ReactNode;
  compact?: boolean;
}

export default function AccountPlate({ account, onClick, actions, compact = true }: AccountPlateProps) {
  const { t } = useTranslation();
  const style: CSSProperties = {
    borderLeft: `4px solid ${account.color}`,
    background: tintedSurface(account.color),
  };

  function onKeyDown(e: KeyboardEvent) {
    if (!onClick) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  }

  return (
    <div
      className={`card account-plate${compact ? " compact" : ""}${onClick ? " clickable" : ""}`}
      style={style}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      <div className="account-plate-body">
        <span className="account-plate-icon" style={{ background: tintedFill(account.color) }}>
          <GlyphIcon icon={account.icon} fallback="credit_card" />
        </span>
        <div className="account-plate-text">
          <div className="account-plate-title-row">
            <strong className="account-plate-title">{account.title}</strong>
            {account.archived && <span className="badge">{t("accounts.archived")}</span>}
            {account.exclude_from_statistics && (
              <span className="badge">{t("accounts.excludedBadge")}</span>
            )}
          </div>
          <p className="account-plate-balance">{formatCurrency(account.balance, account.currency_code)}</p>
        </div>
      </div>
      {actions && (
        <div className="card-actions" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          {actions}
        </div>
      )}
    </div>
  );
}
