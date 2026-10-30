import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TournamentStudy } from "../../src/components/tournament-study";
import { syntheticTournamentView } from "../support/tournament-view";

test("tournament history preserves the honest empty walkthrough with no execution route", async ({
  page,
  request,
}) => {
  const outbound: string[] = [];
  page.on("request", (r) => {
    if (
      r.method() !== "GET" ||
      !new URL(r.url()).hostname.match(/^(127\.0\.0\.1|localhost)$/)
    )
      outbound.push(r.url());
  });
  await page.goto("/experiments");
  const study = page.getByRole("region", {
    name: "Does preparation pay for itself?",
  });
  await expect(
    study.getByRole("list", { name: "Tournament walkthrough" }),
  ).toBeVisible();
  await expect(study).toContainText("No genuine paired study is presented");
  await expect(study).toContainText("source comparison unavailable");
  await expect(study.getByRole("table")).toContainText("Unknown");
  await expect(page.locator("button,form,input,textarea")).toHaveCount(0);
  for (const endpoint of [
    "/api/tournament",
    "/api/tournament/execute",
    "/api/tournament/evidence",
  ])
    expect((await request.get(endpoint)).status()).toBe(404);
  expect(outbound).toEqual([]);
});

test("synthetic populated walkthrough shows scoped failure, unknown costs and keyboard evidence at all widths", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const study = syntheticTournamentView();
  const css = await readFile("src/app/globals.css", "utf8");
  await page.setContent(
    `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><main class="recorded-evidence study-overview">${renderToStaticMarkup(createElement(TournamentStudy, { study }))}</main></body></html>`,
  );
  await expect(
    page.getByRole("heading", { name: "Synthetic tournament — UI test only" }),
  ).toBeVisible();
  await expect(
    page.getByRole("row", {
      name: "Future-task correctness REJECTED VERIFIED",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("row", {
      name: "Preparation-inclusive actual cost Unknown Unknown",
    }),
  ).toBeVisible();
  await expect(
    page.getByText("B_ONLY_VERIFIED", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Reserved allocation (not a charge)", { exact: true }),
  ).toBeVisible();
  const evidence = page.locator("summary").filter({
    hasText: "Evidence Laboratory / checks, commitments and chronology",
  });
  await evidence.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("cell", { name: "fail", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("synthetic-failed-preparation", { exact: false }),
  ).toBeVisible();
  await page
    .getByText("Inspect actual reviewed source changes", { exact: true })
    .click();
  await expect(
    page.getByText("src/server/authorization-policy.ts", { exact: true }),
  ).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("html")).toHaveCSS("scroll-behavior", "auto");
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`tournament-populated-${width}.png`),
      fullPage: true,
    });
  }
  expect(errors).toEqual([]);
});

test("synthetic interrupted study presents inconclusive and unavailable source comparison", async ({
  page,
}) => {
  const study = syntheticTournamentView();
  study.comparability = "INSUFFICIENT_EVIDENCE";
  study.correctness = "INCONCLUSIVE";
  study.sourceComparison = null;
  study.arms[0]!.status = "timed_out";
  study.blockers = ["A_ATTEMPT_TIMED_OUT"];
  const css = await readFile("src/app/globals.css", "utf8");
  await page.setContent(
    `<!doctype html><html><head><style>${css}</style></head><body><main class="recorded-evidence study-overview">${renderToStaticMarkup(createElement(TournamentStudy, { study }))}</main></body></html>`,
  );
  await expect(
    page.getByText("Source comparison unavailable.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("The evidence does not support a comparison yet.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("row", { name: "Agent completion timed_out completed" }),
  ).toBeVisible();
  await expect(
    page.getByText("A_ATTEMPT_TIMED_OUT", { exact: true }),
  ).toBeVisible();
});
