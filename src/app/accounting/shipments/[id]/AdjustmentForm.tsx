'use client';

import { ApiForm } from '@/components/forms';
import { ADJUSTMENT_LABEL, pick } from '@/components/ops';
import type { Locale } from '@/lib/i18n';

/**
 * Approved financial change. Expected COD only changes through these rows. Reductions are entered as negatives.
 */
export function AdjustmentForm({ shipmentId, locale }: { shipmentId: string; locale: Locale }) {
  const L = (ar: string, en: string) => (locale === 'ar' ? ar : en);
  return (
    <ApiForm
      endpoint={`/api/v1/accounting/shipments/${shipmentId}/adjustments`}
      idempotent
      submitLabel={L('تسجيل التعديل', 'Record adjustment')}
      successMessage={L('تم تسجيل التعديل.', 'Adjustment recorded.')}
      fields={[
        {
          name: 'type',
          label: L('النوع', 'Type'),
          type: 'select',
          required: true,
          options: Object.keys(ADJUSTMENT_LABEL).map((k) => ({ value: k, label: pick(ADJUSTMENT_LABEL[k], locale) })),
          help: L(
            'الرفض والمرتجع والخصم والاسترداد تُدخل كقيمة سالبة. تصحيح الشركة لا يُسمح به قبل تأكيد التحصيل.',
            'Rejections, returns, discounts and refunds are entered as negative values. Courier corrections need a confirmed collection first.',
          ),
        },
        {
          name: 'signedAmount',
          label: L('المبلغ (د.ع) — سالب للتخفيض', 'Amount (IQD) — negative to reduce'),
          type: 'text',
          required: true,
          dir: 'ltr',
          placeholder: '-5000',
          help: L('عدد صحيح بالدينار بدون فواصل عشرية. مثال: -5000 لتخفيض 5,000 د.ع.', 'Whole IQD, no decimals. Example: -5000 reduces by 5,000 IQD.'),
        },
        { name: 'reason', label: L('السبب', 'Reason'), type: 'text', required: true, help: L('اذكر المصدر: محضر الرفض، رقم الإرجاع، إلخ.', 'State the source: rejection note, return number, etc.') },
      ]}
    />
  );
}
