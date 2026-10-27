import { IntentWorkspace } from "@/components/intent-workspace";
import { publicForesightConfiguration } from "@/server/meta/configuration";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <IntentWorkspace
      configuration={publicForesightConfiguration(process.env)}
    />
  );
}
