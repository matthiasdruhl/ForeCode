import { expect, test } from "@playwright/test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const marker = "LOCAL_SOURCE_MUST_NEVER_LEAVE_BROWSER_87109";
let repository: string;
test.beforeAll(async () => {
  repository = await mkdtemp(path.join(os.tmpdir(), "forecode-local-project-"));
  const files: Record<string, string> = {
    "tsconfig.json": JSON.stringify({
      compilerOptions: { baseUrl: ".", paths: { "@/*": ["src/*"] } },
    }),
    "src/app/page.tsx": `import { book } from '@/booking'; import type { Booking } from '../types'; import './missing'; import 'react';
const target = './variable'; void import(target);
(globalThis as unknown as { importedSourceRan: boolean }).importedSourceRan = true;
export const Page = () => '${marker}' + book();`,
    "src/booking.ts": "export const book = () => 'available';",
    "src/types.ts": "export type Booking = { id: string };",
    ".env.local": "MUST_NOT_BE_READ=secret",
    "node_modules/pkg/index.ts":
      "throw new Error('dependency must not be read');",
    ".git/config": "credential-must-not-be-read",
    "dist/built.ts": "build output must not be read",
    "private-key.pem": "credential must not be read",
    "README.md": "Unsupported documentation is not read",
  };
  for (const [name, source] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(repository, name)), { recursive: true });
    await writeFile(path.join(repository, name), source);
  }
});
test.afterAll(async () => {
  await rm(repository, { recursive: true, force: true });
});

test("local import previews exclusions, parses inert source and explores dependencies without disclosure", async ({
  page,
}, info) => {
  const sent: string[] = [];
  const errors: string[] = [];
  page.on("request", (request) =>
    sent.push(request.url() + (request.postData() ?? "")),
  );
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const original = File.prototype.text;
    const host = window as unknown as { sourceReads: string[] };
    host.sourceReads = [];
    File.prototype.text = function () {
      host.sourceReads.push(this.webkitRelativePath || this.name);
      return original.call(this);
    };
  });
  await page.goto("/#projects");
  await page.locator("input[webkitdirectory]").setInputFiles(repository);
  await expect(page.getByText(".env.local", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { sourceReads: string[] }).sourceReads,
    ),
  ).toEqual([]);
  await expect(page.locator(".project-review-summary")).toContainText(
    "1 unsupported",
  );
  await page.getByRole("button", { name: "Import selected files" }).click();
  await page
    .getByRole("button", { name: "Open src/app/page.tsx", exact: true })
    .click();
  await expect(
    page
      .getByRole("button", {
        name: "Inspect src/app/page.tsx in graph",
        exact: true,
      })
      .first(),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Inspect src/app/page.tsx in graph",
      exact: true,
    })
    .first()
    .click();
  await expect(page.getByLabel("Source code")).toContainText(marker);
  await page.locator(".project-file-notes summary").click();
  await expect(page.locator(".project-file-notes")).toContainText(
    "Unresolved local import",
  );
  await expect(page.locator(".project-file-notes")).toContainText(
    "Dynamic import expression is unsupported",
  );
  await expect(
    page.getByLabel("External and unresolved dependencies"),
  ).toContainText("react");
  const graphBooking = page.getByRole("button", {
    name: "Inspect src/booking.ts in graph",
    exact: true,
  });
  await graphBooking.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".project-source-heading h4")).toBeFocused();
  await expect(page.getByLabel("Source code")).toContainText(
    "export const book",
  );
  await page
    .locator(".project-dependencies")
    .getByRole("button", { name: "src/app/page.tsx", exact: true })
    .click();
  await expect(page.getByLabel("Source code")).toContainText(marker);
  await page.getByLabel("Search project files").fill("booking");
  await expect(
    page.getByRole("button", { name: "Open src/booking.ts", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open src/app/page.tsx", exact: true }),
  ).toBeHidden();
  await page.getByLabel("Search project files").fill("");
  expect(
    await page.evaluate(
      () =>
        (globalThis as unknown as { importedSourceRan?: boolean })
          .importedSourceRan,
    ),
  ).toBeUndefined();
  const reads = await page.evaluate(
    () => (window as unknown as { sourceReads: string[] }).sourceReads,
  );
  expect(reads).toHaveLength(4);
  expect(
    reads.some((name) => /\.env|node_modules|\.git|dist|\.pem/.test(name)),
  ).toBe(false);
  expect(sent.some((request) => request.includes(marker))).toBe(false);
  expect(sent.some((request) => request.includes("/api/foresight"))).toBe(
    false,
  );
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect
      .poll(async () => {
        const graph = await page.locator(".project-graph-scroll").boundingBox();
        const selected = await page
          .locator(".project-graph-node.is-selected")
          .boundingBox();
        return (
          !!graph &&
          !!selected &&
          selected.x >= graph.x &&
          selected.x + selected.width <= graph.x + graph.width
        );
      })
      .toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`local-project-${width}.png`),
      fullPage: true,
    });
  }
  await page
    .getByRole("link", { name: "02 Architecture Lab", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Inspect the booking boundary." }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "07 Local Projects", exact: true })
    .click();
  await expect(page.getByLabel("Source code")).toContainText(marker);
  expect(errors).toEqual([]);
});

