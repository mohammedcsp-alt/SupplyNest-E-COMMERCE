// Trusted-proxy resolution for the custom Node server (server.mjs). Pure functions, no I/O, unit tested.
//
// Trust model
//   - The only thing this server can prove is the TCP peer address (socket.remoteAddress).
//   - Forwarding headers (X-Forwarded-For, X-Forwarded-Proto, X-Forwarded-Host, X-Real-IP) are client-controlled
//     unless the peer is a proxy we explicitly trust. Tailscale Serve reaches this server from loopback, so the
//     default trusted-proxy list is loopback only. Any other peer is treated as a direct client.
//   - When the peer is trusted, the client IP is the RIGHTMOST valid address in X-Forwarded-For: a proxy appends
//     the address it saw, so the rightmost entry is the one added by the trusted hop, not the client's own value.
//   - When no trusted address can be determined, the request gets the shared bucket 'unknown'. That is strict:
//     an attacker cannot pick a fresh bucket by changing headers.
//
// server.mjs always overwrites the internal headers below, so a client cannot inject them.

import net from 'node:net';

export const INTERNAL_CLIENT_IP_HEADER = 'x-b2b-client-ip';
export const INTERNAL_SCHEME_HEADER = 'x-b2b-scheme';
export const UNKNOWN_CLIENT = 'unknown';

/** Strips the IPv4-mapped IPv6 prefix and surrounding brackets/whitespace. Returns '' for non-addresses. */
export function normalizeAddress(raw) {
  if (typeof raw !== 'string') return '';
  let s = raw.trim();
  if (s.startsWith('[') && s.endsWith(']')) s = s.slice(1, -1);
  if (s.toLowerCase().startsWith('::ffff:') && net.isIPv4(s.slice(7))) s = s.slice(7);
  const zone = s.indexOf('%');
  if (zone > 0 && net.isIPv6(s.slice(0, zone))) s = s.slice(0, zone);
  return net.isIP(s) ? s.toLowerCase() : '';
}

/** Parses the trusted-proxy allow-list from an environment value. Empty or unset means loopback only. */
export function parseTrustedProxies(value) {
  const items = (value ?? '').split(',').map((v) => normalizeAddress(v)).filter(Boolean);
  return new Set(items.length ? items : ['127.0.0.1', '::1']);
}

/** Splits a header value (possibly several headers joined with ', ') into trimmed non-empty tokens. */
function tokens(headerValue) {
  if (typeof headerValue !== 'string') return [];
  return headerValue.split(',').map((t) => t.trim()).filter((t) => t.length > 0);
}

/**
 * Resolves the client IP and scheme for one request.
 * @param {{ socketAddress: string|undefined, headers: Record<string, string|string[]|undefined>, trustedProxies: Set<string> }} input
 * @returns {{ clientIp: string, scheme: 'http'|'https', trustedPeer: boolean, forwardedHost: string|null }}
 */
export function resolveClientTrust({ socketAddress, headers, trustedProxies }) {
  const peer = normalizeAddress(socketAddress);
  const trustedPeer = peer !== '' && trustedProxies.has(peer);
  const get = (name) => {
    const v = headers[name];
    return Array.isArray(v) ? v.join(', ') : v;
  };

  if (!trustedPeer) {
    // Direct connection: the socket address is the client. Every forwarding header is ignored.
    return { clientIp: peer || UNKNOWN_CLIENT, scheme: 'http', trustedPeer: false, forwardedHost: null };
  }

  // A trusted peer with no X-Forwarded-For at all is a direct local request (a tool on this PC): its address is the peer.
  // A forwarded chain that contains no valid address is unusable, so it goes to the strict shared bucket.
  const rawFor = tokens(get('x-forwarded-for'));
  const forwardedFor = rawFor.map(normalizeAddress).filter(Boolean);
  let clientIp;
  if (rawFor.length === 0) clientIp = peer;
  else clientIp = forwardedFor.length ? forwardedFor[forwardedFor.length - 1] : UNKNOWN_CLIENT;

  const protoTokens = tokens(get('x-forwarded-proto')).map((p) => p.toLowerCase());
  const proto = protoTokens.length ? protoTokens[protoTokens.length - 1] : '';
  const scheme = proto === 'https' ? 'https' : 'http';

  const hostTokens = tokens(get('x-forwarded-host'));
  const forwardedHost = hostTokens.length ? hostTokens[hostTokens.length - 1] : null;

  return { clientIp, scheme, trustedPeer: true, forwardedHost };
}

/**
 * Produces the header set that server.mjs applies to the incoming request before Next.js sees it.
 * Client-supplied internal headers are always replaced. Client-supplied forwarding headers are removed when the peer
 * is not trusted, so downstream code that reads them cannot be fooled.
 */
export function applyTrustHeaders(headers, trust) {
  const out = { ...headers };
  delete out[INTERNAL_CLIENT_IP_HEADER];
  delete out[INTERNAL_SCHEME_HEADER];
  out[INTERNAL_CLIENT_IP_HEADER] = trust.clientIp;
  out[INTERNAL_SCHEME_HEADER] = trust.scheme;
  if (!trust.trustedPeer) {
    delete out['x-forwarded-for'];
    delete out['x-forwarded-proto'];
    delete out['x-forwarded-host'];
    delete out['x-real-ip'];
  } else if (trust.forwardedHost) {
    out['x-forwarded-host'] = trust.forwardedHost;
  }
  return out;
}

export const TAILNET_LOGIN_HEADER = 'tailscale-user-login';

/** Parses TAILNET_ALLOWED_USERS (comma list of tailnet login names). Empty means no tailnet allow-list is enforced. */
export function parseAllowedTailnetUsers(value) {
  return new Set((value ?? '').split(',').map((v) => v.trim().toLowerCase()).filter(Boolean));
}

/**
 * Second layer behind the tailnet ACL. Tailscale Serve sets Tailscale-User-Login for every request that arrives over the
 * tailnet and overwrites any value the client sent. A request from a trusted peer that names a login not on the list is
 * refused. Requests without the header come from this PC itself (no tailnet hop) and are not restricted here.
 * @returns {'allow'|'deny'}
 */
export function tailnetUserDecision({ trustedPeer, headers, allowedUsers }) {
  if (!allowedUsers || allowedUsers.size === 0) return 'allow';
  const raw = headers[TAILNET_LOGIN_HEADER];
  const login = Array.isArray(raw) ? raw.join(',') : raw;
  if (login === undefined || login === '') return trustedPeer ? 'allow' : 'deny';
  if (login.includes(',')) return 'deny';
  return allowedUsers.has(login.trim().toLowerCase()) ? 'allow' : 'deny';
}
