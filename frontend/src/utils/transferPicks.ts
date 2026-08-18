export const OUTSIDE = "outside";

export type TransferKind = "account_to_account" | "to_nowhere" | "from_nowhere";

export interface TransferPicks {
  fromPick: string;
  toPick: string;
}

interface TransferLike {
  type: string;
  account?: number | null;
  to_account?: number | null;
  transfer_kind?: string | null;
}

export function picksFromTransfer(tx: TransferLike): TransferPicks {
  if (tx.type !== "transfer") {
    return { fromPick: tx.account ? String(tx.account) : "", toPick: "" };
  }
  if (tx.transfer_kind === "from_nowhere") {
    return { fromPick: OUTSIDE, toPick: tx.account ? String(tx.account) : "" };
  }
  if (tx.transfer_kind === "to_nowhere") {
    return { fromPick: tx.account ? String(tx.account) : "", toPick: OUTSIDE };
  }
  return {
    fromPick: tx.account ? String(tx.account) : "",
    toPick: tx.to_account ? String(tx.to_account) : "",
  };
}

export interface ResolvedTransfer {
  account: number;
  to_account: number | null;
  transfer_kind: TransferKind;
}

/** Maps the two account pickers (which may hold the "Outside wallet" sentinel) onto model fields. */
export function resolveTransferPicks(fromPick: string, toPick: string): ResolvedTransfer | null {
  if (!fromPick || !toPick) return null;
  const fromOutside = fromPick === OUTSIDE;
  const toOutside = toPick === OUTSIDE;
  if (fromOutside && toOutside) return null;
  if (!fromOutside && !toOutside) {
    return {
      account: Number(fromPick),
      to_account: Number(toPick),
      transfer_kind: "account_to_account",
    };
  }
  if (toOutside) {
    return { account: Number(fromPick), to_account: null, transfer_kind: "to_nowhere" };
  }
  return { account: Number(toPick), to_account: null, transfer_kind: "from_nowhere" };
}
