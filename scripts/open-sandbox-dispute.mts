/**
 * Opens a PayPal sandbox dispute on an agent purchase, acting as the sandbox buyer.
 *
 * PayPal has no API for creating disputes, so this drives the buyer's "Report a problem"
 * form with Playwright. Use it to give the dispute desk real data before a demo.
 *
 * Usage (Node 24+):
 *   node --env-file=.env.local scripts/open-sandbox-dispute.mts <purchase id> [--show]
 *
 * The purchase ID (pur_…) is on the receipt page; PayPal shows it as the invoice ID.
 * The dispute is a "charged twice" claim. It reaches the PayPal API after a few minutes;
 * then press "Check PayPal for disputes" in the app.
 */
import { chromium, type Locator, type Page } from "playwright";

const purchaseId = process.argv[2];
const headless = !process.argv.includes("--show");
const { SANDBOX_BUYER_EMAIL, SANDBOX_BUYER_PASSWORD } = process.env;

if (!purchaseId?.startsWith("pur_")) {
  console.error("Pass the purchase ID from the receipt page, e.g. pur_nhbccjbn1tdr");
  process.exit(1);
}
if (!SANDBOX_BUYER_EMAIL || !SANDBOX_BUYER_PASSWORD) throw new Error("Set SANDBOX_BUYER_EMAIL and SANDBOX_BUYER_PASSWORD");

const SANDBOX = "https://www.sandbox.paypal.com";
const COMPLAINT =
  "I see several Test Store charges this week for the same water filter order. I think I was charged twice and did not approve the extra charge.";

/** Clicks the element if it shows up within a few seconds; PayPal skips some steps. */
async function clickIfShown(locator: Locator, timeout = 5_000): Promise<boolean> {
  try {
    await locator.first().click({ timeout });
    return true;
  } catch {
    return false;
  }
}

const continueButton = (page: Page) => page.getByRole("button", { name: /^continue/i });

async function logIn(page: Page) {
  await page.goto(`${SANDBOX}/signin`);
  await page.locator("#email").fill(SANDBOX_BUYER_EMAIL!);
  await clickIfShown(page.locator("#btnNext"), 3_000);
  await page.locator("#password").fill(SANDBOX_BUYER_PASSWORD!);
  await page.locator("#btnLogin").click();
  await page.waitForURL(/myaccount/, { timeout: 60_000 });
}

/** Opens the buyer's payment whose invoice ID is our purchase ID and returns its transaction ID. */
async function findPayment(page: Page): Promise<string> {
  await page.goto(`${SANDBOX}/myaccount/activities/`);
  const rows = page.getByText(/^−\$[\d.,]+/);
  await rows.first().waitFor({ timeout: 30_000 });
  const count = Math.min(await rows.count(), 25);
  for (let i = 0; i < count; i++) {
    await rows.nth(i).click();
    // The row expands in place; its details (transaction ID, then invoice ID) load a moment later.
    await page.waitForTimeout(2_500);
    const text = await page.locator("body").innerText();
    const at = text.indexOf(purchaseId);
    if (at === -1) continue;
    const id = [...text.slice(0, at).matchAll(/Transaction ID\s+([A-Z0-9]{17})/g)].at(-1)?.[1];
    if (id) return id;
  }
  throw new Error(`No sandbox payment with invoice ID ${purchaseId} in the buyer's recent activity`);
}

/**
 * PayPal's form skips pages it already knows the answer to and resumes saved drafts, so
 * each step looks at the page in front of it and answers whatever is being asked.
 */
async function fileDispute(page: Page, transactionId: string): Promise<string> {
  await page.goto(`${SANDBOX}/resolutioncenter/filing/${transactionId}/create?type=PAYMENT`);
  await clickIfShown(page.getByRole("button", { name: /yes, i accept/i }), 8_000);

  const shown = (locator: Locator) => locator.first().isVisible();
  for (let step = 0; step < 12; step++) {
    await page.waitForLoadState("networkidle").catch(() => {});
    const caseId = (await page.locator("body").innerText()).match(/Case ID:\s*(\S+)/)?.[1];
    if (caseId) return caseId;

    if (await shown(page.getByRole("button", { name: /continue reporting this issue/i }))) {
      await page.getByRole("button", { name: /continue reporting this issue/i }).click();
    } else if (await shown(page.getByRole("button", { name: /^submit/i }))) {
      await page.getByRole("button", { name: /^submit/i }).click();
    } else if (await shown(page.getByText("I was billed a different amount or was billed twice"))) {
      await page.getByText("I was billed a different amount or was billed twice").click();
    } else if (await shown(page.locator("label[for=selection_issue_DUPLICATE_TRANSACTION]"))) {
      await page.locator("label[for=selection_issue_DUPLICATE_TRANSACTION]").click();
      await continueButton(page).click();
    } else if (await shown(page.locator("label[for=selection_duplicate_received_NO]"))) {
      // "Choose the duplicate transaction": any earlier payment to this seller.
      await clickIfShown(page.locator("label[for^=Radio_]"), 2_000);
      await page.locator("label[for=selection_duplicate_received_NO]").click();
      await continueButton(page).click();
    } else if (await shown(page.locator("label[for=selection_merchant_contacted_NO]"))) {
      await page.locator("label[for=selection_merchant_contacted_NO]").click();
      await continueButton(page).click();
    } else if (await shown(page.locator("#text-input-notes"))) {
      await page.locator("#text-input-notes").fill(COMPLAINT);
      await continueButton(page).click();
    } else {
      await page.waitForTimeout(2_000);
    }
    await page.waitForTimeout(1_500);
  }
  throw new Error("The Report a problem form did not reach a filed case");
}

const browser = await chromium.launch({ headless });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
try {
  await logIn(page);
  const transactionId = await findPayment(page);
  console.log(`Buyer payment ${transactionId} is purchase ${purchaseId}`);
  const caseId = await fileDispute(page, transactionId);
  console.log(`Opened dispute ${caseId}. In a few minutes, press "Check PayPal for disputes" in the app.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  await page.screenshot({ path: "e2e/artifacts/open-dispute-failure.png", fullPage: true }).catch(() => {});
  console.error("Screenshot of the failing step: e2e/artifacts/open-dispute-failure.png");
  process.exitCode = 1;
} finally {
  await browser.close();
}
