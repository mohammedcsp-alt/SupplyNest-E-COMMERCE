import Link from 'next/link';
import { notFound } from 'next/navigation';
import { currentLocale, localized } from '@/lib/i18n';
import { AccountShell } from '@/components/customer/AccountShell';
import { requireSignedIn } from '@/lib/page-guards';
import { canOrder } from '@/lib/session';
import { AppError } from '@/lib/errors';
import { getCustomerOrder } from '@/modules/commerce/orders';
import { Alert, Card, EmptyState, Money, PageHeader, StatusBadge } from '@/components/ui';
import { ApiForm } from '@/components/forms';
import { EditLines } from '@/components/customer/EditLines';
import { ReorderButton } from '@/components/customer/ReorderButton';
import { fmtDate, ORDER_STATUS_TEXT, pick } from '@/components/customer/shared';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Address = { label?: string | null; governorate?: string; area?: string | null; details?: string; recipientName?: string; recipientPhone?: string };

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const locale = await currentLocale();
  const L = (ar: string, en: string) => localized(locale, ar, en);
  const user = await requireSignedIn(`/orders/${id}`);
  if (!UUID.test(id)) notFound();

  if (user.userType !== 'CUSTOMER') {
    return (
      <section className="stack">
        <PageHeader title={L('الطلب', 'Order')} />
        <Alert tone="error">{L('هذه الصفحة مخصصة لحسابات العملاء.', 'This page is for customer accounts only.')}</Alert>
      </section>
    );
  }

  let order: Awaited<ReturnType<typeof getCustomerOrder>>;
  try {
    order = await getCustomerOrder(user.id, id);
  } catch (err) {
    if (err instanceof AppError && err.code === 'NOT_FOUND') notFound();
    throw err;
  }

  const priced = canOrder(user);
  const address = (order.address ?? null) as Address | null;
  const cancellable = order.status === 'SUBMITTED' || order.status === 'ON_HOLD_LOCAL';
  const statusLabel = ORDER_STATUS_TEXT[order.status];

  return (
    <AccountShell locale={locale} current="orders" isCustomer={user.userType === 'CUSTOMER'}>
      <p>
        <Link href="/orders">← {L('طلباتي', 'My orders')}</Link>
      </p>
      <PageHeader
        title={`${L('الطلب', 'Order')} ${order.orderNumber}`}
        subtitle={`${L('تاريخ التقديم:', 'Submitted:')} ${fmtDate(order.submittedAt, locale)}`}
        actions={
          <span className="row">
            <StatusBadge status={order.status} />
            {statusLabel && <span className="muted">{pick(locale, statusLabel[0], statusLabel[1])}</span>}
          </span>
        }
      />

      {order.status === 'CANCELLED' && <Alert tone="error">{L('هذا الطلب ملغى.', 'This order was cancelled.')}</Alert>}
      {order.status === 'SUBMITTED' && !order.editable && (
        <Alert tone="warn">{L('بدأ تجهيز الطلب، لذلك لم تعد التعديلات متاحة. يمكنك طلب الإلغاء.', 'Preparation has started, so edits are closed. You can request cancellation.')}</Alert>
      )}

      <div className="layout-split">
        <div className="stack">
          <Card title={L('الأصناف', 'Items')}>
            {order.editable && priced ? (
              <EditLines
                orderId={order.id}
                version={order.version}
                locale={locale}
                items={order.items.map((i) => ({ sku: i.sku, title: i.title, qty: i.qty, unitPrice: i.unitPrice, lineTotal: i.lineTotal }))}
              />
            ) : order.items.length === 0 ? (
              <EmptyState>{L('لا توجد أصناف.', 'No items.')}</EmptyState>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">{L('الصنف', 'Item')}</th>
                      <th scope="col">{L('رمز SKU', 'SKU')}</th>
                      <th scope="col">{L('الكمية', 'Qty')}</th>
                      <th scope="col">{L('سعر الوحدة', 'Unit price')}</th>
                      <th scope="col">{L('الإجمالي', 'Line total')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.items.map((i) => (
                      <tr key={i.id}>
                        <td>{i.title}</td>
                        <td dir="ltr">{i.sku}</td>
                        <td>{i.qty}</td>
                        <td>
                          <Money value={i.unitPrice} locale={locale} />
                        </td>
                        <td>
                          <Money value={i.lineTotal} locale={locale} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title={L('الجدول الزمني', 'Timeline')}>
            {order.events.length === 0 ? (
              <EmptyState>{L('لا توجد أحداث.', 'No events yet.')}</EmptyState>
            ) : (
              <ol className="stack" style={{ paddingInlineStart: 20 }}>
                {order.events.map((e, idx) => (
                  <li key={`${e.occurredAt.toString()}-${idx}`}>
                    <div>
                      <strong>{e.type.replace(/_/g, ' ')}</strong>
                      {e.from || e.to ? <span className="muted"> · {[e.from, e.to].filter(Boolean).join(' → ')}</span> : null}
                    </div>
                    <div className="muted" style={{ fontSize: '0.9rem' }}>
                      {fmtDate(e.occurredAt, locale)}
                      {e.reason ? ` · ${e.reason}` : ''}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <aside className="stack">
          <Card title={L('الملخص', 'Summary')}>
            <dl className="stack" style={{ margin: 0, display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '6px 12px' }}>
              <dt>{L('المجموع الفرعي', 'Subtotal')}</dt>
              <dd style={{ margin: 0 }}>
                <Money value={order.subtotal} locale={locale} />
              </dd>
              <dt>{L('رسوم التوصيل', 'Delivery fee')}</dt>
              <dd style={{ margin: 0 }}>
                <Money value={order.shippingFee} locale={locale} />
              </dd>
              <dt style={{ fontWeight: 700 }}>{L('الإجمالي (الدفع عند الاستلام)', 'Total (cash on delivery)')}</dt>
              <dd style={{ margin: 0, fontWeight: 700 }}>
                <Money value={order.totalCod} locale={locale} />
              </dd>
            </dl>
          </Card>

          <Card title={L('عنوان التوصيل', 'Delivery address')}>
            {address ? (
              <div className="stack" style={{ gap: 4 }}>
                <div>{address.recipientName}</div>
                <div dir="ltr" style={{ textAlign: 'start' }}>
                  {address.recipientPhone}
                </div>
                <div className="muted">
                  {[address.governorate, address.area].filter(Boolean).join(' — ')}
                </div>
                <div>{address.details}</div>
              </div>
            ) : (
              <EmptyState>{L('لا يتوفر عنوان.', 'No address recorded.')}</EmptyState>
            )}
          </Card>

          {order.cancellation ? (
            <Card title={L('طلب الإلغاء', 'Cancellation')}>
              <div className="stack" style={{ gap: 6 }}>
                <StatusBadge status={order.cancellation.status} />
                <div>
                  <span className="muted">{L('السبب:', 'Reason:')}</span> {order.cancellation.reason}
                </div>
                {order.cancellation.decisionNote && (
                  <div>
                    <span className="muted">{L('ملاحظة القرار:', 'Decision note:')}</span> {order.cancellation.decisionNote}
                  </div>
                )}
              </div>
            </Card>
          ) : cancellable ? (
            <Card title={L('طلب إلغاء الطلب', 'Request cancellation')}>
              <p className="muted" style={{ marginBlockStart: 0 }}>
                {L('الإلغاء لا يتم مباشرة، بل تراجعه الإدارة. اذكر السبب (3 أحرف على الأقل).', 'Cancellations are not immediate; an administrator reviews the request. Give a reason (at least 3 characters).')}
              </p>
              <ApiForm
                endpoint={`/api/v1/orders/${order.id}/cancel-request`}
                submitLabel={L('إرسال طلب الإلغاء', 'Send cancellation request')}
                busyLabel={L('جاري الإرسال…', 'Sending…')}
                successMessage={L('تم إرسال طلب الإلغاء.', 'Cancellation request sent.')}
                fields={[{ name: 'reason', label: L('السبب', 'Reason'), type: 'textarea', required: true }]}
              />
            </Card>
          ) : null}

          {priced && (
            <Card title={L('إعادة الطلب', 'Reorder')}>
              <p className="muted" style={{ marginBlockStart: 0 }}>
                {L('تُضاف الأصناف إلى السلة بالأسعار والتوفر الحاليين. الطلب الأصلي لا يتغيّر.', 'Items are added to your cart at current prices and availability. This order is not changed.')}
              </p>
              <ReorderButton orderId={order.id} locale={locale} />
            </Card>
          )}
        </aside>
      </div>
    </AccountShell>
  );
}
