import 'server-only';
import { db } from '@/lib/db';

export type CategoryRow = { id: string; parentId: string | null; slug: string; nameAr: string; nameEn: string; active: boolean; sortOrder: number; deletedAt?: Date | null };

/** Dropdown data for catalog forms. Levels are codes only (no prices). */
export async function loadTaxonomyOptions() {
  const [categories, brands, models, qualities, levels] = await Promise.all([
    db.category.findMany({ where: { deletedAt: null }, orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }] }),
    db.brand.findMany({ orderBy: { name: 'asc' } }),
    db.productModel.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    db.quality.findMany({ orderBy: { sortOrder: 'asc' } }),
    db.priceLevel.findMany({ orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] }),
  ]);
  return { categories: categories as CategoryRow[], brands, models, qualities, levels };
}

/** Flattens the category tree (unlimited depth) into select options, indented by depth. */
export function categoryOptions(categories: CategoryRow[], locale: 'ar' | 'en', excludeId?: string): Array<{ value: string; label: string }> {
  const byParent = new Map<string | null, CategoryRow[]>();
  for (const c of categories) {
    const key = c.parentId ?? null;
    byParent.set(key, [...(byParent.get(key) ?? []), c]);
  }
  const out: Array<{ value: string; label: string }> = [];
  const walk = (parent: string | null, depth: number, seen: Set<string>) => {
    for (const c of byParent.get(parent) ?? []) {
      if (seen.has(c.id) || c.id === excludeId) continue;
      seen.add(c.id);
      out.push({ value: c.id, label: `${'— '.repeat(depth)}${locale === 'ar' ? c.nameAr : c.nameEn}` });
      walk(c.id, depth + 1, seen);
    }
  };
  walk(null, 0, new Set());
  return out;
}
