import 'server-only';
import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import { errors } from '@/lib/errors';

/**
 * Tabular file reader for CSV (UTF-8, BOM tolerated, comma or semicolon delimiter) and XLSX (first sheet).
 * Output headers are canonicalized with the aliases below (Arabic and English, OPEN-18 documented mapping).
 */

export const PRODUCT_COLUMNS = [
  'SKU', 'NAME_EN', 'NAME_AR', 'MODEL', 'BRAND', 'QUALITY', 'CATEGORY', 'PHYSICAL_STOCK', 'EXTRACTED_AT',
] as const;
export const PRICE_COLUMNS = ['SKU', 'PRICE_LEVEL', 'PRICE'] as const;
export const CUSTOMER_ORDER_COLUMNS = ['SKU', 'QTY'] as const;

const ALIASES: Record<string, string> = {
  sku: 'SKU', 'sku code': 'SKU', 'رمز': 'SKU', 'رمز الصنف': 'SKU', 'رمز sku': 'SKU',
  name: 'NAME_EN', name_en: 'NAME_EN', 'name en': 'NAME_EN', 'الاسم': 'NAME_EN', 'الاسم بالإنجليزية': 'NAME_EN',
  name_ar: 'NAME_AR', 'name ar': 'NAME_AR', 'الاسم بالعربية': 'NAME_AR', 'الاسم العربي': 'NAME_AR',
  model: 'MODEL', 'الموديل': 'MODEL', 'الطراز': 'MODEL',
  brand: 'BRAND', manufacturer: 'BRAND', 'الشركة': 'BRAND', 'العلامة': 'BRAND', 'الشركة المصنعة': 'BRAND',
  quality: 'QUALITY', 'الجودة': 'QUALITY',
  category: 'CATEGORY', 'الفئة': 'CATEGORY', 'التصنيف': 'CATEGORY',
  physical_stock: 'PHYSICAL_STOCK', stock: 'PHYSICAL_STOCK', 'المخزون': 'PHYSICAL_STOCK', 'الكمية الفعلية': 'PHYSICAL_STOCK',
  extracted_at: 'EXTRACTED_AT', 'extracted at': 'EXTRACTED_AT', 'تاريخ الاستخراج': 'EXTRACTED_AT',
  price_level: 'PRICE_LEVEL', 'level': 'PRICE_LEVEL', 'المستوى': 'PRICE_LEVEL', 'مستوى السعر': 'PRICE_LEVEL',
  price: 'PRICE', 'السعر': 'PRICE',
  qty: 'QTY', quantity: 'QTY', 'الكمية': 'QTY',
};

export function canonicalHeader(raw: string): string {
  const cleaned = raw.replace(/^﻿/, '').trim();
  const upper = cleaned.toUpperCase();
  if (['SKU', 'NAME_EN', 'NAME_AR', 'MODEL', 'BRAND', 'QUALITY', 'CATEGORY', 'PHYSICAL_STOCK', 'EXTRACTED_AT', 'PRICE_LEVEL', 'PRICE', 'QTY'].includes(upper)) {
    return upper;
  }
  return ALIASES[cleaned.toLowerCase()] ?? ALIASES[cleaned] ?? cleaned.toUpperCase();
}

export type TableRow = { rowNumber: number; values: Record<string, string> };
export type ParsedTable = { headers: string[]; rows: TableRow[]; format: 'csv' | 'xlsx' };

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 5000;

export async function parseTable(buffer: Buffer, filename: string): Promise<ParsedTable> {
  if (buffer.length === 0) throw errors.validation('The file is empty');
  if (buffer.length > MAX_FILE_BYTES) throw errors.validation('File is larger than 5 MB');
  const lower = filename.toLowerCase();
  const isXlsx = lower.endsWith('.xlsx') || (buffer[0] === 0x50 && buffer[1] === 0x4b);
  let rawRows: string[][];
  if (isXlsx) {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    } catch {
      throw errors.validation('Could not read the Excel file. Save it as .xlsx and try again.');
    }
    const sheet = wb.worksheets[0];
    if (!sheet) throw errors.validation('The workbook has no sheets');
    rawRows = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const values = (row.values as unknown[]).slice(1).map((v) => cellText(v));
      rawRows.push(values);
    });
  } else {
    const text = buffer.toString('utf8').replace(/^﻿/, '');
    const delimiter = detectDelimiter(text);
    try {
      rawRows = parse(text, { delimiter, relax_column_count: true, skip_empty_lines: true, trim: true }) as string[][];
    } catch {
      throw errors.validation('Malformed CSV file');
    }
  }
  if (rawRows.length === 0) throw errors.validation('The file has no header row');
  const headers = rawRows[0].map(canonicalHeader);
  if (new Set(headers.filter(Boolean)).size !== headers.filter(Boolean).length) {
    throw errors.validation('Duplicate column headers in file', { headers });
  }
  const body = rawRows.slice(1);
  if (body.length > MAX_ROWS) throw errors.validation(`File exceeds ${MAX_ROWS} rows`);
  const rows: TableRow[] = body.map((cells, i) => {
    const values: Record<string, string> = {};
    headers.forEach((h, idx) => {
      if (h) values[h] = (cells[idx] ?? '').toString().trim();
    });
    return { rowNumber: i + 2, values };
  });
  return { headers, rows, format: isXlsx ? 'xlsx' : 'csv' };
}

function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const commas = (firstLine.match(/,/g) ?? []).length;
  const semis = (firstLine.match(/;/g) ?? []).length;
  return semis > commas ? ';' : ',';
}

function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && 'text' in (v as object)) return String((v as { text: unknown }).text ?? '');
  if (typeof v === 'object' && 'result' in (v as object)) return String((v as { result: unknown }).result ?? '');
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

/** Checks that all required canonical columns exist. Returns the list of missing ones. */
export function missingColumns(headers: string[], required: readonly string[]): string[] {
  return required.filter((c) => !headers.includes(c));
}
