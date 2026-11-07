import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { DisputeStatus } from "@/components/dispute-badges";
import { formatCents, formatDate } from "@/components/format";
import { SiteHeader } from "@/components/site-header";
import { SyncDisputesButton } from "@/components/sync-disputes-button";
import { describeOutcome, describeReason, outcomeResult } from "@/lib/disputes/evidence";
import { listDisputes } from "@/lib/disputes/service";

export const metadata = { title: "Disputes · Signed Intent" };

/** A coloured rail per row: what needs you stands out in a long list. */
function rail(status: string, result: ReturnType<typeof outcomeResult>): string {
  if (result === "won") return "border-l-success";
  if (result === "lost") return "border-l-danger";
  if (result === "refunded") return "border-l-border";
  if (status === "WAITING_FOR_SELLER_RESPONSE") return "border-l-warning";
  return "border-l-accent";
}

const OUTCOME_TEXT = { won: "text-success", refunded: "text-muted", lost: "text-danger" };

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-border p-8 text-sm">
      <div className="text-base font-medium">No disputes yet</div>
      <p className="mt-2 max-w-xl text-muted">
        When a buyer disputes something the agent bought, it appears here with the signed receipt already matched and a
        recommended response. To try it in the PayPal sandbox:
      </p>
      <ol className="mt-4 max-w-xl list-decimal space-y-1.5 pl-5 text-muted">
        <li>Have the agent buy something on the Agent tab.</li>
        <li>
          Log in to{" "}
          <a href="https://www.sandbox.paypal.com/myaccount/summary" target="_blank" rel="noreferrer" className="text-accent hover:underline">
            sandbox.paypal.com
          </a>{" "}
          as the sandbox buyer and open the payment to Signed Intent.
        </li>
        <li>Choose “Report a problem” and pick a reason, e.g. “I didn’t authorize this”.</li>
        <li>Come back and press “Check PayPal for disputes” (or wait for the webhook).</li>
      </ol>
    </div>
  );
}

async function DisputeList() {
  await connection();
  const disputes = listDisputes();
  if (disputes.length === 0) return <EmptyState />;

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      {disputes.map((d) => (
        <li key={d.id}>
          <Link
            href={`/disputes/${d.id}`}
            className={`flex items-center gap-4 border-l-4 px-5 py-4 transition hover:bg-surface-muted ${rail(d.status, outcomeResult(d.outcome))}`}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-base font-medium">{d.purchaseTitle ?? "Payment without an agent receipt"}</span>
                <DisputeStatus status={d.status} result={outcomeResult(d.outcome)} />
              </div>
              <div className="mt-0.5 truncate text-sm text-muted">
                {describeReason(d.reason)} · {d.id} · opened {formatDate(d.openedAt)}
              </div>
              {(d.outcome || d.resolution) && (
                <div className={`mt-1 text-xs ${OUTCOME_TEXT[outcomeResult(d.outcome) ?? "won"]}`}>
                  {d.outcome ? describeOutcome(d.outcome) : `✓ ${d.resolution}`}
                </div>
              )}
            </div>
            {d.amountCents !== null && <div className="text-lg font-semibold tabular-nums">{formatCents(d.amountCents)}</div>}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function DisputesPage() {
  return (
    <main className="flex min-h-dvh flex-col">
      <SiteHeader active="disputes" />
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Disputes</h1>
            <p className="mt-1 max-w-lg text-sm text-muted">
              The dispute agent matches each PayPal dispute to its signed receipt and recommends a response. Nothing is
              sent to PayPal until you approve it.
            </p>
          </div>
          <SyncDisputesButton />
        </div>
        <div className="mt-6">
          <Suspense fallback={<div className="text-sm text-muted">Loading disputes…</div>}>
            <DisputeList />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
