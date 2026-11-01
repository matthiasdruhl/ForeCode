import { expect, it } from "vitest";
import ts from "typescript";
import { spawnSync } from "node:child_process";
import { proposeAwaitedAuthorizationInstrumentation } from "../../scripts/evaluator/booking-v1/authorization-proposal.mjs";
const source = `import assert from 'node:assert/strict';
export async function runTeamOracle(kind,rpc){
 const reject=async fn=>{try{await fn();assert.fail('synthetic');}catch(e){assert.ok(e);}};
 if(kind==='team-permissions-domain'){
  await reject(()=>rpc({synthetic:'expectation-remains-private'}));
  for(const x of [1,2])await reject(()=>rpc(x));
 }
 if(kind==='team-permissions-http'){await reject(()=>rpc('synthetic'));}
 if(kind==='team-permissions-adversarial')await reject(()=>rpc('synthetic'));
 await reject(()=>rpc('unguarded'));
}`;
it("prepares only literal guarded, already awaited nonloop helper calls and restores original exact bytes", () => {
  const result = proposeAwaitedAuthorizationInstrumentation(ts, source);
  expect(result.mapping.map((m) => m.checkId)).toEqual([
    "team-permissions-domain",
    "team-permissions-http",
    "team-permissions-adversarial",
  ]);
  expect(result.mapping.map((m) => m.caseId)).toEqual([
    "rejection-site-001",
    "rejection-site-002",
    "rejection-site-003",
  ]);
  expect(result.restorationVerified).toBe(true);
  expect(result.additionalAwaitBookkeeping).toBe(true);
  expect(JSON.stringify(result.mapping)).not.toContain("expectation");
  expect(
    result.patch
      .filter((p) => p.before)
      .every((p) => p.after.includes(p.before)),
  ).toBe(true);
  expect(result.source).toContain(
    "for(const x of [1,2])await reject(()=>rpc(x));",
  );
  expect(result.source).toContain("await reject(()=>rpc('unguarded'));");
});
it("supports exact reviewed site selection without renumbering or inferring permission semantics", () => {
  const result = proposeAwaitedAuthorizationInstrumentation(ts, source, [
    "rejection-site-003",
  ]);
  expect(result.mapping.map((m) => m.caseId)).toEqual(["rejection-site-003"]);
  expect(result.classification).toBe("UNCLASSIFIED_REJECTION_SITE_CANDIDATES");
  expect(result.source).toContain(
    "await reject(()=>rpc({synthetic:'expectation-remains-private'}));",
  );
  for (const selection of [
    [],
    ["unknown"],
    ["rejection-site-001", "rejection-site-001"],
  ])
    expect(() =>
      proposeAwaitedAuthorizationInstrumentation(ts, source, selection),
    ).toThrow();
});
it("refuses awaited argument expressions and emits syntactically valid ESM for nested awaited callbacks", () => {
  const unsafe = source.replace(
    "reject(()=>rpc('synthetic'))",
    "reject(await rpc('synthetic'))",
  );
  expect(() => proposeAwaitedAuthorizationInstrumentation(ts, unsafe)).toThrow(
    "arguments require separate review",
  );
  const nested = source.replace(
    "reject(()=>rpc('synthetic'))",
    "reject(async()=>await rpc('synthetic'))",
  );
  const result = proposeAwaitedAuthorizationInstrumentation(ts, nested);
  const parsed = spawnSync(
    process.execPath,
    ["--check", "--input-type=module"],
    { input: result.source, encoding: "utf8", timeout: 5000, maxBuffer: 8192 },
  );
  expect(parsed.status, parsed.stderr).toBe(0);
});
it("refuses value-used await results instead of changing the original helper result", () => {
  const valueUsed = `import assert from 'node:assert/strict';
export async function runTeamOracle(kind,rpc){
  const reject=async()=>{assert.ok(true);return 7;};
  if(kind==='team-permissions-domain'){const observed=await reject();assert.equal(observed,7);}
}
await runTeamOracle('team-permissions-domain',()=>{});`;
  const original = spawnSync(process.execPath, ["--input-type=module"], {
    input: valueUsed,
    encoding: "utf8",
    timeout: 5000,
    maxBuffer: 8192,
  });
  expect(original.status, original.stderr).toBe(0);
  expect(() =>
    proposeAwaitedAuthorizationInstrumentation(ts, valueUsed),
  ).toThrow("standalone");
});
it.each([
  source.replace("export async function", "export function"),
  source.replace("const reject=async", "const reject="),
  source.replace("kind,rpc", "kind,rpc,other"),
  source.replace(
    "const reject=",
    "const forecodeObserveAuthorizationCase=1;const reject=",
  ),
  source.replaceAll("kind==='team-permissions-", "kind!=='team-permissions-"),
  source
    .replace("assert.ok(e)", "void e")
    .replace("assert.fail('synthetic')", "void 0"),
  source + "\n???",
])("refuses unsupported proposed transformations", (value) => {
  expect(() => proposeAwaitedAuthorizationInstrumentation(ts, value)).toThrow();
});
