import type { FieldDef } from '@/components/forms';
import { pick, type Loc } from './shared';

/**
 * Field definitions for the address ApiForm. Governorates and areas come from the database (active rows only),
 * so the options are built on the server and passed to the form as plain data.
 */
export function addressFormFields(
  locale: Loc,
  governorates: Array<{ id: string; nameAr: string; nameEn: string }>,
  areas: Array<{ id: string; nameAr: string; nameEn: string; governorate: { nameAr: string; nameEn: string } }>,
): FieldDef[] {
  const L = (ar: string, en: string) => (locale === 'ar' ? ar : en);
  return [
    { name: 'label', label: L('اسم العنوان (اختياري)', 'Address label (optional)'), type: 'text', placeholder: L('المنزل، المكتب…', 'Home, office…') },
    {
      name: 'governorateId',
      label: L('المحافظة', 'Governorate'),
      type: 'select',
      required: true,
      options: governorates.map((g) => ({ value: g.id, label: pick(locale, g.nameAr, g.nameEn) })),
    },
    {
      name: 'areaId',
      label: L('المنطقة', 'Area'),
      type: 'select',
      help: L('اختر منطقة تابعة للمحافظة نفسها (اختياري إن لم تتوفر).', 'Pick an area inside the same governorate (optional if none applies).'),
      options: areas.map((a) => ({ value: a.id, label: `${pick(locale, a.governorate.nameAr, a.governorate.nameEn)} — ${pick(locale, a.nameAr, a.nameEn)}` })),
    },
    { name: 'details', label: L('العنوان التفصيلي', 'Address details'), type: 'textarea', required: true, help: L('الحي، الشارع، أقرب معلم.', 'Neighbourhood, street, nearest landmark.') },
    { name: 'recipientName', label: L('اسم المستلم', 'Recipient name'), type: 'text', required: true, autoComplete: 'name' },
    { name: 'recipientPhone', label: L('هاتف المستلم', 'Recipient phone'), type: 'tel', required: true, dir: 'ltr', autoComplete: 'tel' },
    { name: 'isDefault', label: L('اجعله العنوان الافتراضي', 'Make this my default address'), type: 'checkbox', defaultValue: false },
  ];
}
