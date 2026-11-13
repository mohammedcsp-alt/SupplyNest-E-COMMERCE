import 'server-only';
import { config } from '@/lib/config';
import { createHttpSmsProvider, type SmsProvider } from './provider';

/**
 * Builds the SMS provider from environment settings only (SMS_PROVIDER_URL, SMS_PROVIDER_API_KEY, SMS_SENDER_ID,
 * SMS_PROVIDER_TIMEOUT_MS). Throws a clear configuration error when the URL or key is missing. No provider is assumed.
 */
export function smsProviderFromConfig(): SmsProvider {
  return createHttpSmsProvider({
    url: config.SMS_PROVIDER_URL ?? '',
    apiKey: config.SMS_PROVIDER_API_KEY ?? '',
    senderId: config.SMS_SENDER_ID,
    timeoutMs: config.SMS_PROVIDER_TIMEOUT_MS,
  });
}
