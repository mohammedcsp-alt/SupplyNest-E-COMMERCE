import '../css/system.css';
import { Badge, EmptyState, Alert } from '@/components/ui';
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
  const succeeded = runs.filter((r) => r.status === 'SUCCEEDED' || r.status === 'PASSED').length;
  const failed = runs.filter((r) => r.status === 'FAILED').length;

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>{L('النسخ الاحتياطي', 'Backup')}</h1>
          <p className="muted">
            {L(
              'النسخ تُنشأ بـ pg_dump داخل حاوية Docker المحلية. يتطلب تشغيل Docker Desktop.',
              'Backups use pg_dump inside the local Docker container. Docker Desktop must be running.',
            )}
          </p>
        </div>
      </div>

      <Alert tone="warn">
        {L(
          `اختبار الاستعادة يستخدم قاعدة بيانات مؤقتة باسم ${SCRATCH_DATABASE} فقط. لا يُعدِّل قاعدة التطوير الحالية ويحذف القاعدة المؤقتة بعد الاختبار.`,
          `The restore test uses a scratch database named ${SCRATCH_DATABASE} only. It never modifies the development database and drops the scratch database afterwards.`,
        )}
      </Alert>

      <div className="adm-kpis">
        <div className="adm-kpi">
          <strong>{runs.length}</strong>
          <span>{L('عمليات مسجّلة', 'Recorded runs')}</span>
        </div>
        <div className="adm-kpi">
          <strong>{succeeded}</strong>
          <span>{L('ناجحة', 'Succeeded')}</span>
        </div>
        <div className={failed > 0 ? 'adm-kpi is-warn' : 'adm-kpi'}>
          <strong>{failed}</strong>
          <span>{L('فاشلة', 'Failed')}</span>
        </div>
      </div>

      <section className="adm-section">
        <header>
          <h2>{L('إجراءات', 'Actions')}</h2>
        </header>
        <div className="bkp-actions">
          <div>
            <ActionButton
              endpoint="/api/v1/admin/backup/run"
              label={L('تشغيل نسخة احتياطية الآن', 'Run backup now')}
              tone="primary"
              confirmText={L('تشغيل نسخة احتياطية الآن؟ قد يستغرق بضع دقائق.', 'Run a backup now? This may take a few minutes.')}
            />
          </div>
          {canRestore && (
            <details className="adm-confirm">
              <summary>{L('اختبار الاستعادة…', 'Restore test…')}</summary>
              <p className="adm-consequence">
                {L(
                  `يستعيد الاختبار آخر نسخة إلى قاعدة مؤقتة (${SCRATCH_DATABASE}) فقط ثم يحذفها. قاعدة التطوير لا تتأثر.`,
                  `The test restores the latest backup into the scratch database (${SCRATCH_DATABASE}) only, then drops it. The development database is not touched.`,
                )}
              </p>
              <ActionButton
                endpoint="/api/v1/admin/backup/restore-test"
                label={L('تشغيل اختبار الاستعادة', 'Run restore test')}
                confirmText={L(
                  `اختبار الاستعادة يستعيد آخر نسخة إلى قاعدة مؤقتة (${SCRATCH_DATABASE}) فقط، ثم يحذفها. قاعدة التطوير لا تتأثر. متابعة؟`,
                  `The restore test restores the latest backup into the scratch database (${SCRATCH_DATABASE}) only, then drops it. The development database is not touched. Continue?`,
                )}
              />
            </details>
          )}
        </div>
      </section>

      <section className="adm-section">
        <header>
          <h2>{L('سجل النسخ والاختبارات', 'Backup and restore-test history')}</h2>
        </header>
        {runs.length === 0 ? (
          <EmptyState>{L('لا توجد عمليات بعد.', 'No runs yet.')}</EmptyState>
        ) : (
          <div className="table-wrap adm-table">
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
                    <td className="adm-code-cell">{r.kind}</td>
                    <td>
                      <Badge tone={r.status === 'SUCCEEDED' || r.status === 'PASSED' ? 'ok' : r.status === 'FAILED' ? 'danger' : 'neutral'}>{r.status}</Badge>
                    </td>
                    <td>{formatDateTime(r.startedAt, locale)}</td>
                    <td>{formatDateTime(r.completedAt, locale)}</td>
                    <td className="bkp-artifact">{r.artifactPath ?? '—'}</td>
                    <td className="bkp-checksum">{r.checksum ?? '—'}</td>
                    <td>
                      {r.restoreResult ?? '—'}
                      {r.restoreTestAt ? <div className="adm-muted-small">{formatDateTime(r.restoreTestAt, locale)}</div> : null}
                    </td>
                    <td>
                      {r.rowCounts ? (
                        <details className="adm-disclose">
                          <summary>{L('عرض', 'Show')}</summary>
                          <pre dir="ltr" className="adm-json">{JSON.stringify(r.rowCounts, null, 2)}</pre>
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
      </section>
    </>
  );
}
