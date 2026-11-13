import { expect, test, type Browser, type BrowserContext, type Locator, type Page, type TestInfo } from '@playwright/test';
import { BASE, MANAGER_STATE, answerDialogs, customerPlacesOrder, uniq } from './admin-helpers';
import { SKU_IN_STOCK, langOf, setLang, type Lang } from './helpers';

/**
 * Real-browser flows for internal fulfillment (picker, blind checker, manager discrepancy, packer, handover) and for
 * accounting (COD collection, courier statement, transfers and allocation, adjustments and reversal, GROSS fees,
 * reports). Every order, transfer reference and adjustment reason is unique per run. Staff sessions come from
 * tests/e2e/auth-staff.setup.ts, so no staff account logs in again here.
 *
 * Labels: forms rendered by ApiForm expose their inputs by `name`, which is stable across languages, so the tests use
 * those and the bilingual button/heading text. Server validation messages are English (the API does not localise).
 */

const STATE = {
  picker: 'tests/e2e/.auth/picker.json',
  checker: 'tests/e2e/.auth/checker.json',
  packer: 'tests/e2e/.auth/packer.json',
  accountant: 'tests/e2e/.auth/accountant.json',
} as const;

/** Seeded staff, as they appear in the assign and courier selects (personName falls back to fullNameEn). */
const PICKER_NAME = 'Dev Picker One';
const CHECKER_NAME = 'Dev Checker';
const NET_COURIER = 'Synthetic Courier One'; // NET_DEDUCTION, fee 3000
const GROSS_COURIER = 'Synthetic Courier Two'; // GROSS_REMITTANCE, fee 2500
const SKU = SKU_IN_STOCK;

const ERR = {
  sameStaff: /must be different people/,
  overAllocation: /Allocation exceeds the amount still due on shipment/,
  duplicateTransfer: /already exists for this courier/,
  overPayment: /Payment exceeds the courier fee still payable/,
  duplicateCollection: 'already confirmed',
};

function strings(lang: Lang) {
  const ar = lang === 'ar';
  return {
    // fulfillment job page
    assignSave: ar ? 'حفظ التكليف' : 'Save assignment',
    assignedOk: ar ? 'تم التكليف.' : 'Assigned.',
    startPicking: ar ? 'بدء الالتقاط' : 'Start picking',
    submitPicked: ar ? 'إرسال نتيجة الالتقاط' : 'Submit picked quantities',
    startChecking: ar ? 'بدء التدقيق' : 'Start checking',
    submitCount: ar ? 'إرسال العد المستقل' : 'Submit independent count',
    resolveSubmit: ar ? 'اعتماد الكميات المقبولة' : 'Accept quantities and release job',
    startPacking: ar ? 'بدء التعليب' : 'Start packing',
    addParcel: ar ? 'إضافة الطرد' : 'Add parcel',
    parcelAdded: ar ? 'تمت إضافة الطرد.' : 'Parcel added.',
    finishPacking: ar ? 'إنهاء التعليب' : 'Finish packing',
    handover: ar ? 'سُلّم للشركة' : 'Handed over to courier',
    handedOverOk: ar ? 'تم التسليم للشركة.' : 'Handed over to courier.',
    qty: (sku: string) => (ar ? `الكمية للسطر ${sku}` : `Quantity for ${sku}`),
    reason: (sku: string) => (ar ? `السبب للسطر ${sku}` : `Reason for ${sku}`),
    // accounting
    awaiting: ar ? 'بانتظار التأكيد' : 'Awaiting confirmation',
    confirmCollection: ar ? 'تأكيد التحصيل' : 'Confirm collected COD',
    collectionOk: ar ? 'تم تسجيل التحصيل.' : 'Collection recorded.',
    collectionLocked: ar ? 'تم تأكيد التحصيل. لا يُعدَّل' : 'Collection is confirmed and cannot be changed',
    notYet: ar ? 'غير متاح بعد' : 'Not yet',
    kExpected: ar ? 'COD المتوقع' : 'Expected COD',
    kCollected: ar ? 'COD المحصّل (مؤكد من الشركة)' : 'Collected COD (courier-confirmed)',
    kVariance: ar ? 'الفرق (محصّل − متوقع)' : 'COD variance (collected − expected)',
    kFeeSnapshot: ar ? 'أجر الشركة (لقطة)' : 'Courier fee (snapshot)',
    kFeeDeducted: ar ? 'أجر الشركة المخصوم من COD (صافي)' : 'Courier fee deducted from COD (NET)',
    kFeeGross: ar ? 'أجر يُدفع منفصلاً (إجمالي)' : 'Courier fee payable separately (GROSS)',
    kDue: ar ? 'المستحق من الشركة' : 'Courier due',
    recordAdjustment: ar ? 'تسجيل التعديل' : 'Record adjustment',
    adjustmentOk: ar ? 'تم تسجيل التعديل.' : 'Adjustment recorded.',
    reverse: ar ? 'عكس بقيد جديد' : 'Reverse with new entry',
    reversalEntry: ar ? 'قيد عكسي' : 'Reversal entry',
    reversed: ar ? 'تم عكسه' : 'Reversed',
    posted: ar ? 'مسجّل' : 'Posted',
    recordTransfer: ar ? 'تسجيل التحويل' : 'Record transfer',
    transferOk: ar ? 'تم تسجيل التحويل.' : 'Transfer recorded.',
    allocate: ar ? 'تخصيص التحويل' : 'Allocate transfer',
    allocateTitle: (ref: string) => (ar ? `تخصيص التحويل ${ref}` : `Allocate transfer ${ref}`),
    amountFor: (order: string) => (ar ? `المبلغ للطلب ${order}` : `Amount for ${order}`),
    recordFee: ar ? 'تسجيل دفعة أجر' : 'Record fee payment',
    feeOk: ar ? 'تم تسجيل الدفعة.' : 'Payment recorded.',
    csv: ar ? 'تحميل CSV' : 'Download CSV',
    xlsx: ar ? 'تحميل Excel (XLSX)' : 'Download Excel (XLSX)',
    noData: ar ? 'لا توجد بيانات لهذه المرشحات.' : 'No data for these filters.',
  };
}
type S = ReturnType<typeof strings>;

