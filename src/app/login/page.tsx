import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentLocale, localized } from '@/lib/i18n';
import { Card, Alert, PageHeader } from '@/components/ui';
import { ApiForm } from '@/components/forms';
import { getCurrentUser } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

function safeNext(v: string | undefined): string | undefined {
  return v && v.startsWith('/') && !v.startsWith('//') ? v : undefined;
}

/**
 * Two sign-in panels on one page: customers (storefront and account) and administration (staff and owners).
 * The portal value is sent with the request, and the server enforces it (auth-service.authenticate). The page itself
 * is only a presentation layer.
 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; verified?: string; portal?: string }> }) {
  const locale = await currentLocale();
  const sp = await searchParams;
  const L = (ar: string, en: string) => localized(locale, ar, en);
  const adminFocus = sp.portal === 'admin';

  // Already signed in: go straight to the right place instead of showing the form again.
  const me = await getCurrentUser();
  if (me) {
    const isAdmin = me.userType === 'STAFF' && me.permissions.has(PERMISSIONS.ADMIN_ACCESS);
    redirect(safeNext(sp.next) ?? (isAdmin ? '/admin' : '/account'));
  }

  const customerNext = safeNext(sp.next) ?? '/account';
  const adminNext = safeNext(sp.next) ?? '/admin';

  return (
    <div className="auth-page">
      <div className="auth-wide">
        <PageHeader
          title={L('تسجيل الدخول', 'Sign in')}
          subtitle={L('اختر البوابة المناسبة لحسابك.', 'Choose the sign-in panel that matches your account.')}
        />
        {sp.verified === '1' && (
          <Alert tone="ok">
            {L('تم تأكيد الهاتف. ستعرض حسابك الأسعار بعد موافقة الإدارة.', 'Phone verified. Prices appear after an administrator approves your account.')}
          </Alert>
        )}

        <div className="auth-portals">
          <section className={`auth-portal${adminFocus ? '' : ' is-focus'}`} aria-labelledby="customer-login-title" id="customer-login">
            <h2 id="customer-login-title" className="auth-portal-title">
              {L('تسجيل دخول العملاء', 'Customer sign in')}
            </h2>
            <p className="muted auth-portal-hint">{L('للعملاء المسجلين لطلب المنتجات بالجملة.', 'For registered wholesale customers.')}</p>
            <Card>
              <ApiForm
                endpoint="/api/v1/auth/login"
                extra={{ portal: 'customer' }}
                successHref={customerNext}
                submitLabel={L('دخول العميل', 'Customer sign in')}
                busyLabel={L('جاري الدخول…', 'Signing in…')}
                fields={[
                  { name: 'phone', label: L('رقم الهاتف', 'Phone number'), type: 'tel', required: true, dir: 'ltr', autoComplete: 'tel', placeholder: '07XXXXXXXXX' },
                  { name: 'password', label: L('كلمة المرور', 'Password'), type: 'password', required: true, autoComplete: 'current-password' },
                ]}
              />
            </Card>
            <div className="auth-links">
              <Link href="/recover">{L('نسيت كلمة المرور؟', 'Forgot password?')}</Link>
              <span>
                {L('ليس لديك حساب؟', 'No account yet?')} <Link href="/register">{L('سجّل كعميل', 'Register as a customer')}</Link>
              </span>
            </div>
          </section>

          <section className={`auth-portal${adminFocus ? ' is-focus' : ''}`} aria-labelledby="admin-login-title" id="admin-login">
            <h2 id="admin-login-title" className="auth-portal-title">
              {L('تسجيل دخول الإدارة', 'Admin login')}
            </h2>
            <div className="alert alert-warn" role="note">
              {L(
                'للموظفين المصرح لهم والمالكين فقط. لا يوجد تسجيل عام لحسابات الإدارة؛ تُنشأ الحسابات من قبل مالك النظام.',
                'Authorized staff and owners only. Administrator accounts are created by the system owner; there is no public administrator registration.',
              )}
            </div>
            <Card>
              <ApiForm
                endpoint="/api/v1/auth/login"
                extra={{ portal: 'admin' }}
                successHref={adminNext}
                submitLabel={L('دخول الإدارة', 'Admin sign in')}
                busyLabel={L('جاري الدخول…', 'Signing in…')}
                fields={[
                  { name: 'phone', label: L('رقم هاتف المسؤول', 'Administrator phone number'), type: 'tel', required: true, dir: 'ltr', autoComplete: 'username', placeholder: '07XXXXXXXXX' },
                  { name: 'password', label: L('كلمة المرور', 'Password'), type: 'password', required: true, autoComplete: 'current-password' },
                ]}
              />
            </Card>
            <div className="auth-links">
              <Link href="/recover">{L('استعادة كلمة المرور (رمز إلى هاتفك المسجل)', 'Password recovery (code sent to your verified phone)')}</Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
