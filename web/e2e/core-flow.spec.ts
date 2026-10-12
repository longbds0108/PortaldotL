import { expect, test } from "@playwright/test";

// Expects the local scenario from e2e/README.md: seeded tenders 0–2 (Open),
// tender 3 awarded to the $6,900 bid (one bidder never revealed), tender 4 Open with a sealed $4,321 bid.

test("marketplace lists tenders without revealing prices and filters by category", async ({ page }) => {
  await page.goto("/marketplace");
  await expect(page.getByText("Enterprise Website Development")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Bid amounts remain confidential").first()).toBeVisible();
  await expect(page.getByText("$5,000.00–$10,000.00").first()).toBeVisible();

  await page.getByRole("tab", { name: "Construction" }).click();
  await expect(page.getByText("Commercial Building Renovation")).toBeVisible();
  await expect(page.getByText("Enterprise Website Development")).toHaveCount(0);
});

test("open tender never shows a sealed bid amount", async ({ page }) => {
  await page.goto("/tenders/4");
  await expect(page.getByRole("heading", { name: "E2E Sealed Tender" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Sealed", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Sealed bid submitted by")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("4,321");
});

test("results page proves the process and verifies commitments in the browser", async ({ page }) => {
  await page.goto("/tenders/3/results");
  await expect(page.getByText("Winner", { exact: true }).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("$6,900.00").first()).toBeVisible();
  await expect(page.getByText("Lowest revealed price within budget.")).toBeVisible();
  await expect(page.getByText("Not revealed")).toBeVisible();

  await page.getByRole("button", { name: "Verify all" }).click();
  const ok = page.getByText("Revealed amount, salt and document key hash to the sealed commitment");
  await expect(ok).toHaveCount(2);
  await expect(page.getByText("Commitment was last set before the submission deadline")).toHaveCount(2);
  await expect(page.locator("li.text-destructive")).toHaveCount(0);

  await expect(page.getByText("Awarded to")).toBeVisible();
  await expect(page.getByText("Bid revealed by")).toHaveCount(2);
});

test("layout fits the viewport without horizontal scroll", async ({ page }) => {
  for (const path of ["/", "/dashboard", "/marketplace", "/tenders/3", "/tenders/new"]) {
    await page.goto(path);
    // pages poll the chain, so wait for rendered content rather than network idle
    await page.locator("main h1").first().waitFor({ timeout: 30_000 });
    await page.waitForTimeout(1000);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(1);
  }
});

test("landing page renders and LAUNCH APP enters the workspace", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Bid in public.");
  await expect(page.getByText(/read live from/)).toBeVisible({ timeout: 30_000 });
  await page.locator("header").getByRole("link", { name: "LAUNCH APP" }).click();
  await page.waitForURL("**/dashboard");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