/** Local wall-clock value for a datetime-local input, one minute in the past so it is never in the future. */
function localInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function recentLocalInput(): string {
  return localInput(new Date(Date.now() - 60_000));
}

/** Reads a whole-IQD value from a Money cell ("18,000 IQD", "-1,000 د.ع"). */
async function iqd(loc: Locator): Promise<number> {
  const text = ((await loc.textContent()) ?? '').trim();
  expect(text).toMatch(/^-?[\d,]+ (IQD|د\.ع)$/);
  return Number(text.replace(/[^\d-]/g, ''));
}

/** The dd of a KPI tile on the shipment or statement pages, found by its label. */
function kpi(page: Page, label: string): Locator {
  return page.locator('div.kpi').filter({ has: page.locator('dt', { hasText: label }) }).locator('dd').first();
}

/** The form that contains the submit button with this exact name (ApiForm and FulfillmentLinesForm forms). */
function formWith(page: Page, buttonName: string): Locator {
  return page.locator('form').filter({ has: page.getByRole('button', { name: buttonName, exact: true }) });
}

/** The job's status badge text (the badge shows the enum, e.g. "PICKED", in both languages). */
/** Navigates and waits for the client bundle, so forms and buttons are live before the test interacts. */
async function gotoSettled(page: Page, url: string) {
  await page.goto(url);
  await page.waitForLoadState('networkidle');
}

async function expectBadge(page: Page, badge: string) {
  await expect(page.getByText(badge, { exact: true }).first()).toBeVisible();
  // The server renders the badge before React hydrates the forms. Interacting earlier submits a form natively
  // (a GET that drops the entered values), so wait for the client bundle before the next step.
  await page.waitForLoadState('networkidle');
}

/** Opens a job from the queue, filtered by status (the queue returns at most 200 rows sorted by status). */
async function openJobFromQueue(page: Page, orderNumber: string, status: string): Promise<string> {
  await page.goto(`/fulfillment?status=${status}`);
  const row = page.locator('tr', { hasText: orderNumber });
  await expect(row).toHaveCount(1);
  await row.getByRole('link').first().click();
  await page.waitForURL(/\/fulfillment\/jobs\/[0-9a-f-]{36}$/);
  await page.waitForLoadState('networkidle');
  return new URL(page.url()).pathname;
}

/** Opens a shipment from the accounting shipments list by its order number. */
async function openShipmentFromList(page: Page, orderNumber: string): Promise<string> {
  await gotoSettled(page, '/accounting/shipments');
  const row = page.locator('tr', { hasText: orderNumber });
  await expect(row).toHaveCount(1);
  await row.getByRole('link', { name: orderNumber }).click();
  await page.waitForURL(/\/accounting\/shipments\/[0-9a-f-]{36}$/);
  return new URL(page.url()).pathname;
}

