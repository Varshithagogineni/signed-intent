const STATUS_STYLES: Record<string, string> = {
  OPEN: "bg-warning/10 text-warning",
  WAITING_FOR_SELLER_RESPONSE: "bg-danger/10 text-danger",
  WAITING_FOR_BUYER_RESPONSE: "bg-accent/10 text-accent",
  UNDER_REVIEW: "bg-accent/10 text-accent",
  RESOLVED: "bg-success/10 text-success",
};

const STATUS_LABELS: Record<string, string> = {
  WAITING_FOR_SELLER_RESPONSE: "needs your response",
  WAITING_FOR_BUYER_RESPONSE: "waiting on buyer",
};

/** The dispute's state; once PayPal rules, whether the seller won or lost. */
export function DisputeStatus({ status, result }: { status: string; result?: "won" | "lost" | null }) {
  if (result) {
    return (
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${result === "won" ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>
        {result === "won" ? "won" : "lost"}
      </span>
    );
  }
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status] ?? "bg-muted/10 text-muted"}`}>
      {STATUS_LABELS[status] ?? status.toLowerCase().replaceAll("_", " ")}
    </span>
  );
}
