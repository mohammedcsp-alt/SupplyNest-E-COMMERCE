import Link from 'next/link';
import { currentLocale, localized } from '@/lib/i18n';
import { requireSignedIn } from '@/lib/page-guards';
import { db } from '@/lib/db';
import { Alert, Card, PageHeader } from '@/components/ui';
import { ApiForm, type FieldDef } from '@/components/forms';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const locale = await currentLocale();
  const L = (ar: string, en: string) => localized(locale, ar, en);
  const user = await requireSignedIn('/account/profile');
  const profile = await db.customerProfile.findUnique({ where: { userId: user.id } });

  if (!profile) {
    return (
      <section className="stack">
        <PageHeader title={L('الملف الشخصي', 'Profile')} />
        <Alert tone="warn">{L('هذا الحساب لا يملك ملفًا للعميل.', 'This account has no customer profile.')}</Alert>
      </section>
    );
  }

  // Business identity is locked after approval (CUSTOMER-005): legal name is then read-only.
  const locked = profile.businessIdentityLocked;
  const fields: FieldDef[] = [
    { name: 'displayName', label: L('الاسم المعروض', 'Display name'), type: 'text', required: true, defaultValue: profile.displayName, autoComplete: 'name' },
    ...(locked
      ? []
      : [{ name: 'legalName', label: L('الاسم القانوني للمنشأة', 'Legal business name'), type: 'text' as const, defaultValue: profile.legalName ?? '', help: L('يُقفل بعد موافقة الإدارة.', 'Locked after administrator approval.') }]),
  ];

  return (
    <section className="stack">
      <p>
        <Link href="/account">← {L('حسابي', 'My account')}</Link>
      </p>
      <PageHeader title={L('الملف الشخصي', 'Profile')} />
      <Card>
        {locked && (
          <Alert tone="warn">
            {L(
              'اسم المنشأة القانوني مُقفل بعد الموافقة. للتعديل تواصل مع الدعم.',
              'The legal business name is locked after approval. Contact support to change it.',
            )}
          </Alert>
        )}
        {locked && (
          <p>
            <span className="muted">{L('الاسم القانوني:', 'Legal name:')}</span> {profile.legalName ?? '—'}
          </p>
        )}
        <ApiForm
          endpoint="/api/v1/me/profile"
          method="PATCH"
          submitLabel={L('حفظ', 'Save')}
          busyLabel={L('جاري الحفظ…', 'Saving…')}
          successMessage={L('تم حفظ الملف الشخصي.', 'Profile saved.')}
          fields={fields}
        />
      </Card>
    </section>
  );
}
