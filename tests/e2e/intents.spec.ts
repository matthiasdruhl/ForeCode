import { expect, test } from "@playwright/test";

test("confirm, revise, export and revoke a future requirement", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Give the future a brief." }),
  ).toBeVisible();
  await expect(page.getByText("No confirmed requirements yet.")).toBeVisible();
  await page.getByRole("button", { name: "Team permissions" }).click();
  await expect(page.getByText("No confirmed requirements yet.")).toBeVisible();
  await page
    .getByRole("button", { name: "Confirm requirement", exact: true })
    .click();
  await expect(
    page.getByText("Confirmed by you", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Edit Team permissions", exact: true })
    .click();
  await page
    .getByLabel("What needs to change?")
    .fill("Owners can delegate booking approval to team administrators.");
  await page
    .getByRole("button", { name: "Confirm revision", exact: true })
    .click();
  await expect(page.getByText("r2", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Earlier references are now stale.", { exact: false }),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("forecode-intents.json");
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const exported = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  expect(exported).toHaveLength(1);
  expect(exported[0]).toMatchObject({
    schemaVersion: "intent.v1",
    revision: 2,
    status: "confirmed",
    source: { kind: "user_confirmed" },
  });
  await page
    .getByRole("button", { name: "Revoke Team permissions", exact: true })
    .click();
  await expect(page.getByText("Revoked", { exact: true })).toBeVisible();
  await expect(page.getByText("r3", { exact: true })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("validation, local privacy and safe rendering", async ({ page }) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:3100"))
      externalRequests.push(request.url());
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Confirm requirement", exact: true })
    .click();
  await expect(page.locator("#input-error")).toContainText(
    "Add a short title.",
  );
  await page.getByLabel("Short title").fill("<img src=x onerror=alert(1)>");
  await page
    .getByLabel("What needs to change?")
    .fill("Keep user-supplied text as data.");
  await page
    .getByRole("button", { name: "Confirm requirement", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "<img src=x onerror=alert(1)>" }),
  ).toBeVisible();
  await expect(page.locator("article img")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(externalRequests).toEqual([]);
  await page.reload();
  await expect(page.getByText("No confirmed requirements yet.")).toBeVisible();
});
