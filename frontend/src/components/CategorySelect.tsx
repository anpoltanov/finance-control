import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Category } from "../api/client";
import { resolveCategoryColor } from "../utils/categoryTree";
import CategoryTreePicker from "./CategoryTreePicker";
import GlyphIcon from "./GlyphIcon";

interface CategorySelectProps {
  categories: Category[];
  selectedId: number | null;
  onChange: (id: number | null) => void;
  allowEmpty?: boolean;
  emptyLabel?: string;
}

export default function CategorySelect({
  categories,
  selectedId,
  onChange,
  allowEmpty = true,
  emptyLabel,
}: CategorySelectProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const selected = categories.find((c) => c.id === selectedId) ?? null;
  const noneLabel = emptyLabel ?? t("common.none");

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  function pick(ids: number[]) {
    onChange(ids[0] ?? null);
    setOpen(false);
  }

  return (
    <div className={`category-select${open ? " open" : ""}`} ref={wrapRef}>
      <button
        type="button"
        className="category-select-trigger"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
      >
        {selected ? (
          <>
            <span className="category-color-dot" style={{ background: resolveCategoryColor(categories, selected.id) }} />
            <GlyphIcon icon={selected.icon} fallback="folder" />
            <span className="category-select-name">{selected.name}</span>
          </>
        ) : (
          <span className="muted-text">{noneLabel}</span>
        )}
        <GlyphIcon icon="expand_more" />
      </button>
      {open && (
        <>
          <button type="button" className="category-select-backdrop" aria-label={t("common.cancel")} onClick={() => setOpen(false)} />
          <div className="category-select-panel" role="dialog" aria-label={t("common.category")}>
            <div className="category-select-panel-header">
              <strong>{t("common.category")}</strong>
              <button type="button" className="secondary modal-close" onClick={() => setOpen(false)}>
                ×
              </button>
            </div>
            <CategoryTreePicker
              categories={categories}
              mode="single"
              selectedIds={selectedId ? [selectedId] : []}
              onChange={pick}
              allowEmpty={allowEmpty}
              emptyLabel={noneLabel}
            />
          </div>
        </>
      )}
    </div>
  );
}
