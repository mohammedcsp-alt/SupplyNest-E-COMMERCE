import { currentLocale, localized } from '@/lib/i18n';
import { Card, PageHeader } from '@/components/ui';
import { ApiForm } from '@/components/forms';
import { ResendOtp } from './ResendOtp';

export const dynamic = 'force-dynamic';

export default async function VerifyPage() {
  const locale = await currentLocale();
  const L = (ar: string, en: string) => localized(locale, ar, en);
  return (
    <div style={{ maxWidth: 480, margin: '0 auto' }}>
      <PageHeader title={L('تأكيد رقم الهاتف', 'Verify your phone')} subtitle={L('أدخل الرمز المكوّن من 6 أرقام.', 'Enter the 6-digit code.')} />
      <Card>
        <ApiForm
          endpoint="/api/v1/auth/otp/verify"
          successHref="/login?verified=1"
          submitLabel={L('تأكيد', 'Verify')}
          busyLabel={L('جاري التأكيد…', 'Verifying…')}
          fields={[
            { name: 'phone', label: L('رقم الهاتف', 'Phone number'), type: 'tel', required: true, dir: 'ltr', autoComplete: 'tel' },
            { name: 'code', label: L('رمز التحقق', 'Verification code'), required: true, dir: 'ltr', autoComplete: 'one-time-code', help: L('صالح لمدة 5 دقائق. 5 محاولات كحد أقصى.', 'Valid for 5 minutes. 5 attempts maximum.') },
          ]}
        />
      </Card>
      <ResendOtp locale={locale} />
    </div>
  );
}
