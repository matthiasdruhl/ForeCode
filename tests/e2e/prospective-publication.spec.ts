// Component-only counterfactual disclosure. Never provision a production catalog.
import { expect, test } from "@playwright/test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFile } from "node:fs/promises";
import { EvidenceDetail } from "../../src/components/v6/evidence-ledger";
import { MeasurementRail } from "../../src/components/v6/tournament-measurements";
import { syntheticTournamentView } from "../support/tournament-view";
import { syntheticProspectivePublication } from "../support/prospective-publication";

test("synthetic archival disclosure preserves exact scope, keyboard access and unknowns at every width", async ({
  page,
}, info) => {
  const errors: string[] = [],
    outbound: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => outbound.push(request.url()));
  const study = syntheticTournamentView(),
    prospective = syntheticProspectivePublication(study);
  const css = await readFile("src/app/forecode-v6.css", "utf8");
  const html = renderToStaticMarkup(
    createElement(
      "main",
      null,
      createElement(EvidenceDetail, {
        study,
        question: "hypothesis",
        prospective,
      }),
      createElement(MeasurementRail, { study, prospective }),
    ),
  );
  await page.setContent(
    `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:16px}${css}</style></head><body>${html}</body></html>`,
  );
  await expect(
    page.getByRole("heading", { name: "Recorded Meta hypothesis" }),
  ).toBeVisible();
  await expect(page.locator("body")).toContainText("0 / Unknown");
  await expect(
    page.getByRole("heading", { name: "Scope and limitations" }),
  ).toBeVisible();
  await expect(page.locator("body")).toContainText("no current model issuance");
  await expect(page.locator("body")).toContainText(
    "Signed custody does not establish human, organizational or blind independence",
  );
  await expect(
    page.getByRole("row", {
      name: /Selected forbidden rejection sites · final failures/,
    }),
  ).toContainText("0 cases");
  const summary = page.getByText("Exact measurement scope", { exact: true });
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("details.metric-scope")).toHaveAttribute(
    "open",
    "",
  );
  await expect(page.locator("details.metric-scope")).toContainText(
    "src/server/http.ts → src/server/booking-store.ts",
  );
  await expect(page.locator("details.metric-scope")).toContainText(
    "rejection-site-007",
  );
  await page
    .getByRole("region", { name: "Preparation and downstream measurements" })
    .focus();
  await expect(
    page.getByRole("region", {
      name: "Preparation and downstream measurements",
    }),
  ).toBeFocused();
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    if (width === 390) {
      const cells = page.getByRole("columnheader");
      for (const cell of await cells.all()) {
        const bounds = await cell.boundingBox();
        expect(bounds).not.toBeNull();
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      }
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`prospective-${width}.png`),
      fullPage: true,
    });
  }
  expect(errors).toEqual([]);
  expect(outbound).toEqual([]);
});

test("missing archival measurements remain Unknown without a supported prediction", async ({
  page,
}) => {
  const study = syntheticTournamentView(),
    prospective = {
      ...syntheticProspectivePublication(study),
      metrics: null,
      scopeLimitations: [
        "Synthetic current failure: requests returned HTTP 403; the access boundary is unknown.",
        "No valid architectural test or observed provider usage is established by this fixture.",
      ],
    };
  await page.setContent(
    renderToStaticMarkup(
      createElement(
        "main",
        null,
        createElement(EvidenceDetail, {
          study,
          question: "hypothesis",
          prospective,
        }),
        createElement(MeasurementRail, { study, prospective }),
      ),
    ),
  );
  await expect(page.locator("body")).toContainText("Counts remain Unknown");
  await expect(page.locator("body")).toContainText("HTTP 403");
  await expect(page.locator("body")).toContainText(
    "No valid architectural test",
  );
  await expect(page.locator("body")).not.toContainText(
    "eligible observed pairs: 1",
  );
  await expect(page.locator("body")).not.toContainText("supported");
});
