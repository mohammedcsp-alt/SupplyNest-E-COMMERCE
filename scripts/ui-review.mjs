// Visual review helper (V3.3). Captures full-page screenshots of running pages and reports horizontal overflow.
// Usage (dev server on 3200 must be running):
//   node scripts/ui-review.mjs [--out docs/ui-review] [--locales en,ar] [--widths 1920,1440,1024,768,390] [--pages home,catalog-grid,...]
// Screenshots contain only synthetic development data; the script never logs in (guest views only unless --cookie is given).
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, all) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']);
    return acc;
  }, []),
);

const BASE = process.env.UI_BASE ?? 'http://127.0.0.1:3200';
const OUT = args.out ?? 'docs/ui-review';
const LOCALES = (args.locales ?? 'en,ar').split(',');
const WIDTHS = (args.widths ?? '1920,1440,1024,768,390').split(',').map(Number);
const PAGES = {
  home: '/',
  'catalog-grid': '/catalog',
  'catalog-list': '/catalog?view=list',
  'catalog-compact': '/catalog?view=compact',
  'catalog-filtered': '/catalog?sort=newest',
  login: '/login',
  register: '/register',
  search: '/search?q=a',
  product: '/products/DEV-BAT-1',
  'product-tshirt': '/products/DEV-TS-L-BL',
};
const selected = (args.pages ?? Object.keys(PAGES).join(',')).split(',');

await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const report = [];

for (const locale of LOCALES) {
  for (const width of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      locale: locale === 'ar' ? 'ar-IQ' : 'en-US',
      extraHTTPHeaders: {},
    });
    await context.addCookies([{ name: 'b2b_locale', value: locale, url: BASE }]);
    const page = await context.newPage();
    for (const name of selected) {
      const route = PAGES[name];
      if (!route) continue;
      const res = await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 90000 });
      const status = res?.status() ?? 0;
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      const file = path.join(OUT, `${name}__${locale}__${width}.png`);
      await page.screenshot({ path: file, fullPage: true });
      report.push({ page: name, locale, width, status, horizontalOverflowPx: overflow, file });
      console.log(`${status} ${name} ${locale} ${width}px overflow=${overflow}px -> ${file}`);
    }
    await context.close();
  }
}
await browser.close();
await fs.writeFile(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(`done: ${report.length} screenshots`);
