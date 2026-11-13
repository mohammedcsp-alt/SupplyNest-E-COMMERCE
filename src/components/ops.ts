import type { Locale } from '@/lib/i18n';

/**
 * Client-safe labels and formatters shared by the fulfillment and accounting screens.
 * Plain data only (no server-only imports) so client components can use it.
 */

export type Bilingual = { ar: string; en: string };

export function pick(b: Bilingual, locale: Locale): string {
  return locale === 'ar' ? b.ar : b.en;
}

/** Arabic counterparts of FULFILLMENT_LABELS (English source of truth lives in modules/fulfillment/service.ts). */
export const FULFILLMENT_AR: Record<string, string> = {
  PENDING_ASSIGNMENT: 'بانتظار التكليف',
  ASSIGNED: 'مكلّف',
  PICKING: 'جاري التجهيز (الالتقاط)',
  PICKED: 'تم الالتقاط — بانتظار التدقيق',
  CHECKING: 'جاري التدقيق',
  DISCREPANCY_HOLD: 'فرق في الكميات — مراجعة المدير',
  CHECKED: 'تم التدقيق',
  PACKING: 'جاري التعليب',
  PACKED: 'تم التعليب',
  HANDED_OVER: 'سُلّم للشركة',
  CANCELLED: 'ملغى',
};

export const SETTLEMENT_LABEL: Record<string, Bilingual> = {
  NET_DEDUCTION: {
    ar: 'صافي — الشركة تخصم أجرها من COD وتحوّل الباقي',
    en: 'NET — courier deducts its fee from COD and transfers the rest',
  },
  GROSS_REMITTANCE: {
    ar: 'إجمالي — الشركة تحوّل كامل COD، ويُدفع أجر الشركة منفصلاً',
    en: 'GROSS — courier transfers the full COD; its fee is paid separately',
  },
};

export const ADJUSTMENT_LABEL: Record<string, Bilingual> = {
  REJECTION_PARTIAL: { ar: 'رفض جزئي', en: 'Partial rejection' },
  REJECTION_FULL: { ar: 'رفض كامل', en: 'Full rejection' },
  RETURN: { ar: 'مرتجع', en: 'Return' },
  CUSTOMER_REFUND: { ar: 'استرداد للعميل', en: 'Customer refund' },
  DISCOUNT: { ar: 'خصم', en: 'Discount' },
  COURIER_CORRECTION: { ar: 'تصحيح من الشركة', en: 'Courier correction' },
};

export const METHOD_LABEL: Record<string, Bilingual> = {
  CASH: { ar: 'نقدي', en: 'Cash' },
  BANK_TRANSFER: { ar: 'تحويل بنكي', en: 'Bank transfer' },
  OTHER: { ar: 'أخرى', en: 'Other' },
};

export const EVENT_LABEL: Record<string, Bilingual> = {
  JOB_CREATED: { ar: 'إنشاء مستند التجهيز', en: 'Preparation job created' },
  ASSIGNED: { ar: 'تكليف الملتقط والمدقق', en: 'Picker and checker assigned' },
  PICK_STARTED: { ar: 'بدء الالتقاط', en: 'Picking started' },
  PICK_SUBMITTED: { ar: 'تسليم الالتقاط', en: 'Picking submitted' },
  CHECK_STARTED: { ar: 'بدء التدقيق', en: 'Checking started' },
  CHECK_SUBMITTED: { ar: 'تسليم التدقيق', en: 'Check submitted' },
  DISCREPANCY_RAISED: { ar: 'تم رفع فرق في الكميات', en: 'Discrepancy raised' },
  DISCREPANCY_RESOLVED: { ar: 'تم حل الفرق', en: 'Discrepancy resolved' },
  PACK_STARTED: { ar: 'بدء التعليب', en: 'Packing started' },
  PACKAGE_ADDED: { ar: 'إضافة طرد', en: 'Parcel added' },
  PACKED: { ar: 'اكتمل التعليب', en: 'Packing finished' },
  HANDED_OVER: { ar: 'سُلّم للشركة', en: 'Handed over to courier' },
  PREP_PRINTED: { ar: 'طباعة مستند داخلي', en: 'Internal document printed' },
};

const DATE_FORMAT: Record<Locale, Intl.DateTimeFormatOptions> = {
  ar: { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Baghdad', numberingSystem: 'latn' },
  en: { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Baghdad' },
};

/** Date-time in Asia/Baghdad, with Latin digits in both locales. */
export function fmtDateTime(value: Date | string | null | undefined, locale: Locale): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', DATE_FORMAT[locale]).format(d);
}

/** Converts a datetime-local value (browser local wall time) to an ISO string; empty stays undefined. */
export function localDateTimeToIso(raw: string | boolean): string | undefined {
  if (typeof raw !== 'string' || raw.trim() === '') return undefined;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Display name for a staff or customer user, falling back to the other language and then the phone. */
export function personName(u: { fullNameAr?: string | null; fullNameEn?: string | null; phone: string }, locale: Locale): string {
  const ar = u.fullNameAr?.trim();
  const en = u.fullNameEn?.trim();
  return (locale === 'ar' ? ar || en : en || ar) || u.phone;
}
