import { PageHeader, Card, EmptyState, Badge } from '@/components/ui';
import { PERMISSIONS } from '@/lib/rbac';
import { listMerchandising } from '@/modules/catalog/merchandising';
import { gatePage } from '../_lib/gate';
import { FeaturedRow } from '../_components/FeaturedRow';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

export default async function AdminMerchandising({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const g = await gatePage(PERMISSIONS.CATALOG_VIEW, '/admin/merchandising');
  if (!g.ok) return g.node;
  const { L, locale, user } = g;
  const sp = await searchParams;
  const canEdit = user.permissions.has(PERMISSIONS.CATALOG_MANAGE);
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const featuredOnly = sp.featured === '1';
  const { total, rows } = await listMerchandising({ q: sp.q, featuredOnly, page, pageSize: PAGE_SIZE });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (p: number) => {
    const u = new URLSearchParams();
    if (sp.q) u.set('q', sp.q);
    if (featuredOnly) u.set('featured', '1');
    if (p > 1) u.set('page', String(p));
    const s = u.toString();
    return s ? `/admin/merchandising?${s}` : '/admin/merchandising';
  };

  return (
    <>
      <PageHeader
        title={L('المنتجات المميزة', 'Featured products')}
        subtitle={L(
          'تمييز المنتجات يظهر في الصفحة الرئيسية. لا يغيّر السعر أو المخزون أو قواعد الطلب.',
          'Featured flags show on the homepage. They do not change price, stock or ordering rules.',
        )}
      />
      <Card>
        <form method="get" className="form-row" role="search" style={{ marginBlockEnd: 12 }}>
          <div className="field">
            <label htmlFor="m-q">{L('بحث بالـ SKU أو الاسم', 'Search by SKU or name')}</label>
            <input id="m-q" name="q" type="search" defaultValue={sp.q ?? ''} />
          </div>
          <div className="field" style={{ flex: '0 0 auto' }}>
            <label className="row" style={{ fontWeight: 400 }}>
              <input type="checkbox" name="featured" value="1" defaultChecked={featuredOnly} /> {L('المميزة فقط', 'Featured only')}
            </label>
          </div>
          <button className="btn btn-primary" type="submit">
            {L('تطبيق', 'Apply')}
          </button>
        </form>
        {rows.length === 0 ? (
          <EmptyState>{L('لا توجد نتائج.', 'No results.')}</EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>{L('المنتج', 'Product')}</th>
                  <th>{L('التمييز', 'Featured')}</th>
                  <th>{L('الترتيب', 'Order')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <FeaturedRow
                    key={r.id}
                    skuId={r.id}
                    sku={r.sku}
                    name={locale === 'ar' ? r.nameAr : r.nameEn}
                    featured={r.featured}
                    featuredOrder={r.featuredOrder}
                    canEdit={canEdit}
                    locale={locale}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="pagination">
          <span className="muted">{L(`${total} منتج`, `${total} products`)}</span>
          <nav aria-label={L('ترقيم', 'Pagination')}>
            {page > 1 && <a href={qs(page - 1)}>{L('السابق', 'Previous')}</a>} <Badge>{page} / {totalPages}</Badge>{' '}
            {page < totalPages && <a href={qs(page + 1)}>{L('التالي', 'Next')}</a>}
          </nav>
        </div>
      </Card>
    </>
  );
}
