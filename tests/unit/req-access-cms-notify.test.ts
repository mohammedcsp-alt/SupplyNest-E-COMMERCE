import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { PERMISSIONS } from '@/lib/rbac';
import { requirePermission, type CurrentUser } from '@/lib/session';
import { createCmsPage } from '@/modules/admin/cms';
import { notify } from '@/modules/notifications/notify';
import { actorFor, STAFF } from '../helpers/fixtures';
import { uniq } from '../integration/req-helpers';

function thrownCode(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (err) {
    return (err as { code?: string }).code ?? 'NON_APP_ERROR';
  }
}

function staff(permissions: string[]): CurrentUser {
  return {
    id: '00000000-0000-4000-8000-0000000000aa',
    phone: '+9647700000099',
    userType: 'STAFF',
    status: 'ACTIVE',
    displayName: 'Unit Actor',
    priceLevelId: null,
    priceLevelCode: null,
    permissions: new Set(permissions),
    sessionId: 'unit',
  };
}

describe('sensitive operations refuse actors without the permission (ADMIN-008, CUSTOMER-007)', () => {
  it('requirePermission refuses an actor without customer.approve with FORBIDDEN, and anonymous with UNAUTHORIZED', () => {
    const viewer = staff([PERMISSIONS.CUSTOMER_VIEW]);
    expect(thrownCode(() => requirePermission(viewer, PERMISSIONS.CUSTOMER_APPROVE))).toBe('FORBIDDEN');
    expect(thrownCode(() => requirePermission(null, PERMISSIONS.CUSTOMER_APPROVE))).toBe('UNAUTHORIZED');
  });

  it('requirePermission returns the actor when the permission is held', () => {
    const approver = staff([PERMISSIONS.CUSTOMER_APPROVE]);
    expect(requirePermission(approver, PERMISSIONS.CUSTOMER_APPROVE)).toBe(approver);
  });

  it('a seeded catalog operator (no customer.approve) is refused, the seeded manager is allowed', async () => {
    const catalog = await actorFor(STAFF.catalog);
    expect(catalog.permissions.has(PERMISSIONS.CUSTOMER_APPROVE)).toBe(false);
    expect(thrownCode(() => requirePermission(catalog, PERMISSIONS.CUSTOMER_APPROVE))).toBe('FORBIDDEN');
    const manager = await actorFor(STAFF.manager);
    expect(requirePermission(manager, PERMISSIONS.CUSTOMER_APPROVE).id).toBe(manager.id);
  });
});

describe('CMS body is stored as text and rendered as text (T034, CMS)', () => {
  it('a body containing HTML is stored verbatim, and the public page renders it as React text only', async () => {
    const manager = await actorFor(STAFF.manager);
    const slug = uniq('req-cms-').toLowerCase();
    const payload = `Hello <img src=x onerror="window.__pwned=1">\n\n<script>document.title = 'x'</script> & "quotes"`;
    await createCmsPage(manager.id, { slug, titleAr: 'عنوان', titleEn: 'Safety page', bodyAr: payload, bodyEn: payload, published: true }, null);

    const stored = await db.cmsPage.findUniqueOrThrow({ where: { slug } });
    expect(stored.bodyEn).toBe(payload);
    expect(stored.bodyAr).toBe(payload);
    expect(stored.publishedAt).not.toBeNull();

    const pageSource = readFileSync(path.resolve(process.cwd(), 'src/app/p/[slug]/page.tsx'), 'utf8');
    expect(pageSource).not.toMatch(/dangerouslySetInnerHTML/);
    expect(pageSource).not.toMatch(/innerHTML/);
    expect(pageSource).toMatch(/\{p\}/);
    expect(pageSource).toMatch(/localized\(locale, page\.bodyAr, page\.bodyEn\)/);
  });
});

describe('in-site notifications only (CUSTOMER-008)', () => {
  it('notify writes exactly one Notification row through the client and touches nothing else', async () => {
    const createSpy = vi.fn(async (args: { data: Record<string, unknown> }) => ({ id: 'n1', ...args.data }));
    const touched: string[] = [];
    const client = new Proxy(
      { notification: { create: createSpy } },
      {
        get(target, prop) {
          if (prop === 'notification') return target.notification;
          touched.push(String(prop));
          return undefined;
        },
      },
    );
    await notify(client as unknown as Prisma.TransactionClient, 'user-1', 'account.approved', { priceLevel: 'LEVEL_A' });
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(createSpy.mock.calls[0][0]).toEqual({ data: { recipientId: 'user-1', type: 'account.approved', payload: { priceLevel: 'LEVEL_A' } } });
    expect(touched).toEqual([]);
  });

  it('the notifications module imports no e-mail, SMS or WhatsApp transport', () => {
    const dir = path.resolve(process.cwd(), 'src/modules/notifications');
    const files = ['notify.ts'];
    const transport = /from\s+['"][^'"]*(mail|sms|twilio|whatsapp|smtp|sendgrid)[^'"]*['"]/i;
    for (const f of files) {
      expect(transport.test(readFileSync(path.join(dir, f), 'utf8'))).toBe(false);
    }
  });
});
