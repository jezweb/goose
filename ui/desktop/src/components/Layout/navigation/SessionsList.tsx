import React, { useState, useCallback, useRef } from 'react';
import {
  MessageSquare,
  ChefHat,
  Plus,
  History,
  Pencil,
  Trash2,
  Palette,
  Check,
  Circle,
  Shapes,
  Folder,
  FolderOpen,
  FolderPlus,
  FolderMinus,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-toastify';
import { SessionIndicators } from '../../SessionIndicators';
import { InlineEditText, type InlineEditTextHandle } from '../../common/InlineEditText';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '../../ui/context-menu';
import { ConfirmationModal } from '../../ui/ConfirmationModal';
import { cn } from '../../../utils';
import { errorMessage } from '../../../utils/conversionUtils';
import { getSessionDisplayName } from '../../../hooks/useNavigationSessions';
import { deleteSession, updateSessionName } from '../../../api';
import type { Session } from '../../../api';
import type { SessionStatus } from './types';
import { AppEvents } from '../../../constants/events';
import { defineMessages, useIntl } from '../../../i18n';
import { useSessionUiMetadata } from '../../../contexts/SessionUiMetadataContext';
import { useFlockAgents } from '../../../contexts/FlockAgentsContext';
import {
  SESSION_COLORS,
  SESSION_ICONS,
  findSessionColor,
  findSessionIcon,
} from '../../../constants/sessionPalette';
import { FolderNameDialog, type FolderDialogMode } from './FolderNameDialog';

const i18n = defineMessages({
  startNewChat: {
    id: 'sessionsList.startNewChat',
    defaultMessage: 'Start New Chat',
  },
  startChatWithAgent: {
    id: 'sessionsList.startChatWithAgent',
    defaultMessage: 'Start chat with {agent}',
  },
  agentsHeader: {
    id: 'sessionsList.agentsHeader',
    defaultMessage: 'Agents',
  },
  untitledSession: {
    id: 'sessionsList.untitledSession',
    defaultMessage: 'Untitled session',
  },
  showAll: {
    id: 'sessionsList.showAll',
    defaultMessage: 'Show All',
  },
  rename: {
    id: 'sessionsList.rename',
    defaultMessage: 'Rename',
  },
  delete: {
    id: 'sessionsList.delete',
    defaultMessage: 'Delete',
  },
  deleteConfirmTitle: {
    id: 'sessionsList.deleteConfirmTitle',
    defaultMessage: 'Delete chat',
  },
  deleteConfirmMessage: {
    id: 'sessionsList.deleteConfirmMessage',
    defaultMessage: 'Delete "{name}"? This cannot be undone.',
  },
  confirmDelete: {
    id: 'sessionsList.confirmDelete',
    defaultMessage: 'Delete',
  },
  cancelDelete: {
    id: 'sessionsList.cancelDelete',
    defaultMessage: 'Cancel',
  },
  deleteSuccess: {
    id: 'sessionsList.deleteSuccess',
    defaultMessage: 'Chat deleted',
  },
  deleteError: {
    id: 'sessionsList.deleteError',
    defaultMessage: 'Failed to delete chat',
  },
  colour: {
    id: 'sessionsList.colour',
    defaultMessage: 'Colour',
  },
  colourNone: {
    id: 'sessionsList.colourNone',
    defaultMessage: 'No colour',
  },
  icon: {
    id: 'sessionsList.icon',
    defaultMessage: 'Icon',
  },
  iconDefault: {
    id: 'sessionsList.iconDefault',
    defaultMessage: 'Default',
  },
  iconSearchPlaceholder: {
    id: 'sessionsList.iconSearchPlaceholder',
    defaultMessage: 'Search icons',
  },
  iconNoResults: {
    id: 'sessionsList.iconNoResults',
    defaultMessage: 'No icons match',
  },
  moveToFolder: {
    id: 'sessionsList.moveToFolder',
    defaultMessage: 'Move to folder',
  },
  ungrouped: {
    id: 'sessionsList.ungrouped',
    defaultMessage: 'Ungrouped',
  },
  newFolder: {
    id: 'sessionsList.newFolder',
    defaultMessage: 'New folder…',
  },
  renameFolder: {
    id: 'sessionsList.renameFolder',
    defaultMessage: 'Rename folder',
  },
  deleteFolder: {
    id: 'sessionsList.deleteFolder',
    defaultMessage: 'Delete folder',
  },
});

interface SessionsListProps {
  sessions: Session[];
  activeSessionId?: string;
  isExpanded: boolean;
  getSessionStatus: (sessionId: string) => SessionStatus | undefined;
  clearUnread: (sessionId: string) => void;
  onSessionClick: (sessionId: string) => void;
  onSessionRenamed?: () => void;
  onSessionDeleted?: () => void;
  onNewChat?: () => void;
  onShowAll?: () => void;
}

export const SessionsList: React.FC<SessionsListProps> = ({
  sessions,
  activeSessionId,
  isExpanded,
  getSessionStatus,
  clearUnread,
  onSessionClick,
  onSessionRenamed,
  onSessionDeleted,
  onNewChat,
  onShowAll,
}) => {
  const intl = useIntl();
  const {
    metadata,
    updateSession,
    addFolder,
    renameFolder,
    removeFolder,
    setFolderExpanded,
    setPendingAgent,
  } = useSessionUiMetadata();
  const { agents: flockAgents } = useFlockAgents();

  // Track which agent sections the user has collapsed. Default is all
  // expanded (we invert the predicate so an empty set means everything open).
  // Resets each app start — agent count is small so persistent state isn't
  // worth the storage complexity yet.
  const [collapsedAgents, setCollapsedAgents] = useState<Set<string>>(new Set());
  const toggleAgentExpanded = useCallback((slug: string) => {
    setCollapsedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }, []);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [sessionToDelete, setSessionToDelete] = useState<Session | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [iconSearch, setIconSearch] = useState('');
  const inlineEditRefs = useRef<Map<string, InlineEditTextHandle>>(new Map());

  // Lowercased once per render for fast lookup across all open icon submenus.
  const iconSearchLower = iconSearch.trim().toLowerCase();
  const filteredIcons = iconSearchLower
    ? SESSION_ICONS.filter(
        (i) =>
          i.label.toLowerCase().includes(iconSearchLower) ||
          i.id.toLowerCase().includes(iconSearchLower)
      )
    : SESSION_ICONS;

  // Folder name dialog state. `onConfirm` is set per-open so the same dialog
  // serves both "create new folder + move chat into it" and "rename folder".
  const [folderDialog, setFolderDialog] = useState<{
    open: boolean;
    mode: FolderDialogMode;
    initialName: string;
    onConfirm: (name: string) => void;
  } | null>(null);

  const closeFolderDialog = useCallback(() => setFolderDialog(null), []);

  const openCreateFolderForSession = useCallback(
    (sessionId: string) => {
      setFolderDialog({
        open: true,
        mode: 'create',
        initialName: '',
        onConfirm: (name) => {
          const folder = addFolder(name);
          updateSession(sessionId, { folderId: folder.id });
          setFolderExpanded(folder.id, true);
          setFolderDialog(null);
        },
      });
    },
    [addFolder, updateSession, setFolderExpanded]
  );

  const openRenameFolder = useCallback(
    (folderId: string, currentName: string) => {
      setFolderDialog({
        open: true,
        mode: 'rename',
        initialName: currentName,
        onConfirm: (name) => {
          renameFolder(folderId, name);
          setFolderDialog(null);
        },
      });
    },
    [renameFolder]
  );

  const moveSessionToFolder = useCallback(
    (sessionId: string, folderId: string | null) => {
      updateSession(sessionId, { folderId: folderId ?? undefined });
      if (folderId) setFolderExpanded(folderId, true);
    },
    [updateSession, setFolderExpanded]
  );

  const handleSaveSessionName = useCallback(
    async (sessionId: string, newName: string) => {
      await updateSessionName({
        path: { session_id: sessionId },
        body: { name: newName },
      });
      onSessionRenamed?.();
    },
    [onSessionRenamed]
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!sessionToDelete) return;
    setIsDeleting(true);
    try {
      await deleteSession({
        path: { session_id: sessionToDelete.id },
        throwOnError: true,
      });
      toast.success(intl.formatMessage(i18n.deleteSuccess));
      window.dispatchEvent(
        new CustomEvent(AppEvents.SESSION_DELETED, {
          detail: { sessionId: sessionToDelete.id },
        })
      );
      onSessionDeleted?.();
      setSessionToDelete(null);
    } catch (err) {
      toast.error(errorMessage(err, intl.formatMessage(i18n.deleteError)));
    } finally {
      setIsDeleting(false);
    }
  }, [sessionToDelete, onSessionDeleted, intl]);

  // Group sessions in priority: agent first, then folder, then unassigned.
  // A session with both an agent and a folder shows under its agent (the
  // folder tag is still in metadata for later — nested-folder-under-agent is
  // future work, not today).
  const folderById = new Map(metadata.folders.map((f) => [f.id, f]));
  const orderedFolders = [...metadata.folders].sort((a, b) => a.position - b.position);
  const agentBySlug = new Map(flockAgents.map((a) => [a.slug, a]));
  const sessionsByAgent = new Map<string, Session[]>();
  const ungroupedSessions: Session[] = [];
  const sessionsByFolder = new Map<string, Session[]>();
  for (const session of sessions) {
    const ui = metadata.bySession[session.id];
    if (ui?.agent && agentBySlug.has(ui.agent)) {
      const list = sessionsByAgent.get(ui.agent) ?? [];
      list.push(session);
      sessionsByAgent.set(ui.agent, list);
      continue;
    }
    const fid = ui?.folderId;
    if (fid && folderById.has(fid)) {
      const list = sessionsByFolder.get(fid) ?? [];
      list.push(session);
      sessionsByFolder.set(fid, list);
    } else {
      ungroupedSessions.push(session);
    }
  }
  const expandedSet = new Set(metadata.expandedFolderIds);

  const renderSessionRow = (session: Session) => {
    const status = getSessionStatus(session.id);
    const isStreaming = status?.streamState === 'streaming';
    const hasError = status?.streamState === 'error';
    const hasUnread = status?.hasUnreadActivity ?? false;
    const isActiveSession = session.id === activeSessionId;
    const isEditing = editingSessionId === session.id;
    const sessionUi = metadata.bySession[session.id];
    const colourEntry = findSessionColor(sessionUi?.color);
    const iconEntry = findSessionIcon(sessionUi?.icon);
    // Precedence: user-chosen icon > recipe (ChefHat) > default (MessageSquare)
    const RowIcon = iconEntry?.Icon ?? (session.recipe ? ChefHat : MessageSquare);
    const currentFolderId = sessionUi?.folderId ?? null;

    return (
      <ContextMenu key={session.id}>
        <ContextMenuTrigger asChild>
          <div
            onClick={() => {
              if (!isEditing) {
                clearUnread(session.id);
                onSessionClick(session.id);
              }
            }}
            className={cn(
              'w-full text-left py-1.5 px-2 text-xs rounded-md',
              'hover:bg-background-tertiary transition-colors',
              'flex items-center gap-2 cursor-pointer',
              isActiveSession && 'bg-background-tertiary'
            )}
          >
            <div className="w-4 flex-shrink-0 flex items-center justify-center">
              {colourEntry && (
                <span
                  className={cn('size-2 rounded-full', colourEntry.dotClass)}
                  aria-label={`Colour: ${colourEntry.label}`}
                />
              )}
            </div>
            <RowIcon className="w-4 h-4 flex-shrink-0 text-text-secondary" />
            <InlineEditText
              ref={(handle) => {
                if (handle) {
                  inlineEditRefs.current.set(session.id, handle);
                } else {
                  inlineEditRefs.current.delete(session.id);
                }
              }}
              value={getSessionDisplayName(session)}
              onSave={(newName) => handleSaveSessionName(session.id, newName)}
              placeholder={intl.formatMessage(i18n.untitledSession)}
              disabled={isStreaming}
              singleClickEdit={false}
              className="truncate text-text-primary flex-1 !px-0 !py-0 hover:bg-transparent"
              editClassName="!text-xs"
              onEditStart={() => setEditingSessionId(session.id)}
              onEditEnd={() => setEditingSessionId(null)}
            />
            <SessionIndicators
              isStreaming={isStreaming}
              hasUnread={hasUnread}
              hasError={hasError}
            />
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem
            disabled={isStreaming}
            onSelect={() => {
              inlineEditRefs.current.get(session.id)?.startEditing();
            }}
          >
            <Pencil />
            {intl.formatMessage(i18n.rename)}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Palette />
              {intl.formatMessage(i18n.colour)}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuItem
                onSelect={() => updateSession(session.id, { color: undefined })}
              >
                <Circle />
                {intl.formatMessage(i18n.colourNone)}
                {!colourEntry && <Check className="ml-auto" />}
              </ContextMenuItem>
              {SESSION_COLORS.map((c) => (
                <ContextMenuItem
                  key={c.id}
                  onSelect={() => updateSession(session.id, { color: c.id })}
                >
                  <span className={cn('size-3 rounded-full', c.dotClass)} />
                  {c.label}
                  {colourEntry?.id === c.id && <Check className="ml-auto" />}
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Shapes />
              {intl.formatMessage(i18n.icon)}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-72 p-2 flex flex-col gap-2">
              <input
                type="text"
                value={iconSearch}
                onChange={(e) => setIconSearch(e.target.value)}
                placeholder={intl.formatMessage(i18n.iconSearchPlaceholder)}
                autoFocus
                onKeyDown={(e) => {
                  // Let Esc bubble so Radix closes the menu; swallow other
                  // keys so the menu's type-ahead nav doesn't steal them.
                  if (e.key !== 'Escape') e.stopPropagation();
                }}
                className="w-full px-2 py-1 text-sm rounded-md border bg-background-primary text-text-primary border-border-primary focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
              <ContextMenuItem
                onSelect={() => {
                  updateSession(session.id, { icon: undefined });
                  setIconSearch('');
                }}
              >
                <MessageSquare />
                {intl.formatMessage(i18n.iconDefault)}
                {!iconEntry && <Check className="ml-auto" />}
              </ContextMenuItem>
              {filteredIcons.length === 0 ? (
                <div className="px-2 py-3 text-xs text-text-secondary text-center">
                  {intl.formatMessage(i18n.iconNoResults)}
                </div>
              ) : (
                <div className="grid grid-cols-5 gap-1 max-h-64 overflow-y-auto">
                  {filteredIcons.map(({ id, label, Icon }) => (
                    <ContextMenuItem
                      key={id}
                      onSelect={() => {
                        updateSession(session.id, { icon: id });
                        setIconSearch('');
                      }}
                      title={label}
                      className={cn(
                        '!gap-0 !p-0 aspect-square flex items-center justify-center relative',
                        iconEntry?.id === id && 'bg-background-secondary'
                      )}
                    >
                      <Icon className="size-4" />
                      {iconEntry?.id === id && (
                        <Check className="absolute top-0.5 right-0.5 size-2.5" />
                      )}
                    </ContextMenuItem>
                  ))}
                </div>
              )}
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Folder />
              {intl.formatMessage(i18n.moveToFolder)}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuItem onSelect={() => moveSessionToFolder(session.id, null)}>
                <Circle />
                {intl.formatMessage(i18n.ungrouped)}
                {currentFolderId === null && <Check className="ml-auto" />}
              </ContextMenuItem>
              {orderedFolders.length > 0 && <ContextMenuSeparator />}
              {orderedFolders.map((folder) => (
                <ContextMenuItem
                  key={folder.id}
                  onSelect={() => moveSessionToFolder(session.id, folder.id)}
                >
                  <Folder />
                  {folder.name}
                  {currentFolderId === folder.id && <Check className="ml-auto" />}
                </ContextMenuItem>
              ))}
              <ContextMenuSeparator />
              <ContextMenuItem onSelect={() => openCreateFolderForSession(session.id)}>
                <FolderPlus />
                {intl.formatMessage(i18n.newFolder)}
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSeparator />
          <ContextMenuItem
            variant="destructive"
            disabled={isStreaming}
            onSelect={() => setSessionToDelete(session)}
          >
            <Trash2 />
            {intl.formatMessage(i18n.delete)}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  const renderFolderHeader = (
    folder: { id: string; name: string; position: number },
    childCount: number
  ) => {
    const isExpanded = expandedSet.has(folder.id);
    const HeaderIcon = isExpanded ? FolderOpen : Folder;
    return (
      <ContextMenu key={`folder-${folder.id}`}>
        <ContextMenuTrigger asChild>
          <div
            onClick={() => setFolderExpanded(folder.id, !isExpanded)}
            className={cn(
              'w-full text-left py-1.5 px-2 text-xs rounded-md',
              'hover:bg-background-tertiary transition-colors',
              'flex items-center gap-2 cursor-pointer text-text-primary'
            )}
          >
            <div className="w-4 flex-shrink-0" />
            <HeaderIcon className="w-4 h-4 flex-shrink-0 text-text-secondary" />
            <span className="truncate flex-1 font-medium">{folder.name}</span>
            <span className="text-text-secondary tabular-nums">{childCount}</span>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={() => openRenameFolder(folder.id, folder.name)}>
            <Pencil />
            {intl.formatMessage(i18n.renameFolder)}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem variant="destructive" onSelect={() => removeFolder(folder.id)}>
            <FolderMinus />
            {intl.formatMessage(i18n.deleteFolder)}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  return (
    <AnimatePresence>
      {isExpanded && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="mt-[2px] flex-1 min-h-0 flex flex-col"
        >
          <div className="bg-background-primary rounded-lg py-1 flex flex-col gap-[2px] flex-1 min-h-0 overflow-hidden">
            {/* New Chat button — always visible, doesn't scroll */}
            {onNewChat && (
              <div
                onClick={onNewChat}
                className={cn(
                  'w-full text-left py-1.5 px-2 text-xs rounded-md flex-shrink-0',
                  'hover:bg-background-tertiary transition-colors',
                  'flex items-center gap-2 cursor-pointer'
                )}
              >
                <div className="w-4 flex-shrink-0" />
                <Plus className="w-4 h-4 flex-shrink-0 text-text-secondary" />
                <span className="text-text-primary">{intl.formatMessage(i18n.startNewChat)}</span>
              </div>
            )}

            {/* Scrollable middle: ungrouped sessions + folders + agents + their children */}
            <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-[2px]">
              {ungroupedSessions.map(renderSessionRow)}

              {orderedFolders.map((folder) => {
                const folderSessions = sessionsByFolder.get(folder.id) ?? [];
                const isFolderExpanded = expandedSet.has(folder.id);
                return (
                  <React.Fragment key={folder.id}>
                    {renderFolderHeader(folder, folderSessions.length)}
                    {isFolderExpanded && folderSessions.length > 0 && (
                      <div className="pl-3 flex flex-col gap-[2px]">
                        {folderSessions.map(renderSessionRow)}
                      </div>
                    )}
                  </React.Fragment>
                );
              })}

              {/* Geese-flock agent sections — each agent is a folder-shaped
                  header with its own +New Chat and tagged-session children. */}
              {flockAgents.map((agent) => {
                const agentSessions = sessionsByAgent.get(agent.slug) ?? [];
                const isAgentExpanded = !collapsedAgents.has(agent.slug);
                const HeaderIcon = isAgentExpanded ? FolderOpen : Folder;
                return (
                  <React.Fragment key={`agent-${agent.slug}`}>
                    <div
                      onClick={() => toggleAgentExpanded(agent.slug)}
                      title={agent.description ?? agent.name}
                      className={cn(
                        'w-full text-left py-1.5 px-2 text-xs rounded-md',
                        'hover:bg-background-tertiary transition-colors',
                        'flex items-center gap-2 cursor-pointer text-text-primary'
                      )}
                    >
                      <div className="w-4 flex-shrink-0" />
                      <HeaderIcon className="w-4 h-4 flex-shrink-0 text-text-secondary" />
                      <span className="truncate flex-1 font-medium">{agent.name}</span>
                      <span className="text-text-secondary tabular-nums">
                        {agentSessions.length}
                      </span>
                    </div>
                    {isAgentExpanded && (
                      <div className="pl-3 flex flex-col gap-[2px]">
                        {onNewChat && (
                          <div
                            onClick={() => {
                              setPendingAgent(agent.slug);
                              onNewChat();
                              // Pre-fill the active chat input with `@<slug> `
                              // via global event — works whether onNewChat
                              // navigates to Hub (fresh session) or reuses
                              // an empty active session in Pair. Slight delay
                              // so the destination ChatInput is mounted/in DOM.
                              window.setTimeout(() => {
                                window.dispatchEvent(
                                  new CustomEvent(AppEvents.PREFILL_CHAT_INPUT, {
                                    detail: { value: `@${agent.slug} ` },
                                  })
                                );
                              }, 50);
                            }}
                            className={cn(
                              'w-full text-left py-1.5 px-2 text-xs rounded-md',
                              'hover:bg-background-tertiary transition-colors',
                              'flex items-center gap-2 cursor-pointer'
                            )}
                          >
                            <div className="w-4 flex-shrink-0" />
                            <Plus className="w-4 h-4 flex-shrink-0 text-text-secondary" />
                            <span className="text-text-primary">
                              {intl.formatMessage(i18n.startNewChat)}
                            </span>
                          </div>
                        )}
                        {agentSessions.map(renderSessionRow)}
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>

            {/* Show All button — pinned at bottom, doesn't scroll */}
            {onShowAll && sessions.length > 0 && (
              <div
                onClick={onShowAll}
                className={cn(
                  'w-full text-left py-1.5 px-2 text-xs rounded-md flex-shrink-0',
                  'hover:bg-background-tertiary transition-colors',
                  'flex items-center gap-2 cursor-pointer text-text-secondary'
                )}
              >
                <div className="w-4 flex-shrink-0" />
                <History className="w-4 h-4 flex-shrink-0" />
                <span>{intl.formatMessage(i18n.showAll)}</span>
              </div>
            )}
          </div>
          <ConfirmationModal
            isOpen={sessionToDelete !== null}
            title={intl.formatMessage(i18n.deleteConfirmTitle)}
            message={intl.formatMessage(i18n.deleteConfirmMessage, {
              name: sessionToDelete ? getSessionDisplayName(sessionToDelete) : '',
            })}
            confirmLabel={intl.formatMessage(i18n.confirmDelete)}
            cancelLabel={intl.formatMessage(i18n.cancelDelete)}
            confirmVariant="destructive"
            isSubmitting={isDeleting}
            onConfirm={handleConfirmDelete}
            onCancel={() => setSessionToDelete(null)}
          />
          {folderDialog && (
            <FolderNameDialog
              open={folderDialog.open}
              mode={folderDialog.mode}
              initialName={folderDialog.initialName}
              onConfirm={folderDialog.onConfirm}
              onCancel={closeFolderDialog}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
