import Link from 'next/link';
import { StatusBadge, EmptyState } from '@/components/ui';
import { formatDateTime } from '@/lib/time';
import { PERMISSIONS } from '@/lib/rbac';
import { db } from '@/lib/db';
import { gatePage, isUuid, NotFoundCard } from '../../_lib/gate';
import '../../css/catalog.css';

export const dynamic = 'force-dynamic';

/** Import detail: summary, freshness, override reason and row errors. Payload contents are not displayed. */
export default async function AdminImportDetail({ params }: { params: Promise<{ id: string }> }) {
  const g = await gatePage(PERMISSIONS.IMPORT_PREVIEW, '/admin/imports');
  if (!g.ok) return g.node;
  const { L, locale } = g;
  const { id } = await params;
  if (!isUuid(id)) {
    return <NotFoundCard message={L('لا يوجد سجل بهذا المعرّف.', 'No record with this identifier.')} />;
  }
  const batch = await db.importBatch.findUnique({ where: { id }, include: { errors: { orderBy: { rowNumber: 'asc' }, take: 500 } } });
  if (!batch) {
    return (
      <>
        <div className="adm-head">
          <div>
            <h1>{L('الاستيراد غير موجود', 'Import not found')}</h1>
          </div>
        </div>
        <NotFoundCard message={L('لا توجد عملية استيراد بهذا المعرّف.', 'No import with this identifier.')} />
        <p>
          <Link className="cat-back" href="/admin/imports">
            ← {L('العودة', 'Back')}
          </Link>
        </p>
      </>
    );
  }
  const summary = (batch.summary ?? {}) as Record<string, unknown>;
  return (
    <>
      <p>
        <Link className="cat-back" href="/admin/imports">
          ← {L('الاستيراد', 'Imports')}
        </Link>
      </p>
      <div className="adm-head">
        <div>
          <h1>{`${batch.type} · ${batch.filename}`}</h1>
          <p className="muted">{`${L('المعرّف', 'ID')}: ${batch.id}`}</p>
        </div>
        <div className="adm-head-actions">
          <StatusBadge status={batch.status} />
        </div>
      </div>

      <div className="cat-grid">
        <section className="adm-section imp-meta" aria-labelledby="imp-status-title">
          <header>
            <h2 id="imp-status-title">{L('الحالة', 'Status')}</h2>
          </header>
          <dl>
            <div>
              <dt>{L('الحداثة', 'Freshness')}</dt>
              <dd>{batch.freshness ? <StatusBadge status={batch.freshness} /> : '—'}</dd>
            </div>
            <div>
              <dt>{L('وقت إنشاء الملف في المصدر', 'Source generated at')}</dt>
              <dd>{formatDateTime(batch.sourceGeneratedAt, locale)}</dd>
            </div>
            <div>
              <dt>{L('أُنشئ', 'Created')}</dt>
              <dd>{formatDateTime(batch.createdAt, locale)}</dd>
            </div>
            <div>
              <dt>{L('اعتُمد', 'Committed')}</dt>
              <dd>{formatDateTime(batch.committedAt, locale)}</dd>
            </div>
            <div>
              <dt>{L('سبب تجاوز الحداثة', 'Stale override reason')}</dt>
              <dd>{batch.overrideReason ?? '—'}</dd>
            </div>
            <div>
              <dt>SHA-256</dt>
              <dd className="imp-checksum">{batch.checksum}</dd>
            </div>
          </dl>
        </section>
        <section className="adm-section" aria-labelledby="imp-summary-title">
          <header>
            <h2 id="imp-summary-title">{L('الملخص', 'Summary')}</h2>
          </header>
          <pre className="imp-summary-json">{JSON.stringify(summary, null, 2)}</pre>
        </section>
      </div>

      <section className="adm-section" aria-labelledby="imp-errors-title">
        <header>
          <h2 id="imp-errors-title">{L(`أخطاء الصفوف (${batch.errors.length})`, `Row errors (${batch.errors.length})`)}</h2>
        </header>
        {batch.errors.length === 0 ? (
          <EmptyState>{L('لا توجد أخطاء.', 'No errors.')}</EmptyState>
        ) : (
          <div className="table-wrap adm-table">
            <table>
              <thead>
                <tr>
                  <th className="num">{L('الصف', 'Row')}</th>
                  <th>{L('الحقل', 'Field')}</th>
                  <th>{L('الرمز', 'Code')}</th>
                  <th>{L('الرسالة', 'Message')}</th>
                </tr>
              </thead>
              <tbody>
                {batch.errors.map((e) => (
                  <tr key={e.id}>
                    <td className="num">{e.rowNumber}</td>
                    <td>{e.field ?? '—'}</td>
                    <td className="code">{e.code}</td>
                    <td>{e.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
