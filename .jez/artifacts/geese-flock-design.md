---
title: geese-flock — design notes
status: draft v0
created: 2026-05-26
author: jez (drafted with Claude Code, captured during the overnight Goose-fork session)
related:
  - .jez/artifacts/scheduler-spawn-modes-design.md (scheduler enhancements that geese-flock would benefit from)
  - https://github.com/block/goose/discussions/9416 (sidebar UX Discussion already posted upstream)
  - /Users/Shared/goanna/ (the goanna substrate that geese-flock builds on)
  - https://goose-docs.ai/docs/guides/context-engineering/ (subagents, hooks, plugins, persistent instructions)
---

# geese-flock — design notes

## What it is

A Mac-only agentic workspace built as a thin layer over Goose, where the agent fleet is defined in the Goanna markdown substrate and the chat experience is Goose's. Multiple agents, each with their own identity, colour, folder, recipe, persistent instructions, and chat history. One application surface, many agents working as a flock.

The name is "geese-flock" (one word lowercase by convention; `geeseflock` if you're typing fast). All `.com / .com.au / .au` domains were available as of 2026-05-26. Different enough from "Goose" that we're not sitting on Block's name.

## Architectural principles (load-bearing)

1. **Less Goose modification = less maintenance burden.** Every line we change in the fork is a line we have to re-merge when upstream changes. Our fork stays as close to upstream `block/goose` as humanly possible, and the divergence we do accept must earn its keep.
2. **Configuration lives in markdown substrate, not code.** Agent definitions, recipes, persistent instructions, folder structure — all files in `/Users/Shared/goanna/`. Code reads files; files are the source of truth. Means you can edit agents in any text editor; means substrate is portable.
3. **Goose remains the chat engine.** We don't reinvent streaming, interruption, tool calls, recipe parameterisation, message handling. That's the bit we can't beat by reinventing; it's also the bit Block keeps improving.
4. **Extensions are the right plug-in shape for adding capabilities.** Goose's memory system is an extension — that's the proof. If we want goanna-aware memory, we write a goanna-memory extension. Same shape as their built-ins.
5. **Mac-only is fine.** Scope constraint that buys us native macOS tabs, Aqua-style window tinting, Spotlight integration if we ever want it, no Windows/Linux build complexity.
6. **Rebase-friendly is non-negotiable.** Every change in our fork is designed to be re-applied cleanly when we pull from upstream. We commit narrow, named, well-described changes. We don't refactor adjacent code "while we're there."

## The stack (four layers)

```
Layer 4 (future):  Cloudflare backplane — sync, AI Gateway, remote agent runs
                   ──────────────────────────────────────────────────────
Layer 3:           geese-flock — minimal Goose fork (sidebar shape, agent UI)
                                + Goose extensions (goanna-memory, etc.)
                                + recipes living in substrate
                   ──────────────────────────────────────────────────────
Layer 2:           Goanna substrate (markdown files, R2-backed, daemon-synced)
                   agents/, wiki/, recipes/, etc.
                   ──────────────────────────────────────────────────────
Layer 1:           Goose desktop + CLI (chat engine, agent runtime, scheduler)
                   ──────────────────────────────────────────────────────
```

Each layer owns its job. Boundaries are stable: substrate is files, the chat engine is Goose, the agent UI is geese-flock, the cloud bits eventually slot in alongside.

## What lives in the fork (kept narrow)

Everything we change in our Goose fork falls in one of these buckets, and we audit every commit against this list:

| Bucket | Examples | Status today |
|---|---|---|
| Per-session UI metadata | colour tag, icon, folder, future agent-id | ✅ shipped on `feature/session-context-menu` |
| Sidebar shape | folders, fill-height, eventual multi-agent nav items | ✅ partial — folders shipped; multi-agent pending |
| Window-level UX | named windows, tinted windows, native macOS tabs | ❌ pending |
| Substrate awareness (read-only) | auto-derive folder list from `/Users/Shared/goanna/agents/`, surface agent metadata in headers | ❌ pending |
| Conditional rendering for agent-defined recipes | dropdown showing agent-specific recipe list when in that agent's folder | ❌ pending |

Things that DON'T live in the fork (intentional):

- Memory systems (use a Goose extension, not core changes)
- New tools (extensions / MCP, not core)
- Persistent instructions logic (Goose handles this via env vars / MOIM already)
- Cloud sync (use Goanna substrate + future Cloudflare layer; don't bake into the desktop)
- Scheduler enhancements (push upstream via Discussion + PR; don't fork the Rust)

## What lives as Goose extensions (the real workhorse)

Goose's extension model means we can add capabilities without touching core. Our extension list:

| Extension | What it does | Substrate path |
|---|---|---|
| `goanna-memory` | Read/write/search agent memory in markdown files. Each agent's journal + findings + persona become accessible as memory operations. | `/Users/Shared/goanna/agents/<slug>/journal/`, `findings/`, `persona.md` |
| `goanna-recipe-loader` | When opening a chat tagged with agent X, load X's recipe + persistent instructions automatically | `/Users/Shared/goanna/agents/<slug>/recipe.yaml`, `CLAUDE.md` |
| `goanna-inbox` | Check, triage, mark-read inbox items for the active agent | `/Users/Shared/goanna/agents/<slug>/inbox/` |
| `goanna-wiki` | Read/write/search the shared wiki | `/Users/Shared/goanna/wiki/` |
| `goanna-substrate-ops` (low-level) | Generic file/folder operations on substrate with frontmatter-aware writes | All of substrate |

These are TypeScript or Python extensions packaged via Goose's plugin install path. Distributable, independently maintained, can be installed by anyone running vanilla Goose — they don't NEED the fork to use these.

That's important: **the extensions work on vanilla Goose**. The fork is the optional UX upgrade. Someone could install just the goanna-memory extension and get value, even without geese-flock's sidebar shape.

## What lives in the goanna substrate (no code at all)

The substrate IS the configuration. No special schema, no JSON config files, no UI for editing. Just markdown:

```
/Users/Shared/goanna/
├── agents/
│   ├── boss/
│   │   ├── CLAUDE.md          # identity, persona, scope (already exists)
│   │   ├── persona.md          # voice, communication style
│   │   ├── recipe.yaml         # NEW: goose recipe for this agent
│   │   ├── inbox/              # existing
│   │   ├── journal/            # existing
│   │   ├── findings/           # existing
│   │   └── flock.yaml          # NEW: optional UI hints (colour, icon, sort order)
│   ├── boss/  ... etc
│   ├── goannadev/ ... etc
│   └── _template/              # template for new agents (already exists)
├── wiki/                       # existing
├── recipes/                    # NEW: shared recipes across agents
└── skills/                     # existing — also loadable as goose skills via plugin
```

Adding a new agent = `mkdir agents/<slug>` and drop in a CLAUDE.md. Geese-flock picks it up via the goanna-recipe-loader extension and renders a nav item for it.

## Existing capabilities to leverage (do NOT rebuild)

Listed because forgetting these is the trap:

- **goannad** — file watcher + R2 sync daemon. Already runs on every Mac. Don't reinvent sync.
- **goose CLI** — headless agent invocation. `goose run --recipe <path>` is the cron path for scheduled agent work. Same backend as desktop.
- **goose scheduler** — already exists; will eventually grow target modes per the scheduler design doc. We don't need a separate scheduler.
- **goose extensions / plugins / hooks** — established mechanisms for capability extension. Use them.
- **MOIM (persistent instructions)** — env-var driven, mid-session-editable per-turn injection. Per-agent identity goes here.
- **goose's chat UX** — interruption, streaming, tool display, recipe parameterisation. The bit you love. Don't touch.
- **Goose subagents** — ephemeral, report-back. Use for headless dispatches once the scheduler grows the right target mode.
- **goose `gateway` command** — network surface to a running goose. Investigate; might be the bridge from local fork to remote Cloudflare orchestration.

## Daily-life experience (what it feels like to use)

You open geese-flock in the morning:

- Sidebar shows your agents as expandable folders: boss, worker, librarian, scout, goannadev, anthro, marcus, ivy, lizzie...
- Each folder has its accent colour from `flock.yaml` and the agent's emoji icon
- Boss is expanded by default; you see yesterday's chats grouped chronologically
- A new "Today" chat is already started — boss has been brief'd via persistent instructions about yesterday's activity (loaded from boss's journal entry)
- You ask boss a question; the response streams in with Goose's familiar UX
- Boss dispatches a subagent to triage librarian's inbox; result lands in this chat as a summary
- Mid-conversation you switch to librarian's folder; that nav item expands; you see librarian's persona is loaded, librarian's recipe is active, librarian's memory is accessible
- Goannad sync runs in background; whatever you write to substrate (notes, findings) propagates to your other Macs
- At 6pm goose CLI fires (via goannad's cron) to run boss's daily-summary recipe; tomorrow morning a new chat in boss's folder already has yesterday's summary

That's the experience. Real, achievable, no Rust required.

## Phased rollout

| Phase | What | Effort | Dependencies |
|---|---|---|---|
| **Phase 0** | This design doc | ✅ — this file | None |
| **Phase 1** | Multi-agent nav items in sidebar (substrate-driven) | ~3 hours | Tonight's folder work |
| **Phase 2** | `goanna-memory` extension (read substrate as Goose memory) | ~half day | None |
| **Phase 3** | `goanna-recipe-loader` extension (per-agent recipe + MOIM) | ~half day | Phase 1 conventions |
| **Phase 4** | Window-level naming + tinting + macOS native tabs | ~half day | None |
| **Phase 5** | `goanna-inbox` extension (triage from chat) | ~half day | Phase 2 |
| **Phase 6** | Recipe library expansion in substrate | ongoing | Phase 3 |
| **Phase 7** | Goannad cron → goose CLI for scheduled agent runs | ~few hours | None |
| **Phase 8** | Upstream scheduler Discussion (separate from #9416) | ~hours | #9416 has settled |
| **Phase 9** | Cloudflare backplane (sync optional; AI Gateway routing) | longer | Vision-level |

Phases 1-5 are the geese-flock MVP. Probably 2-3 focused sessions to complete.

## Confirmed decisions (2026-05-26 morning)

- **Geese-flock is SEPARATE from Goanna.** Goanna stays at `/Users/Shared/goanna/` for Jez's Claude Code workflow. Geese-flock has its own substrate at `~/.agents/` (Goose's native convention) and its own Cloudflare workers (to be built fresh, open-source).
- **Adopt Goose's standards completely.** No translation layers, no symlinks bridging goanna → goose. Geese-flock IS Goose-shaped from day one.
- **Geese-flock will be open-sourceable.** Workers and plugins distributable; setup agent will help users deploy their own Cloudflare stack.
- **Agent naming taxonomy: single-word role names that describe a recognisable professional function.** No hierarchy, no AI-vocabulary theater (no CEO/Synthesis Engineer/Cognitive Architect). Lowercase by convention.
- **Starter agents: `orchestrator`, `researcher`, `developer`.** Three is enough to prove multi-agent UX. Future agents follow the same naming style (`writer`, `editor`, `analyst`, `designer`, `operator`, `curator`, `tester`, etc.).

## Open questions to settle later

These need answers eventually, not before Phase 1:

1. **`geese-flock` vs `geeseflock` vs `Geese Flock`** — branding voice. The repo, the binary, the URL, the readme — canonical spelling.
2. **Fork repo name** — keep `jezweb/goose` (descriptive), rename to `jezweb/geese-flock`, or new repo `jezweb/geese-flock` that pulls from upstream as a remote.
3. **Public from day one or private until polished** — Jez's call.
4. **What gets upstreamed back to Block** — the right-click/colour/icon/folder work is in Discussion #9416 already. Other rebase-safe improvements should also go upstream.
5. **Branding visuals** — flock-themed icon, V-formation, etc. Adjacent to Goose's visual identity but distinct.

## What we won't build (boundaries)

Listed explicitly because temptation is the enemy:

- **Chat engine** — Goose has it. Touching it = pain.
- **Memory primitives** — substrate IS the memory primitive. Use it.
- **Cross-platform** — Mac only.
- **Browser version** — Mac desktop only. Cloudflare-hosted bits later are services, not UIs.
- **Custom LLM client** — Goose handles providers (OpenAI, Anthropic, OpenRouter, Bedrock, local Ollama, etc.). Inherit that.
- **From-scratch scheduling** — Goose has it; we improve it upstream.
- **New auth model** — agent identity is "which folder are you in?" Not user accounts.

## Why this attempt will work where others didn't

You've tried this shape several times (Hermes, Theo's T3, GPT Codex, your own builds, the Goanna desktop app whose screenshot you shared). The difference now:

- **You're not building from zero.** Goose provides the chat engine — by far the most polish-heavy bit. You're building above it, not under it.
- **The substrate is real.** Goanna already exists, with multiple agents, journals, inboxes, the daemon, the wiki. It's not a future plan; it's running on your Mac right now.
- **The principle "minimal fork + extensions + substrate" stays achievable.** Total code-we-maintain over the next month is realistically 1500-2000 lines on top of upstream Goose. That's manageable for one person.
- **The vision is grounded in capabilities that exist today.** Every layer of the stack has a working implementation we're leveraging, not just a hopeful design.

## References

- `.jez/artifacts/scheduler-spawn-modes-design.md` — the scheduler work that, when upstreamed, makes goanna-cron + goose subagents seamless
- `https://github.com/block/goose/discussions/9416` — the sidebar UX Discussion already filed; Phase 1 of geese-flock builds on whatever lands here
- `/Users/Shared/goanna/CLAUDE.md` — current goanna brief, the substrate authority
- `https://goose-docs.ai/docs/guides/context-engineering/subagents/` — the subagent primitive we lean on for headless work
- `https://goose-docs.ai/docs/guides/context-engineering/plugins` — the plug-in distribution path for the goanna-* extensions

## Tomorrow's first session, when rested

The shortest path from here to "geese-flock feels real":

**Build Phase 1 — multi-agent nav items.** Replace the single hardcoded "Chat" nav item with N items, one per `/Users/Shared/goanna/agents/<slug>/` folder found at startup. Each agent's nav item expands to show that agent's chat history (filtered by an `agent` field on the session metadata). New chats started under an agent's nav item get that agent tag automatically. Builds entirely on the metadata layer we shipped tonight.

That single change makes the flock visible. Everything else accrues on top.
