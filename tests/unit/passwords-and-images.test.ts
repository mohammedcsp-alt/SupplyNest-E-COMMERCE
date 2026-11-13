import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '@/lib/passwords';
import { sniffImage } from '@/modules/catalog/admin';
import { assertPasswordPolicy } from '@/modules/identity/auth-service';

describe('password hashing', () => {
  it('hashes with a random salt and verifies only the right password', async () => {
    const h1 = await hashPassword('Correct-Horse-9');
    const h2 = await hashPassword('Correct-Horse-9');
    expect(h1).not.toBe(h2);
    expect(h1.startsWith('scrypt$16384$8$1$')).toBe(true);
    expect(await verifyPassword('Correct-Horse-9', h1)).toBe(true);
    expect(await verifyPassword('correct-horse-9', h1)).toBe(false);
    expect(await verifyPassword('x', 'not-a-hash')).toBe(false);
  });

  it('enforces the password policy', () => {
    expect(() => assertPasswordPolicy('short1')).toThrow();
    expect(() => assertPasswordPolicy('onlyletterslong')).toThrow();
    expect(() => assertPasswordPolicy('longenough1')).not.toThrow();
  });
});

describe('image upload sniffing (bytes decide, not the declared type)', () => {
  it('recognises JPEG, PNG and WebP by magic bytes', () => {
    expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))?.mime).toBe('image/jpeg');
    expect(sniffImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))?.mime).toBe('image/png');
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP')]);
    expect(sniffImage(webp)?.mime).toBe('image/webp');
  });

  it('rejects SVG, HTML and scripts even when renamed', () => {
    expect(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(sniffImage(Buffer.from('<script>alert(1)</script>'))).toBeNull();
    expect(sniffImage(Buffer.from([]))).toBeNull();
  });
});
