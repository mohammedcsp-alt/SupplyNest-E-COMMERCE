import { currentLocale, localized } from '@/lib/i18n';
import { requireSignedIn } from '@/lib/page-guards';
import { Card, PageHeader } from '@/components/ui';
import { ApiForm } from '@/components/forms';

export const dynamic = 'force-dynamic';

/** Signed-in password change for any account type (owner, staff or customer). Every session is signed out on success. */
export default async function PasswordPage() {
  const locale = await currentLocale();
  const L = (ar: string, en: string) => localized(locale, ar, en);
  await requireSignedIn('/account/password');
  return (
    <section className="stack" style={{ maxWidth: 520 }}>
      <PageHeader title={L('تغيير كلمة المرور', 'Change password')} subtitle={L('ستُسجَّل خروجك من كل الجلسات بعد التغيير.', 'All sessions are signed out after the change.')} />
      <Card>
        <ApiForm
          endpoint="/api/v1/auth/password/change"
          successHref="/login"
          submitLabel={L('تغيير كلمة المرور', 'Change password')}
          busyLabel={L('جارٍ الحفظ…', 'Saving…')}
          successMessage={L('تم تغيير كلمة المرور. سجّل الدخول بكلمة المرور الجديدة.', 'Password changed. Sign in with the new password.')}
          fields={[
            { name: 'currentPassword', label: L('كلمة المرور الحالية', 'Current password'), type: 'password', required: true, autoComplete: 'current-password' },
            { name: 'newPassword', label: L('كلمة المرور الجديدة', 'New password'), type: 'password', required: true, autoComplete: 'new-password', help: L('10 أحرف على الأقل، تتضمن حرفًا ورقمًا.', 'At least 10 characters, including a letter and a digit.') },
          ]}
        />
      </Card>
    </section>
  );
}
