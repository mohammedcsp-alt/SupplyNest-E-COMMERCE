'use client';

import { ApiForm } from '@/components/forms';
import type { Locale } from '@/lib/i18n';

/** First and only confirmation of COD collected. Later changes are COURIER_CORRECTION adjustments. */
export function CollectionForm({ shipmentId, locale }: { shipmentId: string; locale: Locale }) {
  const L = (ar: string, en: string) => (locale === 'ar' ? ar : en);
  return (
    <ApiForm
      endpoint={`/api/v1/accounting/shipments/${shipmentId}/collection`}
      idempotent
      submitLabel={L('تأكيد التحصيل', 'Confirm collected COD')}
      successMessage={L('تم تسجيل التحصيل.', 'Collection recorded.')}
      fields={[
        {
          name: 'collectedAmount',
          label: L('المبلغ المحصّل (د.ع)', 'Collected amount (IQD)'),
          type: 'text',
          required: true,
          dir: 'ltr',
          help: L('عدد صحيح بالدينار بدون فواصل عشرية. يُسجَّل مرة واحدة فقط ولا يُعدَّل لاحقاً.', 'Whole IQD, no decimals. Recorded once and cannot be edited later.'),
        },
        { name: 'reference', label: L('مرجع الشركة', 'Courier reference'), type: 'text', required: true, help: L('رقم كشف الشركة أو الحوالة.', 'Courier statement or transfer number.') },
      ]}
    />
  );
}
