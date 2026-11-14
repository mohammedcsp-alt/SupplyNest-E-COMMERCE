import Link from 'next/link';
import { currentLocale, localized } from '@/lib/i18n';
import { Card, Alert } from '@/components/ui';
import { ApiForm } from '@/components/forms';
import { AuthShell } from '@/components/auth-shell';

export const dynamic = 'force-dynamic';

function safeNext(v: string | undefined): string {
  return v && v.startsWith('/') && !v.startsWith('//') ? v : '/account';
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; verified?: string }> }) {
  const locale = await currentLocale();
  const sp = await searchParams;
  const next = safeNext(sp.next);
  const L = (ar: string, en: string) => localized(locale, ar, en);
  return (
    <AuthShell
      title={L('تسجيل الدخول', 'Sign in')}
      subtitle={L('أدخل رقم هاتفك وكلمة المرور للوصول إلى حسابك.', 'Enter your phone number and password to access your account.')}
      footer={
        <>
          <Link href="/recover">{L('نسيت كلمة المرور؟', 'Forgot your password?')}</Link>
          <span>
            {L('ليس لديك حساب؟', 'No account yet?')} <Link href="/register">{L('سجّل كعميل', 'Register as a customer')}</Link>
          </span>
        </>
      }
    >
      {sp.verified === '1' && <Alert tone="ok">{L('تم تأكيد الهاتف. ستعرض حسابك الأسعار بعد موافقة الإدارة.', 'Phone verified. Prices appear after an administrator approves your account.')}</Alert>}
      <Card>
        <ApiForm
          endpoint="/api/v1/auth/login"
          successHref={next}
          submitLabel={L('دخول', 'Sign in')}
          busyLabel={L('جاري الدخول…', 'Signing in…')}
          fields={[
            { name: 'phone', label: L('رقم الهاتف', 'Phone number'), type: 'tel', required: true, dir: 'ltr', autoComplete: 'tel', placeholder: '07XXXXXXXXX' },
            { name: 'password', label: L('كلمة المرور', 'Password'), type: 'password', required: true, autoComplete: 'current-password' },
          ]}
        />
      </Card>
    </AuthShell>
  );
}
