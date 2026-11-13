'use client';

import { ApiForm } from '@/components/forms';
import { localDateTimeToIso, METHOD_LABEL, pick } from '@/components/ops';
import type { Locale } from '@/lib/i18n';

/** Records money received from a courier. Allocation to shipments is a separate step. */
export function RemittanceForm({ couriers, locale }: { couriers: Array<{ id: string; name: string }>; locale: Locale }) {
  const L = (ar: string, en: string) => (locale === 'ar' ? ar : en);
  return (
    <ApiForm
      endpoint="/api/v1/accounting/remittances"
      idempotent
      submitLabel={L('تسجيل التحويل', 'Record transfer')}
      successMessage={L('تم تسجيل التحويل.', 'Transfer recorded.')}
      fields={[
        { name: 'courierId', label: L('الشركة', 'Courier'), type: 'select', required: true, options: couriers.map((c) => ({ value: c.id, label: c.name })) },
        { name: 'reference', label: L('المرجع', 'Reference'), type: 'text', required: true, dir: 'ltr', help: L('فريد لكل شركة. التكرار يُرفض.', 'Unique per courier. Duplicates are refused.') },
        {
          name: 'grossAmount',
          label: L('المبلغ المستلم (د.ع)', 'Amount received (IQD)'),
          type: 'text',
          required: true,
          dir: 'ltr',
          help: L('عدد صحيح بالدينار بدون فواصل عشرية.', 'Whole IQD, no decimals.'),
        },
        { name: 'receivedAt', label: L('تاريخ الاستلام', 'Received at'), type: 'datetime-local', required: true, parse: (raw) => localDateTimeToIso(raw) },
        {
          name: 'method',
          label: L('الطريقة', 'Method'),
          type: 'select',
          required: true,
          defaultValue: 'CASH',
          options: Object.keys(METHOD_LABEL).map((k) => ({ value: k, label: pick(METHOD_LABEL[k], locale) })),
        },
        { name: 'note', label: L('ملاحظة (اختياري)', 'Note (optional)'), type: 'text' },
      ]}
    />
  );
}
