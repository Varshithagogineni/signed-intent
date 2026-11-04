import { AgentConsole } from "@/components/agent-console";

export default function Home() {
  return (
    <main className="flex h-dvh flex-col">
      <header className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-8">
        <div className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-lg bg-accent text-sm font-bold text-white">S</span>
          <span className="font-semibold">Signed Intent</span>
        </div>
        <span className="rounded-full bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning">PayPal sandbox</span>
      </header>
      <AgentConsole />
    </main>
  );
}
