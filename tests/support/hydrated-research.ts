import type { Page } from "@playwright/test";
import type { ComponentProps } from "react";
import type { ResearchExperience } from "../../src/components/v6/research-experience";
// Test-only real SSR/hydration of reviewed app source; no fixture production route.
export async function openHydratedResearch(
  page: Page,
  props: ComponentProps<typeof ResearchExperience>,
) {
  const { build } = await import("esbuild");
  const { readFile, writeFile, mkdtemp, rm } = await import("node:fs/promises");
  const { createRequire } = await import("node:module");
  const { tmpdir } = await import("node:os");
  const { resolve } = await import("node:path");
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
  const serverDir = await mkdtemp(resolve(tmpdir(), "history-ui-ssr-"));
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
      window.historyHydrationErrors=[];
      const root=hydrateRoot(document.getElementById('fixture'),<ResearchExperience {...initial}/>,{onRecoverableError(error){window.historyHydrationErrors.push(error.message)}});
      window.replaceHistorySourceCatalog=(catalog)=>flushSync(()=>root.render(<ResearchExperience {...initial} sourceEvidence={catalog}/>));
      window.historyHarnessReady=true;`,
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
        .startsWith("https://forecode-history-synthetic.invalid/")
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
  await page.goto("https://forecode-history-synthetic.invalid/");
  await page.addScriptTag({ content: bundle.outputFiles[0]!.text });
  await page.waitForFunction(
    () =>
      (window as unknown as { historyHarnessReady: boolean })
        .historyHarnessReady,
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  const chapter = (name: string) =>
    page.getByRole("link", { name, exact: true }).click();
  await chapter("03 Tournament");
  return { props, errors, requests, chapter };
}
