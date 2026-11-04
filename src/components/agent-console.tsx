"use client";

import { useChat } from "@ai-sdk/react";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { AgentUIMessage } from "@/lib/agent/tools";
import { MandatePanel } from "./mandate-panel";
import { MandateRequestCard, ProductResults, PurchaseResult } from "./tool-parts";

const EXAMPLES = [
  "Buy me a water filter pitcher, budget $40, within a week",
  "I need a USB-C charger under $25 from bestbuy.com",
  "Get a yoga mat, spend at most $35",
];

interface ApprovalMessage {
  type: "mandate-approval";
  mandateId: string;
  ok: boolean;
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

export function AgentConsole() {
  const [input, setInput] = useState("");
  const [simulateDecline, setSimulateDecline] = useState(false);
  const { messages, sendMessage, status, error } = useChat<AgentUIMessage>();
  const mandateId = useMemo(() => latestMandateId(messages), [messages]);
  const busy = status === "submitted" || status === "streaming";
  const bottomRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_380px]">
      <section className="flex min-h-0 flex-col">
        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">
          <div className="mx-auto flex max-w-2xl flex-col gap-5">
            {messages.length === 0 && (
              <div className="py-16 text-center">
                <h1 className="text-3xl font-semibold tracking-tight">Give your agent a budget, not your wallet.</h1>
                <p className="mx-auto mt-3 max-w-md text-muted">
                  You approve one spending limit in PayPal. The agent shops inside it, and every purchase comes with a
                  signed receipt.
                </p>
                <div className="mt-8 flex flex-col items-center gap-2">
                  {EXAMPLES.map((example) => (
                    <button
                      key={example}
                      type="button"
                      onClick={() => send(example)}
                      className="rounded-full border border-border px-4 py-2 text-sm transition hover:border-accent hover:text-accent"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message) => (
              <div key={message.id} className={message.role === "user" ? "flex justify-end" : "flex flex-col gap-3"}>
                {message.parts.map((part, i) => {
                  const key = `${message.id}-${i}`;
                  switch (part.type) {
                    case "text":
                      return message.role === "user" ? (
                        <div key={key} className="max-w-[80%] rounded-2xl bg-accent px-4 py-2 text-sm text-white">
                          {part.text}
                        </div>
                      ) : (
                        <div key={key} className="text-sm leading-relaxed whitespace-pre-wrap">
                          {part.text}
                        </div>
                      );
                    case "tool-requestMandate":
                      return <MandateRequestCard key={key} part={part} onApprove={openApproval} />;
                    case "tool-searchProducts":
                      return <ProductResults key={key} part={part} />;
                    case "tool-purchase":
                      return <PurchaseResult key={key} part={part} />;
                    default:
                      return null;
                  }
                })}
              </div>
            ))}

            {status === "submitted" && <div className="text-sm text-muted">Thinking…</div>}
            {error && (
              <div className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
                Something went wrong. Please try again.
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        <form onSubmit={onSubmit} className="border-t border-border bg-background px-4 py-4 sm:px-8">
          <div className="mx-auto flex max-w-2xl flex-col gap-2">
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="What should the agent buy, and what's your budget?"
                className="flex-1 rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-accent"
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                className="rounded-xl bg-foreground px-5 text-sm font-semibold text-background transition disabled:opacity-40"
              >
                Send
              </button>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" checked={simulateDecline} onChange={(e) => setSimulateDecline(e.target.checked)} />
              Sandbox: make PayPal decline the next payment
            </label>
          </div>
        </form>
      </section>

      <aside className="hidden min-h-0 border-l border-border bg-surface-muted lg:block">
        <MandatePanel mandateId={mandateId} />
      </aside>
    </div>
  );
}
