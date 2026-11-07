"use client";

import { useChat } from "@ai-sdk/react";
import { ArrowUp, Droplets, Dumbbell, Plug } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { AgentUIMessage } from "@/lib/agent/tools";
import { MandatePanel } from "./mandate-panel";
import { type AgentToolPart, AgentWorkspace, MandateRequestCard, PurchaseResult, RecommendationCards } from "./tool-parts";

const EXAMPLES = [
  { prompt: "Buy me a water filter pitcher, budget $40, within a week", title: "Water filter pitcher", meta: "Budget $40 · within a week", icon: Droplets },
  { prompt: "I need a USB-C charger under $25 from bestbuy.com", title: "USB-C charger", meta: "Under $25 · bestbuy.com only", icon: Plug },
  { prompt: "Get a yoga mat, spend at most $35", title: "Yoga mat", meta: "At most $35", icon: Dumbbell },
];

interface ApprovalMessage {
  type: "mandate-approval";
  mandateId: string;
  ok: boolean;
}

const DESKTOP_QUERY = "(min-width: 1024px)"; // Tailwind's `lg`

/**
 * Whether the ledger sidebar is visible. Only one ledger is mounted at a time, so the
 * page never polls the mandate twice. Server render assumes desktop.
 */
function useIsDesktop(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(DESKTOP_QUERY);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => true,
  );
}

/** Server errors arrive as JSON bodies such as `{"error":"…"}`; show just the sentence. */
function readableError(error: Error): string {
  try {
    const parsed = JSON.parse(error.message);
    if (typeof parsed?.error === "string") return parsed.error;
  } catch {
    // Not JSON: the message is already readable.
  }
  return error.message || "Something went wrong. Please try again.";
}

/** The most recent mandate the agent created in this conversation. */
function latestMandateId(messages: AgentUIMessage[]): string | null {
  for (const message of [...messages].reverse()) {
    for (const part of [...message.parts].reverse()) {
      if (part.type === "tool-requestMandate" && part.state === "output-available") return part.output.mandateId;
    }
  }
  return null;
}

type Message = AgentUIMessage;

const isToolPart = (part: Message["parts"][number]): part is AgentToolPart => part.type.startsWith("tool-");

/** Renders **bold** spans; the agent writes plain sentences otherwise. */
function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((chunk, i) =>
        chunk.startsWith("**") && chunk.endsWith("**") ? <strong key={i}>{chunk.slice(2, -2)}</strong> : chunk,
      )}
    </>
  );
}

function AgentAvatar({ busy = false }: { busy?: boolean }) {
  return (
    <div
      className={`grid size-9 shrink-0 place-items-center rounded-full bg-accent text-sm font-semibold text-white ${busy ? "ring-4 ring-accent/20" : ""}`}
      aria-hidden
    >
      S
    </div>
  );
}

function AgentRow({ children, busy }: { children: ReactNode; busy?: boolean }) {
  return (
    <div className="flex gap-3">
      <AgentAvatar busy={busy} />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="text-xs font-semibold text-muted">Signed Intent agent</div>
        {children}
      </div>
    </div>
  );
}

function AgentBubble({ text }: { text: string }) {
  return (
    <div className="w-fit max-w-full rounded-[18px] rounded-tl-md border border-border bg-surface px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap shadow-card">
      <RichText text={text} />
    </div>
  );
}

interface QuickReply {
  label: string;
  text?: string;
  href?: string;
}

/** Suggested next replies, based on what the agent just did. */
function quickReplies(message: Message | undefined): QuickReply[] {
  if (!message || message.role !== "assistant") return [];
  for (const part of [...message.parts].reverse()) {
    if (part.type === "tool-recommendProducts" && part.state === "output-available" && part.output.picks) {
      const { picks, topPickId } = part.output;
      const top = picks.find((p) => p.product.id === topPickId) ?? picks[0];
      return [
        { label: "Buy the top pick", text: `Yes, buy the ${top.product.title} from ${top.product.retailer}.` },
        { label: "Show me other options", text: "Show me a few other options." },
        { label: "Something cheaper", text: "Is there something cheaper that still fits?" },
      ];
    }
    if (part.type === "tool-purchase" && part.state === "output-available" && part.output.status === "completed") {
      return [
        { label: "View receipt", href: `/receipts/${part.output.purchase.id}` },
        { label: "What's left in my budget?", text: "How much is left in my budget?" },
      ];
    }
  }
  return [];
}

