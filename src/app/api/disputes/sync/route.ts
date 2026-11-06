import { syncAllDisputes } from "@/lib/disputes/service";

/** Pulls disputes from PayPal on demand, for environments without a public webhook URL. */
export async function POST() {
  try {
    return Response.json({ synced: await syncAllDisputes() });
  } catch (error) {
    console.error("Dispute sync failed", error);
    return Response.json({ error: "Could not reach PayPal to fetch disputes. Try again in a moment." }, { status: 502 });
  }
}
