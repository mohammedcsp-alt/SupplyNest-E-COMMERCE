import Link from 'next/link';
import type { OrderStatus } from '@prisma/client';
import { currentLocale, localized } from '@/lib/i18n';
import { requireSignedIn } from '@/lib/page-guards';
import { listCustomerOrders } from '@/modules/commerce/orders';
import { Alert, EmptyState, Money, Pagination, PageHeader, StatusBadge } from '@/components/ui';
import { ORDER_STATUS_TEXT, fmtDate, pick } from '@/components/customer/shared';

export const dynamic = 'force-dynamic';

type SP = Record<string, string | undefined>;
const STATUSES = Object.keys(ORDER_STATUS_TEXT) as OrderStatus[];

export default async function OrdersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const locale = await currentLocale();
  const L = (ar: string, en: string) => localized(locale, ar, en);
  const sp = await searchParams;
  const user = await requireSignedIn('/orders');
  const title = L('طلباتي', 'My orders');

  if (user.userType !== 'CUSTOMER') {
    return (
      <section className="stack">
        <PageHeader title={title} />
        <Alert tone="error">{L('هذه الصفحة مخصصة لحسابات العملاء.', 'This page is for customer accounts only.')}</Alert>
      </section>
    );
  }

  const status = STATUSES.find((s) => s === sp.status);
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const pageSize = 20;
  // Suspended and pending customers keep read access to their history (OPEN-20).
  const { items, total } = await listCustomerOrders(user.id, { status, page, pageSize });

  return (
    <section className="stack">
      <PageHeader
        title={title}
        subtitle={
          user.status === 'SUSPENDED'
            ? L('حسابك معلّق. يمكنك الاطلاع على سجل طلباتك فقط.', 'Your account is suspended. You can view your order history only.')
            : L('تابع حالة طلباتك وتفاصيلها.', 'Track the status and details of your orders.')
        }
      />

      <form method="get" className="card" aria-label={L('تصفية الطلبات', 'Filter orders')}>
        <div className="form-row">
          <div className="field">
            <label htmlFor="orders-status">{L('الحالة', 'Status')}</label>
            <select id="orders-status" name="status" defaultValue={status ?? ''}>
              <option value="">{L('الكل', 'All')}</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {pick(locale, ORDER_STATUS_TEXT[s][0], ORDER_STATUS_TEXT[s][1])}
                </option>
              ))}
            </select>
          </div>
          <button className="btn btn-primary" type="submit">
            {L('تصفية', 'Filter')}
          </button>
        </div>
      </form>

      {items.length === 0 ? (
        <EmptyState>{L('لا توجد طلبات بعد.', 'No orders yet.')}</EmptyState>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">{L('رقم الطلب', 'Order number')}</th>
                <th scope="col">{L('التاريخ', 'Date')}</th>
                <th scope="col">{L('الحالة', 'Status')}</th>
                <th scope="col">{L('الإجمالي', 'Total')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((o) => (
                <tr key={o.id}>
                  <td>
                    <Link href={`/orders/${o.id}`} dir="ltr">
                      {o.orderNumber}
                    </Link>
                  </td>
                  <td>{fmtDate(o.submittedAt, locale)}</td>
                  <td>
                    <StatusBadge status={o.status} />
                  </td>
                  <td>
                    <Money value={o.totalCod} locale={locale} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        basePath="/orders"
        params={{ status: status }}
        labels={{ prev: L('السابق', 'Previous'), next: L('التالي', 'Next'), of: 'of' }}
      />
    </section>
  );
}
