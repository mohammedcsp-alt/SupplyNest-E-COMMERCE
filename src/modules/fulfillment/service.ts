import 'server-only';
import type { FulfillmentStatus, Prisma } from '@prisma/client';
import { db, type Tx } from '@/lib/db';
import { errors } from '@/lib/errors';
import { writeAudit } from '@/lib/audit';
import { PERMISSIONS } from '@/lib/rbac';
import type { CurrentUser } from '@/lib/session';
import { consumeForHandover, releaseSkuReservations } from '@/modules/inventory/inventory';
import { createShipmentForHandover } from '@/modules/accounting/shipments';

/**
 * TEMPORARY LOCAL FULFILLMENT MODULE (spec Phase 5, section 20).
 * Replaceable by a future WMS adapter: all state lives in fulfillment_* tables and is never deleted, so history
 * survives a cutover. The only outward effects are: order lock (edits close), inventory consumption at handover,
 * and the courier shipment/invoice created at handover (accounting module).
 *
 * Controls:
 *  - Picker and checker must be different users (independent checking, ACC-02).
 *  - A checker mismatch sends the job to DISCREPANCY_HOLD; only a manager with fulfillment.discrepancy.resolve
 *    may release it, with a reason per line (ACC-03).
 *  - Packing needs a CHECKED job. Handover consumes exactly the accepted quantity and releases the rest.
 */

export const FULFILLMENT_LABELS: Record<FulfillmentStatus, string> = {
  PENDING_ASSIGNMENT: 'Waiting for assignment',
  ASSIGNED: 'Assigned',
  PICKING: 'Picking',
  PICKED: 'Picked — waiting for check',
  CHECKING: 'Checking',
  DISCREPANCY_HOLD: 'Discrepancy — manager review',
  CHECKED: 'Checked',
  PACKING: 'Packing',
  PACKED: 'Packed',
  HANDED_OVER: 'Handed over to courier',
  CANCELLED: 'Cancelled',
};

async function prepNumber(tx: Tx): Promise<string> {
  const rows = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('prep_doc_seq') AS n`;
  const d = new Date();
  return `PREP-${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(rows[0].n).padStart(6, '0')}`;
}

/** Creates the preparation job for an order once (idempotent). */
export async function ensureFulfillmentJob(tx: Tx, orderId: string) {
  const existing = await tx.fulfillmentJob.findUnique({ where: { orderId } });
  if (existing) return existing;
  const job = await tx.fulfillmentJob.create({
    data: { orderId, prepDocumentNo: await prepNumber(tx), status: 'PENDING_ASSIGNMENT' },
  });
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
  await tx.pickLine.createMany({
    data: order.items.map((i) => ({ jobId: job.id, orderItemId: i.id, requestedQty: i.qty })),
  });
  await tx.fulfillmentEvent.create({ data: { jobId: job.id, eventType: 'JOB_CREATED', metadata: { orderId } } });
  return job;
}

async function loadJob(tx: Tx, jobId: string) {
  const job = await tx.fulfillmentJob.findUnique({
    where: { id: jobId },
    include: { lines: { include: { orderItem: { include: { sku: { select: { id: true, sku: true } } } } }, orderBy: { requestedQty: 'desc' } }, packages: true, order: true },
  });
  if (!job) throw errors.notFound('Fulfillment job not found');
  return job;
}

async function event(tx: Tx, jobId: string, eventType: string, actorId: string | null, metadata?: Prisma.InputJsonValue) {
  await tx.fulfillmentEvent.create({ data: { jobId, eventType, actorId, metadata: metadata ?? undefined } });
}

function requirePerm(actor: CurrentUser, perm: string) {
  if (!actor.permissions.has(perm)) throw errors.forbidden();
}

/** Staff assignment (FULFILLMENT_ASSIGN). Locks order edits for the customer (OPEN-12). */
export async function assignJob(actor: CurrentUser, input: { jobId: string; pickerId: string; checkerId: string }) {
  requirePerm(actor, PERMISSIONS.FULFILLMENT_ASSIGN);
  if (input.pickerId === input.checkerId) throw errors.validation('Picker and checker must be different people');
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "fulfillment_jobs" WHERE "id" = ${input.jobId}::uuid FOR UPDATE`;
    const job = await loadJob(tx, input.jobId);
    if (job.status === 'CANCELLED') throw errors.conflict('This job was cancelled');
    if (job.status !== 'PENDING_ASSIGNMENT' && job.status !== 'ASSIGNED') throw errors.conflict(`Cannot assign a job in status ${job.status}`);
    const [picker, checker] = await Promise.all([
      tx.user.findUnique({ where: { id: input.pickerId }, include: { userRoles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } } }),
      tx.user.findUnique({ where: { id: input.checkerId }, include: { userRoles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } } }),
    ]);
    const hasPerm = (u: typeof picker, code: string) => !!u && u.status === 'ACTIVE' && u.userRoles.some((ur) => ur.role.permissions.some((rp) => rp.permission.code === code));
    if (!hasPerm(picker, PERMISSIONS.FULFILLMENT_PICK)) throw errors.validation('Selected picker is not an active picker');
    if (!hasPerm(checker, PERMISSIONS.FULFILLMENT_CHECK)) throw errors.validation('Selected checker is not an active checker');
    const updated = await tx.fulfillmentJob.update({
      where: { id: job.id },
      data: { status: 'ASSIGNED', assignedPickerId: input.pickerId, assignedCheckerId: input.checkerId, assignedAt: new Date(), version: { increment: 1 } },
    });
    await tx.order.update({ where: { id: job.orderId }, data: { fulfillmentLockedAt: job.order.fulfillmentLockedAt ?? new Date(), version: { increment: 1 } } });
    await event(tx, job.id, 'ASSIGNED', actor.id, { pickerId: input.pickerId, checkerId: input.checkerId });
    await writeAudit(tx, { actorId: actor.id, action: 'fulfillment.assign', entityType: 'fulfillment_job', entityId: job.id, after: { pickerId: input.pickerId, checkerId: input.checkerId } });
    return updated;
  });
}

