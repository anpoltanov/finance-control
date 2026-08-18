import { FormEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import Modal from "./Modal";

interface ModalFormProps {
  open: boolean;
  title: string;
  onClose: () => void;
  onSubmit: (e: FormEvent) => void;
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

  async function requestDelete() {
    if (!onDelete) return;
    if (!window.confirm(deleteConfirmMessage ?? t("confirm.deleteThis"))) return;
    await onDelete();
  }

  return (
    <Modal open={open} title={title} onClose={onClose} wide={wide}>
      <form onSubmit={onSubmit}>
        {children}
        <div className="modal-footer">
          {onDelete && (
            <button type="button" className="danger modal-footer-delete" onClick={requestDelete}>
              {t("common.delete")}
            </button>
          )}
          <button type="button" className="secondary" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button type="submit">{submitLabel ?? t("common.save")}</button>
        </div>
      </form>
    </Modal>
  );
}
