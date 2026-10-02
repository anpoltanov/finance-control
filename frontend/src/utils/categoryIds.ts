import type { Category } from "../api/client";

export function getDescendantIds(categories: Pick<Category, "id" | "parent">[], categoryId: number): Set<number> {
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

export function expandCategoryIds(categories: Pick<Category, "id" | "parent">[], selectedIds: number[]): Set<number> {
  const expanded = new Set<number>();
  for (const id of selectedIds) {
    expanded.add(id);
    for (const childId of getDescendantIds(categories, id)) expanded.add(childId);
  }
  return expanded;
}

export function categoryFilterIds(
  categories: Pick<Category, "id" | "parent">[],
  categoryId: number,
  exact = false
): Set<number> {
  if (exact) return new Set([categoryId]);
  return expandCategoryIds(categories, [categoryId]);
}
