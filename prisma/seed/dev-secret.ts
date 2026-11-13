/**
 * Local development password for the SYNTHETIC seeded accounts.
 *
 * - Generated once with a cryptographic random source and stored in storage/dev-seed-secret.txt, which is gitignored.
 * - Never written to tracked files. Tests and the seed read it through this helper.
 * - DEV_SEED_PASSWORD (environment) overrides the file for a one-off run.
 * - Rotation: delete storage/dev-seed-secret.txt and run the seed again (every account gets a new hash and all
 *   sessions are revoked).
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

const SECRET_FILE = path.resolve(process.cwd(), 'storage', 'dev-seed-secret.txt');

export function devPassword(): string {
  if (process.env.DEV_SEED_PASSWORD && process.env.DEV_SEED_PASSWORD.length >= 10) return process.env.DEV_SEED_PASSWORD;
  if (fs.existsSync(SECRET_FILE)) return fs.readFileSync(SECRET_FILE, 'utf8').trim();
  fs.mkdirSync(path.dirname(SECRET_FILE), { recursive: true });
  // 24 random base64url characters plus a letter/digit suffix so the value satisfies the password policy
  const value = randomBytes(18).toString('base64url') + 'a9Z';
  fs.writeFileSync(SECRET_FILE, value + '\n', { encoding: 'utf8', flag: 'wx' });
  return value;
}

export const DEV_SECRET_FILE = SECRET_FILE;