/** Holds every browser context a test opens so each test can close them all in finally. */
class Crew {
  private contexts: BrowserContext[] = [];
  constructor(
    private readonly browser: Browser,
    private readonly info: TestInfo,
    readonly lang: Lang,
  ) {}

  get strings(): S {
    return strings(this.lang);
  }

  async open(state: string): Promise<Page> {
    const ctx = await this.browser.newContext({
      storageState: state,
      baseURL: BASE,
      locale: this.info.project.use.locale ?? 'en-US',
      viewport: this.info.project.use.viewport ?? undefined,
    });
    this.contexts.push(ctx);
    const page = await ctx.newPage();
    await setLang(page, this.lang);
    return page;
  }

  /** Places a COD order as the approved customer through the checkout UI and returns the order number. */
  async placeOrder(): Promise<string> {
    const order = await customerPlacesOrder(this.browser, {
      lang: this.lang,
      locale: this.info.project.use.locale ?? 'en-US',
      viewport: this.info.project.use.viewport,
    });
    await order.close();
    return order.orderNumber;
  }

  async close(): Promise<void> {
    for (const ctx of this.contexts) await ctx.close();
  }
}

/* ------------------------------------------------------------------ fulfillment steps (each asserts the visible result) */

async function assignStaff(mgr: Page, jobPath: string, s: S) {
  await mgr.goto(jobPath);
  await mgr.waitForLoadState('networkidle');
  await expectBadge(mgr, 'PENDING ASSIGNMENT');
  const form = formWith(mgr, s.assignSave);
  await form.locator('[name="pickerId"]').selectOption({ label: PICKER_NAME });
  await form.locator('[name="checkerId"]').selectOption({ label: CHECKER_NAME });
  await form.getByRole('button', { name: s.assignSave, exact: true }).click();
  await expectBadge(mgr, 'ASSIGNED');
}

/** Picker starts, enters the picked quantity (and a reason when short), and submits. */
async function pickLine(picker: Page, jobPath: string, s: S, qty: number, reason?: string) {
  await picker.goto(jobPath);
  await picker.waitForLoadState('networkidle');
  await picker.getByRole('button', { name: s.startPicking, exact: true }).click();
  await expectBadge(picker, 'PICKING');
  const form = formWith(picker, s.submitPicked);
  await form.getByLabel(s.qty(SKU), { exact: true }).fill(String(qty));
  if (reason !== undefined) await form.getByLabel(s.reason(SKU), { exact: true }).fill(reason);
  await form.getByRole('button', { name: s.submitPicked, exact: true }).click();
  await expectBadge(picker, 'PICKED');
}

/** Checker starts and submits an independent count (nothing is pre-filled). */
async function countLine(checker: Page, jobPath: string, s: S, count: number) {
  await checker.goto(jobPath);
  await checker.waitForLoadState('networkidle');
  await checker.getByRole('button', { name: s.startChecking, exact: true }).click();
  await expectBadge(checker, 'CHECKING');
  const form = formWith(checker, s.submitCount);
  await form.getByLabel(s.qty(SKU), { exact: true }).fill(String(count));
  await form.getByRole('button', { name: s.submitCount, exact: true }).click();
}

/** Packer packs one parcel, finishes packing, then hands the parcel to the chosen courier. */
async function packAndHandOver(packer: Page, jobPath: string, s: S, courier: string, u: string) {
  await packer.goto(jobPath);
  await packer.waitForLoadState('networkidle');
  await expectBadge(packer, 'CHECKED');
  await packer.getByRole('button', { name: s.startPacking, exact: true }).click();
  await expectBadge(packer, 'PACKING');
  const add = formWith(packer, s.addParcel);
  await add.locator('[name="weightGrams"]').fill('450');
  await add.locator('[name="trackingCode"]').fill(`E2E-PKG-${u}`);
  await add.getByRole('button', { name: s.addParcel, exact: true }).click();
  await expect(packer.getByText(s.parcelAdded)).toBeVisible();
  await packer.getByRole('button', { name: s.finishPacking, exact: true }).click();
  await expectBadge(packer, 'PACKED');
  const hand = formWith(packer, s.handover);
  await hand.locator('[name="courierId"]').selectOption({ label: courier });
  await hand.getByRole('button', { name: s.handover, exact: true }).click();
  await expectBadge(packer, 'HANDED OVER');
}

