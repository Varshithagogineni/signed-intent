import { expect, type Page, test } from "@playwright/test";

const BUYER_EMAIL = process.env.SANDBOX_BUYER_EMAIL;
const BUYER_PASSWORD = process.env.SANDBOX_BUYER_PASSWORD;

test.skip(!BUYER_EMAIL || !BUYER_PASSWORD, "Set SANDBOX_BUYER_EMAIL and SANDBOX_BUYER_PASSWORD to run the end-to-end flow");

/** Logs in to the PayPal sandbox checkout popup as the buyer and approves the order. */
async function approveInPayPal(popup: Page) {
  await popup.waitForLoadState("domcontentloaded");

  const email = popup.locator("#email");
  await email.waitFor({ timeout: 60_000 });
  await email.fill(BUYER_EMAIL!);
  const next = popup.locator("#btnNext");
  if (await next.isVisible()) await next.click();

  const password = popup.locator("#password");
  await password.waitFor();
  await password.fill(BUYER_PASSWORD!);
  await popup.locator("#btnLogin").click();

  // The approve button's label varies between "Continue", "Review Order" and "Agree & Continue".
  const approve = popup.getByRole("button", { name: /^(continue|review order|agree & continue|complete purchase)/i });
  await approve.first().waitFor({ timeout: 60_000 });
  await approve.first().click();
  await popup.waitForEvent("close", { timeout: 60_000 });
}

test("agent buys inside a PayPal mandate and the policy blocks an overspend", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /water filter pitcher, budget \$40/i }).click();

  const approveButton = page.getByRole("button", { name: "Approve with PayPal" });
  await expect(approveButton).toBeVisible({ timeout: 60_000 });
  await page.screenshot({ path: "e2e/artifacts/01-mandate-proposed.png" });

  const [popup] = await Promise.all([page.waitForEvent("popup"), approveButton.click()]);
  await approveInPayPal(popup);

  // After approval the agent confirms the mandate, searches and buys.
  await expect(page.getByText(/^Paid \$[\d.]+ via PayPal/)).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText("active", { exact: true })).toBeVisible();
  await page.screenshot({ path: "e2e/artifacts/02-purchase-completed.png" });

  await page.getByPlaceholder(/what should the agent buy/i).fill("Now try to buy a $120 blender anyway");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Blocked by mandate policy")).toBeVisible({ timeout: 120_000 });
  await page.screenshot({ path: "e2e/artifacts/03-overspend-blocked.png" });

  await page.getByRole("link", { name: /view signed receipt/i }).first().click();
  await expect(page.getByText("✓ Signature valid")).toBeVisible();
  await page.screenshot({ path: "e2e/artifacts/04-receipt.png", fullPage: true });
});
