import { PageHeader, Card, EmptyState, Pagination } from '@/components/ui';
import { formatDateTime } from '@/lib/time';
import { PERMISSIONS } from '@/lib/rbac';
import { canSeePrices } from '@/modules/admin/access';
import { listAuditLogs } from '@/modules/admin/audit';
import { gatePage } from '../_lib/gate';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

/** Read-only audit log. Before/after JSON is shown as escaped text inside <details>; monetary values are masked without price.view. */
export default async function AdminAudit({
  searchParams,
}: {
  searchParams: Promise<{ entityType?: string; action?: string; actorId?: string; from?: string; to?: string; page?: string }>;
}) {
  const g = await gatePage(PERMISSIONS.AUDIT_VIEW, '/admin/audit');
  if (!g.ok) return g.node;
  const { L, locale } = g;
  const sp = await searchParams;
  const filters = {
    entityType: (sp.entityType ?? '').trim().slice(0, 60),
    action: (sp.action ?? '').trim().slice(0, 100),
    actorId: (sp.actorId ?? '').trim(),
    from: (sp.from ?? '').trim(),
    to: (sp.to ?? '').trim(),
  };
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  let result: Awaited<ReturnType<typeof listAuditLogs>> = { total: 0, items: [] };
  let error: string | null = null;
  try {
    result = await listAuditLogs({ ...filters, page, pageSize: PAGE_SIZE }, canSeePrices(g.user));
  } catch (err) {
    error = (err as Error).message;
  }

  const json = (v: unknown) => (v === null || v === undefined ? '—' : JSON.stringify(v, null, 2));

  return (
    <>
      <PageHeader title={L('سجل التدقيق', 'Audit log')} subtitle={L('للقراءة فقط. لا يمكن تعديل السجل أو حذفه.', 'Read-only. The log cannot be edited or deleted.')} />
      <form method="GET" className="form-row" role="search" style={{ marginBlockEnd: 16 }}>
        <div className="field">
          <label htmlFor="au-entity">{L('نوع الكيان', 'Entity type')}</label>
          <input id="au-entity" name="entityType" defaultValue={filters.entityType} maxLength={60} placeholder="sku, order, user…" />
        </div>
        <div className="field">
          <label htmlFor="au-action">{L('الإجراء (بادئة)', 'Action (prefix)')}</label>
          <input id="au-action" name="action" defaultValue={filters.action} maxLength={100} placeholder="price. / order. / customer." />
        </div>
        <div className="field">
          <label htmlFor="au-actor">{L('معرّف المنفذ (UUID)', 'Actor ID (UUID)')}</label>
          <input id="au-actor" name="actorId" defaultValue={filters.actorId} maxLength={36} dir="ltr" />
        </div>
        <div className="field">
          <label htmlFor="au-from">{L('من', 'From')}</label>
          <input id="au-from" name="from" type="date" defaultValue={filters.from} />
        </div>
        <div className="field">
          <label htmlFor="au-to">{L('إلى', 'To')}</label>
          <input id="au-to" name="to" type="date" defaultValue={filters.to} />
        </div>
        <div className="field">
          <button type="submit" className="btn btn-primary">{L('تصفية', 'Filter')}</button>
        </div>
      </form>

      {error && <div className="alert alert-error" role="alert">{error}</div>}

      {result.items.length === 0 ? (
        <EmptyState>{L('لا توجد سجلات مطابقة.', 'No matching entries.')}</EmptyState>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{L('التاريخ', 'When')}</th>
                <th>{L('المنفذ', 'Actor')}</th>
                <th>{L('الإجراء', 'Action')}</th>
                <th>{L('الكيان', 'Entity')}</th>
                <th>{L('السبب', 'Reason')}</th>
                <th>{L('التفاصيل', 'Details')}</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((r) => (
                <tr key={r.id}>
                  <td>{formatDateTime(r.occurredAt, locale)}</td>
                  <td dir="ltr">
                    {r.actorPhone ?? (r.actorId ? r.actorId.slice(0, 8) : L('النظام', 'system'))}
                  </td>
                  <td dir="ltr">{r.action}</td>
                  <td dir="ltr">
                    {r.entityType}
                    {r.entityId && <div className="muted" style={{ fontSize: '0.8rem', wordBreak: 'break-all' }}>{r.entityId}</div>}
                  </td>
                  <td>{r.reason ?? '—'}</td>
                  <td>
                    <details>
                      <summary>{L('قبل / بعد', 'Before / after')}</summary>
                      <p className="muted" style={{ margin: '6px 0 2px' }}>{L('قبل', 'Before')}</p>
                      <pre dir="ltr" style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: '0.8rem' }}>{json(r.before)}</pre>
                      <p className="muted" style={{ margin: '6px 0 2px' }}>{L('بعد', 'After')}</p>
                      <pre dir="ltr" style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: '0.8rem' }}>{json(r.after)}</pre>
                    </details>
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
        total={result.total}
        basePath="/admin/audit"
        params={{ ...filters }}
        labels={{ prev: L('السابق', 'Previous'), next: L('التالي', 'Next'), of: 'of' }}
      />
      <Card>
        <p className="muted">{L(`إجمالي السجلات المطابقة: ${result.total}`, `Matching entries: ${result.total}`)}</p>
      </Card>
    </>
  );
}
