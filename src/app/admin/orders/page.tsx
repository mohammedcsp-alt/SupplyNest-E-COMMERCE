import Link from 'next/link';
import { PageHeader, StatusBadge, Pagination, Money } from '@/components/ui';
import { formatDateTime } from '@/lib/time';
import { PERMISSIONS } from '@/lib/rbac';
import { ORDER_STATUSES_LIST } from '@/modules/admin/constants';
import { listAdminOrders } from '@/modules/admin/orders';
import { gatePage } from '../_lib/gate';
import '../css/operations.css';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

export default async function AdminOrders({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; page?: string }> }) {
  const g = await gatePage(PERMISSIONS.ORDER_VIEW, '/admin/orders');
  if (!g.ok) return g.node;
  const { L, locale, prices } = g;
  const sp = await searchParams;
  const status = (ORDER_STATUSES_LIST as readonly string[]).includes(sp.status ?? '') ? sp.status! : '';
  const q = (sp.q ?? '').trim().slice(0, 80);
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const { items, total } = await listAdminOrders({ status, q, page, pageSize: PAGE_SIZE }, prices);
  const filtered = Boolean(status || q);

  return (
    <div className="ops ops-orders">
      <PageHeader title={L('الطلبات', 'Orders')} subtitle={L('الحالة المحلية للطلب. حالة التجهيز تظهر بجانبها.', 'Local order status, with the fulfillment status alongside.')} />

      <div className="adm-kpis">
        <div className="adm-kpi">
          <span>{filtered ? L('الطلبات المطابقة', 'Matching orders') : L('إجمالي الطلبات', 'Total orders')}</span>
          <strong>{total}</strong>
        </div>
      </div>

      <form method="GET" className="adm-filters" role="search">
        <div className="field">
          <label htmlFor="ord-status">{L('الحالة', 'Status')}</label>
          <select id="ord-status" name="status" defaultValue={status}>
            <option value="">{L('الكل', 'All')}</option>
            {ORDER_STATUSES_LIST.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="ord-q">{L('رقم الطلب أو هاتف العميل', 'Order number or customer phone')}</label>
          <input id="ord-q" name="q" type="search" defaultValue={q} maxLength={80} />
        </div>
        <div className="adm-filter-actions">
          <button type="submit" className="btn btn-primary">{L('تصفية', 'Filter')}</button>
          {filtered && (
            <Link className="btn" href="/admin/orders">
              {L('مسح', 'Clear')}
            </Link>
          )}
        </div>
      </form>

      {items.length === 0 ? (
        <div className="adm-empty">{L('لا توجد طلبات مطابقة.', 'No matching orders.')}</div>
      ) : (
        <div className="table-wrap adm-table">
          <table>
            <thead>
              <tr>
                <th>{L('رقم الطلب', 'Order no.')}</th>
                <th>{L('العميل', 'Customer')}</th>
                <th>{L('الحالة', 'Status')}</th>
                <th>{L('التجهيز', 'Fulfillment')}</th>
                <th className="num">{L('البنود', 'Lines')}</th>
                {prices && <th className="num">{L('الإجمالي', 'Total')}</th>}
                <th>{L('أُرسل', 'Submitted')}</th>
                <th>
                  <span className="sr-only">{L('فتح', 'Open')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((o) => (
                <tr key={o.id}>
                  <td className="code">{o.orderNumber}</td>
                  <td>
                    <span className="code">{o.customerPhone}</span>
                    {o.customerName && <div className="ops-sub">{o.customerName}</div>}
                  </td>
                  <td>
                    <StatusBadge status={o.status} />
                    {o.cancellationStatus === 'PENDING' && <div className="ops-flag">{L('طلب إلغاء بانتظار القرار', 'Cancellation pending')}</div>}
                  </td>
                  <td>{o.fulfillmentStatus ? <StatusBadge status={o.fulfillmentStatus} /> : <span className="muted">{L('لم يبدأ', 'Not started')}</span>}</td>
                  <td className="num">{o.itemCount}</td>
                  {prices && (
                    <td className="num">
                      <Money value={o.totalCod} locale={locale} />
                    </td>
                  )}
                  <td>{formatDateTime(o.submittedAt, locale)}</td>
                  <td>
                    <div className="adm-row-actions">
                      <Link className="btn btn-small" href={`/admin/orders/${o.id}`}>
                        {L('فتح', 'Open')}
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} basePath="/admin/orders" params={{ status, q }} labels={{ prev: L('السابق', 'Previous'), next: L('التالي', 'Next'), of: 'of' }} />
    </div>
  );
}
