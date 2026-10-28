import { jsonDigest, sha256 } from "../../../src/lib/report/digests";
import { protectedRead } from "../artifacts/files";
import {
  IsolationReviewSchema,
  obligations,
  type OperatorConfig,
} from "./config";

export function configurationDigest(config: OperatorConfig) {
  // Review's own location/hash and the kill switch do not self-reference.
  const {
    reviewFile: _file,
    reviewSha256: _hash,
    enabled: _enabled,
    ...bound
  } = config;
  void _file;
  void _hash;
  void _enabled;
  return jsonDigest(bound);
}
export async function reviewIsolation(
  config: OperatorConfig,
  implementationSha256: string,
  now = Date.now(),
) {
  if (!config.enabled)
    throw new Error("Real execution disabled by operator configuration.");
  const bytes = await protectedRead(config.reviewFile);
  if (sha256(bytes) !== config.reviewSha256)
    throw new Error("Isolation review digest mismatch.");
  const review = IsolationReviewSchema.parse(
    JSON.parse(bytes.toString("utf8")),
  );
  if (
    Date.parse(review.reviewedAt) > now ||
    Date.parse(review.expiresAt) <= now ||
    Date.parse(review.expiresAt) - Date.parse(review.reviewedAt) > 86_400_000
  )
    throw new Error("Isolation review missing freshness.");
  if (
    review.configurationSha256 !== configurationDigest(config) ||
    review.implementationSha256 !== implementationSha256 ||
    review.maxSpendUsd < config.spendUsd
  )
    throw new Error(
      "Isolation review does not bind actual runtime, implementation and budget.",
    );
  if (
    new Set(review.evidence.map((item) => item.obligation)).size !==
    obligations.length
  )
    throw new Error("Missing isolation obligations.");
  for (const evidence of review.evidence) {
    if (sha256(await protectedRead(evidence.path)) !== evidence.sha256)
      throw new Error(
        `Missing or changed isolation evidence: ${evidence.obligation}.`,
      );
  }
  if (review.execution) {
    if (
      sha256(await protectedRead(review.execution.revocationFile)) !==
      review.execution.revocationSha256
    )
      throw new Error(
        "Independent admission revoked or revocation observation changed.",
      );
  }
  return review;
}

export async function admitRuntime(
  config: OperatorConfig,
  inventory: unknown,
  implementationSha256: string,
  now = Date.now(),
) {
  const review = await reviewIsolation(config, implementationSha256, now);
  if (review.inventorySha256 !== jsonDigest(inventory))
    throw new Error("Isolation review inventory mismatch.");
  return review;
}
