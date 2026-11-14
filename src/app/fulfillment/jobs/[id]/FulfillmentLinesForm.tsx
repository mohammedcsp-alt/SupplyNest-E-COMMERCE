'use client';

import { useState, type FormEvent } from 'react';
import { api } from '@/lib/client-api';
import type { Locale } from '@/lib/i18n';

/**
 * Per-line quantity entry for picking, blind checking and manager discrepancy resolution.
 * The checker mode never receives the picker's counts (the page omits them), so nothing is pre-filled.
 */

export type LineInput = {
  id: string;
  sku: string;
  title: string;
  requestedQty: number;
  /** Only passed to the client when the viewer is allowed to see it (picker's own count, or a manager). */
  pickedQty?: number | null;
  /** Only passed to managers in resolve mode. */
  checkedQty?: number | null;
};

export type LinesMode = 'pick' | 'check' | 'resolve';

export function FulfillmentLinesForm({ jobId, mode, lines, locale }: { jobId: string; mode: LinesMode; lines: LineInput[]; locale: Locale }) {
  const L = (ar: string, en: string) => (locale === 'ar' ? ar : en);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [reason, setReason] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const endpoint =
    mode === 'resolve' ? `/api/v1/fulfillment/jobs/${jobId}/discrepancy` : `/api/v1/fulfillment/jobs/${jobId}/${mode === 'pick' ? 'pick' : 'check'}`;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const payload: Array<Record<string, unknown>> = [];
    for (const l of lines) {
      const raw = (qty[l.id] ?? '').trim();
      if (raw === '') {
        setError(L('أدخل الكمية لكل سطر.', 'Enter a quantity for every line.'));
        return;
      }
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0 || n > l.requestedQty) {
        setError(L(`الكمية يجب أن تكون عدداً صحيحاً بين 0 و ${l.requestedQty} (${l.sku}).`, `Quantity must be a whole number from 0 to ${l.requestedQty} (${l.sku}).`));
        return;
      }
      const r = (reason[l.id] ?? '').trim();
      if (mode === 'pick') {
        if (n < l.requestedQty && r.length < 3) {
          setError(L(`اكتب سبب النقص للسطر ${l.sku} (3 أحرف على الأقل).`, `Give a reason for the shortage on ${l.sku} (at least 3 characters).`));
          return;
        }
        payload.push({ pickLineId: l.id, pickedQty: n, ...(n < l.requestedQty ? { reason: r } : {}) });
      } else if (mode === 'check') {
        payload.push({ pickLineId: l.id, checkedQty: n });
      } else {
        if (r.length < 3) {
          setError(L(`السبب مطلوب لكل سطر (${l.sku}).`, `A reason is required for every line (${l.sku}).`));
          return;
        }
        payload.push({ pickLineId: l.id, acceptedQty: n, reason: r });
      }
    }
    const body = mode === 'resolve' ? { lines: payload } : { action: 'submit', lines: payload };
    setBusy(true);
    const res = await api(endpoint, { method: 'POST', body });
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    window.location.reload();
  }

  const submitLabel =
    mode === 'pick' ? L('إرسال نتيجة الالتقاط', 'Submit picked quantities') : mode === 'check' ? L('إرسال العد المستقل', 'Submit independent count') : L('اعتماد الكميات المقبولة', 'Accept quantities and release job');

  return (
    <form onSubmit={onSubmit} noValidate aria-busy={busy}>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">{L('SKU', 'SKU')}</th>
              <th scope="col">{L('الصنف', 'Item')}</th>
              <th scope="col">{L('المطلوب', 'Requested')}</th>
              {mode === 'resolve' && lines.some((l) => l.pickedQty !== undefined) && <th scope="col">{L('المُلتقط', 'Picked')}</th>}
              {mode === 'resolve' && lines.some((l) => l.checkedQty !== undefined) && <th scope="col">{L('المُدقَّق', 'Checked')}</th>}
              <th scope="col">{mode === 'pick' ? L('الملتقط', 'Picked') : mode === 'check' ? L('العدد الفعلي', 'Counted') : L('الكمية المقبولة', 'Accepted qty')}</th>
              {mode !== 'check' && <th scope="col">{L('السبب', 'Reason')}</th>}
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const current = qty[l.id];
              const n = current === undefined || current === '' ? null : Number(current);
              const short = mode === 'pick' && n !== null && n < l.requestedQty;
              const needsReason = mode === 'resolve' || short;
              return (
                <tr key={l.id}>
                  <td dir="ltr">{l.sku}</td>
                  <td>{l.title}</td>
                  <td>{l.requestedQty}</td>
                  {mode === 'resolve' && lines.some((x) => x.pickedQty !== undefined) && <td>{l.pickedQty ?? '—'}</td>}
                  {mode === 'resolve' && lines.some((x) => x.checkedQty !== undefined) && <td>{l.checkedQty ?? '—'}</td>}
                  <td>
                    <input
                      id={`q-${l.id}`}
                      aria-label={L(`الكمية للسطر ${l.sku}`, `Quantity for ${l.sku}`)}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={l.requestedQty}
                      step={1}
                      value={current ?? ''}
                      onChange={(e) => setQty((s) => ({ ...s, [l.id]: e.target.value }))}
                      className="fa-qty-input"
                      aria-describedby={`h-${l.id}`}
                    />
                    <div id={`h-${l.id}`} className="field-help">
                      0–{l.requestedQty}
                    </div>
                  </td>
                  {mode !== 'check' && (
                    <td>
                      {needsReason ? (
                        <input
                          type="text"
                          aria-label={L(`السبب للسطر ${l.sku}`, `Reason for ${l.sku}`)}
                          value={reason[l.id] ?? ''}
                          onChange={(e) => setReason((s) => ({ ...s, [l.id]: e.target.value }))}
                          maxLength={500}
                          required={needsReason}
                          className="fa-reason-input"
                        />
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? '…' : submitLabel}
      </button>
    </form>
  );
}
