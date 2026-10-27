// Loaded only by the explicit Playwright server command, outside the app build.
// Even a missed browser route mock cannot reach Meta or spend money. There is no
// production env flag or public endpoint that installs this test adapter.
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, options) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
    return Promise.reject(
      new Error("Synthetic browser tests block all external fetches."),
    );
  }
  return originalFetch(input, options);
};
