"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { DisputeAnalysis } from "@/lib/db/schema";

type Action = DisputeAnalysis["recommendation"];

const ACTION_LABELS: Record<Action, string> = {
  provide_evidence: "Submit signed evidence",
  refund: "Refund the buyer",
  accept_claim: "Accept the claim",
  send_message: "Message the buyer",
};

const CONFIRM: Record<Action, string> = {
  provide_evidence: "Send this evidence to PayPal?",
  refund: "Refund this purchase through PayPal? This moves real sandbox money back to the buyer.",
  accept_claim: "Accept the buyer's claim? PayPal will refund them and close the dispute.",
  send_message: "Send this message to the buyer through PayPal?",
};

const CONFIDENCE_STYLES: Record<DisputeAnalysis["confidence"], string> = {
  high: "bg-success/10 text-success",
  medium: "bg-warning/10 text-warning",
  low: "bg-muted/10 text-muted",
};

export interface DisputeDeskProps {
  disputeId: string;
  analysis: DisputeAnalysis | null;
  /** Actions PayPal allows now, plus "refund" when the purchase can still be refunded. */
  available: Action[];
  resolved: boolean;
  /** The merchant has responded and PayPal offers no further action while it decides. */
  waiting: boolean;
  /** PayPal only accepts evidence on claims; in the sandbox we can escalate an inquiry. */
  canRequestEvidence: boolean;
}

async function post(url: string, body: unknown): Promise<{ ok: boolean; data: { error?: string } & Record<string, unknown> }> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { ok: res.ok, data: await res.json().catch(() => ({ error: "Unexpected server response." })) };
}

function StatusNote({ resolved }: { resolved: boolean }) {
  return resolved ? (
    <p className="rounded-lg bg-success/5 px-3 py-2 text-sm text-success">This dispute is resolved. No further action is needed.</p>
  ) : (
    <p className="rounded-lg bg-accent/5 px-3 py-2 text-sm text-accent">
      PayPal is reviewing your response. There is nothing more to do until PayPal decides.
    </p>
  );
}

