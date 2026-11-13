/**
 * Browser-side API helper for /api/v1. Client components only.
 * Mirrors the server envelope: success {data, meta?, requestId}, error {error:{code,message,details?},requestId}.
 */
export type ApiOk<T> = { ok: true; status: number; data: T; meta?: Record<string, unknown>; requestId?: string };
export type ApiErr = { ok: false; status: number; code: string; message: string; details?: unknown; requestId?: string };
export type ApiResult<T> = ApiOk<T> | ApiErr;

export type ApiOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  idempotencyKey?: string;
  form?: FormData;
};

export async function api<T = unknown>(url: string, opts: ApiOptions = {}): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  let body: BodyInit | undefined;
  if (opts.form) {
    body = opts.form; // browser sets the multipart boundary
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  } else if ((opts.method ?? 'GET') !== 'GET') {
    headers['Content-Type'] = 'application/json';
    body = '{}';
  }
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;

  let res: Response;
  try {
    res = await fetch(url, { method: opts.method ?? 'GET', headers, body, credentials: 'same-origin', cache: 'no-store' });
  } catch {
    return { ok: false, status: 0, code: 'NETWORK_ERROR', message: 'Network problem. Check your connection and try again.' };
  }
  const json = (await res.json().catch(() => null)) as
    | { data?: T; meta?: Record<string, unknown>; requestId?: string; error?: { code: string; message: string; details?: unknown } }
    | null;
  if (res.ok) {
    return { ok: true, status: res.status, data: json?.data as T, meta: json?.meta, requestId: json?.requestId };
  }
  return {
    ok: false,
    status: res.status,
    code: json?.error?.code ?? 'INTERNAL_ERROR',
    message: json?.error?.message ?? 'Request failed',
    details: json?.error?.details,
    requestId: json?.requestId,
  };
}

/** Field-level validation messages from a VALIDATION_ERROR response, keyed by field name. */
export function fieldErrorsOf(err: ApiErr): Record<string, string> {
  const d = err.details as { fieldErrors?: Record<string, string[]> } | undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(d?.fieldErrors ?? {})) if (v?.[0]) out[k] = v[0];
  return out;
}

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
