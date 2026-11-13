import Link from 'next/link';
import { PageHeader, Card, StatusBadge, EmptyState } from '@/components/ui';
import { formatDateTime } from '@/lib/time';
import { PERMISSIONS } from '@/lib/rbac';
import { db } from '@/lib/db';
import { gatePage, isUuid, NotFoundCard } from '../../_lib/gate';

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
        <PageHeader title={L('الاستيراد غير موجود', 'Import not found')} />
        <NotFoundCard message={L('لا توجد عملية استيراد بهذا المعرّف.', 'No import with this identifier.')} />
        <Link href="/admin/imports">{L('العودة', 'Back')}</Link>
      </>
    );
  }
  const summary = (batch.summary ?? {}) as Record<string, unknown>;
  return (
    <>
      <p>
        <Link href="/admin/imports">← {L('الاستيراد', 'Imports')}</Link>
      </p>
      <PageHeader title={`${batch.type} · ${batch.filename}`} subtitle={`${L('المعرّف', 'ID')}: ${batch.id}`} actions={<StatusBadge status={batch.status} />} />
      <div className="card-grid">
        <Card title={L('الحالة', 'Status')}>
          <dl>
            <dt className="muted">{L('الحداثة', 'Freshness')}</dt>
            <dd>{batch.freshness}</dd>
            <dt className="muted">{L('وقت إنشاء الملف في المصدر', 'Source generated at')}</dt>
            <dd>{formatDateTime(batch.sourceGeneratedAt, locale)}</dd>
            <dt className="muted">{L('أُنشئ', 'Created')}</dt>
            <dd>{formatDateTime(batch.createdAt, locale)}</dd>
            <dt className="muted">{L('اعتُمد', 'Committed')}</dt>
            <dd>{formatDateTime(batch.committedAt, locale)}</dd>
            <dt className="muted">{L('سبب تجاوز الحداثة', 'Stale override reason')}</dt>
            <dd>{batch.overrideReason ?? '—'}</dd>
            <dt className="muted">SHA-256</dt>
            <dd dir="ltr" style={{ wordBreak: 'break-all', fontSize: '0.85rem' }}>{batch.checksum}</dd>
          </dl>
        </Card>
        <Card title={L('الملخص', 'Summary')}>
          <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{JSON.stringify(summary, null, 2)}</pre>
        </Card>
      </div>
      <Card title={L(`أخطاء الصفوف (${batch.errors.length})`, `Row errors (${batch.errors.length})`)}>
        {batch.errors.length === 0 ? (
          <EmptyState>{L('لا توجد أخطاء.', 'No errors.')}</EmptyState>
        ) : (
          <div className="table-wrap">
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
                    <td>{e.code}</td>
                    <td>{e.message}</td>
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
