"use client";

import type { AgentUIMessage } from "@/lib/agent/tools";
import { formatCents, formatDate } from "./format";

type Part = AgentUIMessage["parts"][number];
type ToolPart<Name extends string> = Extract<Part, { type: `tool-${Name}` }>;

function Pending({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted">
      <span className="size-2 animate-pulse rounded-full bg-accent" />
      {label}
    </div>
  );
}

function ToolError({ text }: { text: string }) {
  return <div className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">{text}</div>;
}

export function MandateRequestCard({ part, onApprove }: { part: ToolPart<"requestMandate">; onApprove: (url: string) => void }) {
  if (part.state === "output-error") return <ToolError text={`Could not create the mandate: ${part.errorText}`} />;
  if (part.state !== "output-available") return <Pending label="Preparing a PayPal mandate…" />;

  const m = part.output;
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <div className="text-xs font-medium tracking-wide text-muted uppercase">Spending mandate</div>
      <div className="mt-1 text-2xl font-semibold">{formatCents(m.capCents)}</div>
      <div className="mt-1 text-sm">{m.goal}</div>
      <ul className="mt-3 space-y-1 text-sm text-muted">
        {m.maxPerPurchaseCents !== null && <li>Max {formatCents(m.maxPerPurchaseCents)} per purchase</li>}
        {m.allowedRetailers && <li>Only from {m.allowedRetailers.join(", ")}</li>}
        <li>Expires {formatDate(m.expiresAt)}</li>
      </ul>
      <button
        type="button"
        onClick={() => onApprove(m.approveUrl)}
        className="mt-4 w-full rounded-lg bg-paypal px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
      >
        Approve with PayPal
      </button>
      <p className="mt-2 text-xs text-muted">PayPal places a hold for this amount. The agent can spend up to it, never more.</p>
    </div>
  );
}

export function ProductResults({ part }: { part: ToolPart<"searchProducts"> }) {
  if (part.state === "output-error") return <ToolError text={`Search failed: ${part.errorText}`} />;
  if (part.state !== "output-available") {
    return <Pending label={part.input?.query ? `Searching for “${part.input.query}”…` : "Searching…"} />;
  }
  const { products } = part.output;
  if (products.length === 0) return <div className="text-sm text-muted">No products found.</div>;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {products.slice(0, 6).map((p) => (
        <a
          key={p.id}
          href={p.url}
          target="_blank"
          rel="noreferrer"
          className="group rounded-lg border border-border bg-surface p-2 transition hover:border-accent"
        >
          <div className="aspect-square overflow-hidden rounded-md bg-white">
            {p.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- remote catalog images from many hosts
              <img src={p.imageUrl} alt="" className="size-full object-contain transition group-hover:scale-105" />
            )}
          </div>
          <div className="mt-2 line-clamp-2 text-xs font-medium">{p.title}</div>
          <div className="mt-1 flex items-baseline justify-between text-xs">
            <span className="font-semibold">{formatCents(p.priceCents)}</span>
            <span className="truncate pl-2 text-muted">{p.retailer}</span>
          </div>
        </a>
      ))}
    </div>
  );
}

export function PurchaseResult({ part }: { part: ToolPart<"purchase"> }) {
  if (part.state === "output-error") return <ToolError text={`Purchase failed: ${part.errorText}`} />;
  if (part.state !== "output-available") return <Pending label="Checking the mandate and paying through PayPal…" />;

  const result = part.output;
  if (result.status === "completed") {
    const p = result.purchase;
    return (
      <div className="flex gap-3 rounded-xl border border-success/30 bg-success/5 p-3">
        {p.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- remote catalog image
          <img src={p.imageUrl} alt="" className="size-16 rounded-md bg-white object-contain" />
        )}
        <div className="min-w-0 text-sm">
          <div className="font-semibold text-success">Paid {formatCents(p.amountCents)} via PayPal</div>
          <div className="truncate">{p.title}</div>
          <div className="text-xs text-muted">
            {p.retailer} · capture {p.captureId} · {formatCents(result.remainingCents)} left
          </div>
          <a href={`/receipts/${p.id}`} className="mt-1 inline-block text-xs font-medium text-accent hover:underline">
            View signed receipt →
          </a>
        </div>
      </div>
    );
  }

  const blocked = result.status === "blocked";
  return (
    <div className={`rounded-xl border p-3 text-sm ${blocked ? "border-danger/30 bg-danger/5" : "border-warning/30 bg-warning/5"}`}>
      <div className={`font-semibold ${blocked ? "text-danger" : "text-warning"}`}>
        {blocked ? "Blocked by mandate policy" : "Payment declined"}
        {result.product && ` · ${formatCents(result.product.priceCents)}`}
      </div>
      {result.product && <div className="truncate">{result.product.title}</div>}
      <div className="mt-1 text-xs text-muted">{result.reason}</div>
    </div>
  );
}
