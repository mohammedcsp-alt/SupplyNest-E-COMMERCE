import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { assertSameOrigin, idempotencyKeyOf, readJson } from '@/lib/api';
import { z } from 'zod';

function req(url: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}) {
  return new NextRequest(url, { method: init.method ?? 'POST', headers: init.headers, body: init.body });
}

describe('CSRF and request guards', () => {
  it('rejects a cross-origin browser request', () => {
    const r = req('http://127.0.0.1:3200/api/v1/cart/items', {
      headers: { origin: 'https://evil.example', host: '127.0.0.1:3200', 'content-type': 'application/json', 'content-length': '2' },
      body: '{}',
    });
    expect(() => assertSameOrigin(r)).toThrow(/Cross-origin/);
  });

  it('accepts a same-origin JSON request', () => {
    const r = req('http://127.0.0.1:3200/api/v1/cart/items', {
      headers: { origin: 'http://127.0.0.1:3200', host: '127.0.0.1:3200', 'content-type': 'application/json', 'content-length': '2' },
      body: '{}',
    });
    expect(() => assertSameOrigin(r)).not.toThrow();
  });

  it('rejects state-changing bodies that are not JSON (form posts cannot forge JSON APIs)', () => {
    const r = req('http://127.0.0.1:3200/api/v1/cart/items', {
      headers: { host: '127.0.0.1:3200', 'content-type': 'text/plain', 'content-length': '4' },
      body: 'a=b',
    });
    expect(() => assertSameOrigin(r)).toThrow(/application\/json/);
  });

  it('requires an Idempotency-Key with a sane shape', () => {
    expect(() => idempotencyKeyOf(req('http://x/y', { headers: {} }))).toThrow(/Idempotency-Key/);
    expect(() => idempotencyKeyOf(req('http://x/y', { headers: { 'idempotency-key': 'short' } }))).toThrow();
    expect(idempotencyKeyOf(req('http://x/y', { headers: { 'idempotency-key': 'order-2026-11-13-abc' } }))).toBe('order-2026-11-13-abc');
  });

  it('rejects malformed and oversized JSON bodies before validation', async () => {
    const schema = z.object({ a: z.number() });
    await expect(readJson(req('http://x/y', { headers: { 'content-type': 'application/json' }, body: '{bad' }), schema)).rejects.toThrow(/Malformed/);
    const big = JSON.stringify({ a: 1, pad: 'x'.repeat(600 * 1024) });
    await expect(readJson(req('http://x/y', { headers: { 'content-type': 'application/json' }, body: big }), schema)).rejects.toThrow(/too large/);
  });
});
