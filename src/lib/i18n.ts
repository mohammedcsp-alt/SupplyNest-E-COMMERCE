import 'server-only';
import { cookies } from 'next/headers';

/**
 * Locale is stored in a cookie (b2b_locale). Arabic is the default (RTL); English is LTR.
 * Every user-facing string used by the shell lives in the dictionary below; domain content
 * (product names, CMS) carries nameAr/nameEn columns and is chosen by the same locale.
 */
export const LOCALES = ['ar', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const LOCALE_COOKIE = 'b2b_locale';

export function parseLocale(value: string | undefined | null): Locale {
  return value === 'en' ? 'en' : 'ar';
}

export function dirOf(locale: Locale): 'rtl' | 'ltr' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}

export async function currentLocale(): Promise<Locale> {
  return parseLocale((await cookies()).get(LOCALE_COOKIE)?.value);
}

/** Picks the localized field, falling back to the other language if empty. */
export function localized(locale: Locale, ar: string | null | undefined, en: string | null | undefined): string {
  if (locale === 'ar') return (ar && ar.trim()) || (en ?? '');
  return (en && en.trim()) || (ar ?? '');
}

export const MESSAGES = {
  ar: {
    brand: 'منصة B2B للتجارة',
    nav: {
      home: 'الرئيسية',
      catalog: 'الكتالوج',
      search: 'بحث',
      cart: 'السلة',
      orders: 'طلباتي',
      account: 'حسابي',
      admin: 'الإدارة',
      fulfillment: 'التجهيز',
      accounting: 'الحسابات',
      login: 'تسجيل الدخول',
      register: 'تسجيل حساب',
      logout: 'خروج',
      language: 'English',
    },
    common: {
      loading: 'جاري التحميل…',
      empty: 'لا توجد عناصر',
      error: 'حدث خطأ. حاول مرة أخرى.',
      save: 'حفظ',
      cancel: 'إلغاء',
      submit: 'إرسال',
      search: 'بحث',
      unavailable: 'غير متوفر',
      available: 'متوفر',
      priceHidden: 'سجّل الدخول كعميل معتمد لعرض السعر',
      pending: 'بانتظار المراجعة',
      reason: 'السبب',
      actions: 'إجراءات',
      status: 'الحالة',
      total: 'الإجمالي',
      quantity: 'الكمية',
      sku: 'رمز SKU',
      devOnly: 'وضع التطوير فقط',
    },
    home: {
      title: 'كتالوج الجملة للأصناف الفعلية',
      intro: 'تصفح الكتالوج بحرية. الأسعار تظهر للعملاء المعتمدين فقط.',
    },
    auth: {
      phone: 'رقم الهاتف',
      password: 'كلمة المرور',
      name: 'الاسم',
      login: 'تسجيل الدخول',
      register: 'إنشاء حساب',
      verify: 'تأكيد الرمز',
      otp: 'رمز التحقق',
    },
  },
  en: {
    brand: 'B2B Trade Platform',
    nav: {
      home: 'Home',
      catalog: 'Catalog',
      search: 'Search',
      cart: 'Cart',
      orders: 'My orders',
      account: 'Account',
      admin: 'Admin',
      fulfillment: 'Fulfillment',
      accounting: 'Accounting',
      login: 'Sign in',
      register: 'Register',
      logout: 'Sign out',
      language: 'العربية',
    },
    common: {
      loading: 'Loading…',
      empty: 'Nothing to show',
      error: 'Something went wrong. Please try again.',
      save: 'Save',
      cancel: 'Cancel',
      submit: 'Submit',
      search: 'Search',
      unavailable: 'Unavailable',
      available: 'Available',
      priceHidden: 'Sign in as an approved customer to see prices',
      pending: 'Pending review',
      reason: 'Reason',
      actions: 'Actions',
      status: 'Status',
      total: 'Total',
      quantity: 'Quantity',
      sku: 'SKU',
      devOnly: 'Development mode only',
    },
    home: {
      title: 'Wholesale catalog of physical goods',
      intro: 'Browse freely. Prices are shown to approved customers only.',
    },
    auth: {
      phone: 'Phone number',
      password: 'Password',
      name: 'Name',
      login: 'Sign in',
      register: 'Create account',
      verify: 'Verify code',
      otp: 'Verification code',
    },
  },
} as const;

export type Messages = (typeof MESSAGES)['ar'];

export function messagesFor(locale: Locale): Messages {
  return MESSAGES[locale] as Messages;
}
