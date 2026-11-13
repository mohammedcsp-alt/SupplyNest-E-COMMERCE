import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { managerApi } from './helpers';

/**
 * Report export over HTTP (ADMIN-003). The PDF comes from the local Chromium rendering the print view.
 * Runs against the TEST server only.
 */
test.describe('report export formats', () => {
  test('PDF export returns a non-empty application/pdf with a matching checksum header', async ({ baseURL }) => {
    const api = await managerApi(baseURL!);
    const res = await api.get('/api/v1/admin/reports/products/export?format=pdf');
    expect(res.status(), await res.text().catch(() => '')).toBe(200);
    expect(res.headers()['content-type']).toBe('application/pdf');
    expect(res.headers()['content-disposition']).toMatch(/\.pdf"$/);
    const body = Buffer.from(await res.body());
    expect(body.length).toBeGreaterThan(100);
    expect(body.subarray(0, 4).toString('latin1')).toBe('%PDF');
    expect(res.headers()['x-report-checksum-sha256']).toBe(createHash('sha256').update(body).digest('hex'));
    await api.dispose();
  });

  test('XLSX and CSV exports still work with the same filters', async ({ baseURL }) => {
    const api = await managerApi(baseURL!);
    const xlsx = await api.get('/api/v1/admin/reports/products/export?format=xlsx');
    expect(xlsx.status()).toBe(200);
    expect(Buffer.from(await xlsx.body()).subarray(0, 2).toString('latin1')).toBe('PK');
    const csv = await api.get('/api/v1/admin/reports/products/export?format=csv');
    expect(csv.status()).toBe(200);
    expect(csv.headers()['content-type']).toContain('text/csv');
    await api.dispose();
  });

  test('an unknown format is a validation error', async ({ baseURL }) => {
    const api = await managerApi(baseURL!);
    const res = await api.get('/api/v1/admin/reports/products/export?format=html');
    expect(res.status()).toBe(400);
    await api.dispose();
  });

  test('an anonymous request cannot export a report in any format', async ({ request }) => {
    for (const format of ['pdf', 'csv', 'xlsx']) {
      const res = await request.get(`/api/v1/admin/reports/products/export?format=${format}`);
      expect([401, 403]).toContain(res.status());
    }
  });
});
