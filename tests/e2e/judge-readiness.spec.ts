// Independent QA. Reviewed synthetic metadata stays in this test document;
// no production catalog, inference, evaluator or publication is provisioned.
import { expect, test, type Page } from "@playwright/test";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFile } from "node:fs/promises";
import { DecisionMemo } from "../../src/components/v6/decision-memo";
import { SourceHistory } from "../../src/components/v6/source-phase-inspector";
import { EvidenceDetail } from "../../src/components/v6/evidence-ledger";
import { assessDecisionReport } from "../../src/lib/report/decision-report";
import { preparationInclusiveMetrics } from "../../src/lib/experiment/metrics";
import { PublicTournamentSchema } from "../../src/lib/experiment/tournament-publication";
import { initialTraceFocus } from "../../src/lib/presentation/trace-focus";
import { syntheticTournamentView } from "../support/tournament-view";

function longIdentifiers() {
  const study = syntheticTournamentView();
  study.studyId = `qa-${"s".repeat(125)}`;
  study.taskId = `qa-${"t".repeat(125)}`;
  for (const arm of study.arms) {
    arm.total = preparationInclusiveMetrics(arm.preparation, arm.downstream);
    arm.runId = `qa-${arm.variant}-${"r".repeat(123)}`;
    arm.receiptId = `qa-${arm.variant}-${"e".repeat(123)}`;
    arm.baselineReceiptId = `qa-${arm.variant}-${"b".repeat(123)}`;
  }
  study.sourceComparison![0]!.path = `src/${"p".repeat(192)}.ts`;
  PublicTournamentSchema.parse(study);
  return study;
}

async function componentDocument(page: Page, component: ReactElement) {
  const css = (
    await Promise.all(
      ["src/app/globals.css", "src/app/forecode-v6.css"].map((file) =>
        readFile(file, "utf8"),
      ),
    )
  ).join("\n");
  await page.setContent(
    `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><main class="research-body">${renderToStaticMarkup(component)}</main></body></html>`,
  );
}

test("QA: long hashes and receipt IDs remain readable", async ({ page }) => {
  const study = longIdentifiers();
  for (const [component, receiptId] of [
    [
      createElement(SourceHistory, {
        study,
        focus: { ...initialTraceFocus("qa-only"), arm: "B", phase: "after" },
      }),
      study.arms[1]!.receiptId!,
    ],
    [
      createElement(EvidenceDetail, { study, question: "checks" }),
      study.arms[1]!.receiptId!,
    ],
  ] as const) {
    await componentDocument(page, component);
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      await expect(page.locator("body")).toContainText(study.arms[1]!.runId!);
      await expect(page.locator("body")).toContainText(receiptId);
    }
  }
});

test("QA-07: preparation source paths wrap unbroken filenames", async ({
  page,
}, info) => {
  const study = longIdentifiers();
  await componentDocument(
    page,
    createElement(SourceHistory, {
      study,
      focus: { ...initialTraceFocus("qa-only"), arm: "B", phase: "prepared" },
    }),
  );
  const observations = [];
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 844 });
    observations.push({
      width,
      scroll: await page.evaluate(() => document.documentElement.scrollWidth),
    });
    await expect(page.locator("body")).toContainText(
      study.sourceComparison![0]!.path,
    );
    await expect(page.locator("body")).toContainText(
      study.arms[1]!.baselineReceiptId!,
    );
  }
  await info.attach("QA-07-overflow-observations", {
    body: JSON.stringify(observations),
    contentType: "application/json",
  });
  await page.screenshot({
    path: info.outputPath("QA-07-synthetic-long-source-path.png"),
    fullPage: true,
  });
  test.fail(
    true,
    "QA-07: a schema-valid unbroken source filename overflows the comparison.",
  );
  expect(observations.every(({ width, scroll }) => scroll <= width)).toBe(true);
});

