import Link from 'next/link';
import type { Locale } from '@/lib/i18n';

/** Section links shown on every accounting screen. Plain server component. */
export function AccountingNav({ locale, current }: { locale: Locale; current?: string }) {
  const items: Array<{ href: string; ar: string; en: string }> = [
    { href: '/accounting', ar: 'لوحة الحسابات', en: 'Dashboard' },
    { href: '/accounting/couriers', ar: 'شركات التوصيل والاتفاقيات', en: 'Couriers & agreements' },
    { href: '/accounting/shipments', ar: 'الشحنات', en: 'Shipments' },
    { href: '/accounting/remittances', ar: 'التحويلات المستلمة', en: 'Transfers received' },
    { href: '/accounting/reconciliation', ar: 'المطابقة', en: 'Reconciliation' },
    { href: '/accounting/reports', ar: 'التقارير', en: 'Reports' },
    { href: '/accounting/customers', ar: 'أجور توصيل العملاء', en: 'Customer delivery fees' },
  ];
  return (
    <nav aria-label={locale === 'ar' ? 'قسم الحسابات' : 'Accounting sections'} className="fa-nav">
      {items.map((i) => (
        <Link key={i.href} href={i.href} className={`btn btn-small${current === i.href ? ' btn-primary' : ''}`} aria-current={current === i.href ? 'page' : undefined}>
          {locale === 'ar' ? i.ar : i.en}
        </Link>
      ))}
    </nav>
  );
}
