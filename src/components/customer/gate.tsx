import type { ReactNode } from 'react';
import type { CurrentUser } from '@/lib/session';
import type { Locale } from '@/lib/i18n';
import { Alert } from '@/components/ui';

/**
 * Ordering and price pages: returns a notice for viewers who cannot use them, or null when the page may render.
 * Prices and ordering are never shown or enabled for anyone other than an ACTIVE customer with a price level.
 */
export function orderingGate(user: CurrentUser, locale: Locale): ReactNode | null {
  const L = (ar: string, en: string) => (locale === 'ar' ? ar : en);
  if (user.userType !== 'CUSTOMER') {
    return <Alert tone="error">{L('هذه الصفحة مخصصة لحسابات العملاء.', 'This page is for customer accounts only.')}</Alert>;
  }
  if (user.status === 'REGISTERED' || user.status === 'APPROVAL_PENDING') {
    return (
      <Alert tone="warn">
        {L(
          'حسابك بانتظار مراجعة الإدارة. تظهر الأسعار ويمكنك الطلب بعد الموافقة. يمكنك تصفح الكتالوج في الأثناء.',
          'Your account is pending review. Prices and ordering unlock after approval. You can browse the catalog meanwhile.',
        )}
      </Alert>
    );
  }
  if (user.status === 'REJECTED') {
    return <Alert tone="error">{L('لم تتم الموافقة على طلب تسجيلك. تواصل مع الدعم لمزيد من المعلومات.', 'Your registration was not approved. Contact support for details.')}</Alert>;
  }
  if (user.status === 'SUSPENDED') {
    return (
      <Alert tone="error">
        {L(
          'حسابك معلّق. لا يمكن عرض الأسعار أو تقديم طلبات جديدة، ويمكنك الاطلاع على سجل طلباتك.',
          'Your account is suspended. Prices and new orders are unavailable, but you can still view your order history.',
        )}
      </Alert>
    );
  }
  if (!user.priceLevelId) {
    return <Alert tone="warn">{L('لم يُحدَّد مستوى سعر لحسابك بعد. تواصل مع الإدارة.', 'No price level is assigned to your account yet. Contact the administrator.')}</Alert>;
  }
  return null;
}
