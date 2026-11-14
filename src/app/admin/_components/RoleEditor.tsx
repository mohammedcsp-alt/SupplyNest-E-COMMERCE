'use client';

import { useState } from 'react';
import { api, type ApiErr } from '@/lib/client-api';

export type PermissionOption = { code: string; description: string };

/** Checkbox matrix for one role. Saves the full permission set through PUT /api/v1/admin/roles/[id]. */
export function RoleEditor({
  roleId,
  roleName,
  roleNameAr,
  isManager,
  initial,
  permissions,
  locale,
}: {
  roleId: string;
  roleName: string;
  roleNameAr: string | null;
  isManager: boolean;
  initial: string[];
  permissions: PermissionOption[];
  locale: 'ar' | 'en';
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiErr | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const L = (ar: string, en: string) => (locale === 'ar' ? ar : en);

  function toggle(code: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(code);
      else next.delete(code);
      return next;
    });
  }

  async function save() {
    setBusy(true);
    setError(null);
    setOk(null);
    const res = await api<{ changed: boolean; added: string[]; removed: string[] }>(`/api/v1/admin/roles/${roleId}`, {
      method: 'PUT',
      body: { permissions: [...selected] },
    });
    setBusy(false);
    if (!res.ok) {
      setError(res);
      return;
    }
    setOk(res.data.changed ? L('تم حفظ الصلاحيات.', 'Permissions saved.') : L('لا توجد تغييرات.', 'No changes.'));
  }

  return (
    <div>
      {error && <div className="alert alert-error" role="alert">{error.message}</div>}
      {ok && <div className="alert alert-ok" role="status">{ok}</div>}
      {isManager && <p className="adm-note">{L('دور المدير لا يمكن أن يفقد أي صلاحية.', 'The MANAGER role cannot lose any permission.')}</p>}
      <details className="adm-disclose-block">
        <summary>
          {L('الصلاحيات', 'Permissions')} ({selected.size}/{permissions.length})
        </summary>
        <fieldset className="adm-fieldset">
          <legend className="adm-role-legend">{locale === 'ar' ? roleNameAr || roleName : roleName}</legend>
          <div className="adm-perm-grid">
            {permissions.map((p) => {
              const id = `role-${roleId}-${p.code}`;
              return (
                <label key={p.code} htmlFor={id} className="adm-perm">
                  <input id={id} type="checkbox" checked={selected.has(p.code)} onChange={(e) => toggle(p.code, e.target.checked)} />
                  <span>
                    <code>{p.code}</code>
                    <span className="adm-perm-desc">{p.description}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      </details>
      <div className="adm-role-footer">
        <details className="adm-confirm">
          <summary>{L('حفظ تغييرات الدور…', 'Save role changes…')}</summary>
          <p className="adm-consequence">
            {L(
              'تغيير الصلاحيات يؤثر على كل من يحمل هذا الدور. كل تغيير يُسجَّل في سجل التدقيق.',
              'Changing permissions affects every user holding this role. Each change is written to the audit log.',
            )}
          </p>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? L('جارٍ الحفظ…', 'Saving…') : L('حفظ صلاحيات الدور', 'Save role permissions')}
          </button>
        </details>
      </div>
    </div>
  );
}
