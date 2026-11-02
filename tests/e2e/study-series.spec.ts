import { expect, test } from "@playwright/test";
import { openHydratedResearch } from "../support/hydrated-research";
import { syntheticSourceHistory } from "../support/source-history";
import { projectTournamentReplayCatalog } from "../../src/lib/replay";

function inputs() {
  const fixtures = [
    syntheticSourceHistory("one"),
    syntheticSourceHistory("two"),
  ];
  const negative = syntheticSourceHistory("negative").study;
  negative.correctness = "BOTH_REJECTED";
  negative.comparability = "NOT_COMPARABLE";
  negative.arms[0]!.status = "cancelled";
  negative.arms[1]!.status = "failed";
  negative.attempts[0]!.status = "cancelled";
  negative.attempts[1]!.status = "failed";
  negative.arms[1]!.verdict = "REJECTED";
  negative.arms[1]!.checks[0]!.status = "fail";
  const incomplete = syntheticSourceHistory("incomplete").study;
  incomplete.correctness = "INCONCLUSIVE";
  incomplete.comparability = "INSUFFICIENT_EVIDENCE";
  incomplete.arms[1]!.status = "not_run";
  incomplete.arms[1]!.runId = null;
  incomplete.arms[1]!.receiptId = null;
  incomplete.arms[1]!.verdict = "INSUFFICIENT_EVIDENCE";
  incomplete.arms[1]!.checks.forEach((check) => {
    check.status = "not_run";
  });
  const tournaments = {
    state: "available" as const,
    studies: [...fixtures.map((f) => f.study), negative, incomplete],
    unavailableCount: 2,
  };
  return {
    fixtures,
    props: {
      configuration: {
        status: "disabled" as const,
        model: null,
        endpoint: "https://api.meta.ai/v1/chat/completions",
      },
      tournaments,
      reports: { state: "empty" as const, reports: [], unavailableCount: 0 },
      replays: projectTournamentReplayCatalog(tournaments),
      sourceEvidence: {
        state: "available" as const,
        evidence: fixtures.map((f) => f.evidence),
        unavailableCount: 0,
      },
    },
  };
}