export function DisputeDesk({ disputeId, analysis: initial, available, resolved, waiting, canRequestEvidence }: DisputeDeskProps) {
  const locked = resolved || waiting;
  const router = useRouter();
  const [analysis, setAnalysis] = useState(initial);
  const [draft, setDraft] = useState(initial?.draft ?? "");
  // The first analysis starts on mount when none is stored yet and a response is still possible.
  const [analyzing, setAnalyzing] = useState(!initial && !locked);
  const [sending, setSending] = useState<Action | "sandbox_request_evidence" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const applyAnalysis = useCallback(({ ok, data }: Awaited<ReturnType<typeof post>>) => {
    if (ok) {
      const next = data as unknown as DisputeAnalysis;
      setAnalysis(next);
      setDraft(next.draft);
    } else {
      setError(data.error ?? "The dispute agent failed.");
    }
    setAnalyzing(false);
  }, []);

  const runAgent = (force: boolean) => {
    setAnalyzing(true);
    setError(null);
    void post(`/api/disputes/${disputeId}/analyze`, { force }).then(applyAnalysis);
  };

  useEffect(() => {
    if (initial || locked) return;
    let cancelled = false;
    void post(`/api/disputes/${disputeId}/analyze`, { force: false }).then((result) => {
      if (!cancelled) applyAnalysis(result);
    });
    return () => {
      cancelled = true;
    };
  }, [initial, locked, disputeId, applyAnalysis]);

  const act = async (action: Action | "sandbox_request_evidence") => {
    if (action !== "sandbox_request_evidence" && !window.confirm(CONFIRM[action])) return;
    setSending(action);
    setError(null);
    const { ok, data } = await post(`/api/disputes/${disputeId}/respond`, { action, text: draft });
    setSending(null);
    if (!ok) setError(data.error ?? "PayPal did not accept this action.");
    router.refresh();
  };

  if (!analysis && locked) {
    return (
      <section className="rounded-2xl border border-border bg-surface p-5">
        <StatusNote resolved={resolved} />
      </section>
    );
  }

  if (!analysis) {
    return (
      <section className="rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-center gap-2 text-sm text-muted">
          <span className="size-2 animate-pulse rounded-full bg-accent" />
          {analyzing ? "The dispute agent is reviewing the signed evidence…" : "No recommendation yet."}
        </div>
        {error && (
          <div className="mt-3 flex items-center justify-between gap-3 text-sm text-danger">
            {error}
            <button type="button" onClick={() => runAgent(true)} className="font-medium underline">
              Try again
            </button>
          </div>
        )}
      </section>
    );
  }

  const recommended = analysis.recommendation;
  const recommendedAvailable = available.includes(recommended);
  const others = available.filter((a) => a !== recommended);

  return (
    <section className="rounded-2xl border border-accent/30 bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-medium tracking-wide text-muted uppercase">Dispute agent recommends</h2>
        <div className="flex items-center gap-2 text-xs">
          <span className={`rounded-full px-2 py-0.5 font-medium ${CONFIDENCE_STYLES[analysis.confidence]}`}>
            {analysis.confidence} confidence
          </span>
          <span className="text-muted">{analysis.author === "rules" ? "rule-based (AI unavailable)" : analysis.author}</span>
        </div>
      </div>
      <div className="mt-2 text-xl font-semibold">{ACTION_LABELS[recommended]}</div>
      <p className="mt-1 text-sm">{analysis.summary}</p>
      <p className="mt-2 text-sm text-muted">{analysis.rationale}</p>

      {locked ? (
        <div className="mt-4">
          <StatusNote resolved={resolved} />
        </div>
      ) : (
        <>
          <label className="mt-5 block text-xs font-medium text-muted" htmlFor="draft">
            {recommended === "provide_evidence" ? "Evidence to send to PayPal (edit before sending)" : "Note to the buyer (edit before sending)"}
          </label>
          <textarea
            id="draft"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={recommended === "provide_evidence" ? 9 : 4}
            maxLength={2000}
            className="mt-1 w-full rounded-lg border border-border bg-background p-3 font-mono text-xs leading-relaxed outline-none focus:border-accent"
          />

          {!recommendedAvailable && recommended === "provide_evidence" && (
            <div className="mt-3 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
              PayPal accepts evidence once an inquiry becomes a claim.
              {canRequestEvidence ? (
                <button
                  type="button"
                  onClick={() => act("sandbox_request_evidence")}
                  disabled={sending !== null}
                  className="ml-1 font-medium text-accent underline disabled:opacity-50"
                >
                  {sending === "sandbox_request_evidence" ? "Escalating…" : "Escalate it in the sandbox now"}
                </button>
              ) : (
                " You can message the buyer in the meantime."
              )}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {recommendedAvailable && (
              <button
                type="button"
                onClick={() => act(recommended)}
                disabled={sending !== null}
                className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background transition disabled:opacity-50"
              >
                {sending === recommended ? "Sending to PayPal…" : `Approve: ${ACTION_LABELS[recommended].toLowerCase()}`}
              </button>
            )}
            {others.map((action) => (
              <button
                key={action}
                type="button"
                onClick={() => act(action)}
                disabled={sending !== null}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:border-accent disabled:opacity-50"
              >
                {sending === action ? "Sending…" : ACTION_LABELS[action]}
              </button>
            ))}
            <button
              type="button"
              onClick={() => runAgent(true)}
              disabled={analyzing || sending !== null}
              className="px-2 py-2 text-sm text-muted transition hover:text-foreground disabled:opacity-50"
            >
              {analyzing ? "Re-analyzing…" : "Ask again"}
            </button>
          </div>
        </>
      )}
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
    </section>
  );
}
