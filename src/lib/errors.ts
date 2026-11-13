/** Standard error codes from spec section 19.4. */
export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'STOCK_CHANGED',
  'PRICE_CHANGED',
  'SHIPPING_RULE_MISSING',
  'IMPORT_STALE_APPROVAL_REQUIRED',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  STOCK_CHANGED: 409,
  PRICE_CHANGED: 409,
  SHIPPING_RULE_MISSING: 422,
  IMPORT_STALE_APPROVAL_REQUIRED: 409,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = details;
  }
}

export const errors = {
  validation: (message: string, details?: unknown) => new AppError('VALIDATION_ERROR', message, details),
  unauthorized: (message = 'Authentication required') => new AppError('UNAUTHORIZED', message),
  forbidden: (message = 'You do not have permission to perform this action') => new AppError('FORBIDDEN', message),
  notFound: (message = 'Resource not found') => new AppError('NOT_FOUND', message),
  conflict: (message: string, details?: unknown) => new AppError('CONFLICT', message, details),
  stockChanged: (message: string, details?: unknown) => new AppError('STOCK_CHANGED', message, details),
  priceChanged: (message: string, details?: unknown) => new AppError('PRICE_CHANGED', message, details),
  shippingMissing: (message: string, details?: unknown) => new AppError('SHIPPING_RULE_MISSING', message, details),
  staleApproval: (message: string, details?: unknown) => new AppError('IMPORT_STALE_APPROVAL_REQUIRED', message, details),
  rateLimited: (message: string, retryAfterSeconds?: number) =>
    new AppError('RATE_LIMITED', message, retryAfterSeconds ? { retryAfterSeconds } : undefined),
};