test("hydrated history selects the exact study and retains arm/check, history, intent and source invalidation", async ({
  page,
}) => {
  const { fixtures, props } = inputs();
  const { chapter, errors, requests } = await openHydratedResearch(page, props);
  const history = page.locator(".study-series");
  await expect(history).toContainText("4 approved loaded studies");
  await expect(history).toContainText("2 unavailable publications");
  await expect(history.locator(".study-series-list > li")).toHaveCount(4);
  await expect(history).toContainText("cancelled");
  await expect(history).toContainText("not_run");
  await expect(history).toContainText("BOTH_REJECTED");
  const inspect = history.getByRole("button", {
    name: `Inspect study ${fixtures[1]!.study.studyId}`,
    exact: true,
  });
  await inspect.focus();
  await page.keyboard.press("Enter");
  await expect(inspect).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(
    new RegExp(`study=${fixtures[1]!.study.studyId}`),
  );
  await expect(page.getByLabel("Published study")).toHaveValue(
    fixtures[1]!.study.studyId,
  );
  await page.goBack();
  await expect(
    history.getByRole("button", {
      name: `Inspect study ${fixtures[0]!.study.studyId}`,
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.goForward();
  await expect(inspect).toHaveAttribute("aria-pressed", "true");
  const exactUrl = page.url();
  await page.getByLabel("Published study").evaluate((element) => {
    const select = element as HTMLSelectElement;
    select.value = "not-a-loaded-study";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(page).toHaveURL(exactUrl);
  await chapter("04 Time Machine");
  await page
    .locator(".replay-explorer")
    .getByRole("button", { name: /B Prepare/ })
    .click();
  await page
    .getByRole("group", { name: "Source phase" })
    .getByRole("button", { name: "03 / After" })
    .click();
  const source = page.locator(".source-history");
  await source
    .getByLabel("Disclosed source file", { exact: true })
    .selectOption("src/two-service.ts");
  await expect(source).toContainText("TWO_B-FINAL_SENTINEL");
  await page.goBack();
  await expect(source).toContainText("shared-original");
  await expect(source).not.toContainText("TWO_B-FINAL_SENTINEL");
  await page.goForward();
  await expect(source).toContainText("downstream-B");
  await source
    .getByLabel("Disclosed source file", { exact: true })
    .selectOption("src/two-service.ts");
  await expect(source).toContainText("TWO_B-FINAL_SENTINEL");
  await chapter("03 Tournament");
  await history
    .getByRole("button", {
      name: `Inspect study ${fixtures[0]!.study.studyId}`,
      exact: true,
    })
    .click();
  await chapter("04 Time Machine");
  await expect(source).toContainText("A / before");
  await expect(source).not.toContainText("TWO_");
  await source
    .getByLabel("Disclosed source file", { exact: true })
    .selectOption("src/one-service.ts");
  await expect(source).toContainText("ONE_SHARED-ORIGINAL_SENTINEL");
  await page.evaluate(() =>
    (
      window as unknown as {
        replaceHistorySourceCatalog: (value: unknown) => void;
      }
    ).replaceHistorySourceCatalog({
      state: "unavailable",
      evidence: [],
      unavailableCount: 1,
    }),
  );
  await expect(source).not.toContainText("ONE_");
  await expect(source).toContainText("source disclosures are unavailable");
  await chapter("06 Decision Report");
  const status = page.getByRole("complementary", {
    name: "Evidence feedback availability",
  });
  await expect(status).toContainText(fixtures[0]!.study.studyId);
  await expect(status).not.toContainText(fixtures[1]!.study.studyId);
  await expect(status.locator("button,input,form")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Inspect checks & receipt bindings" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Independent checks & receipts" }),
  ).toBeVisible();
  await expect(page.locator(".evidence-question")).toContainText(
    fixtures[0]!.study.studyId,
  );
  await chapter("02 Architecture Lab");
  await page
    .getByRole("button", { name: "Team permissions", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm requirement", exact: true })
    .click();
  await chapter("04 Time Machine");
  await expect(source).toContainText("A / before");
  await chapter("06 Decision Report");
  await expect(status).toContainText("no available linked interpretation");
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { historyHydrationErrors: string[] })
          .historyHydrationErrors,
    ),
  ).toEqual([]);
  expect(errors).toEqual([]);
  expect(requests).toEqual([]);
});

for (const width of [390, 768, 1440])
  test(`hydrated study history and feedback keyboard/layout at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    const { props } = inputs();
    const { chapter, errors, requests } = await openHydratedResearch(
      page,
      props,
    );
    const history = page.locator(".study-series");
    const row = history.locator(".study-series-list > li").first();
    const summary = row.locator("summary");
    await summary.focus();
    await page.keyboard.press("Space");
    await expect(row.locator("details")).toHaveAttribute("open", "");
    expect(
      await summary.evaluate((e) => getComputedStyle(e).outlineStyle),
    ).not.toBe("none");
    await page.keyboard.press("Tab");
    await expect(row.locator(".study-series-scroll").first()).toBeFocused();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    if (width === 390)
      expect(
        await row
          .locator(".study-series-scroll")
          .first()
          .evaluate((e) => e.scrollWidth > e.clientWidth),
      ).toBe(true);
    await history.screenshot({
      path: testInfo.outputPath(`study-history-${width}.png`),
    });
    await chapter("06 Decision Report");
    await expect(page.locator(".evidence-feedback-status")).toContainText(
      "not yet installed",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page
      .locator(".evidence-feedback-status")
      .screenshot({ path: testInfo.outputPath(`feedback-${width}.png`) });
    expect(errors).toEqual([]);
    expect(requests).toEqual([]);
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { historyHydrationErrors: string[] })
            .historyHydrationErrors,
      ),
    ).toEqual([]);
  });

test("hydrated one-study history never invents statistical support", async ({
  page,
}) => {
  const { props } = inputs();
  const one = {
    ...props,
    tournaments: {
      ...props.tournaments,
      studies: [props.tournaments.studies[0]!],
    },
  };
  const first = await openHydratedResearch(page, one);
  await expect(page.locator(".study-series")).toContainText("One study (N=1)");
  expect(first.errors).toEqual([]);
  expect(first.requests).toEqual([]);
});

test("hydrated empty history and report retain distinct unavailable feedback reasons", async ({
  page,
}) => {
  const { props } = inputs();
  const { chapter, errors, requests } = await openHydratedResearch(page, {
    ...props,
    tournaments: { state: "empty", studies: [], unavailableCount: 0 },
    replays: projectTournamentReplayCatalog({
      state: "empty",
      studies: [],
      unavailableCount: 0,
    }),
    sourceEvidence: { state: "empty", evidence: [], unavailableCount: 0 },
  });
  await expect(page.locator(".study-series")).toContainText(
    "No approved studies are loaded",
  );
  await chapter("06 Decision Report");
  await expect(page.locator(".evidence-feedback-status")).toContainText(
    "No approved study is selected",
  );
  await expect(page.locator(".evidence-feedback-status")).toContainText(
    "not yet installed",
  );
  await expect(page.locator(".decision-paper")).toContainText(
    "Insufficient evidence to choose",
  );
  await chapter("03 Tournament");
  await chapter("06 Decision Report");
  expect(errors).toEqual([]);
  expect(requests).toEqual([]);
});

test("production has no configured publications or linked feedback", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (/interpret-evidence|learning|memory|api\.meta\.ai/.test(request.url()))
      requests.push(request.url());
  });
  await page.goto("/#tournament");
  await expect(page.locator(".study-series")).toContainText(
    "No approved studies are loaded",
  );
  await page
    .getByRole("link", { name: "06 Decision Report", exact: true })
    .click();
  await expect(page.locator(".evidence-feedback-status")).toContainText(
    "No approved study is selected",
  );
  await expect(page.locator(".evidence-feedback-status")).toContainText(
    "Unavailable",
  );
  expect(requests).toEqual([]);
});
