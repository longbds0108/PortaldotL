import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

const inputSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(5000),
  })).min(1).max(20),
}).strict();

const SYSTEM_PROMPT = `You are Plinths Agent, a helpful assistant for ethical procurement, sealed-bid tenders, and the Plinths marketplace. Answer in the user's language and be concise, practical, and clear. You do not have access to live tenders or bidder documents unless the user includes their text in the chat. Never claim to select or award a tender, access private sealed bids, or submit an on-chain transaction. For proposal evaluation, explain that Plinths only analyzes disclosed bids after the reveal deadline and leaves the award decision to the buyer.

These Plinths rules are enforced by its smart contracts on PortaldotV3 Testnet (amounts in tPOTv3). State them as facts, not as typical practice:
- Tender phases follow block time: Open, then Reveal, then Evaluation, then Awarded. Nobody, including Plinths and the buyer, can extend a deadline or accept a late bid or reveal.
- A bid is a commitment: keccak256 of the tender id, bidder address, amount, a random salt and the hash of the proposal's AES-256-GCM key. The proposal is encrypted in the browser; only ciphertext goes to IPFS. While a tender is Open, a bidder may replace their commitment without paying a second bond.
- The reveal deadline is at least 24 hours after the submission deadline. Revealing needs the amount, salt and document key from the backup file the bidder downloaded (or the copy in their browser). Without them the bid can never be revealed.
- An unrevealed bid is excluded from evaluation and cannot win. If the tender has a bid bond, that bond goes to a fixed Plinths treasury, never to the buyer. Bidders who revealed withdraw their full bond.
- The buyer cannot bid on their own tender, cannot change deadlines, and can cancel only while the tender is Open and has no bids. The buyer can award only in Evaluation, only once, only to a bidder who revealed, with a reason published on IPFS. If nobody reveals, the tender ends as Failed.
- NFT auctions: bidders lock a public deposit larger than their sealed price; the highest revealed price that meets the reserve and the deposit wins, and an earlier reveal wins a tie. A bidder who never reveals loses 10% of the deposit to the treasury, never to the seller. Anyone can settle after the reveal deadline; everyone then withdraws what they are owed.
- Disputes: the Verification Engine decides what on-chain data can prove, an appointed arbitration panel decides judgement calls, and quality of goods or services stays between the parties. A dispute never reverses an award or settlement already on-chain, and Plinths is not a legal authority.
For details of a specific tender (budget, bond, deadlines), tell the user to check its tender page.`;

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
    signal: AbortSignal.timeout(55_000),
  }).catch(() => null);

  if (!response) return Response.json({ error: "DeepSeek timed out or could not connect. Try again." }, { status: 502 });
  if (!response.ok) return Response.json({ error: `DeepSeek returned HTTP ${response.status}.` }, { status: 502 });
  const completion = await response.json().catch(() => null) as { choices?: { message?: { content?: string | null } }[] } | null;
  const reply = completion?.choices?.[0]?.message?.content?.trim();
  if (!reply) return Response.json({ error: "DeepSeek returned an empty response. Try again." }, { status: 502 });
  return Response.json({ reply, model: "deepseek-flash" });
}
