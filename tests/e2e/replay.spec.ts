import { expect, test } from "@playwright/test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFile } from "node:fs/promises";
import { projectTournamentReplayCatalog } from "../../src/lib/replay";
import { ReplayHistory } from "../../src/components/v6/replay-history";
import { syntheticTournamentView } from "../support/tournament-view";
import { replayStages } from "../../src/lib/replay";
import { ReplayStageExplorer } from "../../src/components/v6/replay-stage-explorer";
import { initialTraceFocus } from "../../src/lib/presentation/trace-focus";

test("production replay exposes five missing stages without inventing an experiment", async ({
  page,
}) => {
  await page.goto("/#time");
  const replay = page.locator(".replay-history");
  await replay.locator("summary").first().click();
  await expect(replay).toContainText("No approved study is available");
  await expect(replay.locator(":scope > ol > li")).toHaveCount(5);
  await expect(replay.getByText("Unknown", { exact: true })).toHaveCount(5);
  await expect(replay).not.toContainText("synthetic-run");
});

// Disposable component-only synthetic input; never injected into production loading.
test("synthetic replay preserves events, identity inspection and bounded chronology on all widths", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const catalog = projectTournamentReplayCatalog({
    state: "available",
    studies: [syntheticTournamentView()],
    unavailableCount: 0,
  });
  const replay = catalog.replays[0]!;
  const css = await readFile("src/app/forecode-v6.css", "utf8");
  const html = renderToStaticMarkup(
    createElement(ReplayHistory, { catalog, replay }),
  );
  await page.setContent(
    `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:16px}${css}</style></head><body>${html}</body></html>`,
  );
  await page.locator("summary").first().focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".replay-history")).toHaveAttribute("open", "");
  await expect(page.locator(".replay-history > ol > li")).toHaveCount(5);
  await expect(page.locator(".replay-history > ol > li > ul > li")).toHaveCount(
    replay.events.length,
  );
  await expect(page.locator("body")).toContainText(
    "No shared clock or global execution order is established",
  );
  await expect(page.locator("body")).toContainText(replay.projectionSha256);
  for (const detail of await page.locator(".replay-history details").all())
    await detail.locator("summary").click();
  await expect(page.locator("body")).toContainText("synthetic-receipt-B");
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: info.outputPath(`replay-${width}.png`) });
  }
  expect(errors).toEqual([]);
});

test("synthetic stage lanes distinguish recorded failures, unassigned comparisons and independent checks", async ({
  page,
}, info) => {
  const study = syntheticTournamentView();
  study.studyId += "-" + "long-identity-".repeat(7);
  study.sourceComparison![0]!.path =
    "src/" + "long-reviewed-directory/".repeat(12) + "authorization.ts";
  const catalog = projectTournamentReplayCatalog({
    state: "available",
    studies: [study],
    unavailableCount: 0,
  });
  const replay = catalog.replays[0]!;
  const css = await readFile("src/app/forecode-v6.css", "utf8");
  for (const stage of replayStages) {
    const html = renderToStaticMarkup(
      createElement(ReplayStageExplorer, {
        catalog,
        replay,
        stage,
        focus: initialTraceFocus("synthetic"),
        requirement: replay.futureProblem,
        requirementConfirmed: false,
        onStage: () => {},
        onArm: () => {},
        inspect: () => {},
      }),
    );
    await page.setContent(
      `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:20px}${css}</style></head><body><p>SYNTHETIC UI TEST ONLY — No experiment occurred.</p>${html}</body></html>`,
    );
    await expect(
      page.locator(".replay-stage-rail [aria-pressed=true]"),
    ).toHaveCount(1);
    await expect(page.locator(".replay-event-row")).toHaveCount(
      replay.events.filter((event) => event.stage === stage).length,
    );
    if (stage === "preparation") {
      await expect(page.locator(".replay-shared")).toContainText("failed");
      await expect(page.locator(".replay-arm-pair")).not.toContainText(
        "synthetic-failed-preparation",
      );
      await page
        .locator(".replay-shared details")
        .first()
        .locator("summary")
        .first()
        .focus();
      await page.keyboard.press("Enter");
      await expect(page.locator(".replay-shared")).toContainText(
        "synthetic-failed-preparation",
      );
    }
    if (stage === "verification") {
      await expect(
        page
          .locator(".replay-arm")
          .first()
          .locator("details > summary")
          .filter({ hasText: "Future task independent verification" }),
      ).toContainText("REJECTED");
      await expect(
        page
          .locator(".replay-arm")
          .last()
          .locator("details > summary")
          .filter({ hasText: "Future task independent verification" }),
      ).toContainText("VERIFIED");
      await page
        .locator(".replay-arm details")
        .first()
        .locator("summary")
        .first()
        .click();
      await expect(page.locator(".replay-arm").first()).toContainText(
        "baseline verdict: VERIFIED",
      );
    }
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (stage === "preparation" || stage === "verification")
        await page.screenshot({
          path: info.outputPath(`synthetic-${stage}-${width}.png`),
          fullPage: true,
        });
    }
  }
});
