import { google } from "@ai-sdk/google";
import { convertToModelMessages, createUIMessageStreamResponse, isStepCount, streamText, toUIMessageStream } from "ai";
import { SYSTEM_PROMPT } from "@/lib/agent/prompt";
import { type AgentUIMessage, createAgentTools } from "@/lib/agent/tools";
import { env } from "@/lib/env";

export const maxDuration = 60;

interface ChatRequest {
  messages: AgentUIMessage[];
  simulateDecline?: boolean;
}

export async function POST(req: Request) {
  const { messages, simulateDecline = false }: ChatRequest = await req.json();

  const result = streamText({
    model: google(env().AI_MODEL),
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    tools: createAgentTools({ simulateDecline }),
    stopWhen: isStepCount(8),
  });

  return createUIMessageStreamResponse({ stream: toUIMessageStream({ stream: result.stream }) });
}
