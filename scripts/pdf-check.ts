/**
 * Environment check for PDF export (ADMIN-003). Launches the local Chromium through Playwright, prints a small static
 * HTML page (Arabic and English) to storage/pdf-check.pdf, verifies the %PDF header and size, then deletes the file.
 * It does not start the application server and does not touch the database.
 *   npx tsx scripts/pdf-check.ts
 */
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { htmlToPdf, PdfRendererUnavailableError } from '../src/integrations/pdf/chromium';

const OUT = path.resolve(process.cwd(), 'storage', 'pdf-check.pdf');

const HTML = `<!doctype html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8"><title>PDF check</title></head>
<body>
  <h1>اختبار تصدير PDF - PDF export check</h1>
  <table border="1" cellspacing="0" cellpadding="4">
    <thead><tr><th>رقم الطلب</th><th>Order no.</th><th>Status</th></tr></thead>
    <tbody><tr><td>ORD-000001</td><td>ORD-000001</td><td>SUBMITTED</td></tr></tbody>
  </table>
</body>
</html>`;

async function main() {
  const pdf = await htmlToPdf(HTML);
  await writeFile(OUT, pdf);
  try {
    const back = await readFile(OUT);
    const header = back.subarray(0, 4).toString('latin1');
    const ok = back.length > 0 && header === '%PDF';
    console.log(JSON.stringify({ check: 'pdf-export', ok, header, bytes: back.length, file: 'storage/pdf-check.pdf (deleted after check)' }));
    if (!ok) process.exitCode = 1;
  } finally {
    await rm(OUT, { force: true });
  }
}

main().catch((err: unknown) => {
  if (err instanceof PdfRendererUnavailableError) {
    console.error(JSON.stringify({ check: 'pdf-export', ok: false, reason: err.message }));
  } else {
    console.error(JSON.stringify({ check: 'pdf-export', ok: false, error: (err as Error).message.slice(0, 300) }));
  }
  process.exitCode = 1;
});
