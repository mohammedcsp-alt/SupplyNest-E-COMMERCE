import Link from 'next/link';
import { PageHeader, Card, StatusBadge, EmptyState } from '@/components/ui';
import { formatDateTime } from '@/lib/time';
import { PERMISSIONS } from '@/lib/rbac';
import { db } from '@/lib/db';
import { gatePage } from '../_lib/gate';
import { ImportPanel } from '../_components/ImportPanel';

export const dynamic = 'force-dynamic';

export default async function AdminImports() {
  const g = await gatePage(PERMISSIONS.IMPORT_PREVIEW, '/admin/imports');
  if (!g.ok) return g.node;
  const { L, locale, user } = g;
  const canProducts = user.permissions.has(PERMISSIONS.IMPORT_COMMIT);
  const canPrices = user.permissions.has(PERMISSIONS.PRICE_EDIT);
  const canOverride = user.permissions.has(PERMISSIONS.IMPORT_OVERRIDE_STALE);
  const history = await db.importBatch.findMany({ orderBy: { createdAt: 'desc' }, take: 50, include: { _count: { select: { errors: true } } } });

  return (
    <>
      <PageHeader
        title={L('الاستيراد', 'Imports')}
        subtitle={L('ارفع الملف للمعاينة أولاً. لا يُطبَّق أي تغيير قبل الاعتماد، والاعتماد يكون ذرياً (الكل أو لا شيء).', 'Upload to preview first. Nothing changes before commit, and commit is atomic (all or nothing).')}
        actions={
          <span className="row">
            <a className="btn btn-small" href="/api/v1/admin/imports/templates/products">{L('قالب المنتجات (CSV)', 'Products template (CSV)')}</a>
            <a className="btn btn-small" href="/api/v1/admin/imports/templates/prices">{L('قالب الأسعار (CSV)', 'Prices template (CSV)')}</a>
          </span>
        }
      />

      <Card title={L('استيراد المنتجات', 'Product import')}>
        <p className="muted">{L('الأعمدة المطلوبة: SKU, NAME_EN, NAME_AR, MODEL, BRAND, QUALITY, CATEGORY, PHYSICAL_STOCK, EXTRACTED_AT.', 'Required columns: SKU, NAME_EN, NAME_AR, MODEL, BRAND, QUALITY, CATEGORY, PHYSICAL_STOCK, EXTRACTED_AT.')}</p>
        <ImportPanel type="products" canCommit={canProducts} canOverride={canOverride} locale={locale} />
      </Card>

      {canPrices && (
        <Card title={L('استيراد الأسعار', 'Price import')}>
          <p className="muted">{L('الأعمدة: SKU, PRICE_LEVEL, PRICE (أعداد صحيحة بالدينار).', 'Columns: SKU, PRICE_LEVEL, PRICE (whole IQD).')}</p>
          <ImportPanel type="prices" canCommit={canPrices} canOverride={false} locale={locale} />
        </Card>
      )}

      <Card title={L('السجل', 'History')}>
        {history.length === 0 ? (
          <EmptyState>{L('لا توجد عمليات استيراد بعد.', 'No imports yet.')}</EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{L('التاريخ', 'Created')}</th>
                  <th>{L('النوع', 'Type')}</th>
                  <th>{L('الملف', 'File')}</th>
                  <th>{L('الحالة', 'Status')}</th>
                  <th>{L('الحداثة', 'Freshness')}</th>
                  <th className="num">{L('أخطاء', 'Errors')}</th>
                  <th>{L('التفاصيل', 'Details')}</th>
                </tr>
              </thead>
              <tbody>
                {history.map((b) => (
                  <tr key={b.id}>
                    <td>{formatDateTime(b.createdAt, locale)}</td>
                    <td>{b.type}</td>
                    <td>{b.filename}</td>
                    <td>
                      <StatusBadge status={b.status} />
                    </td>
                    <td>{b.type === 'PRODUCTS' ? b.freshness : '—'}</td>
                    <td className="num">{b._count.errors}</td>
                    <td>
                      <Link href={`/admin/imports/${b.id}`}>{L('عرض', 'View')}</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
