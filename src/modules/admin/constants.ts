/** Enum mirrors used by admin reads and validators (kept here so client-safe pages can import without Prisma). */
export const ORDER_STATUSES_LIST = ['SUBMITTED', 'ON_HOLD_LOCAL', 'CANCELLATION_REQUESTED', 'CANCELLED'] as const;
export const ACCOUNT_STATUSES_LIST = ['REGISTERED', 'APPROVAL_PENDING', 'ACTIVE', 'REJECTED', 'SUSPENDED'] as const;
export const RESERVATION_STATUSES_LIST = ['ACTIVE', 'REVIEW_REQUIRED', 'EXTENDED', 'RELEASED', 'CONSUMED'] as const;
export const IMPORT_STATUSES_LIST = ['PREVIEW_VALID', 'PREVIEW_INVALID', 'COMMITTED', 'REJECTED'] as const;
export const ATTRIBUTE_TYPES_LIST = ['TEXT', 'NUMBER', 'BOOLEAN', 'ENUM'] as const;
export const ALERT_TYPES_LIST = ['LOW_STOCK', 'STALE_DATA', 'RESERVATION_REVIEW', 'STOCK_CONFLICT', 'SHORTAGE'] as const;
export const REPORT_TYPES_LIST = ['orders', 'customers', 'products', 'inventory', 'imports', 'prices', 'reservations', 'shipping'] as const;
export const CONTENT_SLUG_RE = /^[a-z0-9][a-z0-9-]{1,118}$/;
