// Trusted guest read-only operator interface; never mounted into workers.
import { readFileSync } from "node:fs";
import { z } from "zod";
import {
  GradeIdentitySchema,
  TeamGradeProfileSchema,
  validateProfileIdentity,
  validateTeamProfile,
} from "./grade-profile";
import { requireInstalledTeamProfile } from "./team-installation";
import {
  readTeamAuthorizationJournal,
  teamAuthorizationRoot,
} from "./team-authorization";

try {
  const bytes = readFileSync(0);
  if (bytes.length > 8192) throw new Error("Authorization export input bound.");
  const input = z
    .strictObject({
      profile: TeamGradeProfileSchema,
      identity: GradeIdentitySchema,
    })
    .parse(JSON.parse(new TextDecoder("utf8", { fatal: true }).decode(bytes)));
  const profile = validateTeamProfile(input.profile);
  validateProfileIdentity(input.identity, profile);
  const before = await requireInstalledTeamProfile(profile);
  if (!before.authorizationInstrumentationSha256) {
    process.stdout.write('{"status":"NOT_INSTALLED"}');
    process.exitCode = 2;
  } else {
    const data = readTeamAuthorizationJournal(
      teamAuthorizationRoot,
      input.identity,
      before.authorizationInstrumentationSha256,
    );
    if (
      JSON.stringify(await requireInstalledTeamProfile(profile)) !==
      JSON.stringify(before)
    )
      throw new Error("Authorization installation changed.");
    process.stdout.write(JSON.stringify(data));
  }
} catch {
  process.stderr.write(
    "Protected authorization export unavailable or invalid.\n",
  );
  process.exitCode = 1;
}
