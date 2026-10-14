"use client";

import { Bot, Loader2, Send, UserRound } from "lucide-react";
import { FormEvent, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppliedTheme } from "@/lib/preferences";

type Message = { role: "user" | "assistant"; content: string };

export function AgentChat() {
  const theme = useAppliedTheme();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || busy) return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setDraft("");
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next.slice(-16) }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string; reply?: string };
      if (!response.ok || !body.reply) throw new Error(body.error || `Chat failed (${response.status}).`);
      setMessages([...next, { role: "assistant", content: body.reply }]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not reach Plinths Agent.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex min-h-0 flex-col">
      <CardHeader className="shrink-0 pb-3">
        <CardTitle className="flex items-center gap-2"><Bot className="size-4" /> Chat with Plinths Agent</CardTitle>
        <CardDescription>Ask about procurement, tender requirements, or how Plinths works.</CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-col space-y-3">
        <div className="h-[clamp(150px,30vh,280px)] min-h-0 flex-1 space-y-3 overflow-y-auto rounded-2xl border border-border bg-overlay/[0.02] p-4" aria-live="polite">
          {messages.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Hi! I can help explain tender workflows and answer procurement questions.</p>
          ) : messages.map((message, index) => (
            <div key={index} className={`flex gap-2.5 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
              {message.role === "assistant" && <Bot className="mt-1 size-4 shrink-0 text-brand" />}
              <p className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${message.role === "user" ? "bg-primary text-primary-foreground" : "bg-overlay/[0.06]"}`}>{message.content}</p>
              {message.role === "user" && <UserRound className="mt-1 size-4 shrink-0 text-muted-foreground" />}
            </div>
          ))}
          {busy && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Agent is thinking…</div>}
        </div>
        {error && <Alert variant="warning"><span role="alert">{error}</span></Alert>}
        <form onSubmit={send} className="flex items-center gap-3">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }}
            maxLength={5000}
            rows={2}
            placeholder="Write a message… (Enter to send, Shift+Enter for a new line)"
            aria-label="Message for Plinths Agent"
            className="min-w-0 flex-1 resize-none rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
          <Button
            type="submit"
            disabled={busy || !draft.trim()}
            className="rounded-xl transition-colors duration-200 hover:brightness-90"
            style={{
              backgroundColor: theme === "light" ? "#19151d" : "#fdfdfd",
              color: theme === "light" ? "#fdfdfd" : "#19151d",
            }}
          >
            <Send /> Send
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
