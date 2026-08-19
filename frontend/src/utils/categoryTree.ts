import i18n from "../i18n";
import type { Category } from "../api/client";

export type CategoryTreeNode = Category & { depth: number };

export function buildCategoryTree(categories: Category[]): CategoryTreeNode[] {
  const byParent = new Map<number | null, Category[]>();
  for (const category of categories) {
    const key = category.parent;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(category);
  }

  const result: CategoryTreeNode[] = [];
  function walk(parentId: number | null, depth: number) {
    const children = byParent.get(parentId) || [];
    children.sort((a, b) => a.name.localeCompare(b.name));
    for (const category of children) {
      result.push({ ...category, depth });
      walk(category.id, depth + 1);
    }
  }
  walk(null, 0);
  return result;
}

export function getChildren(categories: Category[], parentId: number | null): Category[] {
  return categories.filter((c) => c.parent === parentId).sort((a, b) => a.name.localeCompare(b.name));
}

export function getAncestorIds(categories: Category[], categoryId: number): number[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const ancestors: number[] = [];
  let current = byId.get(categoryId);
  while (current?.parent) {
    ancestors.push(current.parent);
    current = byId.get(current.parent);
  }
  return ancestors;
}

export function expandCategoryIds(categories: Category[], selectedIds: number[]): Set<number> {
  const expanded = new Set<number>();
  for (const id of selectedIds) {
    expanded.add(id);
    for (const childId of getDescendantIds(categories, id)) expanded.add(childId);
  }
  return expanded;
}

export function getDescendantIds(categories: Category[], categoryId: number): Set<number> {
  const byParent = new Map<number | null, number[]>();
  for (const category of categories) {
    const key = category.parent;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(category.id);
  }

  const descendants = new Set<number>();
  function walk(id: number) {
    for (const childId of byParent.get(id) || []) {
      descendants.add(childId);
      walk(childId);
    }
  }
  walk(categoryId);
  return descendants;
}

export function categoryOptionLabel(name: string, depth: number): string {
  return `${"\u00a0".repeat(depth * 2)}${depth > 0 ? "↳ " : ""}${name}`;
}

export function filterCategoriesForParentPicker(
  categories: Category[],
  editingId?: number | null
): CategoryTreeNode[] {
  const tree = buildCategoryTree(categories);
  if (!editingId) return tree;
  const excluded = getDescendantIds(categories, editingId);
  excluded.add(editingId);
  return tree.filter((c) => !excluded.has(c.id));
}

export function filterCategoriesForTransaction(
  categories: Category[],
  transactionType: "expense" | "income" | "transfer"
): CategoryTreeNode[] {
  if (transactionType === "transfer") return [];
  return buildCategoryTree(categories.filter((c) => c.type === transactionType));
}

export function priorityLabel(priority: Category["priority"]): string | null {
  if (!priority) return null;
  return i18n.t(`priority.${priority}`);
}

export function resolveCategoryColor(categories: Category[], categoryId: number | null | undefined): string {
  if (!categoryId) return "#6366f1";
  const byId = new Map(categories.map((c) => [c.id, c]));
  let current = byId.get(categoryId);
  while (current?.parent) {
    const parent = byId.get(current.parent);
    if (!parent) break;
    current = parent;
  }
  return current?.color || "#6366f1";
}
