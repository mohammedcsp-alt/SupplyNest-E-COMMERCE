import Link from 'next/link';
import { currentLocale, localized } from '@/lib/i18n';
import { getCurrentUser } from '@/lib/session';
import { userWithPermission } from '@/lib/page-guards';
import { PERMISSIONS } from '@/lib/rbac';
import { db } from '@/lib/db';
import { Card, EmptyState, ForbiddenNotice, LoginRequired, PageHeader, Pagination, StatusBadge } from '@/components/ui';
import { FULFILLMENT_AR, fmtDateTime, personName } from '@/components/ops';
import { FULFILLMENT_LABELS, listJobs } from '@/modules/fulfillment/service';
import type { FulfillmentStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

type SP = Record<string, string | undefined>;

export default async function FulfillmentQueuePage({ searchParams }: { searchParams: Promise<SP> }) {
  const locale = await currentLocale();
  const L = (ar: string, en: string) => localized(locale, ar, en);
  const sp = await searchParams;

  if (!(await getCurrentUser())) return <LoginRequired locale={locale} next="/fulfillment" />;
  const user = await userWithPermission(PERMISSIONS.FULFILLMENT_VIEW);
  if (!user) return <ForbiddenNotice locale={locale} />;

  const status = sp.status && sp.status in FULFILLMENT_LABELS ? (sp.status as FulfillmentStatus) : undefined;
  const isManager = user.permissions.has(PERMISSIONS.FULFILLMENT_ASSIGN);
  const pageNo = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);
  const dir = sp.dir === 'asc' ? 'asc' : 'desc';
  const q = (sp.q ?? '').trim().slice(0, 80) || undefined;
  const assigneeId = sp.assignee && /^[0-9a-f-]{36}$/i.test(sp.assignee) ? sp.assignee : undefined;
  const { rows: jobs, total, pageSize } = await listJobs(user, { status, mine: sp.mine === '1', page: pageNo, dir, q, assigneeId });

  // Employees who currently hold a picker or checker assignment (the filter's options).
  const assignedRows = await db.fulfillmentJob.findMany({ select: { assignedPickerId: true, assignedCheckerId: true }, distinct: ['assignedPickerId'], take: 200 });
  const checkerRows = await db.fulfillmentJob.findMany({ select: { assignedCheckerId: true }, distinct: ['assignedCheckerId'], take: 200 });
  const assigneeIds = [...new Set([...assignedRows.map((r) => r.assignedPickerId), ...checkerRows.map((r) => r.assignedCheckerId)].filter((x): x is string => !!x))];
  const assigneeUsers = assigneeIds.length ? await db.user.findMany({ where: { id: { in: assigneeIds } }, select: { id: true, phone: true, fullNameAr: true, fullNameEn: true } }) : [];

  const staffIds = [...new Set(jobs.flatMap((j) => [j.assignedPickerId, j.assignedCheckerId]).filter((x): x is string => !!x))];
  const staff = staffIds.length ? await db.user.findMany({ where: { id: { in: staffIds } }, select: { id: true, phone: true, fullNameAr: true, fullNameEn: true } }) : [];
  const nameOf = new Map(staff.map((u) => [u.id, personName(u, locale)]));

  return (
    <section className="stack">
      <PageHeader
        title={L('التجهيز الداخلي', 'Internal fulfillment')}
        subtitle={L(
          'تجهيز الطلبات داخلياً قبل التسليم للشركة. مستند التجهيز ليس فاتورة مبيعات. "سُلّم للشركة" لا يعني أن الطلب وصل للعميل.',
          'Local preparation before handover to a courier. The preparation document is not a sales invoice. "Handed over to courier" does not mean the customer has received the order.',
        )}
      />

      <Card>
        <form method="get" className="form-row" aria-label={L('تصفية قائمة التجهيز', 'Filter the preparation queue')}>
          <div className="field">
            <label htmlFor="f-status">{L('الحالة', 'Status')}</label>
            <select id="f-status" name="status" defaultValue={status ?? ''}>
              <option value="">{L('كل الحالات', 'All statuses')}</option>
              {Object.keys(FULFILLMENT_LABELS).map((s) => (
                <option key={s} value={s}>
                  {locale === 'ar' ? FULFILLMENT_AR[s] : FULFILLMENT_LABELS[s as FulfillmentStatus]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-q">{L('بحث برقم الطلب أو المستند', 'Search by order or document no.')}</label>
            <input id="f-q" name="q" type="search" defaultValue={q ?? ''} dir="ltr" maxLength={80} />
          </div>
          <div className="field">
            <label htmlFor="f-assignee">{L('الموظف', 'Employee')}</label>
            <select id="f-assignee" name="assignee" defaultValue={assigneeId ?? ''}>
              <option value="">{L('الكل', 'Everyone')}</option>
              {assigneeUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {personName(u, locale)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-dir">{L('الترتيب', 'Order')}</label>
            <select id="f-dir" name="dir" defaultValue={dir}>
              <option value="desc">{L('الأحدث أولاً', 'Newest first')}</option>
              <option value="asc">{L('الأقدم أولاً', 'Oldest first')}</option>
            </select>
          </div>
          <div className="field">
            <label className="row" style={{ fontWeight: 400 }}>
              <input type="checkbox" name="mine" value="1" defaultChecked={sp.mine === '1'} /> {L('مهامي فقط', 'Only my jobs')}
            </label>
          </div>
          <div className="field" style={{ alignSelf: 'end' }}>
            <button type="submit" className="btn btn-primary">
              {L('تصفية', 'Filter')}
            </button>
          </div>
        </form>
        <p className="field-help">
          {isManager
            ? L('المدير يرى كل المهام. استخدم "مهامي فقط" لرؤية المهام المكلّف بها.', 'Managers see every job. Use "Only my jobs" to see the jobs assigned to you.')
            : L('تظهر لك المهام التي كُلّفت بها فقط.', 'You only see jobs assigned to you.')}
        </p>
      </Card>

      <Card>
        {jobs.length === 0 ? (
          <EmptyState>{L('لا توجد مهام تجهيز.', 'No preparation jobs.')}</EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">{L('رقم مستند التجهيز', 'Prep no.')}</th>
                  <th scope="col">{L('رقم الطلب', 'Order')}</th>
                  <th scope="col">{L('الحالة', 'Status')}</th>
                  <th scope="col">{L('الملتقط', 'Picker')}</th>
                  <th scope="col">{L('المدقق', 'Checker')}</th>
                  <th scope="col">{L('أُنشئ', 'Created')}</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id}>
                    <td>
                      <Link href={`/fulfillment/jobs/${j.id}`} dir="ltr">
                        {j.prepDocumentNo}
                      </Link>
                    </td>
                    <td dir="ltr">{j.order.orderNumber}</td>
                    <td>
                      <StatusBadge status={j.status} />
                      <div className="muted" style={{ fontSize: '0.88rem' }}>
                        {locale === 'ar' ? FULFILLMENT_AR[j.status] : FULFILLMENT_LABELS[j.status]}
                      </div>
                    </td>
                    <td>{j.assignedPickerId ? nameOf.get(j.assignedPickerId) ?? '—' : <span className="muted">{L('غير مكلّف', 'Unassigned')}</span>}</td>
                    <td>{j.assignedCheckerId ? nameOf.get(j.assignedCheckerId) ?? '—' : <span className="muted">{L('غير مكلّف', 'Unassigned')}</span>}</td>
                    <td>{fmtDateTime(j.createdAt, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          page={pageNo}
          pageSize={pageSize}
          total={total}
          basePath="/fulfillment"
          params={{ status, mine: sp.mine === '1' ? '1' : undefined, q, assignee: assigneeId, dir: dir === 'asc' ? 'asc' : undefined }}
          labels={{ prev: L('السابق', 'Previous'), next: L('التالي', 'Next'), of: L('من', 'of') }}
        />
      </Card>
    </section>
  );
}
