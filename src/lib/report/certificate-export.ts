import { DemoResponseSchema } from "../contracts/api";
import { canonicalJson } from "./canonical";

// Select only from a fresh response, never from previously rendered props.
export function selectCertificateExport(
  input: unknown,
  id: string,
  digest: string,
) {
  const demo = DemoResponseSchema.parse(input);
  const matches = demo.certificates.filter(
    (c) => c.id === id && c.artifactSha256 === digest,
  );
  if (matches.length !== 1)
    throw new Error("Certificate unavailable or changed. Reload this page.");
  return { filename: `${id}.json`, json: canonicalJson(matches[0]) };
}
