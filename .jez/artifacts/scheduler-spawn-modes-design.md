---
title: Scheduler spawn modes — design notes
status: draft
audience: jezweb-internal, eventually a GitHub Discussion on block/goose
created: 2026-05-26
related:
  - https://github.com/block/goose/discussions/9416 (sidebar organisation discussion already posted)
  - https://goose-docs.ai/docs/guides/context-engineering/subagents/
  - https://goose-docs.ai/docs/guides/context-engineering/hooks
  - crates/goose/src/scheduler.rs
  - crates/goose/src/agents/subagent_handler.rs
---

# Scheduler spawn modes — design notes

## TL;DR

Goose's scheduler today has exactly one target shape: each fire spawns a fresh top-level session. This is correct for some workflows and wrong for others, and the wrong cases produce a real product pain (sidebar fills with "New Chat" entries; no context continuity across fires).

The fix isn't to introduce new session-type concepts — **Goose already has subagents**, which are exactly the ephemeral / task / report-back primitive needed for one of the missing modes. The scheduler simply doesn't reach for them. The proposal is to give the scheduler two new target modes that lean on existing primitives plus one genuinely new one:

| Mode | Today | What it does |
|---|---|---|
| **`spawn`** | ✅ default | Fresh top-level session per fire. Same as today. |
| **`subagent`** | ❌ scheduler can't reach the subagent code path | Each fire dispatches a subagent into a designated parent session. The subagent reports back into the parent's history. Zero new sidebar entries. |
| **`inject`** | ❌ no equivalent anywhere | Each fire appends a new turn into a designated existing session. Genuinely new primitive — closest analogue is Claude Code's `CronCreate`. |

No new session type. No `parent_session_id`. No chat/task distinction. Two new fields on the schedule struct + corresponding scheduler logic + small UI changes.

---

## The capability gap, with evidence

### What's in the scheduler today

From `crates/goose/src/scheduler.rs`:

```rust
pub struct Scheduler {
  // ...
}

impl Scheduler {
  pub async fn add_scheduled_job(...) { /* ... */ }
  pub async fn schedule_recipe(...) { /* ... */ }
  pub async fn sessions(...) -> Vec<Session> { /* ... */ }
  pub async fn run_now(&self, sched_id: &str) -> Result<String, SchedulerError> { /* ... */ }
  // ... pause, unpause, kill, update, etc.
}
```

The whole file has **zero references** to `subagent`, `sub_agent`, or anything in the subagent module path. Every fire path goes through recipe → fresh agent → new session.

### What subagents already do

