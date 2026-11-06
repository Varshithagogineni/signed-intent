import { convertToModelMessages, createUIMessageStreamResponse, isStepCount, streamText, toUIMessageStream } from "ai";
import { agentModel, describeAgentError } from "@/lib/agent/model";
import { SYSTEM_PROMPT } from "@/lib/agent/prompt";
import { type AgentUIMessage, createAgentTools } from "@/lib/agent/tools";
import { rateLimit } from "@/lib/rate-limit";

export const maxDuration = 60;

interface ChatRequest {
  messages: AgentUIMessage[];
  simulateDecline?: boolean;
}

export async function POST(req: Request) {
  const limited = rateLimit(req, "chat");
  if (limited) return limited;

  const { messages, simulateDecline = false }: ChatRequest = await req.json();

  const result = streamText({
    model: agentModel(),
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    tools: createAgentTools({ simulateDecline }),
    stopWhen: isStepCount(8),
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      onError: (error) => {
        console.error("Agent stream failed", error);
        return describeAgentError(error);
      },
    }),
  });
}
