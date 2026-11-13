import { describe, expect, it } from 'vitest';
import { discrepancyReasonVisible } from '@/modules/fulfillment/visibility';

describe('independent checking: picker shortage reason visibility', () => {
  const base = { viewerId: 'checker-1', assignedCheckerId: 'checker-1', viewerCanResolve: false };
  it.each(['ASSIGNED', 'PICKING', 'PICKED', 'CHECKING'])('hidden from the checker while status is %s', (status) => {
    expect(discrepancyReasonVisible({ ...base, status })).toBe(false);
  });
  it.each(['CHECKED', 'DISCREPANCY_HOLD', 'PACKING', 'HANDED_OVER'])('visible to the checker after counting (%s)', (status) => {
    expect(discrepancyReasonVisible({ ...base, status })).toBe(true);
  });
  it('visible to a manager at all stages', () => {
    expect(discrepancyReasonVisible({ viewerId: 'm', assignedCheckerId: 'checker-1', status: 'CHECKING', viewerCanResolve: true })).toBe(true);
  });
  it('visible to the picker (not the checker)', () => {
    expect(discrepancyReasonVisible({ viewerId: 'picker-1', assignedCheckerId: 'checker-1', status: 'CHECKING', viewerCanResolve: false })).toBe(true);
  });
});
