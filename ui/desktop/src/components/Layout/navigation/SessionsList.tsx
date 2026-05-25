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
import {
  SESSION_COLORS,
  SESSION_ICONS,
  findSessionColor,
  findSessionIcon,
} from '../../../constants/sessionPalette';

const i18n = defineMessages({
  startNewChat: {
    id: 'sessionsList.startNewChat',
    defaultMessage: 'Start New Chat',
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
  const { metadata, updateSession } = useSessionUiMetadata();
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [sessionToDelete, setSessionToDelete] = useState<Session | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const inlineEditRefs = useRef<Map<string, InlineEditTextHandle>>(new Map());

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

  return (
    <AnimatePresence>
      {isExpanded && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden mt-[2px]"
        >
          <div className="bg-background-primary rounded-lg py-1 flex flex-col gap-[2px]">
            {/* New Chat button as first item */}
            {onNewChat && (
              <div
                onClick={onNewChat}
                className={cn(
                  'w-full text-left py-1.5 px-2 text-xs rounded-md',
                  'hover:bg-background-tertiary transition-colors',
                  'flex items-center gap-2 cursor-pointer'
                )}
              >
                <div className="w-4 flex-shrink-0" />
                <Plus className="w-4 h-4 flex-shrink-0 text-text-secondary" />
                <span className="text-text-primary">{intl.formatMessage(i18n.startNewChat)}</span>
              </div>
            )}

            {sessions.map((session) => {
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
                      <ContextMenuSubContent className="max-h-[400px] overflow-y-auto">
                        <ContextMenuItem
                          onSelect={() => updateSession(session.id, { icon: undefined })}
                        >
                          <MessageSquare />
                          {intl.formatMessage(i18n.iconDefault)}
                          {!iconEntry && <Check className="ml-auto" />}
                        </ContextMenuItem>
                        {SESSION_ICONS.map(({ id, label, Icon }) => (
                          <ContextMenuItem
                            key={id}
                            onSelect={() => updateSession(session.id, { icon: id })}
                          >
                            <Icon />
                            {label}
                            {iconEntry?.id === id && <Check className="ml-auto" />}
                          </ContextMenuItem>
                        ))}
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
            })}

            {/* Show All button at bottom */}
            {onShowAll && sessions.length > 0 && (
              <div
                onClick={onShowAll}
                className={cn(
                  'w-full text-left py-1.5 px-2 text-xs rounded-md',
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
        </motion.div>
      )}
    </AnimatePresence>
  );
};
