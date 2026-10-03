# asky — the AI Apprentice

Hack-Nation × ElevenLabs, challenge 01. asky watches an expert do real screen work, asks *why* at the right moment, maps the process onto the application's own functions, and teaches it to the next hire — stopping them before a guardrail breaks.

```
Interview ─┐
           ├─► Capture ─► Debrief ─► Teach-back ─► Knowledge Hub ─► Teach
Docs ──────┘     ▲  (Jev / rules decide when to ask)   │  pages · graph · lessons
                 └──── domain MCP generated from the app ┘          └► agents (MCP + guardrails)
```

## Quick start

```bash
pnpm install
cp .env.example .env.local        # optional — everything has an offline fallback
pnpm dev                          # http://localhost:3210
pnpm harness                      # discover the app → generate its domain MCP (needs the dev server)
pnpm simulate                     # optional: scripted Sabine session + Lena training through the real API
```

Open http://localhost:3210 → **Capture** (expert), **Hub** (knowledge), **Teach** (new hire), **Interview**.

| Script | What it does |
|---|---|
| `pnpm harness [--no-crawl] [--url … --openapi … --start …]` | OpenAPI + safe Playwright UI crawl → MCP tool catalog (`data/generated/*.tools.json`), registered with the server |
| `pnpm mcp` | stdio MCP server: the app's tools + `check_guardrail`, `find_pages`, `get_page`, `get_process` |
| `pnpm simulate` | end-to-end run through the HTTP API (capture → debrief → teach-back → knowledge → tutor blocks 4 wrong decisions) |
| `pnpm e2e` | browser test of the whole UI (Playwright, typed answers instead of voice), screenshots in `e2e-shots/` |
| `pnpm setup:voice` | creates the ElevenLabs agent (prompt, `skip_turn`, overrides) → put the id in `.env.local` |

On Ubuntu 20.04 Playwright's Chromium needs: `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu22.04-x64 pnpm exec playwright install chromium-headless-shell`.

### Keys (all optional)

| Key | Upgrades | Without it |
|---|---|---|
| `ANTHROPIC_API_KEY` | question phrasing, knowledge extraction, debrief gaps, teach-back, vision (Excel/Outlook frames), MCP descriptions | templates + pattern extractor |
| `TYPESAFE_API_KEY` | **Jev** decides interrupts in 70–500 ms with calibrated probabilities | deterministic rule scorer (<1 ms) |
| `ELEVENLABS_API_KEY` + `ELEVENLABS_AGENT_ID` | ElevenAgents voice (VAD, turn-taking, `skip_turn`, Expressive Mode) | browser `speechSynthesis` + Web Speech recognition; text input always works |

## The three modules

**1 · Capture** (`/capture`). The mock ERP (`/app`, "Ledgerline AP") runs in an iframe and reports every API call and UI interaction through a postMessage bridge; the harness-generated catalog turns `PATCH /api/ap/invoices/4471/coding` into `set_invoice_coding(id=4471, costCenter=0400)`. Screen share sends a frame every 1.5 s; frames become screen moments, and when the expert leaves the app the vision model turns frames into `external` events. Every step is compared with the execution graph → deviation candidates → **Jev** (or rules) decides `ignore | ask_now | ask_before_commit | queue_debrief` → Claude phrases the question *speculatively*, so it is ready when the pause comes.

