import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { randomUUID } from 'node:crypto';
import { AppError, errors } from './errors';
import { logger } from './logger';

/**
 * Shared HTTP helpers for /api/v1 route handlers.
 * Success: { data, meta?, requestId }. Error: { error: { code, message, details? }, requestId }.
 */

export type RouteContext<P = Record<string, string>> = { params: Promise<P> };

export function requestIdOf(req: NextRequest): string {
  const incoming = req.headers.get('x-request-id');
  return incoming && /^[A-Za-z0-9-]{8,64}$/.test(incoming) ? incoming : randomUUID();
}

export function ok<T>(requestId: string, data: T, init?: { status?: number; meta?: Record<string, unknown> }) {
  return NextResponse.json(
    { data, ...(init?.meta ? { meta: init.meta } : {}), requestId },
    { status: init?.status ?? 200, headers: { 'Cache-Control': 'private, no-store', 'X-Request-Id': requestId } },
  );
}

export function fail(requestId: string, err: unknown) {
  let status = 500;
  let body: { code: string; message: string; details?: unknown };
  if (err instanceof AppError) {
    status = err.status;
    body = { code: err.code, message: err.message, ...(err.details !== undefined ? { details: err.details } : {}) };
  } else if (isInvalidIdentifier(err)) {
    status = 404;
    body = { code: 'NOT_FOUND', message: 'Resource not found' };
  } else if (isUniqueViolation(err)) {
    // A concurrent or duplicate write hit a unique constraint: report a conflict, never a 500.
    status = 409;
    body = { code: 'CONFLICT', message: 'This record already exists or conflicts with another change' };
  } else if (err instanceof ZodError) {
    status = 400;
    body = {
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details: { fieldErrors: err.flatten().fieldErrors },
    };
  } else {
    logger.error('unhandled_error', { requestId, error: err as Error });
    body = { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' };
  }
  return NextResponse.json(
    { error: body, requestId },
    { status, headers: { 'Cache-Control': 'private, no-store', 'X-Request-Id': requestId } },
  );
}

type Handler<P> = (req: NextRequest, ctx: RouteContext<P>, requestId: string) => Promise<Response>;

/** Prisma P2023: a value that is not a valid id for its column (e.g. a non-UUID path segment). */
function isInvalidIdentifier(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2023';
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}

/** Wraps a handler: request id, same-origin check for state-changing methods, error envelope, access log. */
export function apiRoute<P = Record<string, string>>(handler: Handler<P>) {
  return async (req: NextRequest, ctx: RouteContext<P>): Promise<Response> => {
    const requestId = requestIdOf(req);
    const started = Date.now();
    let response: Response;
    try {
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) assertSameOrigin(req);
      response = await handler(req, ctx, requestId);
    } catch (err) {
      response = fail(requestId, err);
    }
    logger.info('http', {
      requestId,
      method: req.method,
      path: new URL(req.url).pathname,
      status: response.status,
      ms: Date.now() - started,
    });
    return response;
  };
}

/**
 * CSRF defence in depth: sessions are SameSite=Lax cookies, and state-changing calls must carry
 * JSON (which cross-site forms cannot send) and, when a browser sends Origin, that Origin must match the host.
 */
export function assertSameOrigin(req: NextRequest): void {
  const origin = req.headers.get('origin');
  if (origin) {
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
    let originHost: string | null = null;
    try {
      originHost = new URL(origin).host;
    } catch {
      originHost = null;
    }
    if (!host || originHost !== host) throw errors.forbidden('Cross-origin request rejected');
  }
  const contentType = req.headers.get('content-type') ?? '';
  const hasBody = req.headers.get('content-length') !== '0' && req.method !== 'DELETE';
  if (hasBody && !contentType.toLowerCase().startsWith('application/json') && !isMultipartAllowed(req)) {
    throw errors.validation('Content-Type must be application/json');
  }
}

function isMultipartAllowed(req: NextRequest): boolean {
  // Only the explicit file-upload endpoints accept multipart; they opt in via a path allow-list.
  const path = new URL(req.url).pathname;
  const contentType = (req.headers.get('content-type') ?? '').toLowerCase();
  return contentType.startsWith('multipart/form-data') && /\/(imports|images|uploads)(\/|$)/.test(path);
}

/** Parses and validates a JSON body with a Zod schema. Rejects oversized bodies. */
export async function readJson<S extends ZodTypeAny>(req: NextRequest, schema: S, maxBytes = 512 * 1024): Promise<z.output<S>> {
  const text = await req.text();
  if (Buffer.byteLength(text, 'utf8') > maxBytes) throw errors.validation('Request body too large');
  let raw: unknown;
  try {
    raw = text.length ? JSON.parse(text) : {};
  } catch {
    throw errors.validation('Malformed JSON body');
  }
  return schema.parse(raw);
}

export function idempotencyKeyOf(req: NextRequest): string {
  const key = req.headers.get('idempotency-key')?.trim() ?? '';
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(key)) {
    throw errors.validation('Idempotency-Key header is required (8-128 chars: letters, digits, . _ : -)');
  }
  return key;
}

export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'local').slice(0, 64);
}
