import { PageHeader, Card, Badge } from '@/components/ui';
import { ApiForm } from '@/components/forms';
import { PERMISSIONS } from '@/lib/rbac';
import { listSettings } from '@/modules/admin/settings';
import { gatePage } from '../_lib/gate';

export const dynamic = 'force-dynamic';

export default async function AdminSettings() {
  const g = await gatePage(PERMISSIONS.SETTINGS_MANAGE, '/admin/settings');
  if (!g.ok) return g.node;
  const { L, locale } = g;
  const rows = await listSettings();

  return (
    <>
      <PageHeader title={L('الإعدادات', 'Settings')} subtitle={L('قيم الأعمال. كل تغيير يُسجَّل في سجل التدقيق. القيم خارج النطاق المسموح مرفوضة.', 'Business values. Every change is audited. Values outside the allowed range are rejected.')} />
      <div className="card-grid">
        {rows.map((r) => {
          if (r.key === 'currency.code') {
            return (
              <Card key={r.key} title={r.key}>
                <p>
                  <Badge tone="ok">IQD</Badge>
                </p>
                <p className="muted">{L('العملة ثابتة على الدينار العراقي (IQD) في V1 ولا تُعدَّل من الواجهة.', 'Currency is fixed to Iraqi dinar (IQD) in V1 and cannot be changed here.')}</p>
              </Card>
            );
          }
          const rule = r.rule!;
          const help = L(
            `${rule.ar}. الافتراضي: ${r.defaultValue}. المسموح: ${rule.min}–${rule.max}.`,
            `${rule.en}. Default: ${r.defaultValue}. Allowed: ${rule.min}–${rule.max}.`,
          );
          return (
            <Card key={r.key} title={r.key}>
              <p className="muted">
                {L('القيمة الحالية:', 'Current value:')} <strong>{String(r.value)}</strong>
              </p>
              <ApiForm
                endpoint="/api/v1/admin/settings"
                method="PUT"
                extra={{ key: r.key }}
                submitLabel={L('حفظ', 'Save')}
                successMessage={L('تم حفظ القيمة.', 'Value saved.')}
                fields={[
                  { name: 'value', label: rule.en && locale === 'ar' ? rule.ar : rule.en, type: 'number', required: true, min: rule.min, max: rule.max, step: 1, defaultValue: Number(r.value), help },
                ]}
              />
            </Card>
          );
        })}
      </div>
    </>
  );
}
