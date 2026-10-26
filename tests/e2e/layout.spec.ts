import { expect, test } from "@playwright/test";

test("workspace remains usable across desktop, tablet and phone widths", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(page.getByLabel("Short title")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Confirm requirement", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`workspace-${width}.png`),
      fullPage: true,
    });
  }
});
