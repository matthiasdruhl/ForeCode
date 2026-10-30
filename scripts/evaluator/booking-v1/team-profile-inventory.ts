// Trusted grader only; read hashes/custody without importing the private oracle.
import { readFileSync } from "node:fs";
import { validateTeamProfile } from "./grade-profile";
import { requireInstalledTeamProfile } from "./team-installation";
const raw = readFileSync(0);
if (raw.length > 8192) throw new Error("Fixed profile input bound.");
const profile = validateTeamProfile(
  JSON.parse(new TextDecoder("utf8", { fatal: true }).decode(raw)),
);
process.stdout.write(
  JSON.stringify(await requireInstalledTeamProfile(profile)),
);
