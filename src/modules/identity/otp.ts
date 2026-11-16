import 'server-only';
import { config } from '@/lib/config';
import { logger } from '@/lib/logger';
import { AppError } from '@/lib/errors';
import { smsProviderFromConfig } from '@/integrations/sms/config';
import { devOtpOutboxAllowed, writeDevOtp } from './dev-otp-outbox';

/**
 * OTP delivery adapter (spec 19.1 / OPEN-07 / CUSTOMER-002).
 * - mock: DEVELOPMENT SIMULATOR ONLY. Returns the code to the caller as devCode outside production. It is never sent
 *   to a phone and is refused at startup in production (assertProductionSafe).
 * - sms: real delivery through the HTTP provider in src/integrations/sms (configured by environment only).
 *   It is not active until SMS_PROVIDER_URL and SMS_PROVIDER_API_KEY are set and the owner has chosen a provider.
 * The code is never written to logs.
 */
export type OtpDelivery = { delivered: boolean; devCode?: string; provider: 'mock' | 'sms' };

export const OTP_RULES = {
  validitySeconds: 5 * 60,
  maxVerifyAttempts: 5,
  maxRequestsPerHour: 3,
  resendCooldownSeconds: 60,
} as const;

export function otpMessageText(code: string): string {
  return `Verification code: ${code}. Valid for ${OTP_RULES.validitySeconds / 60} minutes. Do not share it.`;
}

export async function deliverOtp(phone: string, code: string): Promise<OtpDelivery> {
  if (config.OTP_PROVIDER === 'mock') {
    // DEVELOPMENT MOCK: no SMS is sent. The code is returned to the caller only outside production.
    logger.info('otp_mock_delivery', { phoneMasked: `${phone.slice(0, 5)}••••${phone.slice(-2)}` });
    // Development outbox (local operator file, never HTTP): lets the developer read the code for their own number.
    if (devOtpOutboxAllowed({ isProduction: config.isProduction, enabled: config.DEV_OTP_OUTBOX, provider: config.OTP_PROVIDER })) {
      await writeDevOtp(config.DEV_OTP_DIR, phone, code, OTP_RULES.validitySeconds);
    }
    return {
      delivered: false,
      provider: 'mock',
      devCode: config.isProduction ? undefined : code,
    };
  }

  // Real SMS. A missing URL or key fails here, closed, with a configuration error (never a silent success).
  const provider = smsProviderFromConfig();
  try {
    await provider.send({ to: phone, text: otpMessageText(code) });
  } catch (err) {
    // The provider error text never contains the code. The phone number is not logged.
    logger.warn('otp_sms_failed', { provider: provider.name, reason: (err as Error).message });
    throw new AppError('INTERNAL_ERROR', 'The verification code could not be sent. Please try again in a few minutes.');
  }
  return { delivered: true, provider: 'sms' };
}
