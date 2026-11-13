import { z } from 'zod';
import { apiRoute, ok, readJson } from '@/lib/api';
import { errors } from '@/lib/errors';
import { getCurrentUser, requireActiveCustomer } from '@/lib/session';
import { previewBulk } from '@/modules/commerce/cart';

export const dynamic = 'force-dynamic';

const textSchema = z.object({ text: z.string().max(50_000) });

/**
 * P05 / P06 / CUS-07 / CUS-08: preview pasted SKU lines (JSON {text}) or an uploaded SKU,QTY file (multipart "file").
 * Returns valid lines and per-row issues. Creates NOTHING; the customer adds reviewed lines to the cart explicitly.
 */
export const POST = apiRoute(async (req, _ctx, requestId) => {
  const user = requireActiveCustomer(await getCurrentUser());
  const contentType = req.headers.get('content-type') ?? '';
  let result;
  if (contentType.startsWith('multipart/form-data')) {
    const form = await req.formData().catch(() => {
      throw errors.validation('Expected multipart/form-data with a "file" field');
    });
    const file = form.get('file');
    if (!(file instanceof File)) throw errors.validation('Field "file" is required');
    result = await previewBulk({ customerId: user.id, file: { buffer: Buffer.from(await file.arrayBuffer()), filename: file.name || 'upload.csv' } });
  } else {
    const body = await readJson(req, textSchema);
    result = await previewBulk({ customerId: user.id, text: body.text });
  }
  return ok(requestId, {
    lines: result.lines.map((l) => ({ sku: l.sku, skuId: l.skuId, nameEn: l.nameEn, qty: l.qty, sourceRows: l.sourceRows, availableNow: l.availableNow, qualityCode: l.qualityCode })),
    issues: result.issues,
    mergedDuplicates: result.mergedDuplicates,
    rowsRead: result.rowsRead,
  });
});