/** Places an order and drives it through assignment, picking, a matching count, packing and handover. */
async function runToHandover(crew: Crew, courier: string, u: string) {
  const s = crew.strings;
  const orderNumber = await crew.placeOrder();
  const mgr = await crew.open(MANAGER_STATE);
  const jobPath = await openJobFromQueue(mgr, orderNumber, 'PENDING_ASSIGNMENT');
  await assignStaff(mgr, jobPath, s);
  const picker = await crew.open(STATE.picker);
  await openJobFromQueue(picker, orderNumber, 'ASSIGNED');
  await pickLine(picker, jobPath, s, 1);
  const checker = await crew.open(STATE.checker);
  await openJobFromQueue(checker, orderNumber, 'PICKED');
  await countLine(checker, jobPath, s, 1);
  await expectBadge(checker, 'CHECKED');
  const packer = await crew.open(STATE.packer);
  await packAndHandOver(packer, jobPath, s, courier, u);
  return { orderNumber, jobPath, mgr };
}

/* ------------------------------------------------------------------ accounting steps */

async function recordCollection(acc: Page, s: S, amount: number, reference: string) {
  const form = formWith(acc, s.confirmCollection);
  await form.locator('[name="collectedAmount"]').fill(String(amount));
  await form.locator('[name="reference"]').fill(reference);
  await form.getByRole('button', { name: s.confirmCollection, exact: true }).click();
  await expect(acc.getByText(s.collectionLocked)).toBeVisible();
}

async function recordTransfer(page: Page, s: S, courier: string, reference: string, amount: number) {
  await gotoSettled(page, '/accounting/remittances');
  const form = formWith(page, s.recordTransfer);
  await form.locator('[name="courierId"]').selectOption({ label: courier });
  await form.locator('[name="reference"]').fill(reference);
  await form.locator('[name="grossAmount"]').fill(String(amount));
  await form.locator('[name="receivedAt"]').fill(recentLocalInput());
  await form.getByRole('button', { name: s.recordTransfer, exact: true }).click();
}

/** Allocation card for one transfer (the card title carries the reference, since many transfers stay open). */
function allocationCard(page: Page, s: S, reference: string): Locator {
  return page.locator('section.card', { hasText: s.allocateTitle(reference) });
}

/* ------------------------------------------------------------------ tests */

