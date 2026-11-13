'use client';

import { ApiForm } from '@/components/forms';
import { localDateTimeToIso } from '@/components/ops';
import type { Locale } from '@/lib/i18n';

/** Records a courier fee paid separately (GROSS_REMITTANCE). Posted payments are never edited. */
export function FeePaymentForm({ courierId, locale }: { courierId: string; locale: Locale }) {
  const L = (ar: string, en: string) => (locale === 'ar' ? ar : en);
  return (
    <ApiForm
      endpoint={`/api/v1/accounting/couriers/${courierId}/fee-payments`}
      idempotent
      submitLabel={L('تسجيل دفعة أجر', 'Record fee payment')}
      successMessage={L('تم تسجيل الدفعة.', 'Payment recorded.')}
      fields={[
        {
          name: 'amount',
          label: L('المبلغ (د.ع)', 'Amount (IQD)'),
          type: 'text',
          required: true,
          dir: 'ltr',
          help: L('عدد صحيح بالدينار بدون فواصل عشرية. لا يتجاوز الأجر المستحق المتبقي.', 'Whole IQD, no decimals. Cannot exceed the fee still payable.'),
        },
        { name: 'paidAt', label: L('تاريخ الدفع', 'Paid at'), type: 'datetime-local', required: true, parse: (raw) => localDateTimeToIso(raw) },
        { name: 'reference', label: L('المرجع', 'Reference'), type: 'text', required: true, help: L('رقم الحوالة أو الإيصال. يجب أن يكون فريداً لكل شركة.', 'Transfer or receipt number. Must be unique per courier.') },
      ]}
    />
  );
}
