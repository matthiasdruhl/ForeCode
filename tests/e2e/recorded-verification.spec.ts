import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RecordedVerificationView } from "../../src/components/recorded-verification";
import type {
  RecordedCatalogView,
  RecordedVerification,
} from "../../src/server/artifacts/recorded-verification";

test("navigate to honest read-only history without intents or provider calls", async ({
  page,
}, testInfo) => {
  const calls: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() !== "GET" ||
      !new URL(request.url()).hostname.match(/^(127\.0\.0\.1|localhost)$/)
    )
      calls.push(request.url());
  });
  await page.goto("/");
  const link = page.getByRole("link", { name: "Recorded verification" });
  await expect(link).toBeVisible();
  await link.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/experiments$/);
  await expect(
    page.getByRole("heading", {
      name: "No approved recorded evidence available",
    }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "The current modeled comparison has no linked measured experiment.",
      { exact: false },
    ),
  ).toBeVisible();
  await expect(
    page.getByText("Recordings are not provisioned.", { exact: false }),
  ).toBeVisible();
  await expect(page.locator("button, form, input, textarea")).toHaveCount(0);
  expect(await page.locator("body").innerText()).not.toContain(
    "VERIFIED · scoped",
  );
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
      path: testInfo.outputPath(`empty-${width}.png`),
      fullPage: true,
    });
  }
  await page.reload();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to recorded evidence" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await page.getByRole("link", { name: "Back to workspace" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Short title")).toBeVisible();
  await expect(page.getByText("No confirmed requirements yet.")).toBeVisible();
  expect(calls).toEqual([]);
});

test("history is available on the provider-disabled server and does not create an evidence API", async ({
  page,
  request,
}) => {
  const response = await page.goto("http://127.0.0.1:3102/experiments");
  expect(response?.status()).toBe(200);
  expect(response?.headers()["cache-control"]).toContain("no-store");
  await expect(
    page.getByRole("heading", {
      name: "No approved recorded evidence available",
    }),
  ).toBeVisible();
  const repeated = await request.get("http://127.0.0.1:3102/experiments");
  expect(repeated.status()).toBe(200);
  expect(await repeated.text()).not.toContain("synthetic-secret");
  for (const endpoint of ["/api/demo", "/api/experiments", "/api/recordings"])
    expect((await request.get(endpoint)).status()).toBe(404);
});

// Component-only browser setup: synthetic public projections rendered directly
// into an isolated document, never via production catalog/env/route injection.
// Separate unit integrations load real temporary bytes through the protected store.
function syntheticView(
  id: string,
  verdict: RecordedVerification["verdict"],
): RecordedVerification {
  return {
    state: "available",
    id,
    title: `Synthetic ${verdict} — test only`,
    presentation: "recorded",
    category: "infrastructure_acceptance",
    scope: "Synthetic fixed check scope only.",
    runId: `run-${id}`,
    receiptId: `receipt-${id}`,
    verificationId: `verify-${id}`,
    runStatus: "completed",
    verdict,
    checks: [
      {
        id: "required-check",
        label: "Synthetic required check",
        description: '<img src=x onerror="window.injected=true">',
        required: true,
        status: verdict === "REJECTED" ? "fail" : "pass",
        artifactSha256: "a".repeat(64),
      },
      {
        id: "required-other",
        label: "Synthetic other check",
        description: "Synthetic requirement only.",
        required: true,
        status: verdict === "VERIFIED" ? "pass" : "missing",
        artifactSha256: null,
      },
      {
        id: "optional",
        label: "Synthetic optional check",
        description: "No substitute for a required result.",
        required: false,
        status: "pass",
        artifactSha256: null,
      },
    ],
    metrics: [
      { name: "elapsedMs", value: 0 },
      { name: "tokens", value: null },
      { name: "costUsd", value: 0 },
      { name: "iterations", value: null },
      { name: "filesTouched", value: null },
    ],
    identities: [{ name: "evaluatedTreeSha256", sha256: "b".repeat(64) }],
    limitations: ["Synthetic component test only, never actual measurements."],
  };
}

test("synthetic populated states stay scoped, inert, responsive and keyboard-readable", async ({
  page,
}, testInfo) => {
  const catalog: RecordedCatalogView = {
    state: "configured",
    recordings: [
      syntheticView("verified", "VERIFIED"),
      syntheticView("rejected", "REJECTED"),
      syntheticView("insufficient", "INSUFFICIENT_EVIDENCE"),
      {
        state: "unavailable",
        id: "missing",
        title: "Synthetic unavailable — test only",
      },
    ],
  };
  const styles = await readFile("src/app/globals.css", "utf8");
  await page.setContent(
    `<!doctype html><html lang="en"><head><title>Synthetic component test</title><style>${styles}</style></head><body>${renderToStaticMarkup(createElement(RecordedVerificationView, { catalog }))}</body></html>`,
  );
  await expect(
    page.getByText("VERIFIED · scoped", { exact: true }),
  ).toBeVisible();
  for (const id of ["verified", "rejected", "insufficient"]) {
    const article = page
      .getByRole("article")
      .filter({ has: page.locator(`#recording-${id}`) });
    await expect(article.getByText("completed", { exact: true })).toBeVisible();
    await expect(article.getByText("Unknown", { exact: true })).toHaveCount(3);
    await expect(article.locator("dd").filter({ hasText: /^0$/ })).toHaveCount(
      2,
    );
    await expect(
      article.getByText("Required · missing", { exact: true }),
    ).toHaveCount(id === "verified" ? 0 : 1);
  }
  await expect(
    page.getByRole("article", { name: "Unavailable recording missing" }),
  ).toContainText("No trusted verdict is available");
  await expect(page.locator("img, script, button, form, input")).toHaveCount(0);
  expect(await page.evaluate(() => "injected" in window)).toBe(false);
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`synthetic-${width}.png`),
      fullPage: true,
    });
  }
  const summary = page
    .getByText("Approved integrity identities", { exact: true })
    .first();
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByText("b".repeat(64), { exact: true }).first(),
  ).toBeVisible();
  await expect(summary).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByText("b".repeat(64), { exact: true }).first(),
  ).toBeHidden();
});
