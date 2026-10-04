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
| `pnpm seed:erpnext [--reset]` | seeds a local ERPNext with the same story (see *Real-app showcase*) |
| `pnpm e2e:erpnext [--keep]` | end-to-end on ERPNext, vision only: capture → debrief → teach-back → pages → tutor catches |
| `pnpm make:interview` | generates the German demo interview with ElevenLabs voices |

On Ubuntu 20.04 Playwright's Chromium needs: `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu22.04-x64 pnpm exec playwright install chromium-headless-shell`.

### Keys (all optional)

| Key | Upgrades | Without it |
|---|---|---|
| `ANTHROPIC_API_KEY` | question phrasing, knowledge extraction, debrief gaps, teach-back, vision (Excel/Outlook frames, ERPNext screens), MCP descriptions + alignment | templates + pattern extractor (ERPNext capture needs it) |
| `TYPESAFE_API_KEY` | **Jev** decides interrupts in 70–500 ms with calibrated probabilities | deterministic rule scorer (<1 ms) |
| `ELEVENLABS_API_KEY` + `ELEVENLABS_AGENT_ID` | ElevenAgents voice (VAD, turn-taking, `skip_turn`, Expressive Mode); Scribe for recorded interviews | browser `speechSynthesis` + Web Speech recognition; text input always works |
| `ERPNEXT_URL` / `ERPNEXT_USER` / `ERPNEXT_PASSWORD` | the real-app showcase (defaults: `http://localhost:8080`, `Administrator`, `admin`) | ERPNext option disabled |
| `ERPNEXT_PUBLIC_URL` | where the browser reaches ERPNext when it differs from `ERPNEXT_URL` (asky in Docker) | `ERPNEXT_URL` |

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
  lib/erpnext/          client · model · seed · mirror (case model) · observe (vision → events)
  lib/voice/stt.ts     ElevenLabs Scribe (diarized speech-to-text)
harness/frappe.ts      Frappe/ERPNext adapter: DocType metadata → spec, login crawl
scripts/               simulate.ts · e2e-ui.ts · e2e-erpnext.ts · seed-erpnext.ts · make-interview-audio.ts · setup-elevenlabs.ts
data/                  db.json, frames/, generated/ (runtime, git-ignored)
```

## Real-app showcase: ERPNext, vision only

The same apprentice on a real ERP it cannot instrument. asky sees only the shared screen; ERPNext's API is used read-only to confirm what was committed.

```bash
git clone https://github.com/frappe/frappe_docker ~/erpnext && cd ~/erpnext && docker compose -f pwd.yml up -d   # → http://localhost:8080, Administrator / admin
pnpm seed:erpnext                 # setup wizard, Keller Maschinenbau, cost centers, suppliers, approval workflow, the AP queue
pnpm harness --frappe "Purchase Invoice,Supplier,Cost Center" --url http://localhost:8080 --app erpnext \
             --start /app/purchase-invoice/<ACC-PINV-…>   # metadata → domain MCP, aligned with the hub's vocabulary
pnpm e2e:erpnext                  # Playwright plays Sabine and Lena in ERPNext; frames go through vision → events → questions → pages → tutor
```

- **Harness without OpenAPI.** Frappe describes itself: DocType form sections become tools (`update_purchase_invoice_accounting_dimensions`), submittable doctypes get `submit/cancel` (irreversible), the active workflow becomes one tool per transition (`request_approval_…`, `post_…`, `hold_…`). The crawl logs in, opens a real invoice, clicks through *Actions → Post → Yes* with mutations intercepted. `alignCatalog` then maps every step the knowledge hub speaks (`set_invoice_coding`, `hold_invoice`, `post_invoice`, …) onto ERPNext's tools — **11/11 found**, with argument mappings and notes where ERPNext differs (approver chosen by workflow role; hold reason is a comment). See `/hub/tools?app=erpnext`.
- **Vision capture.** Each changed frame (1600 px) → Claude Haiku reads a structured screen state (`view, invoiceRef, costCenter, status, dialog, …`) → consecutive states are diffed into the same domain events (`get_invoice`, `set_invoice_coding 4711 → 0400`, `request_approval`, `hold_invoice`, `post_invoice`) → each committed change is confirmed against ERPNext's REST API before it can become knowledge. ~2 s per frame.
- **Pre-commit moment.** ERPNext asks *"Are you sure you want to Post?"* — when vision sees that dialog, Capture holds the open question, and **Teach blocks**: the tutor says "Stop — don't click Yes" with Sabine's quote before anything is saved.
- **Same knowledge, any app.** ERPNext invoices are mirrored into asky's case model, so pages, guardrails, predictions and the gate run unchanged; suppliers are matched by name across apps. Capture and Teach both offer *Ledgerline AP (instrumented)* or *ERPNext (vision only)*.

## Recorded interviews (any language)

`pnpm make:interview` generates a 3½-minute German interview with two ElevenLabs voices (interviewer + Sabine, fictional), `public/demo/interview-sabine-de.mp3`. **Interview → Recorded interview → Import** (or upload any audio): ElevenLabs **Scribe v2** transcribes with word timestamps and speaker diarization, the asking speaker is recognized as the interviewer, the expert's words become *stated* knowledge — pages written in English with verbatim German quotes + translation, and every quote replays from the recording (`▶ play recording`). It both corroborates captured pages and adds what no screen shows (Skonto deadlines, bank-detail fraud call-back, four-eyes for new suppliers, the €800 low-value-asset line, the backup approver).

## Deploy (demo server)

asky and ERPNext run on one VPS behind Caddy (HTTPS is required for screen sharing and the microphone):

- `https://asky.2-31-1-203.sslip.io` — asky (public; "Try it yourself" needs no code), image `ghcr.io/appeon-a-lew/asky`
- `https://erp.2-31-1-203.sslip.io` — ERPNext (its own login)

