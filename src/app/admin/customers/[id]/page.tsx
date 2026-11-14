import Link from 'next/link';
import { PageHeader, StatusBadge, EmptyState } from '@/components/ui';
import { ApiForm, ActionButton } from '@/components/forms';
import { formatDateTime } from '@/lib/time';
import { PERMISSIONS } from '@/lib/rbac';
import { db } from '@/lib/db';
import { gatePage, isUuid, NotFoundCard } from '../../_lib/gate';
import '../../css/operations.css';

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
      <div className="ops ops-customer">
        <PageHeader title={L('العميل غير موجود', 'Customer not found')} />
        <NotFoundCard message={L('لا يوجد عميل بهذا المعرّف.', 'No customer with this identifier.')} />
        <nav className="ops-back">
          <Link href="/admin/customers">{L('العودة إلى قائمة العملاء', 'Back to customers')}</Link>
        </nav>
      </div>
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
    <div className="ops ops-customer">
      <nav className="ops-back">
        <Link href="/admin/customers">← {L('العملاء', 'Customers')}</Link>
      </nav>
      <PageHeader
        title={u.customerProfile?.displayName ?? u.phone}
        subtitle={`${u.phone} · ${L('الحالة', 'status')}: ${status.replace(/_/g, ' ')}`}
        actions={<StatusBadge status={status} />}
      />

      <div className="ops-grid">
        <section className="adm-section" aria-labelledby="cust-profile-h">
          <header>
            <h2 id="cust-profile-h">{L('الملف', 'Profile')}</h2>
          </header>
          <dl className="ops-facts">
            <div>
              <dt>{L('الهاتف', 'Phone')}</dt>
              <dd className="code">{u.phone}</dd>
            </div>
            <div>
              <dt>{L('التحقق من الهاتف', 'Phone verified')}</dt>
              <dd>{u.phoneVerifiedAt ? formatDateTime(u.phoneVerifiedAt, locale) : L('غير متحقق', 'Not verified')}</dd>
            </div>
            <div>
              <dt>{L('الاسم التجاري', 'Display name')}</dt>
              <dd>{u.customerProfile?.displayName ?? '—'}</dd>
            </div>
            <div>
              <dt>{L('الاسم القانوني', 'Legal name')}</dt>
              <dd>{u.customerProfile?.legalName ?? '—'}</dd>
            </div>
            <div>
              <dt>{L('الهوية التجارية مقفلة', 'Business identity locked')}</dt>
              <dd>{u.customerProfile?.businessIdentityLocked ? L('نعم', 'Yes') : L('لا', 'No')}</dd>
            </div>
            <div>
              <dt>{L('مستوى السعر الحالي', 'Current price level')}</dt>
              <dd className="code">{u.customerProfile?.priceLevel?.code ?? '—'}</dd>
            </div>
            <div>
              <dt>{L('تاريخ التسجيل', 'Registered')}</dt>
              <dd>{formatDateTime(u.createdAt, locale)}</dd>
            </div>
          </dl>
        </section>

        <section className="adm-section" aria-labelledby="cust-actions-h">
          <header>
            <h2 id="cust-actions-h">{L('الإجراءات المتاحة لهذه الحالة', 'Actions available for this status')}</h2>
          </header>
          {!anyAction && <EmptyState>{L('لا توجد إجراءات متاحة لهذه الحالة أو لصلاحياتك.', 'No actions are available for this status or your permissions.')}</EmptyState>}
          <div className="ops-stack">
            {canApprove && (
              <section className="ops-action" aria-label={L('موافقة', 'Approve')}>
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
              <section className="ops-action">
                <details className="adm-confirm">
                  <summary>{L('رفض التسجيل', 'Reject registration')}</summary>
                  <p className="muted">{L('تتحول حالة الحساب إلى "مرفوض" ويُسجَّل السبب في سجل الحالة.', 'The account status changes to REJECTED and the reason is recorded in the status history.')}</p>
                  <ActionButton endpoint={`${base}/reject`} label={L('رفض التسجيل', 'Reject registration')} reasonLabel={L('سبب الرفض (3 أحرف على الأقل)', 'Reason for rejection (at least 3 characters)')} confirmText={L('هل تريد رفض هذا الحساب؟', 'Reject this account?')} tone="danger" />
                </details>
              </section>
            )}
            {canChangeLevel && (
              <section className="ops-action" aria-label={L('تغيير مستوى السعر', 'Change price level')}>
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
              <section className="ops-action">
                <details className="adm-confirm">
                  <summary>{L('تعليق الحساب', 'Suspend account')}</summary>
                  <p className="muted">{L('يُخفى السعر ويُمنع الطلب الجديد. لا تُلغى الطلبات أو الحجوزات القائمة.', 'Prices are hidden and new orders are blocked. Existing orders and reservations are not cancelled.')}</p>
                  <ActionButton endpoint={`${base}/suspend`} label={L('تعليق الحساب', 'Suspend account')} reasonLabel={L('سبب التعليق (3 أحرف على الأقل)', 'Reason for suspension (at least 3 characters)')} confirmText={L('تعليق الحساب يخفي الأسعار ويمنع الطلبات الجديدة. لا تُلغى الطلبات أو الحجوزات تلقائياً. متابعة؟', 'Suspending hides prices and blocks new orders. Orders and reservations are NOT cancelled automatically. Continue?')} tone="danger" />
                </details>
              </section>
            )}
            {canReactivate && (
              <section className="ops-action">
                <h3>{L('إعادة التفعيل', 'Reactivation')}</h3>
                <ActionButton endpoint={`${base}/reactivate`} label={L('إعادة تفعيل الحساب', 'Reactivate account')} reasonLabel={L('سبب إعادة التفعيل (3 أحرف على الأقل)', 'Reason for reactivation (at least 3 characters)')} tone="primary" />
              </section>
            )}
          </div>
        </section>
      </div>

      <section className="adm-section" aria-labelledby="cust-addr-h">
        <header>
          <h2 id="cust-addr-h">{L('العناوين', 'Addresses')}</h2>
        </header>
        {u.addresses.length === 0 ? (
          <div className="adm-empty">{L('لا توجد عناوين.', 'No addresses.')}</div>
        ) : (
          <div className="table-wrap adm-table">
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
      </section>

      <div className="ops-grid">
        <section className="adm-section" aria-labelledby="cust-status-h">
          <header>
            <h2 id="cust-status-h">{L('سجل الحالة', 'Status history')}</h2>
          </header>
          {u.statusHistory.length === 0 ? (
            <div className="adm-empty">{L('لا يوجد سجل.', 'No history.')}</div>
          ) : (
            <div className="table-wrap adm-table">
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
                      <td>{h.fromStatus ? <StatusBadge status={h.fromStatus} /> : '—'}</td>
                      <td>
                        <StatusBadge status={h.toStatus} />
                      </td>
                      <td>{h.reason ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section className="adm-section" aria-labelledby="cust-price-h">
          <header>
            <h2 id="cust-price-h">{L('سجل مستوى السعر', 'Price-level history')}</h2>
          </header>
          {u.priceAssignments.length === 0 ? (
            <div className="adm-empty">{L('لا يوجد سجل.', 'No history.')}</div>
          ) : (
            <div className="table-wrap adm-table">
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
                      <td className="code">{a.priceLevel.code}</td>
                      <td>{a.reason ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
