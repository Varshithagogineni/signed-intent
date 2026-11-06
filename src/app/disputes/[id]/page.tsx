import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { DisputeStatus } from "@/components/dispute-badges";
import { DisputeDesk, type DisputeDeskProps } from "@/components/dispute-desk";
import { formatCents, formatDate } from "@/components/format";
import { SiteHeader } from "@/components/site-header";
import { describeReason } from "@/lib/disputes/evidence";
import { getDisputeCase } from "@/lib/disputes/service";
import { env } from "@/lib/env";

async function DisputeCase({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await connection();
  const found = await getDisputeCase(id);
  if (!found) notFound();
  const { dispute, purchase, mandate, checks } = found;

  const resolved = dispute.status === "RESOLVED";
  const available: DisputeDeskProps["available"] = [
    ...(["provide_evidence", "send_message", "accept_claim"] as const).filter((a) => dispute.actions.includes(a)),
    ...(purchase?.status === "completed" ? (["refund"] as const) : []),
  ];
  const buyerMessages = dispute.messages.filter((m) => m.postedBy === "BUYER");

  return (
    <div className="flex flex-col gap-5">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{describeReason(dispute.reason)}</h1>
          <DisputeStatus status={dispute.status} />
        </div>
        <p className="mt-1 text-sm text-muted">
          {dispute.id}
          {dispute.amountCents !== null && ` · ${formatCents(dispute.amountCents)}`}
          {dispute.stage && ` · ${dispute.stage.toLowerCase()} stage`} · opened {formatDate(dispute.openedAt)}
          {dispute.sellerResponseDueAt && !resolved && ` · respond by ${formatDate(dispute.sellerResponseDueAt)}`}
        </p>
        {dispute.resolution && <p className="mt-2 text-sm font-medium text-success">✓ {dispute.resolution}</p>}
      </header>

      {buyerMessages.length > 0 && (
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-xs font-medium tracking-wide text-muted uppercase">What the buyer said</h2>
          {buyerMessages.map((m, i) => (
            <blockquote key={i} className="mt-2 border-l-2 border-border pl-3 text-sm">
              {m.content}
            </blockquote>
          ))}
        </section>
      )}

      <section className="rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xs font-medium tracking-wide text-muted uppercase">Signed evidence</h2>
          {purchase && (
            <Link href={`/receipts/${purchase.id}`} className="text-xs font-medium text-accent hover:underline">
              Open receipt →
            </Link>
          )}
        </div>
        {purchase && mandate && (
          <div className="mt-3 flex items-center gap-3 rounded-lg bg-surface-muted p-3">
            {purchase.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- remote catalog image
              <img src={purchase.imageUrl} alt="" className="size-12 rounded bg-white object-contain" />
            )}
            <div className="min-w-0 flex-1 text-sm">
              <div className="truncate font-medium">{purchase.title}</div>
              <div className="truncate text-xs text-muted">
                Goal: “{mandate.goal}” · {purchase.retailer}
                {purchase.status === "refunded" && " · refunded"}
              </div>
            </div>
            <div className="font-semibold tabular-nums">{formatCents(purchase.amountCents)}</div>
          </div>
        )}
        <ul className="mt-3 space-y-2">
          {checks.map((check) => (
            <li key={check.key} className="flex gap-3 text-sm">
              <span
                className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-xs font-bold ${
                  check.ok ? "bg-success/15 text-success" : "bg-danger/15 text-danger"
                }`}
                aria-label={check.ok ? "passed" : "failed"}
              >
                {check.ok ? "✓" : "✗"}
              </span>
              <div>
                <div className="font-medium">{check.label}</div>
                <div className="text-muted">{check.detail}</div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <DisputeDesk
        disputeId={dispute.id}
        analysis={dispute.analysis}
        available={available}
        resolved={resolved}
        canRequestEvidence={env().PAYPAL_ENVIRONMENT === "sandbox" && !dispute.actions.includes("provide_evidence")}
      />
    </div>
  );
}

export default function DisputePage({ params }: PageProps<"/disputes/[id]">) {
  return (
    <main className="flex min-h-dvh flex-col">
      <SiteHeader active="disputes" />
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-8">
        <Link href="/disputes" className="text-sm text-muted hover:text-foreground">
          ← All disputes
        </Link>
        <div className="mt-4">
          <Suspense fallback={<div className="text-sm text-muted">Verifying evidence…</div>}>
            <DisputeCase params={params} />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
