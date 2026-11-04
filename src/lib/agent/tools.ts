import "server-only";
import { type InferUITools, tool, type UIDataTypes, type UIMessage } from "ai";
import { z } from "zod";
import { searchProducts } from "@/lib/catalog/channel3";
import { toCents } from "@/lib/money";
import { createMandate, getMandate, purchase } from "@/lib/mandates/service";

const usd = z.number().positive().max(10_000);

export interface AgentToolOptions {
  /** Sandbox demo switch: the next purchase is declined by PayPal so recovery can be shown. */
  simulateDecline: boolean;
}

export function createAgentTools({ simulateDecline }: AgentToolOptions) {
  return {
    requestMandate: tool({
      description:
        "Ask the human for spending authority. Creates a PayPal authorization they must approve before any purchase. " +
        "Call this once you know what to buy and the maximum they are willing to spend.",
      inputSchema: z.object({
        goal: z.string().min(3).max(200).describe("What the human wants bought, in their words, including key requirements"),
        capUsd: usd.describe("Total the agent may spend under this mandate, in USD"),
        maxPerPurchaseUsd: usd.optional().describe("Optional cap on any single purchase, in USD"),
        allowedRetailers: z
          .array(z.string())
          .optional()
          .describe("Optional retailer domains the human restricted purchases to, e.g. ['bestbuy.com']"),
        maxPurchases: z.number().int().positive().optional().describe("Optional maximum number of purchases"),
        expiresInDays: z.number().int().min(1).max(29).default(7).describe("How long the mandate stays valid"),
      }),
      execute: async (input) => {
        const mandate = await createMandate({
          goal: input.goal,
          capCents: toCents(input.capUsd),
          maxPerPurchaseCents: input.maxPerPurchaseUsd === undefined ? undefined : toCents(input.maxPerPurchaseUsd),
          allowedRetailers: input.allowedRetailers,
          maxPurchases: input.maxPurchases,
          expiresInDays: input.expiresInDays,
        });
        return {
          mandateId: mandate.id,
          status: mandate.status,
          goal: mandate.goal,
          capCents: mandate.capCents,
          maxPerPurchaseCents: mandate.maxPerPurchaseCents,
          allowedRetailers: mandate.allowedRetailers,
          expiresAt: mandate.expiresAt.toISOString(),
          approveUrl: mandate.approveUrl!,
        };
      },
    }),

    checkMandate: tool({
      description: "Get a mandate's current status and remaining budget.",
      inputSchema: z.object({ mandateId: z.string() }),
      execute: async ({ mandateId }) => {
        const mandate = getMandate(mandateId);
        if (!mandate) return { error: `No mandate ${mandateId}` };
        return {
          mandateId: mandate.id,
          status: mandate.status,
          capCents: mandate.capCents,
          spentCents: mandate.spentCents,
          remainingCents: mandate.capCents - mandate.spentCents,
          expiresAt: mandate.expiresAt.toISOString(),
        };
      },
    }),

    searchProducts: tool({
      description: "Search real products across thousands of retailers. Returns prices in cents.",
      inputSchema: z.object({
        query: z.string().min(2).describe("Natural-language product search, e.g. 'BPA-free water filter pitcher'"),
        maxPriceUsd: usd.optional().describe("Only return products at or below this price"),
      }),
      execute: async ({ query, maxPriceUsd }) => ({
        query,
        products: await searchProducts({
          query,
          maxPriceCents: maxPriceUsd === undefined ? undefined : toCents(maxPriceUsd),
        }),
      }),
    }),

    purchase: tool({
      description:
        "Buy one product under an active mandate. The price is looked up server-side and the mandate policy " +
        "decides whether money moves. Returns completed, blocked or declined.",
      inputSchema: z.object({
        mandateId: z.string(),
        productId: z.string().describe("The id from searchProducts"),
        reasoning: z
          .string()
          .min(10)
          .max(500)
          .describe("Why this product satisfies the human's goal. This is signed into the receipt."),
      }),
      execute: async (input) => {
        const outcome = await purchase({ ...input, simulateDecline });
        if (outcome.status !== "completed") return outcome;
        const { purchase: p } = outcome;
        return {
          status: outcome.status,
          remainingCents: outcome.remainingCents,
          purchase: {
            id: p.id,
            title: p.title,
            retailer: p.retailer,
            amountCents: p.amountCents,
            imageUrl: p.imageUrl,
            captureId: p.captureId,
          },
        };
      },
    }),
  };
}

export type AgentTools = ReturnType<typeof createAgentTools>;
export type AgentUIMessage = UIMessage<never, UIDataTypes, InferUITools<AgentTools>>;