export function AgentConsole() {
  const [input, setInput] = useState("");
  const [simulateDecline, setSimulateDecline] = useState(false);
  const { messages, sendMessage, status, error } = useChat<AgentUIMessage>();
  const mandateId = useMemo(() => latestMandateId(messages), [messages]);
  const isDesktop = useIsDesktop();
  const busy = status === "submitted" || status === "streaming";
  const bottomRef = useRef<HTMLDivElement>(null);
  const replies = busy ? [] : quickReplies(messages.at(-1));

  const send = (text: string) => {
    if (!text.trim() || busy) return;
    sendMessage({ text }, { body: { simulateDecline } });
    setInput("");
  };

  // PayPal approval happens in a popup; the return route posts the result back here.
  useEffect(() => {
    const onMessage = (event: MessageEvent<ApprovalMessage>) => {
      if (event.origin !== window.location.origin || event.data?.type !== "mandate-approval") return;
      sendMessage(
        { text: event.data.ok ? "I approved the mandate in PayPal." : "The PayPal approval failed." },
        { body: { simulateDecline } },
      );
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [sendMessage, simulateDecline]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const openApproval = (url: string) => {
    const width = 480;
    const height = 720;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    const popup = window.open(url, "paypal-approval", `width=${width},height=${height},left=${left},top=${top}`);
    if (!popup) window.location.href = url;
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    send(input);
  };

  const lastAssistantId = messages.findLast((m) => m.role === "assistant")?.id;

  const renderAssistant = (message: Message, isLast: boolean) => {
    const toolParts = message.parts.filter(isToolPart);
    let workspaceShown = false;
    const blocks: ReactNode[] = [];
    message.parts.forEach((part, i) => {
      const key = `${message.id}-${i}`;
      if (part.type === "text") {
        if (part.text.trim()) blocks.push(<AgentBubble key={key} text={part.text} />);
        return;
      }
      if (!isToolPart(part)) return;
      if (!workspaceShown) {
        workspaceShown = true;
        // The newest answer keeps its steps open so you can see what the agent just did.
        blocks.push(<AgentWorkspace key={`${message.id}-ws`} parts={toolParts} live={message.id === lastAssistantId} />);
      }
      if (part.type === "tool-requestMandate") blocks.push(<MandateRequestCard key={key} part={part} onApprove={openApproval} />);
      if (part.type === "tool-recommendProducts") {
        blocks.push(<RecommendationCards key={key} part={part} disabled={busy} onChoose={(choice) => send(`Buy the ${choice}.`)} />);
        if (part.state === "output-available" && part.output.question) blocks.push(<AgentBubble key={`${key}-q`} text={part.output.question} />);
      }
      if (part.type === "tool-purchase") blocks.push(<PurchaseResult key={key} part={part} />);
    });
    if (blocks.length === 0) return null;
    return (
      <AgentRow key={message.id} busy={isLast && busy}>
        {blocks}
      </AgentRow>
    );
  };

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px]">
      <section className="flex min-h-0 flex-col">
        <div className="flex-1 overflow-y-auto px-4 py-8 sm:px-8">
          <div className="mx-auto flex max-w-3xl flex-col gap-6">
            {messages.length === 0 && (
              <div className="py-16 text-center">
                <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-accent text-2xl font-semibold text-white shadow-card">S</div>
                <h1 className="mt-6 text-4xl font-semibold tracking-tight">Give your agent a budget, not your wallet.</h1>
                <p className="mx-auto mt-3 max-w-lg text-lg text-muted">
                  Approve one spending limit in PayPal. The agent shops inside it, checks with you before it buys, and every
                  purchase comes with a signed receipt.
                </p>
                <div className="mx-auto mt-10 grid max-w-3xl gap-3 sm:grid-cols-3">
                  {EXAMPLES.map(({ prompt, title, meta, icon: Icon }) => (
                    <button
                      key={prompt}
                      type="button"
                      aria-label={prompt}
                      onClick={() => send(prompt)}
                      className="rounded-2xl border border-border bg-surface p-4 text-left transition hover:border-accent hover:shadow-card"
                    >
                      <Icon className="size-5 text-accent" aria-hidden />
                      <div className="mt-3 font-medium">{title}</div>
                      <div className="mt-0.5 text-sm text-muted">{meta}</div>
                    </button>
                  ))}
                </div>
                <p className="mt-6 text-sm text-muted">Or ask anything, like “which water filter is best for hard water?”</p>
              </div>
            )}

            {messages.map((message, index) =>
              message.role === "user" ? (
                <div key={message.id} className="flex justify-end">
                  {message.parts.map((part, i) =>
                    part.type === "text" ? (
                      <div key={i} className="max-w-[70%] rounded-[18px] rounded-br-md bg-accent px-4 py-2.5 text-[15px] text-white">
                        {part.text}
                      </div>
                    ) : null,
                  )}
                </div>
              ) : (
                renderAssistant(message, index === messages.length - 1)
              ),
            )}

            {status === "submitted" && (
              <AgentRow busy>
                <div className="flex w-fit gap-1.5 rounded-[18px] rounded-tl-md border border-border bg-surface px-4 py-4 shadow-card" aria-label="Thinking">
                  {[0, 150, 300].map((delay) => (
                    <span key={delay} className="size-2 animate-bounce rounded-full bg-muted" style={{ animationDelay: `${delay}ms` }} />
                  ))}
                </div>
              </AgentRow>
            )}

            {replies.length > 0 && (
              <div className="flex flex-wrap gap-2 pl-12">
                {replies.map((reply) =>
                  reply.href ? (
                    <a
                      key={reply.label}
                      href={reply.href}
                      className="rounded-full border border-accent/40 bg-accent-soft px-3.5 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent hover:text-white"
                    >
                      {reply.label}
                    </a>
                  ) : (
                    <button
                      key={reply.label}
                      type="button"
                      onClick={() => send(reply.text!)}
                      className="rounded-full border border-accent/40 bg-accent-soft px-3.5 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent hover:text-white"
                    >
                      {reply.label}
                    </button>
                  ),
                )}
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">{readableError(error)}</div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {mandateId && !isDesktop && (
          <details className="border-t border-border bg-surface-muted">
            <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium">Budget, purchases and activity</summary>
            <div className="max-h-[50dvh] overflow-y-auto border-t border-border">
              <MandatePanel mandateId={mandateId} />
            </div>
          </details>
        )}

        <form onSubmit={onSubmit} className="border-t border-border bg-background/90 px-4 py-4 backdrop-blur sm:px-8">
          <div className="mx-auto max-w-3xl">
            <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface p-2 shadow-card focus-within:border-accent">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="What should the agent buy, and what's your budget?"
                className="min-w-0 flex-1 bg-transparent px-3 py-2 text-base outline-none"
              />
              <button
                type="submit"
                aria-label="Send"
                disabled={busy || !input.trim()}
                className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-white transition disabled:opacity-40"
              >
                <ArrowUp className="size-5" aria-hidden />
              </button>
            </div>
            <label className="mt-2 flex items-center justify-end gap-2 text-xs text-muted opacity-70 transition-opacity hover:opacity-100">
              <input type="checkbox" checked={simulateDecline} onChange={(e) => setSimulateDecline(e.target.checked)} />
              Sandbox: make PayPal decline the next payment
            </label>
          </div>
        </form>
      </section>

      {isDesktop && (
        <aside className="min-h-0 border-l border-border bg-surface-muted">
          <MandatePanel mandateId={mandateId} />
        </aside>
      )}
    </div>
  );
}
