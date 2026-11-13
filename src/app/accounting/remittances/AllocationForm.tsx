'use client';

import { useState, type FormEvent } from 'react';
import { api, newIdempotencyKey } from '@/lib/client-api';
import type { Locale } from '@/lib/i18n';
import { Money } from '@/components/ui';

export type AllocationCandidate = { shipmentId: string; orderNumber: string; allocatable: string };

/**
 * Splits one transfer across shipments of the SAME courier. The server refuses over-allocation against both the
 * transfer amount and each shipment's amount still due.
 */
export function AllocationForm({
  remittanceId,
  unallocated,
  candidates,
  locale,
}: {
  remittanceId: string;
  unallocated: string;
  candidates: AllocationCandidate[];
  locale: Locale;
}) {
  const L = (ar: string, en: string) => (locale === 'ar' ? ar : en);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const allocations: Array<{ shipmentId: string; amount: string }> = [];
    for (const c of candidates) {
      const raw = (amounts[c.shipmentId] ?? '').trim();
      if (raw === '') continue;
      if (!/^\d{1,12}$/.test(raw) || raw === '0') {
        setError(L('المبالغ يجب أن تكون أعداداً صحيحة بالدينار أكبر من صفر.', 'Amounts must be whole IQD values greater than zero.'));
        return;
      }
      allocations.push({ shipmentId: c.shipmentId, amount: raw });
    }
    if (allocations.length === 0) {
      setError(L('أدخل مبلغاً لشحنة واحدة على الأقل.', 'Enter an amount for at least one shipment.'));
      return;
    }
    setBusy(true);
    const res = await api(`/api/v1/accounting/remittances/${remittanceId}/allocations`, {
      method: 'POST',
      body: { allocations },
      idempotencyKey: newIdempotencyKey(),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    window.location.reload();
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-busy={busy}>
      <p className="field-help">
        {L('غير مخصص: ', 'Unallocated: ')}
        <Money value={unallocated} locale={locale} />
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">{L('الطلب', 'Order')}</th>
              <th scope="col" className="num">{L('المتبقي على الشحنة', 'Still due on shipment')}</th>
              <th scope="col">{L('المبلغ المخصص', 'Amount to allocate')}</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((c) => (
              <tr key={c.shipmentId}>
                <td dir="ltr">{c.orderNumber}</td>
                <td className="num">
                  <Money value={c.allocatable} locale={locale} />
                </td>
                <td>
                  <input
                    type="text"
                    inputMode="numeric"
                    dir="ltr"
                    aria-label={L(`المبلغ للطلب ${c.orderNumber}`, `Amount for ${c.orderNumber}`)}
                    placeholder="0"
                    value={amounts[c.shipmentId] ?? ''}
                    onChange={(e) => setAmounts((s) => ({ ...s, [c.shipmentId]: e.target.value }))}
                    style={{ width: 140 }}
                  />
                  <div className="field-help">{L('عدد صحيح، بدون فواصل عشرية', 'Whole number, no decimals')}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? '…' : L('تخصيص التحويل', 'Allocate transfer')}
      </button>
    </form>
  );
}
