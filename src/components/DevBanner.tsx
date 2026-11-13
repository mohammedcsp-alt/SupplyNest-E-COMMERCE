import { config } from '@/lib/config';
import type { Locale } from '@/lib/i18n';

/** Shows a clear marker whenever development adapters are active (mock OTP, local DB). */
export function DevBanner({ locale }: { locale: Locale }) {
  if (config.isProduction || !config.otpMockEnabled) return null;
  return (
    <div className="dev-banner" role="note">
      {locale === 'ar'
        ? 'وضع التطوير المحلي: رموز التحقق عبر محاكٍ (Mock OTP) وليست رسائل SMS حقيقية. بيانات تجريبية موسومة فقط.'
        : 'Local development mode: verification codes come from a mock OTP adapter, not real SMS. Synthetic data only.'}
    </div>
  );
}
