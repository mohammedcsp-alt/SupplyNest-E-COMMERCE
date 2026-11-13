import { EmptyState } from '@/components/ui';
import type { ReportResult } from '@/modules/admin/reports';

export function ReportTable({ result, locale, limit }: { result: ReportResult; locale: 'ar' | 'en'; limit: number }) {
  if (result.rows.length === 0) return <EmptyState>{locale === 'ar' ? 'لا توجد صفوف مطابقة.' : 'No matching rows.'}</EmptyState>;
  const shown = result.rows.slice(0, limit);
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {result.columns.map((c) => (
              <th key={c.key}>{locale === 'ar' ? c.labelAr : c.labelEn}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((r, i) => (
            <tr key={i}>
              {result.columns.map((c) => {
                const v = r[c.key];
                return (
                  <td key={c.key} dir={typeof v === 'string' && /^\d+$/.test(v) ? 'ltr' : undefined} className={typeof v === 'number' || (typeof v === 'string' && /^\d+$/.test(v)) ? 'num' : undefined}>
                    {v === null || v === undefined ? '—' : typeof v === 'boolean' ? (v ? (locale === 'ar' ? 'نعم' : 'Yes') : locale === 'ar' ? 'لا' : 'No') : String(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
