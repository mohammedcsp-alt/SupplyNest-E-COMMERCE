import Link from 'next/link';
import { currentLocale, localized } from '@/lib/i18n';
import { Card } from '@/components/ui';
import { RecoverFlow } from '@/components/customer/RecoverFlow';
import { AuthShell } from '@/components/auth-shell';

export const dynamic = 'force-dynamic';

export default async function RecoverPage() {
  const locale = await currentLocale();
  const L = (ar: string, en: string) => localized(locale, ar, en);
  return (
    <AuthShell
      title={L('استعادة الوصول', 'Recover access')}
      subtitle={L('أدخل رقم هاتفك لاستلام رمز التحقق وتعيين كلمة مرور جديدة.', 'Enter your phone number to receive a code and set a new password.')}
      footer={<Link href="/login">{L('العودة إلى تسجيل الدخول', 'Back to sign in')}</Link>}
    >
      <Card>
        <RecoverFlow locale={locale} />
      </Card>
    </AuthShell>
  );
}
