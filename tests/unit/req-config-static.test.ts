import { describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { createWmsAdapter, WMS_DISABLED_MESSAGE } from '@/integrations/wms/adapter';

/**
 * WMS isolation (T039 / ACX-10 / ACC-13) and static checks on the source tree.
 * The config module validates process.env at import time, so each case re-imports it with a controlled environment.
 */

async function loadConfigWith(env: Record<string, string | undefined>) {
  const snapshot = { ...process.env };
  try {
    for (const [k, v] of Object.entries(env)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    vi.resetModules();
    return await import('@/lib/config');
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in snapshot)) delete process.env[k];
    Object.assign(process.env, snapshot);
    vi.resetModules();
  }
}

describe('WMS integration is off by default and production refuses it (T039, ACX-10, ACC-13)', () => {
  it('(a) the default configuration has FEATURE_FLAG_WMS_INTEGRATION false and the WMS adapter refuses every call', async () => {
    const mod = await loadConfigWith({ FEATURE_FLAG_WMS_INTEGRATION: undefined });
    expect(mod.config.FEATURE_FLAG_WMS_INTEGRATION).toBe(false);
    const adapter = createWmsAdapter(mod.config.FEATURE_FLAG_WMS_INTEGRATION);
    expect(() => adapter.list()).toThrow(WMS_DISABLED_MESSAGE);
    expect(() => adapter.record('stock-snapshot' as never, {})).toThrow(WMS_DISABLED_MESSAGE);
  });

  it('(b) production startup refuses FEATURE_FLAG_WMS_INTEGRATION=true, and accepts the same production env with the flag off', async () => {
    const prodEnv = {
      NODE_ENV: 'production',
      OTP_PROVIDER: 'sms',
      SMS_PROVIDER_URL: 'https://sms.example.test/send',
      SMS_PROVIDER_API_KEY: 'synthetic-test-key-value',
    };
    const flagOn = await loadConfigWith({ ...prodEnv, FEATURE_FLAG_WMS_INTEGRATION: 'true' });
    expect(() => flagOn.assertProductionSafe()).toThrow(/WMS integration is not enabled in V1/);

    const flagOff = await loadConfigWith({ ...prodEnv, FEATURE_FLAG_WMS_INTEGRATION: 'false' });
    expect(() => flagOff.assertProductionSafe()).not.toThrow();
  });
});

/* ------------------------------------------------------------------ static scan of src/ */

const SRC = path.resolve(process.cwd(), 'src');
const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (CODE_EXT.test(name)) out.push(full);
  }
  return out;
}

/** Relative, forward-slash paths of every src file whose text matches the pattern. */
function filesMatching(pattern: RegExp): string[] {
  return walk(SRC)
    .filter((f) => pattern.test(readFileSync(f, 'utf8')))
    .map((f) => path.relative(process.cwd(), f).split(path.sep).join('/'))
    .sort();
}

const PATTERNS = {
  port3100: /\b3100\b/,
  fetchToLiteralHttpUrl: /\bfetch\s*\(\s*['"`]https?:\/\//,
  fetchCall: /(?<![\w.])fetch\s*\(/,
  pgImport: /from\s+['"]pg(-[\w-]+)?['"]|require\(\s*['"]pg['"]\s*\)/,
  wmsClientImport: /(?:from|import)\s*\(?\s*['"][^'"]*wms[^'"]*['"]/i,
};

describe('static scan of src/ for WMS and outbound-call isolation (T039 c)', () => {
  it('the scanner patterns detect what they are meant to detect (positive controls)', () => {
    expect(PATTERNS.port3100.test('const WMS = "http://127.0.0.1:3100"')).toBe(true);
    expect(PATTERNS.fetchToLiteralHttpUrl.test("await fetch('https://wms.example.test/x')")).toBe(true);
    expect(PATTERNS.fetchCall.test('await fetch("/api/v1/x")')).toBe(true);
    expect(PATTERNS.fetchCall.test('await doFetch(url)')).toBe(false);
    expect(PATTERNS.pgImport.test("import { Client } from 'pg';")).toBe(true);
    expect(PATTERNS.wmsClientImport.test("import { x } from '@/integrations/wms/adapter';")).toBe(true);
  });

  it('no src file references port 3100', () => {
    expect(filesMatching(PATTERNS.port3100)).toEqual([]);
  });

  it('no fetch() call targets a literal http(s) URL', () => {
    expect(filesMatching(PATTERNS.fetchToLiteralHttpUrl)).toEqual([]);
  });

  it('the only fetch() call sites are the two same-origin browser helpers (relative URLs)', () => {
    expect(filesMatching(PATTERNS.fetchCall)).toEqual(['src/components/LogoutButton.tsx', 'src/lib/client-api.ts']);
  });

  it('no src file imports pg and no src file imports a WMS client outside src/integrations/wms', () => {
    expect(filesMatching(PATTERNS.pgImport)).toEqual([]);
    const wmsImporters = filesMatching(PATTERNS.wmsClientImport).filter((f) => !f.startsWith('src/integrations/wms/'));
    expect(wmsImporters).toEqual([]);
  });
});
