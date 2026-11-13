import Link from 'next/link';
import { currentLocale, localized } from '@/lib/i18n';
import { requireSignedIn } from '@/lib/page-guards';
import { listNotifications } from '@/modules/notifications/notify';
import { EmptyState, PageHeader } from '@/components/ui';
import { NotificationList, type NotificationView } from '@/components/customer/NotificationList';
import { fmtDate } from '@/components/customer/shared';

export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  const locale = await currentLocale();
  const L = (ar: string, en: string) => localized(locale, ar, en);
  const user = await requireSignedIn('/account/notifications');
  const rows = await listNotifications(user.id);

  const items: NotificationView[] = rows.map((n) => {
    const payload = (n.payload ?? {}) as Record<string, unknown>;
    return {
      id: n.id,
      type: n.type,
      orderNumber: typeof payload.orderNumber === 'string' ? payload.orderNumber : null,
      read: !!n.readAt,
      createdAt: fmtDate(n.createdAt, locale),
    };
  });

  return (
    <section className="stack">
      <p>
        <Link href="/account">← {L('حسابي', 'My account')}</Link>
      </p>
      <PageHeader title={L('الإشعارات', 'Notifications')} subtitle={L('إشعارات داخل الموقع فقط.', 'In-site notifications only.')} />
      {items.length === 0 ? <EmptyState>{L('لا توجد إشعارات.', 'No notifications.')}</EmptyState> : <NotificationList items={items} locale={locale} />}
    </section>
  );
}
