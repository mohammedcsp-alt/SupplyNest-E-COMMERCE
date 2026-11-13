import 'server-only';
import { z } from 'zod';
import { db } from '@/lib/db';
import { errors } from '@/lib/errors';
import { writeAudit } from '@/lib/audit';
import { getSetting, setSetting, SETTING_DEFAULTS, type SettingKey } from '@/lib/settings';

/** Allowed ranges for every admin-editable business setting (spec section 19.2). */
export const SETTING_RULES: Record<Exclude<SettingKey, 'currency.code'>, { min: number; max: number; ar: string; en: string }> = {
  'reservation.hours': { min: 1, max: 168, ar: 'مدة الحجز بالساعات قبل المراجعة', en: 'Reservation hold before review (hours)' },
  'inventory.lowStockThreshold': { min: 0, max: 10000, ar: 'حد المخزون المنخفض (وحدات)', en: 'Low stock threshold (units)' },
  'inventory.staleAfterHours': { min: 1, max: 720, ar: 'عدد الساعات قبل اعتبار بيانات المخزون قديمة', en: 'Hours before stock data is considered stale' },
  'order.maxQtyPerSku': { min: 1, max: 1000, ar: 'أقصى كمية لكل SKU في الطلب', en: 'Maximum quantity per SKU in an order' },
  'order.maxLinesPerOrder': { min: 1, max: 500, ar: 'أقصى عدد بنود في الطلب', en: 'Maximum lines per order' },
  'import.maxRows': { min: 1, max: 20000, ar: 'أقصى عدد صفوف في الملف', en: 'Maximum rows per import file' },
};

export const SETTING_KEYS = [
  'reservation.hours',
  'inventory.lowStockThreshold',
  'inventory.staleAfterHours',
  'order.maxQtyPerSku',
  'order.maxLinesPerOrder',
  'import.maxRows',
  'currency.code',
] as const;

export const settingUpdateSchema = z.object({
  key: z.enum(SETTING_KEYS),
  value: z.union([z.number(), z.string()]),
});

/** Validates a proposed value for a key. Throws VALIDATION_ERROR with a clear message otherwise. */
export function validateSettingValue(key: (typeof SETTING_KEYS)[number], value: number | string): number | 'IQD' {
  if (key === 'currency.code') {
    if (value !== 'IQD') throw errors.validation('Currency is fixed to IQD in V1');
    return 'IQD';
  }
  const rule = SETTING_RULES[key as Exclude<(typeof SETTING_KEYS)[number], 'currency.code'>];
  const n = typeof value === 'string' && /^-?\d+$/.test(value.trim()) ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isInteger(n)) throw errors.validation(`${key} must be a whole number`);
  if (n < rule.min || n > rule.max) throw errors.validation(`${key} must be between ${rule.min} and ${rule.max}`);
  return n;
}

export async function listSettings() {
  const rows = await Promise.all(
    (Object.keys(SETTING_DEFAULTS) as SettingKey[]).map(async (key) => ({
      key,
      value: await getSetting(db, key),
      defaultValue: SETTING_DEFAULTS[key],
      rule: key === 'currency.code' ? null : SETTING_RULES[key],
    })),
  );
  return rows;
}

export async function updateSetting(actorId: string, key: (typeof SETTING_KEYS)[number], rawValue: number | string, ip: string | null) {
  const value = validateSettingValue(key, rawValue);
  return db.$transaction(async (tx) => {
    const before = await getSetting(tx, key as SettingKey);
    await setSetting(tx, key as SettingKey, value as never, actorId);
    await writeAudit(tx, {
      actorId,
      action: 'settings.update',
      entityType: 'system_setting',
      entityId: key,
      before: { value: before },
      after: { value },
      ip,
    });
    return { key, value };
  });
}
