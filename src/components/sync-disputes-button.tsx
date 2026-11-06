"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/** Pulls the latest disputes from PayPal, then re-renders the server list. */
export function SyncDisputesButton() {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const sync = async () => {
    setSyncing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/disputes/sync", { method: "POST" });
      const body = await res.json();
      setMessage(res.ok ? `Checked PayPal: ${body.synced} dispute${body.synced === 1 ? "" : "s"}.` : body.error);
      startRefresh(() => router.refresh());
    } catch {
      setMessage("Could not reach the server.");
    } finally {
      setSyncing(false);
    }
  };

  const busy = syncing || refreshing;
  return (
    <div className="flex items-center gap-3">
      {message && <span className="text-xs text-muted">{message}</span>}
      <button
        type="button"
        onClick={sync}
        disabled={busy}
        className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium transition hover:border-accent disabled:opacity-50"
      >
        {busy ? "Checking PayPal…" : "Check PayPal for disputes"}
      </button>
    </div>
  );
}