test("file selection supports review exclusions and local search", async ({
  page,
}) => {
  await page.goto("/#projects");
  await page.getByLabel("Choose source files").setInputFiles([
    {
      name: "index.ts",
      mimeType: "text/plain",
      buffer: Buffer.from(
        "import { helper } from './helper'; export const app = helper;",
      ),
    },
    {
      name: "helper.ts",
      mimeType: "text/plain",
      buffer: Buffer.from("export const helper = 42;"),
    },
    {
      name: "unused.ts",
      mimeType: "text/plain",
      buffer: Buffer.from("export const unused = true;"),
    },
  ]);
  await page.getByLabel("Include unused.ts", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Import selected files" }).click();
  await page.getByLabel("Search project files").fill("helper");
  await expect(
    page.getByRole("button", { name: "Open helper.ts", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open index.ts", exact: true }),
  ).toBeHidden();
  await page
    .getByRole("button", { name: "Open helper.ts", exact: true })
    .click();
  await expect(page.getByLabel("Source code")).toContainText(
    "export const helper = 42;",
  );
  await page.getByLabel("Search project files").fill("");
  await expect(
    page.getByRole("button", { name: "Open unused.ts", exact: true }),
  ).toHaveCount(0);
});

test("unsupported directory selection falls back to files and preserves inert text", async ({
  page,
}) => {
  await page.addInitScript(() => {
    delete (HTMLInputElement.prototype as unknown as Record<string, unknown>)
      .webkitdirectory;
  });
  await page.goto("/#projects");
  await expect(page.getByRole("button", { name: "Choose folder" })).toHaveCount(
    0,
  );
  await expect(
    page.getByText("Folder selection is unavailable here.", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("Choose source files").setInputFiles([
    {
      name: "index.ts",
      mimeType: "text/plain",
      buffer: Buffer.from(
        'export const text = "<img src=x onerror=alert(1)>";',
      ),
    },
    {
      name: "index.ts",
      mimeType: "text/plain",
      buffer: Buffer.from("export const duplicate = true;"),
    },
    {
      name: "large.ts",
      mimeType: "text/plain",
      buffer: Buffer.alloc(512 * 1024 + 1, 32),
    },
    {
      name: ".env.local",
      mimeType: "text/plain",
      buffer: Buffer.from("SECRET=private"),
    },
  ]);
  await expect(
    page.getByText("Duplicate path; choose a folder", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("Over the 512.0 KB per-file limit", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Import selected files" }).click();
  await expect(page.getByLabel("Source code")).toContainText(
    "<img src=x onerror=alert(1)>",
  );
  await expect(page.getByLabel("Source code").locator("img")).toHaveCount(0);
  await page.getByLabel("Source code").focus();
  await expect(page.getByLabel("Source code")).toBeFocused();
  await page
    .getByRole("button", { name: "Clear project", exact: true })
    .click();
  await expect(page.getByLabel("Source code")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "A source map, from your files." }),
  ).toBeVisible();
});

test("binary source fails safely and leaves selection available for correction", async ({
  page,
}) => {
  await page.goto("/#projects");
  await page.getByLabel("Choose source files").setInputFiles([
    {
      name: "binary.ts",
      mimeType: "text/plain",
      buffer: Buffer.from("export const value = '\0';"),
    },
    {
      name: "safe.ts",
      mimeType: "text/plain",
      buffer: Buffer.from("export const safe = true;"),
    },
  ]);
  await page.getByRole("button", { name: "Import selected files" }).click();
  await expect(page.locator(".project-error[role=alert]")).toContainText(
    "contains binary data",
  );
  await expect(page.getByLabel("Source code")).toHaveCount(0);
  await page.getByLabel("Include binary.ts", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Import selected files" }).click();
  await expect(page.getByLabel("Source code")).toContainText(
    "export const safe = true;",
  );
});

test("switching project context revokes booking payload approval", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Team permissions", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm requirement", exact: true })
    .click();
  await page.locator(".sharing-review").getByRole("checkbox").check();
  await page
    .getByRole("link", { name: "07 Local Projects", exact: true })
    .click();
  await page
    .getByRole("link", { name: "02 Architecture Lab", exact: true })
    .click();
  await expect(
    page.locator(".sharing-review").getByRole("checkbox"),
  ).not.toBeChecked();
  await expect(
    page.getByRole("button", { name: "Propose A / B", exact: true }),
  ).toBeDisabled();
});
