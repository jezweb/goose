import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppEvents } from '../constants/events';
import {
  EMPTY_SESSION_UI_METADATA,
  type FolderData,
  type SessionUiData,
  type SessionUiMetadata,
} from '../types/sessionUiMetadata';

interface SessionUiMetadataContextValue {
  metadata: SessionUiMetadata;
  // Per-session
  updateSession: (sessionId: string, patch: Partial<SessionUiData>) => void;
  clearSession: (sessionId: string) => void;
  // Folders
  addFolder: (name: string) => FolderData;
  renameFolder: (id: string, name: string) => void;
  removeFolder: (id: string) => void;
  setFolderExpanded: (id: string, expanded: boolean) => void;
  // Flock agent intent — set before triggering a new-chat flow; the next
  // ADD_ACTIVE_SESSION event will tag that session with this agent slug
  // and clear the intent. Lets UI surfaces "start chat with agent X"
  // without needing onNewChat to grow new parameters.
  setPendingAgent: (slug: string | null) => void;
  /** Read (without clearing) the current pendingAgent slug. Used by the
   * session-create path so it can build a Recipe with that agent's identity
   * before the session is actually created. */
  peekPendingAgent: () => string | null;
}

const SessionUiMetadataContext = createContext<SessionUiMetadataContextValue | null>(null);

const PERSIST_DEBOUNCE_MS = 500;

function omitKey<T extends Record<string, unknown>>(obj: T, key: string): T {
  if (!(key in obj)) return obj;
  const next = { ...obj };
  delete next[key];
  return next;
}

