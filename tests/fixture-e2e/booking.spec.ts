import { expect, test } from "@playwright/test";

test("synthetic session, owner isolation, conflicts and cancellation", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const requests: string[] = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:3101"))
      requests.push(request.url());
  });
  expect((await page.request.get("/api/resources")).status()).toBe(200);
  expect(
    (
      await page.request.get("/api/bookings", {
        headers: { "x-user-id": "u-alice" },
      })
    ).status(),
  ).toBe(401);
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Create booking", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Start Alice’s demo session" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Planning session", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Project review", exact: true }),
  ).toHaveCount(0);
  expect((await page.request.get("/api/bookings/b-b1")).status()).toBe(404);
  const title = `UI booking ${testInfo.project.name}`;
  const day = testInfo.project.name === "desktop" ? "11" : "12";
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Start (UTC)").fill(`2026-11-${day}T11:00`);
  await page.getByLabel("End (UTC)").fill(`2026-11-${day}T12:00`);
  await page
    .getByRole("button", { name: "Create booking", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("Booking created.");
  await page
    .getByLabel("Title", { exact: true })
    .fill(`Overlap ${testInfo.project.name}`);
  await page
    .getByRole("button", { name: "Create booking", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "already booked" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: `Cancel ${title}`, exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("Booking cancelled.");
  await expect(
    page
      .getByRole("heading", { name: title, exact: true })
      .locator("..")
      .getByText("cancelled", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Title", { exact: true })
    .fill(`Freed slot ${testInfo.project.name}`);
  await page
    .getByRole("button", { name: "Create booking", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("Booking created.");
  await page.screenshot({
    path: testInfo.outputPath("booking-fixture.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", {
      name: `Cancel Freed slot ${testInfo.project.name}`,
      exact: true,
    })
    .click();
  await expect(page.getByRole("status")).toHaveText("Booking cancelled.");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  expect(requests).toEqual([]);
});
