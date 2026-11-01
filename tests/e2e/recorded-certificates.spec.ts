import { disabledOrigin } from "../support/browser-origins";
import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { build } from "esbuild";
import { RecordedCertificatesView } from "../../src/components/recorded-certificates";
import { canonicalJson } from "../../src/lib/report/canonical";
import { syntheticCertificateCatalog } from "../support/certificate-browser";

test("navigate the empty certificate boundary with keyboard and no provider", async ({
  page,
  request,
}, testInfo) => {
  const calls: string[] = [];
  page.on("request", (r) => {
    if (
      r.method() !== "GET" ||
      !["localhost", "127.0.0.1"].includes(new URL(r.url()).hostname)
    )
      calls.push(r.url());
  });
  await page.goto("/");
  await page.getByRole("link", { name: "Recorded certificates" }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/certificates$/);
  await expect(
    page.getByRole("heading", {
      name: "No approved recorded certificates available.",
    }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "The current modeled comparison has no linked measured experiment.",
      { exact: false },
    ),
  ).toBeVisible();
  await expect(page.locator("button, form, input, textarea")).toHaveCount(0);
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("link", { name: "Back to workspace" }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`certificates-empty-${width}.png`),
      fullPage: true,
    });
  }
  await page.reload();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to recorded certificates" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await page.getByRole("link", { name: "Recorded verification" }).click();
  await expect(
    page.getByRole("heading", {
      name: "No approved recorded evidence available",
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Recorded certificates" }).click();
  await page.getByRole("link", { name: "Back to workspace" }).click();
  await expect(page.getByLabel("Short title")).toBeVisible();
  expect(calls).toEqual([]);
  const response = await request.get(`${disabledOrigin}/api/demo`);
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(await response.json()).toEqual({
    schemaVersion: "demo.v1",
    runs: [],
    certificates: [],
    mode: "recorded",
  });
  const disabled = await request.get(`${disabledOrigin}/certificates`);
  expect(disabled.status()).toBe(200);
  expect(disabled.headers()["cache-control"]).toContain("no-store");
  expect(await disabled.text()).not.toContain("synthetic-secret");
  for (const endpoint of [
    "/api/certificates",
    "/api/evidence",
    "/api/recordings",
  ])
    expect((await request.get(endpoint)).status()).toBe(404);
  expect((await request.post("/api/demo")).status()).toBe(422);
});

test("synthetic populated certificates are scoped, inert and responsive", async ({
  page,
}, testInfo) => {
  const catalog = syntheticCertificateCatalog();
  const css = await readFile("src/app/globals.css", "utf8");
  await page.setContent(
    `<!doctype html><html lang="en"><head><style>${css}</style></head><body>${renderToStaticMarkup(createElement(RecordedCertificatesView, { catalog }))}</body></html>`,
  );
  for (const report of catalog.reports) {
    await expect(
      page.locator(`#certificate-${report.certificate.id}`),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: `Export certificate ${report.certificate.id} as JSON`,
      }),
    ).toBeVisible();
  }
  await expect(
    page.getByText("VERIFIED · scoped", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("REJECTED", { exact: true })).toHaveCount(2);
  await expect(
    page.getByText("INSUFFICIENT_EVIDENCE", { exact: true }),
  ).toHaveCount(2);
  await expect(page.getByText("Unknown", { exact: true })).toHaveCount(3);
  expect(await page.locator("img, script, form, input, textarea").count()).toBe(
    0,
  );
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`certificates-synthetic-${width}.png`),
      fullPage: true,
    });
  }
  const summary = page
    .getByText("Exact source references and limitations", { exact: true })
    .first();
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByText("run-synthetic-0", { exact: true }).first(),
  ).toBeVisible();
});

// Bundle/mount the actual client export control only in an isolated test document.
// esbuild is already supplied by the existing tsx toolchain. Nothing enters src
// or production configuration; responses below are visibly synthetic mocks.
test("fresh export downloads exact bytes and blocks stale, missing and failed retrievals", async ({
  page,
}) => {
  const catalog = syntheticCertificateCatalog();
  const certificate = catalog.demo.certificates[0]!;
  const bundle = await build({
    stdin: {
      contents: `import { createElement } from 'react'; import { createRoot } from 'react-dom/client'; import { CertificateExport } from './src/components/certificate-export'; createRoot(document.getElementById('export-root')).render(createElement(CertificateExport, ${JSON.stringify({ id: certificate.id, digest: certificate.artifactSha256 })}));`,
      resolveDir: process.cwd(),
      loader: "tsx",
    },
    bundle: true,
    write: false,
    platform: "browser",
    format: "iife",
    define: { "process.env.NODE_ENV": '"production"' },
  });
  await page.goto("/certificates");
  await page.setContent(
    '<!doctype html><html lang="en"><body><h1>Synthetic export test only</h1><div id="export-root"></div></body></html>',
  );
  let mode: "available" | "missing" | "changed" | "failed" = "available";
  let requests = 0;
  let release: (() => void) | undefined;
  await page.route("**/api/demo", async (route) => {
    requests++;
    expect(route.request().method()).toBe("GET");
    if (release === undefined)
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    if (mode === "failed") return route.fulfill({ status: 500, body: "{}" });
    const demo =
      mode === "available"
        ? catalog.demo
        : mode === "missing"
          ? { ...catalog.demo, runs: [], certificates: [] }
          : {
              ...catalog.demo,
              certificates: [
                { ...certificate, artifactSha256: "f".repeat(64) },
              ],
            };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(demo),
    });
  });
  await page.addScriptTag({ content: bundle.outputFiles[0]!.text });
  const button = page.getByRole("button", {
    name: `Export certificate ${certificate.id} as JSON`,
  });
  const downloaded = page.waitForEvent("download");
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(button).toBeDisabled();
  await expect.poll(() => requests).toBe(1);
  await expect.poll(() => Boolean(release)).toBe(true);
  release!();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe(`${certificate.id}.json`);
  const bytes = await readFile((await download.path())!, "utf8");
  expect(bytes).toBe(canonicalJson(certificate));
  expect(bytes).not.toMatch(
    /evidencePath|PRIVATE_SENTINEL|synthetic-secret|stdout|stderr/,
  );
  await expect(page.getByRole("status")).toHaveText(
    "Certificate snapshot downloaded.",
  );
  let extraDownloads = 0;
  page.on("download", () => extraDownloads++);
  for (const next of ["missing", "changed", "failed"] as const) {
    mode = next;
    await button.click();
    await expect(page.getByRole("status")).toHaveText(
      "Certificate unavailable or changed. Reload this page before exporting.",
    );
    await expect(button).toBeEnabled();
  }
  expect(requests).toBe(4);
  expect(extraDownloads).toBe(0);
});
