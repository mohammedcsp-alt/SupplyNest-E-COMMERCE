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
      {isManager && (
        <p className="muted">{L('دور المدير لا يمكن أن يفقد أي صلاحية.', 'The MANAGER role cannot lose any permission.')}</p>
      )}
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="muted">{locale === 'ar' ? roleNameAr || roleName : roleName}</legend>
        <div className="card-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
          {permissions.map((p) => {
            const id = `role-${roleId}-${p.code}`;
            return (
              <label key={p.code} htmlFor={id} className="row" style={{ fontWeight: 400, alignItems: 'flex-start' }}>
                <input id={id} type="checkbox" checked={selected.has(p.code)} onChange={(e) => toggle(p.code, e.target.checked)} />
                <span>
                  <code>{p.code}</code>
                  <br />
                  <span className="muted" style={{ fontSize: '0.88rem' }}>{p.description}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <button type="button" className="btn btn-primary" onClick={save} disabled={busy} style={{ marginBlockStart: 12 }}>
        {busy ? L('جارٍ الحفظ…', 'Saving…') : L('حفظ صلاحيات الدور', 'Save role permissions')}
      </button>
    </div>
  );
}
