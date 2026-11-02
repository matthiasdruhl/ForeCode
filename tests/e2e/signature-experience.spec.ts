import { expect, test, type Page } from "@playwright/test";

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
async function openPopulatedJourney(page: Page) {
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
  const css = (
    await Promise.all(
      ["forecode-v6.css", "project-workspaces.css"].map((file) =>
        readFile(`src/app/${file}`, "utf8"),
      ),
    )
  ).join("\n");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const unexpectedRequests: string[] = [];
  await page.route("**/*", (route) => {
    if (
      route.request().resourceType() !== "document" ||
      !route.request().url().startsWith("https://forecode-synthetic.invalid/")
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
    "https://forecode-synthetic.invalid/?study=synthetic-ui-study-two&arm=B&source=store&phase=after&stage=coding#time";
  await page.goto(url);
  await page.addScriptTag({ content: bundle.outputFiles[0]!.text });
  return { studies, props, errors, unexpectedRequests };
}

test("synthetic populated journey preserves exact event focus and restores the requested study before selection", async ({
  page,
}) => {
  const { studies, props, errors, unexpectedRequests } =
    await openPopulatedJourney(page);
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

test("populated replay selections cannot revive across local workspace restore and booking drafts need new consent", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const { props, errors, unexpectedRequests } =
    await openPopulatedJourney(page);
  const event = props.replays.replays[1]!.events.find(
    (item) => item.data.kind === "coding_attempt" && item.variant === "B",
  )!;
  const manager = page.locator(".workspace-manager");
  const sharingApproval = page.locator(".sharing-review").getByRole("checkbox");
  const chapter = (name: string) =>
    page.getByRole("link", { name, exact: true }).click();
  async function showShelf() {
    if (!(await manager.evaluate((node) => (node as HTMLDetailsElement).open)))
      await manager.locator("summary").first().click();
  }
  async function save(name: string, local = false) {
    await showShelf();
    await page.getByLabel("Workspace name", { exact: true }).fill(name);
    await page
      .getByLabel("I understand this workspace is saved on this device", {
        exact: true,
      })
      .check();
    if (local)
      await page
        .getByLabel("Store project source on this device", { exact: true })
        .check();
    await page
      .getByRole("button", { name: "Save workspace", exact: true })
      .click();
    await expect(manager.getByRole("status")).toContainText("Workspace saved");
  }
  async function inspectCodingEvent() {
    await chapter("04 Time Machine");
    await page
      .getByRole("navigation", { name: "Replay stage" })
      .getByRole("button", { name: /03 Coding/ })
      .click();
    await page.locator(`[id="inspect-${event.id}"]`).click();
    await expect(page.locator(".focused-replay-evidence")).toContainText(
      event.id,
    );
    await expect(page).toHaveURL(/event=replay/);
  }
  async function expectClearedEvidence() {
    await expect(page.locator("#chapter-heading")).toHaveText(
      "Evidence Laboratory",
    );
    // Back can dispatch both popstate and hashchange. Check after both have
    // settled so a second restoration cannot silently revive the old event.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(page.locator(".focused-replay-evidence")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Return to Time Machine" }),
    ).toHaveCount(0);
    await expect(page.locator(".case-context")).toContainText(
      "A / Routes · before",
    );
    await expect(
      page.getByRole("button", {
        name: "Independent checks & receipts",
        exact: true,
      }),
    ).toHaveAttribute("aria-pressed", "true");
  }

  await chapter("02 Architecture Lab");
  await page
    .getByRole("button", { name: "Team permissions", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm requirement", exact: true })
    .click();
  await sharingApproval.check();
  await save("Synthetic booking draft");
  await inspectCodingEvent();

  await chapter("07 Local Projects");
  await expect(page).not.toHaveURL(/event=/);
  await expect(page).toHaveURL(/stage=preparation/);
  await expect(page).toHaveURL(/question=checks/);
  // This boundary crossing has not reopened a workspace or changed the intent
  // revision: project invalidation itself must survive duplicate history events.
  await page.goBack();
  await expectClearedEvidence();
  await page.goForward();
  await expect(page.locator("#chapter-heading")).toHaveText("Local Projects");
  await page.getByLabel("Choose source files").setInputFiles({
    name: "local.ts",
    mimeType: "text/plain",
    buffer: Buffer.from("export const syntheticWorkspaceBoundaryMarker = 42;"),
  });
  await page.getByRole("button", { name: "Import selected files" }).click();
  await expect(page.getByLabel("Source code")).toContainText(
    "syntheticWorkspaceBoundaryMarker",
  );
  await showShelf();
  await page
    .getByLabel("Project requirement drafts", { exact: true })
    .fill("Add a local tenant boundary.");
  await page
    .getByLabel("Workspace notes", { exact: true })
    .fill("Synthetic local notes, unrelated to booking evidence.");
  await save("Synthetic local project", true);
  await chapter("02 Architecture Lab");
  await expect(sharingApproval).not.toBeChecked();
  await inspectCodingEvent();

  await showShelf();
  await page
    .getByRole("button", {
      name: "Open workspace Synthetic local project",
      exact: true,
    })
    .click();
  await expect(manager.getByRole("status")).toContainText("Workspace reopened");
  await expect(page).toHaveURL(/#projects$/);
  await expect(page).not.toHaveURL(/event=/);
  await expect(page).toHaveURL(/stage=preparation/);
  await expect(page.getByLabel("Source code")).toContainText(
    "syntheticWorkspaceBoundaryMarker",
  );
  await expect(
    page.getByLabel("Project requirement drafts", { exact: true }),
  ).toHaveValue("Add a local tenant boundary.");
  await expect(page.getByLabel("Workspace notes", { exact: true })).toHaveValue(
    "Synthetic local notes, unrelated to booking evidence.",
  );
  await expect(
    page.getByLabel("Store project source on this device", { exact: true }),
  ).not.toBeChecked();
  await expect(
    page.getByLabel("I understand this workspace is saved on this device", {
      exact: true,
    }),
  ).not.toBeChecked();
  await page.goBack();
  await expectClearedEvidence();
  await page.goForward();
  await expect(page.locator("#chapter-heading")).toHaveText("Local Projects");

  await page
    .getByRole("button", {
      name: "Open workspace Synthetic booking draft",
      exact: true,
    })
    .click();
  await expect(manager.getByRole("status")).toContainText("Workspace reopened");
  await expect(page.locator("#chapter-heading")).toHaveText("Architecture Lab");
  await expect(
    page.getByRole("heading", {
      name: "Restored requirement drafts",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("No confirmed requirements yet.", { exact: true }),
  ).toBeVisible();
  await expect(sharingApproval).not.toBeChecked();
  await expect(
    page.getByRole("button", { name: "Propose A / B", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Load draft: Team permissions", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm requirement", exact: true })
    .click();
  await expect(sharingApproval).not.toBeChecked();
  await expect(
    page.getByRole("button", { name: "Propose A / B", exact: true }),
  ).toBeDisabled();
  await chapter("04 Time Machine");
  await expect(page).not.toHaveURL(/event=/);
  await expect(page.locator(".case-context")).toContainText(
    "A / Routes · before",
  );
  await expect(
    page
      .getByRole("navigation", { name: "Replay stage" })
      .getByRole("button", { name: /02 Preparation/ }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(errors).toEqual([]);
  expect(unexpectedRequests).toEqual([]);
});
