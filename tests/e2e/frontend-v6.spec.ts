import { expect, test } from "@playwright/test";

test("v6 chapters retain selection, keyboard inspection, history and exact evidence return focus", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const providerCalls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/foresight"))
      providerCalls.push(request.url());
  });
  await page.goto("/");
  expect(
    await page
      .locator("body")
      .evaluate((element) => getComputedStyle(element).fontFamily),
  ).toContain("IBM");
  await page
    .getByRole("button", { name: /B \/ Prepare.*Review a permissions/ })
    .click();
  await expect(page.locator(".chapter-rail [aria-current]")).toHaveText(
    /Architecture Lab/,
  );
  const node = page.getByRole("button", {
    name: "Inspect B · Policy",
    exact: true,
  });
  await node.focus();
  await page.keyboard.press("Space");
  await expect(node).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("link", { name: "03 Tournament", exact: true }).click();
  await expect(
    page.locator(".tournament-chapter .trace-focus-label"),
  ).toContainText("B / Policy");
  await page.goBack();
  await expect(page.locator(".chapter-rail [aria-current]")).toHaveText(
    /Architecture Lab/,
  );
  await page.goForward();
  await expect(page.locator(".chapter-rail [aria-current]")).toHaveText(
    /Tournament/,
  );
  await page
    .getByRole("button", { name: "Inspect comparability requirements" })
    .click();
  await expect(page.locator(".evidence-question")).toBeFocused();
  await page.getByRole("button", { name: "Return to Tournament" }).click();
  await expect(page.locator("#tournament-fairness")).toBeFocused();
  await page
    .getByRole("link", { name: "06 Decision Report", exact: true })
    .click();
  for (const index of [1, 2, 3]) {
    await page.locator(`#memo-reason-${index}`).click();
    await expect(page.locator(".evidence-detail")).toContainText(
      "No approved study",
    );
    if (index === 1) {
      await page.goBack();
      await expect(page.locator(`#memo-reason-${index}`)).toBeFocused();
      await page.goForward();
      await expect(page.locator(".evidence-question")).toBeFocused();
    }
    await page
      .getByRole("button", { name: "Return to Decision Report" })
      .click();
    await expect(page.locator(`#memo-reason-${index}`)).toBeFocused();
  }
  expect(providerCalls).toEqual([]);
  expect(errors).toEqual([]);
});

