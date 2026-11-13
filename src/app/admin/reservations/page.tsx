import { PageHeader, Card, StatusBadge, EmptyState, Badge } from '@/components/ui';
import { ApiForm, ActionButton } from '@/components/forms';
import { formatDateTime } from '@/lib/time';
import { PERMISSIONS } from '@/lib/rbac';
import { db } from '@/lib/db';
import { RESERVATION_STATUSES_LIST } from '@/modules/admin/constants';
import { gatePage } from '../_lib/gate';

export const dynamic = 'force-dynamic';

const LIVE = ['ACTIVE', 'REVIEW_REQUIRED', 'EXTENDED'];

export default async function AdminReservations({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const g = await gatePage(PERMISSIONS.RESERVATION_VIEW, '/admin/reservations');
  if (!g.ok) return g.node;
  const { L, locale, user } = g;
  const sp = await searchParams;
  const status = (RESERVATION_STATUSES_LIST as readonly string[]).includes(sp.status ?? '') ? sp.status! : '';
  const canManage = user.permissions.has(PERMISSIONS.RESERVATION_MANAGE);
  const rows = await db.inventoryReservation.findMany({
    where: status ? { status: status as (typeof RESERVATION_STATUSES_LIST)[number] } : {},
    orderBy: [{ status: 'asc' }, { expiresAt: 'asc' }],
    take: 200,
    include: { sku: { select: { sku: true, nameEn: true } }, order: { select: { orderNumber: true } } },
  });
  const reviewCount = await db.inventoryReservation.count({ where: { status: 'REVIEW_REQUIRED' } });

  return (
    <>
      <PageHeader
        title={L('الحجوزات', 'Reservations')}
        subtitle={L(`الحجوزات التي تحتاج مراجعة: ${reviewCount}. لا يُفرج عن الحجز تلقائياً؛ القرار يدوي ويُسجَّل السبب.`, `Reservations needing review: ${reviewCount}. Nothing is released automatically; each decision is manual with a reason.`)}
        actions={
          canManage ? (
            <ActionButton endpoint="/api/v1/admin/reservations/sweep" label={L('تشغيل مراجعة الانتهاء', 'Run expiry review')} confirmText={L('تحويل الحجوزات المنتهية إلى مراجعة (لا يتم الإفراج عنها). متابعة؟', 'Move expired reservations to review (they are not released). Continue?')} />
          ) : undefined
        }
      />
      <form method="GET" className="form-row" style={{ marginBlockEnd: 16 }}>
        <div className="field">
          <label htmlFor="res-status">{L('الحالة', 'Status')}</label>
          <select id="res-status" name="status" defaultValue={status}>
            <option value="">{L('الكل', 'All')}</option>
            {RESERVATION_STATUSES_LIST.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <button type="submit" className="btn btn-primary">{L('تصفية', 'Filter')}</button>
        </div>
      </form>

      {rows.length === 0 ? (
        <EmptyState>{L('لا توجد حجوزات.', 'No reservations.')}</EmptyState>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{L('الطلب', 'Order')}</th>
                <th>{L('رمز SKU', 'SKU')}</th>
                <th className="num">{L('الكمية', 'Qty')}</th>
                <th>{L('الحالة', 'Status')}</th>
                <th>{L('ينتهي', 'Expires')}</th>
                <th>{L('ملاحظة المراجعة', 'Review note')}</th>
                <th>{L('إجراءات', 'Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const live = LIVE.includes(r.status);
                return (
                  <tr key={r.id}>
                    <td dir="ltr">{r.order.orderNumber}</td>
                    <td dir="ltr">
                      {r.sku.sku}
                      <div className="muted" style={{ fontSize: '0.85rem' }}>{r.sku.nameEn}</div>
                    </td>
                    <td className="num">{r.qty}</td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                    <td>{formatDateTime(r.expiresAt, locale)}</td>
                    <td>{r.reviewReason ?? '—'}</td>
                    <td>
                      {live && canManage ? (
                        <div className="stack">
                          <details>
                            <summary>{L('تمديد', 'Extend')}</summary>
                            <ApiForm
                              endpoint={`/api/v1/admin/reservations/${r.id}/extend`}
                              submitLabel={L('تمديد الحجز', 'Extend reservation')}
                              successMessage={L('تم التمديد.', 'Extended.')}
                              fields={[
                                { name: 'hours', label: L('ساعات إضافية (1–168)', 'Extra hours (1–168)'), type: 'number', required: true, min: 1, max: 168, step: 1 },
                                { name: 'reason', label: L('السبب', 'Reason'), required: true },
                              ]}
                            />
                          </details>
                          <ActionButton endpoint={`/api/v1/admin/reservations/${r.id}/release`} label={L('إفراج', 'Release')} reasonLabel={L('سبب الإفراج (3 أحرف على الأقل)', 'Reason for release (at least 3 characters)')} tone="danger" confirmText={L('الإفراج يعيد الكمية إلى المتاح. متابعة؟', 'Releasing returns the quantity to available stock. Continue?')} />
                        </div>
                      ) : (
                        <Badge>{L('—', '—')}</Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Card>
        <p className="muted">{L('عرض أول 200 حجز حسب الحالة. التمديد والإفراج يتطلبان صلاحية إدارة الحجوزات.', 'Showing the first 200 reservations for the status. Extend and release require reservation management.')}</p>
      </Card>
    </>
  );
}
