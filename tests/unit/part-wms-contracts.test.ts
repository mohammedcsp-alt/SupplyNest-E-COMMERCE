import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { CONTRACTS, type ContractName } from '@/integrations/wms/contracts';
import { createWmsAdapter, WMS_DISABLED_MESSAGE } from '@/integrations/wms/adapter';

const now = new Date().toISOString();
const base = { event_id: randomUUID(), occurred_at: now };

const VALID: Record<ContractName, unknown> = {
  ProductUpsert: { ...base, version: 1, sku: 'DEV-TS-S-WH', name_en: 'T-shirt', active: true },
  StockAvailabilityChanged: { ...base, version: 4, sku: 'DEV-TS-S-WH', physical_on_hand: 12, source_timestamp: now },
  StoreOrderSubmitted: { ...base, external_reference: 'ORD-000123', lines: [{ sku: 'DEV-TS-S-WH', qty: 2 }] },
  OrderAccepted: { ...base, external_reference: 'ORD-000123', wms_order_id: 'WMS-9', accepted_at: now },
  OrderRejected: { ...base, external_reference: 'ORD-000123', reason_code: 'OUT_OF_STOCK', rejected_at: now },
  FulfillmentStatusChanged: { ...base, external_reference: 'ORD-000123', version: 2, status: 'PICKING', status_at: now },
  DeliveryOutcomeChanged: { ...base, external_reference: 'ORD-000123', outcome: 'PARTIALLY_REJECTED', returned_lines: [{ sku: 'DEV-TS-S-WH', qty: 1 }], outcome_at: now },
  CODSettlementStatus: { ...base, external_reference: 'ORD-000123', status: 'SETTLED', amount_iqd: 25000, settled_at: now },
};

describe('WMS contract schemas (ADMIN-010, offline)', () => {
  it('defines all eight contracts from the specification', () => {
    expect(Object.keys(CONTRACTS).sort()).toEqual(Object.keys(VALID).sort());
  });

  for (const name of Object.keys(VALID) as ContractName[]) {
    it(`${name}: accepts a valid payload`, () => {
      expect(CONTRACTS[name].safeParse(VALID[name]).success).toBe(true);
    });

    it(`${name}: rejects a payload without event_id`, () => {
      const { event_id: _omit, ...rest } = VALID[name] as Record<string, unknown>;
      expect(CONTRACTS[name].safeParse(rest).success).toBe(false);
    });

    it(`${name}: rejects unknown fields (strict)`, () => {
      expect(CONTRACTS[name].safeParse({ ...(VALID[name] as object), unexpected_field: 1 }).success).toBe(false);
    });
  }

  it('ProductUpsert rejects a lower-case SKU and a zero version', () => {
    expect(CONTRACTS.ProductUpsert.safeParse({ ...(VALID.ProductUpsert as object), sku: 'dev-ts' }).success).toBe(false);
    expect(CONTRACTS.ProductUpsert.safeParse({ ...(VALID.ProductUpsert as object), version: 0 }).success).toBe(false);
  });

  it('StockAvailabilityChanged rejects negative stock and a non-ISO timestamp', () => {
    expect(CONTRACTS.StockAvailabilityChanged.safeParse({ ...(VALID.StockAvailabilityChanged as object), physical_on_hand: -1 }).success).toBe(false);
    expect(CONTRACTS.StockAvailabilityChanged.safeParse({ ...(VALID.StockAvailabilityChanged as object), source_timestamp: 'yesterday' }).success).toBe(false);
  });

  it('StoreOrderSubmitted requires at least one line and positive quantities', () => {
    expect(CONTRACTS.StoreOrderSubmitted.safeParse({ ...(VALID.StoreOrderSubmitted as object), lines: [] }).success).toBe(false);
    expect(CONTRACTS.StoreOrderSubmitted.safeParse({ ...(VALID.StoreOrderSubmitted as object), lines: [{ sku: 'DEV-TS-S-WH', qty: 0 }] }).success).toBe(false);
  });

  it('OrderRejected only accepts a known reason code', () => {
    expect(CONTRACTS.OrderRejected.safeParse({ ...(VALID.OrderRejected as object), reason_code: 'BECAUSE' }).success).toBe(false);
  });

  it('FulfillmentStatusChanged only accepts the defined states', () => {
    expect(CONTRACTS.FulfillmentStatusChanged.safeParse({ ...(VALID.FulfillmentStatusChanged as object), status: 'LOST' }).success).toBe(false);
  });

  it('CODSettlementStatus rejects a fractional or negative amount', () => {
    expect(CONTRACTS.CODSettlementStatus.safeParse({ ...(VALID.CODSettlementStatus as object), amount_iqd: 10.5 }).success).toBe(false);
    expect(CONTRACTS.CODSettlementStatus.safeParse({ ...(VALID.CODSettlementStatus as object), amount_iqd: -1 }).success).toBe(false);
  });
});

describe('WMS adapter (disabled in V1)', () => {
  it('refuses every method while the feature flag is false', () => {
    const adapter = createWmsAdapter(false);
    expect(() => adapter.validate('ProductUpsert', VALID.ProductUpsert)).toThrow(WMS_DISABLED_MESSAGE);
    expect(() => adapter.record('ProductUpsert', VALID.ProductUpsert)).toThrow(WMS_DISABLED_MESSAGE);
    expect(() => adapter.list()).toThrow(WMS_DISABLED_MESSAGE);
    expect(() => adapter.clear()).toThrow(WMS_DISABLED_MESSAGE);
  });

  it('records validated payloads locally when enabled, and rejects invalid ones', () => {
    const adapter = createWmsAdapter(true);
    adapter.record('StockAvailabilityChanged', VALID.StockAvailabilityChanged);
    expect(adapter.list()).toHaveLength(1);
    expect(() => adapter.record('OrderAccepted', { nope: true })).toThrow();
    expect(adapter.list()).toHaveLength(1);
    adapter.clear();
    expect(adapter.list()).toHaveLength(0);
  });

  it('static scan: no file under src/integrations issues a fetch or references the WMS port 3100', () => {
    const root = path.resolve(process.cwd(), 'src/integrations');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(ts|tsx|mjs|js)$/.test(name)) files.push(full);
      }
    };
    walk(root);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      if (path.basename(file) === 'part-wms-contracts.test.ts') continue;
      expect(src, `${file} must not reference the WMS port`).not.toMatch(/\b3100\b/);
      if (file.includes(`${path.sep}wms${path.sep}`)) expect(src, `${file} must not call fetch`).not.toMatch(/\bfetch\s*\(/);
    }
  });
});
