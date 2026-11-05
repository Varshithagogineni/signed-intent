import "server-only";
import { google } from "@ai-sdk/google";
import { APICallError, type LanguageModelMiddleware, wrapLanguageModel } from "ai";
import { env } from "@/lib/env";

/** Rate limits and provider overload are worth retrying on another model; bad requests are not. */
function isCapacityError(error: unknown): boolean {
  return APICallError.isInstance(error) && (error.statusCode === 429 || (error.statusCode ?? 0) >= 500);
}

/**
 * The agent's model: the configured primary, falling back through `AI_FALLBACK_MODELS`
 * when a model is rate-limited or overloaded, so a busy free tier doesn't stall a demo.
 */
export function agentModel() {
  const { AI_MODEL, AI_FALLBACK_MODELS } = env();
  const [primary, ...fallbacks] = [AI_MODEL, ...AI_FALLBACK_MODELS].map((id) => google(id));

  const fallback: LanguageModelMiddleware = {
    specificationVersion: "v4",
    wrapGenerate: async ({ doGenerate, params }) => {
      try {
        return await doGenerate();
      } catch (error) {
        for (const model of fallbacks) {
          if (!isCapacityError(error)) break;
          try {
            return await model.doGenerate(params);
          } catch (next) {
            error = next;
          }
        }
        throw error;
      }
    },
    wrapStream: async ({ doStream, params }) => {
      try {
        return await doStream();
      } catch (error) {
        for (const model of fallbacks) {
          if (!isCapacityError(error)) break;
          try {
            return await model.doStream(params);
          } catch (next) {
            error = next;
          }
        }
        throw error;
      }
    },
  };

  return wrapLanguageModel({ model: primary, middleware: fallback });
}

/** A message safe to show people, without leaking provider internals. */
export function describeAgentError(error: unknown): string {
  if (isCapacityError(error)) {
    return "The AI model is at its rate limit right now. Wait about 30 seconds, then send your message again.";
  }
  return "The agent hit an unexpected error. Please try again.";
}
