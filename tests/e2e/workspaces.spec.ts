import { expect, test, type Page } from "@playwright/test";

const shelf = (page: Page) => page.locator(".workspace-manager");
async function showShelf(page: Page) {
  const manager = shelf(page);
  if (!(await manager.evaluate((node) => (node as HTMLDetailsElement).open)))
    await manager.locator("summary").first().click();
}
async function save(page: Page, name: string, local = false) {
  await showShelf(page);
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
  await expect(shelf(page).getByRole("status")).toContainText(
    "Workspace saved",
  );
}

test("local workspace reopens source, exploration, drafts and notes after reload then renames and deletes", async ({
  page,
}, info) => {
  const requests: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("request", (request) =>
    requests.push(request.url() + (request.postData() ?? "")),
  );
  await page.goto("/#projects");
  await page.getByLabel("Choose source files").setInputFiles([
    {
      name: "index.ts",
      mimeType: "text/plain",
      buffer: Buffer.from(
        "import { helper } from './helper'; export const workspaceMarker1823 = helper;",
      ),
    },
    {
      name: "helper.ts",
      mimeType: "text/plain",
      buffer: Buffer.from("export const helper = 42;"),
    },
  ]);
  await page.getByRole("button", { name: "Import selected files" }).click();
  await page
    .getByRole("button", { name: "Open index.ts", exact: true })
    .click();
  await page.getByLabel("Search project files").fill("index");
  await showShelf(page);
  await page
    .getByLabel("Workspace notes", { exact: true })
    .fill("Review helper boundary next.");
  await page
    .getByLabel("Project requirement drafts", { exact: true })
    .fill("Support a second tenant.");
  await save(page, "Tenant exploration", true);
  await expect(
    page.getByLabel("Store project source on this device", { exact: true }),
  ).not.toBeChecked();
  await page.reload();
  await showShelf(page);
  await page
    .getByRole("button", {
      name: "Open workspace Tenant exploration",
      exact: true,
    })
    .click();
  await expect(page.getByLabel("Source code")).toContainText(
    "workspaceMarker1823",
  );
  await expect(page.getByLabel("Search project files")).toHaveValue("index");
  await showShelf(page);
  await expect(page.getByLabel("Workspace notes", { exact: true })).toHaveValue(
    "Review helper boundary next.",
  );
  await expect(
    page.getByLabel("Project requirement drafts", { exact: true }),
  ).toHaveValue("Support a second tenant.");
  await expect(
    page.getByLabel("I understand this workspace is saved on this device", {
      exact: true,
    }),
  ).not.toBeChecked();
  await expect(
    page.getByLabel("Store project source on this device", { exact: true }),
  ).not.toBeChecked();
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width);
    await page.screenshot({
      path: info.outputPath(`workspace-${width}.png`),
      fullPage: true,
    });
  }
  await page
    .getByRole("button", {
      name: "Rename workspace Tenant exploration",
      exact: true,
    })
    .click();
  await page
    .getByLabel("New workspace name", { exact: true })
    .fill("Tenant review");
  await page.screenshot({
    path: info.outputPath("workspace-rename-390.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Save name", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Tenant review", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Delete workspace Tenant review",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Keep workspace", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Tenant review", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Delete workspace Tenant review",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Confirm delete", exact: true })
    .click();
  await expect(shelf(page)).toContainText(
    "No saved workspaces on this device.",
  );
  expect(
    requests.some(
      (request) =>
        request.includes("workspaceMarker1823") ||
        request.includes("/api/foresight"),
    ),
  ).toBe(false);
  expect(errors).toEqual([]);
});

