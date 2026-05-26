/**
 * Per-session UI metadata held entirely in the desktop app (not the Rust
 * Session struct). Lets users tag, colour, and group their chats without
 * any backend schema change.
 *
 * Persisted to `${userData}/session-ui-metadata.json`. Cleared per-session
 * when an AppEvents.SESSION_DELETED event fires.
 */

export interface SessionUiData {
  /** Colour token from the curated palette (see Phase 1). undefined = default. */
  color?: string;
  /** Lucide icon name from the curated set (see Phase 2). undefined = default. */
  icon?: string;
  /** Folder this session belongs to, or null/undefined for ungrouped. */
  folderId?: string | null;
  /** Geese-flock agent slug this session belongs to. undefined = unassigned. */
  agent?: string;
}

export interface FolderData {
  id: string;
  name: string;
  position: number;
}

export interface SessionUiMetadata {
  /** Schema version — bump when we change the shape on disk. */
  version: 1;
  /** Per-session data keyed by Session.id. */
  bySession: Record<string, SessionUiData>;
  /** User-defined folders, ordered by `position`. */
  folders: FolderData[];
  /** Which folders are currently expanded in the sidebar. */
  expandedFolderIds: string[];
}

export const EMPTY_SESSION_UI_METADATA: SessionUiMetadata = {
  version: 1,
  bySession: {},
  folders: [],
  expandedFolderIds: [],
};
