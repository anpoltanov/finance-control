import { FormEvent, useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import type { Budget } from "../api/client";
import { listCategories } from "../data/queries";
import { createBudget, updateBudget } from "../data/repository";
import CategoryTreePicker from "./CategoryTreePicker";
import ModalForm from "./ModalForm";

interface BudgetFormModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  budget?: Budget | null;
}

const empty = () => ({
  name: "",
  amount: "",
  start_date: new Date().toISOString().slice(0, 10),
  period: "monthly" as "monthly" | "yearly",
  rollover_enabled: false,
  category_ids: [] as number[],
});

export default function BudgetFormModal({ open, onClose, onSaved, budget }: BudgetFormModalProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState(empty());
  const categories =
    useLiveQuery(async () => (await listCategories()).filter((x) => x.type === "expense"), []) ?? [];

  useEffect(() => {
    if (!open) return;
    if (budget) {
      setForm({
        name: budget.name,
        amount: budget.amount,
        start_date: budget.start_date,
        period: budget.period,
        rollover_enabled: budget.rollover_enabled,
        category_ids: budget.category_ids || [],
      });
    } else {
      setForm(empty());
    }
  }, [open, budget]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (budget?.id) {
      await updateBudget(budget.id, form);
    } else {
      await createBudget(form);
    }
    onSaved();
    onClose();
  }

  return (
    <ModalForm
      open={open}
      title={budget ? t("budgets.edit") : t("budgets.new")}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={budget ? t("common.update") : t("common.create")}
      wide
    >
      <div className="form-grid">
        <div className="form-group">
          <label>{t("common.name")}</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div className="form-group">
          <label>{t("common.amount")}</label>
          <input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
        </div>
        <div className="form-group">
          <label>{t("budgets.startDate")}</label>
          <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
        </div>
        <div className="form-group">
          <label>{t("budgets.period")}</label>
          <select
            value={form.period}
            onChange={(e) => setForm({ ...form, period: e.target.value as "monthly" | "yearly" })}
          >
            <option value="monthly">{t("period.monthly")}</option>
            <option value="yearly">{t("period.yearly")}</option>
          </select>
        </div>
        <div className="form-group">
          <label>
            <input
              type="checkbox"
              checked={form.rollover_enabled}
              onChange={(e) => setForm({ ...form, rollover_enabled: e.target.checked })}
            />
            {" "}{t("budgets.rollover")}
          </label>
        </div>
        <div className="form-group form-group-full">
          <label>{t("budgets.categoriesHint")}</label>
          <CategoryTreePicker
            categories={categories}
            mode="multi"
            selectedIds={form.category_ids}
            onChange={(category_ids) => setForm({ ...form, category_ids })}
          />
        </div>
      </div>
    </ModalForm>
  );
}
