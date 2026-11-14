// Authenticated visual review (V3.3). Logs in through the normal API with a DEVELOPMENT account from the gitignored
// DEV-CREDENTIALS.local.md (the password is read at runtime and never printed), then captures pages.
// Usage: node scripts/ui-review-auth.mjs --role manager|customer --pages /admin,/admin/cms --locales en,ar --widths 1440,390
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, cur, i, all) => {
  if (cur.startsWith('--')) acc.push([cur.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']);
  return acc;
}, []));
const BASE = process.env.UI_BASE ?? 'http://127.0.0.1:3200';
const OUT = args.out ?? 'docs/ui-review';
const ROLE_PHONE = { manager: '+9647700000001', customer: '+9647700001001', catalog: '+9647700000003' };
const phone = ROLE_PHONE[args.role ?? 'manager'];
const pages = (args.pages ?? '/admin').split(',');
const locales = (args.locales ?? 'en').split(',');
const widths = (args.widths ?? '1440').split(',').map(Number);
const credFile = await fs.readFile(path.resolve('storage/dev-seed-secret.txt'), 'utf8');
const password = credFile.trim().split(/\s+/)[0];
if (!password) throw new Error('Development secret not found in storage/dev-seed-secret.txt');

await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const report = [];
for (const locale of locales) {
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, locale: locale === 'ar' ? 'ar-IQ' : 'en-US' });
    await context.addCookies([{ name: 'b2b_locale', value: locale, url: BASE }]);
    const login = await context.request.post(`${BASE}/api/v1/auth/login`, { data: { phone, password }, headers: { 'Content-Type': 'application/json' } });
    if (!login.ok()) {
      console.log(`login failed for ${args.role} (${login.status()})`);
      await context.close();
      continue;
    }
    const page = await context.newPage();
    for (const route of pages) {
      const res = await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 90000 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      const name = route.replace(/^\//, '').replace(/[/?&=]/g, '_') || 'home';
      const file = path.join(OUT, `auth-${args.role}-${name}__${locale}__${width}.png`);
      await page.screenshot({ path: file, fullPage: true });
      report.push({ route, role: args.role, locale, width, status: res?.status() ?? 0, overflow, file });
      console.log(`${res?.status()} ${route} ${locale} ${width}px overflow=${overflow}px`);
    }
    await context.close();
  }
}
await browser.close();
console.log(`done: ${report.length}`);
