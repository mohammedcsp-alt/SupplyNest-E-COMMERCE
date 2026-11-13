/**
 * Spreadsheet-safe export helpers (CSV and XLSX).
 * Any text cell that begins with a formula trigger (= + - @ TAB or CR) is prefixed with an apostrophe so that
 * Excel/LibreOffice show it as text instead of evaluating it. Numbers are passed through unchanged.
 */

const FORMULA_START = /^[=+\-@\t\r]/;

export function safeCell(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  const text = String(value);
  // negative IQD amounts are numbers after formatting; plain text starting with '-' is neutralized
  return FORMULA_START.test(text) ? `'${text}` : text;
}

function csvField(value: unknown): string {
  const v = safeCell(value);
  if (v === null) return '';
  const text = String(v);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** RFC 4180 CSV with a UTF-8 BOM so Excel reads Arabic correctly. */
export function toCsv(headers: string[], rows: Array<Record<string, unknown>>): string {
  const lines = [headers.map(csvField).join(',')];
  for (const r of rows) lines.push(headers.map((h) => csvField(r[h])).join(','));
  return `﻿${lines.join('\r\n')}\r\n`;
}
