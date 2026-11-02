import { expect, test, type Page } from "@playwright/test";
import {
  syntheticSourceHistory,
  longSourcePath,
} from "../support/source-history";
import { projectSourcePublication } from "../../src/lib/experiment/source-publication";
import { projectTournamentReplayCatalog } from "../../src/lib/replay";

// Real SSR + hydrateRoot of the production component; no production test route.
// Fixture source strings are serialized data, never imported executable modules.
async function openHydratedSources(page: Page) {
  const { build } = await import("esbuild");
  const { readFile, writeFile, mkdtemp, rm } = await import("node:fs/promises");
  const { createRequire } = await import("node:module");
  const { tmpdir } = await import("node:os");
  const { resolve } = await import("node:path");
  const fixtures = [
    syntheticSourceHistory("one"),
    syntheticSourceHistory("two"),
  ];
  const tournaments = {
    state: "available" as const,
    studies: fixtures.map((f) => f.study),
    unavailableCount: 0,
  };
  const props = {
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
  };
  const nativeLinkPlugin = {
    name: "test-only-native-link",
    setup(builder: import("esbuild").PluginBuild) {
      builder.onResolve({ filter: /^next\/link$/ }, () => ({
        path: "link",
        namespace: "test-link",
      }));
      builder.onLoad({ filter: /.*/, namespace: "test-link" }, () => ({
        contents:
          "export default function Link({href,prefetch,...props}) {return <a href={href} {...props}/>}",
        loader: "jsx",
        resolveDir: process.cwd(),
      }));
    },
  } satisfies import("esbuild").Plugin;
  // Bundle only reviewed app code for SSR. Source bodies enter this function
  // as inert props, never the executable bundle text.
  const serverBundle = await build({
    stdin: {
      contents:
        "import {renderToString} from 'react-dom/server'; import {ResearchExperience} from './src/components/v6/research-experience'; export const render = props => renderToString(<ResearchExperience {...props}/>);",
      loader: "tsx",
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    format: "cjs",
    platform: "node",
    jsx: "automatic",
    alias: { "@": resolve("src") },
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [nativeLinkPlugin],
  });
  const serverDir = await mkdtemp(resolve(tmpdir(), "source-ui-ssr-"));
  let html: string;
  try {
    const serverFile = resolve(serverDir, "render.cjs");
    await writeFile(serverFile, serverBundle.outputFiles[0]!.text, {
      flag: "wx",
    });
    const server = createRequire(import.meta.url)(serverFile) as {
      render: (value: unknown) => string;
    };
    html = server.render(props);
  } finally {
    await rm(serverDir, { recursive: true, force: true });
  }
  const bundle = await build({
    stdin: {
      contents: `import {hydrateRoot} from 'react-dom/client'; import {flushSync} from 'react-dom'; import {ResearchExperience} from './src/components/v6/research-experience';
      const initial = JSON.parse(document.getElementById('synthetic-props').textContent);
      window.sourceHydrationErrors=[];
      const root=hydrateRoot(document.getElementById('fixture'),<ResearchExperience {...initial}/>,{onRecoverableError(error){window.sourceHydrationErrors.push(error.message)}});
      window.replaceSourceCatalog=(catalog)=>flushSync(()=>root.render(<ResearchExperience {...initial} sourceEvidence={catalog}/>));
      window.sourceHarnessReady=true;`,
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
    plugins: [nativeLinkPlugin],
  });
  const css = (
    await Promise.all(
      ["forecode-v6.css", "project-workspaces.css"].map((file) =>
        readFile(`src/app/${file}`, "utf8"),
      ),
    )
  ).join("\n");
  const errors: string[] = [];
  const requests: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.route("**/*", (route) => {
    if (
      route.request().resourceType() !== "document" ||
      !route
        .request()
        .url()
        .startsWith("https://forecode-source-synthetic.invalid/")
    ) {
      requests.push(route.request().url());
      return route.abort();
    }
    return route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0}${css}</style></head><body><p>SYNTHETIC UI TEST ONLY — No experiment occurred.</p><div id="fixture">${html}</div><script id="synthetic-props" type="application/json">${JSON.stringify(props).replaceAll("<", "\\u003c")}</script></body></html>`,
    });
  });
  // Matching SSR/client initial context; URL restoration is exercised afterwards.
  await page.goto("https://forecode-source-synthetic.invalid/");
  await page.addScriptTag({ content: bundle.outputFiles[0]!.text });
  await page.waitForFunction(
    () =>
      (window as unknown as { sourceHarnessReady: boolean }).sourceHarnessReady,
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  const chapter = (name: string) =>
    page.getByRole("link", { name, exact: true }).click();
  await chapter("04 Time Machine");
  return { fixtures, props, errors, requests, chapter };
}

function controls(page: Page) {
  const history = page.locator(".source-history");
  const phase = (name: string) =>
    page
      .getByRole("group", { name: "Source phase" })
      .getByRole("button", { name, exact: true })
      .click();
  const choose = (path: string) =>
    history
      .getByLabel("Disclosed source file", { exact: true })
      .selectOption(path);
  return { history, phase, choose };
}

// Select approaches using the actual production arm controls, scoped to the
// visible replay explorer (the conceptual graph has independent arm controls).
async function selectArm(page: Page, arm: "A" | "B") {
  await page
    .locator(".replay-explorer")
    .getByRole("button", { name: arm === "A" ? /A Keep/ : /B Prepare/ })
    .click();
}

test("synthetic hydrated exact role, study, path and history transitions never retain stale source", async ({
  page,
}) => {
  const { fixtures, errors, requests, chapter } =
    await openHydratedSources(page);
  const { history, phase, choose } = controls(page);
  await selectArm(page, "B");
  await phase("02 / Prepared");
  await choose("src/one-service.ts");
  await expect(history).toContainText("preparation-B");
  await expect(history).toContainText("ONE_B-PREPARED_SENTINEL");
  await history.getByRole("button", { name: "Text", exact: true }).focus();
  await page.keyboard.press("Space");
  await expect(
    history.getByRole("button", { name: "Text", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    history.getByRole("button", { name: "Text", exact: true }),
  ).toBeFocused();
  await expect(history.locator("pre").last()).toHaveText(
    fixtures[0]!.evidence.snapshots[1]!.files.find(
      (f) => f.path === "src/one-service.ts",
    )!.text,
  );
  await selectArm(page, "A");
  await expect(history).toContainText(
    "does not represent an additional preparation run",
  );
  await expect(history).not.toContainText("ONE_B-PREPARED_SENTINEL");
  await choose("src/one-service.ts");
  await expect(history).toContainText("ONE_SHARED-ORIGINAL_SENTINEL");
  await phase("03 / After");
  await choose("src/one-service.ts");
  await expect(history).toContainText("downstream-A");
  await expect(history).toContainText("ONE_A-FINAL_SENTINEL");
  await expect(history).not.toContainText("ONE_B-PREPARED_SENTINEL");
  await selectArm(page, "B");
  await choose("src/one-service.ts");
  await expect(history).toContainText("downstream-B");
  await expect(history).toContainText("ONE_B-FINAL_SENTINEL");
  await expect(history).not.toContainText("ONE_A-FINAL_SENTINEL");
  await phase("01 / Before");
  await choose("src/one-service.ts");
  await expect(history).toContainText("ONE_SHARED-ORIGINAL_SENTINEL");
  await expect(history).not.toContainText("ONE_B-FINAL_SENTINEL");
  await page.goBack();
  await expect(history).toContainText("downstream-B");
  await choose("src/one-service.ts");
  await expect(history).toContainText("ONE_B-FINAL_SENTINEL");
  await page.goForward();
  await expect(history).toContainText("No shared downstream run");
  await chapter("03 Tournament");
  await page
    .getByLabel("Published study")
    .selectOption(fixtures[1]!.study.studyId);
  await chapter("04 Time Machine");
  await choose("src/two-service.ts");
  await expect(history).toContainText("TWO_SHARED-ORIGINAL_SENTINEL");
  await expect(history).not.toContainText("ONE_");
  await expect(
    history.getByLabel("Disclosed source file", { exact: true }),
  ).not.toContainText("src/one-service.ts");
  expect(
    await page.evaluate(
      () => (window as unknown as { sourceExecuted?: boolean }).sourceExecuted,
    ),
  ).toBeUndefined();
  await expect(history.locator("script,img,iframe,a")).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { sourceHydrationErrors: string[] })
          .sourceHydrationErrors,
    ),
  ).toEqual([]);
  expect(errors).toEqual([]);
  expect(requests).toEqual([]);
});

test("synthetic hydrated withdrawal, replacement and intent revision clear prior selection", async ({
  page,
}) => {
  const { fixtures, props, errors, requests, chapter } =
    await openHydratedSources(page);
  const { history, phase, choose } = controls(page);
  await selectArm(page, "B");
  await phase("02 / Prepared");
  await choose("src/one-service.ts");
  await expect(history).toContainText("ONE_B-PREPARED_SENTINEL");
  const immediatelyWithheld = await page.evaluate(() => {
    (
      window as unknown as { replaceSourceCatalog: (c: unknown) => void }
    ).replaceSourceCatalog({
      state: "unavailable",
      evidence: [],
      unavailableCount: 1,
    });
    return document.querySelector(".source-history")?.textContent;
  });
  expect(immediatelyWithheld).not.toContain("ONE_");
  await expect(history).not.toContainText("ONE_");
  await expect(history).toContainText("source disclosures are unavailable");
  await expect(
    history.getByLabel("Disclosed source file", { exact: true }),
  ).toHaveCount(0);
  const replacement = structuredClone(props.sourceEvidence);
  replacement.evidence[0]!.comparisons[0]!.files =
    replacement.evidence[0]!.comparisons[0]!.files.filter(
      (f) => f.path === "src/empty-added.ts",
    );
  await page.evaluate(
    (catalog) =>
      (
        window as unknown as { replaceSourceCatalog: (c: unknown) => void }
      ).replaceSourceCatalog(catalog),
    replacement,
  );
  await expect(
    history.getByLabel("Disclosed source file", { exact: true }),
  ).toHaveValue("src/empty-added.ts");
  await expect(history).toContainText("Empty file");
  await expect(history).not.toContainText("ONE_B-PREPARED_SENTINEL");
  const partialPublication = structuredClone(fixtures[0]!.publication);
  partialPublication.snapshots = partialPublication.snapshots.filter(
    (snapshot) => snapshot.role !== "shared-original",
  );
  const partialEvidence = projectSourcePublication(
    partialPublication,
    fixtures[0]!.study,
    partialPublication.reportSha256,
  );
  await page.evaluate(
    (catalog) =>
      (
        window as unknown as { replaceSourceCatalog: (c: unknown) => void }
      ).replaceSourceCatalog(catalog),
    {
      ...props.sourceEvidence,
      evidence: [partialEvidence, props.sourceEvidence.evidence[1]!],
    },
  );
  await choose("src/one-service.ts");
  await expect(history).toContainText("source comparison is unavailable");
  await expect(history).toContainText("ONE_B-PREPARED_SENTINEL");
  await expect(history).not.toContainText("ONE_SHARED-ORIGINAL_SENTINEL");
  await expect(
    history.getByRole("button", { name: "Diff", exact: true }),
  ).toHaveCount(0);
  await page.evaluate(
    (catalog) =>
      (
        window as unknown as { replaceSourceCatalog: (c: unknown) => void }
      ).replaceSourceCatalog(catalog),
    props.sourceEvidence,
  );
  await choose("src/one-service.ts");
  await chapter("02 Architecture Lab");
  await page
    .getByRole("button", { name: "Team permissions", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm requirement", exact: true })
    .click();
  await chapter("04 Time Machine");
  await expect(history).toContainText("A / before");
  await expect(history).not.toContainText("ONE_B-PREPARED_SENTINEL");
  await selectArm(page, "B");
  await phase("03 / After");
  await choose("src/one-service.ts");
  await chapter("02 Architecture Lab");
  await page
    .getByRole("button", { name: "Edit Team permissions", exact: true })
    .click();
  await page
    .getByLabel("Short title", { exact: true })
    .fill("Revised source requirement");
  await page
    .getByRole("button", { name: "Confirm revision", exact: true })
    .click();
  await chapter("04 Time Machine");
  await expect(history).toContainText("A / before");
  await expect(history).not.toContainText("ONE_B-FINAL_SENTINEL");
  await chapter("02 Architecture Lab");
  await page
    .getByRole("button", {
      name: "Revoke Revised source requirement",
      exact: true,
    })
    .click();
  await chapter("04 Time Machine");
  await expect(history).toContainText("A / before");
  await expect(history).not.toContainText("ONE_B-FINAL_SENTINEL");
  expect(fixtures[0]!.study.studyId).toBe(
    props.sourceEvidence.evidence[0]!.studyId,
  );
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { sourceHydrationErrors: string[] })
          .sourceHydrationErrors,
    ),
  ).toEqual([]);
  expect(errors).toEqual([]);
  expect(requests).toEqual([]);
});

for (const width of [390, 768, 1440])
  test(`synthetic hydrated source keyboard and bounded layout at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    const { errors, requests } = await openHydratedSources(page);
    const { history, phase, choose } = controls(page);
    await selectArm(page, "B");
    await phase("02 / Prepared");
    await choose("src/one-service.ts");
    const text = history.getByRole("button", { name: "Text", exact: true });
    await text.focus();
    await page.keyboard.press("Enter");
    await expect(text).toBeFocused();
    expect(
      await text.evaluate((e) => getComputedStyle(e).outlineStyle),
    ).not.toBe("none");
    await page.keyboard.press("Tab");
    await expect(history.locator("pre").first()).toBeFocused();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const code = history.locator("pre").last();
    expect(await code.evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(
      true,
    );
    await history.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath(`source-${width}.png`),
      fullPage: true,
    });
    const fileSelect = history.getByLabel("Disclosed source file", {
      exact: true,
    });
    await fileSelect.focus();
    await expect(fileSelect).toBeFocused();
    await page.keyboard.press("Tab");
    const diffButton = history.getByRole("button", {
      name: "Diff",
      exact: true,
    });
    await expect(diffButton).toBeFocused();
    await page.keyboard.press("Space");
    await expect(diffButton).toHaveAttribute("aria-pressed", "true");
    await choose(longSourcePath);
    await expect(history.getByRole("heading", { level: 3 })).toContainText(
      longSourcePath,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await history.screenshot({
      path: testInfo.outputPath(`source-inspector-${width}.png`),
    });
    await choose("src/empty-added.ts");
    await expect(history).toContainText("Empty file");
    await choose("src/undisclosed.ts");
    await history.getByRole("button", { name: "Diff", exact: true }).click();
    await expect(history).toContainText("Exact text diff unavailable");
    await choose("src/too-large.ts");
    await expect(history).toContainText("Exact diff exceeds");
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { sourceHydrationErrors: string[] })
            .sourceHydrationErrors,
      ),
    ).toEqual([]);
    expect(errors).toEqual([]);
    expect(requests).toEqual([]);
  });

test("production source catalog remains unprovisioned", async ({ page }) => {
  await page.goto("/#time");
  await expect(page.locator(".source-history")).toContainText(
    "Source text is not provisioned",
  );
  await expect(page.locator(".source-history pre")).toHaveCount(0);
});
