import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import type { Category, Tag } from "../api/client";
import CategoryFormModal from "../components/CategoryFormModal";
import GlyphIcon from "../components/GlyphIcon";
import TagFormModal from "../components/TagFormModal";
import { deleteCategory, deleteTag } from "../data/repository";
import { listCategories, listTags } from "../data/queries";
import { getChildren, priorityLabel, resolveCategoryColor } from "../utils/categoryTree";

export default function CategoriesPage({ embedded = false }: { embedded?: boolean }) {
  const { t } = useTranslation();
  const categories = useLiveQuery(() => listCategories(), []) ?? [];
  const tags = useLiveQuery(() => listTags(), []) ?? [];
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  const roots = useMemo(() => getChildren(categories, null), [categories]);

  function toggleCollapsed(id: number) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onDeleteCategory(category: Category) {
    const label = t("confirm.category", { name: category.name });
    if (!window.confirm(t("confirm.delete", { label }))) return;
    await deleteCategory(category.id);
  }

  async function onDeleteTag(tag: Tag) {
    const label = t("confirm.tag", { name: tag.name });
    if (!window.confirm(t("confirm.delete", { label }))) return;
    await deleteTag(tag.id);
  }

  function renderCategory(category: Category, depth: number) {
    const children = getChildren(categories, category.id);
    const hasChildren = children.length > 0;
    const isCollapsed = collapsed.has(category.id);
    const priority = priorityLabel(category.priority ?? null);
    return (
      <li key={category.id} className="category-tree-group">
        <div
          className="card item-row category-tree-item"
          style={{ marginLeft: `${depth * 1.25}rem` }}
        >
          {hasChildren ? (
            <button
              type="button"
              className="category-collapse-btn"
              aria-expanded={!isCollapsed}
              onClick={() => toggleCollapsed(category.id)}
            >
              <GlyphIcon icon={isCollapsed ? "chevron_right" : "expand_more"} />
            </button>
          ) : (
            <span className="category-collapse-btn spacer" />
          )}
          <button
            type="button"
            className="item-row-main"
            onClick={() => {
              setEditingCategory(category);
              setCatModalOpen(true);
            }}
          >
            <span className="category-color-dot" style={{ background: resolveCategoryColor(categories, category.id) }} />
            <GlyphIcon icon={category.icon} fallback="folder" />
            {category.name} <span className="badge">{t(`txType.${category.type}`)}</span>
            {priority ? <span className="badge priority">{priority}</span> : null}
          </button>
          <button type="button" className="danger" onClick={() => onDeleteCategory(category)}>×</button>
        </div>
        {hasChildren && !isCollapsed && (
          <ul className="item-list category-tree nested">
            {children.map((child) => renderCategory(child, depth + 1))}
          </ul>
        )}
      </li>
    );
  }

  return (
    <div>
      <div className="page-header">
        {!embedded && <h2>{t("categoriesPage.title")}</h2>}
        <div className="page-header-actions" style={embedded ? { marginLeft: "auto" } : undefined}>
          <button type="button" className="secondary" onClick={() => { setEditingTag(null); setTagModalOpen(true); }}>{t("categoriesPage.addTag")}</button>
          <button type="button" onClick={() => { setEditingCategory(null); setCatModalOpen(true); }}>{t("categoriesPage.addCategory")}</button>
        </div>
      </div>
      <div className="two-column">
        <div>
          <h3>{t("categoriesPage.categories")}</h3>
          <ul className="item-list category-tree">
            {roots.map((c) => renderCategory(c, 0))}
            {roots.length === 0 && <p className="muted-text">{t("categoriesPage.noCategories")}</p>}
          </ul>
        </div>
        <div>
          <h3>{t("categoriesPage.tags")}</h3>
          <ul className="item-list">
            {tags.map((tag) => (
              <li key={tag.id} className="card item-row">
                <button type="button" className="item-row-main" onClick={() => { setEditingTag(tag); setTagModalOpen(true); }}>
                  <span style={{ color: tag.color }}>●</span> {tag.name}
                </button>
                <button type="button" className="danger" onClick={() => onDeleteTag(tag)}>×</button>
              </li>
            ))}
            {tags.length === 0 && <p className="muted-text">{t("categoriesPage.noTags")}</p>}
          </ul>
        </div>
      </div>
      <CategoryFormModal
        open={catModalOpen}
        onClose={() => setCatModalOpen(false)}
        onSaved={() => undefined}
        category={editingCategory}
        categories={categories}
      />
      <TagFormModal
        open={tagModalOpen}
        onClose={() => setTagModalOpen(false)}
        onSaved={() => undefined}
        tag={editingTag}
      />
    </div>
  );
}
