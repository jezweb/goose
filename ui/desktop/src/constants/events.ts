/**
 * Custom event names used throughout the application.
 */
export enum AppEvents {
  SESSION_CREATED = 'session-created',
  SESSION_EXTENSIONS_LOADED = 'session-extensions-loaded',
  SESSION_DELETED = 'session-deleted',
  SESSION_RENAMED = 'session-renamed',
  SESSION_FORKED = 'session-forked',
  SESSION_NEEDS_NAME_UPDATE = 'session-needs-name-update',
  SESSION_STATUS_UPDATE = 'session-status-update',
  ADD_ACTIVE_SESSION = 'add-active-session',
  CLEAR_INITIAL_MESSAGE = 'clear-initial-message',
  TRIGGER_NEW_CHAT = 'trigger-new-chat',
  /** Geese-flock: pre-fill the active chat input with the given value
   * (e.g. an `@<agent-slug> ` mention). Fired when a user clicks an
   * agent's "+ Start New Chat" — works whether the user lands in Hub
   * or in a reused empty Pair session, because any mounted ChatInput
   * listens for this event and applies the prefill. */
  PREFILL_CHAT_INPUT = 'prefill-chat-input',
  MESSAGE_STREAM_FINISHED = 'message-stream-finished',
  SCROLL_CHAT_TO_BOTTOM = 'scroll-chat-to-bottom',
  HIDE_ALERT_POPOVER = 'hide-alert-popover',
  RESPONSE_STYLE_CHANGED = 'responseStyleChanged',
}
