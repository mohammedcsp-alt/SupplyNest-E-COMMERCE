import 'server-only';
import { config } from '@/lib/config';
import { logger } from '@/lib/logger';

/**
 * OTP delivery adapter (spec 19.1 / OPEN-07).
 * - mock: development simulator. Returns the code to the caller ONLY outside production, and it is
 *   visibly labelled as a dev code. It is never written to logs.
 * - sms: production adapter placeholder. Not functional in V1 (no provider credentials); it fails closed.
 */
export type OtpDelivery = { delivered: boolean; devCode?: string; provider: 'mock' | 'sms' };

export const OTP_RULES = {
  validitySeconds: 5 * 60,
  maxVerifyAttempts: 5,
  maxRequestsPerHour: 3,
  resendCooldownSeconds: 60,
} as const;

export async function deliverOtp(phone: string, code: string): Promise<OtpDelivery> {
  if (config.OTP_PROVIDER === 'mock') {
    logger.info('otp_mock_delivery', { phoneMasked: `${phone.slice(0, 5)}••••${phone.slice(-2)}` });
    return {
      delivered: false,
      provider: 'mock',
      devCode: config.isProduction ? undefined : code,
    };
  }
  // SMS provider is not implemented in V1 and must not pretend to send.
  throw new Error('SMS OTP provider is not configured in this build (development adapter only).');
}
