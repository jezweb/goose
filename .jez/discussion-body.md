
Hi — picking up Goose this week I hit a small cluster of UX gaps in the sidebar chat list that all seem to want the same shared foundation. Rather than open an Idea per item, I built a working prototype on a fork to make the whole shape easier to discuss, and would love the maintainers' take on whether any of this is something you'd want as PRs.

## The problem

When the sidebar grows past ~15 chats, three friction points start compounding:

1. **Renaming a chat needs you to know about double-click.** It already works — `InlineEditText` with `singleClickEdit={false}` is wired up in `SessionsList.tsx` today — but with no visible affordance, most users never find it.
2. **There's no way to delete a chat from the sidebar.** Delete exists in the History view, but doing it inline saves a roundtrip.
3. **At scale, chats are an undifferentiated wall.** Same icon, same colour. No way to mark "this is the work one" vs "this is the personal one", and no way to group related chats together.

## The prototype

Working branch: https://github.com/jezweb/goose/tree/feature/session-context-menu

Five commits, each atomic enough to become its own PR if you want to take this piecemeal:

| Commit | Feature |
|---|---|
| [`1c5ba5d0`](https://github.com/jezweb/goose/commit/1c5ba5d0b) | Right-click context menu with Rename + Delete |
| [`ec41a759`](https://github.com/jezweb/goose/commit/ec41a759f) | Colour tags + icon picker (with shared metadata store) |
| [`0babac50`](https://github.com/jezweb/goose/commit/0babac50b) | Folders |
| [`3278ab7f`](https://github.com/jezweb/goose/commit/3278ab7f2) | Polish: indent in-folder rows, searchable icon grid |
| [`b0a24d4d`](https://github.com/jezweb/goose/commit/b0a24d4d1) | Sidebar chat panel fills available height with internal scroll |

### Right-click menu (Rename + Delete)

Right-clicking a row in `SessionsList.tsx` opens a context menu with Rename, Colour ▶, Icon ▶, Move to folder ▶, and Delete. Rename re-uses the existing `InlineEditText` + `updateSessionName` flow. Delete re-uses the existing `deleteSession` API + `ConfirmationModal` + `SESSION_DELETED` event, so the behaviour matches what users already know from the History view.

<!-- Screenshot: right-click menu open on a chat row, showing the full menu -->

### Colour and icon tags

A seven-colour palette and a 20-icon set, both in `src/constants/sessionPalette.ts`. The selected colour renders as a small dot in the row's leading slot; the selected icon replaces the default `MessageSquare` (recipe `ChefHat` still wins as a fallback when the user hasn't chosen an icon themselves — recipes are a system signal, but explicit user choice overrides it).

<!-- Screenshot: sidebar with several rows showing different colours and icons -->

The icon picker is a 5-column grid topped by a search input — fuzzy match on label or id. A 20-item vertical list felt tedious during dogfooding, and the search makes it scale if the set ever grows.

<!-- Screenshot: icon picker open showing the search input and the grid -->

### Folders

Sessions can be moved into user-defined folders via the row context menu. Folders render as collapsible headers in the sidebar; clicking a header toggles expansion, right-clicking it opens Rename / Delete. Children are indented to make the hierarchy obvious. Deleting a folder moves its sessions back to ungrouped — chats are never lost.

<!-- Screenshot: sidebar with two or three folders expanded, showing indented children -->

<!-- Screenshot: "Move to folder" submenu showing existing folders and the "New folder…" option -->

A small `FolderNameDialog` handles both creating and renaming, modelled on the existing `ConfirmationModal` pattern.

## The architectural decision I'd love your input on

The prototype is entirely **client-side**. A new `SessionUiMetadataProvider` reads/writes `${userData}/session-ui-metadata.json` over a pair of IPC handlers in `main.ts`. Zero Rust changes. The Rust `Session` struct is untouched. Data shape is versioned for forward compatibility.

That works for one machine. It doesn't sync across devices, and it means colour / icon / folder are *only* visible inside Goose desktop — they can't be queried, exported, or shared with other tooling that talks to `goosed`.

The cleaner architecture is fields on the Rust `Session` struct (`color`, `icon`, `folder_id`) flowing through the OpenAPI schema to the TS client automatically. That's more invasive for me to PR as an outside contributor, but it'd be the right home long-term.

So: would you prefer

- **(a)** accept the client-side prototype as a first PR (smaller surface, no Rust changes, easier to revert), then move to server-side later if usage grows, or
- **(b)** ask me to land the Rust schema changes first (with migration) before any of this UI work goes upstream, or
- **(c)** something else entirely?

If you're open to (a) or (b), I'd be happy to break the branch into focused PRs in your preferred order.

## What's intentionally NOT here

A couple of related ideas I left out because they felt like their own conversations:

- **Drag-and-drop reordering of folders / dragging chats between folders.** Doable, but distinct from the "what fields exist" question.
- **A scheduled job that continues an existing session rather than spawning a new one.** This is a real workflow gap — the current scheduler creates a fresh session per fire, but a "keep building context in this conversation" mode would be valuable. It's a Rust scheduler change though, separable from the UI work above. Happy to open a separate Discussion if you'd like to talk about it.

## What I'd ask the maintainers

- Is this kind of UX work welcome here? (CONTRIBUTING.md mentions a preference for "broadly useful" — I'd argue this is, but I want to make sure I'm reading you right.)
- Preference on (a) vs (b) above for landing path?
- Anything you'd structurally change before I open the first PR?

Thanks for reading — happy to adjust scope, split into separate Discussions, or close this if I'm off-track.