| file | on the server |
|---|---|
| `deploy/compose.yml`, `deploy/Caddyfile` | `/opt/asky` — asky + Caddy; `asky.env` (keys, never in git), `data/` (volume) |
| `deploy/erpnext-compose.yml` | `/opt/erpnext` — frappe_docker `pwd.yml`, no published ports |
| `deploy/deploy.sh` | `/opt/asky/deploy.sh` — the only command the deploy key may run |

Every push to `main` (or a manual run of **Build and deploy**) builds the image, pushes `sha-<commit>` and `latest` to GitHub Container Registry, and deploys over SSH: the deploy key is a forced command that pulls the tag with the job's short-lived `GITHUB_TOKEN` and restarts asky. Set the repository secret `DEPLOY_SSH_KEY` to the deploy key's private key; without it the image is pushed but not deployed. Roll back by re-running an older workflow run, or on the server: `sed -i 's/^ASKY_TAG=.*/ASKY_TAG=sha-abc1234/' /opt/asky/.env && docker compose -f /opt/asky/compose.yml up -d asky`.

## Public demo: landing page + audience workspaces

`/` is a public landing page built from real runs (`pnpm landing [--vision]` writes `public/landing/`: the ERPNext e2e frames with asky's own readings, Jev's logged decisions, the generated harness, a confirmed page, the Schmidt story).

With `ASKY_SECRET` set, the app is gated (`src/proxy.ts`): a signed `asky_ws` cookie decides the workspace, and every route handler runs inside it (`withWorkspace`, `src/lib/workspace.ts`).

- **Audience** — "Try it yourself" (open while `ASKY_EVENT_CODE` is set; nobody types it) creates a private workspace (`data/workspaces/v-…`) from a clean template: Ledgerline only, guided at `/start`, deleted after `ASKY_WORKSPACE_TTL_HOURS`. Budgets per workspace (AI calls, TTS characters; over them asky falls back to heuristics and the browser voice), a few shared live-voice seats, a global cap. No screen frames, audio uploads, ERPNext or harness writes.
- **Presenter** — `/presenter` with `ASKY_PRESENTER_PASSWORD` → the main workspace (ERPNext, the curated knowledge).
- Fail-closed: inside the gated server a request without a workspace never reaches the main data. Without `ASKY_SECRET` (local development, scripts) everything is the main workspace, as before.
- `ASKY_URL=… ASKY_EVENT_CODE=… pnpm e2e` runs the full UI test as an audience member.

## Pitch deck (3 min)

`/pitch` (public) — seven full-screen slides built from the landing page's own animations and the narrated demo video (`public/pitch-media/`), then backup slides for questions. ← → move, **F** fullscreen, **N** speaker notes with the per-slide time slots and a running clock, **T** restarts the clock; the slide number lives in the URL hash.

## Demo script (≈ 8 min)

1. **Interview** → *Import sample* — German recording → transcript → 6 new pages, 3 updated (stretch goal: explained in German, taught in English).
2. **Capture** → *ERPNext · vision only* → Start → share the ERPNext tab. Work 4471 (recode 4711 → 0400 + asset number, Post), 4472 (Request Approval → Approve → Post), 4473 (supplier list filtered to Nordlicht, comment, Hold). asky asks at pauses; the "asky sees" strip shows what vision reads. **End task → debrief** (≥ 3 questions) → teach-back → "Yes".
3. **Hub** → Work Map (real ERPNext screen moments), pages with provenance, **Domain MCP → erpnext** (11/11 aligned).
4. **Teach** → *ERPNext* → Lena opens 5101 and tries to post it on opex → the tutor stops her at the confirm dialog, in Sabine's words; 5102 without approval → stopped again; mastery map.

Reset between runs: *Fresh demo* in Capture resets asky's knowledge and recreates the ERPNext queue (`pnpm seed:erpnext --reset` does the same from the shell).
