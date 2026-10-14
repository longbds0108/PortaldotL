import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 90;

const inputSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(5000),
  })).min(1).max(20),
}).strict();

const SYSTEM_PROMPT = `You are Plinths Agent, a helpful assistant for ethical procurement, sealed-bid tenders, and the Plinths marketplace. Answer in the user's language and be concise, practical, and clear. You do not have access to live tenders or bidder documents unless the user includes their text in the chat. Never claim to select or award a tender, access private sealed bids, or submit an on-chain transaction. For proposal evaluation, explain that Plinths only analyzes disclosed bids after the reveal deadline and leaves the award decision to the buyer.`;

const rate = new Map<string, { count: number; resetAt: number }>();

export async function POST(request: Request) {
  if (!process.env.DEEPSEEK_API_KEY) {
    return Response.json({ error: "DeepSeek chat is not configured. Add DEEPSEEK_API_KEY to web/.env.local and restart the server." }, { status: 503 });
  }

  const length = Number(request.headers.get("content-length") || 0);
  if (length > 100_000) return Response.json({ error: "Chat request is too large." }, { status: 413 });
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid chat request." }, { status: 400 });
  if (parsed.data.messages.reduce((n, message) => n + message.content.length, 0) > 30_000) {
    return Response.json({ error: "Chat history is too long. Start a new conversation." }, { status: 413 });
  }

  const caller = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const current = rate.get(caller);
  if (current && current.resetAt > now && current.count >= 30) {
    return Response.json({ error: "Chat limit reached. Try again in an hour." }, { status: 429 });
  }
  if (!current || current.resetAt <= now) rate.set(caller, { count: 1, resetAt: now + 60 * 60_000 });
  else current.count++;

  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: "deepseek-flash",
      thinking: { type: "disabled" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...parsed.data.messages,
      ],
      max_tokens: 3000,
      stream: false,
    }),
    signal: AbortSignal.timeout(75_000),
  }).catch(() => null);

  if (!response) return Response.json({ error: "DeepSeek timed out or could not connect. Try again." }, { status: 502 });
  if (!response.ok) return Response.json({ error: `DeepSeek returned HTTP ${response.status}.` }, { status: 502 });
  const completion = await response.json().catch(() => null) as { choices?: { message?: { content?: string | null } }[] } | null;
  const reply = completion?.choices?.[0]?.message?.content?.trim();
  if (!reply) return Response.json({ error: "DeepSeek returned an empty response. Try again." }, { status: 502 });
  return Response.json({ reply, model: "deepseek-flash" });
}
