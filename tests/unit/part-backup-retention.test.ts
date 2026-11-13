import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, unlink, utimes, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { backupCreatedAtFromName, listBackupFiles, selectBackupFilesToPrune, BACKUP_RETENTION_DAYS } from '@/modules/admin/backup';

const DAY = 24 * 3600 * 1000;
const NOW = new Date('2026-11-13T12:00:00.000Z');
const stampFor = (d: Date) => `b2b-store-${d.toISOString().replace(/[:.]/g, '-')}.dump`;

describe('backup retention (OPEN-15) pure rule', () => {
  it('uses a 30-day retention window', () => {
    expect(BACKUP_RETENTION_DAYS).toBe(30);
  });

  it('reads the creation time from the dump name and ignores other names', () => {
    const d = new Date('2026-10-01T02:00:00.123Z');
    expect(backupCreatedAtFromName(stampFor(d))?.toISOString()).toBe(d.toISOString());
    expect(backupCreatedAtFromName('notes.txt')).toBeNull();
    expect(backupCreatedAtFromName('b2b-store-2026-10-01.dump')).toBeNull();
  });

  it('selects only files strictly older than 30 days and keeps recent ones', () => {
    const files = [
      { path: 'a', createdAt: new Date(NOW.getTime() - 31 * DAY) },
      { path: 'b', createdAt: new Date(NOW.getTime() - 30 * DAY + 60_000) },
      { path: 'c', createdAt: new Date(NOW.getTime() - 2 * DAY) },
      { path: 'd', createdAt: new Date(NOW.getTime() - 90 * DAY) },
    ];
    expect(selectBackupFilesToPrune(files, NOW).map((f) => f.path).sort()).toEqual(['a', 'd']);
  });

  it('never selects the newest file, even when it is older than the window', () => {
    const files = [
      { path: 'old-1', createdAt: new Date(NOW.getTime() - 60 * DAY) },
      { path: 'old-2', createdAt: new Date(NOW.getTime() - 45 * DAY) },
    ];
    expect(selectBackupFilesToPrune(files, NOW).map((f) => f.path)).toEqual(['old-1']);
  });

  it('returns nothing for an empty directory', () => {
    expect(selectBackupFilesToPrune([], NOW)).toEqual([]);
  });
});

describe('backup retention with temporary files', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'part-backup-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('lists only dump names, prunes old ones on disk, and keeps the newest and recent files', async () => {
    const oldest = new Date(NOW.getTime() - 40 * DAY);
    const middle = new Date(NOW.getTime() - 35 * DAY);
    const recent = new Date(NOW.getTime() - 3 * DAY);
    const names = { oldest: stampFor(oldest), middle: stampFor(middle), recent: stampFor(recent) };
    for (const n of Object.values(names)) await writeFile(path.join(dir, n), 'dump-bytes');
    await writeFile(path.join(dir, 'operator-notes.txt'), 'keep me');

    const listed = await listBackupFiles(dir);
    expect(listed).toHaveLength(3);

    const doomed = selectBackupFilesToPrune(listed, NOW);
    expect(doomed.map((f) => path.basename(f.path)).sort()).toEqual([names.middle, names.oldest].sort());

    for (const f of doomed) await unlink(f.path);
    const remaining = (await readdir(dir)).sort();
    expect(remaining).toEqual([names.recent, 'operator-notes.txt'].sort());
  });

  it('a directory with only one old dump deletes nothing (the newest is always kept)', async () => {
    const d = new Date(NOW.getTime() - 400 * DAY);
    const file = path.join(dir, stampFor(d));
    await writeFile(file, 'x');
    await utimes(file, d, d);
    expect(selectBackupFilesToPrune(await listBackupFiles(dir), NOW)).toEqual([]);
  });
});
