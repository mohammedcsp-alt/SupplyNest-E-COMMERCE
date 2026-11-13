import { describe, expect, it } from 'vitest';
import { computeShipmentFinancials, aggregateCourier, allocatableFor, feeOutstandingFor } from '@/modules/accounting/math';

const base = {
  goodsTotal: '100000',
  customerDeliveryFee: '5000',
  courierFeeSnapshot: '3000',
  codCollected: null as string | null,
  courierFeeDeducted: null as string | null,
  adjustments: [] as Array<{ type: string; signedAmount: string }>,
  allocatedToShipment: '0',
};

describe('settlement math (spec 20.4)', () => {
  it('expected COD = goods + customer delivery fee (never treated as cash received)', () => {
    const f = computeShipmentFinancials({ ...base, mode: 'NET_DEDUCTION' });
    expect(f.codExpected).toBe('105000');
    expect(f.codCollected).toBeNull();
    expect(f.courierDue).toBeNull();
    expect(allocatableFor(f)).toBe(BigInt(0));
  });

  it('ACC-05 NET_DEDUCTION: fee is withheld from collected COD, no separate fee payable', () => {
    const f = computeShipmentFinancials({ ...base, mode: 'NET_DEDUCTION', codCollected: '105000' });
    expect(f.courierFeeDeducted).toBe('3000');
    expect(f.courierDue).toBe('102000');
    expect(f.courierFeePayableSeparately).toBe('0');
    expect(f.merchantOutstanding).toBe('102000');
  });

  it('ACC-06 GROSS_REMITTANCE: full COD is due, courier fee is a separate liability', () => {
    const f = computeShipmentFinancials({ ...base, mode: 'GROSS_REMITTANCE', codCollected: '105000' });
    expect(f.courierDue).toBe('105000');
    expect(f.courierFeePayableSeparately).toBe('3000');
    expect(f.merchantOutstanding).toBe('105000');
  });

  it('partial transfers reduce outstanding without double counting', () => {
    const f = computeShipmentFinancials({ ...base, mode: 'GROSS_REMITTANCE', codCollected: '105000', allocatedToShipment: '40000' });
    expect(f.transfersReceived).toBe('40000');
    expect(f.merchantOutstanding).toBe('65000');
    expect(allocatableFor(f)).toBe(BigInt(65000));
  });

  it('rejections reduce expected COD once; due is based on actual collection (no double count)', () => {
    const f = computeShipmentFinancials({
      ...base,
      mode: 'NET_DEDUCTION',
      codCollected: '90000',
      courierFeeDeducted: '3000',
      adjustments: [{ type: 'REJECTION_PARTIAL', signedAmount: '-10000' }],
    });
    expect(f.codExpected).toBe('95000');
    expect(f.codVariance).toBe('-5000');
    expect(f.courierDue).toBe('87000');
  });

  it('courier corrections affect what is due, not expected COD', () => {
    const f = computeShipmentFinancials({
      ...base,
      mode: 'GROSS_REMITTANCE',
      codCollected: '105000',
      adjustments: [{ type: 'COURIER_CORRECTION', signedAmount: '-2000' }],
    });
    expect(f.codExpected).toBe('105000');
    expect(f.courierDue).toBe('103000');
  });

  it('a zero courier fee is a valid agreement and creates no payable', () => {
    const f = computeShipmentFinancials({ ...base, courierFeeSnapshot: '0', mode: 'GROSS_REMITTANCE', codCollected: '105000' });
    expect(f.courierFeePayableSeparately).toBe('0');
  });

  it('courier aggregate keeps COD, fees and net position as separate values', () => {
    const a = computeShipmentFinancials({ ...base, mode: 'GROSS_REMITTANCE', codCollected: '105000' });
    const b = computeShipmentFinancials({ ...base, mode: 'NET_DEDUCTION', codCollected: '105000' });
    const agg = aggregateCourier([a, b], '1000');
    expect(agg.codCollected).toBe('210000');
    expect(agg.courierFeesPayableSeparately).toBe('3000');
    expect(agg.courierFeesOutstanding).toBe('2000');
    expect(agg.courierFeesDeductedFromCod).toBe('3000');
    expect(agg.merchantOutstanding).toBe('207000');
    expect(agg.netPosition).toBe('205000');
  });

  it('fee payments cannot exceed the fee still payable', () => {
    expect(feeOutstandingFor('9000', '4000')).toBe(BigInt(5000));
    expect(feeOutstandingFor('9000', '12000')).toBe(BigInt(0));
  });
});