test("restored booking requirements require reconfirmation and sharing approval is absent", async ({
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
    .getByLabel("Short title", { exact: true })
    .fill("Unconfirmed capacity draft");
  await page
    .getByLabel("What needs to change?", { exact: true })
    .fill("Allow multiple resources per booking.");
  await save(page, "Booking research");
  await page.reload();
  await showShelf(page);
  await page
    .getByRole("button", {
      name: "Open workspace Booking research",
      exact: true,
    })
    .click();
  await expect(page.getByLabel("Short title", { exact: true })).toHaveValue(
    "Unconfirmed capacity draft",
  );
  await expect(
    page.getByLabel("What needs to change?", { exact: true }),
  ).toHaveValue("Allow multiple resources per booking.");
  await expect(
    page.getByRole("heading", {
      name: "Restored requirement drafts",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.locator(".sharing-review").getByRole("checkbox"),
  ).not.toBeChecked();
  await expect(
    page.getByRole("button", { name: "Propose A / B", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Load draft: Team permissions", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm requirement", exact: true })
    .click();
  await expect(
    page.locator(".sharing-review").getByRole("checkbox"),
  ).not.toBeChecked();
  await expect(
    page.getByRole("button", { name: "Propose A / B", exact: true }),
  ).toBeDisabled();
});

test("malformed and oversized saved records are reported and can be removed without touching other storage", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("unrelated-setting", "preserve");
    localStorage.setItem("forecode.workspace.v1:malformed", "{invalid");
    localStorage.setItem(
      "forecode.workspace.v1:oversized",
      "x".repeat(2 * 1024 * 1024 + 1),
    );
  });
  await showShelf(page);
  await expect(shelf(page).getByRole("alert")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.screenshot({
    path: info.outputPath("workspace-error-390.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Remove all saved workspaces", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm remove all", exact: true })
    .click();
  await expect(shelf(page).getByRole("status")).toContainText(
    "All saved workspaces removed",
  );
  expect(
    await page.evaluate(() => localStorage.getItem("unrelated-setting")),
  ).toBe("preserve");
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((key) =>
        key.startsWith("forecode.workspace.v1:"),
      ),
    ),
  ).toEqual([]);
});

test("unavailable device storage shows a useful error", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("Blocked", "SecurityError");
      },
    });
  });
  await page.goto("/");
  await showShelf(page);
  await expect(shelf(page).getByRole("alert")).toContainText(
    /unavailable|Blocked|storage/i,
  );
});

