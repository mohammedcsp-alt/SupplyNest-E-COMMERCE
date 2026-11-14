// Authenticated visual review (V3.3). Uses a stored development session per role (storage/auth/<role>.json, created by
// scripts/auth-states.mjs with one login per role). Captures pages for each locale and width. Login is never repeated
// per capture, and rate limits are not bypassed.
// Usage: node scripts/ui-review-auth.mjs --role manager|customer|... --pages /admin,/admin/cms --locales en,ar --widths 1440,390
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureAuthState, BASE } from './auth-states.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, cur, i, all) => {
  if (cur.startsWith('--')) acc.push([cur.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']);
  return acc;
}, []));
const OUT = args.out ?? 'docs/ui-review';
const role = args.role ?? 'manager';
const pages = (args.pages ?? '/admin').split(',');
const locales = (args.locales ?? 'en').split(',');
const widths = (args.widths ?? '1440').split(',').map(Number);

const auth = await ensureAuthState(role);
if (auth.error) {
  console.log(`no authenticated state for ${role}: ${auth.error}`);
  process.exit(1);
}

await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const report = [];
for (const locale of locales) {
  for (const width of widths) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      locale: locale === 'ar' ? 'ar-IQ' : 'en-US',
      storageState: auth.file,
    });
    await context.addCookies([{ name: 'b2b_locale', value: locale, url: BASE }]);
    const page = await context.newPage();
    for (const route of pages) {
      const res = await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 90000 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      const name = route.replace(/^\//, '').replace(/[/?&=]/g, '_') || 'home';
      const file = path.join(OUT, `auth-${role}-${name}__${locale}__${width}.png`);
      await page.screenshot({ path: file, fullPage: true });
      report.push({ route, role, locale, width, status: res?.status() ?? 0, overflow, file });
      console.log(`${res?.status()} ${route} ${locale} ${width}px overflow=${overflow}px`);
    }
    await context.close();
  }
}
await browser.close();
console.log(`done: ${report.length}`);
