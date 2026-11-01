import { disabledOrigin } from "../support/browser-origins";
import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { browserSyntheticResponse } from "../support/foresight";
import type { FlowRequest, Step } from "@/lib/foresight/flow";
import { bookingGraph } from "@/lib/foresight/booking-context";
import { canonicalJson } from "@/lib/report/canonical";

test("disabled provider offers an explicit local template through handoff without network dispatch", async ({
  page,
}) => {
  const providerRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/foresight/"))
      providerRequests.push(request.url());
  });
  await page.goto(disabledOrigin);
  await page
    .getByRole("button", { name: "Team permissions", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm requirement", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Explore local template", exact: true })
    .click();
  await expect(
    page.getByText("Local template assumption", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Form hypothesis", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Read local hypothesis", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Read local counterexample", exact: true })
    .click();
  await expect(
    page.getByText(
      "Developer-authored local template. No Meta counterexample call was made.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Review the research handoff." }),
  ).toBeVisible();
  await expect(
    page
      .locator(".research-provenance")
      .filter({ hasText: "template · template" }),
  ).toHaveCount(3);
  expect(providerRequests).toEqual([]);
  await page
    .getByRole("button", { name: "Clear research / start again", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Explore local template", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Propose A / B", exact: true }),
  ).toBeDisabled();
});

test("source-backed Atlas, review-only handoff and absent tournament form a safe judge flow", async ({
  page,
}, info) => {
  const errors: string[] = [];
  const requests: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.url().includes("/api/"))
      requests.push(new URL(request.url()).pathname);
  });
  await page.route("**/api/foresight/*", async (route) => {
    const step = new URL(route.request().url()).pathname
      .split("/")
      .at(-1) as Step;
    await route.fulfill({
      json: browserSyntheticResponse(
        step,
        route.request().postDataJSON() as FlowRequest,
      ),
    });
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const atlas = page.getByRole("region", {
    name: "Inspect the booking boundary.",
  });
  await expect(
    atlas.getByRole("button", {
      name: "B / Proposed preparation",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(atlas.locator(".atlas-node")).toHaveCount(
    bookingGraph.modules.length,
  );
  await expect(atlas.locator("line")).toHaveCount(bookingGraph.edges.length);
  await atlas
    .getByRole("button", {
      name: "Inspect src/server/booking-store.ts",
      exact: true,
    })
    .focus();
  await page.keyboard.press("Enter");
  await expect(
    atlas.getByRole("complementary", { name: "Selected module" }),
  ).toContainText("src/domain/booking.ts");
  await page
    .getByRole("button", { name: "Team permissions", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm requirement", exact: true })
    .click();
  for (const label of [
    "Propose A / B",
    "Form hypothesis",
    "Propose counterexample",
  ]) {
    await page.locator(".sharing-review").getByRole("checkbox").check();
    await page.getByRole("button", { name: label, exact: true }).click();
  }
  await atlas
    .getByRole("button", { name: "B / Proposed preparation", exact: true })
    .click();
  await expect(atlas.locator(".atlas-node.proposed")).not.toHaveCount(0);
  await expect(atlas.locator(".atlas-node")).toHaveCount(9);
  await expect(atlas.locator("line")).toHaveCount(13);
  await atlas
    .getByRole("button", { name: "A / Status quo", exact: true })
    .click();
  await expect(atlas.locator(".atlas-node.proposed")).toHaveCount(0);
  await atlas
    .getByRole("button", { name: "Prepared architecture", exact: true })
    .click();
  await expect(atlas.getByRole("status")).toContainText(
    "Prepared source unavailable",
  );
  await atlas
    .getByRole("button", { name: "Post-future-task source", exact: true })
    .click();
  await expect(atlas.getByRole("status")).toContainText(
    "Post-future-task source unavailable",
  );
  const handoff = page.getByRole("region", {
    name: "Review the research handoff.",
  });
  const exportButton = handoff.getByRole("button", {
    name: "Export research handoff",
    exact: true,
  });
  await expect(exportButton).toBeDisabled();
  await handoff.getByRole("checkbox").check();
  const downloadEvent = page.waitForEvent("download");
  await exportButton.click();
  const download = await downloadEvent;
  const bytes = await readFile((await download.path())!, "utf8");
  const exported = JSON.parse(bytes);
  expect(bytes).toBe(canonicalJson(exported));
  expect(exported).toMatchObject({
    authority: "planning_only",
    executionStatus: "NOT_AUTHORIZED",
    evidenceStatus: "unverified_model_proposals",
    stageProvenance: {
      propose: { mode: "template" },
      hypothesize: { mode: "template" },
      challenge: { mode: "template" },
    },
  });
  expect(exported.research.challenge.response.challenges[0]).toMatchObject({
    reviewStatus: "proposed",
    visibility: "model_generated_not_heldout",
  });
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await atlas.screenshot({ path: info.outputPath(`atlas-${width}.png`) });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page
    .getByRole("button", { name: "Edit Team permissions", exact: true })
    .click();
  await expect(handoff).toHaveCount(0);
  await expect(
    atlas.getByRole("button", {
      name: "B / Proposed preparation",
      exact: true,
    }),
  ).toBeDisabled();
  expect(requests).toEqual([
    "/api/foresight/propose",
    "/api/foresight/hypothesize",
    "/api/foresight/challenge",
  ]);
  await page.goto("/experiments");
  const study = page.getByRole("region", {
    name: "Does preparation pay for itself?",
  });
  await expect(study).toContainText(
    "Comparability: BLOCKED · Correctness: INCONCLUSIVE",
  );
  await expect(study.getByRole("table")).toContainText("Unknown");
  await expect(study).not.toContainText("VERIFIED · scoped");
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await study.screenshot({
      path: info.outputPath(`tournament-${width}.png`),
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await expect(
    page.getByRole("heading", {
      name: "No approved recorded evidence available",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("link", {
      name: "Scoped certificate availability →",
      exact: true,
    })
    .click();
  expect((await (await page.request.get("/api/demo")).json()).runs).toEqual([]);
  expect(errors).toEqual([]);
});