Per `crates/goose/src/agents/subagent_handler.rs` + the [subagents doc](https://goose-docs.ai/docs/guides/context-engineering/subagents/):

> Subagents are "independent instances that execute tasks while keeping your main conversation clean and focused" … "temporary instances that exist only for task execution. After the task is completed, no manual intervention is needed for cleanup."

Reporting back is configurable per dispatch:
- **Full Details** — parent sees all tool executions
- **Summary Only** — parent sees just the final result

This is the exact primitive needed for "scheduled task that reports into a parent conversation." The plumbing is already built; the scheduler simply doesn't invoke it.

### What hooks can and cannot do

Per the [hooks doc](https://goose-docs.ai/docs/guides/context-engineering/hooks), hooks fire on session lifecycle events (session start/end, prompt submit, tool exec before/after, file ops, shell exec). Explicitly:

> Hooks cannot fire prompts into existing sessions, trigger subagents directly, or handle scheduling independent of session events.

So if anyone reaches for hooks to solve the "cron into session" problem, they're using the wrong tool. Hooks react to session events; they don't initiate them. Worth ruling out cleanly in the eventual Discussion to avoid distractions.

### MOIM (persistent instructions) — adjacent but not the answer

Per the [persistent instructions doc](https://goose-docs.ai/docs/guides/context-engineering/using-persistent-instructions), MOIM is per-turn injection of context controlled by env vars, mid-session editable, 64KB cap. It's the closest thing Goose has to "rules that survive the conversation growing," but it requires the session to be active and taking a turn for the injection to fire. It's not a "wake the session up and ask it something" primitive. Useful to keep in mind but not in the critical path here.

---

## The four-quadrant frame

Two axes: what the spawn produces (chat vs task), and how it relates to the parent (standalone vs child).

| Spawn produces | Relation to parent | Goose today |
|---|---|---|
| Chat (persistent, in sidebar) | Standalone | ✅ scheduler default |
| Chat | Child of session X | ❌ no `parent_session_id` field, no nested sidebar rendering |
| Task (ephemeral, no chat record) | Standalone | ❌ no scheduler "fire as ephemeral task" mode |
| Task | Child of session X | ⚠️ subagents do this in-session; scheduler can't reach the path |

The most pragmatic read of this matrix:

- **Top-right** (persistent child chat) is genuinely a new concept and probably not worth adding. Subagents-with-Full-Details reporting cover the "I want to see the inner monologue later" use case, and adding a third session category (top-level chat / child chat / subagent task) is more vocabulary than users need.
- **Bottom row** is the real lift. The scheduler should be able to dispatch subagents (right cell) and inject prompts into existing sessions (left cell behaviour is partially covered by subagents-into-session, but the genuinely standalone "fire a task with no parent" might want to exist too — e.g. for fully autonomous jobs that don't need to report anywhere).

For a first proposal, the two new modes that matter most are:

1. **`subagent` into session X** — combines the "task" production type with a parent linkage. Reuses existing subagent code. Highest UX win (no sidebar spam, results land where the user expects).
2. **`inject` into session X** — appends a new turn into session X. Looks to the user exactly like a human-typed message arrived. Closest analogue is Claude Code's `CronCreate`.

These two cover the workflows we identified as missing:
- **Monitoring loop**: schedule something for every 15 min, results consolidate in one parent session. `subagent` mode.
- **Recurring prompt to self**: schedule "ask me about last week" every Monday, fires as a new turn in the existing weekly-retro chat. `inject` mode.
- **Heartbeat report**: schedule a daily health-check that summarises into a "monitoring" parent chat. `subagent` mode with Summary Only.

---

## Proposed scheduler API

```rust
// In ScheduledJob struct (crates/goose/src/scheduler.rs around line 106)

pub enum ScheduleTarget {
  /// Fresh top-level session per fire (current behaviour, default).
  Spawn,
  /// Append the prompt as a new turn in an existing session.
  Inject { target_session_id: String },
  /// Dispatch a subagent into the parent session; result appears in parent's history.
  Subagent {
    parent_session_id: String,
    reporting: SubagentReporting, // FullDetails | SummaryOnly
  },
}

pub struct ScheduledJob {
  // ... existing fields ...
  pub target: ScheduleTarget,  // defaults to Spawn for backwards compat
}
```

Migration: existing schedules become `target: Spawn` automatically. No user-facing migration UX needed.

Fire-time branching at the scheduler tick:

```rust
match job.target {
  ScheduleTarget::Spawn => {
    // existing path: spawn fresh session, run recipe
  }
  ScheduleTarget::Inject { target_session_id } => {
    // load session, append prompt as user message, let the agent take a turn
    // handle "session currently loaded by user" race (queue? reject? merge?)
  }
  ScheduleTarget::Subagent { parent_session_id, reporting } => {
    // load parent session, dispatch subagent with the same code path
    // the in-session subagent tool uses, just initiated from cron not prompt
  }
}
```

The Spawn path stays exactly as today. The other two paths plug into existing infrastructure (session loading + subagent dispatch) — most of the work is wiring, not new logic.

---

## UI implications

Schedule creation gets a new "Target" picker (or similar wording):

| Option | Description shown to user |
|---|---|
| **New session** *(default)* | Each fire opens a fresh chat. Best for independent tasks. |
| **Append to an existing chat** | Each fire continues a chat you pick. Best for monitoring or recurring prompts to yourself. |
| **Background task in an existing chat** | Each fire runs as a background task; the result appears as a message in the chat you pick. Best for "I want a report, not a conversation." |

For `inject` and `subagent` modes, a session picker (search-box dropdown of existing sessions). For `subagent` mode, an additional toggle: "Show full tool output" vs "Summary only" (mapping to subagent reporting modes).

On the target session's view:

- `inject` fires look identical to a human typing — appears in the timeline as a user message followed by the agent's turn. Optionally tagged with a small clock icon to indicate "scheduled origin."
- `subagent` fires appear as subagent-result blocks in the timeline, the same way they would if the user had triggered the subagent. The user sees "Scheduled subagent X completed: <summary>" and can expand for details.

The session list / sidebar:

- `Spawn` schedules continue to create entries in the sidebar (the current spam, mitigated by tonight's folders work)
- `inject` and `subagent` schedules create **zero new sidebar entries** — that's the win
- A "Schedules" view (already exists at `/schedules`) lists the scheduled jobs themselves, regardless of target mode. The user manages schedules there.

---

## Open questions

These are the genuine design decisions that need maintainer input before any code:

1. **Race conditions on `inject` mode**: what if the target session is currently loaded by the user's active window? The agent's HTTP tool calls + scheduled prompt could race. Options: queue the scheduled prompt until the session is idle; reject the inject if user is actively using it; merge into the active turn somehow. Each has UX tradeoffs.

2. **Subagent capabilities when scheduler-triggered**: the subagent docs say *"Subagents cannot spawn additional subagents, manage extensions, or modify scheduled tasks"* — those restrictions apply to today's user-triggered dispatch. Should scheduler-triggered subagents inherit the same restrictions, looser ones (e.g. allow MOIM mutation so a daily task can update guardrails), or tighter ones?

3. **Discoverability on the target session**: when looking at session X, how does the user know "a scheduled task fires into here at 9am every weekday"? A small indicator on the session row? A line in the session's header? A panel in the schedules view that lists targets-and-their-sources?

4. **What about non-recipe-based schedules**: today schedules require a recipe to wrap the prompt. For `inject` mode, you almost certainly just want to schedule a prompt string, not a recipe. Worth a separate "prompt scheduled job" type, or fold prompt-only into the existing recipe shape?

5. **Naming**: I've used `spawn` / `inject` / `subagent`. None of those are particularly user-facing-friendly. Worth bikeshedding before any code — the UI labels matter more than the enum names.

6. **MOIM interaction**: schedulers could mutate the target session's persistent instructions. Probably out of scope for v1, but worth knowing the door exists.

---

## Why this is a separate Discussion, not an addendum

The right-click + colour + icon + folder Discussion already posted ([#9416](https://github.com/block/goose/discussions/9416)) is about *user-driven session organisation*. This proposal is about *programmatic session interaction patterns*. They share the sidebar surface (and could share data structures — `parent_session_id` if we ever do persistent children, the same nested-rendering we wrote for folders) but they're conceptually different conversations.

Sequencing matters too: if Block engages positively with #9416 and accepts PRs, that's credibility deposited. Opening this Discussion *after* the first one lands is the difference between "trusted contributor with a follow-up idea" and "stranger firing off scope on day one." Patience is cheap.

---

## What this brain-dump is for

- Captures the architectural shape so a future Claude Code session resuming this work can pick up cleanly
- Ready to refine into a GitHub Discussion post once #9416 has bedded in
- Will eventually link from the substrate (`/Users/Shared/goanna/agents/goannadev/inbox/` if relevant for the goanna team, though this is upstream Goose work not goanna-platform work)

---

## References

- [GitHub Discussion #9416](https://github.com/block/goose/discussions/9416) — sidebar organisation (right-click, colour, icon, folders, fill-height)
- [Goose subagents doc](https://goose-docs.ai/docs/guides/context-engineering/subagents/)
- [Goose hooks doc](https://goose-docs.ai/docs/guides/context-engineering/hooks)
- [Goose plugins doc](https://goose-docs.ai/docs/guides/context-engineering/plugins)
- [Goose persistent instructions doc](https://goose-docs.ai/docs/guides/context-engineering/using-persistent-instructions)
- `crates/goose/src/scheduler.rs` — the scheduler today
- `crates/goose/src/agents/subagent_handler.rs` — the subagent dispatch code
- Claude Code `CronCreate` — the in-session cron pattern Goose `inject` mode is closest to
