import Link from 'next/link';
import { PageHeader, StatusBadge, EmptyState, Money, Badge } from '@/components/ui';
import { ActionButton } from '@/components/forms';
import { formatDateTime } from '@/lib/time';
import { PERMISSIONS } from '@/lib/rbac';
import { AppError } from '@/lib/errors';
import { getAdminOrder } from '@/modules/admin/orders';
import { gatePage, isUuid, NotFoundCard } from '../../_lib/gate';
import '../../css/operations.css';

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
        <div className="ops ops-order">
          <PageHeader title={L('الطلب غير موجود', 'Order not found')} />
          <NotFoundCard message={L('لا يوجد طلب بهذا المعرّف.', 'No order with this identifier.')} />
          <nav className="ops-back">
            <Link href="/admin/orders">{L('العودة إلى الطلبات', 'Back to orders')}</Link>
          </nav>
        </div>
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
    <div className="ops ops-order">
      <nav className="ops-back">
        <Link href="/admin/orders">← {L('الطلبات', 'Orders')}</Link>
      </nav>
      <PageHeader
        title={`${L('طلب', 'Order')} ${o.orderNumber}`}
        subtitle={`${o.customer.phone}${o.customer.displayName ? ` · ${o.customer.displayName}` : ''} · ${L('الإرسال', 'Submitted')} ${formatDateTime(o.submittedAt, locale)}`}
        actions={<StatusBadge status={o.status} />}
      />

      <div className="ops-grid">
        <section className="adm-section" aria-labelledby="ord-status-h">
          <header>
            <h2 id="ord-status-h">{L('الحالة والتجهيز', 'Status and fulfillment')}</h2>
          </header>
          <dl className="ops-facts">
            <div>
              <dt>{L('الحالة المحلية', 'Local status')}</dt>
              <dd>{o.status.replace(/_/g, ' ')}</dd>
            </div>
            <div>
              <dt>{L('قفل التجهيز', 'Preparation lock')}</dt>
              <dd>{o.fulfillmentLockedAt ? `${L('مقفل منذ', 'locked at')} ${formatDateTime(o.fulfillmentLockedAt, locale)}` : L('غير مقفل', 'Not locked')}</dd>
            </div>
            <div>
              <dt>{L('مستوى السعر وقت الطلب', 'Price level at submission')}</dt>
              <dd className="code">{o.priceLevelCode}</dd>
            </div>
            <div>
              <dt>{L('مهمة التجهيز', 'Fulfillment job')}</dt>
              <dd>
                {o.fulfillmentJob ? (
                  <>
                    <StatusBadge status={o.fulfillmentJob.status} /> <span className="code">{o.fulfillmentJob.prepDocumentNo}</span>{' '}
                    <Link href={`/fulfillment/jobs/${o.fulfillmentJob.id}`}>{L('فتح مهمة التجهيز', 'Open fulfillment job')}</Link>
                  </>
                ) : (
                  <span className="muted">{L('لم تُنشأ مهمة بعد', 'No job yet')}</span>
                )}
              </dd>
            </div>
            <div>
              <dt>{L('الشحن', 'Shipment')}</dt>
              <dd>{o.shipment ? `${o.shipment.courier} · ${o.shipment.deliveryStatus.replace(/_/g, ' ')}` : L('لم يُسلَّم بعد', 'Not handed over')}</dd>
            </div>
          </dl>
        </section>

        <section className="adm-section" aria-labelledby="ord-actions-h">
          <header>
            <h2 id="ord-actions-h">{L('إجراءات الإدارة', 'Administrative actions')}</h2>
          </header>
          <div className="ops-stack">
            {!canCancelDecide && !canHold && !canRelease && !canLock && <EmptyState>{L('لا توجد إجراءات متاحة لهذه الحالة أو لصلاحياتك.', 'No actions available for this status or your permissions.')}</EmptyState>}
            {canCancelDecide && (
              <section className="ops-action">
                <h3>{L('طلب إلغاء من العميل', 'Customer cancellation request')}</h3>
                <blockquote className="ops-reason">
                  <strong>{L('السبب:', 'Reason:')}</strong> {o.cancellation?.reason}
                </blockquote>
                <div className="ops-decision">
                  <details className="adm-confirm">
                    <summary>{L('الموافقة على الإلغاء', 'Approve cancellation')}</summary>
                    <p className="muted">{L('الموافقة تلغي الطلب وتفرج عن حجوزاته مرة واحدة.', 'Approval cancels the order and releases its reservations once.')}</p>
                    <ActionButton endpoint={`${base}/cancellation`} body={{ approve: true }} label={L('الموافقة على الإلغاء', 'Approve cancellation')} reasonLabel={L('ملاحظة القرار (3 أحرف على الأقل)', 'Decision note (at least 3 characters)')} confirmText={L('الموافقة تلغي الطلب وتفرج عن الحجوزات مرة واحدة. متابعة؟', 'Approval cancels the order and releases its reservations once. Continue?')} tone="danger" />
                  </details>
                  <ActionButton endpoint={`${base}/cancellation`} body={{ approve: false }} label={L('رفض الإلغاء', 'Reject cancellation')} reasonLabel={L('سبب الرفض (3 أحرف على الأقل)', 'Reason for rejection (at least 3 characters)')} tone="primary" />
                </div>
              </section>
            )}
            {canHold && (
              <section className="ops-action">
                <h3>{L('تعليق محلي', 'Local hold')}</h3>
                <ActionButton endpoint={`${base}/hold`} body={{ on: true }} label={L('تعليق الطلب محلياً', 'Put order on hold')} reasonLabel={L('سبب التعليق (3 أحرف على الأقل)', 'Reason for hold (at least 3 characters)')} />
              </section>
            )}
            {canRelease && (
              <section className="ops-action">
                <h3>{L('تعليق محلي', 'Local hold')}</h3>
                <ActionButton endpoint={`${base}/hold`} body={{ on: false }} label={L('رفع التعليق', 'Release hold')} reasonLabel={L('سبب رفع التعليق (3 أحرف على الأقل)', 'Reason for releasing the hold (at least 3 characters)')} tone="primary" />
              </section>
            )}
            {canLock && (
              <section className="ops-action">
                <h3>{L('قفل التجهيز', 'Preparation lock')}</h3>
                <details className="adm-confirm">
                  <summary>{L('قفل للتجهيز', 'Lock for preparation')}</summary>
                  <p className="muted">{L('بعد القفل لا يمكن للعميل تعديل الطلب.', 'After locking, the customer can no longer edit this order.')}</p>
                  <ActionButton
                    endpoint={`${base}/lock-prep`}
                    label={L('قفل للتجهيز', 'Lock for preparation')}
                    reasonLabel={L('سبب القفل (3 أحرف على الأقل)', 'Reason for lock (at least 3 characters)')}
                    confirmText={L('بعد القفل لا يمكن للعميل تعديل الطلب. متابعة؟', 'After locking, the customer can no longer edit this order. Continue?')}
                    tone="primary"
                  />
                </details>
              </section>
            )}
          </div>
        </section>
      </div>

      <section className="adm-section" aria-labelledby="ord-items-h">
        <header>
          <h2 id="ord-items-h">{L('البنود', 'Items')}</h2>
        </header>
        <div className="table-wrap adm-table">
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
                  <td className="code">{i.sku}</td>
                  <td>
                    {i.title}
                    {i.quality && <div className="ops-sub">{i.quality}</div>}
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
          <dl className="ops-totals">
            <div>
              <dt>{L('الإجمالي (COD)', 'Total (COD)')}</dt>
              <dd>
                <Money value={o.totalCod} locale={locale} />
              </dd>
            </div>
            <div>
              <dt>{L('الشحن', 'Shipping')}</dt>
              <dd>
                <Money value={o.shippingFee} locale={locale} />
              </dd>
            </div>
          </dl>
        )}
        {!prices && <p className="ops-note">{L('المبالغ تظهر لمن يملك صلاحية عرض الأسعار (price.view).', 'Amounts are shown to users with price.view.')}</p>}
      </section>

      <div className="ops-grid">
        <section className="adm-section" aria-labelledby="ord-res-h">
          <header>
            <h2 id="ord-res-h">{L('الحجوزات', 'Reservations')}</h2>
          </header>
          {o.reservations.length === 0 ? (
            <div className="adm-empty">{L('لا توجد حجوزات.', 'No reservations.')}</div>
          ) : (
            <ul className="ops-list">
              {o.reservations.map((r) => (
                <li key={r.id}>
                  <span className="code">{r.sku}</span> × {r.qty} <StatusBadge status={r.status} />
                  <div className="ops-sub">
                    {L('ينتهي', 'expires')} {formatDateTime(r.expiresAt, locale)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="adm-section" aria-labelledby="ord-inv-h">
          <header>
            <h2 id="ord-inv-h">{L('الفواتير', 'Invoices')}</h2>
          </header>
          {o.invoices.length === 0 ? (
            <div className="adm-empty">{L('لا توجد فواتير.', 'No invoices.')}</div>
          ) : (
            <ul className="ops-list">
              {o.invoices.map((inv) => (
                <li key={inv.id}>
                  <span className="code">{inv.invoiceNumber}</span> <Badge>{inv.status}</Badge>
                  <div className="ops-sub">
                    {L('مراجعة', 'rev.')} {inv.revision}
                    {prices && (
                      <>
                        {' · '}
                        <Money value={inv.grandTotal} locale={locale} />
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="adm-section" aria-labelledby="ord-events-h">
        <header>
          <h2 id="ord-events-h">{L('سجل الأحداث', 'Events')}</h2>
        </header>
        {o.events.length === 0 ? (
          <div className="adm-empty">{L('لا توجد أحداث.', 'No events.')}</div>
        ) : (
          <div className="table-wrap adm-table">
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
      </section>
    </div>
  );
}
