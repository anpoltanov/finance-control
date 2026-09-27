import type { Category } from "../api/client";

/** Quick-pick lane shows the most-used categories, at least this many when they exist. */
export const QUICK_CATEGORY_COUNT = 12;

export function quickCategories(
  categories: Category[],
  usedIds: Array<number | null | undefined>,
  selectedId?: number | null
): Category[] {
  const allowed = new Set(categories.map((category) => category.id));
  const counts = new Map<number, number>();
  for (const id of usedIds) {
    if (id == null || !allowed.has(id)) continue;
    counts.set(id, (counts.get(id) || 0) + 1);
  }

  const ranked = [...categories].sort((a, b) => {
    const byUse = (counts.get(b.id) || 0) - (counts.get(a.id) || 0);
    if (byUse !== 0) return byUse;
    return a.name.localeCompare(b.name);
  });

  const picked = ranked.slice(0, Math.min(ranked.length, QUICK_CATEGORY_COUNT));
  if (selectedId != null && !picked.some((category) => category.id === selectedId)) {
    const selected = categories.find((category) => category.id === selectedId);
    if (selected) picked.push(selected);
  }
  return picked;
}
