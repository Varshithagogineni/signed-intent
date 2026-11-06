import "server-only";
import { generateText, Output } from "ai";
import { z } from "zod";
import { agentModel } from "@/lib/agent/model";
import type { DisputeAnalysis } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { formatUsd } from "@/lib/money";
import { baselineAnalysis, describeReason, type EvidenceCheck, type EvidenceInput, evidenceNotes } from "./evidence";

const analysisSchema = z.object({
  recommendation: z.enum(["provide_evidence", "refund", "accept_claim", "send_message"]),
  confidence: z.enum(["high", "medium", "low"]),
  summary: z.string().describe("One sentence a busy merchant can read at a glance"),
  rationale: z.string().describe("Two or three sentences explaining the recommendation from the checks"),
  draft: z
    .string()
    .max(2000)
    .describe("Text to send to PayPal: evidence notes for provide_evidence, otherwise a short message to the buyer"),
});

const SYSTEM = `You are the dispute agent for Signed Intent, where an AI shopping agent spends a buyer's money only under a mandate they approved in PayPal.
A buyer has opened a PayPal dispute. You recommend one action; a human approves it before anything is sent.

Rules:
- Base every factual claim on the verified checks and records given. Never invent tracking numbers, delivery details or conversations.
- Signed records prove authorization (the buyer approved the limit, the agent stayed inside it). They do not prove delivery or that the item fit the goal.
- Judge whether the purchased item fits the buyer's goal. If it clearly does not, recommend a refund even if authorization is proven.
- If any integrity check failed, recommend a refund.
- For provide_evidence, the draft must state the verified facts and include the receipt and public key URLs given.
- Keep the buyer-facing tone short, polite and plain.`;

function prompt(input: EvidenceInput, checks: EvidenceCheck[], appUrl: string, baseline: string): string {
  const { dispute, purchase, mandate } = input;
  return [
    `Dispute reason: ${dispute.reason} (${describeReason(dispute.reason)})`,
    `Disputed amount: ${dispute.amountCents === null ? "unknown" : formatUsd(dispute.amountCents)}`,
    purchase && mandate
      ? [
          `Buyer's mandate goal: "${mandate.goal}" (limit ${formatUsd(mandate.capCents)})`,
          `Item bought: "${purchase.title}" from ${purchase.retailer} for ${formatUsd(purchase.amountCents)}`,
          `Agent's signed reasoning: "${purchase.reasoning}"`,
        ].join("\n")
      : "No matching agent purchase was found.",
    "",
    "Verified checks:",
    ...checks.map((c) => `- [${c.ok ? "PASS" : "FAIL"}] ${c.label}: ${c.detail}`),
    "",
    `Rule-based baseline recommendation: ${baseline}`,
    purchase ? `Evidence facts you may use:\n${evidenceNotes(input, appUrl)}` : "",
  ].join("\n");
}

/**
 * Recommends how to answer a dispute. The model interprets the deterministic checks;
 * if it is unavailable (rate limits, outages), the rule-based baseline is used instead.
 */
export async function analyzeDispute(input: EvidenceInput, checks: EvidenceCheck[]): Promise<DisputeAnalysis> {
  const { APP_URL, AI_MODEL } = env();
  const baseline = baselineAnalysis(input, checks, APP_URL);
  const createdAt = new Date().toISOString();

  try {
    const { output } = await generateText({
      model: agentModel(),
      system: SYSTEM,
      prompt: prompt(input, checks, APP_URL, baseline.recommendation),
      output: Output.object({ schema: analysisSchema }),
    });
    return { ...output, author: AI_MODEL, createdAt };
  } catch (error) {
    console.warn("Dispute agent unavailable, using rule-based analysis", error);
    return { ...baseline, author: "rules", createdAt };
  }
}
