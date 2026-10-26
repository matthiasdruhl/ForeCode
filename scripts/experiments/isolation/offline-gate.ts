import { jsonDigest, sha256 } from "../../../src/lib/report/digests";
import { protectedRead, disjoint } from "../artifacts/files";
import {
  OfflineReviewSchema,
  offlineObligations,
  type OfflineConfig,
} from "./offline-config";
export function offlineConfigurationDigest(config: OfflineConfig) {
  const { reviewFile, reviewSha256, acceptanceEnabled, ...bound } = config;
  void reviewFile;
  void reviewSha256;
  void acceptanceEnabled;
  return jsonDigest(bound);
}
export async function reviewOffline(
  config: OfflineConfig,
  implementation: string,
  now = Date.now(),
) {
  if (!config.acceptanceEnabled || config.enabled !== false)
    throw new Error("Offline acceptance disabled");
  const bytes = await protectedRead(config.reviewFile);
  if (sha256(bytes) !== config.reviewSha256)
    throw new Error("Offline review digest mismatch");
  const review = OfflineReviewSchema.parse(JSON.parse(bytes.toString()));
  if (
    Date.parse(review.reviewedAt) > now ||
    Date.parse(review.expiresAt) <= now ||
    Date.parse(review.expiresAt) <= Date.parse(review.reviewedAt) ||
    Date.parse(review.expiresAt) - Date.parse(review.reviewedAt) > 86_400_000
  )
    throw new Error("Offline review freshness missing");
  if (
    review.configurationSha256 !== offlineConfigurationDigest(config) ||
    review.implementationSha256 !== implementation
  )
    throw new Error("Offline review binding mismatch");
  if (
    new Set(review.evidence.map((e) => e.obligation)).size !==
    offlineObligations.length
  )
    throw new Error("Offline obligations missing");
  for (const evidence of review.evidence) {
    disjoint(evidence.path, config.scratchRoot);
    if (sha256(await protectedRead(evidence.path)) !== evidence.sha256)
      throw new Error("Offline isolation evidence changed");
  }
  disjoint(config.reviewFile, config.scratchRoot);
  return review;
}
export async function admitOffline(
  config: OfflineConfig,
  inventory: unknown,
  implementation: string,
) {
  const review = await reviewOffline(config, implementation);
  if (review.inventorySha256 !== jsonDigest(inventory))
    throw new Error("Offline inventory mismatch");
  return review;
}
