import { expect, test, type Page, type Route } from "@playwright/test";
import { browserSyntheticResponse } from "../support/foresight";
import type { FlowRequest, Step, ProposeResponse } from "@/lib/foresight/flow";

async function syntheticBrowser(page: Page) {
  const requests: { step: Step; input: FlowRequest }[] = [];
  const pending: { route: Route; step: Step; input: FlowRequest }[] = [];
  let hold = false,
    fail = false,
    hostileText = false;
  async function fulfill(route: Route, step: Step, input: FlowRequest) {
    const output = browserSyntheticResponse(step, input);
    if (hostileText && step === "propose")
      (output as ProposeResponse).candidates[1]!.description =
        "<img src=x onerror=alert('unsafe')> Synthetic advisory text.";
    try {
      await route.fulfill({
        status: fail ? 503 : 200,
        json: fail
          ? {
              schemaVersion: "api-error.v1",
              error: {
                code: "PROVIDER_UNAVAILABLE",
                message: "The model provider is unavailable.",
                requestId: "synthetic-browser-error",
                retryable: true,
              },
            }
          : output,
      });
    } catch (error) {
      // Only deliberately cancelled browser requests may disappear before this
      // explicitly controlled late response. This is not a retry or fallback.
      if (!route.request().failure()) throw error;
    }
  }
  await page.route("**/api/foresight/*", async (route) => {
    const step = new URL(route.request().url()).pathname
      .split("/")
      .at(-1) as Step;
    const input = route.request().postDataJSON() as FlowRequest;
    requests.push({ step, input });
    expect(input.consent).toBe(true);
    if (hold) pending.push({ route, step, input });
    else await fulfill(route, step, input);
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Team permissions", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm requirement", exact: true })
    .click();
  return {
    requests,
    pending,
    hold: (value: boolean) => {
      hold = value;
    },
    fail: (value: boolean) => {
      fail = value;
    },
    hostile: () => {
      hostileText = true;
    },
    release: async () => {
      for (const item of pending.splice(0))
        await fulfill(item.route, item.step, item.input);
    },
  };
}
const sharing = (page: Page) => page.locator(".sharing-review");
async function approveAndSend(page: Page, button: string) {
  await sharing(page).getByRole("checkbox").check();
  await page.getByRole("button", { name: button, exact: true }).click();
}
async function propose(page: Page) {
  await approveAndSend(page, "Propose A / B");
  await expect(
    page.getByRole("heading", { name: "A / B · architecture proposals" }),
  ).toBeVisible();
}
async function hypothesize(page: Page) {
  await propose(page);
  await approveAndSend(page, "Form hypothesis");
  await expect(
    page.getByRole("heading", { name: "One falsifiable hypothesis" }),
  ).toBeVisible();
}

