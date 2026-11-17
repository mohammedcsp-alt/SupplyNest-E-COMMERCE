import { test, expect, type APIRequestContext } from '@playwright/test';
import { devPassword } from '../../prisma/seed/dev-secret';

/**
 * Sign-in portals and role separation (API level, against the running test server).
 * Accounts and login budgets: each phone is used at most 3 times in this file, on top of the setup logins
 * (login limit: 5 attempts per phone per 15 minutes; the global setup clears the buckets at the start of a run).
 */

const PASSWORD = devPassword();
const CUSTOMER = '+9647700001001'; // approved customer, price level A
const MANAGER = '+9647700000001'; // system owner (MANAGER role)
const PICKER = '+9647700000006'; // fulfillment staff

const ADMIN_PATHS = ['/api/v1/admin/audit', '/api/v1/admin/backup', '/api/v1/admin/customers'];

function fakeIp(): string {
  return `10.240.${Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;
}

function login(request: APIRequestContext, data: Record<string, string>) {
  return request.post('/api/v1/auth/login', { data, headers: { 'X-Forwarded-For': fakeIp() } });
}

test.describe('sign-in portals and role separation', () => {
  test('admin portal refuses a customer even with the correct password, and creates no session', async ({ request }) => {
    const res = await login(request, { phone: CUSTOMER, password: PASSWORD, portal: 'admin' });
    expect(res.status()).toBe(403);
    expect(res.headers()['set-cookie']).toBeUndefined();
    const audit = await request.get('/api/v1/admin/audit');
    expect(audit.status()).toBe(401);
  });

  test('customer portal refuses a staff account even with the correct password', async ({ request }) => {
    const res = await login(request, { phone: PICKER, password: PASSWORD, portal: 'customer' });
    expect(res.status()).toBe(403);
    const body = await res.text();
    expect(body).toContain('Admin Login');
    expect(body).not.toContain('password_hash');
  });

  test('wrong password is refused on the admin portal with the generic message', async ({ request }) => {
    const res = await login(request, { phone: PICKER, password: 'Wrong-Pass-1234', portal: 'admin' });
    expect(res.status()).toBe(401);
    expect(await res.text()).toContain('Incorrect phone number or password');
  });

  test('a customer session cannot use administration APIs', async ({ request }) => {
    const res = await login(request, { phone: CUSTOMER, password: PASSWORD, portal: 'customer' });
    expect(res.status()).toBe(200);
    for (const path of ADMIN_PATHS) {
      const r = await request.get(path);
      expect(r.status(), `customer GET ${path}`).toBe(403);
    }
  });

  test('anonymous requests to administration APIs are refused', async ({ request }) => {
    for (const path of ADMIN_PATHS) {
      const r = await request.get(path);
      expect(r.status(), `anonymous GET ${path}`).toBe(401);
    }
  });

  test('administrator signs in through the admin portal, and logout revokes the session', async ({ request }) => {
    const res = await login(request, { phone: MANAGER, password: PASSWORD, portal: 'admin' });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.userType).toBe('STAFF');
    expect((await request.get('/api/v1/admin/audit')).status()).toBe(200);

    const out = await request.post('/api/v1/auth/logout', { data: {} });
    expect(out.status()).toBe(200);
    expect((await request.get('/api/v1/admin/audit')).status()).toBe(401);
  });
});
