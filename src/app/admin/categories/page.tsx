import type { ReactNode } from 'react';
import { Badge, EmptyState } from '@/components/ui';
import { ApiForm } from '@/components/forms';
import { PERMISSIONS } from '@/lib/rbac';
import { db } from '@/lib/db';
import { gatePage } from '../_lib/gate';
import { categoryOptions, loadTaxonomyOptions, type CategoryRow } from '../_lib/taxonomy';
import { NullableJsonForm } from '../_components/NullableJsonForm';
import { AttributeDefForm } from '../_components/AttributeDefForm';
import { OwnerImage } from '../_components/OwnerImage';
import '../css/catalog.css';

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
  const inactiveCategories = categories.filter((c) => !c.active).length;

  const renderNode = (c: CategoryRow, depth: number, seen: Set<string>): ReactNode => {
    if (seen.has(c.id)) return null;
    seen.add(c.id);
    const kids = childrenOf.get(c.id) ?? [];
    const attrs = attrByCat.get(c.id) ?? [];
    return (
      <li key={c.id}>
        <div className="cat-node">
          <div className="cat-node-head">
            <strong>{locale === 'ar' ? c.nameAr : c.nameEn}</strong>
            <span className="cat-code">{c.slug}</span>
            {!c.active && <Badge tone="danger">{L('غير فعال', 'Inactive')}</Badge>}
            <span className="cat-node-meta">{L(`المستوى ${depth + 1}`, `Level ${depth + 1}`)}</span>
            <span className="cat-node-meta">{L(`${attrs.length} خاصية`, `${attrs.length} attributes`)}</span>
            {kids.length > 0 && <span className="cat-node-meta">{L(`${kids.length} فرعية`, `${kids.length} subcategories`)}</span>}
          </div>
          {canCategory && (
            <details className="cat-owner-image">
              <summary>{L('صورة الفئة', 'Category image')}</summary>
              <div className="cat-node-body">
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
            <div className="cat-node-body">
              {canCategory && (
                <div className="cat-form-grid">
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
                </div>
              )}
              <div>
                <h3 className="cat-subhead">{L('خصائص الفئة', 'Category attributes')}</h3>
                {attrs.length === 0 ? (
                  <EmptyState>{L('لا توجد خصائص.', 'No attributes.')}</EmptyState>
                ) : (
                  <ul className="cat-attr-list">
                    {attrs.map((a) => (
                      <li key={a.id}>
                        <code>{a.key}</code>
                        <span>{locale === 'ar' ? a.labelAr : a.labelEn}</span>
                        <Badge>{a.dataType}</Badge>
                        {a.unit ? <span className="muted">{`(${a.unit})`}</span> : null}
                        {Array.isArray(a.options) && a.options.length ? <span className="muted">{(a.options as string[]).join(', ')}</span> : null}
                      </li>
                    ))}
                  </ul>
                )}
                {canCategory && (
                  <div className="cat-form-block">
                    <h3>{L('إضافة أو تحديث خاصية', 'Add or update an attribute')}</h3>
                    <AttributeDefForm categoryId={c.id} locale={locale} />
                  </div>
                )}
              </div>
            </div>
          </details>
        </div>
        {kids.length > 0 && <ul>{kids.map((k) => renderNode(k, depth + 1, seen))}</ul>}
      </li>
    );
  };

  const roots = childrenOf.get(null) ?? [];
  const seen = new Set<string>();

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>{L('الفئات والعلامات والجودات', 'Categories, brands and qualities')}</h1>
          <p className="muted">{L('شجرة الفئات غير محدودة العمق. الخصائص تُعرَّف لكل فئة.', 'Category tree has unlimited depth. Attributes are defined per category.')}</p>
        </div>
      </div>

      <div className="adm-kpis">
        <div className="adm-kpi">
          <strong>{categories.length}</strong>
          <span>{L('الفئات', 'Categories')}</span>
        </div>
        <div className={`adm-kpi${inactiveCategories > 0 ? ' is-warn' : ''}`}>
          <strong>{inactiveCategories}</strong>
          <span>{L('فئات غير فعالة', 'Inactive categories')}</span>
        </div>
        <div className="adm-kpi">
          <strong>{attributes.length}</strong>
          <span>{L('تعريفات الخصائص', 'Attribute definitions')}</span>
        </div>
        <div className="adm-kpi">
          <strong>{tax.brands.length}</strong>
          <span>{L('العلامات التجارية', 'Brands')}</span>
        </div>
        <div className="adm-kpi">
          <strong>{tax.qualities.length}</strong>
          <span>{L('الجودات', 'Qualities')}</span>
        </div>
      </div>

      <section className="adm-section" aria-labelledby="cat-tree-title">
        <header>
          <h2 id="cat-tree-title">{L('شجرة الفئات', 'Category tree')}</h2>
          <span className="muted">{L('افتح الفئة لتعديلها أو تعديل خصائصها', 'Open a category to edit it or its attributes')}</span>
        </header>
        {categories.length === 0 ? (
          <EmptyState>{L('لا توجد فئات بعد.', 'No categories yet.')}</EmptyState>
        ) : (
          <ul className="cat-tree">{roots.map((r) => renderNode(r, 0, seen))}</ul>
        )}
      </section>

      {canCategory && (
        <section className="adm-section" aria-labelledby="cat-add-title">
          <header>
            <h2 id="cat-add-title">{L('إضافة فئة', 'Add category')}</h2>
          </header>
          <div className="cat-form-grid">
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
          </div>
        </section>
      )}

      {canCatalog && (
        <div className="cat-grid">
          <section className="adm-section" aria-labelledby="cat-brands-title">
            <header>
              <h2 id="cat-brands-title">{L('العلامات التجارية', 'Brands')}</h2>
              <span className="muted">{L(`${tax.brands.length} علامة`, `${tax.brands.length} brands`)}</span>
            </header>
            {tax.brands.length === 0 ? (
              <EmptyState>{L('لا توجد علامات تجارية بعد.', 'No brands yet.')}</EmptyState>
            ) : (
              <div className="cat-brand-list">
                {tax.brands.map((b) => (
                  <details key={b.id}>
                    <summary>
                      <span>{b.name}</span>
                      {!b.active && <Badge tone="danger">{L('غير فعالة', 'Inactive')}</Badge>}
                      {(b as { imageKey?: string | null }).imageKey ? <Badge tone="ok">{L('بصورة', 'Image')}</Badge> : null}
                    </summary>
                    <div>
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
            )}
            <div className="cat-form-grid">
              <ApiForm
                endpoint="/api/v1/admin/taxonomy"
                submitLabel={L('إضافة علامة', 'Add brand')}
                successMessage={L('تمت إضافة العلامة.', 'Brand added.')}
                fields={[{ name: 'name', label: L('اسم العلامة', 'Brand name'), required: true }]}
              />
            </div>
          </section>

          <section className="adm-section" aria-labelledby="cat-quality-title">
            <header>
              <h2 id="cat-quality-title">{L('الجودات', 'Qualities')}</h2>
              <span className="muted">{L(`${tax.qualities.length} جودة`, `${tax.qualities.length} qualities`)}</span>
            </header>
            {tax.qualities.length === 0 ? (
              <EmptyState>{L('لا توجد جودات بعد.', 'No qualities yet.')}</EmptyState>
            ) : (
              <div className="table-wrap adm-table">
                <table>
                  <thead>
                    <tr>
                      <th>{L('الرمز', 'Code')}</th>
                      <th>{L('الاسم', 'Name')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tax.qualities.map((q) => (
                      <tr key={q.id}>
                        <td className="code">{q.code}</td>
                        <td>{locale === 'ar' ? q.nameAr : q.nameEn}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="cat-form-grid">
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
            </div>
          </section>
        </div>
      )}
    </>
  );
}
