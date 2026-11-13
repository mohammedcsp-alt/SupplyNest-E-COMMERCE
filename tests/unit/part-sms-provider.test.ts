import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createHttpSmsProvider, SmsProviderError } from '@/integrations/sms/provider';

/**
 * Tests the HTTP SMS adapter against a LOCAL fake provider (127.0.0.1, ephemeral port). No real provider is contacted.
 */
type Captured = { method?: string; url?: string; auth?: string; body: string };
let server: http.Server;
let baseUrl = '';
let captured: Captured | null = null;
let respond: (req: http.IncomingMessage, res: http.ServerResponse) => void = () => undefined;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      captured = { method: req.method, url: req.url, auth: req.headers.authorization, body: Buffer.concat(chunks).toString('utf8') };
      respond(req, res);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}/send`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

afterEach(() => {
  captured = null;
  respond = () => undefined;
});

const provider = (timeoutMs = 2000) => createHttpSmsProvider({ url: baseUrl, apiKey: 'test-key-abc', senderId: 'B2BSTORE', timeoutMs });

describe('HTTP SMS provider (CUSTOMER-002, local fake server)', () => {
  it('sends the phone and the code in the body, with the bearer key, and returns the provider message id', async () => {
    respond = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 'msg-42' }));
    };
    const result = await provider().send({ to: '+9647700000001', text: 'Verification code: 123456.' });
    expect(result).toEqual({ accepted: true, providerMessageId: 'msg-42' });
    expect(captured?.method).toBe('POST');
    expect(captured?.url).toBe('/send');
    expect(captured?.auth).toBe('Bearer test-key-abc');
    const body = JSON.parse(captured!.body) as { to: string; text: string; from: string };
    expect(body.to).toBe('+9647700000001');
    expect(body.text).toContain('123456');
    expect(body.from).toBe('B2BSTORE');
  });

  it('a non-2xx response becomes a clear SmsProviderError with the status and no provider body text', async () => {
    respond = (_req, res) => {
      res.writeHead(503, { 'Content-Type': 'text/plain' });
      res.end('internal detail that must not leak 123456');
    };
    const err = await provider().send({ to: '+9647700000001', text: 'x' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SmsProviderError);
    expect((err as SmsProviderError).status).toBe(503);
    expect((err as Error).message).toContain('HTTP 503');
    expect((err as Error).message).not.toContain('internal detail');
    expect((err as Error).message).not.toContain('123456');
  });

  it('is single-attempt: a failing provider is called exactly once (no retry that could duplicate a code)', async () => {
    let calls = 0;
    respond = (_req, res) => {
      calls += 1;
      res.writeHead(500);
      res.end();
    };
    await expect(provider().send({ to: '+9647700000001', text: 'x' })).rejects.toBeInstanceOf(SmsProviderError);
    expect(calls).toBe(1);
  });

  it('enforces the timeout: a provider that does not answer in time is aborted with a clear error', async () => {
    respond = (_req, res) => {
      setTimeout(() => {
        if (!res.headersSent) res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{}');
      }, 1500);
    };
    const started = Date.now();
    const err = await provider(200).send({ to: '+9647700000001', text: 'x' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SmsProviderError);
    expect((err as Error).message).toContain('did not answer within 200 ms');
    expect(Date.now() - started).toBeLessThan(1400);
  });

  it('a connection to a closed port fails with a clear network error', async () => {
    const dead = createHttpSmsProvider({ url: 'http://127.0.0.1:1/send', apiKey: 'k', timeoutMs: 2000 });
    await expect(dead.send({ to: '+9647700000001', text: 'x' })).rejects.toThrow(/could not be reached/);
  });

  it('refuses to construct without a URL or key', () => {
    expect(() => createHttpSmsProvider({ url: '', apiKey: 'k', timeoutMs: 1000 })).toThrow(/SMS_PROVIDER_URL/);
    expect(() => createHttpSmsProvider({ url: baseUrl, apiKey: '', timeoutMs: 1000 })).toThrow(/SMS_PROVIDER_API_KEY/);
  });
});