test("synthetic reviewed-context → A/B → hypothesis → challenge requires three separate exact-payload approvals", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const h = await syntheticBrowser(page);
  await expect(
    page.getByRole("heading", { name: "Reviewed booking context" }),
  ).toBeVisible();
  await expect(
    page.getByText("Contributor mode: Meta may use", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Propose A / B", exact: true }),
  ).toBeDisabled();
  await sharing(page)
    .getByText("Review exact outgoing payload", { exact: true })
    .click();
  const firstPayload = await sharing(page)
    .getByLabel("Exact application payload")
    .textContent();
  expect(JSON.parse(firstPayload!)).toMatchObject({
    consent: true,
    graph: { id: "booking-reviewed-20261027" },
  });
  expect(h.requests).toHaveLength(0);
  await propose(page);
  await expect(
    page.getByRole("button", { name: "Form hypothesis", exact: true }),
  ).toBeDisabled();
  expect(h.requests).toHaveLength(1);
  expect(h.requests[0]!.input).toEqual(JSON.parse(firstPayload!));
  await expect(
    page.getByText("0 modeled effort points", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("3 modeled effort points", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("template · template", { exact: false }).first(),
  ).toBeVisible();
  await approveAndSend(page, "Form hypothesis");
  await expect(
    page.getByRole("heading", { name: "One falsifiable hypothesis" }),
  ).toBeVisible();
  await expect(page.getByText("Falsified when", { exact: true })).toBeVisible();
  expect(h.requests).toHaveLength(2);
  await expect(
    page.getByRole("button", { name: "Propose counterexample", exact: true }),
  ).toBeDisabled();
  await approveAndSend(page, "Propose counterexample");
  await expect(
    page.getByRole("heading", { name: "One proposed counterexample" }),
  ).toBeVisible();
  await expect(
    page.getByText("proposed · model_generated_not_heldout", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Acceptance outline" }),
  ).toBeVisible();
  expect(h.requests.map((x) => x.step)).toEqual([
    "propose",
    "hypothesize",
    "challenge",
  ]);
  expect(h.requests[2]!.input).not.toHaveProperty("goal");
  await expect(page.locator(".research-result")).toHaveCount(3);
  expect(await page.locator(".research-result").allTextContents()).not.toEqual(
    expect.arrayContaining([expect.stringContaining("VERIFIED")]),
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("synthetic-complete-flow.png"),
    fullPage: true,
  });
  await page
    .locator(".research-context")
    .screenshot({ path: info.outputPath("synthetic-context.png") });
  await page
    .locator(".research-result")
    .last()
    .screenshot({ path: info.outputPath("synthetic-counterexample.png") });
  expect(errors).toEqual([]);
});

test("intent edit and revocation invalidate results and sharing approval", async ({
  page,
}) => {
  const h = await syntheticBrowser(page);
  await hypothesize(page);
  await sharing(page).getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Edit Team permissions", exact: true })
    .click();
  await expect(page.locator(".research-result")).toHaveCount(0);
  await expect(
    page.getByText("Requirement editing is in progress.", { exact: false }),
  ).toBeVisible();
  await page
    .getByLabel("What needs to change?")
    .fill("Owners may revoke delegated booking cancellation immediately.");
  await page
    .getByRole("button", { name: "Confirm revision", exact: true })
    .click();
  await expect(sharing(page).getByRole("checkbox")).not.toBeChecked();
  await propose(page);
  expect(h.requests.at(-1)!.input.intents[0]!.revision).toBe(2);
  await page
    .getByRole("button", { name: "Revoke Team permissions", exact: true })
    .click();
  await expect(page.locator(".research-result")).toHaveCount(0);
  await expect(sharing(page).getByRole("checkbox")).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Propose A / B", exact: true }),
  ).toBeDisabled();
});

test("goal, selected intent and clear actions discard derived context", async ({
  page,
}) => {
  await syntheticBrowser(page);
  await propose(page);
  await sharing(page).getByRole("checkbox").check();
  await page
    .getByLabel("Research goal", { exact: true })
    .fill("Consider immediate delegation revocation.");
  await expect(page.locator(".research-result")).toHaveCount(0);
  await expect(sharing(page).getByRole("checkbox")).not.toBeChecked();
  await propose(page);
  await page.locator(".intent-selection").getByRole("checkbox").uncheck();
  await expect(page.locator(".research-result")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Propose A / B", exact: true }),
  ).toBeDisabled();
  await page.locator(".intent-selection").getByRole("checkbox").check();
  await propose(page);
  await page
    .getByRole("button", { name: "Clear research / start again" })
    .click();
  await expect(page.locator(".research-result")).toHaveCount(0);
  await expect(sharing(page).getByRole("checkbox")).not.toBeChecked();
});

test("duplicate clicks cannot dispatch twice and obsolete late responses cannot reappear", async ({
  page,
}) => {
  const h = await syntheticBrowser(page);
  h.hold(true);
  await sharing(page).getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Propose A / B", exact: true })
    .evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
  await expect.poll(() => h.requests.length).toBe(1);
  await expect(
    page.getByRole("button", { name: "Waiting for Meta…", exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel("Research goal", { exact: true })
    .fill("A changed context must not resurrect its predecessor.");
  await h.release();
  await expect(page.locator(".research-result")).toHaveCount(0);
  await expect(sharing(page).getByRole("checkbox")).not.toBeChecked();
  h.hold(false);
  await propose(page);
  expect(h.requests).toHaveLength(2);
  expect("goal" in h.requests[1]!.input && h.requests[1]!.input.goal).toBe(
    "A changed context must not resurrect its predecessor.",
  );
});

test("cancel and provider error require fresh deliberate retry approval", async ({
  page,
}) => {
  const h = await syntheticBrowser(page);
  h.hold(true);
  await approveAndSend(page, "Propose A / B");
  await expect.poll(() => h.requests.length).toBe(1);
  await page
    .getByRole("button", { name: "Cancel request", exact: true })
    .click();
  await expect(
    page.getByText("Cancelled locally.", { exact: false }),
  ).toBeVisible();
  await h.release();
  await expect(page.locator(".research-result")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Propose A / B", exact: true }),
  ).toBeDisabled();
  h.hold(false);
  h.fail(true);
  await approveAndSend(page, "Propose A / B");
  await expect(
    page.getByText("PROVIDER_UNAVAILABLE:", { exact: false }),
  ).toBeVisible();
  await expect(sharing(page).getByRole("checkbox")).not.toBeChecked();
  expect(h.requests).toHaveLength(2);
  h.fail(false);
  await propose(page);
  expect(h.requests).toHaveLength(3);
});

test("model text is rendered as inert advisory data", async ({ page }) => {
  const h = await syntheticBrowser(page);
  h.hostile();
  const dialogs: string[] = [];
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });
  await propose(page);
  await expect(
    page.getByText(
      "<img src=x onerror=alert('unsafe')> Synthetic advisory text.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.locator(".research-result img, .research-result script"),
  ).toHaveCount(0);
  expect(dialogs).toEqual([]);
});

test("production API rejects missing consent without browser response injection", async ({
  page,
}) => {
  await page.goto("/");
  // This checks the production route's consent gate with no synthetic response.
  const response = await page.request.post("/api/foresight/propose", {
    headers: { origin: "http://127.0.0.1:3100" },
    data: { consent: false },
  });
  expect(response.status()).toBe(400);
  expect((await response.json()).error.code).toBe("INVALID_REQUEST");
});

test("disabled provider keeps the exact payload review accessible without dispatch", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/foresight/")) requests.push(request.url());
  });
  await page.goto("http://127.0.0.1:3102");
  await page
    .getByRole("button", { name: "Team permissions", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm requirement", exact: true })
    .click();
  await expect(
    page.getByText("Calls unavailable: disabled.", { exact: false }),
  ).toBeVisible();
  await sharing(page)
    .getByText("Review exact outgoing payload", { exact: true })
    .click();
  await expect(
    sharing(page).getByLabel("Exact application payload"),
  ).toContainText("intent.v1");
  await sharing(page).getByRole("checkbox").check();
  await expect(
    page.getByRole("button", { name: "Propose A / B", exact: true }),
  ).toBeDisabled();
  expect(requests).toEqual([]);
});