**2 · Map** (debrief → teach-back → hub). Unanswered and queued questions plus generated gap questions (guardrails, counterfactuals, troubleshooting) form the debrief (≥ 3). asky then explains the whole process back; the expert confirms or corrects (corrections re-run extraction). Only then is knowledge committed: situation **pages** with machine-checkable guardrails, the **process graph** (mined from traces), the **Work Map** (every step → screen moment, decision, reason in the expert's words, guardrails), and regenerated **lessons**.

**3 · Teach** (`/teach`). The new hire works unseen training invoices. On opening a case a page covers, the tutor asks for a prediction ("what would Sabine do?") and judges it. Before any write, the gate runs `checkGuardrails`; a violation blocks the save, highlights the field, and the tutor explains it with Sabine's quote and screen moment. Mistakes feed the page's "common new-hire mistakes"; the session ends with a mastery map and what to practice next.

## Our additions beyond the brief

- **Pages** — one wiki page per *judgment* ("Equipment over €5,000 is capex"), not per process: when it applies (machine-checkable trigger), how to recognize it, steps linked to graph nodes, why (expert quotes), guardrails (`NEVER / STOP & ASK / LIMIT / REQUIRED` with executable rules), edge cases with dates, troubleshooting, new-hire mistakes, open questions, health (`draft → confirmed → stale`), version history. Every sentence has provenance — *git blame for knowledge*: who said it, when, the screen moment, ▶ listen.
- **Domain MCP harness** — discovers any web app from OpenAPI + a safe UI crawl (mutations are intercepted, never executed), classifies tools `read / write / irreversible` (confirm dialogs like "cannot be undone" are evidence). The same tools are the vocabulary of events, the graph, the guardrails, and an MCP server for agents.
- **Execution graph** — doc baseline (2019 process, dashed) + mined reality (solid, with probabilities, durations, experts), editable (React Flow): add MCP functions, other apps (Excel/Word/Outlook), checks, notes, guardrails. **Permutable groups**: steps seen in both orders get one "does order matter?" debrief question; the answer is stored and never asked again.
- **Interrupt policy** — big deviations live at a natural pause, small ones (reorder, dwell) to the debrief; one live question per case; semantic de-duplication across cases; budget 5 / 10 min; **pre-commit gate**: before an irreversible step with an open important question (or a known guardrail being broken → "is this an exception?") the click is held until asked.
- **Two interviews** — free-form (stated, unverified knowledge) and AI-guided (asks about open questions, rare branches, single-expert pages, unknown step order, stated-but-never-observed).
- **Drift & bus factor** — docs vs reality report; pages backed by one expert are flagged.
- **Agent-ready export** — `/api/export/agent` (Markdown skill / JSON) + `pnpm mcp`, whose write tools refuse when a guardrail is violated.

## The Apprentice Test

1. **When to ask.** Pause = no typing/clicking for 1.8 s (1.0 s right after a save — a natural boundary) **and** no one speaking (VAD) **and** the agent quiet. Typing sends `user_activity` to ElevenLabs so it never barges in; the agent's prompt makes it `skip_turn` when the expert thinks aloud. The decision itself takes <1 ms (rules) / 70–500 ms (Jev), the phrasing is prepared ahead.
2. **What to ask.** Only deviations from the graph and the pages: value overrides, inserted steps, doc contradictions, skips, retries. Anything a confirmed page already explains scores low (uncertainty factor), so asky asks only about what is new. Questions target reasons and limits ("…and is there an amount where that rule kicks in?").
3. **When it has understood.** Debrief ends when no queued question above the importance threshold remains; the teach-back is generated *from the extracted knowledge itself* (what will be committed), and nothing is saved until the expert says "yes".
4. **Whether the new hire learned.** Unseen training cases; prediction checks; the tutor blocks wrong saves with the expert's reasoning (see `pnpm simulate`: 4 catches on 3 new invoices); mastery per page; mistakes fed back into pages.
5. **Trust.** "Off the record" (voice or button) stops capture and deletes that window's transcript and frames; `[data-pii]` fields (IBAN, e-mail) are blurred on screen during capture; transcripts are PII-redacted before storage; experts approve pages (confirm / mark outdated / add edge case).

## Architecture

```
src/
  app/app/…            mock ERP "Ledgerline AP" (instrumented via lib/ap/bridge.ts)
  app/api/ap/…         its REST API + /openapi.json
  app/capture|teach|interview|hub/…   apprentice UI
  lib/engine/          context · graph · deviation · rules · jev · decide · question · guard
  lib/knowledge/       extract · commit · mining · debrief · lessons · interview
  lib/mcp/             generate (harness) · catalog (request ↔ tool)
  components/voice/    ElevenLabs / browser voice behind one interface
harness/               discover.ts (CLI) · crawl.ts (Playwright) · mcp-server.ts
scripts/               simulate.ts · e2e-ui.ts · setup-elevenlabs.ts
data/                  db.json, frames/, generated/ (runtime, git-ignored)
```

## Next: a real app

The harness is app-agnostic. For a showcase on a real open-source invoicing app (e.g. InvoiceShelf / Invoice Ninja): run it locally, `pnpm harness --url http://localhost:8000 --app invoiceshelf --openapi <spec path> --start /admin/invoices`, then capture through a small browser extension (or proxy) that forwards XHRs as `asky:api` messages — everything downstream (graph, pages, gate, MCP) stays the same.
