/**
 * PDF rendering through a local Chromium (Playwright). No fallback: when no browser is installed the call fails with
 * PdfRendererUnavailableError, and callers must report that. Nothing here produces a placeholder PDF.
 *
 * The playwright module is loaded at run time with a non-literal specifier so the Next.js bundler does not try to
 * bundle it (it locates its own driver files on disk).
 */

export class PdfRendererUnavailableError extends Error {
  readonly name = 'PdfRendererUnavailableError';
}

export class PdfRenderError extends Error {
  readonly name = 'PdfRenderError';
}

export const CHROMIUM_INSTALL_HINT = 'Run "npx playwright install chromium" on this machine, then try again.';

type PlaywrightModule = typeof import('playwright');

async function loadPlaywright(): Promise<PlaywrightModule> {
  const specifier = 'playwright';
  try {
    return (await import(/* webpackIgnore: true */ specifier)) as PlaywrightModule;
  } catch {
    throw new PdfRendererUnavailableError('The PDF renderer (playwright) is not installed in this project.');
  }
}

/** Launches headless Chromium. Fails with PdfRendererUnavailableError (never a fallback) when the browser is missing. */
export async function launchChromium(): Promise<import('playwright').Browser> {
  const pw = await loadPlaywright();
  try {
    return await pw.chromium.launch({ headless: true });
  } catch (err) {
    const detail = (err as Error).message.split('\n')[0].slice(0, 160);
    throw new PdfRendererUnavailableError(`Chromium is not available for PDF export. ${CHROMIUM_INSTALL_HINT} (${detail})`);
  }
}

/** Prints static HTML to A4 PDF. Used by the environment check (scripts/pdf-check.ts) and by tests. */
export async function htmlToPdf(html: string): Promise<Buffer> {
  const browser = await launchChromium();
  try {
    const page = await browser.newPage();
    await page.route('**/*', (route) => (route.request().url().startsWith('data:') ? route.continue() : route.abort()));
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = Buffer.from(await page.pdf({ format: 'A4', printBackground: true }));
    if (pdf.length === 0 || pdf.subarray(0, 4).toString('latin1') !== '%PDF') throw new PdfRenderError('The browser did not produce a valid PDF.');
    return pdf;
  } finally {
    await browser.close().catch(() => undefined);
  }
}

export type RenderPdfOptions = {
  /** Full URL of the page to print. Must start with allowedOrigin. */
  url: string;
  /** Origin the page may load resources from. Every other request is aborted. */
  allowedOrigin: string;
  /** Cookie header forwarded to the page (the caller's own session). Sent only to allowedOrigin. */
  cookieHeader?: string | null;
  landscape?: boolean;
  timeoutMs?: number;
};

/**
 * Opens the page in headless Chromium, waits until it declares its state with a `data-report-state` attribute, and
 * prints it as A4 PDF. Throws PdfRendererUnavailableError when no browser can be launched, and PdfRenderError when the
 * page is not a successful report.
 */
export async function renderPageToPdf(opts: RenderPdfOptions): Promise<Buffer> {
  const timeout = opts.timeoutMs ?? 60_000;
  const origin = new URL(opts.allowedOrigin).origin;
  if (new URL(opts.url).origin !== origin) throw new PdfRenderError('PDF source URL is outside the allowed origin.');

  const browser = await launchChromium();
  try {
    const context = await browser.newContext({
      ...(opts.cookieHeader ? { extraHTTPHeaders: { cookie: opts.cookieHeader } } : {}),
      serviceWorkers: 'block',
      acceptDownloads: false,
    });
    const page = await context.newPage();
    // Only the application's own origin may be loaded (no external fonts, scripts or redirects).
    await page.route('**/*', (route) => {
      const url = route.request().url();
      const local = url === origin || url.startsWith(`${origin}/`) || url.startsWith('data:');
      return local ? route.continue() : route.abort();
    });

    const response = await page.goto(opts.url, { waitUntil: 'load', timeout });
    if (!response || !response.ok()) throw new PdfRenderError(`The report page answered HTTP ${response?.status() ?? 'none'}.`);
    // A redirect (for example to the login page) means the session cannot read this report.
    if (new URL(page.url()).pathname !== new URL(opts.url).pathname) throw new PdfRenderError('The report page redirected. Sign in again and retry.');

    await page.waitForFunction(() => document.querySelector('[data-report-state]') !== null, undefined, { timeout });
    const state = await page.locator('[data-report-state]').first().getAttribute('data-report-state');
    if (state !== 'ok') throw new PdfRenderError('The report could not be built for this request.');

    await page.emulateMedia({ media: 'print' });
    const pdf = await page.pdf({
      format: 'A4',
      landscape: opts.landscape ?? true,
      printBackground: true,
      preferCSSPageSize: false,
      margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' },
    });
    const bytes = Buffer.from(pdf);
    if (bytes.length === 0 || bytes.subarray(0, 4).toString('latin1') !== '%PDF') {
      throw new PdfRenderError('The browser did not produce a valid PDF.');
    }
    await context.close();
    return bytes;
  } finally {
    await browser.close().catch(() => undefined);
  }
}
