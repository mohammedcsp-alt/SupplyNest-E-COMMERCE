import { db } from '@/lib/db';
import { descendantCategoryIds } from './public';

/**
 * Filter facets for the catalog sidebar (V3.3).
 * Counts are computed over the published SKUs in the selected category subtree (not over the other active filters).
 * Attribute facets come only from attribute definitions attached to the selected category, so unrelated merchandise
 * never shows irrelevant filters. Public: no price or stock quantity is returned here.
 */
export type Facets = {
  brands: Array<{ id: string; name: string; count: number }>;
  qualities: Array<{ id: string; nameAr: string; nameEn: string; count: number }>;
  attributes: Array<{
    key: string;
    labelAr: string;
    labelEn: string;
    unit: string | null;
    values: Array<{ value: string; count: number }>;
  }>;
};

export async function catalogFacets(categoryId?: string): Promise<Facets> {
  const base: { published: true; active: true; deletedAt: null; categoryId?: { in: string[] } } = { published: true, active: true, deletedAt: null };
  if (categoryId) base.categoryId = { in: await descendantCategoryIds(categoryId) };

  const [brandGroups, qualityGroups, brandRows, qualityRows] = await Promise.all([
    db.sku.groupBy({ by: ['brandId'], where: { ...base, brandId: { not: null } }, _count: { _all: true } }),
    db.sku.groupBy({ by: ['qualityId'], where: { ...base, qualityId: { not: null } }, _count: { _all: true } }),
    db.brand.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    db.quality.findMany({ where: { active: true }, select: { id: true, nameAr: true, nameEn: true }, orderBy: { sortOrder: 'asc' } }),
  ]);

  const brandCount = new Map(brandGroups.map((g) => [g.brandId, g._count._all]));
  const qualityCount = new Map(qualityGroups.map((g) => [g.qualityId, g._count._all]));
  const brands = brandRows.filter((b) => brandCount.has(b.id)).map((b) => ({ id: b.id, name: b.name, count: brandCount.get(b.id) ?? 0 }));
  const qualities = qualityRows.filter((q) => qualityCount.has(q.id)).map((q) => ({ ...q, count: qualityCount.get(q.id) ?? 0 }));

  const attributes: Facets['attributes'] = [];
  if (categoryId) {
    const defs = await db.attributeDefinition.findMany({
      where: { categoryId: { in: await descendantCategoryIds(categoryId) }, filterable: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, key: true, labelAr: true, labelEn: true, unit: true },
    });
    if (defs.length > 0) {
      const values = await db.skuAttributeValue.groupBy({
        by: ['attributeDefinitionId', 'value'],
        where: { attributeDefinitionId: { in: defs.map((d) => d.id) }, sku: base },
        _count: { _all: true },
      });
      for (const d of defs) {
        const rows = values
          .filter((v) => v.attributeDefinitionId === d.id)
          .map((v) => ({ value: v.value, count: v._count._all }))
          .sort((a, b) => a.value.localeCompare(b.value, undefined, { numeric: true }));
        if (rows.length > 0) attributes.push({ key: d.key, labelAr: d.labelAr, labelEn: d.labelEn, unit: d.unit, values: rows });
      }
    }
  }
  return { brands, qualities, attributes };
}
