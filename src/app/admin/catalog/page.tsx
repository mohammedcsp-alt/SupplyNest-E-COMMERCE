import Link from 'next/link';
import { PageHeader, Card, EmptyState, Pagination, Badge } from '@/components/ui';
import { ApiForm } from '@/components/forms';
import { PERMISSIONS } from '@/lib/rbac';
import { db } from '@/lib/db';
import { availableOf } from '@/modules/inventory/inventory';
import { gatePage } from '../_lib/gate';
import { categoryOptions, loadTaxonomyOptions } from '../_lib/taxonomy';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

export default async function AdminCatalog({ searchParams }: { searchParams: Promise<{ q?: string; published?: string; page?: string }> }) {
  const g = await gatePage(PERMISSIONS.CATALOG_VIEW, '/admin/catalog');
  if (!g.ok) return g.node;
  const { L, user } = g;
  const sp = await searchParams;
  const q = (sp.q ?? '').trim().slice(0, 100);
  const published = sp.published === 'true' || sp.published === 'false' ? sp.published : '';
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const where = {
    deletedAt: null,
    ...(published ? { published: published === 'true' } : {}),
    ...(q ? { OR: [{ sku: { contains: q.toUpperCase() } }, { nameEn: { contains: q, mode: 'insensitive' as const } }, { nameAr: { contains: q } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    db.sku.findMany({ where, orderBy: { sku: 'asc' }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { category: true, inventory: true, images: { select: { id: true } } } }),
    db.sku.count({ where }),
  ]);
  const tax = await loadTaxonomyOptions();
  const canManage = user.permissions.has(PERMISSIONS.CATALOG_MANAGE);

  return (
    <>
      <PageHeader title={L('الكتالوج', 'Catalog')} subtitle={L('إدارة المنتجات (SKU). الأسعار لا تظهر في هذه القائمة.', 'Manage SKUs. Prices are not shown in this list.')} />
      <form method="GET" className="form-row" role="search" style={{ marginBlockEnd: 16 }}>
        <div className="field">
          <label htmlFor="cat-q">{L('بحث (رمز أو اسم)', 'Search (code or name)')}</label>
          <input id="cat-q" name="q" type="search" defaultValue={q} maxLength={100} />
        </div>
        <div className="field">
          <label htmlFor="cat-pub">{L('النشر', 'Publication')}</label>
          <select id="cat-pub" name="published" defaultValue={published}>
            <option value="">{L('الكل', 'All')}</option>
            <option value="true">{L('منشور', 'Published')}</option>
            <option value="false">{L('غير منشور', 'Unpublished')}</option>
          </select>
        </div>
        <div className="field">
          <button type="submit" className="btn btn-primary">{L('تصفية', 'Filter')}</button>
        </div>
      </form>

      {rows.length === 0 ? (
        <EmptyState>{L('لا توجد منتجات مطابقة.', 'No matching SKUs.')}</EmptyState>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{L('رمز SKU', 'SKU')}</th>
                <th>{L('الاسم', 'Name')}</th>
                <th>{L('الفئة', 'Category')}</th>
                <th>{L('منشور', 'Published')}</th>
                <th>{L('فعال', 'Active')}</th>
                <th className="num">{L('المتاح', 'Available')}</th>
                <th className="num">{L('الصور', 'Images')}</th>
                <th>{L('فتح', 'Open')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td dir="ltr">{s.sku}</td>
                  <td>
                    {s.nameEn}
                    <div className="muted" dir="rtl" style={{ fontSize: '0.9rem' }}>{s.nameAr}</div>
                  </td>
                  <td>{s.category.nameEn}</td>
                  <td>{s.published ? <Badge tone="ok">{L('نعم', 'Yes')}</Badge> : <Badge>{L('لا', 'No')}</Badge>}</td>
                  <td>{s.active ? L('نعم', 'Yes') : L('لا', 'No')}</td>
                  <td className="num">{s.inventory ? availableOf(s.inventory.physicalOnHand, s.inventory.reservedQty) : 0}</td>
                  <td className="num">{s.images.length}</td>
                  <td>
                    <Link href={`/admin/catalog/${s.id}`}>{L('تحرير', 'Edit')}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} basePath="/admin/catalog" params={{ q, published }} labels={{ prev: L('السابق', 'Previous'), next: L('التالي', 'Next'), of: 'of' }} />

      {canManage && (
        <Card title={L('إضافة موديل', 'Add model')}>
          <p className="muted">{L('الموديل تجميع اختياري للمنتجات، ولا يلزم اختياره عند إنشاء SKU.', 'A model is an optional grouping of SKUs; it is not required when creating a SKU.')}</p>
          <ApiForm
            endpoint="/api/v1/admin/models"
            submitLabel={L('إضافة الموديل', 'Add model')}
            successMessage={L('تمت إضافة الموديل.', 'Model added.')}
            fields={[
              { name: 'name', label: L('اسم الموديل', 'Model name'), required: true },
              { name: 'brandId', label: L('العلامة التجارية (اختياري)', 'Brand (optional)'), type: 'select', options: tax.brands.map((b) => ({ value: b.id, label: b.name })) },
            ]}
          />
        </Card>
      )}

      {canManage && (
        <Card title={L('إضافة SKU جديد', 'Create SKU')}>
          <ApiForm
            endpoint="/api/v1/admin/skus"
            submitLabel={L('إنشاء SKU', 'Create SKU')}
            successMessage={L('تم إنشاء SKU.', 'SKU created.')}
            successHref="/admin/catalog"
            fields={[
              { name: 'sku', label: L('رمز SKU', 'SKU code'), required: true, help: L('أحرف لاتينية وأرقام و . _ - فقط (يُحوَّل إلى أحرف كبيرة).', 'Latin letters, digits and . _ - only (stored uppercase).'), dir: 'ltr' },
              { name: 'categoryId', label: L('الفئة', 'Category'), type: 'select', required: true, options: categoryOptions(tax.categories, g.locale) },
              { name: 'brandId', label: L('العلامة التجارية', 'Brand'), type: 'select', options: tax.brands.map((b) => ({ value: b.id, label: b.name })) },
              { name: 'modelId', label: L('الموديل', 'Model'), type: 'select', options: tax.models.map((m) => ({ value: m.id, label: m.name })) },
              { name: 'qualityId', label: L('الجودة', 'Quality'), type: 'select', options: tax.qualities.map((q2) => ({ value: q2.id, label: g.locale === 'ar' ? q2.nameAr : q2.nameEn })) },
              { name: 'nameAr', label: L('الاسم بالعربية', 'Name (Arabic)'), required: true, dir: 'rtl' },
              { name: 'nameEn', label: L('الاسم بالإنجليزية', 'Name (English)'), required: true },
              { name: 'descriptionAr', label: L('الوصف بالعربية', 'Description (Arabic)'), type: 'textarea', dir: 'rtl' },
              { name: 'descriptionEn', label: L('الوصف بالإنجليزية', 'Description (English)'), type: 'textarea' },
              { name: 'unit', label: L('وحدة القياس', 'Unit'), defaultValue: 'PCS', help: L('مثال: PCS أو BOX.', 'For example PCS or BOX.') },
              { name: 'published', label: L('منشور للعملاء', 'Published to customers'), type: 'checkbox', defaultValue: false },
              { name: 'active', label: L('فعال', 'Active'), type: 'checkbox', defaultValue: true },
            ]}
          />
        </Card>
      )}
    </>
  );
}