test("v6 responsive story and report print have no document overflow or console errors", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    for (const chapter of [
      "case",
      "lab",
      "tournament",
      "time",
      "evidence",
      "report",
    ]) {
      await page.goto(`/?arm=B#${chapter}`);
      await expect(
        page.locator(`.chapter-rail a[href="#${chapter}"]`),
      ).toHaveAttribute("aria-current", "step");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (chapter === "tournament" && width === 1440) {
        const top = await page
          .locator(".tournament-chapter .change-trace")
          .evaluate((element) => element.getBoundingClientRect().top);
        expect(top).toBeLessThan(700);
      }
      if (["case", "tournament", "report", "time"].includes(chapter))
        await page.screenshot({
          path: info.outputPath(`${chapter}-${width}.png`),
          fullPage: true,
        });
      if (chapter === "time") {
        await page
          .getByRole("button", { name: "03 / After", exact: true })
          .click();
        await expect(page.locator(".source-history")).toContainText(
          "UNAVAILABLE",
        );
      }
    }
  }
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".decision-paper")).toBeVisible();
  await expect(page.locator(".research-header")).toBeHidden();
  await expect(page.locator(".memo-inspect").first()).toBeHidden();
  await expect(page.locator(".memo-limits")).toBeVisible();
  await page.screenshot({
    path: info.outputPath("report-print.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("intent revision invalidates conceptual inspection without losing the real workflow", async ({
  page,
}) => {
  await page.goto("/?arm=B&responsibility=Policy&phase=after#lab");
  await expect(
    page.locator(".lab-introduction .trace-focus-label"),
  ).toContainText("B / Policy");
  await page
    .getByRole("button", { name: "Team permissions", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm requirement", exact: true })
    .click();
  await expect(
    page.locator(".lab-introduction .trace-focus-label"),
  ).toContainText("A / Routes");
  await expect(
    page.getByText("Confirmed by you", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".lab-introduction .trace-requirement"),
  ).toContainText("CONFIRMED BY YOU");
  await page.goBack();
  await expect(
    page.locator(".lab-introduction .trace-focus-label"),
  ).toContainText("A / Routes");
});

// Synthetic records stay inside this browser test. They are never served by a
// production route, accepted from the browser, or added to the publication list.
test("all six memo outcomes render with equal dignity from synthetic server DTOs", async ({
  page,
}, info) => {
  const { readFile } = await import("node:fs/promises");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { DecisionMemo } =
    await import("../../src/components/v6/decision-memo");
  const { assessDecisionReport } =
    await import("../../src/lib/report/decision-report");
  const { preparationInclusiveMetrics } =
    await import("../../src/lib/experiment/metrics");
  const { syntheticTournamentView } =
    await import("../support/tournament-view");
  const css = await readFile("src/app/forecode-v6.css", "utf8");
  for (const mode of [
    "no-run",
    "a-only",
    "b-only",
    "both-pass",
    "both-fail",
    "invalid",
  ] as const) {
    const p = syntheticTournamentView();
    p.arms.forEach((arm) => {
      arm.verdict =
        mode === "both-fail" ||
        (mode === "a-only" && arm.variant === "B") ||
        (mode === "b-only" && arm.variant === "A")
          ? "REJECTED"
          : "VERIFIED";
      arm.checks.forEach((check, index) => {
        check.status =
          arm.verdict === "REJECTED" && index === 0 ? "fail" : "pass";
      });
    });
    p.correctness =
      mode === "a-only"
        ? "A_ONLY_VERIFIED"
        : mode === "b-only"
          ? "B_ONLY_VERIFIED"
          : mode === "both-fail"
            ? "BOTH_REJECTED"
            : "BOTH_VERIFIED";
    if (mode === "invalid") {
      p.comparability = "NOT_COMPARABLE";
      p.correctness = "INCONCLUSIVE";
    }
    p.arms.forEach((arm) => {
      arm.total = preparationInclusiveMetrics(arm.preparation, arm.downstream);
    });
    const analysis = assessDecisionReport(p);
    const catalog =
      mode === "no-run"
        ? { state: "empty" as const, reports: [], unavailableCount: 0 }
        : {
            state: "available" as const,
            unavailableCount: 0,
            reports: [
              {
                provenance: "FRESH_APPROVED_TOURNAMENT_LOADER" as const,
                support:
                  analysis.decision === "INCONCLUSIVE"
                    ? ("INCONCLUSIVE" as const)
                    : ("EVIDENCE_SUPPORTED" as const),
                analysis,
              },
            ],
          };
    const html = renderToStaticMarkup(
      createElement(DecisionMemo, {
        catalog,
        studyId: p.studyId,
        projectionSha256: analysis.evidenceReferences?.projectionSha256,
        inspect: () => {},
      }),
    );
    await page.setContent(
      `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif} ${css}</style></head><body>${html}</body></html>`,
    );
    const expected =
      mode === "a-only"
        ? "Keep the current architecture."
        : mode === "b-only"
          ? "Review the prepared architecture."
          : "Insufficient evidence to choose.";
    await expect(page.locator("#memo-headline")).toHaveText(expected);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await expect(page.locator(".memo-facts dt")).toHaveCount(3);
      const headingSize = await page
        .locator("#memo-headline")
        .evaluate((element) => getComputedStyle(element).fontSize);
      expect(parseFloat(headingSize)).toBeGreaterThanOrEqual(40);
      await page.screenshot({
        path: info.outputPath(`synthetic-${mode}-${width}.png`),
        fullPage: true,
      });
    }
  }
});

test("bounded source focus survives chapter and phase selection", async ({
  page,
}) => {
  await page.goto("/#lab");
  await page
    .getByRole("button", {
      name: "Inspect src/server/booking-store.ts",
      exact: true,
    })
    .click();
  await page
    .getByRole("link", { name: "04 Time Machine", exact: true })
    .click();
  await expect(page.locator(".case-context")).toContainText("A / store");
  await page.getByRole("button", { name: "03 / After", exact: true }).click();
  await expect(page.locator(".case-context")).toContainText("A / store");
  await page
    .getByRole("link", { name: "02 Architecture Lab", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Inspect src/server/booking-store.ts",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Post-future-task source", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("skip and within-chapter links preserve their active chapter and focus", async ({
  page,
}) => {
  await page.goto("/#report");
  const skip = page.getByRole("link", { name: "Skip to chapter", exact: true });
  await skip.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".chapter-rail [aria-current]")).toHaveText(
    /Decision Report/,
  );
  await expect(page.locator("#chapter-heading")).toBeFocused();
  await page.goto("/");
  await page.getByRole("link", { name: "How the comparison works" }).click();
  await expect(page.locator("#comparison-explainer")).toBeInViewport();
  await expect(page.locator(".chapter-rail [aria-current]")).toHaveText(/Case/);
  await page.getByRole("button", { name: "Explore the booking case" }).click();
  await page
    .getByRole("link", { name: "Confirm the future requirement" })
    .click();
  await expect(page.getByLabel("Short title")).toBeFocused();
  await expect(page.locator(".chapter-rail [aria-current]")).toHaveText(
    /Architecture Lab/,
  );
  await page.goto("/#evidence-laboratory");
  await expect(page.locator(".chapter-rail [aria-current]")).toHaveText(
    /Evidence Laboratory/,
  );
});
