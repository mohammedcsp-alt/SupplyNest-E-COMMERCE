import Link from 'next/link';
import { PageHeader, StatusBadge, EmptyState, Pagination } from '@/components/ui';
import { formatDateTime } from '@/lib/time';
import { PERMISSIONS } from '@/lib/rbac';
import { ORDER_STATUSES_LIST } from '@/modules/admin/constants';
import { listAdminOrders } from '@/modules/admin/orders';
import { gatePage } from '../_lib/gate';
import { Money } from '@/components/ui';

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

  return (
    <>
      <PageHeader title={L('الطلبات', 'Orders')} subtitle={L('الحالة المحلية للطلب. حالة التجهيز تظهر بجانبها.', 'Local order status, with the fulfillment status alongside.')} />
      <form method="GET" className="form-row" role="search" style={{ marginBlockEnd: 16 }}>
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
        <div className="field">
          <button type="submit" className="btn btn-primary">{L('تصفية', 'Filter')}</button>
        </div>
      </form>

      {items.length === 0 ? (
        <EmptyState>{L('لا توجد طلبات مطابقة.', 'No matching orders.')}</EmptyState>
      ) : (
        <div className="table-wrap">
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
                <th>{L('فتح', 'Open')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((o) => (
                <tr key={o.id}>
                  <td dir="ltr">{o.orderNumber}</td>
                  <td dir="ltr">
                    {o.customerPhone}
                    {o.customerName && <div className="muted" style={{ fontSize: '0.85rem' }}>{o.customerName}</div>}
                  </td>
                  <td>
                    <StatusBadge status={o.status} />
                    {o.cancellationStatus === 'PENDING' && <div className="muted" style={{ fontSize: '0.85rem' }}>{L('طلب إلغاء بانتظار القرار', 'Cancellation pending')}</div>}
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
                    <Link href={`/admin/orders/${o.id}`}>{L('فتح', 'Open')}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} basePath="/admin/orders" params={{ status, q }} labels={{ prev: L('السابق', 'Previous'), next: L('التالي', 'Next'), of: 'of' }} />
    </>
  );
}
