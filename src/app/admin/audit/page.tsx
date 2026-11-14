import '../css/system.css';
import { EmptyState, Pagination, Badge } from '@/components/ui';
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
  const pageCount = Math.max(1, Math.ceil(result.total / PAGE_SIZE));

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>{L('سجل التدقيق', 'Audit log')}</h1>
          <p className="muted">{L('للقراءة فقط. لا يمكن تعديل السجل أو حذفه.', 'Read-only. The log cannot be edited or deleted.')}</p>
        </div>
        <div className="adm-head-actions">
          <Badge>{L('للقراءة فقط', 'Read-only')}</Badge>
        </div>
      </div>

      <form method="GET" className="adm-filters" role="search" aria-label={L('تصفية السجل', 'Filter the log')}>
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
        <div className="adm-filter-actions">
          <button type="submit" className="btn btn-primary">{L('تصفية', 'Filter')}</button>
        </div>
      </form>

      <div className="adm-kpis">
        <div className="adm-kpi">
          <strong>{result.total}</strong>
          <span>{L('السجلات المطابقة', 'Matching entries')}</span>
        </div>
        <div className="adm-kpi">
          <strong>{`${page} / ${pageCount}`}</strong>
          <span>{L('الصفحة الحالية', 'Current page')}</span>
        </div>
      </div>

      {error && <div className="alert alert-error" role="alert">{error}</div>}

      {result.items.length === 0 ? (
        <section className="adm-section">
          <EmptyState>{L('لا توجد سجلات مطابقة.', 'No matching entries.')}</EmptyState>
        </section>
      ) : (
        <div className="table-wrap adm-table">
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
                  <td className="adm-code-cell">{r.actorPhone ?? (r.actorId ? r.actorId.slice(0, 8) : L('النظام', 'system'))}</td>
                  <td className="adm-code-cell">{r.action}</td>
                  <td>
                    <span className="adm-code-cell" dir="ltr">{r.entityType}</span>
                    {r.entityId && <div className="adm-muted-small adm-code-cell">{r.entityId}</div>}
                  </td>
                  <td>{r.reason ?? '—'}</td>
                  <td>
                    <details className="adm-disclose">
                      <summary>{L('قبل / بعد', 'Before / after')}</summary>
                      <p className="adm-json-label">{L('قبل', 'Before')}</p>
                      <pre dir="ltr" className="adm-json">{json(r.before)}</pre>
                      <p className="adm-json-label">{L('بعد', 'After')}</p>
                      <pre dir="ltr" className="adm-json">{json(r.after)}</pre>
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
    </>
  );
}
