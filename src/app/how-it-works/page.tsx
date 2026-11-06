import Link from "next/link";
import { SiteHeader } from "@/components/site-header";

export const metadata = { title: "How it works · Signed Intent" };

const STEPS = [
  {
    title: "You set the mandate",
    body: "Tell the agent what you want and your limit. You approve it once in PayPal, which places a real authorization hold for exactly that amount.",
    proof: "PayPal Orders v2 · intent AUTHORIZE",
  },
  {
    title: "The agent shops",
    body: "It searches real products across thousands of retailers, compares price, rating and fit, and picks one, explaining why.",
    proof: "Gemini tool calling · Channel3 catalog",
  },
  {
    title: "Policy decides, PayPal pays",
    body: "The server looks up the real price and checks budget, per-item cap, retailers, purchase count and expiry. Only then does it capture part of the hold.",
    proof: "Deterministic policy · partial capture",
  },
  {
    title: "Every purchase is signed",
    body: "A receipt binds your mandate, the item, the agent's reasoning and the PayPal capture ID, signed with Ed25519. Anyone can verify it.",
    proof: "JWS (EdDSA) · public JWKS",
  },
  {
    title: "Disputes answer themselves",
    body: "If a buyer disputes a purchase, the dispute agent matches it to its signed receipt, checks the evidence and drafts a response. You approve before anything is sent.",
    proof: "PayPal Disputes API · webhooks",
  },
];

const LAYERS = [
  { name: "AI agent", role: "Proposes", detail: "Chooses what to buy and why. Can't move money by itself.", tone: "border-accent/40 bg-accent/5" },
  { name: "Policy engine", role: "Decides", detail: "Pure function over the signed mandate. The model never votes.", tone: "border-success/40 bg-success/5" },
  { name: "PayPal hold", role: "Enforces", detail: "Captures above the authorization are rejected by PayPal itself.", tone: "border-paypal/40 bg-paypal/5" },
];

export default function HowItWorks() {
  return (
    <main className="flex min-h-dvh flex-col">
      <SiteHeader active="how" />
      <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-8">
        <p className="text-sm font-medium text-accent">How Signed Intent works</p>
        <h1 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
          Let an AI agent spend money, and prove exactly what it was allowed to do.
        </h1>
        <p className="mt-4 max-w-2xl text-muted">
          Today, letting an agent pay is all or nothing: hand over your wallet and hope. Nothing stops it overspending or
          being steered by a malicious product page, and when something goes wrong there is no record of what you agreed
          to. Signed Intent turns PayPal primitives that already exist (authorizations, partial captures, voids and
          disputes) into spending mandates for agents.
        </p>

        <ol className="mt-10 grid gap-4 sm:grid-cols-2">
          {STEPS.map((step, i) => (
            <li key={step.title} className={`rounded-2xl border border-border bg-surface p-5 ${i === STEPS.length - 1 ? "sm:col-span-2" : ""}`}>
              <div className="flex items-center gap-3">
                <span className="grid size-7 place-items-center rounded-full bg-foreground text-sm font-semibold text-background">
                  {i + 1}
                </span>
                <h2 className="font-semibold">{step.title}</h2>
              </div>
              <p className="mt-3 text-sm text-muted">{step.body}</p>
              <p className="mt-3 font-mono text-xs text-accent">{step.proof}</p>
            </li>
          ))}
        </ol>

        <h2 className="mt-14 text-xl font-semibold tracking-tight">Three independent guards on every payment</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Money moves only when all three agree. A prompt injection can change what the agent wants; it can&apos;t change
          the policy or the PayPal hold.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-stretch">
          {LAYERS.map((layer, i) => (
            <div key={layer.name} className="contents">
              <div className={`rounded-2xl border p-4 ${layer.tone}`}>
                <div className="text-xs font-medium tracking-wide text-muted uppercase">{layer.role}</div>
                <div className="mt-1 font-semibold">{layer.name}</div>
                <p className="mt-2 text-sm text-muted">{layer.detail}</p>
              </div>
              {i < LAYERS.length - 1 && (
                <div className="hidden items-center text-muted sm:flex" aria-hidden>
                  →
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-wrap gap-3">
          <Link href="/" className="rounded-lg bg-foreground px-4 py-2.5 text-sm font-semibold text-background">
            Try the agent
          </Link>
          <Link href="/disputes" className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:border-accent">
            See the dispute desk
          </Link>
          <a href="/.well-known/jwks.json" className="rounded-lg px-4 py-2.5 text-sm font-medium text-muted hover:text-foreground">
            Public signing key →
          </a>
        </div>
      </div>
    </main>
  );
}
