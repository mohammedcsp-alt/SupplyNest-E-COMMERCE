import 'server-only';
import { execFile, type ExecFileException } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { config } from '@/lib/config';
import { errors, AppError } from '@/lib/errors';
import { writeAudit } from '@/lib/audit';

/**
 * Backup and restore-test (OPS). Shell calls use execFile with fixed argument arrays (no shell interpolation).
 * The restore test NEVER touches the development database: it creates and drops one fixed scratch database.
 */

export const BACKUP_CONTAINER = 'b2b-store-postgres';
export const BACKUP_DB_USER = 'b2b_app';
export const DEV_DATABASE: string = 'b2b_store_dev';
export const SCRATCH_DATABASE: string = 'b2b_store_restore_scratch';
export const KEY_TABLES = ['users', 'orders', 'order_items', 'product_skus', 'tier_prices', 'inventory_balances', 'inventory_movements', 'inventory_reservations', 'imports', 'audit_logs', 'shipping_rate_rules', 'governorates', 'delivery_areas'] as const;

const MAX_DUMP_BYTES = 1536 * 1024 * 1024;

type RunResult = { stdout: Buffer; stderr: string };

function run(file: string, args: string[], opts: { input?: Buffer; timeoutMs: number; maxBytes?: number }): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      file,
      args,
      { encoding: 'buffer', maxBuffer: opts.maxBytes ?? 16 * 1024 * 1024, timeout: opts.timeoutMs, windowsHide: true },
      (err: ExecFileException | null, stdout: Buffer, stderr: Buffer) => {
        if (err) {
          reject(new Error(`${args[0]} failed: ${(stderr?.toString() || err.message).slice(0, 500)}`));
          return;
        }
        resolve({ stdout, stderr: stderr?.toString() ?? '' });
      },
    );
    child.stdin?.on('error', () => undefined);
    child.stdin?.end(opts.input ?? undefined);
  });
}

/** Fails clearly when docker is not reachable. Nothing is recorded as successful in that case. */
export async function assertDockerAvailable(): Promise<void> {
  try {
    await run('docker', ['info', '--format', '{{.ServerVersion}}'], { timeoutMs: 15_000 });
  } catch {
    throw new AppError('INTERNAL_ERROR', `Docker is not reachable. Start Docker Desktop and the container "${BACKUP_CONTAINER}", then try again.`);
  }
}

async function psql(sql: string, database: string): Promise<string> {
  const { stdout } = await run('docker', ['exec', BACKUP_CONTAINER, 'psql', '-U', BACKUP_DB_USER, '-d', database, '-v', 'ON_ERROR_STOP=1', '-At', '-F', '|', '-c', sql], { timeoutMs: 120_000 });
  return stdout.toString('utf8');
}

export async function countKeyTables(database: string): Promise<Record<string, number>> {
  const sql = KEY_TABLES.map((t) => `SELECT '${t}', count(*) FROM "${t}"`).join(' UNION ALL ');
  const out = await psql(sql, database);
  const counts: Record<string, number> = {};
  for (const line of out.split('\n')) {
    const [name, n] = line.trim().split('|');
    if (name && n !== undefined) counts[name] = Number(n);
  }
  return counts;
}

function backupDirectory(): string {
  return path.resolve(config.BACKUP_DIR);
}

export async function listBackupRuns() {
  return db.backupRun.findMany({ orderBy: { startedAt: 'desc' }, take: 100 });
}

/** Dump files are kept for this many days (OPEN-15). The newest dump is never pruned, whatever its age. */
export const BACKUP_RETENTION_DAYS = 30;
const DUMP_NAME_RE = /^b2b-store-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z\.dump$/;

export type BackupFileEntry = { path: string; createdAt: Date };

/** Reads the creation time from the file name written by runBackup. Files with other names are never touched. */
export function backupCreatedAtFromName(fileName: string): Date | null {
  const m = DUMP_NAME_RE.exec(fileName);
  if (!m) return null;
  const [y, mo, d, h, mi, s, ms] = m.slice(1).map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h, mi, s, ms));
}

