import { IntentWorkspace } from "@/components/intent-workspace";
import { metaConfigurationStatus } from "@/server/config/meta";

export const dynamic = "force-dynamic";

export default function Home() {
  return <IntentWorkspace metaStatus={metaConfigurationStatus(process.env)} />;
}
