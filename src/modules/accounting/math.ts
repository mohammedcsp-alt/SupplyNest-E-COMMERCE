/**
 * PURE settlement arithmetic (spec 20.3 / 20.4). No database, no I/O: fully unit-testable.
 * All values are integer IQD carried as strings to avoid floating point; internal math uses BigInt.
 *
 * Definitions:
 *  expected COD  = accepted goods + customer delivery fee + (signed expected-side adjustments)
 *  collected COD = amount the courier CONFIRMED collecting (null until confirmed). Never inferred from expected.
 *  Sign convention: adjustments are SIGNED. A negative due-side amount reduces what the courier owes.
 *  NET_DEDUCTION:      courierDue = collected − courierFeeDeducted + dueSideAdjustments(signed)
 *                      courier fee is taken from COD, so NO separate fee payable exists for this shipment.
 *  GROSS_REMITTANCE:   courierDue = collected + dueSideAdjustments(signed)
 *                      courier fee is payable separately: feePayable = courierFeeSnapshot (less payments).
 *  merchantOutstanding = courierDue − transfers allocated to this shipment.
 */

export const EXPECTED_SIDE_ADJUSTMENTS = ['REJECTION_PARTIAL', 'REJECTION_FULL', 'RETURN', 'CUSTOMER_REFUND', 'DISCOUNT'] as const;
export const DUE_SIDE_ADJUSTMENTS = ['COURIER_CORRECTION'] as const;

export type SettlementMode = 'NET_DEDUCTION' | 'GROSS_REMITTANCE';
export type AdjustmentRow = { type: string; signedAmount: string };

const ZERO = BigInt(0);

export function toBig(v: string | number | bigint | null | undefined): bigint {
  if (v === null || v === undefined || v === '') return ZERO;
  if (typeof v === 'bigint') return v;
  const s = String(v).trim();
  if (!/^-?\d+$/.test(s)) throw new RangeError(`Not an integer IQD amount: ${s}`);
  return BigInt(s);
}

export function fmt(v: bigint | null): string | null {
  return v === null ? null : v.toString();
}

function sumSigned(adjustments: AdjustmentRow[], types: readonly string[]): bigint {
  return adjustments.filter((a) => types.includes(a.type)).reduce((acc, a) => acc + toBig(a.signedAmount), ZERO);
}

export type ShipmentInput = {
  mode: SettlementMode;
  goodsTotal: string; // accepted goods value at handover
  customerDeliveryFee: string;
  courierFeeSnapshot: string;
  codCollected: string | null;
  courierFeeDeducted: string | null; // NET only; null until collection is confirmed
  adjustments: AdjustmentRow[];
  allocatedToShipment: string; // sum of remittance allocations for this shipment
};

export type ShipmentFinancials = {
  orderValue: string; // goods only (accepted)
  customerDeliveryFee: string;
  codExpected: string;
  codCollected: string | null;
  codVariance: string | null; // collected − expected (null until collected)
  courierFeeSnapshot: string;
  courierFeeDeducted: string | null; // what is withheld from COD (NET)
  courierFeePayableSeparately: string; // GROSS only, before fee payments
  courierDue: string | null; // amount the courier owes the merchant for this shipment
  transfersReceived: string;
  merchantOutstanding: string | null; // courierDue − transfers
  expectedSideAdjustments: string;
  dueSideAdjustments: string;
};

