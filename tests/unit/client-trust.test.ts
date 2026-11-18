import { describe, expect, it } from 'vitest';
// @ts-expect-error plain ESM module shared with server.mjs (no type declarations needed)
import { applyTrustHeaders, normalizeAddress, parseTrustedProxies, resolveClientTrust, UNKNOWN_CLIENT } from '../../lib-server/client-trust.mjs';

/**
 * SEC-002 regression tests: client IP and scheme are decided from the TCP peer. Forwarding headers are believed only
 * when the peer is an explicitly trusted proxy.
 */
const LOOPBACK = parseTrustedProxies(undefined); // default: 127.0.0.1, ::1
const LAN_PEER = '192.168.68.50';

function trust(socketAddress: string | undefined, headers: Record<string, string>, trusted = LOOPBACK) {
  return resolveClientTrust({ socketAddress, headers, trustedProxies: trusted });
}

describe('normalizeAddress', () => {
  it('accepts IPv4 and IPv6 and strips the IPv4-mapped prefix, brackets and zone ids', () => {
    expect(normalizeAddress('203.0.113.9')).toBe('203.0.113.9');
    expect(normalizeAddress('::ffff:203.0.113.9')).toBe('203.0.113.9');
    expect(normalizeAddress('[2001:DB8::1]')).toBe('2001:db8::1');
    expect(normalizeAddress('fe80::1%eth0')).toBe('fe80::1');
  });

  it('rejects malformed values (returns empty string)', () => {
    for (const bad of ['', 'not-an-ip', '999.1.1.1', '1.2.3', '1.2.3.4:80', 'evil"; drop', undefined, null, 42]) {
      expect(normalizeAddress(bad as string)).toBe('');
    }
  });
});

describe('parseTrustedProxies', () => {
  it('defaults to loopback only when unset or empty', () => {
    expect([...parseTrustedProxies(undefined)].sort()).toEqual(['127.0.0.1', '::1']);
    expect([...parseTrustedProxies('  ')].sort()).toEqual(['127.0.0.1', '::1']);
  });

  it('accepts an explicit list and drops invalid entries', () => {
    const set = parseTrustedProxies('10.0.0.5, bogus, ::ffff:10.0.0.6');
    expect([...set].sort()).toEqual(['10.0.0.5', '10.0.0.6']);
  });
});

describe('direct local requests (no trusted proxy)', () => {
  it('uses the socket address when no forwarding header is present', () => {
    const t = trust('127.0.0.1', {});
    expect(t).toMatchObject({ clientIp: '127.0.0.1', scheme: 'http', trustedPeer: true });
  });

  it('a loopback peer is trusted by default, so its forwarding headers are read (documented boundary)', () => {
    // Local processes on this PC are the trusted boundary. Remote clients never reach the server with a loopback peer
    // unless Tailscale Serve (or another trusted proxy) relayed them.
    const t = trust('127.0.0.1', { 'x-forwarded-for': '198.51.100.7' });
    expect(t.clientIp).toBe('198.51.100.7');
  });
});

describe('untrusted peer (direct client on the LAN or tailnet)', () => {
  it('ignores a forged X-Forwarded-For and uses the socket address', () => {
    const t = trust(LAN_PEER, { 'x-forwarded-for': '1.2.3.4' });
    expect(t.clientIp).toBe(LAN_PEER);
    expect(t.trustedPeer).toBe(false);
  });

  it('rotating X-Forwarded-For values does not create new buckets', () => {
    const a = trust(LAN_PEER, { 'x-forwarded-for': '10.0.0.1' }).clientIp;
    const b = trust(LAN_PEER, { 'x-forwarded-for': '10.0.0.2' }).clientIp;
    expect(a).toBe(b);
  });

  it('ignores X-Real-IP and forwarded-proto (scheme stays http)', () => {
    const t = trust(LAN_PEER, { 'x-real-ip': '9.9.9.9', 'x-forwarded-proto': 'https' });
    expect(t.clientIp).toBe(LAN_PEER);
    expect(t.scheme).toBe('http');
  });

  it('a missing socket address falls back to the shared unknown bucket', () => {
    expect(trust(undefined, { 'x-forwarded-for': '1.2.3.4' }).clientIp).toBe(UNKNOWN_CLIENT);
  });
});

