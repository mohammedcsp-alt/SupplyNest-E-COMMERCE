import Link from 'next/link';
import { PageHeader, Card, StatusBadge, EmptyState, Money, Badge } from '@/components/ui';
import { ActionButton } from '@/components/forms';
import { formatDateTime } from '@/lib/time';
import { PERMISSIONS } from '@/lib/rbac';
import { AppError } from '@/lib/errors';
import { getAdminOrder } from '@/modules/admin/orders';
import { gatePage, isUuid, NotFoundCard } from '../../_lib/gate';

export const dynamic = 'force-dynamic';

export default async function AdminOrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const g = await gatePage(PERMISSIONS.ORDER_VIEW, '/admin/orders');
  if (!g.ok) return g.node;
  const { L, locale, user, prices } = g;
  const { id } = await params;
  if (!isUuid(id)) {
    return <NotFoundCard message={L('لا يوجد سجل بهذا المعرّف.', 'No record with this identifier.')} />;
  }
  let o;
  try {
    o = await getAdminOrder(id, prices);
  } catch (err) {
    if (err instanceof AppError && err.code === 'NOT_FOUND') {
      return (
        <>
          <PageHeader title={L('الطلب غير موجود', 'Order not found')} />
          <NotFoundCard message={L('لا يوجد طلب بهذا المعرّف.', 'No order with this identifier.')} />
          <Link href="/admin/orders">{L('العودة إلى الطلبات', 'Back to orders')}</Link>
        </>
      );
    }
    throw err;
  }
  const can = (p: string) => user.permissions.has(p);
  const pendingCancel = o.status === 'CANCELLATION_REQUESTED' && o.cancellation?.status === 'PENDING';
  const canCancelDecide = pendingCancel && can(PERMISSIONS.ORDER_CANCEL_APPROVE);
  const canHold = o.status === 'SUBMITTED' && can(PERMISSIONS.ORDER_EDIT_ADMIN);
  const canRelease = o.status === 'ON_HOLD_LOCAL' && can(PERMISSIONS.ORDER_EDIT_ADMIN);
  const canLock = o.status === 'SUBMITTED' && !o.fulfillmentLockedAt && can(PERMISSIONS.ORDER_LOCK_PREP);
  const base = `/api/v1/admin/orders/${o.id}`;

  return (
    <>
      <p>
        <Link href="/admin/orders">← {L('الطلبات', 'Orders')}</Link>
      </p>
      <PageHeader
        title={`${L('طلب', 'Order')} ${o.orderNumber}`}
        subtitle={`${o.customer.phone}${o.customer.displayName ? ` · ${o.customer.displayName}` : ''} · ${L('الإرسال', 'Submitted')} ${formatDateTime(o.submittedAt, locale)}`}
        actions={<StatusBadge status={o.status} />}
      />

      <div className="card-grid">
        <Card title={L('الحالة والتجهيز', 'Status and fulfillment')}>
          <dl>
            <dt className="muted">{L('الحالة المحلية', 'Local status')}</dt>
            <dd>{o.status.replace(/_/g, ' ')}</dd>
            <dt className="muted">{L('قفل التجهيز', 'Preparation lock')}</dt>
            <dd>{o.fulfillmentLockedAt ? `${L('مقفل منذ', 'locked at')} ${formatDateTime(o.fulfillmentLockedAt, locale)}` : L('غير مقفل', 'Not locked')}</dd>
            <dt className="muted">{L('مستوى السعر وقت الطلب', 'Price level at submission')}</dt>
            <dd>{o.priceLevelCode}</dd>
            <dt className="muted">{L('مهمة التجهيز', 'Fulfillment job')}</dt>
            <dd>
              {o.fulfillmentJob ? (
                <>
                  <StatusBadge status={o.fulfillmentJob.status} /> <span dir="ltr">{o.fulfillmentJob.prepDocumentNo}</span>{' '}
                  <Link href={`/fulfillment/jobs/${o.fulfillmentJob.id}`}>{L('فتح مهمة التجهيز', 'Open fulfillment job')}</Link>
                </>
              ) : (
                <span className="muted">{L('لم تُنشأ مهمة بعد', 'No job yet')}</span>
              )}
            </dd>
            <dt className="muted">{L('الشحن', 'Shipment')}</dt>
            <dd>{o.shipment ? `${o.shipment.courier} · ${o.shipment.deliveryStatus.replace(/_/g, ' ')}` : L('لم يُسلَّم بعد', 'Not handed over')}</dd>
          </dl>
        </Card>

        <Card title={L('إجراءات الإدارة', 'Administrative actions')}>
          <div className="stack">
            {!canCancelDecide && !canHold && !canRelease && !canLock && <EmptyState>{L('لا توجد إجراءات متاحة لهذه الحالة أو لصلاحياتك.', 'No actions available for this status or your permissions.')}</EmptyState>}
            {canCancelDecide && (
              <div>
                <h3>{L('طلب إلغاء من العميل', 'Customer cancellation request')}</h3>
                <p>
                  <strong>{L('السبب:', 'Reason:')}</strong> {o.cancellation?.reason}
                </p>
                <div className="row">
                  <ActionButton endpoint={`${base}/cancellation`} body={{ approve: true }} label={L('الموافقة على الإلغاء', 'Approve cancellation')} reasonLabel={L('ملاحظة القرار (3 أحرف على الأقل)', 'Decision note (at least 3 characters)')} confirmText={L('الموافقة تلغي الطلب وتفرج عن الحجوزات مرة واحدة. متابعة؟', 'Approval cancels the order and releases its reservations once. Continue?')} tone="danger" />
                  <ActionButton endpoint={`${base}/cancellation`} body={{ approve: false }} label={L('رفض الإلغاء', 'Reject cancellation')} reasonLabel={L('سبب الرفض (3 أحرف على الأقل)', 'Reason for rejection (at least 3 characters)')} tone="primary" />
                </div>
              </div>
            )}
            {canHold && <ActionButton endpoint={`${base}/hold`} body={{ on: true }} label={L('تعليق الطلب محلياً', 'Put order on hold')} reasonLabel={L('سبب التعليق (3 أحرف على الأقل)', 'Reason for hold (at least 3 characters)')} />}
            {canRelease && <ActionButton endpoint={`${base}/hold`} body={{ on: false }} label={L('رفع التعليق', 'Release hold')} reasonLabel={L('سبب رفع التعليق (3 أحرف على الأقل)', 'Reason for releasing the hold (at least 3 characters)')} tone="primary" />}
            {canLock && (
              <ActionButton
                endpoint={`${base}/lock-prep`}
                label={L('قفل للتجهيز', 'Lock for preparation')}
                reasonLabel={L('سبب القفل (3 أحرف على الأقل)', 'Reason for lock (at least 3 characters)')}
                confirmText={L('بعد القفل لا يمكن للعميل تعديل الطلب. متابعة؟', 'After locking, the customer can no longer edit this order. Continue?')}
                tone="primary"
              />
            )}
          </div>
        </Card>
      </div>

      <Card title={L('البنود', 'Items')}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{L('رمز SKU', 'SKU')}</th>
                <th>{L('الاسم', 'Title')}</th>
                <th className="num">{L('الكمية', 'Qty')}</th>
                {prices && <th className="num">{L('سعر الوحدة', 'Unit price')}</th>}
                {prices && <th className="num">{L('المجموع', 'Line total')}</th>}
              </tr>
            </thead>
            <tbody>
              {o.items.map((i) => (
                <tr key={i.id}>
                  <td dir="ltr">{i.sku}</td>
                  <td>
                    {i.title}
                    {i.quality && <div className="muted" style={{ fontSize: '0.85rem' }}>{i.quality}</div>}
                  </td>
                  <td className="num">{i.qty}</td>
                  {prices && (
                    <td className="num">
                      <Money value={i.unitPrice} locale={locale} />
                    </td>
                  )}
                  {prices && (
                    <td className="num">
                      <Money value={i.lineTotal} locale={locale} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {prices && (
          <p>
            <strong>{L('الإجمالي (COD):', 'Total (COD):')}</strong> <Money value={o.totalCod} locale={locale} /> · {L('الشحن', 'Shipping')} <Money value={o.shippingFee} locale={locale} />
          </p>
        )}
        {!prices && <p className="muted">{L('المبالغ تظهر لمن يملك صلاحية عرض الأسعار (price.view).', 'Amounts are shown to users with price.view.')}</p>}
      </Card>

      <Card title={L('الحجوزات', 'Reservations')}>
        {o.reservations.length === 0 ? (
          <EmptyState>{L('لا توجد حجوزات.', 'No reservations.')}</EmptyState>
        ) : (
          <ul>
            {o.reservations.map((r) => (
              <li key={r.id}>
                <span dir="ltr">{r.sku}</span> × {r.qty} — <StatusBadge status={r.status} /> {L('ينتهي', 'expires')} {formatDateTime(r.expiresAt, locale)}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={L('الفواتير', 'Invoices')}>
        {o.invoices.length === 0 ? (
          <EmptyState>{L('لا توجد فواتير.', 'No invoices.')}</EmptyState>
        ) : (
          <ul>
            {o.invoices.map((inv) => (
              <li key={inv.id}>
                <span dir="ltr">{inv.invoiceNumber}</span> · {L('مراجعة', 'rev.')} {inv.revision} · <Badge>{inv.status}</Badge>
                {prices && (
                  <>
                    {' '}
                    · <Money value={inv.grandTotal} locale={locale} />
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={L('سجل الأحداث', 'Events')}>
        {o.events.length === 0 ? (
          <EmptyState>{L('لا توجد أحداث.', 'No events.')}</EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{L('التاريخ', 'When')}</th>
                  <th>{L('الحدث', 'Event')}</th>
                  <th>{L('من → إلى', 'From → To')}</th>
                  <th>{L('السبب', 'Reason')}</th>
                </tr>
              </thead>
              <tbody>
                {o.events.map((e) => (
                  <tr key={e.id}>
                    <td>{formatDateTime(e.occurredAt, locale)}</td>
                    <td>{e.eventType}</td>
                    <td>{[e.fromStatus, e.toStatus].filter(Boolean).join(' → ') || '—'}</td>
                    <td>{e.reason ?? '—'}</td>
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
