"use client";

import { useEffect, useState } from "react";
import type { Activity, Mandate, Purchase } from "@/lib/db/schema";
import { formatCents, formatDate, formatTime } from "./format";

type Serialized<T> = { [K in keyof T]: T[K] extends Date ? string : T[K] extends Date | null ? string | null : T[K] };

interface MandateDetail {
  mandate: Omit<Serialized<Mandate>, "signedMandate">;
  purchases: Omit<Serialized<Purchase>, "signedReceipt">[];
  activity: Serialized<Activity>[];
}

const POLL_MS = 2000;

const STATUS_STYLES: Record<string, string> = {
  pending_approval: "bg-warning/10 text-warning",
  active: "bg-success/10 text-success",
  closed: "bg-muted/10 text-muted",
  expired: "bg-muted/10 text-muted",
  revoked: "bg-danger/10 text-danger",
};

const ACTIVITY_DOT: Record<string, string> = {
  purchase_completed: "bg-success",
  purchase_blocked: "bg-danger",
  payment_declined: "bg-warning",
  mandate_revoked: "bg-danger",
  dispute_opened: "bg-warning",
  purchase_refunded: "bg-muted",
};

function useMandate(mandateId: string | null) {
  const [detail, setDetail] = useState<MandateDetail | null>(null);

  useEffect(() => {
    if (!mandateId) return;
    let cancelled = false;
    const load = async () => {
      const res = await fetch(`/api/mandates/${mandateId}`, { cache: "no-store" });
      if (res.ok && !cancelled) setDetail(await res.json());
    };
    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [mandateId]);

  return detail?.mandate.id === mandateId ? detail : null;
}

export function MandatePanel({ mandateId }: { mandateId: string | null }) {
  const detail = useMandate(mandateId);
  const [revoking, setRevoking] = useState(false);

  if (!mandateId || !detail) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center text-sm text-muted">
        <div className="text-base font-medium text-foreground">No mandate yet</div>
        <p className="mt-2 max-w-xs">
          Tell the agent what to buy and your budget. It will ask you to approve a spending limit in PayPal before it can
          spend anything.
        </p>
      </div>
    );
  }

  const { mandate, purchases, activity } = detail;
  const spentPct = Math.min(100, (mandate.spentCents / mandate.capCents) * 100);

  const revoke = async () => {
    setRevoking(true);
    await fetch(`/api/mandates/${mandate.id}/revoke`, { method: "POST" });
    setRevoking(false);
  };

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-5">
      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-medium tracking-wide text-muted uppercase">Mandate</h2>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[mandate.status]}`}>
            {mandate.status.replace("_", " ")}
          </span>
        </div>
        <p className="mt-2 text-sm">{mandate.goal}</p>
        <div className="mt-4 flex items-baseline justify-between">
          <span className="text-3xl font-semibold tabular-nums">{formatCents(mandate.capCents - mandate.spentCents)}</span>
          <span className="text-sm text-muted">left of {formatCents(mandate.capCents)}</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-border">
          <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${spentPct}%` }} />
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-y-1 text-xs text-muted">
          <dt>Expires</dt>
          <dd className="text-right">{formatDate(mandate.expiresAt)}</dd>
          {mandate.maxPerPurchaseCents !== null && (
            <>
              <dt>Per purchase</dt>
              <dd className="text-right">{formatCents(mandate.maxPerPurchaseCents)}</dd>
            </>
          )}
          {mandate.authorizationId && (
            <>
              <dt>PayPal hold</dt>
              <dd className="truncate text-right font-mono">{mandate.authorizationId}</dd>
            </>
          )}
        </dl>
        {mandate.status === "active" && (
          <button
            type="button"
            onClick={revoke}
            disabled={revoking}
            className="mt-3 w-full rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/5 disabled:opacity-50"
          >
            {revoking ? "Revoking…" : "Revoke agent access"}
          </button>
        )}
      </section>

      {purchases.length > 0 && (
        <section>
          <h2 className="text-xs font-medium tracking-wide text-muted uppercase">Purchases</h2>
          <ul className="mt-2 space-y-2">
            {purchases.map((p) => (
              <li key={p.id}>
                <a
                  href={`/receipts/${p.id}`}
                  className="flex items-center gap-3 rounded-lg border border-border p-2 transition hover:border-accent"
                >
                  {p.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element -- remote catalog image
                    <img src={p.imageUrl} alt="" className="size-10 rounded bg-white object-contain" />
                  )}
                  <div className="min-w-0 flex-1 text-xs">
                    <div className="truncate font-medium">{p.title}</div>
                    <div className="text-muted">
                      {p.retailer}
                      {p.status === "refunded" && " · refunded"}
                    </div>
                  </div>
                  <div className="text-sm font-semibold tabular-nums">{formatCents(p.amountCents)}</div>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="text-xs font-medium tracking-wide text-muted uppercase">Activity</h2>
        <ol className="mt-2 space-y-2">
          {activity.map((a) => (
            <li key={a.id} className="flex gap-2 text-xs">
              <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${ACTIVITY_DOT[a.kind] ?? "bg-accent"}`} />
              <div className="min-w-0">
                <div>{a.message}</div>
                <div className="text-muted">{formatTime(a.createdAt)}</div>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
