import { describe, expect, it } from 'vitest';
import { safeCell, toCsv } from '@/lib/export-safe';

describe('spreadsheet-safe exports', () => {
  it('neutralizes formula triggers in text cells', () => {
    expect(safeCell('=HYPERLINK("http://x")')).toBe(`'=HYPERLINK("http://x")`);
    expect(safeCell('+SUM(A1)')).toBe(`'+SUM(A1)`);
    expect(safeCell('-cmd')).toBe(`'-cmd`);
    expect(safeCell('@SUM(1)')).toBe(`'@SUM(1)`);
  });

  it('keeps numbers and ordinary text unchanged', () => {
    expect(safeCell(15000)).toBe(15000);
    expect(safeCell(-2000)).toBe(-2000);
    expect(safeCell('شاشة 6.1')).toBe('شاشة 6.1');
    expect(safeCell(null)).toBeNull();
  });

  it('writes CSV with a BOM and quotes fields with commas or quotes', () => {
    const csv = toCsv(['name', 'amount'], [{ name: 'Bat, large "pro"', amount: 5000 }, { name: '=evil', amount: 1 }]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('"Bat, large ""pro"""');
    expect(csv).toContain(`'=evil`);
  });
});
