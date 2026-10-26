import { realpathSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import { contractCatalog } from "@/lib/contracts/catalog";
import {
  invariant,
  validateResearchContext,
  validateDecision,
  validateReceiptRelationships,
  validatePair,
  validateCertificateReferences,
  validateMetaComparison,
  validateHypothesis,
  validateChallenge,
  validateInterpretation,
  validateProviderBinding,
  type ResearchContext,
} from "@/lib/contracts/validation";
import { canonicalJson } from "@/lib/report/canonical";
import {
  checkArtifactDigest,
  receiptManifestDigest,
  certificateDigest,
} from "@/lib/report/digests";
import type {
  CertificateV1,
  CheckResultV1,
  EvaluatorReceiptV1,
  ExperimentRunV1,
  MetaComparisonManifestV1,
  PairManifestV1,
  VerificationV1,
} from "@/lib/contracts/evidence";
import {
  ScientistEvidenceSummaryV1Schema,
  type MetaHypothesisV1,
  type MetaChallengeV1,
  type ScientistEvidenceSummaryV1,
  type MetaEvidenceInterpretationV1,
} from "@/lib/contracts/scientist";

// Read-only external conformance inputs; none are copied/generated into the entry.
const reference = process.env.PLAN_REFERENCE_ROOT;
if (!reference)
  throw new Error(
    "Set PLAN_REFERENCE_ROOT to the pinned external planning checkout.",
  );
const root = realpathSync(reference);
if (!path.relative(process.cwd(), root).startsWith(`..${path.sep}`))
  throw new Error(
    "Planning reference must remain outside the submitted checkout.",
  );
const expectedSha = "695e68a40b5f5009c9b06b83a1181e18cd6d0223";
execFileSync("git", ["-C", root, "cat-file", "-e", `${expectedSha}^{commit}`]);
const read = (file: string) =>
  JSON.parse(
    execFileSync(
      "git",
      ["-C", root, "show", `${expectedSha}:contracts/${file}`],
      { encoding: "utf8" },
    ),
  );
const specification = read("schemas/forecode-v1.schema.json");
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema(specification, "external-plan");
const positives: Record<string, unknown> = {
  ...read("examples/valid-records.json"),
  ...read("examples/api-valid.json"),
};
// The external examples use edgeless graphs; author a helper-shape sample here.
positives.GraphEdge = {
  from: "module-first",
  to: "module-second",
  kind: "static_import",
};
function visit(value: unknown) {
  if (Array.isArray(value)) {
    for (const item of value) visit(item);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [type, schema] of Object.entries(contractCatalog)) {
    if (positives[type] !== undefined) continue;
    const validator = ajv.getSchema(`external-plan#/$defs/${type}`);
    if (validator?.(value) && schema.safeParse(value).success)
      positives[type] = value;
  }
  for (const child of Object.values(value)) visit(child);
}
visit(read("examples/valid-bundle.json"));
visit(read("examples/scientist-bundle.json"));
visit(read("examples/api-valid.json"));
function mutate(base: unknown, propertyPath: string, value: unknown) {
  const result = structuredClone(base) as Record<string, unknown>;
  const parts = propertyPath.split(".");
  let cursor: Record<string, unknown> = result;
  for (const part of parts.slice(0, -1))
    cursor = cursor[part] as Record<string, unknown>;
  cursor[parts.at(-1)!] = value;
  return result;
}
describe("fresh implementation against the external design", () => {
  it("covers every frozen definition by its published name", () => {
    expect(Object.keys(contractCatalog).sort()).toEqual(
      Object.keys(specification.$defs).sort(),
    );
  });
  for (const [type, schema] of Object.entries(contractCatalog)) {
    it(`${type}: accepts a positive and rejects unknown properties`, () => {
      const positive = positives[type];
      expect(positive, `Missing external input for ${type}`).toBeDefined();
      expect(ajv.getSchema(`external-plan#/$defs/${type}`)!(positive)).toBe(
        true,
      );
      expect(schema.safeParse(positive).success).toBe(true);
      expect(
        schema.safeParse({ ...(positive as object), unexpectedAuthority: true })
          .success,
      ).toBe(false);
    });
  }
  for (const file of ["invalid-records.json", "api-invalid.json"]) {
    const document = read(`examples/${file}`) as {
      cases: { id?: string; type: string; mutation: string; value: unknown }[];
    };
    for (const [index, entry] of document.cases.entries()) {
      it(`${file}:${entry.id ?? index} rejects the published negative`, () => {
        const input = mutate(
          positives[entry.type],
          entry.mutation,
          entry.value,
        );
        expect(
          ajv.getSchema(`external-plan#/$defs/${entry.type}`)!(input),
        ).toBe(false);
        expect(contractCatalog[entry.type]!.safeParse(input).success).toBe(
          false,
        );
      });
    }
  }
});

type ExternalBundle = ResearchContext & {
  checks: CheckResultV1[];
  receipt: EvaluatorReceiptV1;
  verification: VerificationV1;
  run: ExperimentRunV1;
  certificate: CertificateV1;
  pair: PairManifestV1;
  metaComparison: MetaComparisonManifestV1;
  decision: Parameters<typeof validateDecision>[0];
};
const bundle = read("examples/valid-bundle.json") as ExternalBundle;
// External tracked digest fields are explicit placeholders. Populate them only
// in memory for algorithm conformance; never treat them as authenticated data.
bundle.receipt.checkArtifactSha256 = checkArtifactDigest(bundle.checks);
bundle.receipt.integrity.manifestSha256 = receiptManifestDigest(bundle.receipt);
bundle.certificate.artifactSha256 = certificateDigest(bundle.certificate);
function validateBundle(input: ExternalBundle) {
  const context = {
    intents: input.intents,
    graph: input.graph,
    candidates: input.candidates,
    scenarios: input.scenarios,
  };
  validateResearchContext(context);
  validateDecision(input.decision, context);
  invariant(
    canonicalJson(input.checks) === canonicalJson(input.verification.checks),
    "Verification checks differ from source records.",
  );
  invariant(
    input.receipt.checkArtifactSha256 === checkArtifactDigest(input.checks) &&
      input.receipt.integrity.manifestSha256 ===
        receiptManifestDigest(input.receipt),
    "Evidence digest mismatch.",
  );
  invariant(
    input.certificate.artifactSha256 === certificateDigest(input.certificate),
    "Certificate digest mismatch.",
  );
  validateReceiptRelationships(input.receipt, input.verification, input.run);
  validatePair(input.pair, [input.run], input.scenarios);
  validateMetaComparison(input.metaComparison, context, [input.run]);
  validateCertificateReferences(input.certificate, {
    intents: input.intents,
    scenarios: input.scenarios,
    decision: input.decision,
    runs: [input.run],
    verifications: [input.verification],
    receipts: [input.receipt],
  });
}
describe("external semantic regression cases", () => {
  it("accepts the positive linked bundle as synthetic metadata only", () => {
    expect(() => validateBundle(bundle)).not.toThrow();
  });
  for (const entry of read("examples/semantic-negative-cases.json").cases as {
    id: string;
    path: string;
    value: unknown;
  }[]) {
    it(entry.id, () => {
      expect(() =>
        validateBundle(
          mutate(bundle, entry.path, entry.value) as ExternalBundle,
        ),
      ).toThrow();
    });
  }
});

type ScientistBundle = Omit<ResearchContext, "scenarios"> & {
  visibleScenarios: ResearchContext["scenarios"];
  hypotheses: MetaHypothesisV1[];
  challenges: MetaChallengeV1[];
  evidenceSummaries: ScientistEvidenceSummaryV1[];
  interpretations: MetaEvidenceInterpretationV1[];
  provider: unknown;
};
function validateScientistBundle(input: ScientistBundle) {
  const context = { ...input, scenarios: input.visibleScenarios };
  // Parse only the context fields: the external bundle has extra bookkeeping.
  const research = {
    intents: context.intents,
    graph: context.graph,
    candidates: context.candidates,
    scenarios: context.scenarios,
  };
  validateResearchContext(research);
  for (const hypothesis of input.hypotheses) {
    validateHypothesis(hypothesis, research);
    validateProviderBinding(input.provider, hypothesis.provider);
  }
  for (const challenge of input.challenges) {
    validateChallenge(challenge, input.hypotheses, research);
    validateProviderBinding(input.provider, challenge.provider);
  }
  for (const summaryInput of input.evidenceSummaries) {
    const summary = ScientistEvidenceSummaryV1Schema.parse(summaryInput);
    const hypothesis = input.hypotheses.find(
      (item) => item.id === summary.hypothesisId,
    );
    invariant(
      hypothesis && summary.baselineCommit === hypothesis.baselineCommit,
      "Summary hypothesis mismatch.",
    );
    for (const observation of summary.observedChecks)
      invariant(
        summary.runIds.includes(observation.runId),
        "Observation is not in a listed run.",
      );
  }
  for (const interpretation of input.interpretations) {
    const summary = input.evidenceSummaries.find(
      (item) => item.id === interpretation.evidenceSummaryId,
    );
    const hypothesis = input.hypotheses.find(
      (item) => item.id === interpretation.hypothesisId,
    );
    invariant(summary && hypothesis, "Unknown interpretation context.");
    validateInterpretation(interpretation, hypothesis, summary);
    validateProviderBinding(input.provider, interpretation.provider);
  }
}
const scientistBundle = read(
  "examples/scientist-bundle.json",
) as ScientistBundle;
describe("external Meta Scientist semantic regressions", () => {
  it("accepts synthetic proposal metadata without authenticating any evidence", () => {
    expect(() => validateScientistBundle(scientistBundle)).not.toThrow();
  });
  for (const entry of read("examples/scientist-semantic-negative.json")
    .cases as { id: string; path: string; value: unknown }[]) {
    it(entry.id, () => {
      expect(() =>
        validateScientistBundle(
          mutate(scientistBundle, entry.path, entry.value) as ScientistBundle,
        ),
      ).toThrow();
    });
  }
});
