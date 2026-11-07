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
  pending_approval: "bg-warning-soft text-warning",
  active: "bg-success-soft text-success",
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
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <div className="grid size-12 place-items-center rounded-2xl bg-surface text-xl shadow-card" aria-hidden>
          $
        </div>
        <div className="mt-4 text-lg font-semibold">No budget yet</div>
        <p className="mt-2 max-w-xs text-sm text-muted">
          Tell the agent what you need and your budget. It asks you to approve a spending limit in PayPal before it can spend
          anything, and it checks with you before it buys.
        </p>
      </div>
    );
  }

  const { mandate, purchases, activity } = detail;
  const remaining = mandate.capCents - mandate.spentCents;
  const spentPct = Math.min(100, (mandate.spentCents / mandate.capCents) * 100);

  const revoke = async () => {
    setRevoking(true);
    await fetch(`/api/mandates/${mandate.id}/revoke`, { method: "POST" });
    setRevoking(false);
  };

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-6">
      <section className="rounded-2xl border border-border bg-surface p-5 shadow-card">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Mandate</h2>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[mandate.status]}`}>
            {mandate.status.replace("_", " ")}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted">{mandate.goal}</p>
        <div className="mt-4 text-4xl font-semibold tracking-tight tabular-nums">{formatCents(remaining)}</div>
        <div className="text-sm text-muted">left of {formatCents(mandate.capCents)}</div>
        <div className="mt-3 h-3 overflow-hidden rounded-full bg-border">
          <div className="h-full rounded-full bg-accent transition-all duration-700" style={{ width: `${spentPct}%` }} />
        </div>
        <div className="mt-2 text-sm text-muted">
          Spent {formatCents(mandate.spentCents)}
          {mandate.maxPerPurchaseCents !== null && ` · max ${formatCents(mandate.maxPerPurchaseCents)} per item`}
        </div>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 border-t border-border pt-4 text-sm">
          <dt className="text-muted">Expires</dt>
          <dd className="text-right">{formatDate(mandate.expiresAt)}</dd>
          {mandate.authorizationId && (
            <>
              <dt className="text-muted">PayPal hold</dt>
              <dd className="truncate text-right font-mono text-xs leading-5">{mandate.authorizationId}</dd>
            </>
          )}
        </dl>
        {mandate.status === "active" && (
          <button
            type="button"
            onClick={revoke}
            disabled={revoking}
            className="mt-4 h-9 w-full rounded-xl border border-danger/30 text-sm font-medium text-danger transition hover:bg-danger-soft disabled:opacity-50"
          >
            {revoking ? "Revoking…" : "Revoke agent access"}
          </button>
        )}
      </section>

      {purchases.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold">Purchases</h2>
          <ul className="mt-2 space-y-2">
            {purchases.map((p) => (
              <li key={p.id}>
                <a
                  href={`/receipts/${p.id}`}
                  className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3 transition hover:border-accent"
                >
                  {p.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element -- remote catalog image
                    <img src={p.imageUrl} alt="" className="size-12 rounded-lg bg-white object-contain" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{p.title}</div>
                    <div className="font-mono text-xs text-muted">
                      {p.retailer}
                      {p.status === "refunded" && " · refunded"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold tabular-nums">{formatCents(p.amountCents)}</div>
                    <div className="text-xs text-accent">receipt ↗</div>
                  </div>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold">Activity</h2>
        <ol className="mt-3 ml-1 space-y-3 border-l-2 border-border pl-4">
          {activity.map((a) => (
            <li key={a.id} className="relative text-sm">
              <span className={`absolute top-1.5 -left-[22px] size-2.5 rounded-full ring-4 ring-surface-muted ${ACTIVITY_DOT[a.kind] ?? "bg-accent"}`} />
              <div>{a.message}</div>
              <div className="text-xs text-muted">{formatTime(a.createdAt)}</div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
