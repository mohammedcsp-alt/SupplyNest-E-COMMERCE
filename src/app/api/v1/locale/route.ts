import { NextRequest, NextResponse } from 'next/server';
import { LOCALE_COOKIE, parseLocale } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

/**
 * Sets the UI locale cookie and redirects back to a safe same-site path.
 * The Location header is relative, so the browser stays on the origin it used (absolute URLs built from
 * req.url can name a different host and drop the cookie).
 */
export async function GET(req: NextRequest) {
  const locale = parseLocale(req.nextUrl.searchParams.get('set'));
  const nextParam = req.nextUrl.searchParams.get('next') ?? '/';
  const safeNext = nextParam.startsWith('/') && !nextParam.startsWith('//') && !nextParam.includes('\\') ? nextParam : '/';
  const res = new NextResponse(null, { status: 303, headers: { Location: safeNext } });
  res.cookies.set(LOCALE_COOKIE, locale, { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 });
  return res;
}
