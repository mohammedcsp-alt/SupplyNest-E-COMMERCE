import Link from 'next/link';
import { currentLocale, localized } from '@/lib/i18n';
import { Card, PageHeader } from '@/components/ui';
import { RecoverFlow } from '@/components/customer/RecoverFlow';

export const dynamic = 'force-dynamic';

export default async function RecoverPage() {
  const locale = await currentLocale();
  const L = (ar: string, en: string) => localized(locale, ar, en);
  return (
    <div style={{ maxWidth: 480, margin: '0 auto' }}>
      <PageHeader title={L('استعادة الوصول', 'Recover access')} subtitle={L('أدخل رقم هاتفك لاستلام رمز التحقق وتعيين كلمة مرور جديدة.', 'Enter your phone number to receive a code and set a new password.')} />
      <Card>
        <RecoverFlow locale={locale} />
      </Card>
      <p>
        <Link href="/login">{L('العودة إلى تسجيل الدخول', 'Back to sign in')}</Link>
      </p>
    </div>
  );
}
