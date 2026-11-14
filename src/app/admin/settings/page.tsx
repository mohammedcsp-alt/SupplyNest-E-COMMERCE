import '../css/system.css';
import { Badge } from '@/components/ui';
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
  const editable = rows.filter((r) => r.key !== 'currency.code').length;

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>{L('الإعدادات', 'Settings')}</h1>
          <p className="muted">
            {L(
              'قيم الأعمال. كل تغيير يُسجَّل في سجل التدقيق. القيم خارج النطاق المسموح مرفوضة.',
              'Business values. Every change is audited. Values outside the allowed range are rejected.',
            )}
          </p>
        </div>
      </div>

      <div className="adm-kpis">
        <div className="adm-kpi">
          <strong>{rows.length}</strong>
          <span>{L('الإعدادات', 'Settings')}</span>
        </div>
        <div className="adm-kpi">
          <strong>{editable}</strong>
          <span>{L('قابلة للتعديل هنا', 'Editable here')}</span>
        </div>
      </div>

      <div className="set-grid">
        {rows.map((r) => {
          if (r.key === 'currency.code') {
            return (
              <div className="set-card" key={r.key}>
                <div className="set-card-head">
                  <code className="set-key">{r.key}</code>
                  <Badge tone="ok">IQD</Badge>
                </div>
                <p className="adm-note" style={{ margin: 0 }}>
                  {L('العملة ثابتة على الدينار العراقي (IQD) في V1 ولا تُعدَّل من الواجهة.', 'Currency is fixed to Iraqi dinar (IQD) in V1 and cannot be changed here.')}
                </p>
              </div>
            );
          }
          const rule = r.rule!;
          const help = L(
            `${rule.ar}. الافتراضي: ${r.defaultValue}. المسموح: ${rule.min}–${rule.max}.`,
            `${rule.en}. Default: ${r.defaultValue}. Allowed: ${rule.min}–${rule.max}.`,
          );
          return (
            <div className="set-card" key={r.key}>
              <div className="set-card-head">
                <code className="set-key">{r.key}</code>
                <Badge>{`${rule.min}–${rule.max}`}</Badge>
              </div>
              <div>
                <span className="adm-muted-small">{L('القيمة الحالية', 'Current value')}</span>
                <div className="set-value" dir="ltr">{String(r.value)}</div>
              </div>
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
            </div>
          );
        })}
      </div>
    </>
  );
}
