'use client';

import { ApiForm } from '@/components/forms';
import type { Locale } from '@/lib/i18n';

export function CourierForm({ locale }: { locale: Locale }) {
  const L = (ar: string, en: string) => (locale === 'ar' ? ar : en);
  return (
    <ApiForm
      endpoint="/api/v1/accounting/couriers"
      submitLabel={L('إضافة شركة', 'Add courier')}
      successMessage={L('تمت إضافة الشركة.', 'Courier added.')}
      fields={[
        { name: 'name', label: L('اسم الشركة', 'Courier name'), type: 'text', required: true, help: L('لا يتكرر الاسم.', 'Names must be unique.') },
        { name: 'contact', label: L('جهة الاتصال (اختياري)', 'Contact (optional)'), type: 'text' },
      ]}
    />
  );
}
