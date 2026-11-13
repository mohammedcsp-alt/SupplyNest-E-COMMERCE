/**
 * SMS provider adapter (CUSTOMER-002). Pure HTTP client: it receives its settings from the caller and never reads
 * the environment itself (see ./config.ts for the environment binding).
 *
 * Guarantees:
 * - One attempt per message. No retries, so a timed-out send can never duplicate an OTP code.
 * - A hard timeout (AbortController). A slow provider fails the request instead of hanging the login flow.
 * - The message body, which contains the code, is never logged and never echoed in errors.
 * - Provider response bodies are not included in errors (they may echo request data).
 *
 * The HTTP contract below is a generic JSON shape. The real provider's contract is NOT known in this environment:
 * the owner must confirm the endpoint, payload fields and sender-ID rules with the chosen provider before production.
 */

export type SmsMessage = {
  /** E.164 phone number, e.g. +9647700000001 */
  to: string;
  text: string;
};

export type SmsSendResult = { accepted: true; providerMessageId: string | null };

export interface SmsProvider {
  readonly name: string;
  send(message: SmsMessage): Promise<SmsSendResult>;
}

export class SmsProviderError extends Error {
  readonly name = 'SmsProviderError';
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
  }
}

export type HttpSmsProviderOptions = {
  url: string;
  apiKey: string;
  senderId?: string;
  timeoutMs: number;
  /** Injected for tests. Defaults to the global fetch. */
  fetchImpl?: typeof fetch;
};

export function createHttpSmsProvider(opts: HttpSmsProviderOptions): SmsProvider {
  if (!opts.url) throw new SmsProviderError('SMS provider URL is not configured (SMS_PROVIDER_URL).', null);
  if (!opts.apiKey) throw new SmsProviderError('SMS provider API key is not configured (SMS_PROVIDER_API_KEY).', null);
  if (!Number.isInteger(opts.timeoutMs) || opts.timeoutMs < 1) throw new SmsProviderError('SMS timeout must be a positive integer.', null);
  const doFetch = opts.fetchImpl ?? fetch;

  return {
    name: 'http',
    async send(message: SmsMessage): Promise<SmsSendResult> {
      // One timer covers the request AND the body read, so a provider that stalls at any point is cut off.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
      try {
        let res: Response;
        try {
          res = await doFetch(opts.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
              Authorization: `Bearer ${opts.apiKey}`,
            },
            body: JSON.stringify({ to: message.to, text: message.text, ...(opts.senderId ? { from: opts.senderId } : {}) }),
            signal: controller.signal,
            redirect: 'error',
            cache: 'no-store',
          });
        } catch (err) {
          if (controller.signal.aborted) {
            throw new SmsProviderError(`SMS provider did not answer within ${opts.timeoutMs} ms.`, null);
          }
          // Network-level failure. The original error text is not forwarded in case it contains the URL or headers.
          throw new SmsProviderError(`SMS provider could not be reached (${(err as Error).name || 'network error'}).`, null);
        }

        if (!res.ok) {
          // The body is read only to release the connection. Its content is deliberately not surfaced.
          await res.text().catch(() => '');
          throw new SmsProviderError(`SMS provider rejected the message with HTTP ${res.status}.`, res.status);
        }

        let providerMessageId: string | null = null;
        const json = (await res.json().catch(() => null)) as { id?: unknown; messageId?: unknown } | null;
        const candidate = json?.id ?? json?.messageId;
        if (typeof candidate === 'string' && candidate.length <= 200) providerMessageId = candidate;
        return { accepted: true, providerMessageId };
      } catch (err) {
        if (err instanceof SmsProviderError) throw err;
        if (controller.signal.aborted) throw new SmsProviderError(`SMS provider did not answer within ${opts.timeoutMs} ms.`, null);
        throw new SmsProviderError('SMS provider response could not be read.', null);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
