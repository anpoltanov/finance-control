import { FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Category } from "../api/client";
import { createCategory, updateCategory } from "../data/repository";
import {
  categoryOptionLabel,
  filterCategoriesForParentPicker,
} from "../utils/categoryTree";
import ModalForm from "./ModalForm";

interface CategoryFormModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  category?: Category | null;
  categories?: Category[];
}

const empty = () => ({
  name: "",
  icon: "📁",
  color: "#6366f1",
  type: "expense" as "expense" | "income",
  parent: null as number | null,
  priority: null as Category["priority"],
});

export default function CategoryFormModal({
  open,
  onClose,
  onSaved,
  category,
  categories = [],
}: CategoryFormModalProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState(empty());

  useEffect(() => {
    if (!open) return;
    if (category) {
      setForm({
        name: category.name,
        icon: category.icon,
        color: category.color || "#6366f1",
        type: category.type,
        parent: category.parent,
        priority: category.priority ?? null,
      });
    } else {
      setForm(empty());
    }
  }, [open, category]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const payload = {
      ...form,
      priority: form.type === "expense" ? form.priority : null,
    };
    if (category?.id) {
      await updateCategory(category.id, payload);
    } else {
      await createCategory(payload);
    }
    onSaved();
    onClose();
  }

  const parentOptions = filterCategoriesForParentPicker(categories, category?.id);

  return (
    <ModalForm
      open={open}
      title={category ? t("categoriesPage.editCategory") : t("categoriesPage.newCategory")}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={category ? t("common.update") : t("common.create")}
    >
      <div className="form-grid">
        <div className="form-group">
          <label>{t("common.name")}</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div className="form-group">
          <label>{t("common.icon")}</label>
          <input value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} />
        </div>
        <div className="form-group">
          <label>{t("common.type")}</label>
          <select
            value={form.type}
            onChange={(e) =>
              setForm({
                ...form,
                type: e.target.value as "expense" | "income",
                priority: e.target.value === "income" ? null : form.priority,
              })
            }
          >
            <option value="expense">{t("txType.expense")}</option>
            <option value="income">{t("txType.income")}</option>
          </select>
        </div>
        {form.type === "expense" && (
          <div className="form-group">
            <label>{t("categoriesPage.priority")}</label>
            <select
              value={form.priority || ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  priority: (e.target.value || null) as Category["priority"],
                })
              }
            >
              <option value="">{t("priority.none")}</option>
              <option value="must">{t("priority.must")}</option>
              <option value="need">{t("priority.need")}</option>
              <option value="want">{t("priority.want")}</option>
            </select>
          </div>
        )}
        <div className="form-group">
          <label>{t("categoriesPage.parentCategory")}</label>
          <select
            value={form.parent || ""}
            onChange={(e) => {
              const parent = e.target.value ? Number(e.target.value) : null;
              const parentCat = parent ? categories.find((c) => c.id === parent) : null;
              setForm({
                ...form,
                parent,
                color: parentCat?.color || form.color,
              });
            }}
          >
            <option value="">{t("categoriesPage.topLevel")}</option>
            {parentOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {categoryOptionLabel(c.name, c.depth)}
              </option>
            ))}
          </select>
        </div>
        {!form.parent && (
          <div className="form-group">
            <label>{t("common.color")}</label>
            <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
          </div>
        )}
      </div>
    </ModalForm>
  );
}
