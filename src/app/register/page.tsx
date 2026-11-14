import Link from 'next/link';
import { currentLocale, localized } from '@/lib/i18n';
import { Card } from '@/components/ui';
import { ApiForm } from '@/components/forms';
import { AuthShell } from '@/components/auth-shell';

export const dynamic = 'force-dynamic';

export default async function RegisterPage() {
  const locale = await currentLocale();
  const L = (ar: string, en: string) => localized(locale, ar, en);
  return (
    <AuthShell
      title={L('تسجيل عميل جديد', 'Register as a customer')}
      subtitle={L(
        'بعد تأكيد الهاتف تراجع الإدارة الطلب وتحدد مستوى السعر. الأسعار لا تظهر قبل الموافقة.',
        'After phone verification the administration reviews your request and assigns a price level. Prices are hidden until approval.',
      )}
      steps={{
        ariaLabel: L('مراحل التسجيل', 'Registration steps'),
        labels: [L('إنشاء الحساب', 'Create account'), L('تأكيد الهاتف', 'Verify phone'), L('موافقة الإدارة', 'Admin approval')],
        current: 0,
      }}
      footer={<Link href="/login">{L('لدي حساب بالفعل', 'I already have an account')}</Link>}
    >
      <Card>
        <ApiForm
          endpoint="/api/v1/auth/register"
          successLink={{ href: '/verify', label: localized(locale, 'متابعة التحقق من الهاتف', 'Continue to phone verification') }}
          submitLabel={L('إنشاء الحساب', 'Create account')}
          busyLabel={L('جاري الإنشاء…', 'Creating…')}
          successMessage={L('تم إنشاء الحساب. أدخل رمز التحقق المرسل إلى هاتفك.', 'Account created. Enter the verification code sent to your phone.')}
          fields={[
            { name: 'name', label: L('الاسم الكامل', 'Full name'), required: true, autoComplete: 'name' },
            { name: 'businessName', label: L('اسم النشاط التجاري (اختياري)', 'Business name (optional)') },
            { name: 'phone', label: L('رقم الهاتف', 'Phone number'), type: 'tel', required: true, dir: 'ltr', autoComplete: 'tel', placeholder: '07XXXXXXXXX', help: L('رقم عراقي يبدأ بـ 07', 'Iraqi mobile number starting 07') },
            { name: 'password', label: L('كلمة المرور', 'Password'), type: 'password', required: true, autoComplete: 'new-password', help: L('10 أحرف على الأقل، تتضمن حرفًا ورقمًا', 'At least 10 characters, including a letter and a digit') },
          ]}
        />
      </Card>
    </AuthShell>
  );
}
