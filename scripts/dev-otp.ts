/**
 * Development only: prints the latest verification code recorded by the mock OTP adapter for one phone number.
 * Usage: npm run otp:latest -- 07701234567
 * Refuses to run in production, and refuses when the mock adapter or the development outbox is not active.
 */
import { readDevOtp } from '../src/modules/identity/dev-otp-outbox';
import { normalizeIraqPhone } from '../src/modules/identity/phone';

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function main(): Promise<void> {
  const env = process.env;
  if (env.NODE_ENV === 'production') fail('Refusing: this command is development only.');
  if (env.OTP_PROVIDER !== 'mock' && env.OTP_PROVIDER !== undefined) fail('Refusing: OTP_PROVIDER is not mock.');
  const enabled = env.DEV_OTP_OUTBOX === 'true' || (env.DEV_OTP_OUTBOX === undefined && env.NODE_ENV === 'development');
  if (!enabled) fail('Refusing: the development OTP outbox is not enabled.');

  const phone = normalizeIraqPhone(process.argv[2] ?? '');
  if (!phone) fail('Usage: npm run otp:latest -- 07XXXXXXXXX (an Iraqi mobile number).');

  const entry = await readDevOtp(env.DEV_OTP_DIR ?? './storage/dev-otp', phone);
  if (!entry) {
    console.log(`No code recorded for ${phone}. Request one first (register, or resend on the verification page).`);
    process.exit(0);
  }
  const expired = new Date(entry.expiresAt).getTime() < Date.now();
  if (expired) {
    console.log(`The latest code for ${phone} expired at ${entry.expiresAt}. Request a new one on the verification page.`);
    process.exit(0);
  }
  console.log(`Code for ${phone}: ${entry.code}`);
  console.log(`Valid until ${entry.expiresAt}. Only the most recent code is valid; a new request replaces it.`);

}

main().catch((err) => fail(String(err)));
