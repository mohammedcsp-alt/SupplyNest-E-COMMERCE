import 'server-only';
import { createHash } from 'node:crypto';
import type { Prisma, ImportType } from '@prisma/client';
import { db, type Tx } from '@/lib/db';

export type RowIssue = { rowNumber: number; field?: string | null; code: string; message: string };

export function checksumOf(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/** Persists a validated (or invalid) preview batch with its row issues. Nothing is applied to stock here. */
export async function saveBatchPreview(input: {
  type: ImportType;
  filename: string;
  checksum: string;
  uploadedById: string;
  payload: unknown;
  summary: Record<string, unknown>;
  issues: RowIssue[];
  freshness: 'FRESH' | 'STALE' | 'UNKNOWN';
  sourceGeneratedAt: Date | null;
}) {
  const valid = input.issues.length === 0;
  return db.importBatch.create({
    data: {
      type: input.type,
      filename: input.filename.slice(0, 255),
      checksum: input.checksum,
      uploadedById: input.uploadedById,
      status: valid ? 'PREVIEW_VALID' : 'PREVIEW_INVALID',
      freshness: input.freshness,
      sourceGeneratedAt: input.sourceGeneratedAt,
      payload: input.payload as Prisma.InputJsonValue,
      summary: input.summary as Prisma.InputJsonValue,
      errors: {
        create: input.issues.slice(0, 500).map((i) => ({
          rowNumber: i.rowNumber,
          field: i.field ?? null,
          code: i.code,
          message: i.message.slice(0, 500),
        })),
      },
    },
  });
}