/** Generic guarded transition helper: checks status and the acting user's assignment and permission. */
async function transition(
  actor: CurrentUser,
  jobId: string,
  opts: { perm: string; from: FulfillmentStatus[]; to: FulfillmentStatus; role?: 'picker' | 'checker'; eventType: string },
  body?: (tx: Tx, job: Awaited<ReturnType<typeof loadJob>>) => Promise<void>,
) {
  requirePerm(actor, opts.perm);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "fulfillment_jobs" WHERE "id" = ${jobId}::uuid FOR UPDATE`;
    const job = await loadJob(tx, jobId);
    if (!opts.from.includes(job.status)) throw errors.conflict(`Action not allowed while job is ${job.status}`);
    if (opts.role === 'picker' && job.assignedPickerId !== actor.id) throw errors.forbidden('Only the assigned picker can do this');
    if (opts.role === 'checker' && job.assignedCheckerId !== actor.id) throw errors.forbidden('Only the assigned checker can do this');
    if (opts.role === 'checker' && job.assignedPickerId === actor.id) throw errors.forbidden('The checker must be a different person from the picker');
    if (body) await body(tx, job);
    const updated = await tx.fulfillmentJob.update({ where: { id: job.id }, data: { status: opts.to, version: { increment: 1 }, ...(opts.to === 'PICKING' ? { startedAt: new Date() } : {}) } });
    await event(tx, job.id, opts.eventType, actor.id, { from: job.status, to: opts.to });
    return updated;
  });
}

export async function startPicking(actor: CurrentUser, jobId: string) {
  return transition(actor, jobId, { perm: PERMISSIONS.FULFILLMENT_PICK, from: ['ASSIGNED'], to: 'PICKING', role: 'picker', eventType: 'PICK_STARTED' });
}

/** Records picked quantities. Shortages need a reason. Status becomes PICKED (waiting for the independent check). */
export async function submitPick(actor: CurrentUser, jobId: string, lines: Array<{ pickLineId: string; pickedQty: number; reason?: string }>) {
  return transition(
    actor,
    jobId,
    { perm: PERMISSIONS.FULFILLMENT_PICK, from: ['PICKING'], to: 'PICKED', role: 'picker', eventType: 'PICK_SUBMITTED' },
    async (tx, job) => {
      const byId = new Map(job.lines.map((l) => [l.id, l]));
      if (lines.length !== job.lines.length) throw errors.validation('Submit a quantity for every line');
      for (const l of lines) {
        const line = byId.get(l.pickLineId);
        if (!line) throw errors.validation('Unknown pick line');
        if (!Number.isInteger(l.pickedQty) || l.pickedQty < 0 || l.pickedQty > line.requestedQty) throw errors.validation(`Picked quantity must be 0–${line.requestedQty}`);
        if (l.pickedQty < line.requestedQty && !(l.reason && l.reason.trim().length >= 3)) throw errors.validation('A reason is required when picking less than requested');
        await tx.pickLine.update({ where: { id: line.id }, data: { pickedQty: l.pickedQty, discrepancyReason: l.pickedQty < line.requestedQty ? l.reason!.trim() : null } });
      }
    },
  );
}

export async function startChecking(actor: CurrentUser, jobId: string) {
  return transition(actor, jobId, { perm: PERMISSIONS.FULFILLMENT_CHECK, from: ['PICKED'], to: 'CHECKING', role: 'checker', eventType: 'CHECK_STARTED' });
}

/**
 * Independent count. Matching every line → CHECKED. Any mismatch → DISCREPANCY_HOLD for a manager.
 * The checker never sees a pre-filled count (the UI sends counts blind).
 */
export async function submitCheck(actor: CurrentUser, jobId: string, lines: Array<{ pickLineId: string; checkedQty: number }>) {
  let mismatches = 0;
  const updated = await transition(
    actor,
    jobId,
    { perm: PERMISSIONS.FULFILLMENT_CHECK, from: ['CHECKING'], to: 'CHECKED', role: 'checker', eventType: 'CHECK_SUBMITTED' },
    async (tx, job) => {
      const byId = new Map(job.lines.map((l) => [l.id, l]));
      if (lines.length !== job.lines.length) throw errors.validation('Submit a count for every line');
      for (const l of lines) {
        const line = byId.get(l.pickLineId);
        if (!line) throw errors.validation('Unknown pick line');
        if (!Number.isInteger(l.checkedQty) || l.checkedQty < 0 || l.checkedQty > line.requestedQty) throw errors.validation('Invalid checked quantity');
        if (l.checkedQty !== (line.pickedQty ?? -1)) mismatches += 1;
        await tx.pickLine.update({ where: { id: line.id }, data: { checkedQty: l.checkedQty } });
      }
    },
  );
  if (mismatches > 0) {
    const held = await db.fulfillmentJob.update({ where: { id: jobId }, data: { status: 'DISCREPANCY_HOLD', version: { increment: 1 } } });
    await db.fulfillmentEvent.create({ data: { jobId, eventType: 'DISCREPANCY_RAISED', actorId: actor.id, metadata: { mismatches } } });
    return { ...held, mismatches };
  }
  return { ...updated, mismatches: 0 };
}

/** Manager resolution: each line gets an accepted quantity and a reason. Job returns to CHECKED. */
export async function resolveDiscrepancy(actor: CurrentUser, jobId: string, lines: Array<{ pickLineId: string; acceptedQty: number; reason: string }>) {
  requirePerm(actor, PERMISSIONS.FULFILLMENT_DISCREPANCY_RESOLVE);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "fulfillment_jobs" WHERE "id" = ${jobId}::uuid FOR UPDATE`;
    const job = await loadJob(tx, jobId);
    if (job.status !== 'DISCREPANCY_HOLD') throw errors.conflict('This job has no open discrepancy');
    if (lines.length !== job.lines.length) throw errors.validation('Resolve every line');
    const byId = new Map(job.lines.map((l) => [l.id, l]));
    for (const l of lines) {
      const line = byId.get(l.pickLineId);
      if (!line) throw errors.validation('Unknown pick line');
      const cap = Math.min(line.requestedQty, Math.max(line.pickedQty ?? 0, line.checkedQty ?? 0));
      if (!Number.isInteger(l.acceptedQty) || l.acceptedQty < 0 || l.acceptedQty > line.requestedQty) throw errors.validation('Invalid accepted quantity');
      if (l.acceptedQty > cap) throw errors.validation(`Accepted quantity for ${line.orderItem.skuSnapshot} cannot exceed what was counted (${cap})`);
      if (l.reason.trim().length < 3) throw errors.validation('Every resolved line needs a reason');
      await tx.pickLine.update({ where: { id: line.id }, data: { resolvedQty: l.acceptedQty, resolvedById: actor.id, discrepancyReason: l.reason.trim() } });
    }
    const updated = await tx.fulfillmentJob.update({ where: { id: job.id }, data: { status: 'CHECKED', version: { increment: 1 } } });
    await event(tx, job.id, 'DISCREPANCY_RESOLVED', actor.id, { lines: lines.length });
    await writeAudit(tx, { actorId: actor.id, action: 'fulfillment.discrepancy.resolve', entityType: 'fulfillment_job', entityId: job.id, reason: lines.map((l) => l.reason).join(' | ').slice(0, 500) });
    return updated;
  });
}