/** Computes every separate financial value for one shipment. Pure and deterministic. */
export function computeShipmentFinancials(input: ShipmentInput): ShipmentFinancials {
  const goods = toBig(input.goodsTotal);
  const deliveryFee = toBig(input.customerDeliveryFee);
  const courierFee = toBig(input.courierFeeSnapshot);
  const transfers = toBig(input.allocatedToShipment);
  const expectedAdj = sumSigned(input.adjustments, EXPECTED_SIDE_ADJUSTMENTS);
  const dueAdj = sumSigned(input.adjustments, DUE_SIDE_ADJUSTMENTS);

  const codExpected = goods + deliveryFee + expectedAdj;
  const collected = input.codCollected === null ? null : toBig(input.codCollected);
  const variance = collected === null ? null : collected - codExpected;

  let feeDeducted: bigint | null = null;
  let feePayable = ZERO;
  let courierDue: bigint | null = null;

  if (input.mode === 'NET_DEDUCTION') {
    feeDeducted = input.courierFeeDeducted === null ? (collected === null ? null : courierFee) : toBig(input.courierFeeDeducted);
    if (collected !== null) courierDue = collected - (feeDeducted ?? ZERO) + dueAdj;
  } else {
    feePayable = courierFee;
    if (collected !== null) courierDue = collected + dueAdj;
  }

  const outstanding = courierDue === null ? null : courierDue - transfers;
  return {
    orderValue: goods.toString(),
    customerDeliveryFee: deliveryFee.toString(),
    codExpected: codExpected.toString(),
    codCollected: fmt(collected),
    codVariance: fmt(variance),
    courierFeeSnapshot: courierFee.toString(),
    courierFeeDeducted: fmt(feeDeducted),
    courierFeePayableSeparately: feePayable.toString(),
    courierDue: fmt(courierDue),
    transfersReceived: transfers.toString(),
    merchantOutstanding: fmt(outstanding),
    expectedSideAdjustments: expectedAdj.toString(),
    dueSideAdjustments: dueAdj.toString(),
  };
}

/** Courier-level aggregate of a set of shipment financials plus separate fee payments. */
export function aggregateCourier(rows: ShipmentFinancials[], feePaymentsTotal: string) {
  let expected = ZERO;
  let collected = ZERO;
  let collectedCount = 0;
  let due = ZERO;
  let transfers = ZERO;
  let outstanding = ZERO;
  let feeDeductedTotal = ZERO;
  let feePayable = ZERO;
  let customerFees = ZERO;
  for (const r of rows) {
    expected += toBig(r.codExpected);
    customerFees += toBig(r.customerDeliveryFee);
    if (r.codCollected !== null) {
      collected += toBig(r.codCollected);
      collectedCount += 1;
    }
    if (r.courierDue !== null) due += toBig(r.courierDue);
    transfers += toBig(r.transfersReceived);
    if (r.merchantOutstanding !== null) outstanding += toBig(r.merchantOutstanding);
    if (r.courierFeeDeducted !== null) feeDeductedTotal += toBig(r.courierFeeDeducted);
    feePayable += toBig(r.courierFeePayableSeparately);
  }
  const payments = toBig(feePaymentsTotal);
  const feeOutstanding = feePayable - payments;
  return {
    codExpected: expected.toString(),
    codCollected: collectedCount === 0 ? null : collected.toString(),
    customerDeliveryFees: customerFees.toString(),
    courierFeesDeductedFromCod: feeDeductedTotal.toString(),
    courierFeesPayableSeparately: feePayable.toString(),
    courierFeePayments: payments.toString(),
    courierFeesOutstanding: feeOutstanding.toString(),
    courierDue: due.toString(),
    transfersReceived: transfers.toString(),
    merchantOutstanding: outstanding.toString(),
    remainingOutstanding: outstanding.toString(),
    // Net position stays a SUM of separate obligations, never a silent merge of COD with fees.
    netPosition: (outstanding - feeOutstanding).toString(),
  };
}

/** Maximum amount that may still be allocated to a shipment. */
export function allocatableFor(f: ShipmentFinancials): bigint {
  if (f.courierDue === null) return ZERO;
  const left = toBig(f.courierDue) - toBig(f.transfersReceived);
  return left > ZERO ? left : ZERO;
}

/** Outstanding separate courier fee for GROSS agreements, net of payments already recorded. */
export function feeOutstandingFor(payableTotal: string, paidTotal: string): bigint {
  const left = toBig(payableTotal) - toBig(paidTotal);
  return left > ZERO ? left : ZERO;
}
