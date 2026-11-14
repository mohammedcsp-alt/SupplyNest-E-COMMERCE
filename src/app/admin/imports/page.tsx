import Link from 'next/link';
import { Badge, StatusBadge, EmptyState } from '@/components/ui';
import { formatDateTime } from '@/lib/time';
import { PERMISSIONS } from '@/lib/rbac';
import { db } from '@/lib/db';
import { gatePage } from '../_lib/gate';
import { ImportPanel } from '../_components/ImportPanel';
import '../css/catalog.css';

export const dynamic = 'force-dynamic';

const PRODUCT_COLUMNS = ['SKU', 'NAME_EN', 'NAME_AR', 'MODEL', 'BRAND', 'QUALITY', 'CATEGORY', 'PHYSICAL_STOCK', 'EXTRACTED_AT'];
const PRICE_COLUMNS = ['SKU', 'PRICE_LEVEL', 'PRICE'];

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
      <div className="adm-head">
        <div>
          <h1>{L('الاستيراد', 'Imports')}</h1>
          <p className="muted">
            {L('ارفع الملف للمعاينة أولاً. لا يُطبَّق أي تغيير قبل الاعتماد، والاعتماد يكون ذرياً (الكل أو لا شيء).', 'Upload to preview first. Nothing changes before commit, and commit is atomic (all or nothing).')}
          </p>
        </div>
        <div className="adm-head-actions">
          <a className="btn btn-small" href="/api/v1/admin/imports/templates/products">{L('قالب المنتجات (CSV)', 'Products template (CSV)')}</a>
          <a className="btn btn-small" href="/api/v1/admin/imports/templates/prices">{L('قالب الأسعار (CSV)', 'Prices template (CSV)')}</a>
        </div>
      </div>

      <div className="cat-grid">
        <section className="adm-section" aria-labelledby="imp-products-title">
          <header>
            <h2 id="imp-products-title">{L('استيراد المنتجات', 'Product import')}</h2>
          </header>
          <p className="cat-lede">{L('الأعمدة المطلوبة:', 'Required columns:')}</p>
          <ul className="imp-required" aria-label={L('الأعمدة المطلوبة', 'Required columns')}>
            {PRODUCT_COLUMNS.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <ImportPanel type="products" canCommit={canProducts} canOverride={canOverride} locale={locale} />
        </section>

        {canPrices && (
          <section className="adm-section" aria-labelledby="imp-prices-title">
            <header>
              <h2 id="imp-prices-title">{L('استيراد الأسعار', 'Price import')}</h2>
            </header>
            <p className="cat-lede">{L('الأعمدة:', 'Columns:')}</p>
            <ul className="imp-required" aria-label={L('أعمدة الأسعار', 'Price columns')}>
              {PRICE_COLUMNS.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <p className="cat-lede">{L('الأسعار أعداد صحيحة بالدينار.', 'Prices are whole IQD.')}</p>
            <ImportPanel type="prices" canCommit={canPrices} canOverride={false} locale={locale} />
          </section>
        )}
      </div>

      <section className="adm-section" aria-labelledby="imp-history-title">
        <header>
          <h2 id="imp-history-title">{L('السجل', 'History')}</h2>
          <span className="muted">{L('آخر 50 عملية', 'Latest 50 imports')}</span>
        </header>
        {history.length === 0 ? (
          <EmptyState>{L('لا توجد عمليات استيراد بعد.', 'No imports yet.')}</EmptyState>
        ) : (
          <div className="table-wrap adm-table">
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
                    <td>
                      <Badge>{b.type}</Badge>
                    </td>
                    <td className="cat-name">{b.filename}</td>
                    <td>
                      <StatusBadge status={b.status} />
                    </td>
                    <td>{b.type === 'PRODUCTS' && b.freshness ? <StatusBadge status={b.freshness} /> : <span className="muted">—</span>}</td>
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
      </section>
    </>
  );
}
