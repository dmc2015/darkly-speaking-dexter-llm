# Darkly Speaking — Dexter

A character chatbot that roleplays as Dexter Morgan from the Showtime series.
Built as a portfolio project to demonstrate AI API integration.

**Stack:** vanilla HTML/CSS/JS frontend + a single Vercel serverless function
that proxies requests to [Groq](https://groq.com) running Llama 3.3 70B.

## Architecture

```
[ browser ] ── POST /api/chat ──> [ Vercel Function ] ── Groq API
                                    │
                                    ├─ holds GROQ_API_KEY (env var)
                                    ├─ per-IP rate limit (20/hr)
                                    ├─ input length clamping
                                    └─ system prompt (server-side)
```

The API key never touches the browser. The Dexter system prompt lives on the
server so it can't be inspected or tampered with.

## Local development

Serve the folder with any static server:

```bash
python3 -m http.server 8000
```

Note: `/api/chat` only works when deployed to Vercel (or running
`vercel dev` locally with the CLI).

## Deploy to Vercel

1. Push this repo to GitHub.
2. Go to [vercel.com](https://vercel.com) → **Add New → Project** → import the repo.
3. In **Environment Variables**, add:
   - `GROQ_API_KEY` = your Groq API key (from [console.groq.com](https://console.groq.com))
4. Deploy. You'll get a public URL — no config needed, Vercel auto-detects
   the `api/` folder as serverless functions.

## Quota

Free-tier Groq limits on `llama-3.3-70b-versatile`:

- 30 requests/min
- 1,000 requests/day
- 12,000 tokens/min
- **100,000 tokens/day** (this is the binding limit — roughly 100–150 messages/day)

The per-IP rate limit in `api/chat.js` is intentionally conservative to keep
one visitor from burning the whole day's quota.
