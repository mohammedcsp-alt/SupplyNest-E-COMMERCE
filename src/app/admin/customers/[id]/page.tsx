import Link from 'next/link';
import { PageHeader, Card, StatusBadge, EmptyState } from '@/components/ui';
import { ApiForm, ActionButton } from '@/components/forms';
import { formatDateTime } from '@/lib/time';
import { PERMISSIONS } from '@/lib/rbac';
import { db } from '@/lib/db';
import { gatePage, isUuid, NotFoundCard } from '../../_lib/gate';

export const dynamic = 'force-dynamic';

export default async function AdminCustomerDetail({ params }: { params: Promise<{ id: string }> }) {
  const g = await gatePage(PERMISSIONS.CUSTOMER_VIEW, '/admin/customers');
  if (!g.ok) return g.node;
  const { L, locale, user } = g;
  const { id } = await params;
  if (!isUuid(id)) {
    return <NotFoundCard message={L('لا يوجد سجل بهذا المعرّف.', 'No record with this identifier.')} />;
  }
  const u = await db.user.findUnique({
    where: { id },
    include: {
      customerProfile: { include: { priceLevel: true } },
      addresses: { where: { deletedAt: null }, include: { governorate: true, area: true } },
      statusHistory: { orderBy: { occurredAt: 'desc' }, take: 50 },
      priceAssignments: { orderBy: { effectiveAt: 'desc' }, take: 50, include: { priceLevel: true } },
    },
  });
  if (!u || u.userType !== 'CUSTOMER') {
    return (
      <>
        <PageHeader title={L('العميل غير موجود', 'Customer not found')} />
        <NotFoundCard message={L('لا يوجد عميل بهذا المعرّف.', 'No customer with this identifier.')} />
        <Link href="/admin/customers">{L('العودة إلى قائمة العملاء', 'Back to customers')}</Link>
      </>
    );
  }
  const status = u.status;
  const can = (p: string) => user.permissions.has(p);
  const levels = await db.priceLevel.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] });
  const levelOptions = levels.map((l) => ({ value: l.id, label: `${l.code} — ${l.name}` }));
  const canApprove = status === 'APPROVAL_PENDING' && can(PERMISSIONS.CUSTOMER_APPROVE);
  const canReject = (status === 'REGISTERED' || status === 'APPROVAL_PENDING') && can(PERMISSIONS.CUSTOMER_APPROVE);
  const canSuspend = status === 'ACTIVE' && can(PERMISSIONS.CUSTOMER_SUSPEND);
  const canReactivate = status === 'SUSPENDED' && can(PERMISSIONS.CUSTOMER_SUSPEND);
  const canChangeLevel = (status === 'ACTIVE' || status === 'SUSPENDED') && can(PERMISSIONS.CUSTOMER_APPROVE);
  const anyAction = canApprove || canReject || canSuspend || canReactivate || canChangeLevel;
  const base = `/api/v1/admin/customers/${u.id}`;

  return (
    <>
      <p>
        <Link href="/admin/customers">← {L('العملاء', 'Customers')}</Link>
      </p>
      <PageHeader
        title={u.customerProfile?.displayName ?? u.phone}
        subtitle={`${u.phone} · ${L('الحالة', 'status')}: ${status.replace(/_/g, ' ')}`}
        actions={<StatusBadge status={status} />}
      />

      <div className="card-grid">
        <Card title={L('الملف', 'Profile')}>
          <dl>
            <dt className="muted">{L('الهاتف', 'Phone')}</dt>
            <dd dir="ltr">{u.phone}</dd>
            <dt className="muted">{L('التحقق من الهاتف', 'Phone verified')}</dt>
            <dd>{u.phoneVerifiedAt ? formatDateTime(u.phoneVerifiedAt, locale) : L('غير متحقق', 'Not verified')}</dd>
            <dt className="muted">{L('الاسم التجاري', 'Display name')}</dt>
            <dd>{u.customerProfile?.displayName ?? '—'}</dd>
            <dt className="muted">{L('الاسم القانوني', 'Legal name')}</dt>
            <dd>{u.customerProfile?.legalName ?? '—'}</dd>
            <dt className="muted">{L('الهوية التجارية مقفلة', 'Business identity locked')}</dt>
            <dd>{u.customerProfile?.businessIdentityLocked ? L('نعم', 'Yes') : L('لا', 'No')}</dd>
            <dt className="muted">{L('مستوى السعر الحالي', 'Current price level')}</dt>
            <dd>{u.customerProfile?.priceLevel?.code ?? '—'}</dd>
            <dt className="muted">{L('تاريخ التسجيل', 'Registered')}</dt>
            <dd>{formatDateTime(u.createdAt, locale)}</dd>
          </dl>
        </Card>

        <Card title={L('الإجراءات المتاحة لهذه الحالة', 'Actions available for this status')}>
          {!anyAction && <EmptyState>{L('لا توجد إجراءات متاحة لهذه الحالة أو لصلاحياتك.', 'No actions are available for this status or your permissions.')}</EmptyState>}
          <div className="stack">
            {canApprove && (
              <section aria-label={L('موافقة', 'Approve')}>
                <h3>{L('الموافقة وتفعيل الحساب', 'Approve and activate')}</h3>
                <ApiForm
                  endpoint={`${base}/approve`}
                  fields={[
                    { name: 'priceLevelId', label: L('مستوى السعر', 'Price level'), type: 'select', required: true, options: levelOptions },
                    { name: 'reason', label: L('ملاحظة (اختياري)', 'Note (optional)'), type: 'textarea' },
                  ]}
                  submitLabel={L('موافقة', 'Approve')}
                  successMessage={L('تمت الموافقة.', 'Approved.')}
                />
              </section>
            )}
            {canReject && (
              <ActionButton endpoint={`${base}/reject`} label={L('رفض التسجيل', 'Reject registration')} reasonLabel={L('سبب الرفض (3 أحرف على الأقل)', 'Reason for rejection (at least 3 characters)')} confirmText={L('هل تريد رفض هذا الحساب؟', 'Reject this account?')} tone="danger" />
            )}
            {canChangeLevel && (
              <section aria-label={L('تغيير مستوى السعر', 'Change price level')}>
                <h3>{L('تغيير مستوى السعر', 'Change price level')}</h3>
                <ApiForm
                  endpoint={`${base}/price-level`}
                  fields={[
                    { name: 'priceLevelId', label: L('المستوى الجديد', 'New level'), type: 'select', required: true, options: levelOptions },
                    { name: 'reason', label: L('السبب', 'Reason'), type: 'text', required: true, help: L('يُسجَّل في سجل مستويات السعر.', 'Recorded in the price-level history.') },
                  ]}
                  submitLabel={L('تغيير المستوى', 'Change level')}
                  successMessage={L('تم تغيير المستوى.', 'Price level changed.')}
                />
              </section>
            )}
            {canSuspend && (
              <ActionButton endpoint={`${base}/suspend`} label={L('تعليق الحساب', 'Suspend account')} reasonLabel={L('سبب التعليق (3 أحرف على الأقل)', 'Reason for suspension (at least 3 characters)')} confirmText={L('تعليق الحساب يخفي الأسعار ويمنع الطلبات الجديدة. لا تُلغى الطلبات أو الحجوزات تلقائياً. متابعة؟', 'Suspending hides prices and blocks new orders. Orders and reservations are NOT cancelled automatically. Continue?')} tone="danger" />
            )}
            {canReactivate && (
              <ActionButton endpoint={`${base}/reactivate`} label={L('إعادة تفعيل الحساب', 'Reactivate account')} reasonLabel={L('سبب إعادة التفعيل (3 أحرف على الأقل)', 'Reason for reactivation (at least 3 characters)')} tone="primary" />
            )}
          </div>
        </Card>
      </div>

      <Card title={L('العناوين', 'Addresses')}>
        {u.addresses.length === 0 ? (
          <EmptyState>{L('لا توجد عناوين.', 'No addresses.')}</EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{L('التسمية', 'Label')}</th>
                  <th>{L('المحافظة', 'Governorate')}</th>
                  <th>{L('المنطقة', 'Area')}</th>
                  <th>{L('التفاصيل', 'Details')}</th>
                  <th>{L('افتراضي', 'Default')}</th>
                </tr>
              </thead>
              <tbody>
                {u.addresses.map((a) => (
                  <tr key={a.id}>
                    <td>{a.label ?? '—'}</td>
                    <td>{locale === 'ar' ? a.governorate.nameAr : a.governorate.nameEn}</td>
                    <td>{a.area ? (locale === 'ar' ? a.area.nameAr : a.area.nameEn) : '—'}</td>
                    <td>{a.details}</td>
                    <td>{a.isDefault ? L('نعم', 'Yes') : L('لا', 'No')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="card-grid">
        <Card title={L('سجل الحالة', 'Status history')}>
          {u.statusHistory.length === 0 ? (
            <EmptyState>{L('لا يوجد سجل.', 'No history.')}</EmptyState>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{L('التاريخ', 'When')}</th>
                    <th>{L('من', 'From')}</th>
                    <th>{L('إلى', 'To')}</th>
                    <th>{L('السبب', 'Reason')}</th>
                  </tr>
                </thead>
                <tbody>
                  {u.statusHistory.map((h) => (
                    <tr key={h.id}>
                      <td>{formatDateTime(h.occurredAt, locale)}</td>
                      <td>{h.fromStatus ?? '—'}</td>
                      <td>{h.toStatus}</td>
                      <td>{h.reason ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card title={L('سجل مستوى السعر', 'Price-level history')}>
          {u.priceAssignments.length === 0 ? (
            <EmptyState>{L('لا يوجد سجل.', 'No history.')}</EmptyState>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{L('التاريخ', 'When')}</th>
                    <th>{L('المستوى', 'Level')}</th>
                    <th>{L('السبب', 'Reason')}</th>
                  </tr>
                </thead>
                <tbody>
                  {u.priceAssignments.map((a) => (
                    <tr key={a.id}>
                      <td>{formatDateTime(a.effectiveAt, locale)}</td>
                      <td>{a.priceLevel.code}</td>
                      <td>{a.reason ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
