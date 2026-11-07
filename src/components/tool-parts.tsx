"use client";

import {
  Check,
  CircleAlert,
  CircleCheck,
  CreditCard,
  FileSignature,
  Globe,
  ListChecks,
  Loader2,
  Lock,
  Search,
  ShieldCheck,
  ShieldX,
  Star,
  X,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import type { AgentUIMessage } from "@/lib/agent/tools";
import { formatCents, formatDate } from "./format";

type Part = AgentUIMessage["parts"][number];
type ToolPart<Name extends string> = Extract<Part, { type: `tool-${Name}` }>;
export type AgentToolPart = Extract<Part, { type: `tool-${string}` }>;

const PAYPAL_API = "api-m.sandbox.paypal.com";

function Stars({ rating }: { rating: { value: number; count: number } | null }) {
  if (!rating) return null;
  return (
    <span className="inline-flex items-center gap-1 text-sm">
      <Star className="size-3.5 fill-amber-400 text-amber-400" aria-hidden />
      <span className="font-medium">{rating.value.toFixed(1)}</span>
      <span className="text-muted">({rating.count.toLocaleString()})</span>
    </span>
  );
}

// ---------------------------------------------------------------------------------------
// Agent computer: every tool call as a step with the real endpoint or listing behind it.
// ---------------------------------------------------------------------------------------

type StepKind = "search" | "listing" | "policy" | "paypal" | "receipt" | "think";
type StepState = "running" | "done" | "error";

interface Step {
  key: string;
  kind: StepKind;
  label: string;
  detail?: string;
  url?: string;
  source?: string;
  state: StepState;
}

const STEP_ICONS: Record<StepKind, typeof Search> = {
  search: Search,
  listing: Globe,
  policy: ShieldCheck,
  paypal: CreditCard,
  receipt: FileSignature,
  think: ListChecks,
};

function stateOf(part: AgentToolPart): StepState {
  if (part.state === "output-error") return "error";
  return part.state === "output-available" ? "done" : "running";
}

/** Turns one tool call into the steps a person would want to watch. */
function stepsFor(part: AgentToolPart, key: string): Step[] {
  const state = stateOf(part);
  switch (part.type) {
    case "tool-requestMandate": {
      const cap = part.input?.capUsd;
      return [
        {
          key,
          kind: "paypal",
          label: cap ? `Creating a PayPal authorization for $${cap.toFixed(2)}` : "Creating a PayPal authorization",
          detail: state === "done" ? "Hold is ready for your approval" : undefined,
          url: `${PAYPAL_API}/v2/checkout/orders`,
          source: "intent AUTHORIZE",
          state,
        },
      ];
    }
    case "tool-checkMandate":
      return [{ key, kind: "policy", label: "Checking the mandate's remaining budget", state }];
    case "tool-searchProducts": {
      const query = part.input?.query ?? "";
      const out = part.state === "output-available" ? part.output : null;
      const retailers = out ? [...new Set(out.products.map((p) => p.retailer))].slice(0, 4).join(", ") : "";
      return [
        {
          key,
          kind: "search",
          label: query ? `Searching retailers for “${query}”` : "Searching retailers",
          detail: out ? `${out.products.length} products · ${retailers}` : undefined,
          url: `api.trychannel3.com/v1/search?q=${encodeURIComponent(query)}`,
          source: "Channel3",
          state,
        },
      ];
    }
    case "tool-inspectProduct": {
      const out = part.state === "output-available" ? part.output : null;
      if (out?.product) {
        const p = out.product;
        const rating = p.rating ? ` · ★ ${p.rating.value.toFixed(1)}` : "";
        return [
          {
            key,
            kind: "listing",
            label: `Checked the ${p.retailer} listing`,
            detail: `${p.title} · ${formatCents(p.priceCents)}${rating} · ${p.inStock ? "in stock" : "stock unknown"}`,
            url: `${p.retailer} · ${p.title}`,
            source: "listing via Channel3",
            state,
          },
        ];
      }
      return [
        {
          key,
          kind: "listing",
          label: out ? "Listing unavailable" : "Opening the product listing",
          url: "api.trychannel3.com/v1/products/…",
          source: "Channel3",
          state: out ? "error" : state,
        },
      ];
    }
    case "tool-recommendProducts": {
      const out = part.state === "output-available" ? part.output : null;
      return [
        {
          key,
          kind: "think",
          label: "Comparing price, rating and fit",
          detail: out?.picks ? `Shortlisted ${out.picks.length} for you` : undefined,
          state,
        },
      ];
    }
    case "tool-purchase": {
      if (part.state !== "output-available") {
        return [
          {
            key,
            kind: "policy",
            label: "Checking the mandate policy before paying",
            url: "policy engine · budget, per-item, retailer, count, expiry",
            state: state === "error" ? "error" : "running",
          },
        ];
      }
      const out = part.output;
      if (out.status === "completed") {
        const p = out.purchase;
        return [
          { key: `${key}-p`, kind: "policy", label: "Policy passed: inside the approved mandate", state: "done" },
          {
            key: `${key}-c`,
            kind: "paypal",
            label: `PayPal captured ${formatCents(p.amountCents)} from the hold`,
            detail: `capture ${p.captureId} · ${formatCents(out.remainingCents)} left`,
            url: `${PAYPAL_API}/v2/payments/authorizations/${out.authorizationId ?? "…"}/capture`,
            source: "partial capture",
            state: "done",
          },
          {
            key: `${key}-r`,
            kind: "receipt",
            label: "Signed the intent receipt (Ed25519)",
            url: `signed-intent/receipts/${p.id}`,
            state: "done",
          },
        ];
      }
      if (out.status === "declined") {
        return [
          { key: `${key}-p`, kind: "policy", label: "Policy passed: inside the approved mandate", state: "done" },
          { key: `${key}-c`, kind: "paypal", label: "PayPal declined the payment", detail: out.reason, url: `${PAYPAL_API}/v2/payments/authorizations/…/capture`, state: "error" },
        ];
      }
      if (out.violation === "PAYPAL_LIMIT") {
        return [
          { key: `${key}-p`, kind: "policy", label: "Policy passed", state: "done" },
          { key: `${key}-c`, kind: "paypal", label: "PayPal refused a capture above the hold", detail: out.reason, state: "error" },
        ];
      }
      return [{ key, kind: "policy", label: "Blocked by the mandate policy", detail: out.reason, url: "policy engine", state: "error" }];
    }
    default:
      return [];
  }
}

function StepRow({ step }: { step: Step }) {
  const Icon = STEP_ICONS[step.kind];
  return (
    <li className={`grid grid-cols-[22px_1fr_20px] items-start gap-2.5 rounded-lg px-2 py-1.5 ${step.state === "running" ? "bg-white/5" : ""}`}>
      <Icon className="mt-0.5 size-4 text-terminal-muted" aria-hidden />
      <div className="min-w-0">
        <div className="text-[14px] text-terminal-fg">{step.label}</div>
        {step.detail && <div className="truncate text-[13px] text-terminal-muted">{step.detail}</div>}
      </div>
      <span className="mt-0.5" aria-label={step.state}>
        {step.state === "running" && <Loader2 className="size-4 animate-spin text-indigo-300" />}
        {step.state === "done" && <Check className="size-4 text-emerald-400" />}
        {step.state === "error" && <X className="size-4 text-red-400" />}
      </span>
    </li>
  );
}

/** A dark "computer" window that shows what the agent is doing, step by step. */
export function AgentWorkspace({ parts, live }: { parts: AgentToolPart[]; live: boolean }) {
  const steps = parts.flatMap((part, i) => stepsFor(part, `${part.toolCallId ?? i}`));
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  if (steps.length === 0) return null;

  const running = steps.some((s) => s.state === "running");
  const open = userOpen ?? (live || running);
  const current = [...steps].reverse().find((s) => s.state === "running" && s.url) ?? [...steps].reverse().find((s) => s.url);
  const failed = steps.filter((s) => s.state === "error").length;

  return (
    <div className="overflow-hidden rounded-2xl border border-terminal-border bg-terminal text-terminal-fg shadow-card">
      <button
        type="button"
        onClick={() => setUserOpen(!open)}
        className="flex h-11 w-full items-center gap-3 bg-black/30 px-3 text-left"
        aria-expanded={open}
      >
        <span className="flex shrink-0 gap-1.5" aria-hidden>
          <span className="size-3 rounded-full bg-[#ff5f57]" />
          <span className="size-3 rounded-full bg-[#febc2e]" />
          <span className="size-3 rounded-full bg-[#28c840]" />
        </span>
        <span className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded-md bg-white/5 px-3 font-mono text-[13px]">
          <Lock className="size-3.5 shrink-0 text-terminal-muted" aria-hidden />
          <span className="truncate">{current?.url ?? "agent workspace"}</span>
          {current?.source && (
            <span className="ml-auto shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[11px] text-terminal-muted">{current.source}</span>
          )}
        </span>
        <span className="hidden shrink-0 text-[12px] text-terminal-muted sm:inline">
          {running ? "Agent computer · working" : `${steps.length} steps${failed ? ` · ${failed} stopped` : ""}`}
        </span>
      </button>
      {open && (
        <ol className="max-h-72 space-y-0.5 overflow-y-auto p-2">
          {steps.map((step) => (
            <StepRow key={step.key} step={step} />
          ))}
        </ol>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// Rich result cards
// ---------------------------------------------------------------------------------------

function ToolError({ text }: { text: string }) {
  return <div className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">{text}</div>;
}

export function MandateRequestCard({ part, onApprove }: { part: ToolPart<"requestMandate">; onApprove: (url: string) => void }) {
  if (part.state === "output-error") return <ToolError text={`Could not create the mandate: ${part.errorText}`} />;
  if (part.state !== "output-available") return null;

  const m = part.output;
  const terms = [
    m.maxPerPurchaseCents !== null ? `Max ${formatCents(m.maxPerPurchaseCents)} per item` : "Any number of items",
    m.allowedRetailers?.length ? `Only ${m.allowedRetailers.join(", ")}` : "Any retailer",
    `Expires ${formatDate(m.expiresAt)}`,
  ];
  return (
    <div className="rounded-2xl border-2 border-paypal/30 bg-surface p-6 shadow-card">
      <div className="text-xs font-semibold tracking-wide text-paypal uppercase">Spending mandate · needs your approval</div>
      <div className="mt-2 text-5xl font-semibold tracking-tight tabular-nums">{formatCents(m.capCents)}</div>
      <div className="mt-2 text-lg">{m.goal}</div>
      <div className="mt-4 flex flex-wrap gap-2">
        {terms.map((t) => (
          <span key={t} className="rounded-lg bg-surface-muted px-3 py-1.5 text-sm">
            {t}
          </span>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onApprove(m.approveUrl)}
        className="mt-5 h-12 w-full rounded-xl bg-paypal text-base font-semibold text-white transition hover:brightness-110"
      >
        Approve with PayPal
      </button>
      <p className="mt-2 text-sm text-muted">PayPal places a hold for this amount. The agent can spend up to it, never more.</p>
    </div>
  );
}

export function RecommendationCards({
  part,
  onChoose,
  disabled,
}: {
  part: ToolPart<"recommendProducts">;
  onChoose: (choice: string) => void;
  disabled: boolean;
}) {
  if (part.state === "output-error") return <ToolError text={`Could not load the shortlist: ${part.errorText}`} />;
  if (part.state !== "output-available") return null;
  const out = part.output;
  if (!out.picks) return <ToolError text={out.error ?? "No products to show."} />;

  const ordered = [...out.picks].sort((a, b) => Number(b.product.id === out.topPickId) - Number(a.product.id === out.topPickId));
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {ordered.map(({ product: p, why }) => {
        const top = p.id === out.topPickId;
        return (
          <div
            key={p.id}
            className={`relative flex flex-col rounded-2xl border bg-surface p-3 ${top ? "border-accent shadow-card ring-2 ring-accent" : "border-border"}`}
          >
            {top && <span className="absolute top-3 left-3 z-10 rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-white">Top pick</span>}
            <a href={p.url} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-xl bg-white">
              {p.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- remote catalog images from many hosts
                <img src={p.imageUrl} alt="" className="size-full object-contain p-2" />
              )}
            </a>
            <div className="mt-3 line-clamp-2 text-sm font-medium">{p.title}</div>
            <div className="mt-1">
              <Stars rating={p.rating} />
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <span className="text-xl font-semibold tabular-nums">{formatCents(p.priceCents)}</span>
              <span className="truncate font-mono text-xs text-muted">{p.retailer}</span>
            </div>
            <p className="mt-2 line-clamp-3 flex-1 text-sm text-muted">{why}</p>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChoose(`${p.title} from ${p.retailer} for ${formatCents(p.priceCents)}`)}
              className={`mt-3 h-10 w-full rounded-xl text-sm font-semibold transition disabled:opacity-50 ${
                top ? "bg-accent text-white hover:brightness-110" : "border border-border hover:border-accent hover:text-accent"
              }`}
            >
              {top ? "Buy this" : "Pick this"}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function ResultShell({ tone, icon, children }: { tone: "success" | "danger" | "warning"; icon: ReactNode; children: ReactNode }) {
  const tones = {
    success: "border-l-success bg-success-soft",
    danger: "border-l-danger bg-danger-soft",
    warning: "border-l-warning bg-warning-soft",
  };
  return (
    <div className={`flex gap-4 rounded-2xl border border-l-4 border-border p-4 ${tones[tone]}`}>
      <div className="shrink-0 pt-0.5">{icon}</div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function PurchaseResult({ part }: { part: ToolPart<"purchase"> }) {
  if (part.state === "output-error") return <ToolError text={`Purchase failed: ${part.errorText}`} />;
  if (part.state !== "output-available") return null;

  const result = part.output;
  if (result.status === "completed") {
    const p = result.purchase;
    return (
      <ResultShell tone="success" icon={<CircleCheck className="size-6 text-success" />}>
        <div className="flex gap-4">
          <div className="min-w-0 flex-1">
            <div className="text-lg font-semibold text-success">Paid {formatCents(p.amountCents)} via PayPal</div>
            <div className="mt-0.5 truncate">{p.title}</div>
            <div className="mt-1 font-mono text-xs text-muted">
              {p.retailer} · capture {p.captureId} · {formatCents(result.remainingCents)} left
            </div>
            <a
              href={`/receipts/${p.id}`}
              className="mt-3 inline-flex h-9 items-center rounded-lg border border-success/30 bg-surface px-3 text-sm font-medium text-success hover:bg-success-soft"
            >
              View signed receipt →
            </a>
          </div>
          {p.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- remote catalog image
            <img src={p.imageUrl} alt="" className="size-20 shrink-0 rounded-xl bg-white object-contain p-1" />
          )}
        </div>
      </ResultShell>
    );
  }

  const blocked = result.status === "blocked";
  return (
    <ResultShell
      tone={blocked ? "danger" : "warning"}
      icon={blocked ? <ShieldX className="size-6 text-danger" /> : <CircleAlert className="size-6 text-warning" />}
    >
      <div className={`text-lg font-semibold ${blocked ? "text-danger" : "text-warning"}`}>
        {blocked ? "Blocked by mandate policy" : "Payment declined"}
        {result.product && ` · ${formatCents(result.product.priceCents)}`}
      </div>
      {result.product && <div className="mt-0.5 truncate">{result.product.title}</div>}
      <div className="mt-1 text-sm">{result.reason}</div>
      <div className="mt-1 text-sm text-muted">Nothing was charged.</div>
    </ResultShell>
  );
}
