import { AgentConsole } from "@/components/agent-console";
import { SiteHeader } from "@/components/site-header";

export default function Home() {
  return (
    <main className="flex h-dvh flex-col">
      <SiteHeader active="agent" />
      <AgentConsole />
    </main>
  );
}
