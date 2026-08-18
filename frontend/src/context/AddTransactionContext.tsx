import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from "react";
import type { Transaction } from "../api/client";
import TransactionFormModal, { type TransactionFormValues } from "../components/TransactionFormModal";

interface AddTransactionContextValue {
  openAddTransaction: (initial?: Partial<TransactionFormValues>) => void;
  openEditTransaction: (tx: Transaction) => void;
}

const AddTransactionContext = createContext<AddTransactionContextValue | null>(null);

export function AddTransactionProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [initial, setInitial] = useState<Partial<TransactionFormValues> | undefined>();

  const openAddTransaction = useCallback((values?: Partial<TransactionFormValues>) => {
    setEditing(null);
    setInitial(values);
    setOpen(true);
  }, []);

  const openEditTransaction = useCallback((tx: Transaction) => {
    setEditing(tx);
    setInitial(undefined);
    setOpen(true);
  }, []);

  const value = useMemo(
    () => ({ openAddTransaction, openEditTransaction }),
    [openAddTransaction, openEditTransaction]
  );

  return (
    <AddTransactionContext.Provider value={value}>
      {children}
      <TransactionFormModal
        open={open}
        onClose={() => setOpen(false)}
        onSaved={() => undefined}
        transaction={editing}
        initialValues={editing ? undefined : initial}
      />
    </AddTransactionContext.Provider>
  );
}

export function useAddTransaction() {
  const ctx = useContext(AddTransactionContext);
  if (!ctx) throw new Error("useAddTransaction must be used within AddTransactionProvider");
  return ctx;
}