test("QA-02: mobile memo wraps schema-valid long study and task IDs", async ({
  page,
}, info) => {
  const study = longIdentifiers();
  const analysis = assessDecisionReport(study);
  expect(analysis.identity).not.toBeNull();
  await componentDocument(
    page,
    createElement(DecisionMemo, {
      catalog: {
        state: "available",
        unavailableCount: 0,
        reports: [
          {
            provenance: "FRESH_APPROVED_TOURNAMENT_LOADER",
            support: "EVIDENCE_SUPPORTED",
            analysis,
          },
        ],
      },
      studyId: study.studyId,
      projectionSha256: analysis.evidenceReferences!.projectionSha256,
      inspect: () => {},
    }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: info.outputPath("QA-02-synthetic-long-identifiers.png"),
    fullPage: true,
  });
  // Audited open defect, not a passing release gate. An unexpected pass forces
  // removal of this annotation when the frontend owner fixes it. See QA report.
  test.fail(true, "QA-02: 390px memo currently overflows to 684px.");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

test("QA: Chromium keyboard users can reach and scroll the recorded comparison table", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/experiments");
  const scroller = page.locator(".comparison-table-scroll");
  expect(
    await scroller.evaluate(
      (element) => element.scrollWidth > element.clientWidth,
    ),
  ).toBe(true);
  let reached = false;
  for (let step = 0; step < 16; step++) {
    await page.keyboard.press("Tab");
    reached = await scroller.evaluate((element) =>
      element.contains(document.activeElement),
    );
    if (reached) break;
  }
  // axe 4.11 flags the absent tabindex, but this Chromium automatically makes
  // overflowing scroll containers keyboard stops. Preserve the actual check.
  expect(reached).toBe(true);
  const before = await scroller.evaluate((element) => element.scrollLeft);
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() => scroller.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(before);
});

test("QA-04: inactive chapter numbers meet normal-text contrast", async ({
  page,
}) => {
  await page.goto("/#report");
  await expect(page.locator('.chapter-rail a[href="#report"]')).toHaveAttribute(
    "aria-current",
    "step",
  );
  const sample = await page
    .locator(".chapter-rail a:not([aria-current]) span")
    .first()
    .evaluate((element) => {
      const style = getComputedStyle(element);
      let parent: Element | null = element;
      let background = "rgba(0, 0, 0, 0)";
      while (parent && background === "rgba(0, 0, 0, 0)") {
        background = getComputedStyle(parent).backgroundColor;
        parent = parent.parentElement;
      }
      return {
        foreground: style.color,
        opacity: Number(style.opacity),
        background,
      };
    });
  const rgb = (value: string) =>
    value
      .match(/[\d.]+/g)!
      .slice(0, 3)
      .map(Number);
  const background = rgb(sample.background);
  const foreground = rgb(sample.foreground).map(
    (value, i) =>
      value * sample.opacity + background[i]! * (1 - sample.opacity),
  );
  const luminance = (values: number[]) =>
    values
      .map((value) => {
        const s = value / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      })
      .reduce(
        (total, value, i) => total + value * [0.2126, 0.7152, 0.0722][i]!,
        0,
      );
  const light = luminance(foreground),
    dark = luminance(background);
  const ratio = (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05);
  test.fail(true, "QA-04: rendered inactive numbers have 4.2:1 contrast.");
  expect(ratio).toBeGreaterThanOrEqual(4.5);
});

test("QA: graph keyboard focus remains visible under reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/#lab");
    await expect(page.locator('.chapter-rail a[href="#lab"]')).toHaveAttribute(
      "aria-current",
      "step",
    );
    await page.locator(".lab-introduction .trace-scroll").focus();
    await page.keyboard.press("Tab");
    await expect(
      page.locator(".lab-introduction .trace-arm").first(),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    for (const responsibility of ["Routes", "Ownership", "Policy", "Storage"]) {
      const control = page.getByRole("button", {
        name: `Inspect A · ${responsibility}`,
        exact: true,
      });
      await expect(control).toBeFocused();
      await page.keyboard.press("Space");
      await expect(control).toHaveAttribute("aria-pressed", "true");
      const style = await control.evaluate((element) => {
        const s = getComputedStyle(element);
        return {
          outline: s.outlineStyle,
          width: s.outlineWidth,
          transition: s.transitionDuration,
          animation: s.animationName,
        };
      });
      expect(style).toMatchObject({
        outline: "solid",
        width: "2px",
        animation: "none",
      });
      expect(parseFloat(style.transition)).toBe(0);
      await page.keyboard.press("Tab");
    }
    const armB = page.locator(".lab-introduction .trace-arm").last();
    await expect(armB).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(armB).toHaveAttribute("aria-pressed", "true");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  }
});

test("QA: printing another chapter retains memo missingness and limitations", async ({
  page,
}) => {
  await page.goto("/#time");
  await expect(page.locator('.chapter-rail a[href="#time"]')).toHaveAttribute(
    "aria-current",
    "step",
  );
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".decision-paper")).toBeVisible();
  await expect(page.locator(".decision-paper")).toContainText(
    "No matched A/B future-task study has been authenticated",
  );
  await expect(page.locator(".memo-limits")).toBeVisible();
  await expect(page.locator(".research-header")).toBeHidden();
  await expect(page.locator(".source-history")).toBeHidden();
});
