import { expect, test } from "@playwright/test";

test("Change Trace remains source-backed and its focus follows the existing Atlas inspector", async ({ page }) => {
  const requests: string[] = [];
  const errors: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/foresight/")) requests.push(request.url());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:3102");
  const atlas = page.getByRole("region", { name: "Inspect the booking boundary." });
  const trace = atlas.getByRole("region", { name: "One future requirement. Two approaches." });
  await expect(trace).toContainText("Conceptual comparison · no experiment");
  await expect(trace.locator(".change-trace-step")).toHaveCount(8);
  await expect(trace.getByRole("button", {
    name: "Inspect B / service: src/server/booking-service.ts",
  })).toBeDisabled();
  await trace.getByRole("button", {
    name: "Inspect A / store: src/server/booking-store.ts",
  }).focus();
  await page.keyboard.press("Enter");
  await expect(atlas.getByRole("complementary", { name: "Selected module" })).toContainText(
    "src/server/booking-store.ts",
  );
  await expect(trace.locator(".change-trace-inspection")).toContainText(
    "src/server/booking-store.ts",
  );
  await page.getByRole("button", { name: "Team permissions", exact: true }).click();
  await page.getByRole("button", { name: "Confirm requirement", exact: true }).click();
  await page.getByRole("button", { name: "Explore local template", exact: true }).click();
  const b = trace.getByRole("button", {
    name: "Inspect B / service: src/server/booking-service.ts",
  });
  await expect(b).toBeEnabled();
  await b.click();
  await expect(b).toHaveAttribute("aria-pressed", "true");
  await expect(atlas.getByRole("complementary", { name: "Selected module" })).toContainText(
    "src/server/booking-service.ts",
  );
  await expect(trace.locator(".change-trace-inspection")).toContainText(
    "no implementation is asserted",
  );
  await page.getByRole("button", { name: "Revoke Team permissions", exact: true }).click();
  await expect(b).toBeDisabled();
  await expect(trace.getByRole("button", {
    name: "Inspect A / service: src/server/booking-service.ts",
  })).toHaveAttribute("aria-pressed", "true");
  await expect(trace).toContainText("Conceptual comparison · no experiment");
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});

test("Change Trace is keyboard legible and scrolls internally at 390px without animated execution", async ({ page }) => {
  await page.goto("http://127.0.0.1:3102");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const trace = page.locator(".change-trace");
  await expect(trace).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const rail = trace.locator(".change-trace-steps").first();
  const widths = await rail.evaluate((node) => ({
    client: node.clientWidth,
    scroll: node.scrollWidth,
  }));
  expect(widths.scroll).toBeGreaterThan(widths.client);
  await rail.evaluate((node) => { node.scrollLeft = 200; });
  expect(await rail.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
  await expect(trace.locator(".change-trace-step").first()).toHaveCSS("transition-duration", "0s");
  await expect(trace.locator("svg, .pulse")).toHaveCount(0);
});
