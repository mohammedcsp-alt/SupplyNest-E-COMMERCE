import { describe, expect, it } from 'vitest';
import { parseTable, canonicalHeader, missingColumns } from '@/modules/imports/table';

describe('import table reader', () => {
  it('maps Arabic and English headers to canonical columns', () => {
    expect(canonicalHeader('رمز الصنف')).toBe('SKU');
    expect(canonicalHeader('الكمية الفعلية')).toBe('PHYSICAL_STOCK');
    expect(canonicalHeader('﻿sku')).toBe('SKU');
    expect(canonicalHeader('  Physical_Stock ')).toBe('PHYSICAL_STOCK');
  });

  it('parses CSV with BOM, semicolons and Arabic text', async () => {
    const csv = '﻿SKU;NAME_AR;PHYSICAL_STOCK;EXTRACTED_AT\nDEV-1;شاشة;5;2026-11-13T08:00:00Z\nDEV-2;"بطارية, كبيرة";0;\n';
    const t = await parseTable(Buffer.from(csv, 'utf8'), 'x.csv');
    expect(t.headers).toEqual(['SKU', 'NAME_AR', 'PHYSICAL_STOCK', 'EXTRACTED_AT']);
    expect(t.rows).toHaveLength(2);
    expect(t.rows[0].values.NAME_AR).toBe('شاشة');
    expect(t.rows[1].values.NAME_AR).toBe('بطارية, كبيرة');
    expect(t.rows[1].rowNumber).toBe(3);
  });

  it('rejects empty files and duplicate headers', async () => {
    await expect(parseTable(Buffer.alloc(0), 'a.csv')).rejects.toThrow();
    await expect(parseTable(Buffer.from('SKU,SKU\nA,B\n'), 'a.csv')).rejects.toThrow(/Duplicate/);
  });

  it('reports missing required columns', () => {
    expect(missingColumns(['SKU', 'QTY'], ['SKU', 'PRICE'])).toEqual(['PRICE']);
  });
});
