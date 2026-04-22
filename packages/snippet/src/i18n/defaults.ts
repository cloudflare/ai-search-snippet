/**
 * Default English translations for all components.
 *
 * Keys are flat camelCase. Strings with `{name}` tokens are interpolated with
 * `interpolate()` at render time. Singular/plural forms use separate keys.
 */

import type { Translations } from './index.ts';

export const DEFAULT_TRANSLATIONS: Required<Translations> = {
  // Shared
  loadingAriaLabel: 'Loading',
  errorPrefix: 'Error:',
  missingApiUrlError: 'The api-url attribute is required. Please provide a valid API URL.',
  poweredBy: 'Powered by',
  poweredByLinkLabel: 'Cloudflare AI Search',

  // Search (shared between bar and modal)
  placeholder: 'Search...',
  searchButtonLabel: 'Search',
  searchInputAriaLabel: 'Search input',
  searchResultsAriaLabel: 'Search results',
  emptyStateTitle: 'Start Searching',
  emptyStateDescription: 'Enter a query to search for results',
  modalEmptyStateDescription: 'Start typing to search',
  noResultsTitle: 'No Results Found',
  noResultsDescription: 'No results found for "{query}"',
  modalNoResultsTitle: 'No results found',
  modalNoResultsDescription: 'No results for "{query}"',
  resultsCount: 'Found {n} result',
  resultsCountPlural: 'Found {n} results',
  resultsCountOverflow: 'Showing {n} of {total} results',
  modalResultsCount: '{n} result',
  modalResultsCountPlural: '{n} results',
  modalResultsCountZero: '0 results',
  modalResultsCountError: 'Error',
  seeMoreResults: 'See more results',

  // Modal-only
  navigateHint: 'Navigate',
  selectHint: 'Select',
  closeHint: 'Close',

  // Chat (shared between bubble, page, and chat view)
  chatTitle: 'Chat',
  chatPlaceholder: 'Type a message...',
  chatInputAriaLabel: 'Chat message input',
  sendButtonLabel: 'Send',
  sendButtonAriaLabel: 'Send message',
  chatEmptyTitle: 'Start a Conversation',
  chatEmptyDescription: 'Send a message to begin chatting',
  userAvatar: 'U',
  assistantAvatar: 'AI',
  unknownError: 'Unknown error',

  // Chat bubble
  openChatAriaLabel: 'Open chat',
  clearHistoryAriaLabel: 'Clear history',
  minimizeAriaLabel: 'Minimize',
  closeAriaLabel: 'Close',

  // Chat page
  historyTitle: 'History',
  newChatButton: 'New Chat',
  clearChatButton: 'Clear Chat',
  toggleSidebarTitle: 'Toggle sidebar',
  deleteChatTitle: 'Delete chat',
  noChatsYet: 'No chats yet',
  yesterday: 'Yesterday',

  // Relative timestamps (formatTimestamp)
  justNow: 'Just now',
  minuteAgo: '{n} minute ago',
  minutesAgo: '{n} minutes ago',
  hourAgo: '{n} hour ago',
  hoursAgo: '{n} hours ago',

  // Cycling loading messages
  loadingMessages: [
    'Searching...',
    'Digging through results...',
    'Scanning the knowledge base...',
    'Finding the best matches...',
    'Sifting through the data...',
    'Almost there...',
    'Looking far and wide...',
    'Connecting the dots...',
    'Rummaging through pages...',
    'Hunting down answers...',
  ],
};
