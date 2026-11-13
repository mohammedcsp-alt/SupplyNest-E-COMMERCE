import { test, expect, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
const CUSTOMER_STATE = 'tests/e2e/.auth/customer.json';
const MANAGER_STATE = 'tests/e2e/.auth/manager.json';

/** HTTP-level security checks against the running API (ACX-01, ACX-09, ACX-10, T001, T033). */

const DEV_PASSWORD = 'Dev-Only-Pass-2026!';
const ACTIVE_LEVEL_A = '+9647700001001';
const MANAGER = '+9647700000001';

async function login(request: APIRequestContext, phone: string, password = DEV_PASSWORD, ip = `10.250.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`) {
  const res = await request.post('/api/v1/auth/login', {
    data: { phone, password },
    headers: { 'X-Forwarded-For': ip },
  });
  return res;
}

test.describe('anonymous visitors (ACX-01, T001)', () => {
  test('catalog JSON contains no price field anywhere', async ({ request }) => {
    const res = await request.get('/api/v1/catalog?pageSize=50');
    expect(res.status()).toBe(200);
    const text = await res.text();
    expect(text).not.toMatch(/"price"\s*:/);
    expect(text).not.toMatch(/"tierPrices"\s*:/);
    expect(text).not.toMatch(/"unitPrice"\s*:/);
    expect(text).not.toMatch(/"lineTotal"\s*:/);
  });

  test('search suggestions and product detail are price-free for anonymous visitors', async ({ request }) => {
    const s = await request.get('/api/v1/catalog/search?q=DEV');
    expect(await s.text()).not.toMatch(/"price"\s*:/);
    const p = await request.get('/api/v1/products/DEV-SCR-11');
    expect(p.status()).toBe(200);
    expect(await p.text()).not.toMatch(/"price"\s*:/);
  });

  test('the entitled price endpoint refuses anonymous callers', async ({ request }) => {
    const res = await request.get('/api/v1/me/prices?skus=DEV-SCR-11');
    expect(res.status()).toBe(401);
  });

  test('the HTML catalog renders no price for anonymous visitors', async ({ request }) => {
    const res = await request.get('/catalog?q=DEV');
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).not.toMatch(/15,000 د\.ع|20,000 د\.ع|15,000 IQD|20,000 IQD/);
  });

  test('admin APIs refuse anonymous callers with 401', async ({ request }) => {
    for (const path of ['/api/v1/admin/customers', '/api/v1/admin/skus', '/api/v1/admin/reservations', '/api/v1/fulfillment/jobs', '/api/v1/accounting/reconciliation']) {
      const res = await request.get(path);
      expect(res.status(), path).toBe(401);
    }
  });
});

test.describe('authorization on the server (ACX-09, T033)', () => {
  test.use({ storageState: CUSTOMER_STATE });
  test('an active customer is forbidden from admin and staff APIs', async ({ request }) => {
    for (const path of ['/api/v1/admin/customers', '/api/v1/admin/inventory', '/api/v1/fulfillment/jobs', '/api/v1/accounting/reconciliation']) {
      const res = await request.get(path);
      expect([401, 403], path).toContain(res.status());
    }
    const prices = await request.get('/api/v1/me/prices?skus=DEV-SCR-11');
    expect(prices.status()).toBe(200);
    const body = await prices.json();
    expect(Array.isArray(body.data)).toBe(true);
  });


  test('wrong passwords are generic and rate-limited per IP (AUTH-01, OPEN-22)', async ({ request }) => {
    // one IP, a fresh phone per attempt: the per-account limit (5/15 min) must not trip first
    const ip = `10.240.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const phone = `+96477${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
      const res = await login(request, phone, 'Wrong-Pass-1234', ip);
      statuses.push(res.status());
      if (i === 0) expect((await res.json()).error.message).toBe('Incorrect phone number or password');
    }
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses[statuses.length - 1]).toBe(429);
  });
});

test.describe('request hardening (CSRF, body type)', () => {
  test.use({ storageState: CUSTOMER_STATE });
  test('a cross-origin JSON write is rejected with 403', async ({ request }) => {
    const res = await request.put('/api/v1/cart/items', {
      data: { sku: 'DEV-SCR-11', qty: 1 },
      headers: { Origin: 'https://attacker.example', 'Content-Type': 'application/json' },
    });
    expect(res.status()).toBe(403);
  });

  test('a form-encoded write to a JSON API is rejected', async ({ request }) => {
    const res = await request.put('/api/v1/cart/items', {
      form: { sku: 'DEV-SCR-11', qty: '1' },
    });
    expect([400, 403]).toContain(res.status());
  });

  test('checkout without an Idempotency-Key is refused', async ({ request }) => {
    const res = await request.post('/api/v1/orders', {
      data: { addressId: randomUUID(), quoteHash: 'a'.repeat(64) },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error.message).toMatch(/Idempotency-Key/);
  });
});

test.describe('security headers', () => {
  test('responses are not cacheable and carry hardening headers', async ({ request }) => {
    const res = await request.get('/catalog');
    expect(res.headers()['x-frame-options']).toBe('DENY');
    expect(res.headers()['x-content-type-options']).toBe('nosniff');
    expect(res.headers()['cache-control']).toContain('no-store');
  });
});

test.describe('manager session (admin API)', () => {
  test.use({ storageState: MANAGER_STATE });

  test('a manager can reach the admin API', async ({ request }) => {
    const customers = await request.get('/api/v1/admin/customers?pageSize=5');
    expect(customers.status()).toBe(200);
  });
});
