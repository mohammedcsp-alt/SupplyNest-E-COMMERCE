import type { ReactNode } from 'react';
import { PageHeader, Card, Badge, EmptyState } from '@/components/ui';
import { ApiForm } from '@/components/forms';
import { PERMISSIONS } from '@/lib/rbac';
import { db } from '@/lib/db';
import { gatePage } from '../_lib/gate';
import { categoryOptions, loadTaxonomyOptions, type CategoryRow } from '../_lib/taxonomy';
import { NullableJsonForm } from '../_components/NullableJsonForm';
import { AttributeDefForm } from '../_components/AttributeDefForm';
import { OwnerImage } from '../_components/OwnerImage';

export const dynamic = 'force-dynamic';

export default async function AdminCategories() {
  const g = await gatePage(PERMISSIONS.CATALOG_VIEW, '/admin/categories');
  if (!g.ok) return g.node;
  const { L, locale, user } = g;
  const canCategory = user.permissions.has(PERMISSIONS.CATEGORY_MANAGE);
  const canCatalog = user.permissions.has(PERMISSIONS.CATALOG_MANAGE);
  const tax = await loadTaxonomyOptions();
  const attributes = await db.attributeDefinition.findMany({ orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }] });
  const attrByCat = new Map<string, typeof attributes>();
  for (const a of attributes) attrByCat.set(a.categoryId, [...(attrByCat.get(a.categoryId) ?? []), a]);
  const categories = tax.categories as CategoryRow[];
  const childrenOf = new Map<string | null, CategoryRow[]>();
  for (const c of categories) childrenOf.set(c.parentId, [...(childrenOf.get(c.parentId) ?? []), c]);
  const parentOptions = categoryOptions(categories, locale);

  const renderNode = (c: CategoryRow, depth: number, seen: Set<string>): ReactNode => {
    if (seen.has(c.id)) return null;
    seen.add(c.id);
    const kids = childrenOf.get(c.id) ?? [];
    const attrs = attrByCat.get(c.id) ?? [];
    return (
      <li key={c.id} style={{ marginBlockStart: 10 }}>
        <div className="row">
          <strong>{locale === 'ar' ? c.nameAr : c.nameEn}</strong>
          <span className="muted" dir="ltr">{c.slug}</span>
          {!c.active && <Badge tone="danger">{L('غير فعال', 'Inactive')}</Badge>}
          <span className="muted">{L(`المستوى ${depth + 1}`, `Level ${depth + 1}`)}</span>
        </div>
        {canCategory && (
          <details>
            <summary>{L('صورة الفئة', 'Category image')}</summary>
            <div style={{ paddingBlockStart: 10 }}>
              <OwnerImage
                endpoint={`/api/v1/admin/categories/${c.id}/image`}
                previewUrl={`/api/v1/public/categories/${c.id}/image`}
                hasImage={Boolean((c as { imageKey?: string | null }).imageKey)}
                locale={locale}
                label={L('صورة الفئة', 'Category image')}
              />
            </div>
          </details>
        )}
        <details>
          <summary>{L('تعديل الفئة والخصائص', 'Edit category and attributes')}</summary>
          <div className="stack" style={{ paddingBlockStart: 10 }}>
            {canCategory && (
              <NullableJsonForm
                endpoint={`/api/v1/admin/categories/${c.id}`}
                method="PUT"
                locale={locale}
                submitLabel={L('حفظ الفئة', 'Save category')}
                busyLabel={L('جارٍ الحفظ…', 'Saving…')}
                successMessage={L('تم الحفظ.', 'Saved.')}
                fields={[
                  { name: 'slug', label: 'Slug', required: true, defaultValue: c.slug },
                  { name: 'nameAr', label: L('الاسم بالعربية', 'Name (Arabic)'), required: true, defaultValue: c.nameAr },
                  { name: 'nameEn', label: L('الاسم بالإنجليزية', 'Name (English)'), required: true, defaultValue: c.nameEn },
                  { name: 'parentId', label: L('الفئة الأم (فارغ = جذر)', 'Parent (empty = root)'), type: 'select', nullable: true, options: parentOptions.filter((o) => o.value !== c.id), defaultValue: c.parentId },
                  { name: 'sortOrder', label: L('الترتيب', 'Sort order'), type: 'number', defaultValue: c.sortOrder },
                  { name: 'active', label: L('فعالة', 'Active'), type: 'checkbox', defaultValue: c.active },
                ]}
              />
            )}
            <div>
              <h3>{L('خصائص الفئة', 'Category attributes')}</h3>
              {attrs.length === 0 ? (
                <EmptyState>{L('لا توجد خصائص.', 'No attributes.')}</EmptyState>
              ) : (
                <ul>
                  {attrs.map((a) => (
                    <li key={a.id}>
                      <code>{a.key}</code> — {locale === 'ar' ? a.labelAr : a.labelEn} · {a.dataType}
                      {a.unit ? ` (${a.unit})` : ''}
                      {Array.isArray(a.options) && a.options.length ? ` · ${(a.options as string[]).join(', ')}` : ''}
                    </li>
                  ))}
                </ul>
              )}
              {canCategory && <AttributeDefForm categoryId={c.id} locale={locale} />}
            </div>
          </div>
        </details>
        {kids.length > 0 && <ul style={{ listStyle: 'none', paddingInlineStart: 20, borderInlineStart: '2px solid var(--c-border)' }}>{kids.map((k) => renderNode(k, depth + 1, seen))}</ul>}
      </li>
    );
  };

  const roots = childrenOf.get(null) ?? [];
  const seen = new Set<string>();

  return (
    <>
      <PageHeader title={L('الفئات والعلامات والجودات', 'Categories, brands and qualities')} subtitle={L('شجرة الفئات غير محدودة العمق. الخصائص تُعرَّف لكل فئة.', 'Category tree has unlimited depth. Attributes are defined per category.')} />

      <Card title={L('شجرة الفئات', 'Category tree')}>
        {categories.length === 0 ? (
          <EmptyState>{L('لا توجد فئات بعد.', 'No categories yet.')}</EmptyState>
        ) : (
          <ul style={{ listStyle: 'none', paddingInlineStart: 0 }}>{roots.map((r) => renderNode(r, 0, seen))}</ul>
        )}
      </Card>

      {canCategory && (
        <Card title={L('إضافة فئة', 'Add category')}>
          <ApiForm
            endpoint="/api/v1/admin/categories"
            submitLabel={L('إضافة الفئة', 'Add category')}
            successMessage={L('تمت إضافة الفئة.', 'Category added.')}
            fields={[
              { name: 'slug', label: 'Slug', required: true, placeholder: 'tools-hand', help: L('أحرف لاتينية صغيرة وأرقام وشرطات.', 'Lowercase Latin letters, digits and dashes.'), dir: 'ltr' },
              { name: 'nameAr', label: L('الاسم بالعربية', 'Name (Arabic)'), required: true, dir: 'rtl' },
              { name: 'nameEn', label: L('الاسم بالإنجليزية', 'Name (English)'), required: true },
              { name: 'parentId', label: L('الفئة الأم (اختياري)', 'Parent (optional)'), type: 'select', options: parentOptions },
              { name: 'sortOrder', label: L('الترتيب', 'Sort order'), type: 'number', defaultValue: 0, min: 0 },
            ]}
          />
        </Card>
      )}

      {canCatalog && (
        <div className="card-grid">
          <Card title={L('العلامات التجارية', 'Brands')}>
            <div className="stack">
              {tax.brands.map((b) => (
                <details key={b.id}>
                  <summary>
                    {b.name} {!b.active && <Badge tone="danger">{L('غير فعالة', 'Inactive')}</Badge>} {(b as { imageKey?: string | null }).imageKey ? <Badge tone="ok">{L('بصورة', 'Image')}</Badge> : null}
                  </summary>
                  <div style={{ paddingBlockStart: 8 }}>
                    <OwnerImage
                      endpoint={`/api/v1/admin/brands/${b.id}/image`}
                      previewUrl={`/api/v1/public/brands/${b.id}/image`}
                      hasImage={Boolean((b as { imageKey?: string | null }).imageKey)}
                      locale={locale}
                      label={b.name}
                    />
                  </div>
                </details>
              ))}
            </div>
            <ApiForm
              endpoint="/api/v1/admin/taxonomy"
              submitLabel={L('إضافة علامة', 'Add brand')}
              successMessage={L('تمت إضافة العلامة.', 'Brand added.')}
              fields={[{ name: 'name', label: L('اسم العلامة', 'Brand name'), required: true }]}
            />
          </Card>
          <Card title={L('الجودات', 'Qualities')}>
            <ul>
              {tax.qualities.map((q) => (
                <li key={q.id}>
                  <code>{q.code}</code> — {locale === 'ar' ? q.nameAr : q.nameEn}
                </li>
              ))}
            </ul>
            <ApiForm
              endpoint="/api/v1/admin/taxonomy?kind=quality"
              submitLabel={L('إضافة جودة', 'Add quality')}
              successMessage={L('تمت إضافة الجودة.', 'Quality added.')}
              fields={[
                { name: 'code', label: L('الرمز (UPPER_SNAKE_CASE)', 'Code (UPPER_SNAKE_CASE)'), required: true, dir: 'ltr' },
                { name: 'nameAr', label: L('الاسم بالعربية', 'Name (Arabic)'), required: true, dir: 'rtl' },
                { name: 'nameEn', label: L('الاسم بالإنجليزية', 'Name (English)'), required: true },
                { name: 'sortOrder', label: L('الترتيب', 'Sort order'), type: 'number', defaultValue: 0, min: 0 },
              ]}
            />
          </Card>
        </div>
      )}
    </>
  );
}
