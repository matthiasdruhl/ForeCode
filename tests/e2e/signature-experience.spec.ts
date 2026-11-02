import { expect, test } from "@playwright/test";

test("keyboard stage selection retains arm, source, phase and report evidence focus through history", async ({
  page,
}) => {
  const errors: string[] = [];
  const providerCalls: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.url().includes("/api/foresight"))
      providerCalls.push(request.url());
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?arm=B&source=store&phase=after&stage=coding#time");
  const stages = page.getByRole("navigation", {
    name: "Replay stage",
    exact: true,
  });
  await expect(
    stages.getByRole("button", { name: /03 Coding/ }),
  ).toHaveAttribute("aria-pressed", "true");
  const verification = stages.getByRole("button", {
    name: /04 Independent verification/,
  });
  await verification.focus();
  await page.keyboard.press("Enter");
  await expect(verification).toHaveAttribute("aria-pressed", "true");
  await expect(verification).toBeFocused();
  await expect(page).toHaveURL(/stage=verification/);
  await expect(page.locator(".case-context")).toContainText(
    "B / store · after",
  );
  await page
    .getByRole("link", { name: "06 Decision Report", exact: true })
    .click();
  await expect(page.locator("#chapter-heading")).toBeFocused();
  await page.locator("#memo-observations").focus();
  await page.keyboard.press("Space");
  await expect(page.locator(".evidence-question")).toBeFocused();
  await expect(page.locator(".evidence-detail")).toContainText(
    "No approved study",
  );
  await page.getByRole("button", { name: "Return to Decision Report" }).click();
  await expect(page.locator("#memo-observations")).toBeFocused();
  await page
    .getByRole("link", { name: "04 Time Machine", exact: true })
    .click();
  await expect(verification).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".case-context")).toContainText(
    "B / store · after",
  );
  await page.goBack();
  await page.goBack();
  await page.goBack();
  await page.goBack();
  await page.goBack();
  await expect(
    stages.getByRole("button", { name: /03 Coding/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.goForward();
  await expect(verification).toHaveAttribute("aria-pressed", "true");
  expect(
    await verification.evaluate(
      (element) => getComputedStyle(element).transitionDuration,
    ),
  ).toBe("0s");
  expect(errors).toEqual([]);
  expect(providerCalls).toEqual([]);
});

test("direct links validate stages and never substitute missing replay evidence", async ({
  page,
}) => {
  await page.goto(
    "/?stage=untrusted&event=replay:another-study:check#evidence",
  );
  await expect(page.locator(".focused-replay-evidence")).toContainText(
    "unavailable in this approved study",
  );
  await page
    .getByRole("link", { name: "04 Time Machine", exact: true })
    .click();
  await expect(
    page
      .getByRole("navigation", { name: "Replay stage" })
      .getByRole("button", { name: /02 Preparation/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("group", { name: "Source phase" })
    .getByRole("button", { name: "02 / Prepared", exact: true })
    .click();
  await expect(
    page
      .getByRole("navigation", { name: "Replay stage" })
      .getByRole("button", { name: /02 Preparation/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: /A Keep the current architecture/ })
    .focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".case-context")).toContainText(
    "A / Routes · prepared",
  );
  await page.getByText("How to read the evidence", { exact: true }).focus();
  await page.keyboard.press("Enter");
  for (const label of [
    "Conceptual path",
    "Reviewed source",
    "Recorded comparison",
    "Independent observation",
    "Unknown / unavailable",
  ])
    await expect(
      page.locator(".provenance-key dt").filter({ hasText: label }),
    ).toBeVisible();
  await expect(page.locator(".replay-explorer")).not.toContainText("synthetic");
});

// Bundle the real client component into a disposable test-only document. No
// fixture endpoint, outcome switch, synthetic catalog or bundler ships in src.
test("synthetic populated journey preserves exact event focus and restores the requested study before selection", async ({
  page,
}) => {
  const { build } = await import("esbuild");
  const { readFile } = await import("node:fs/promises");
  const { resolve } = await import("node:path");
  const { syntheticTournamentView } =
    await import("../support/tournament-view");
  const { projectTournamentReplayCatalog } =
    await import("../../src/lib/replay");
  const { assessDecisionReport } =
    await import("../../src/lib/report/decision-report");
  const { preparationInclusiveMetrics } =
    await import("../../src/lib/experiment/metrics");
  const studies = ["one", "two"].map((name) => {
    const study = syntheticTournamentView();
    study.studyId += `-${name}`;
    study.title = `Synthetic study ${name} — UI test only`;
    study.futureProblem = `Synthetic study ${name}: delegated booking permissions.`;
    study.arms.forEach((arm) => {
      arm.total = preparationInclusiveMetrics(arm.preparation, arm.downstream);
    });
    return study;
  });
  const props = {
    configuration: {
      status: "disabled",
      model: null,
      endpoint: "https://api.meta.ai/v1/chat/completions",
    },
    tournaments: { state: "available", studies, unavailableCount: 0 },
    reports: {
      state: "available",
      unavailableCount: 0,
      reports: studies.map((study) => ({
        provenance: "FRESH_APPROVED_TOURNAMENT_LOADER",
        support: "EVIDENCE_SUPPORTED",
        analysis: assessDecisionReport(study),
      })),
    },
    replays: projectTournamentReplayCatalog({
      state: "available",
      studies,
      unavailableCount: 0,
    }),
  };
  const bundle = await build({
    stdin: {
      contents: `import {createRoot} from 'react-dom/client'; import {ResearchExperience} from './src/components/v6/research-experience'; createRoot(document.getElementById('fixture')).render(<ResearchExperience {...${JSON.stringify(props)}} />);`,
      loader: "tsx",
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    jsx: "automatic",
    minify: true,
    alias: { "@": resolve("src") },
    define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" },
    plugins: [
      {
        name: "test-only-native-link",
        setup(builder) {
          builder.onResolve({ filter: /^next\/link$/ }, () => ({
            path: "link",
            namespace: "test-link",
          }));
          builder.onLoad({ filter: /.*/, namespace: "test-link" }, () => ({
            contents:
              "export default function Link({href, prefetch, ...props}) { return <a href={href} {...props}/> }",
            loader: "jsx",
            resolveDir: process.cwd(),
          }));
        },
      },
    ],
  });
  const css = await readFile("src/app/forecode-v6.css", "utf8");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const unexpectedRequests: string[] = [];
  await page.route("**/*", (route) => {
    if (
      route.request().resourceType() !== "document" ||
      !route.request().url().startsWith("http://forecode-synthetic.invalid/")
    ) {
      unexpectedRequests.push(route.request().url());
      return route.abort();
    }
    return route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0}${css}</style></head><body><p>SYNTHETIC UI TEST ONLY — No experiment occurred.</p><div id="fixture"></div></body></html>`,
    });
  });
  const url =
    "http://forecode-synthetic.invalid/?study=synthetic-ui-study-two&arm=B&source=store&phase=after&stage=coding#time";
  await page.goto(url);
  await page.addScriptTag({ content: bundle.outputFiles[0]!.text });
  await expect(page.locator(".case-context")).toContainText(
    "synthetic-ui-study-two",
  );
  await expect(page.locator(".case-context")).toContainText(
    "B / store · after",
  );
  const event = props.replays.replays[1]!.events.find(
    (item) => item.data.kind === "coding_attempt" && item.variant === "B",
  )!;
  const trigger = page.locator(`[id="inspect-${event.id}"]`);
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".focused-replay-evidence")).toContainText(
    event.id,
  );
  await expect(page.locator(".focused-replay-evidence")).toContainText(
    "synthetic-run-B",
  );
  await expect(page).toHaveURL(/event=replay/);
  await page
    .getByRole("link", { name: "06 Decision Report", exact: true })
    .click();
  await expect(page.locator(".memo-subject")).toContainText(
    studies[1]!.futureProblem,
  );
  await expect(page.locator("#memo-headline")).toHaveText(
    "Review the prepared architecture.",
  );
  await page
    .getByRole("link", { name: "05 Evidence Laboratory", exact: true })
    .click();
  await expect(page.locator(".focused-replay-evidence")).toContainText(
    event.id,
  );
  await expect(page).toHaveURL(/question=source/);
  await page.goBack();
  await page.goBack();
  await page.getByRole("button", { name: "Return to Time Machine" }).click();
  await expect(trigger).toBeFocused();
  await expect(
    page
      .getByRole("navigation", { name: "Replay stage" })
      .getByRole("button", { name: /03 Coding/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("link", { name: "03 Tournament", exact: true }).click();
  await page.getByLabel("Published study").selectOption(studies[0]!.studyId);
  await page
    .getByRole("link", { name: "04 Time Machine", exact: true })
    .click();
  await expect(page.locator(".case-context")).toContainText(
    studies[0]!.studyId,
  );
  await expect(page.locator(".case-context")).toContainText(
    "A / Routes · before",
  );
  await expect(page).not.toHaveURL(/event=/);
  await page.goBack();
  await page.goBack();
  await expect(page.locator(".case-context")).toContainText(
    studies[1]!.studyId,
  );
  await expect(page.locator(".case-context")).toContainText(
    "B / store · after",
  );
  expect(errors).toEqual([]);
  expect(unexpectedRequests).toEqual([]);
});