describe('trusted proxy (Tailscale Serve relays from loopback)', () => {
  it('takes the rightmost valid address, which is the one the proxy appended', () => {
    const t = trust('127.0.0.1', { 'x-forwarded-for': '198.51.100.7, 100.64.0.99' });
    expect(t.clientIp).toBe('100.64.0.99');
  });

  it('a client-supplied leftmost value cannot override the proxy-appended value', () => {
    const t = trust('127.0.0.1', { 'x-forwarded-for': '1.1.1.1, 2.2.2.2, 100.64.0.9' });
    expect(t.clientIp).toBe('100.64.0.9');
  });

  it('multiple X-Forwarded-For headers (joined by the server) are treated as one chain', () => {
    const t = trust('127.0.0.1', { 'x-forwarded-for': ['1.1.1.1', '100.64.0.10'] as unknown as string });
    expect(t.clientIp).toBe('100.64.0.10');
  });

  it('a malformed rightmost entry falls back to the earlier valid entry, never to an invalid string', () => {
    const t = trust('127.0.0.1', { 'x-forwarded-for': '100.64.0.11, not-an-ip' });
    expect(t.clientIp).toBe('100.64.0.11');
  });

  it('when every forwarded entry is malformed, the unknown bucket is used', () => {
    expect(trust('127.0.0.1', { 'x-forwarded-for': 'garbage, ::::' }).clientIp).toBe(UNKNOWN_CLIENT);
  });

  it('a trusted peer with no forwarding header at all is treated as a direct local request', () => {
    expect(trust('127.0.0.1', {}).clientIp).toBe('127.0.0.1');
  });

  it('scheme is https only when the trusted proxy says https', () => {
    expect(trust('127.0.0.1', { 'x-forwarded-proto': 'https' }).scheme).toBe('https');
    expect(trust('127.0.0.1', { 'x-forwarded-proto': 'HTTPS' }).scheme).toBe('https');
    expect(trust('127.0.0.1', { 'x-forwarded-proto': 'http' }).scheme).toBe('http');
    expect(trust('127.0.0.1', { 'x-forwarded-proto': 'javascript' }).scheme).toBe('http');
    expect(trust('127.0.0.1', {}).scheme).toBe('http');
  });

  it('keeps X-Forwarded-Host from the trusted proxy', () => {
    const t = trust('127.0.0.1', { 'x-forwarded-host': '<owner-host>.<tailnet>.ts.net' });
    expect(t.forwardedHost).toBe('<owner-host>.<tailnet>.ts.net');
  });

  it('an explicitly configured proxy address is trusted; another loopback-less peer is not', () => {
    const trusted = parseTrustedProxies('10.0.0.5');
    expect(trust('10.0.0.5', { 'x-forwarded-for': '203.0.113.20' }, trusted).clientIp).toBe('203.0.113.20');
    expect(trust('127.0.0.1', { 'x-forwarded-for': '203.0.113.20' }, trusted).clientIp).toBe('127.0.0.1');
  });
});

describe('applyTrustHeaders (what the app receives)', () => {
  it('overwrites client-supplied internal headers and removes forwarding headers from untrusted peers', () => {
    const incoming = {
      'x-b2b-client-ip': '1.1.1.1',
      'x-b2b-scheme': 'https',
      'x-forwarded-for': '1.2.3.4',
      'x-forwarded-proto': 'https',
      'x-forwarded-host': 'evil.example',
      'x-real-ip': '5.6.7.8',
      host: '127.0.0.1:3200',
    };
    const out = applyTrustHeaders(incoming, trust(LAN_PEER, {}));
    expect(out['x-b2b-client-ip']).toBe(LAN_PEER);
    expect(out['x-b2b-scheme']).toBe('http');
    expect(out['x-forwarded-for']).toBeUndefined();
    expect(out['x-forwarded-proto']).toBeUndefined();
    expect(out['x-forwarded-host']).toBeUndefined();
    expect(out['x-real-ip']).toBeUndefined();
    expect(out.host).toBe('127.0.0.1:3200');
  });

  it('a trusted peer keeps its forwarding headers, and internal headers are still set by the server', () => {
    const incoming = { 'x-b2b-client-ip': 'spoofed', 'x-forwarded-host': 'desktop.ts.net', 'x-forwarded-for': '100.64.0.2' };
    const out = applyTrustHeaders(incoming, trust('127.0.0.1', { 'x-forwarded-for': '100.64.0.2', 'x-forwarded-host': 'desktop.ts.net' }));
    expect(out['x-b2b-client-ip']).toBe('100.64.0.2');
    expect(out['x-forwarded-host']).toBe('desktop.ts.net');
  });
});

// @ts-expect-error plain ESM module shared with server.mjs
import { parseAllowedTailnetUsers, tailnetUserDecision } from '../../lib-server/client-trust.mjs';

/** Tailnet allow-list (second layer behind the tailnet ACL). */
describe('tailnet account allow-list', () => {
  const owner = parseAllowedTailnetUsers('Owner@Example.com, ');

  it('parses case-insensitively and ignores blanks; empty means no restriction', () => {
    expect([...owner]).toEqual(['owner@example.com']);
    expect(tailnetUserDecision({ trustedPeer: true, headers: { 'tailscale-user-login': 'anyone@x.y' }, allowedUsers: parseAllowedTailnetUsers('') })).toBe('allow');
  });

  it('allows a listed tailnet login and refuses an unlisted one', () => {
    expect(tailnetUserDecision({ trustedPeer: true, headers: { 'tailscale-user-login': 'owner@example.com' }, allowedUsers: owner })).toBe('allow');
    expect(tailnetUserDecision({ trustedPeer: true, headers: { 'tailscale-user-login': 'friend@example.com' }, allowedUsers: owner })).toBe('deny');
  });

  it('refuses a header that lists several logins (ambiguous identity)', () => {
    expect(tailnetUserDecision({ trustedPeer: true, headers: { 'tailscale-user-login': 'owner@example.com, friend@example.com' }, allowedUsers: owner })).toBe('deny');
  });

  it('a request without the header from this PC is not restricted here', () => {
    expect(tailnetUserDecision({ trustedPeer: true, headers: {}, allowedUsers: owner })).toBe('allow');
  });

  it('a request from an untrusted peer without a login header is refused when a list is set', () => {
    expect(tailnetUserDecision({ trustedPeer: false, headers: {}, allowedUsers: owner })).toBe('deny');
  });
});
