'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client-api';
import { pick, type Loc } from './shared';

export type GeoOption = { id: string; nameAr: string; nameEn: string; governorateId?: string };
export type AddressView = {
  id: string;
  label: string | null;
  governorateId: string;
  areaId: string | null;
  details: string;
  recipientName: string;
  recipientPhone: string;
  isDefault: boolean;
  governorateAr: string;
  governorateEn: string;
  areaAr: string | null;
  areaEn: string | null;
};

/**
 * One saved address: view, edit (PATCH /api/v1/me/addresses/[id]), make default, delete (soft delete).
 * Areas are filtered by the chosen governorate; the server re-validates the pair.
 */
export function AddressCard({
  address,
  governorates,
  areas,
  locale,
}: {
  address: AddressView;
  governorates: GeoOption[];
  areas: GeoOption[];
  locale: Loc;
}) {
  const ar = locale === 'ar';
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    label: address.label ?? '',
    governorateId: address.governorateId,
    areaId: address.areaId ?? '',
    details: address.details,
    recipientName: address.recipientName,
    recipientPhone: address.recipientPhone,
  });
  const areaOptions = areas.filter((a) => a.governorateId === form.governorateId);

  async function run(method: 'PATCH' | 'DELETE', body?: Record<string, unknown>) {
    setBusy(true);
    setErr(null);
    const res = await api(`/api/v1/me/addresses/${address.id}`, { method, body });
    setBusy(false);
    if (!res.ok) {
      setErr(res.message);
      return false;
    }
    router.refresh();
    return true;
  }

  async function saveEdit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const ok = await run('PATCH', {
      label: form.label.trim() || null,
      governorateId: form.governorateId,
      areaId: form.areaId || null,
      details: form.details.trim(),
      recipientName: form.recipientName.trim(),
      recipientPhone: form.recipientPhone.trim(),
    });
    if (ok) setEditing(false);
  }

  async function remove() {
    if (!window.confirm(ar ? 'حذف هذا العنوان؟ لن تتأثر الطلبات السابقة.' : 'Delete this address? Past orders keep their copy.')) return;
    await run('DELETE');
  }

  const title = address.label || pick(locale, address.governorateAr, address.governorateEn);

  if (editing) {
    const id = `addr-${address.id}`;
    return (
      <form className="card" onSubmit={saveEdit} aria-busy={busy}>
        <div className="field">
          <label htmlFor={`${id}-label`}>{ar ? 'اسم العنوان (اختياري)' : 'Address label (optional)'}</label>
          <input id={`${id}-label`} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} maxLength={80} />
        </div>
        <div className="field">
          <label htmlFor={`${id}-gov`}>{ar ? 'المحافظة' : 'Governorate'} *</label>
          <select
            id={`${id}-gov`}
            value={form.governorateId}
            onChange={(e) => setForm({ ...form, governorateId: e.target.value, areaId: '' })}
            required
          >
            {governorates.map((g) => (
              <option key={g.id} value={g.id}>
                {pick(locale, g.nameAr, g.nameEn)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-area`}>{ar ? 'المنطقة' : 'Area'}</label>
          <select id={`${id}-area`} value={form.areaId} onChange={(e) => setForm({ ...form, areaId: e.target.value })}>
            <option value="">—</option>
            {areaOptions.map((a) => (
              <option key={a.id} value={a.id}>
                {pick(locale, a.nameAr, a.nameEn)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-details`}>{ar ? 'العنوان التفصيلي' : 'Address details'} *</label>
          <textarea id={`${id}-details`} value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} required minLength={3} maxLength={500} />
        </div>
        <div className="field">
          <label htmlFor={`${id}-name`}>{ar ? 'اسم المستلم' : 'Recipient name'} *</label>
          <input id={`${id}-name`} value={form.recipientName} onChange={(e) => setForm({ ...form, recipientName: e.target.value })} required minLength={2} maxLength={120} />
        </div>
        <div className="field">
          <label htmlFor={`${id}-phone`}>{ar ? 'هاتف المستلم' : 'Recipient phone'} *</label>
          <input id={`${id}-phone`} type="tel" dir="ltr" value={form.recipientPhone} onChange={(e) => setForm({ ...form, recipientPhone: e.target.value })} required minLength={7} maxLength={20} />
        </div>
        {err && (
          <p className="alert alert-error" role="alert">
            {err}
          </p>
        )}
        <div className="row">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? '…' : ar ? 'حفظ' : 'Save'}
          </button>
          <button type="button" className="btn" disabled={busy} onClick={() => setEditing(false)}>
            {ar ? 'إلغاء' : 'Cancel'}
          </button>
        </div>
      </form>
    );
  }

  return (
    <article className="card" aria-label={title}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong>{title}</strong>
        {address.isDefault && <span className="badge badge-ok">{ar ? 'افتراضي' : 'Default'}</span>}
      </div>
      <div className="muted">
        {pick(locale, address.governorateAr, address.governorateEn)}
        {(address.areaAr || address.areaEn) && ` — ${pick(locale, address.areaAr, address.areaEn)}`}
      </div>
      <div>{address.details}</div>
      <div className="muted" dir="ltr" style={{ textAlign: 'start' }}>
        {address.recipientName} · {address.recipientPhone}
      </div>
      {err && (
        <p className="alert alert-error" role="alert">
          {err}
        </p>
      )}
      <div className="row" style={{ marginBlockStart: 10 }}>
        <button type="button" className="btn btn-small" disabled={busy} onClick={() => setEditing(true)}>
          {ar ? 'تعديل' : 'Edit'}
        </button>
        {!address.isDefault && (
          <button type="button" className="btn btn-small" disabled={busy} onClick={() => run('PATCH', { isDefault: true })}>
            {ar ? 'اجعله افتراضيًا' : 'Make default'}
          </button>
        )}
        <button type="button" className="btn btn-danger btn-small" disabled={busy} onClick={remove}>
          {ar ? 'حذف' : 'Delete'}
        </button>
      </div>
    </article>
  );
}
