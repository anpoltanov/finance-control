export interface PlannedCommitOverrides {
  type?: "expense" | "income" | "transfer";
  account?: number;
  to_account?: number | null;
  transfer_kind?: "account_to_account" | "to_nowhere" | "from_nowhere" | null;
  amount?: string;
  category?: number | null;
  date?: string;
  notes?: string;
  recipient?: string;
  status?: "pending" | "cleared" | "reconciled";
  payment_type?: string;
  currency_code?: string;
  tag_ids?: number[];
}

export interface OfflineCommitRequest {
  method: "POST";
  path: string;
  body?: PlannedCommitOverrides;
}

/** The only request an offline commit may queue. Never a second POST /transactions/. */
export function offlineCommitOutbox(
  plannedId: number,
  overrides?: PlannedCommitOverrides
): OfflineCommitRequest {
  const body = overrides && Object.keys(overrides).length > 0 ? overrides : undefined;
  return {
    method: "POST",
    path: `/planned-transactions/${plannedId}/commit/`,
    body,
  };
}
