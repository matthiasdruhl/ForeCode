import { expect, test } from "@playwright/test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFile } from "node:fs/promises";
import { projectTournamentReplayCatalog } from "../../src/lib/replay";
import { ReplayHistory } from "../../src/components/v6/replay-history";
import { syntheticTournamentView } from "../support/tournament-view";

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
