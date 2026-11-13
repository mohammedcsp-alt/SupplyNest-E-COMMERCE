import 'server-only';
import { db } from '@/lib/db';
import { errors } from '@/lib/errors';

/** Validates a governorate (and optional area belonging to it) for addresses and shipping rules. */
export async function assertGeoValid(governorateId: string, areaId: string | null): Promise<void> {
  const g = await db.governorate.findFirst({ where: { id: governorateId, active: true } });
  if (!g) throw errors.validation('Select an active governorate');
  if (areaId) {
    const a = await db.deliveryArea.findFirst({ where: { id: areaId, governorateId, active: true } });
    if (!a) throw errors.validation('The area does not belong to the governorate');
  }
}
