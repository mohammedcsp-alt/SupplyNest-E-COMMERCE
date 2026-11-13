'use client';

import { ApiForm } from '@/components/forms';
import { localDateTimeToIso } from '@/components/ops';
import type { Locale } from '@/lib/i18n';

/** Effective-dated courier agreement. Datetime-local values are converted to ISO on the client. */
export function AgreementForm({ couriers, locale, defaultCourierId }: { couriers: Array<{ id: string; name: string }>; locale: Locale; defaultCourierId?: string }) {
  const L = (ar: string, en: string) => (locale === 'ar' ? ar : en);
  return (
    <ApiForm
      endpoint="/api/v1/accounting/agreements"
      idempotent={false}
      submitLabel={L('حفظ الاتفاقية', 'Save agreement')}
      successMessage={L('تم حفظ الاتفاقية.', 'Agreement saved.')}
      fields={[
        { name: 'courierId', label: L('الشركة', 'Courier'), type: 'select', required: true, defaultValue: defaultCourierId, options: couriers.map((c) => ({ value: c.id, label: c.name })) },
        {
          name: 'settlementMode',
          label: L('طريقة التسوية', 'Settlement method'),
          type: 'select',
          required: true,
          options: [
            { value: 'NET_DEDUCTION', label: L('صافي: الشركة تخصم أجرها من COD', 'NET: courier deducts its fee from COD') },
            { value: 'GROSS_REMITTANCE', label: L('إجمالي: الشركة تحوّل كامل COD ويُدفع الأجر منفصلاً', 'GROSS: courier transfers full COD; fee paid separately') },
          ],
          help: L(
            'تُثبَّت الطريقة على كل شحنة عند التسليم للشركة. تغيير الاتفاقية لاحقاً لا يغيّر الشحنات السابقة.',
            'The method is locked per shipment at handover. Changing the agreement later does not change earlier shipments.',
          ),
        },
        {
          name: 'effectiveFrom',
          label: L('ساري من', 'Effective from'),
          type: 'datetime-local',
          required: true,
          parse: (raw) => localDateTimeToIso(raw),
        },
        {
          name: 'effectiveTo',
          label: L('ساري حتى (اختياري)', 'Effective until (optional)'),
          type: 'datetime-local',
          parse: (raw) => localDateTimeToIso(raw),
        },
        {
          name: 'serviceFee',
          label: L('أجر الشركة لكل شحنة (د.ع)', 'Courier fee per shipment (IQD)'),
          type: 'text',
          required: true,
          dir: 'ltr',
          placeholder: '5000',
          help: L('عدد صحيح بالدينار بدون فواصل عشرية. 0 مسموح.', 'Whole IQD, no decimals. 0 is allowed.'),
        },
        {
          name: 'returnFee',
          label: L('أجر الإرجاع (اختياري)', 'Return fee (optional)'),
          type: 'text',
          dir: 'ltr',
          placeholder: '0',
          help: L('عدد صحيح بالدينار. يُترك فارغاً للصفر.', 'Whole IQD. Leave empty for 0.'),
        },
        {
          name: 'reason',
          label: L('سبب الاتفاقية', 'Reason'),
          type: 'text',
          required: true,
          help: L('مثال: تعاقد جديد، تعديل السعر حسب الاتفاق.', 'e.g. new contract, rate change agreed.'),
        },
      ]}
    />
  );
}
