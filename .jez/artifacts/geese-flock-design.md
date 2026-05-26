---
title: Geese-flock — design notes (revised, post-implementation)
status: v1-shipped — honest record of what we built and what we learned
last_revised: 2026-05-26 15:30 (Office Town vocabulary added)
related:
  - ~/Documents/.jez/knowledge/office-town.md  ← the canonical methodology vocabulary
  - .jez/artifacts/scheduler-spawn-modes-design.md
  - https://github.com/block/goose/discussions/9416
---

# Geese-flock — design notes (revised)

## TL;DR

What started as a vision for a separate "flock" product became, in honest practice, **a set of small UX additions to Goose**. The additions are all aligned with Goose's existing design — no fork divergence beyond a single feature branch, no structurally new concepts.

The full flock vision (separate product, Cloudflare backplane, agent-shaped memory, CWD-as-agent workflows) is **deferred to the future**, not abandoned. What we know now is what *doesn't* need to be built to get most of the value.

---

## The mental model (finally clean)

Goose's primitives are people + places + tasks. They're separate concepts, each with one job.

| Concept | What it is | Where it lives | Persistence |
|---|---|---|---|
| **Agent** (Goose's term) | An identity. The `.md` file with frontmatter (name, description) and instructions body. | `~/.agents/agents/<slug>.md` (or any of Goose's other agent discovery paths) | Stateless — each `@-mention` dispatch starts fresh from the file |
| **Project** (Goose's term) | A working directory you've used. Bookmark of a place. | Wherever the directory is on disk; Goose auto-tracks recent ones | Persistent — files and context live in the directory |
| **Session** (Goose's term) | A single conversation. Has a working directory, may invoke agents. | SQLite session store, tied to a working dir | Persistent per-session |
| **`.goosehints`** | Per-directory context loaded automatically when working there | In the working directory (root or nested) | Per-directory; survives across sessions in that directory |

What's NOT a primitive in Goose (despite being one in Goanna):
- "Agent with its own memory" — agents are stateless dispatched specialists
- "Agent has an inbox / journal / findings folder" — those are Goanna inventions
- "Opening a folder = becoming that agent's persona" — Goose's identity is the host (Goose itself); agents are tools it can call

---

## Mapping Goanna concepts to Goose

| Goanna concept | Goose equivalent | Notes |
|---|---|---|
| Agent = folder of everything | Agent = just the `.md` file | Goose's agent is smaller in scope |
| Agent's persona (`persona.md`) | Agent `.md` body | Same content, different file shape |
| Agent's journal | Files in the working directory where chats happened | Goose has no per-agent memory; project files are the memory |
| Agent's inbox | None native | Could be maintained manually as files in a directory |
| Open Claude in agent folder | Set CWD to a directory; `.goosehints` there gets loaded | This is the "CWD-as-agent" pattern — possible but additive, not required |
| `@-mention` for cross-agent talk | `@-mention` for subagent dispatch | Same word, similar idea |

Key honest statement: **Goanna's agent-centric model and Goose's session-centric model don't fully unify. Trying to make one look like the other creates friction.** Either accept the difference (use each for what it's good at) or build a separate layer that bridges them (Option B below).

---

## What we built today

Six commits on `feature/session-context-menu` (https://github.com/jezweb/goose/tree/feature/session-context-menu). Everything below is small, focused, rebaseable, and aligned with Goose's existing UX patterns.

| Commit | Feature | Status |
|---|---|---|
| `1c5ba5d0` | Right-click context menu on chat rows (Rename, Delete) | ✅ working |
| `ec41a759` | Colour tagging + icon picker (with shared metadata store) | ✅ working |
| `0babac50` | User-created folders for chat organisation | ✅ working |
| `3278ab7f` | Polish: indent in-folder children, searchable icon grid | ✅ working |
| `b0a24d4d` | (Reverted) Fill-height sidebar — caused overflow problems | ❌ later reverted in `4c687894` |
| `2ca84875` → `bc550dc02` | Multi-agent UX experiments — ended at: auto-tag on @-mention | ✅ working |

The final flock-shaped behaviour:

1. User starts any chat (no special "agent folder" entry point)
2. Types `@<known-agent>` in their message (Goose's native @-mention dispatch fires)
3. Our metadata layer detects the @-mention in the submission and tags the session with that agent slug
4. Sidebar groups the chat under that agent's folder (folder is a *consequence* of usage, not a precondition)
5. Empty agent folders are hidden — only agents you've actually used appear

Plus also working: right-click on any chat row → Rename / Colour ▶ / Icon ▶ / Move to folder ▶ / Delete. User-created folders with their own context menu (Rename folder, Delete folder).

---

## What we tried that didn't work (and why)

Four false starts, each instructive:

| Attempt | Why it failed |
|---|---|
| **Recipe injection** (commit `10994f67`, reverted) | Recipe's `instructions` field extends Goose's system prompt rather than replacing it. The base "I am Goose" identity stays dominant; the agent's body just gets appended. Subagents work differently because they start fresh — but recipes injected into a top-level chat don't get that fresh start. |
| **Event-based PREFILL_CHAT_INPUT** (later removed) | Race between firing the event and the destination ChatInput mounting + attaching its listener. 50ms timeout was a band-aid; the root issue was the wrong primitive (event-based handoff between unmounted-and-remounting components). |
| **Context-state PREFILL** (still in code but unused) | Worked architecturally, but the prefill mechanism itself was wrong-shaped: users typed text without `@` because the prefill was either invisible or got cleared somewhere in the navigation flow. |
| **Filling-height sidebar** | Even with overflow-hidden, the chat block kept rendering behind the lower nav items at some heights. Original Goose layout was internally consistent; our changes kept introducing inconsistencies. Reverted to natural content sizing. |

Common thread: **we were trying to bind the chat's identity to its sidebar location**. Goose's design doesn't have that binding; every attempt to fake it produced misleading UX. The right primitive is `@-mention` for invocation; the sidebar location is just a record of which agent was invoked.

---

## What's deferred (not abandoned)

Real ideas worth picking up later. None blocks today's work.

| Idea | Shape | Effort |
|---|---|---|
| **Window naming + tinting** | iTerm-style multi-window colour-coding for visual recognition | ~2 hours |
| **macOS native tabs** | `BrowserWindow.addTabbedWindow()` — one config line + new-window-into-existing-group | ~1 hour |
| **CWD-as-agent workflow** | Each agent gets a folder containing `.goosehints`; "Start chat in agent's space" button sets CWD = that folder. Goose loads the hints; agent context applies in the goanna-style way. Memory accumulates as files in the agent's folder. | ~half-day |
| **Scheduler enhancements** | The Discussion-ready brain-dump in `.jez/artifacts/scheduler-spawn-modes-design.md` — 3 target modes (spawn / inject / subagent dispatched into a parent session). Wants upstream alignment via a Goose Discussion. | Hours of UI + a Rust PR |
| **Open-source the Cloudflare workers** | Geese-flock workers (fileshare equivalent, assets, emailer) as OSS, with a "setup agent" that deploys them to the user's CF account | Months — real product effort |
| **Goanna → Goose substrate bridge** | An MCP server that exposes goanna's `/Users/Shared/goanna/` files as tools to Goose sessions. Lets Goose chats read goanna context without forcing a substrate move. | Half-day for a basic version |

---

## What's clearly NOT happening (and why)

Be explicit so we don't loop back to these:

| Idea | Why dropped |
|---|---|
| "Geese-flock as a separate Electron app" | What we built doesn't justify a separate app. Six commits on a Goose fork is the right scope. Goanna-desktop (Jez's earlier attempt) showed building chat from scratch is months of polish work. |
| "Make Goose chats behave as their agent" | Goose doesn't have that primitive. Faking it produces misleading UX. The honest behaviour is `@-mention` for dispatch, folder for organisation. |
| "Folder triggers agent identity" | Same as above. Folder is consequence, not cause. |
| "Replace Goose's session model with goanna's agent model" | Goose's model is internally consistent; ours-on-top-of-Goose's is just adding friction. Goanna keeps being goanna; Goose keeps being Goose. |

---

## Where we are now, where we go next

**Stable, working today** (no further effort needed):
- Right-click menu (Rename / Delete / Colour ▶ / Icon ▶ / Move to folder ▶)
- Colour + icon tagging (~7 colour palette, 20 icons with search)
- User-created folders with rename/delete
- Auto-tag chats by @-mentioned agent → agent folders auto-populate
- Sidebar grows naturally with content (no fill-height fight)

**Worth contributing upstream** (when we feel like it):
- Discussion #9416 is already posted with the broader vision (right-click + colour + icon + folder)
- Could be split into focused PRs if Block engages
- Auto-tag-on-@-mention is the genuinely new UX — also a candidate for a PR
- Add a "Want to add `.jez/screenshots` to your post?" reminder before posting

**Not worth doing tonight** (just rest):
- Anything else from the deferred list above
- Re-litigating the architecture

**For a future session resuming this**:
- The branch is at `bc550dc02` on `feature/session-context-menu`
- The agent files in `~/.agents/agents/` (orchestrator/researcher/developer) work with both Goose's native discovery and our sidebar
- The Recipe-injection plumbing in `sessions.ts` is still in place (added but unused) — could be removed in a cleanup commit if desired
- Some context state (pendingChatPrefill, consumePendingChatPrefill) in SessionUiMetadataContext is no longer used — also a cleanup candidate

---

## Reflection: what to actually call this work

We've been calling it "geese-flock". Honestly:

- It's a Goose fork with UX additions
- The additions don't yet justify a separate product identity
- Calling it "flock" creates pressure to be a flock (separate, brand, deployable, etc.)
- A more honest framing: **"Jez's Goose fork with sidebar polish"**

The "flock" name can stay reserved for the future when (and if) the goanna-bridge / CWD-as-agent / open-source-workers ambitions land. Today's work doesn't need a new identity.

When you next pick this up: ask yourself if you want to push these changes upstream (they're rebase-friendly), keep them as your personal fork, or expand them into something bigger. All three are valid; today's work supports any of them.

## Office Town — the vocabulary layer

Separately from the fork itself, we now have a documented vocabulary for talking about how Goose + goanna fit together: **Office Town** (canonical doc at `~/Documents/.jez/knowledge/office-town.md`).

The four primitives:

- **Town** = the whole world (the goose + goanna setup)
- **Place** = a workspace (Goose *project* — a working directory with `.goosehints`)
- **Role** = an identity (Goose *agent* — a `.md` file invoked via `@-mention`)
- **Task** = a piece of work (Goose *session* / chat)

Verb: you **delegate to** a role; you **work at** a place; you **open** a task.

The full 13-word vocabulary, the bracket convention (when to show the Goose primitive in brackets), the visual map, and sample briefings live in the canonical doc. It applies wherever we write about the system in business language — briefings, internal docs, client material. It doesn't touch Goose's UI or code.

---

## Open questions for next time (no rush)

1. **Should we clean up the dead code** (`pendingChatPrefill`, the Recipe injection path in createSession)? They're harmless but they're scaffolding that no longer carries weight. Cleanup is a 10-minute commit.
2. **Should we update Discussion #9416** with the auto-tag mechanism we landed? It's a meaningful enhancement to the vision in the original post.
3. **Should we keep contributing toward upstream**? Right-click menu is the cleanest first PR if you want to engage Block. Colour/icon/folders are larger but still upstream-able. Auto-tag is novel and might or might not interest Block.
4. **When/whether to revisit CWD-as-agent**? That's the path closest to your goanna instincts. Real work, real value, real deferral.

None of these need answers tonight. They're just markers so the next session knows where to look.
