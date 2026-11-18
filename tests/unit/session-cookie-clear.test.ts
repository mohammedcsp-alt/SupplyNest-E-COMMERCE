import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sessionCookieClearOptions, sessionCookieOptions } from '@/lib/session';

/** Regression: the clearing cookie must carry the same attributes as the session cookie (logout and password change). */
describe('session cookie clearing matches the session cookie', () => {
  const exp = new Date(Date.now() + 60_000);
  for (const scheme of ['http', 'https'] as const) {
    it(`clears with the same Secure/HttpOnly/SameSite/Path as the session cookie over ${scheme}`, () => {
      const set = sessionCookieOptions(exp, scheme);
      const clear = sessionCookieClearOptions(scheme);
      expect(clear.secure).toBe(set.secure);
      expect(clear.httpOnly).toBe(set.httpOnly);
      expect(clear.sameSite).toBe(set.sameSite);
      expect(clear.path).toBe(set.path);
      expect(clear.name).toBe(set.name);
      expect(clear.value).toBe('');
      expect(clear.maxAge).toBe(0);
    });
  }

  it('over HTTPS the clearing cookie is Secure (the regression: it was not)', () => {
    expect(sessionCookieClearOptions('https').secure).toBe(true);
  });

  it('logout and password change use the shared helper, not cookies().delete()', () => {
    const root = join(__dirname, '..', '..');
    for (const file of ['src/app/api/v1/auth/logout/route.ts', 'src/app/api/v1/auth/password/change/route.ts']) {
      const src = readFileSync(join(root, file), 'utf8');
      expect(src, file).toContain('sessionCookieClearOptions');
      expect(src, file).not.toMatch(/\.delete\(SESSION_COOKIE\)/);
    }
  });
});
