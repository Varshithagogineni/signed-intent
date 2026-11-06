import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const mandateStatuses = [
  "pending_approval", // order created, waiting for the human to approve in PayPal
  "active", // authorization held, the agent may spend within policy
  "closed", // final capture made or remainder voided
  "expired",
  "revoked", // the human pulled the agent's access
] as const;
export type MandateStatus = (typeof mandateStatuses)[number];

/** A human-approved spending authority for the agent, backed by a PayPal authorization. */
export const mandates = sqliteTable("mandates", {
  id: text("id").primaryKey(),
  goal: text("goal").notNull(),
  capCents: integer("cap_cents").notNull(),
  maxPerPurchaseCents: integer("max_per_purchase_cents"),
  allowedRetailers: text("allowed_retailers", { mode: "json" }).$type<string[]>(),
  maxPurchases: integer("max_purchases"),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  status: text("status", { enum: mandateStatuses }).notNull().default("pending_approval"),
  spentCents: integer("spent_cents").notNull().default(0),
  paypalOrderId: text("paypal_order_id").unique(),
  approveUrl: text("approve_url"),
  authorizationId: text("authorization_id"),
  authorizationExpiresAt: integer("authorization_expires_at", { mode: "timestamp_ms" }),
  /** Compact JWS over the mandate terms, signed when the human approves. */
  signedMandate: text("signed_mandate"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  activatedAt: integer("activated_at", { mode: "timestamp_ms" }),
});

export const purchaseStatuses = ["completed", "refunded"] as const;

/** A capture the agent made against a mandate, with its signed intent receipt. */
export const purchases = sqliteTable("purchases", {
  id: text("id").primaryKey(),
  mandateId: text("mandate_id")
    .notNull()
    .references(() => mandates.id),
  productId: text("product_id").notNull(),
  title: text("title").notNull(),
  retailer: text("retailer").notNull(),
  productUrl: text("product_url").notNull(),
  imageUrl: text("image_url"),
  amountCents: integer("amount_cents").notNull(),
  /** The agent's own explanation of why this item satisfies the mandate goal. */
  reasoning: text("reasoning").notNull(),
  captureId: text("capture_id").notNull().unique(),
  status: text("status", { enum: purchaseStatuses }).notNull().default("completed"),
  /** Compact JWS binding the mandate, the item, the agent's reasoning and the PayPal capture. */
  signedReceipt: text("signed_receipt").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const activityKinds = [
  "mandate_created",
  "mandate_approved",
  "purchase_completed",
  "purchase_blocked",
  "payment_declined",
  "mandate_closed",
  "mandate_revoked",
  "purchase_refunded",
  "dispute_opened",
  "dispute_responded",
] as const;
export type ActivityKind = (typeof activityKinds)[number];

/** Append-only audit trail of everything the agent tried, including what policy refused. */
export const activity = sqliteTable("activity", {
  id: text("id").primaryKey(),
  mandateId: text("mandate_id")
    .notNull()
    .references(() => mandates.id),
  kind: text("kind", { enum: activityKinds }).notNull(),
  amountCents: integer("amount_cents"),
  message: text("message").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

/** The dispute agent's assessment, stored so the human sees the same advice on every visit. */
export interface DisputeAnalysis {
  recommendation: "provide_evidence" | "refund" | "accept_claim" | "send_message";
  confidence: "high" | "medium" | "low";
  summary: string;
  rationale: string;
  /** Draft text for PayPal: evidence notes or a message to the buyer, editable before sending. */
  draft: string;
  /** Which model wrote it, or "rules" when the deterministic fallback did. */
  author: string;
  createdAt: string;
}

/** A PayPal dispute mirrored locally and matched to the purchase it is about. */
export const disputes = sqliteTable("disputes", {
  /** PayPal's dispute ID, e.g. `PP-D-12345`. */
  id: text("id").primaryKey(),
  purchaseId: text("purchase_id").references(() => purchases.id),
  captureId: text("capture_id"),
  reason: text("reason").notNull(),
  status: text("status").notNull(),
  stage: text("stage"),
  amountCents: integer("amount_cents"),
  messages: text("messages", { mode: "json" }).notNull().$type<{ postedBy: string; content: string; postedAt: string | null }[]>(),
  /** Seller actions PayPal currently allows, from the dispute's HATEOAS links. */
  actions: text("actions", { mode: "json" }).notNull().$type<string[]>(),
  sellerResponseDueAt: integer("seller_response_due_at", { mode: "timestamp_ms" }),
  analysis: text("analysis", { mode: "json" }).$type<DisputeAnalysis>(),
  /** What the human decided, e.g. "Refunded $19.99". */
  resolution: text("resolution"),
  openedAt: integer("opened_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export type Dispute = typeof disputes.$inferSelect;
export type Mandate = typeof mandates.$inferSelect;
export type Purchase = typeof purchases.$inferSelect;
export type Activity = typeof activity.$inferSelect;
