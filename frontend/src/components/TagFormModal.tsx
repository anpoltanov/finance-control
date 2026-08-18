import { FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Tag } from "../api/client";
import { createTag, updateTag } from "../data/repository";
import ModalForm from "./ModalForm";

interface TagFormModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  tag?: Tag | null;
}

const empty = () => ({ name: "", color: "#94a3b8" });

export default function TagFormModal({ open, onClose, onSaved, tag }: TagFormModalProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState(empty());

  useEffect(() => {
    if (!open) return;
    if (tag) {
      setForm({ name: tag.name, color: tag.color });
    } else {
      setForm(empty());
    }
  }, [open, tag]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (tag?.id) {
      await updateTag(tag.id, form);
    } else {
      await createTag(form);
    }
    onSaved();
    onClose();
  }

  return (
    <ModalForm
      open={open}
      title={tag ? t("categoriesPage.editTag") : t("categoriesPage.newTag")}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={tag ? t("common.update") : t("common.create")}
    >
      <div className="form-grid">
        <div className="form-group">
          <label>{t("common.name")}</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div className="form-group">
          <label>{t("common.color")}</label>
          <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
        </div>
      </div>
    </ModalForm>
  );
}
