import 'server-only';
import type { Prisma } from '@prisma/client';
import { db } from './db';

/**
 * Business settings (ADM-17). Values live in system_settings as JSON. Defaults are the V1 defaults from
 * spec section 19.2 and are only used when no admin value exists. Changing a value is audited by the caller.
 */
export const SETTING_DEFAULTS = {
  'reservation.hours': 24, // OPEN-01: 1–168 allowed
  'inventory.lowStockThreshold': 5, // OPEN-05
  'inventory.staleAfterHours': 24, // OPEN-04
  'order.maxQtyPerSku': 100, // OPEN-22
  'order.maxLinesPerOrder': 200,
  'import.maxRows': 5000,
  'currency.code': 'IQD', // OPEN-08
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;

type Client = { systemSetting: typeof db.systemSetting };

export async function getSetting<K extends SettingKey>(client: Client, key: K): Promise<(typeof SETTING_DEFAULTS)[K]> {
  const row = await client.systemSetting.findUnique({ where: { key } });
  return (row ? (row.valueJson as (typeof SETTING_DEFAULTS)[K]) : SETTING_DEFAULTS[key]) as (typeof SETTING_DEFAULTS)[K];
}

export async function getNumberSetting(client: Client | Prisma.TransactionClient, key: string, fallback: number): Promise<number> {
  const row = await (client as Client).systemSetting.findUnique({ where: { key } });
  const v = row?.valueJson;
  return typeof v === 'number' ? v : fallback;
}

export async function setSetting<K extends SettingKey>(
  client: Client,
  key: K,
  value: (typeof SETTING_DEFAULTS)[K],
  actorId: string,
): Promise<void> {
  await client.systemSetting.upsert({
    where: { key },
    update: { valueJson: value as Prisma.InputJsonValue, updatedById: actorId },
    create: { key, valueJson: value as Prisma.InputJsonValue, updatedById: actorId },
  });
}
