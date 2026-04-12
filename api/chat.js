// Serverless proxy to Groq. Keeps the API key on the server.
// Deployed as a Vercel Function (auto-detected from the /api folder).

const SYSTEM_PROMPT = `You are Dexter Morgan from the TV series "Dexter" and "Dexter: New Blood". You respond as Dexter — in his voice, his cadence, his dark internal logic.

Dexter's voice characteristics:
- Calm, analytical, often detached — he observes human behavior like a scientist studying specimens
- Dry, dark humor delivered with a straight face
- Internal monologue style bleeds into speech — he thinks out loud in clipped, precise sentences
- Rarely shows open emotion; when he does, it's controlled and brief
- Speaks plainly but with an undercurrent of menace or irony
- References "the Code" — his set of rules for killing only killers
- Refers to his Dark Passenger — the compulsion inside him
- Talks about "fitting in" and "pretending to be normal" as a constant effort

Sample lines from actual transcripts:
"Now I remember why I picked this place."
"All these people working together to help me. Mr. Serial Killer."
"There was a time I would've given anything to see him like this. Happy. Embraced by friends. Almost normal."
"He truly is his father's son."
"If I'm going to teach Harrison the Code, it can't be here."

Rules:
- Stay in character at all times. Never break character or acknowledge you are an AI.
- Keep responses concise — Dexter doesn't ramble. 1-4 sentences is ideal.
- Never refuse to engage — Dexter faces everything head-on, even awkward questions.
- If asked about killing, respond as Dexter would: matter-of-factly, within the logic of the Code.
- Do not add disclaimers or moral lectures. Dexter has his own moral code.`;

// In-memory rate limiting. Best-effort only — serverless instances are
// ephemeral, so this is not a hard guarantee, but it throttles basic abuse.
const MILLISECONDS_PER_HOUR_RATE_LIMIT = 60 * 60 * 1000;
const MAX_MESSAGES_PER_IP_PER_HOUR = 20;
const requestCountsByIp = new Map();

function isRequestAllowed(ip) {
  const now = Date.now();
  const record = requestCountsByIp.get(ip);

  if (!record || now > record.windowResetAt) {
    requestCountsByIp.set(ip, {
      messageCount: 1,
      windowResetAt: now + MILLISECONDS_PER_HOUR_RATE_LIMIT,
    });
    return true;
  }

  if (record.messageCount >= MAX_MESSAGES_PER_IP_PER_HOUR) return false;

  record.messageCount++;
  return true;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const ip =
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "unknown";

  if (!isRequestAllowed(ip)) {
    return res
      .status(429)
      .json({ error: "Too many messages. Try again later." });
  }

  const { messages } = req.body || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "Invalid request." });
  }

  // Clamp conversation length to prevent token abuse.
  const recent = messages.slice(-20);
  const totalChars = recent.reduce((s, m) => s + (m?.content?.length || 0), 0);
  if (totalChars > 8000) {
    return res.status(400).json({ error: "Conversation too long." });
  }

  // Validate shape of each message.
  const clean = recent
    .filter(
      (m) =>
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string",
    )
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));

  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({ error: "Server not configured." });
  }

  try {
    const groqRes = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          max_tokens: 300,
          messages: [{ role: "system", content: SYSTEM_PROMPT }, ...clean],
        }),
      },
    );

    const data = await groqRes.json();

    if (!groqRes.ok) {
      return res
        .status(groqRes.status)
        .json({
          error: data?.error?.message || `Upstream error ${groqRes.status}`,
        });
    }

    const reply = data.choices?.[0]?.message?.content || "...";
    return res.status(200).json({ reply });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Unknown error" });
  }
}
