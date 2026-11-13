import { apiRoute, ok, type RouteContext } from '@/lib/api';
import { getCurrentUser, requireUser } from '@/lib/session';
import { FULFILLMENT_LABELS, getJobForActor } from '@/modules/fulfillment/service';

export const dynamic = 'force-dynamic';

/**
 * Job detail. Picker and checker views hide expected counts (blind counting); the checker cannot see the picker's
 * numbers before counting either (enforced in the UI payload and in submitCheck).
 */
export const GET = apiRoute<{ id: string }>(async (_req, ctx: RouteContext<{ id: string }>, requestId) => {
  const actor = requireUser(await getCurrentUser());
  const { id } = await ctx.params;
  const { job, canSeeExpected } = await getJobForActor(actor, id);
  const isChecker = job.assignedCheckerId === actor.id;
  return ok(requestId, {
    id: job.id,
    prepDocumentNo: job.prepDocumentNo,
    status: job.status,
    statusLabel: FULFILLMENT_LABELS[job.status],
    orderNumber: job.order.orderNumber,
    customerNote: job.order.customerNote,
    assignedPickerId: job.assignedPickerId,
    assignedCheckerId: job.assignedCheckerId,
    prepPrintCount: job.prepPrintCount,
    version: job.version,
    lines: job.lines.map((l) => ({
      id: l.id,
      sku: l.orderItem.skuSnapshot,
      title: l.orderItem.titleSnapshot,
      quality: l.orderItem.qualitySnapshot,
      requestedQty: l.requestedQty,
      // blind counting: the checker never sees the picker's count until after submitting their own
      pickedQty: canSeeExpected || (!isChecker && actor.id === job.assignedPickerId) ? l.pickedQty : undefined,
      checkedQty: canSeeExpected || (isChecker && job.status !== 'CHECKING') ? l.checkedQty : undefined,
      resolvedQty: l.resolvedQty,
      discrepancyReason: l.discrepancyReason,
      unitPrice: canSeeExpected ? l.orderItem.unitPrice.toFixed(0) : undefined,
    })),
    packages: job.packages.map((p) => ({ id: p.id, packageNo: p.packageNo, label: p.label, trackingCode: p.trackingCode, weightGrams: p.weightGrams })),
    events: job.events.map((e) => ({ type: e.eventType, actorId: e.actorId, occurredAt: e.occurredAt, metadata: canSeeExpected ? e.metadata : undefined })),
  });
});