export function SessionUiMetadataProvider({ children }: { children: React.ReactNode }) {
  const [metadata, setMetadata] = useState<SessionUiMetadata>(EMPTY_SESSION_UI_METADATA);
  const writeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef<SessionUiMetadata>(EMPTY_SESSION_UI_METADATA);
  const pendingAgentRef = useRef<string | null>(null);

  // Load once on mount
  useEffect(() => {
    window.electron
      .getSessionUiMetadata()
      .then((loaded) => {
        if (loaded) {
          setMetadata(loaded);
          latestRef.current = loaded;
        }
      })
      .catch((err) => {
        console.error('Failed to load session UI metadata:', err);
      });
  }, []);

  const persist = useCallback((next: SessionUiMetadata) => {
    latestRef.current = next;
    if (writeTimerRef.current) clearTimeout(writeTimerRef.current);
    writeTimerRef.current = setTimeout(() => {
      window.electron.setSessionUiMetadata(latestRef.current).catch((err) => {
        console.error('Failed to persist session UI metadata:', err);
      });
    }, PERSIST_DEBOUNCE_MS);
  }, []);

  // Flush pending write on unmount (best effort, fire-and-forget)
  useEffect(() => {
    return () => {
      if (writeTimerRef.current) {
        clearTimeout(writeTimerRef.current);
        void window.electron.setSessionUiMetadata(latestRef.current).catch(() => {});
      }
    };
  }, []);

  // Cleanup per-session data when a session is deleted elsewhere in the app
  useEffect(() => {
    const handler = (event: Event) => {
      const sessionId = (event as CustomEvent<{ sessionId?: string }>).detail?.sessionId;
      if (!sessionId) return;
      setMetadata((prev) => {
        if (!prev.bySession[sessionId]) return prev;
        const next: SessionUiMetadata = {
          ...prev,
          bySession: omitKey(prev.bySession, sessionId),
        };
        persist(next);
        return next;
      });
    };
    window.addEventListener(AppEvents.SESSION_DELETED, handler);
    return () => window.removeEventListener(AppEvents.SESSION_DELETED, handler);
  }, [persist]);

  // Apply pending agent assignment to newly-created sessions. The intent is
  // set by an agent-button click; the next ADD_ACTIVE_SESSION event tells us
  // which session id to tag. Intent clears after one use so it doesn't leak
  // into subsequent unrelated session creations.
  useEffect(() => {
    const handler = (event: Event) => {
      const sessionId = (event as CustomEvent<{ sessionId?: string }>).detail?.sessionId;
      if (!sessionId) return;
      const slug = pendingAgentRef.current;
      if (!slug) return;
      pendingAgentRef.current = null;
      setMetadata((prev) => {
        const current = prev.bySession[sessionId] ?? {};
        const merged: SessionUiData = { ...current, agent: slug };
        const next: SessionUiMetadata = {
          ...prev,
          bySession: { ...prev.bySession, [sessionId]: merged },
        };
        persist(next);
        return next;
      });
    };
    window.addEventListener(AppEvents.ADD_ACTIVE_SESSION, handler);
    return () => window.removeEventListener(AppEvents.ADD_ACTIVE_SESSION, handler);
  }, [persist]);

  const setPendingAgent = useCallback((slug: string | null) => {
    pendingAgentRef.current = slug;
  }, []);

  const peekPendingAgent = useCallback(() => pendingAgentRef.current, []);

  const updateSession = useCallback(
    (sessionId: string, patch: Partial<SessionUiData>) => {
      setMetadata((prev) => {
        const current = prev.bySession[sessionId] ?? {};
        const merged: SessionUiData = { ...current, ...patch };
        // Drop the entry entirely if every field is empty — keeps storage minimal
        const isEmpty = Object.values(merged).every((v) => v === undefined || v === null);
        const nextBySession = isEmpty
          ? omitKey(prev.bySession, sessionId)
          : { ...prev.bySession, [sessionId]: merged };
        const next = { ...prev, bySession: nextBySession };
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const clearSession = useCallback(
    (sessionId: string) => {
      setMetadata((prev) => {
        if (!prev.bySession[sessionId]) return prev;
        const next = { ...prev, bySession: omitKey(prev.bySession, sessionId) };
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const addFolder = useCallback(
    (name: string): FolderData => {
      const newFolder: FolderData = {
        id:
          globalThis.crypto && 'randomUUID' in globalThis.crypto
            ? globalThis.crypto.randomUUID()
            : `folder-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        name: name.trim() || 'New folder',
        position: latestRef.current.folders.length,
      };
      setMetadata((prev) => {
        const next = { ...prev, folders: [...prev.folders, newFolder] };
        persist(next);
        return next;
      });
      return newFolder;
    },
    [persist]
  );

  const renameFolder = useCallback(
    (id: string, name: string) => {
      setMetadata((prev) => {
        const folders = prev.folders.map((f) =>
          f.id === id ? { ...f, name: name.trim() || f.name } : f
        );
        const next = { ...prev, folders };
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const removeFolder = useCallback(
    (id: string) => {
      setMetadata((prev) => {
        // Move sessions in this folder back to ungrouped rather than orphaning them
        const bySession: Record<string, SessionUiData> = {};
        for (const [sid, data] of Object.entries(prev.bySession)) {
          if (data.folderId === id) {
            const stripped: SessionUiData = { ...data };
            delete stripped.folderId;
            // Drop entry entirely if folder was the only field
            const isEmpty = Object.values(stripped).every(
              (v) => v === undefined || v === null
            );
            if (!isEmpty) bySession[sid] = stripped;
          } else {
            bySession[sid] = data;
          }
        }
        const folders = prev.folders.filter((f) => f.id !== id);
        const expandedFolderIds = prev.expandedFolderIds.filter((fid) => fid !== id);
        const next = { ...prev, bySession, folders, expandedFolderIds };
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const setFolderExpanded = useCallback(
    (id: string, expanded: boolean) => {
      setMetadata((prev) => {
        const isExpanded = prev.expandedFolderIds.includes(id);
        if (expanded === isExpanded) return prev;
        const expandedFolderIds = expanded
          ? [...prev.expandedFolderIds, id]
          : prev.expandedFolderIds.filter((fid) => fid !== id);
        const next = { ...prev, expandedFolderIds };
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const value = useMemo<SessionUiMetadataContextValue>(
    () => ({
      metadata,
      updateSession,
      clearSession,
      addFolder,
      renameFolder,
      removeFolder,
      setFolderExpanded,
      setPendingAgent,
      peekPendingAgent,
    }),
    [
      metadata,
      updateSession,
      clearSession,
      addFolder,
      renameFolder,
      removeFolder,
      setFolderExpanded,
      setPendingAgent,
      peekPendingAgent,
    ]
  );

  return (
    <SessionUiMetadataContext.Provider value={value}>
      {children}
    </SessionUiMetadataContext.Provider>
  );
}

export function useSessionUiMetadata(): SessionUiMetadataContextValue {
  const ctx = useContext(SessionUiMetadataContext);
  if (!ctx) {
    throw new Error('useSessionUiMetadata must be used within SessionUiMetadataProvider');
  }
  return ctx;
}