test("replacing source invalidates permission to persist the selected files", async ({
  page,
}) => {
  await page.goto("/#projects");
  await page.getByLabel("Choose source files").setInputFiles({
    name: "first.ts",
    mimeType: "text/plain",
    buffer: Buffer.from("export const first = true;"),
  });
  await page
    .getByRole("button", { name: "Import selected files", exact: true })
    .click();
  await showShelf(page);
  await page
    .getByLabel("Workspace name", { exact: true })
    .fill("Replacement test");
  await page
    .getByLabel("I understand this workspace is saved on this device", {
      exact: true,
    })
    .check();
  await page
    .getByLabel("Store project source on this device", { exact: true })
    .check();
  await expect(
    page.getByRole("button", { name: "Save workspace", exact: true }),
  ).toBeEnabled();
  await page.getByLabel("Choose source files").setInputFiles({
    name: "second.ts",
    mimeType: "text/plain",
    buffer: Buffer.from("export const second = true;"),
  });
  await page
    .getByRole("button", { name: "Import selected files", exact: true })
    .click();
  await showShelf(page);
  await expect(
    page.getByLabel("Store project source on this device", { exact: true }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("button", { name: "Save workspace", exact: true }),
  ).toBeDisabled();
});

test("a stale file read cannot replace a reopened workspace or clear its drafts", async ({
  page,
}) => {
  await page.goto("/#projects");
  await page.getByLabel("Choose source files").setInputFiles({
    name: "saved.ts",
    mimeType: "text/plain",
    buffer: Buffer.from("export const saved = true;"),
  });
  await page
    .getByRole("button", { name: "Import selected files", exact: true })
    .click();
  await expect(page.getByLabel("Source code")).toContainText(
    "export const saved",
  );
  await showShelf(page);
  await page
    .getByLabel("Workspace notes", { exact: true })
    .fill("Preserve these notes");
  await page
    .getByLabel("Project requirement drafts", { exact: true })
    .fill("Preserve this draft");
  await save(page, "Race control", true);
  expect(
    await page.evaluate(() => {
      const key = Object.keys(localStorage).find((item) =>
        item.startsWith("forecode.workspace.v1:"),
      )!;
      return JSON.parse(localStorage.getItem(key)!).snapshot.notes;
    }),
  ).toBe("Preserve these notes");
  await page.evaluate(() => {
    const original = File.prototype.text;
    File.prototype.text = function () {
      if (this.name !== "delayed.ts") return original.call(this);
      return new Promise<string>((resolve) => {
        (window as unknown as { releaseRead: () => void }).releaseRead = () =>
          resolve("export const stale = true;");
      });
    };
  });
  await page.getByLabel("Choose source files").setInputFiles({
    name: "delayed.ts",
    mimeType: "text/plain",
    buffer: Buffer.from("export const stale = true;"),
  });
  await page
    .getByRole("button", { name: "Import selected files", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Reading selected files…", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Open workspace Race control", exact: true })
    .click();
  await expect(page.getByLabel("Source code")).toContainText(
    "export const saved",
  );
  await page.evaluate(async () => {
    (window as unknown as { releaseRead: () => void }).releaseRead();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await expect(shelf(page).getByRole("status")).toContainText(
    "Workspace reopened",
  );
  await expect(page.getByLabel("Source code")).toContainText(
    "export const saved",
  );
  await expect(page.getByLabel("Workspace notes", { exact: true })).toHaveValue(
    "Preserve these notes",
  );
  await expect(
    page.getByLabel("Project requirement drafts", { exact: true }),
  ).toHaveValue("Preserve this draft");
});

for (const navigation of ["inspect", "return"] as const) {
  test(`pending saved-local open is cancelled by ${navigation} evidence navigation`, async ({
    page,
  }) => {
    const parserChunks = new Set<string>();
    const heldRequests: string[] = [];
    const errors: string[] = [];
    const providerCalls: string[] = [];
    let discoverParser = false;
    let holdParser = false;
    let releaseParser = () => {};
    const parserGate = new Promise<void>((resolve) => {
      releaseParser = resolve;
    });
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (request.url().includes("/api/foresight"))
        providerCalls.push(request.url());
    });
    // Learn the production build's actual lazy chunk URLs during an explicit
    // import. Routing disables HTTP cache; the reload below clears module state.
    // No application hook, fake module or hardcoded build hash is involved.
    await page.route("**/_next/static/chunks/**", async (route) => {
      const request = route.request();
      if (discoverParser && request.resourceType() === "script")
        parserChunks.add(request.url());
      if (holdParser && parserChunks.has(request.url())) {
        heldRequests.push(request.url());
        await parserGate;
      }
      await route.continue();
    });
    try {
      await page.goto("/#projects");
      await page.getByLabel("Choose source files").setInputFiles({
        name: "saved-race.ts",
        mimeType: "text/plain",
        buffer: Buffer.from("export const savedWorkspaceRaceMarker = true;"),
      });
      discoverParser = true;
      await page
        .getByRole("button", { name: "Import selected files", exact: true })
        .click();
      await expect(page.getByLabel("Source code")).toContainText(
        "savedWorkspaceRaceMarker",
      );
      discoverParser = false;
      expect(parserChunks.size).toBeGreaterThan(0);
      await save(page, "Pending local reopen", true);
      await page
        .getByRole("link", { name: "06 Decision Report", exact: true })
        .click();
      await page.reload();
      await expect(page.locator("#chapter-heading")).toHaveText(
        "Decision Report",
      );
      if (navigation === "return") {
        await page.locator("#memo-observations").click();
        await expect(page.locator("#chapter-heading")).toHaveText(
          "Evidence Laboratory",
        );
      }
      await showShelf(page);
      await page
        .getByLabel("Workspace notes", { exact: true })
        .fill("Keep the current booking notes while navigating.");
      holdParser = true;
      await page
        .getByRole("button", {
          name: "Open workspace Pending local reopen",
          exact: true,
        })
        .click();
      await expect.poll(() => heldRequests.length).toBeGreaterThan(0);
      await expect(shelf(page).getByRole("status")).toHaveText(
        "Updating saved workspaces…",
      );
      if (navigation === "inspect")
        await page.locator("#memo-observations").click();
      else
        await page
          .getByRole("button", { name: "Return to Decision Report" })
          .click();
      const destination =
        navigation === "inspect" ? "Evidence Laboratory" : "Decision Report";
      await expect(page.locator("#chapter-heading")).toHaveText(destination);
      releaseParser();
      // Wait for the pending open to finish, then verify it did not override
      // the user's newer navigation or replace the current workspace data.
      await expect(shelf(page).getByRole("status")).not.toHaveText(
        "Updating saved workspaces…",
      );
      await expect(page.locator("#chapter-heading")).toHaveText(destination);
      await expect(page).toHaveURL(
        navigation === "inspect" ? /#evidence$/ : /#report$/,
      );
      await expect(shelf(page).getByRole("alert")).toContainText(
        "Opening was cancelled",
      );
      await expect(
        page.getByLabel("Workspace notes", { exact: true }),
      ).toHaveValue("Keep the current booking notes while navigating.");
      await expect(page.getByLabel("Source code")).toHaveCount(0);
      expect(errors).toEqual([]);
      expect(providerCalls).toEqual([]);
    } finally {
      releaseParser();
      await page.unrouteAll({ behavior: "wait" });
    }
  });
}
