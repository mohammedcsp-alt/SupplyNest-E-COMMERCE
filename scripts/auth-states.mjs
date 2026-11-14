// Development-only authenticated browser states (V3.3 testing).
// Logs each development role in ONCE through the normal login API and stores the resulting session cookie in a
// gitignored file (storage/auth/<role>.json). Later captures reuse the stored state, so they do not repeat logins.
// Rate limits are never bypassed: a 429 is reported and that role is skipped until its window resets.
// Usage: node scripts/auth-states.mjs [--roles manager,customer] [--refresh]
import { request } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

export const BASE = process.env.UI_BASE ?? 'http://127.0.0.1:3200';
export const AUTH_DIR = path.resolve('storage/auth');

// Phones come from prisma/seed (synthetic development accounts; see DEV-CREDENTIALS.local.md).
export const ROLE_PHONE = {
  customer: '+9647700001001',
  manager: '+9647700000001',
  catalog: '+9647700000003',
  inventory: '+9647700000004',
  orders: '+9647700000005',
  picker: '+9647700000006',
  checker: '+9647700000008',
  packer: '+9647700000009',
  accountant: '+9647700000010',
  reports: '+9647700000012',
};

function sessionExpiry(state) {
  const c = state.cookies.find((x) => x.name === 'b2b_session');
  return c ? c.expires * 1000 : 0;
}

export async function ensureAuthState(role, { refresh = false } = {}) {
  const file = path.join(AUTH_DIR, `${role}.json`);
  if (!refresh) {
    try {
      const st = JSON.parse(await fs.readFile(file, 'utf8'));
      // Reuse while the stored session still has at least 10 minutes left.
      if (sessionExpiry(st) - Date.now() > 10 * 60 * 1000) return { file, reused: true };
    } catch {
      /* no stored state yet */
    }
  }
  const pw = (await fs.readFile('storage/dev-seed-secret.txt', 'utf8')).trim().split(/\s+/)[0];
  const api = await request.newContext({ baseURL: BASE, extraHTTPHeaders: { 'Content-Type': 'application/json' } });
  const res = await api.post('/api/v1/auth/login', { data: { phone: ROLE_PHONE[role], password: pw } });
  if (!res.ok()) {
    await api.dispose();
    return { file, error: `login ${res.status()}` };
  }
  await fs.mkdir(AUTH_DIR, { recursive: true });
  await api.storageState({ path: file });
  await api.dispose();
  return { file, reused: false };
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('auth-states.mjs')) {
  const args = Object.fromEntries(process.argv.slice(2).reduce((acc, cur, i, all) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']);
    return acc;
  }, []));
  const roles = (args.roles ?? Object.keys(ROLE_PHONE).join(',')).split(',');
  for (const role of roles) {
    const r = await ensureAuthState(role, { refresh: args.refresh === 'true' });
    console.log(role, r.error ? `FAILED ${r.error}` : r.reused ? 'reused stored state' : 'logged in once, state saved');
  }
}
