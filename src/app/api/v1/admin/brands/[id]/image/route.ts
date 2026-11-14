import { adminImageHandlers } from '@/modules/catalog/media-route';
import { PERMISSIONS } from '@/lib/rbac';

export const dynamic = 'force-dynamic';
export const { POST, DELETE } = adminImageHandlers('brand', PERMISSIONS.CATALOG_MANAGE);
