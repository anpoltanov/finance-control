import { FormEvent, ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAsyncAction } from "../hooks/useAsyncAction";
import Modal from "./Modal";

interface ModalFormProps {
  open: boolean;
  title: string;
  onClose: () => void;
  onSubmit: (e: FormEvent) => void | Promise<void>;
  submitLabel?: string;
  children: ReactNode;
  wide?: boolean;
  onDelete?: () => void | Promise<void>;
  deleteConfirmMessage?: string;
}

export default function ModalForm({
  open,
  title,
  onClose,
  onSubmit,
  submitLabel,
  children,
  wide,
  onDelete,
  deleteConfirmMessage,
}: ModalFormProps) {
  const { t } = useTranslation();
  const { pending, error, run } = useAsyncAction();
  const [mode, setMode] = useState<"save" | "delete">("save");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setMode("save");
    await run(() => Promise.resolve(onSubmit(e)));
  }

  async function requestDelete() {
    if (!onDelete || pending) return;
    if (!window.confirm(deleteConfirmMessage ?? t("confirm.deleteThis"))) return;
    setMode("delete");
    await run(() => Promise.resolve(onDelete()));
  }

  const saveLabel = pending && mode === "save" ? t("common.saving") : (submitLabel ?? t("common.save"));
  const deleteLabel = pending && mode === "delete" ? t("common.deleting") : t("common.delete");

  return (
    <Modal open={open} title={title} onClose={onClose} wide={wide} busy={pending}>
      <form className="modal-form" onSubmit={handleSubmit}>
        <div className="modal-body">
          {error && <p className="form-error">{error}</p>}
          {children}
        </div>
        <div className="modal-footer">
          {onDelete && (
            <button
              type="button"
              className="danger modal-footer-delete"
              onClick={requestDelete}
              disabled={pending}
              aria-busy={pending && mode === "delete"}
            >
              {deleteLabel}
            </button>
          )}
          <button type="button" className="secondary" onClick={onClose} disabled={pending}>
            {t("common.cancel")}
          </button>
          <button type="submit" disabled={pending} aria-busy={pending && mode === "save"}>
            {saveLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