test.describe('fulfillment and accounting (UI)', () => {
  test('1 fulfillment: manager refuses the same person, then assigns a different checker; the job reaches CHECKED and is handed over', async ({ browser }, info) => {
    test.setTimeout(420_000);
    const lang = langOf(info.project.name);
    const crew = new Crew(browser, info, lang);
    const s = crew.strings;
    const u = uniq('E2E-F1');
    try {
      const orderNumber = await crew.placeOrder();

      // Manager: the order is in the queue, waiting for assignment.
      const mgr = await crew.open(MANAGER_STATE);
      const jobPath = await openJobFromQueue(mgr, orderNumber, 'PENDING_ASSIGNMENT');
      await expectBadge(mgr, 'PENDING ASSIGNMENT');

      // The checker select lists only CHECKER-role users, so the picker cannot be picked there. To exercise the server
      // rule, the picker's id is added to the checker select in the DOM; the server must refuse it visibly.
      const form = formWith(mgr, s.assignSave);
      await form.locator('[name="pickerId"]').selectOption({ label: PICKER_NAME });
      const pickerId = await form.locator('[name="pickerId"]').inputValue();
      await mgr.evaluate(
        `(() => { const sel = document.querySelector('select[name="checkerId"]'); sel.add(new Option(${JSON.stringify(PICKER_NAME)}, ${JSON.stringify(pickerId)})); sel.value = ${JSON.stringify(pickerId)}; })()`,
      );
      await form.getByRole('button', { name: s.assignSave, exact: true }).click();
      await expect(form.getByRole('alert')).toContainText(ERR.sameStaff);
      await expectBadge(mgr, 'PENDING ASSIGNMENT');

      // A different checker is accepted and the job is assigned.
      await form.locator('[name="checkerId"]').selectOption({ label: CHECKER_NAME });
      await form.getByRole('button', { name: s.assignSave, exact: true }).click();
      await expectBadge(mgr, 'ASSIGNED');
      await expect(mgr.getByText(s.assignedOk)).toBeVisible();

      // Picker: starts, enters the picked quantity, submits.
      const picker = await crew.open(STATE.picker);
      await openJobFromQueue(picker, orderNumber, 'ASSIGNED');
      await pickLine(picker, jobPath, s, 1);

      // Checker: before counting, the picker's counts are not shown; then the matching count reaches CHECKED.
      const checker = await crew.open(STATE.checker);
      await openJobFromQueue(checker, orderNumber, 'PICKED');
      await expect(checker.locator('table th', { hasText: /^(Picked|الملتقط)$/ })).toHaveCount(0);
      await countLine(checker, jobPath, s, 1);
      await expectBadge(checker, 'CHECKED');

      // Packer: packs one parcel, finishes, hands over to the NET courier.
      const packer = await crew.open(STATE.packer);
      await packAndHandOver(packer, jobPath, s, NET_COURIER, u);
      await expect(packer.getByText(s.handedOverOk, { exact: true })).toBeVisible();

      // Accounting sees the new shipment waiting for COD confirmation.
      const acc = await crew.open(STATE.accountant);
      await gotoSettled(acc,'/accounting/shipments');
      await expect(acc.locator('tr', { hasText: orderNumber }).getByText(s.awaiting)).toBeVisible();
    } finally {
      await crew.close();
    }
  });

  test('1b packer can find a CHECKED job in the queue (the queue only lists picker and checker assignments)', async ({ browser }, info) => {
    test.setTimeout(300_000);
    const lang = langOf(info.project.name);
    const crew = new Crew(browser, info, lang);
    const s = crew.strings;
    try {
      const orderNumber = await crew.placeOrder();
      const mgr = await crew.open(MANAGER_STATE);
      const jobPath = await openJobFromQueue(mgr, orderNumber, 'PENDING_ASSIGNMENT');
      await assignStaff(mgr, jobPath, s);
      const picker = await crew.open(STATE.picker);
      await openJobFromQueue(picker, orderNumber, 'ASSIGNED');
      await pickLine(picker, jobPath, s, 1);
      const checker = await crew.open(STATE.checker);
      await openJobFromQueue(checker, orderNumber, 'PICKED');
      await countLine(checker, jobPath, s, 1);
      await expectBadge(checker, 'CHECKED');

      // The packing role must be able to find the job without a direct link.
      const packer = await crew.open(STATE.packer);
      await packer.goto('/fulfillment?status=CHECKED');
      await expect(packer.locator('tr', { hasText: orderNumber })).toHaveCount(1);
    } finally {
      await crew.close();
    }
  });

  test('2 discrepancy: the checker does not see the shortage reason before counting, the count mismatch holds the job, and the manager resolves each line', async ({ browser }, info) => {
    test.setTimeout(420_000);
    const lang = langOf(info.project.name);
    const crew = new Crew(browser, info, lang);
    const s = crew.strings;
    const u = uniq('E2E-F2');
    try {
      const orderNumber = await crew.placeOrder();
      const mgr = await crew.open(MANAGER_STATE);
      const jobPath = await openJobFromQueue(mgr, orderNumber, 'PENDING_ASSIGNMENT');
      await assignStaff(mgr, jobPath, s);

      // Picker records a shortage (0 of 1) with a reason.
      const reason = `E2E shortage ${u}`;
      const picker = await crew.open(STATE.picker);
      await openJobFromQueue(picker, orderNumber, 'ASSIGNED');
      await pickLine(picker, jobPath, s, 0, reason);

      // Checker: the reason is hidden while the job is waiting for the check and while counting.
      const checker = await crew.open(STATE.checker);
      await openJobFromQueue(checker, orderNumber, 'PICKED');
      await expect(checker.getByText(reason)).toHaveCount(0);
      await checker.getByRole('button', { name: s.startChecking, exact: true }).click();
      await expectBadge(checker, 'CHECKING');
      await expect(checker.getByText(reason)).toHaveCount(0);

      // The checker counts 1, which differs from the picker's 0: the job is held for the manager.
      const countForm = formWith(checker, s.submitCount);
      await countForm.getByLabel(s.qty(SKU), { exact: true }).fill('1');
      await countForm.getByRole('button', { name: s.submitCount, exact: true }).click();
      await expectBadge(checker, 'DISCREPANCY HOLD');
      await expect(checker.getByText(reason).first()).toBeVisible();

      // Manager resolves the line with an accepted quantity and a reason; the job returns to CHECKED.
      await mgr.goto(jobPath);
  await mgr.waitForLoadState('networkidle');
      await expectBadge(mgr, 'DISCREPANCY HOLD');
      await expect(mgr.getByText(reason).first()).toBeVisible();
      const resolve = formWith(mgr, s.resolveSubmit);
      await resolve.getByLabel(s.qty(SKU), { exact: true }).fill('1');
      await resolve.getByLabel(s.reason(SKU), { exact: true }).fill(`E2E accepted ${u}`);
      await resolve.getByRole('button', { name: s.resolveSubmit, exact: true }).click();
      await expectBadge(mgr, 'CHECKED');
    } finally {
      await crew.close();
    }
  });

  test('3 NET collection: collection is recorded once, expected COD is never treated as cash, and the statement separates fee and due', async ({ browser }, info) => {
    test.setTimeout(420_000);
    const lang = langOf(info.project.name);
    const crew = new Crew(browser, info, lang);
    const s = crew.strings;
    const u = uniq('E2E-N3');
    try {
      const run = await runToHandover(crew, NET_COURIER, u);
      const acc = await crew.open(STATE.accountant);
      const shipmentPath = await openShipmentFromList(acc, run.orderNumber);

      await expect(kpi(acc, s.kCollected)).toHaveText(s.notYet);
      const expected = await iqd(kpi(acc, s.kExpected));
      const fee = await iqd(kpi(acc, s.kFeeSnapshot));
      // The courier collects 500 IQD less than expected; the recorded collection is what counts, not the expected value.
      const collected = expected - 500;
      expect(collected).toBeGreaterThanOrEqual(fee);
      await recordCollection(acc, s, collected, `E2E-COD-${u}`);

      expect(await iqd(kpi(acc, s.kCollected))).toBe(collected);
      expect(await iqd(kpi(acc, s.kExpected))).toBe(expected);
      expect(await iqd(kpi(acc, s.kVariance))).toBe(-500);
      expect(await iqd(kpi(acc, s.kFeeDeducted))).toBe(fee);
      expect(await iqd(kpi(acc, s.kDue))).toBe(collected - fee);

      // A second collection is refused: the form is gone, and the server refuses a direct second POST from this session.
      await expect(formWith(acc, s.confirmCollection)).toHaveCount(0);
      const shipmentId = shipmentPath.split('/').pop() ?? '';
      const dup = await acc.request.post(`/api/v1/accounting/shipments/${shipmentId}/collection`, {
        headers: { 'Idempotency-Key': `e2e-dup-${Date.now()}` },
        data: { collectedAmount: String(collected), reference: `E2E-DUP-${u}` },
      });
      expect(dup.status()).toBe(409);
      expect((await dup.json()).error.message).toContain(ERR.duplicateCollection);

      // Courier statement: the shipment row shows expected, collected, the NET fee and the due; no separate fee payable.
      await gotoSettled(acc,'/accounting/couriers');
      await acc.getByRole('link', { name: NET_COURIER, exact: true }).click();
      await acc.waitForURL(/\/accounting\/couriers\/[0-9a-f-]{36}$/);
      const row = acc.locator('tr', { hasText: run.orderNumber });
      await expect(row).toHaveCount(1);
      const cells = row.locator('td');
      expect(await iqd(cells.nth(5))).toBe(expected);
      expect(await iqd(cells.nth(6))).toBe(collected);
      expect(await iqd(cells.nth(8))).toBe(fee);
      expect(await iqd(cells.nth(9))).toBe(collected - fee);
      await expect(cells.nth(12)).toHaveText('—');
    } finally {
      await crew.close();
    }
  });

  test('4 transfer: recorded with a unique reference, partly allocated, over-allocation and a duplicate reference are refused', async ({ browser }, info) => {
    test.setTimeout(420_000);
    const lang = langOf(info.project.name);
    const crew = new Crew(browser, info, lang);
    const s = crew.strings;
    const u = uniq('E2E-T4');
    try {
      const run = await runToHandover(crew, NET_COURIER, u);
      const acc = await crew.open(STATE.accountant);
      await openShipmentFromList(acc, run.orderNumber);
      const expected = await iqd(kpi(acc, s.kExpected));
      const fee = await iqd(kpi(acc, s.kFeeSnapshot));
      await recordCollection(acc, s, expected - 500, `E2E-COD-${u}`);

      // Record the transfer from the courier.
      const reference = `E2E-TR-${u}`;
      await recordTransfer(acc, s, NET_COURIER, reference, 200000);
      await expect(acc.locator('tr', { hasText: reference })).toHaveCount(1);
      await expect(acc.getByText(s.transferOk)).toBeVisible();

      // Allocate part of the transfer to this shipment.
      const card = allocationCard(acc, s, reference);
      await expect(card).toHaveCount(1);
      await card.locator('tr', { hasText: run.orderNumber }).getByLabel(s.amountFor(run.orderNumber), { exact: true }).fill('1000');
      await card.getByRole('button', { name: s.allocate, exact: true }).click();
      const allocationItem = acc.locator('li', { hasText: reference }).filter({ hasText: run.orderNumber });
      await expect(allocationItem).toHaveCount(1);
      // The allocation list formats the amount in the page language (IQD in English, د.ع in Arabic).
      await expect(allocationItem).toContainText(/1,000 (IQD|د\.ع)/);

      // Over-allocation: one IQD more than the amount still due on the shipment is refused, visibly.
      const remaining = await iqd(allocationCard(acc, s, reference).locator('tr', { hasText: run.orderNumber }).locator('td.num').first());
      expect(remaining).toBe(expected - 500 - fee - 1000);
      const over = allocationCard(acc, s, reference);
      await over.locator('tr', { hasText: run.orderNumber }).getByLabel(s.amountFor(run.orderNumber), { exact: true }).fill(String(remaining + 1));
      await over.getByRole('button', { name: s.allocate, exact: true }).click();
      await expect(over.getByRole('alert')).toContainText(ERR.overAllocation);
      await expect(acc.locator('li', { hasText: reference }).filter({ hasText: run.orderNumber })).toHaveCount(1);

      // Duplicate transfer reference for the same courier is refused and no second row is created.
      await gotoSettled(acc,'/accounting/remittances');
      await recordTransfer(acc, s, NET_COURIER, reference, 200000);
      await expect(formWith(acc, s.recordTransfer).getByRole('alert')).toContainText(ERR.duplicateTransfer);
      await expect(acc.locator('tr', { hasText: reference })).toHaveCount(1);
    } finally {
      await crew.close();
    }
  });

  test('5 returns: a manager rejection lowers expected COD; the reversal is a new row and the original row is unchanged', async ({ browser }, info) => {
    test.setTimeout(420_000);
    const lang = langOf(info.project.name);
    const crew = new Crew(browser, info, lang);
    const s = crew.strings;
    const u = uniq('E2E-R5');
    try {
      const run = await runToHandover(crew, NET_COURIER, u);
      const mgr = run.mgr;
      await openShipmentFromList(mgr, run.orderNumber);
      const before = await iqd(kpi(mgr, s.kExpected));

      const reason = `E2E partial rejection ${u}`;
      const form = formWith(mgr, s.recordAdjustment);
      await form.locator('[name="type"]').selectOption('REJECTION_PARTIAL');
      await form.locator('[name="signedAmount"]').fill('-1000');
      await form.locator('[name="reason"]').fill(reason);
      await form.getByRole('button', { name: s.recordAdjustment, exact: true }).click();
      await expect.poll(() => iqd(kpi(mgr, s.kExpected))).toBe(before - 1000);
      // The form reloads the page. Wait for hydration, or the reverse click below is dropped (no request is sent).
      await mgr.waitForLoadState('networkidle');

      const adjRow = mgr.locator('tr', { hasText: reason });
      await expect(adjRow).toHaveCount(1);
      await expect(adjRow.locator('td').nth(1)).toHaveText(/Partial rejection|رفض جزئي/);
      await expect(adjRow.locator('td').nth(2)).toHaveText(/-1,000 (IQD|د.ع)/);
      await expect(adjRow.locator('td').nth(4)).toHaveText(s.posted);

      // Reverse with a reason: a new opposite row is posted and expected COD returns to its previous value.
      const reversalReason = `E2E reversal ${u}`;
      answerDialogs(mgr, reversalReason);
      await adjRow.getByRole('button', { name: s.reverse, exact: true }).click();
      await expect.poll(() => iqd(kpi(mgr, s.kExpected))).toBe(before);

      const original = mgr.locator('tr', { hasText: reason });
      await expect(original).toHaveCount(1);
      await expect(original.locator('td').nth(2)).toHaveText(/-1,000 (IQD|د.ع)/);
      await expect(original.locator('td').nth(3)).toHaveText(reason);
      await expect(original.locator('td').nth(4)).toHaveText(s.reversed);
      await expect(original.getByRole('button')).toHaveCount(0);

      const entry = mgr.locator('tr', { hasText: 'REVERSAL of' }).filter({ hasText: reversalReason });
      await expect(entry).toHaveCount(1);
      await expect(entry.locator('td').nth(2)).toHaveText(/^1,000 (IQD|د.ع)$/);
      await expect(entry.locator('td').nth(4)).toHaveText(s.reversalEntry);
    } finally {
      await crew.close();
    }
  });

  test('6 GROSS courier: full COD is due, the courier fee is a separate payable, a fee payment is recorded and an over-payment is refused', async ({ browser }, info) => {
    test.setTimeout(420_000);
    const lang = langOf(info.project.name);
    const crew = new Crew(browser, info, lang);
    const s = crew.strings;
    const u = uniq('E2E-G6');
    try {
      const run = await runToHandover(crew, GROSS_COURIER, u);
      const acc = await crew.open(STATE.accountant);
      await openShipmentFromList(acc, run.orderNumber);
      const fee = await iqd(kpi(acc, s.kFeeGross));
      expect(await iqd(kpi(acc, s.kFeeSnapshot))).toBe(fee);
      await expect(kpi(acc, s.kFeeDeducted)).toHaveCount(0);

      const expected = await iqd(kpi(acc, s.kExpected));
      await recordCollection(acc, s, expected, `E2E-COD-${u}`);
      // GROSS: the courier owes the full collected COD; the fee is NOT deducted from it.
      await expect.poll(() => iqd(kpi(acc, s.kDue))).toBe(expected);

      // Courier statement: fee shown as payable separately, not deducted from COD.
      await gotoSettled(acc,'/accounting/couriers');
      await acc.getByRole('link', { name: GROSS_COURIER, exact: true }).click();
      await acc.waitForURL(/\/accounting\/couriers\/[0-9a-f-]{36}$/);
      const row = acc.locator('tr', { hasText: run.orderNumber });
      await expect(row).toHaveCount(1);
      const cells = row.locator('td');
      expect(await iqd(cells.nth(9))).toBe(expected);
      expect(await iqd(cells.nth(12))).toBe(fee);
      await expect(cells.nth(8)).toHaveText('—');

      // Record the fee payment (exact payable), then refuse a payment above what is still payable.
      const paid = formWith(acc, s.recordFee);
      await paid.locator('[name="amount"]').fill(String(fee));
      await paid.locator('[name="reference"]').fill(`E2E-FEE-${u}`);
      await paid.locator('[name="paidAt"]').fill(recentLocalInput());
      await paid.getByRole('button', { name: s.recordFee, exact: true }).click();
      await expect(acc.getByText(s.feeOk)).toBeVisible();
      await expect(acc.locator('tr', { hasText: `E2E-FEE-${u}` })).toHaveCount(1);

      const over = formWith(acc, s.recordFee);
      await over.locator('[name="amount"]').fill('999999999');
      await over.locator('[name="reference"]').fill(`E2E-FEE-OVER-${u}`);
      await over.locator('[name="paidAt"]').fill(recentLocalInput());
      await over.getByRole('button', { name: s.recordFee, exact: true }).click();
      await expect(over.getByRole('alert')).toContainText(ERR.overPayment);
      await expect(acc.locator('tr', { hasText: `E2E-FEE-OVER-${u}` })).toHaveCount(0);
    } finally {
      await crew.close();
    }
  });

  test('7 reports: the couriers preview shows rows, and the export links (report.export) download a checksummed file for the manager', async ({ browser }, info) => {
    test.setTimeout(420_000);
    const lang = langOf(info.project.name);
    const crew = new Crew(browser, info, lang);
    const s = crew.strings;
    const u = uniq('E2E-P7');
    try {
      // Ensures at least one NET courier shipment exists in this run, so the preview is not empty.
      await runToHandover(crew, NET_COURIER, u);
      const mgr = await crew.open(MANAGER_STATE);
      await mgr.goto('/accounting/reports?type=couriers');
      await expect(mgr.getByText(s.noData)).toHaveCount(0);
      await expect(mgr.locator('tr', { hasText: NET_COURIER }).first()).toBeVisible();

      const csv = mgr.getByRole('link', { name: s.csv, exact: true });
      await expect(csv).toHaveAttribute('href', /type=couriers.*format=csv|format=csv.*type=couriers/);
      await expect(csv).toHaveAttribute('download', '');
      await expect(mgr.getByRole('link', { name: s.xlsx, exact: true })).toHaveAttribute('href', /format=xlsx/);

      const href = await csv.getAttribute('href');
      const res = await mgr.request.get(new URL(href ?? '', BASE).toString());
      expect(res.status()).toBe(200);
      expect(res.headers()['content-type']).toContain('text/csv');
      expect(res.headers()['x-report-checksum']).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      await crew.close();
    }
  });
});
