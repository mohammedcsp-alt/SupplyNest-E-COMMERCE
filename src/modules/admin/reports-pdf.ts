import 'server-only';
import { config } from '@/lib/config';
import { renderPageToPdf } from '@/integrations/pdf/chromium';
import { filtersToSearch, type ReportFilters, type ReportType } from './reports';

/** The PDF is rendered from the printable report page, so it has the same content as the on-screen print view. */
export const PDF_MAX_ROWS = 5000;

/**
 * Origin used to load the print view. Defaults to this process on loopback, so the caller's session cookie is only
 * ever sent to this server. PDF_RENDER_BASE_URL may override it (for example behind a reverse proxy).
 */
export function pdfRenderBaseUrl(): string {
  return config.PDF_RENDER_BASE_URL ?? `http://127.0.0.1:${config.PORT}`;
}

/** Renders one report to PDF with the caller's own session cookie. Throws PdfRendererUnavailableError or PdfRenderError. */
export async function renderReportPdf(opts: { type: ReportType; filters: ReportFilters; cookieHeader: string | null }): Promise<Buffer> {
  const base = pdfRenderBaseUrl();
  const url = `${base.replace(/\/$/, '')}/admin/reports/print?${filtersToSearch(opts.type, opts.filters)}`;
  return renderPageToPdf({ url, allowedOrigin: base, cookieHeader: opts.cookieHeader, landscape: true });
}
