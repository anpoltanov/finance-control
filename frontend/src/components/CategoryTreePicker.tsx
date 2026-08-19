import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Category } from "../api/client";
import {
  getAncestorIds,
  getChildren,
  getDescendantIds,
  resolveCategoryColor,
} from "../utils/categoryTree";
import GlyphIcon from "./GlyphIcon";

interface CategoryTreePickerProps {
  categories: Category[];
  mode: "single" | "multi";
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  allowEmpty?: boolean;
  emptyLabel?: string;
}

type CheckState = "checked" | "unchecked" | "indeterminate";

function isSubtreeFullySelected(categories: Category[], id: number, selected: Set<number>): boolean {
  if (!selected.has(id)) return false;
  for (const childId of getDescendantIds(categories, id)) {
    if (!selected.has(childId)) return false;
  }
  return true;
}

function subtreeState(categories: Category[], id: number, selected: Set<number>): CheckState {
  const ids = [id, ...getDescendantIds(categories, id)];
  const hit = ids.filter((cid) => selected.has(cid)).length;
  if (hit === 0) return "unchecked";
  if (hit === ids.length && selected.has(id)) return "checked";
  return "indeterminate";
}

function toggleMulti(categories: Category[], id: number, selectedIds: number[]): number[] {
  const selected = new Set(selectedIds);
  const descendants = getDescendantIds(categories, id);
  if (isSubtreeFullySelected(categories, id, selected)) {
    selected.delete(id);
    descendants.forEach((cid) => selected.delete(cid));
    for (const ancestorId of getAncestorIds(categories, id)) selected.delete(ancestorId);
    return [...selected];
  }

  selected.add(id);
  descendants.forEach((cid) => selected.add(cid));
  const byId = new Map(categories.map((c) => [c.id, c]));
  let parentId = byId.get(id)?.parent ?? null;
  while (parentId) {
    const siblings = getChildren(categories, parentId);
    const allFull = siblings.every((sibling) => isSubtreeFullySelected(categories, sibling.id, selected));
    if (!allFull) break;
    selected.add(parentId);
    parentId = byId.get(parentId)?.parent ?? null;
  }
  return [...selected];
}

export default function CategoryTreePicker({
  categories,
  mode,
  selectedIds,
  onChange,
  allowEmpty = false,
  emptyLabel,
}: CategoryTreePickerProps) {
  const { t } = useTranslation();
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const parentIds = useMemo(
    () => new Set(categories.filter((c) => categories.some((x) => x.parent === c.id)).map((c) => c.id)),
    [categories]
  );
  const selectedKey = selectedIds.slice().sort((a, b) => a - b).join(",");
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const collapseReady = useRef(false);

  useEffect(() => {
    if (collapseReady.current || parentIds.size === 0) return;
    collapseReady.current = true;
    setCollapsed(new Set(parentIds));
  }, [parentIds]);

  useEffect(() => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      for (const id of selectedIds) {
        for (const ancestor of getAncestorIds(categories, id)) next.delete(ancestor);
      }
      return next;
    });
  }, [categories, selectedKey]);

  const roots = getChildren(categories, null);

  function toggleCollapsed(id: number) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectSingle(id: number | null) {
    onChange(id == null ? [] : [id]);
  }

  function renderNode(category: Category, depth: number) {
    const children = getChildren(categories, category.id);
    const hasChildren = children.length > 0;
    const isCollapsed = collapsed.has(category.id);
    const state = subtreeState(categories, category.id, selected);
    const isSelected = mode === "single" ? selected.has(category.id) : state === "checked";
    const fullyChecked = state === "checked";

    return (
      <li key={category.id} className="category-picker-node">
        <div
          className={`category-picker-row${isSelected ? " selected" : ""}`}
          style={{ paddingLeft: `${0.35 + depth * 1.1}rem` }}
        >
          {hasChildren ? (
            <button
              type="button"
              className="category-picker-chevron"
              aria-expanded={!isCollapsed}
              onClick={(e) => {
                e.stopPropagation();
                toggleCollapsed(category.id);
              }}
            >
              <GlyphIcon icon={isCollapsed ? "chevron_right" : "expand_more"} />
            </button>
          ) : (
            <span className="category-picker-chevron spacer" />
          )}
          {mode === "multi" ? (
            <label className="category-picker-main">
              <input
                type="checkbox"
                checked={fullyChecked}
                ref={(el) => {
                  if (el) el.indeterminate = state === "indeterminate";
                }}
                onChange={() => onChange(toggleMulti(categories, category.id, selectedIds))}
              />
              <span className="category-color-dot" style={{ background: resolveCategoryColor(categories, category.id) }} />
              <GlyphIcon icon={category.icon} fallback="folder" />
              <span className="category-picker-name">{category.name}</span>
              {hasChildren && fullyChecked && (
                <span className="muted-text category-picker-caption">{t("categoriesPage.includesNested")}</span>
              )}
            </label>
          ) : (
            <button type="button" className="category-picker-main" onClick={() => selectSingle(category.id)}>
              <span className="category-color-dot" style={{ background: resolveCategoryColor(categories, category.id) }} />
              <GlyphIcon icon={category.icon} fallback="folder" />
              <span className="category-picker-name">{category.name}</span>
            </button>
          )}
        </div>
        {hasChildren && !isCollapsed && <ul className="category-picker-children">{children.map((child) => renderNode(child, depth + 1))}</ul>}
      </li>
    );
  }

  return (
    <div className="category-picker">
      {mode === "single" && allowEmpty && (
        <button
          type="button"
          className={`category-picker-row empty${selectedIds.length === 0 ? " selected" : ""}`}
          onClick={() => selectSingle(null)}
        >
          {emptyLabel ?? t("common.none")}
        </button>
      )}
      <ul className="category-picker-tree">
        {roots.map((category) => renderNode(category, 0))}
      </ul>
      {roots.length === 0 && <p className="muted-text">{t("categoriesPage.noCategories")}</p>}
    </div>
  );
}
