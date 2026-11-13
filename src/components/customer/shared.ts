/**
 * Helpers shared by customer pages and their client components.
 * Deliberately free of imports: client components must not pull in next/headers (i18n.ts) or Prisma (money.ts).
 */

export type Loc = 'ar' | 'en';

/** Bilingual pick with fallback to the other language when one is empty. */
export function pick(locale: Loc, ar: string | null | undefined, en: string | null | undefined): string {
  if (locale === 'ar') return (ar && ar.trim()) || en || '';
  return (en && en.trim()) || ar || '';
}

/** Formats an integer-string IQD amount (API boundary format). Latin digits in both locales. */
export function fmtIqd(value: string | number | null | undefined, locale: Loc): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const f = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);
  return locale === 'ar' ? `${f} د.ع` : `${f} IQD`;
}

/** Date/time for server-rendered pages only (fixed time zone avoids server/browser drift). */
export function fmtDate(value: string | Date, locale: Loc): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-IQ' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Baghdad' }).format(d);
}

export const ORDER_STATUS_TEXT: Record<string, [string, string]> = {
  SUBMITTED: ['مُقدَّم', 'Submitted'],
  ON_HOLD_LOCAL: ['معلّق', 'On hold'],
  CANCELLATION_REQUESTED: ['طلب إلغاء قيد المراجعة', 'Cancellation requested'],
  CANCELLED: ['ملغى', 'Cancelled'],
};

export const WARNING_TEXT: Record<string, [string, string]> = {
  SKU_UNAVAILABLE: ['هذا الصنف لم يعد معروضًا', 'This item is no longer offered'],
  NO_PRICE: ['لا يوجد سعر لمستواك لهذا الصنف', 'No price for your price level'],
  INSUFFICIENT_STOCK: ['الكمية المطلوبة أكبر من المتوفر', 'Not enough stock for the requested quantity'],
  QTY_LIMIT: ['تجاوزت الحد الأقصى للكمية لكل صنف', 'Maximum quantity per item exceeded'],
};

export const NOTIFICATION_TEXT: Record<string, [string, string]> = {
  'order.submitted': ['تم استلام طلبك', 'Your order was received'],
  'order.cancelled': ['تم إلغاء الطلب', 'Your order was cancelled'],
  'order.cancellation_rejected': ['تم رفض طلب الإلغاء', 'Your cancellation request was declined'],
  'account.approved': ['تمت الموافقة على حسابك', 'Your account was approved'],
  'account.rejected': ['لم تتم الموافقة على حسابك', 'Your account was not approved'],
  'account.suspended': ['تم تعليق حسابك', 'Your account was suspended'],
  'account.reactivated': ['تمت إعادة تفعيل حسابك', 'Your account was reactivated'],
};

export const MAX_QTY_PER_SKU = 100;