/** Accepted quantity per line: resolved if a manager resolved, otherwise the checked count. */
function acceptedOf(line: { resolvedQty: number | null; checkedQty: number | null }): number {
  return line.resolvedQty ?? line.checkedQty ?? 0;
}

export async function startPacking(actor: CurrentUser, jobId: string) {
  return transition(actor, jobId, { perm: PERMISSIONS.FULFILLMENT_PACK, from: ['CHECKED'], to: 'PACKING', eventType: 'PACK_STARTED' });
}

export async function addPackage(actor: CurrentUser, jobId: string, input: { weightGrams?: number | null; trackingCode?: string | null }) {
  requirePerm(actor, PERMISSIONS.FULFILLMENT_PACK);
  return db.$transaction(async (tx) => {
    const job = await loadJob(tx, jobId);
    if (job.status !== 'PACKING') throw errors.conflict('Packages can only be added while packing');
    const next = (job.packages.reduce((m, p) => Math.max(m, p.packageNo), 0)) + 1;
    const pkg = await tx.package.create({
      data: { jobId, packageNo: next, label: `${job.prepDocumentNo}-P${next}`, weightGrams: input.weightGrams ?? null, trackingCode: input.trackingCode ?? null },
    });
    await event(tx, jobId, 'PACKAGE_ADDED', actor.id, { packageNo: next });
    return pkg;
  });
}

