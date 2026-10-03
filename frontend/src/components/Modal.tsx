import { useEffect, useLayoutEffect, useRef, useState } from "react";

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
  busy?: boolean;
}

export default function Modal({ open, title, onClose, children, wide, busy = false }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose, busy]);

  useLayoutEffect(() => {
    if (!open) {
      setCompact(false);
      return;
    }
    const dialog = dialogRef.current;
    if (!dialog) return;

    let frame = 0;
    function measure() {
      const body = dialog!.querySelector<HTMLElement>(".modal-body");
      if (!body) return;
      const wasCompact = dialog!.classList.contains("compact");
      if (wasCompact) dialog!.classList.remove("compact");
      const overflows = body.scrollHeight > body.clientHeight + 1;
      if (wasCompact && overflows) dialog!.classList.add("compact");
      setCompact((current) => (current === overflows ? current : overflows));
    }

    function schedule() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    }

    measure();
    const observer = new ResizeObserver(schedule);
    observer.observe(dialog);
    const body = dialog.querySelector(".modal-body");
    if (body) observer.observe(body);
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, [open]);

  if (!open) return null;

  function requestClose() {
    if (busy) return;
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={requestClose} role="presentation">
      <div
        ref={dialogRef}
        className={`modal-dialog${wide ? " modal-dialog-wide" : ""}${compact ? " compact" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        aria-busy={busy}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="modal-title">{title}</h2>
          <button
            type="button"
            className="modal-close secondary"
            onClick={requestClose}
            disabled={busy}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
