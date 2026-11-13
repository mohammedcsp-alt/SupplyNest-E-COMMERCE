import { PageHeader, Card, Badge, EmptyState, Alert } from '@/components/ui';
import { ActionButton } from '@/components/forms';
import { formatDateTime } from '@/lib/time';
import { PERMISSIONS } from '@/lib/rbac';
import { listBackupRuns, SCRATCH_DATABASE } from '@/modules/admin/backup';
import { gatePage } from '../_lib/gate';

export const dynamic = 'force-dynamic';

export default async function AdminBackup() {
  const g = await gatePage(PERMISSIONS.BACKUP_MANAGE, '/admin/backup');
  if (!g.ok) return g.node;
  const { L, locale, user } = g;
  const runs = await listBackupRuns();
  const canRestore = user.permissions.has(PERMISSIONS.BACKUP_RESTORE);

  return (
    <>
      <PageHeader title={L('النسخ الاحتياطي', 'Backup')} subtitle={L('النسخ تُنشأ بـ pg_dump داخل حاوية Docker المحلية. يتطلب تشغيل Docker Desktop.', 'Backups use pg_dump inside the local Docker container. Docker Desktop must be running.')} />
      <Alert tone="warn">
        {L(
          `اختبار الاستعادة يستخدم قاعدة بيانات مؤقتة باسم ${SCRATCH_DATABASE} فقط. لا يُعدِّل قاعدة التطوير الحالية ويحذف القاعدة المؤقتة بعد الاختبار.`,
          `The restore test uses a scratch database named ${SCRATCH_DATABASE} only. It never modifies the development database and drops the scratch database afterwards.`,
        )}
      </Alert>
      <Card title={L('إجراءات', 'Actions')}>
        <div className="row">
          <ActionButton endpoint="/api/v1/admin/backup/run" label={L('تشغيل نسخة احتياطية الآن', 'Run backup now')} tone="primary" confirmText={L('تشغيل نسخة احتياطية الآن؟ قد يستغرق بضع دقائق.', 'Run a backup now? This may take a few minutes.')} />
          {canRestore && (
            <ActionButton
              endpoint="/api/v1/admin/backup/restore-test"
              label={L('تشغيل اختبار الاستعادة', 'Run restore test')}
              confirmText={L(`اختبار الاستعادة يستعيد آخر نسخة إلى قاعدة مؤقتة (${SCRATCH_DATABASE}) فقط، ثم يحذفها. قاعدة التطوير لا تتأثر. متابعة؟`, `The restore test restores the latest backup into the scratch database (${SCRATCH_DATABASE}) only, then drops it. The development database is not touched. Continue?`)}
            />
          )}
        </div>
      </Card>
      <Card title={L('سجل النسخ والاختبارات', 'Backup and restore-test history')}>
        {runs.length === 0 ? (
          <EmptyState>{L('لا توجد عمليات بعد.', 'No runs yet.')}</EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{L('النوع', 'Kind')}</th>
                  <th>{L('الحالة', 'Status')}</th>
                  <th>{L('بدأ', 'Started')}</th>
                  <th>{L('انتهى', 'Completed')}</th>
                  <th>{L('الملف', 'Artifact')}</th>
                  <th>SHA-256</th>
                  <th>{L('نتيجة الاستعادة', 'Restore result')}</th>
                  <th>{L('عدد الصفوف (جداول رئيسية)', 'Row counts (key tables)')}</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td>{r.kind}</td>
                    <td>
                      <Badge tone={r.status === 'SUCCEEDED' || r.status === 'PASSED' ? 'ok' : r.status === 'FAILED' ? 'danger' : 'neutral'}>{r.status}</Badge>
                    </td>
                    <td>{formatDateTime(r.startedAt, locale)}</td>
                    <td>{formatDateTime(r.completedAt, locale)}</td>
                    <td dir="ltr" style={{ wordBreak: 'break-all', fontSize: '0.85rem' }}>{r.artifactPath ?? '—'}</td>
                    <td dir="ltr" style={{ wordBreak: 'break-all', fontSize: '0.8rem' }}>{r.checksum ?? '—'}</td>
                    <td>{r.restoreResult ?? '—'}{r.restoreTestAt ? <div className="muted" style={{ fontSize: '0.8rem' }}>{formatDateTime(r.restoreTestAt, locale)}</div> : null}</td>
                    <td>
                      {r.rowCounts ? (
                        <details>
                          <summary>{L('عرض', 'Show')}</summary>
                          <pre dir="ltr" style={{ whiteSpace: 'pre-wrap', fontSize: '0.8rem', margin: 0 }}>{JSON.stringify(r.rowCounts, null, 2)}</pre>
                        </details>
                      ) : (
                        '—'
                      )}
                    </td>
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
