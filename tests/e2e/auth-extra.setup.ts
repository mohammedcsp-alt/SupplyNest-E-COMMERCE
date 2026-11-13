import { test as setup, expect } from '@playwright/test';

/** Session for the second approved customer (level B), saved once per run for ownership tests. */
export const CUSTOMER_B_STATE = 'tests/e2e/.auth/customer-b.json';

setup('sign in second approved customer', async ({ request }) => {
  const res = await request.post('/api/v1/auth/login', {
    data: { phone: '+9647700001002', password: 'Dev-Only-Pass-2026!' },
    headers: { 'X-Forwarded-For': '10.210.1.1' },
  });
  expect(res.status()).toBe(200);
  await request.storageState({ path: CUSTOMER_B_STATE });
});
