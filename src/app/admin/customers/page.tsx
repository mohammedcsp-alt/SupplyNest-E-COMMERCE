import Link from 'next/link';
import { PageHeader, StatusBadge, Pagination } from '@/components/ui';
import { formatDateTime } from '@/lib/time';
import { PERMISSIONS } from '@/lib/rbac';
import { db } from '@/lib/db';
import { ACCOUNT_STATUSES_LIST } from '@/modules/admin/constants';
import { gatePage } from '../_lib/gate';
import '../css/operations.css';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

export default async function AdminCustomers({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; page?: string }> }) {
  const g = await gatePage(PERMISSIONS.CUSTOMER_VIEW, '/admin/customers');
  if (!g.ok) return g.node;
  const { L, locale } = g;
  const sp = await searchParams;
  const status = (ACCOUNT_STATUSES_LIST as readonly string[]).includes(sp.status ?? '') ? (sp.status as (typeof ACCOUNT_STATUSES_LIST)[number]) : undefined;
  const q = (sp.q ?? '').trim().slice(0, 80);
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const where = {
    userType: 'CUSTOMER' as const,
    ...(status ? { status } : {}),
    ...(q ? { OR: [{ phone: { contains: q } }, { customerProfile: { displayName: { contains: q, mode: 'insensitive' as const } } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { customerProfile: { include: { priceLevel: true } } },
    }),
    db.user.count({ where }),
  ]);
  const filtered = Boolean(status || q);

  return (
    <div className="ops ops-customers">
      <PageHeader title={L('العملاء', 'Customers')} subtitle={L('الموافقة على التسجيلات وإدارة الحسابات.', 'Approve registrations and manage accounts.')} />

      <div className="adm-kpis">
        <div className="adm-kpi">
          <span>{filtered ? L('النتائج المطابقة', 'Matching customers') : L('إجمالي العملاء', 'Total customers')}</span>
          <strong>{total}</strong>
        </div>
      </div>

      <form method="GET" className="adm-filters" role="search">
        <div className="field">
          <label htmlFor="cust-status">{L('الحالة', 'Status')}</label>
          <select id="cust-status" name="status" defaultValue={status ?? ''}>
            <option value="">{L('الكل', 'All')}</option>
            {ACCOUNT_STATUSES_LIST.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="cust-q">{L('بحث بالهاتف أو الاسم', 'Search by phone or name')}</label>
          <input id="cust-q" name="q" type="search" defaultValue={q} maxLength={80} />
        </div>
        <div className="adm-filter-actions">
          <button type="submit" className="btn btn-primary">{L('تصفية', 'Filter')}</button>
          {filtered && (
            <Link className="btn" href="/admin/customers">
              {L('مسح', 'Clear')}
            </Link>
          )}
        </div>
      </form>

      {rows.length === 0 ? (
        <div className="adm-empty">{L('لا توجد نتائج.', 'No matching customers.')}</div>
      ) : (
        <div className="table-wrap adm-table">
          <table>
            <thead>
              <tr>
                <th>{L('الهاتف', 'Phone')}</th>
                <th>{L('الاسم', 'Name')}</th>
                <th>{L('الحالة', 'Status')}</th>
                <th>{L('مستوى السعر', 'Price level')}</th>
                <th>{L('تاريخ التسجيل', 'Registered')}</th>
                <th>
                  <span className="sr-only">{L('إجراءات', 'Actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id}>
                  <td className="code">{u.phone}</td>
                  <td>{u.customerProfile?.displayName ?? '—'}</td>
                  <td>
                    <StatusBadge status={u.status} />
                  </td>
                  <td className="code">{u.customerProfile?.priceLevel?.code ?? '—'}</td>
                  <td>{formatDateTime(u.createdAt, locale)}</td>
                  <td>
                    <div className="adm-row-actions">
                      <Link className="btn btn-small" href={`/admin/customers/${u.id}`}>
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
      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        basePath="/admin/customers"
        params={{ status, q }}
        labels={{ prev: L('السابق', 'Previous'), next: L('التالي', 'Next'), of: 'of' }}
      />
    </div>
  );
}