/**
 * Pure retention rule. Given the dump files in the backup directory, returns the ones older than the retention window.
 * The newest file is always kept, so a long gap between runs can never leave the store without a backup.
 */
export function selectBackupFilesToPrune(files: BackupFileEntry[], now: Date, retentionDays: number = BACKUP_RETENTION_DAYS): BackupFileEntry[] {
  if (files.length === 0) return [];
  const cutoff = now.getTime() - retentionDays * 24 * 3600 * 1000;
  const newest = files.reduce((a, b) => (b.createdAt.getTime() > a.createdAt.getTime() ? b : a));
  return files.filter((f) => f.path !== newest.path && f.createdAt.getTime() < cutoff);
}

/** Lists dump files written by runBackup in a directory (names that do not match the pattern are ignored). */
export async function listBackupFiles(dir: string): Promise<BackupFileEntry[]> {
  const names = await readdir(dir).catch(() => [] as string[]);
  const out: BackupFileEntry[] = [];
  for (const name of names) {
    const createdAt = backupCreatedAtFromName(name);
    if (createdAt) out.push({ path: path.join(dir, name), createdAt });
  }
  return out;
}

/**
 * Deletes dump files past retention and marks their BackupRun rows (evidence.prunedAt). Only files inside the
 * backup directory, matching the dump name pattern, are considered.
 */