export async function finishPacking(actor: CurrentUser, jobId: string) {
  requirePerm(actor, PERMISSIONS.FULFILLMENT_PACK);
  return db.$transaction(async (tx) => {
    const job = await loadJob(tx, jobId);
    if (job.status !== 'PACKING') throw errors.conflict('Job is not packing');
    if (job.packages.length === 0) throw errors.validation('Add at least one parcel before finishing packing');
    const updated = await tx.fulfillmentJob.update({ where: { id: jobId }, data: { status: 'PACKED', version: { increment: 1 } } });
    await event(tx, jobId, 'PACKED', actor.id, { parcels: job.packages.length });
    return updated;
  });
}

/**
 * Hands the parcels to a courier. Consumes stock for the ACCEPTED quantity only, releases the remainder of the
 * order's reservation for that SKU, records the courier shipment with fee snapshots, and issues the sales invoice.
 */
export async function handOver(actor: CurrentUser, jobId: string, input: { courierId: string; trackingNote?: string | null }) {
  requirePerm(actor, PERMISSIONS.FULFILLMENT_HANDOVER);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "fulfillment_jobs" WHERE "id" = ${jobId}::uuid FOR UPDATE`;
    const job = await loadJob(tx, jobId);
    if (job.status !== 'PACKED') throw errors.conflict(`Handover needs a PACKED job (current: ${job.status})`);

    const order = await tx.order.findUniqueOrThrow({ where: { id: job.orderId }, include: { items: true } });
    const accepted = new Map<string, number>(); // skuId -> accepted qty
    for (const line of job.lines) {
      const qty = acceptedOf(line);
      const skuId = line.orderItem.skuId;
      accepted.set(skuId, (accepted.get(skuId) ?? 0) + qty);
    }
    for (const [skuId, qty] of accepted) {
      if (qty > 0) await consumeForHandover(tx, { orderId: order.id, skuId, qty, actorId: actor.id });
      await releaseSkuReservations(tx, { orderId: order.id, skuId, actorId: actor.id, reason: 'not handed over (shortage or rejection at packing)' });
    }

    const shipment = await createShipmentForHandover(tx, {
      order,
      acceptedLines: job.lines.map((l) => ({ skuId: l.orderItem.skuId, sku: l.orderItem.skuSnapshot, title: l.orderItem.titleSnapshot, unitPrice: l.orderItem.unitPrice, qty: acceptedOf(l) })),
      courierId: input.courierId,
      trackingNote: input.trackingNote ?? null,
      actorId: actor.id,
    });

    const updated = await tx.fulfillmentJob.update({ where: { id: jobId }, data: { status: 'HANDED_OVER', completedAt: new Date(), version: { increment: 1 } } });
    await event(tx, jobId, 'HANDED_OVER', actor.id, { courierId: input.courierId, shipmentId: shipment.id });
    await writeAudit(tx, { actorId: actor.id, action: 'fulfillment.handover', entityType: 'fulfillment_job', entityId: jobId, after: { shipmentId: shipment.id, courierId: input.courierId } });
    return { job: updated, shipmentId: shipment.id };
  });
}

/** Printing never creates liabilities; it only counts prints (ACC-01). */
export async function markPrepPrinted(actor: CurrentUser, jobId: string) {
  requirePerm(actor, PERMISSIONS.FULFILLMENT_PRINT);
  const job = await db.fulfillmentJob.update({ where: { id: jobId }, data: { prepPrintCount: { increment: 1 } } });
  await db.fulfillmentEvent.create({ data: { jobId, eventType: 'PREP_PRINTED', actorId: actor.id, metadata: { count: job.prepPrintCount } } });
  return job;
}

export async function getJobForActor(actor: CurrentUser, jobId: string) {
  requirePerm(actor, PERMISSIONS.FULFILLMENT_VIEW);
  const job = await db.fulfillmentJob.findUnique({
    where: { id: jobId },
    include: {
      order: { select: { orderNumber: true, addressSnapshot: true, customerNote: true, subtotal: true, shippingFee: true, totalCod: true } },
      lines: { include: { orderItem: { select: { skuSnapshot: true, titleSnapshot: true, qualitySnapshot: true, qty: true, unitPrice: true, lineTotal: true, skuId: true } } }, orderBy: { id: 'asc' } },
      packages: { orderBy: { packageNo: 'asc' } },
      events: { orderBy: { occurredAt: 'asc' }, take: 200 },
    },
  });
  if (!job) throw errors.notFound('Fulfillment job not found');
  // Picker/checker view hides the expected counts (blind counting); managers see everything.
  const canSeeExpected = actor.permissions.has(PERMISSIONS.FULFILLMENT_DISCREPANCY_RESOLVE) || actor.permissions.has(PERMISSIONS.REPORT_VIEW);
  return { job, canSeeExpected };
}

/** Task queue for staff. Pickers/checkers see only their assignments (plus unassigned work for managers). */
export async function listJobs(actor: CurrentUser, opts: { status?: FulfillmentStatus; mine?: boolean }) {
  requirePerm(actor, PERMISSIONS.FULFILLMENT_VIEW);
  const manager = actor.permissions.has(PERMISSIONS.FULFILLMENT_ASSIGN);
  const where: Prisma.FulfillmentJobWhereInput = {
    ...(opts.status ? { status: opts.status } : {}),
    ...(!manager ? { OR: [{ assignedPickerId: actor.id }, { assignedCheckerId: actor.id }] } : opts.mine ? { OR: [{ assignedPickerId: actor.id }, { assignedCheckerId: actor.id }] } : {}),
  };
  return db.fulfillmentJob.findMany({
    where,
    orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
    take: 200,
    select: { id: true, prepDocumentNo: true, status: true, orderId: true, assignedPickerId: true, assignedCheckerId: true, createdAt: true, order: { select: { orderNumber: true } } },
  });
}
