import "server-only";
import { z } from "zod";

const envSchema = z.object({
  PAYPAL_CLIENT_ID: z.string().min(1),
  PAYPAL_CLIENT_SECRET: z.string().min(1),
  PAYPAL_ENVIRONMENT: z.enum(["sandbox", "live"]).default("sandbox"),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1),
  AI_MODEL: z.string().default("gemini-3.5-flash"),
  CHANNEL3_API_KEY: z.string().min(1),
  DATABASE_PATH: z.string().default("data/signed-intent.db"),
  /** Ed25519 private key as JWK JSON. Generated on first run in development when absent. */
  SIGNING_PRIVATE_JWK: z.string().optional(),
  /** Public origin used for PayPal return URLs, e.g. https://signed-intent.onrender.com */
  APP_URL: z.url().default("http://localhost:3000"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/** Validated server environment. Throws a readable error listing every missing variable. */
export function env(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${problems}\nSee .env.example.`);
  }
  cached = parsed.data;
  return cached;
}
