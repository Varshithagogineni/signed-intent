import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { formatCents } from "@/components/format";
import { SiteHeader } from "@/components/site-header";
import { getDb, schema } from "@/lib/db";
import { verifyDocument } from "@/lib/signing";

interface ReceiptClaims {
  sub: string;
  iat: number;
  mandate: { id: string; goal: string; fingerprint: string };
  item: { product_id: string; title: string; retailer: string; url: string };
  amount: { value: number; currency: string };
  agent_reasoning: string;
  paypal: { authorization_id: string; capture_id: string };
  purchased_at: string;
}

async function Receipt({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await connection();
  const purchase = getDb().select().from(schema.purchases).where(eq(schema.purchases.id, id)).get();
  if (!purchase) notFound();
  const dispute = getDb().select().from(schema.disputes).where(eq(schema.disputes.purchaseId, id)).get();

  let claims: ReceiptClaims | null = null;
  try {
    claims = await verifyDocument<ReceiptClaims & Record<string, unknown>>("intent-receipt", purchase.signedReceipt);
  } catch {
    claims = null;
  }

  const rows: [string, string][] = claims
    ? [
        ["Human's goal", claims.mandate.goal],
        ["Item", claims.item.title],
        ["Retailer", claims.item.retailer],
        ["Amount", formatCents(claims.amount.value)],
        ["Agent's reasoning", claims.agent_reasoning],
        ["Mandate", claims.mandate.id],
        ["PayPal authorization", claims.paypal.authorization_id],
        ["PayPal capture", claims.paypal.capture_id],
        ["Purchased", new Date(claims.purchased_at).toLocaleString("en-US")],
      ]
    : [];

  return (
    <article className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-medium tracking-wide text-muted uppercase">Intent receipt</div>
          <h1 className="mt-1 text-xl font-semibold">{purchase.title}</h1>
        </div>
        {claims ? (
          <span className="shrink-0 rounded-full bg-success/10 px-3 py-1 text-xs font-semibold text-success">✓ Signature valid</span>
        ) : (
          <span className="shrink-0 rounded-full bg-danger/10 px-3 py-1 text-xs font-semibold text-danger">✗ Invalid signature</span>
        )}
      </div>

      {(purchase.status === "refunded" || dispute) && (
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          {purchase.status === "refunded" && (
            <span className="rounded-full bg-muted/10 px-2.5 py-1 font-medium text-muted">Refunded to the buyer</span>
          )}
          {dispute && (
            <Link href={`/disputes/${dispute.id}`} className="rounded-full bg-warning/10 px-2.5 py-1 font-medium text-warning hover:underline">
              Disputed · {dispute.id} →
            </Link>
          )}
        </div>
      )}

      <dl className="mt-6 divide-y divide-border text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="grid gap-1 py-2.5 sm:grid-cols-[160px_1fr] sm:gap-4">
            <dt className="text-muted">{label}</dt>
            <dd className="break-words">{value}</dd>
          </div>
        ))}
      </dl>

      <details className="mt-6">
        <summary className="cursor-pointer text-sm font-medium text-accent">Raw signed token (JWS)</summary>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-surface-muted p-3 font-mono text-xs break-all whitespace-pre-wrap">
          {purchase.signedReceipt}
        </pre>
        <p className="mt-2 text-xs text-muted">
          Verify independently with the public key at{" "}
          <a href="/.well-known/jwks.json" className="text-accent hover:underline">
            /.well-known/jwks.json
          </a>{" "}
          (Ed25519, EdDSA).
        </p>
      </details>
    </article>
  );
}

export default function ReceiptPage({ params }: PageProps<"/receipts/[id]">) {
  return (
    <main className="flex min-h-dvh flex-col">
      <SiteHeader active="agent" />
      <div className="mx-auto w-full max-w-2xl px-4 py-8">
        <Link href="/" className="text-sm text-muted hover:text-foreground">
          ← Back to agent
        </Link>
        <div className="mt-4">
          <Suspense fallback={<div className="text-sm text-muted">Verifying receipt…</div>}>
            <Receipt params={params} />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