export async function pruneBackupFiles(actorId: string | null, ip: string | null, now: Date = new Date()) {
  const dir = backupDirectory();
  const doomed = selectBackupFilesToPrune(await listBackupFiles(dir), now);
  const deleted: string[] = [];
  for (const f of doomed) {
    try {
      await unlink(f.path);
      deleted.push(path.basename(f.path));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }
  if (deleted.length === 0) return { deleted, marked: 0 };
  let marked = 0;
  await db.$transaction(async (tx) => {
    for (const name of deleted) {
      const rows = await tx.backupRun.findMany({ where: { artifactPath: { endsWith: name } } });
      for (const row of rows) {
        const evidence = (row.evidence && typeof row.evidence === 'object' ? row.evidence : {}) as Record<string, unknown>;
        await tx.backupRun.update({
          where: { id: row.id },
          data: { evidence: { ...evidence, prunedAt: now.toISOString() } as Prisma.InputJsonValue },
        });
        marked += 1;
      }
    }
    await writeAudit(tx, { actorId, action: 'backup.prune', entityType: 'backup_run', entityId: 'retention', after: { deleted, retentionDays: BACKUP_RETENTION_DAYS, marked }, ip });
  });
  return { deleted, marked };
}

export async function runBackup(actorId: string | null, ip: string | null) {
  await assertDockerAvailable();
  const started = new Date();
  const stamp = started.toISOString().replace(/[:.]/g, '-');
  const dir = backupDirectory();
  const fileName = `b2b-store-${stamp}.dump`;
  const full = path.join(dir, fileName);
  let dump: Buffer;
  try {
    dump = (await run('docker', ['exec', BACKUP_CONTAINER, 'pg_dump', '-U', BACKUP_DB_USER, '-d', DEV_DATABASE, '-Fc'], { timeoutMs: 600_000, maxBytes: MAX_DUMP_BYTES })).stdout;
    if (dump.length === 0) throw new Error('pg_dump produced no output');
    const rowCounts = await countKeyTables(DEV_DATABASE);
    await mkdir(dir, { recursive: true });
    await writeFile(full, dump, { flag: 'wx' });
    const checksum = createHash('sha256').update(dump).digest('hex');
    const relPath = path.join(path.relative(process.cwd(), dir), fileName).replace(/\\/g, '/');
    return await db.$transaction(async (tx) => {
      const row = await tx.backupRun.create({
        data: {
          startedAt: started,
          completedAt: new Date(),
          kind: 'MANUAL',
          status: 'SUCCEEDED',
          artifactPath: relPath,
          checksum,
          rowCounts: rowCounts as Prisma.InputJsonValue,
          evidence: { bytes: dump.length, format: 'pg_dump -Fc', container: BACKUP_CONTAINER } as Prisma.InputJsonValue,
        },
      });
      await writeAudit(tx, { actorId, action: 'backup.run', entityType: 'backup_run', entityId: row.id, after: { checksum, bytes: dump.length }, ip });
      return row;
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    await db.backupRun.create({
      data: { startedAt: started, completedAt: new Date(), kind: 'MANUAL', status: 'FAILED', evidence: { error: (err as Error).message.slice(0, 500) } as Prisma.InputJsonValue },
    });
    throw new AppError('INTERNAL_ERROR', 'Backup failed. See the backup status table for details.');
  }
}

/**
 * Restores the latest successful dump into the scratch database, compares key table counts with the counts
 * recorded at backup time, then drops the scratch database. Refuses to run on any other database name.
 */
export async function runRestoreTest(actorId: string | null, ip: string | null) {
  if (SCRATCH_DATABASE !== 'b2b_store_restore_scratch' || SCRATCH_DATABASE === DEV_DATABASE) throw errors.forbidden('Restore test refused: invalid scratch database');
  await assertDockerAvailable();
  const source = await db.backupRun.findFirst({ where: { kind: 'MANUAL', status: 'SUCCEEDED' }, orderBy: { startedAt: 'desc' } });
  if (!source || !source.artifactPath) throw errors.validation('No successful backup exists yet. Run a backup first.');

  const base = backupDirectory();
  const full = path.resolve(process.cwd(), source.artifactPath);
  if (!full.startsWith(base + path.sep)) throw errors.validation('Backup artifact is outside the backup directory');
  const dump = await readFile(full).catch(() => null);
  if (!dump) throw errors.notFound('Backup file is missing on disk');
  const checksum = createHash('sha256').update(dump).digest('hex');
  const started = new Date();

  const finish = async (result: 'PASSED' | 'FAILED', evidence: Record<string, unknown>, restored: Record<string, number> | null) => {
    return db.$transaction(async (tx) => {
      const row = await tx.backupRun.create({
        data: {
          startedAt: started,
          completedAt: new Date(),
          kind: 'RESTORE_TEST',
          status: result,
          artifactPath: source.artifactPath,
          checksum,
          rowCounts: (restored ?? undefined) as Prisma.InputJsonValue | undefined,
          restoreTestAt: new Date(),
          restoreResult: result,
          evidence: { ...evidence, sourceRunId: source.id, scratchDatabase: SCRATCH_DATABASE } as Prisma.InputJsonValue,
        },
      });
      await tx.backupRun.update({ where: { id: source.id }, data: { restoreTestAt: new Date(), restoreResult: result } });
      await writeAudit(tx, { actorId, action: 'backup.restore_test', entityType: 'backup_run', entityId: row.id, after: { result, sourceRunId: source.id }, ip });
      return row;
    });
  };

  if (checksum !== source.checksum) {
    return finish('FAILED', { reason: 'checksum mismatch with recorded backup' }, null);
  }

  try {
    await psql(`DROP DATABASE IF EXISTS "${SCRATCH_DATABASE}"`, 'postgres');
    await psql(`CREATE DATABASE "${SCRATCH_DATABASE}"`, 'postgres');
    await run('docker', ['exec', '-i', BACKUP_CONTAINER, 'pg_restore', '-U', BACKUP_DB_USER, '-d', SCRATCH_DATABASE, '--no-owner', '--exit-on-error'], { input: dump, timeoutMs: 600_000 });
    const restored = await countKeyTables(SCRATCH_DATABASE);
    const recorded = (source.rowCounts ?? {}) as Record<string, number>;
    const mismatches = KEY_TABLES.filter((t) => recorded[t] !== restored[t]).map((t) => ({ table: t, recorded: recorded[t] ?? null, restored: restored[t] ?? null }));
    return await finish(mismatches.length === 0 ? 'PASSED' : 'FAILED', { mismatches }, restored);
  } catch (err) {
    return finish('FAILED', { error: (err as Error).message.slice(0, 500) }, null);
  } finally {
    await psql(`DROP DATABASE IF EXISTS "${SCRATCH_DATABASE}"`, 'postgres').catch(() => undefined);
  }
}
