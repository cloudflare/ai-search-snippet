/**
 * Translation utilities for component user-facing strings.
 *
 * Users override any subset of translations via the `translations` attribute
 * (JSON string) or property (plain object). Missing keys fall back to the
 * built-in English defaults.
 *
 * @example
 * ```html
 * <search-bar-snippet translations='{"placeholder":"Busca aqu\u00ed..."}'></search-bar-snippet>
 * ```
 *
 * @example
 * ```ts
 * element.translations = { placeholder: 'Busca aquí...' };
 * ```
 */

import { DEFAULT_TRANSLATIONS } from './defaults.ts';

/**
 * All user-facing strings rendered by the snippet components.
 *
 * All keys are optional; unspecified keys fall back to English defaults.
 * Strings can contain `{name}` tokens that are interpolated at render time.
 */
export interface Translations {
  // Shared
  /** Aria label for loading spinners. Default: "Loading" */
  loadingAriaLabel?: string;
  /** Bold prefix for error messages. Default: "Error:" */
  errorPrefix?: string;
  /** Message shown when the `api-url` attribute is missing. */
  missingApiUrlError?: string;
  /** Branding prefix before the product link. Default: "Powered by" */
  poweredBy?: string;
  /** Branding link label. Default: "Cloudflare AI Search" */
  poweredByLinkLabel?: string;

  // Search
  /** Search input placeholder text. */
  placeholder?: string;
  /** Search submit button text and aria-label. */
  searchButtonLabel?: string;
  /** Aria-label for the search input on the bar variant. */
  searchInputAriaLabel?: string;
  /** Aria-label for the modal results list. */
  searchResultsAriaLabel?: string;
  /** Title shown before a user enters a query (bar variant). */
  emptyStateTitle?: string;
  /** Description shown before a user enters a query (bar variant). */
  emptyStateDescription?: string;
  /** Description shown before a user enters a query (modal variant). */
  modalEmptyStateDescription?: string;
  /** Title shown when a search returns no results (bar variant). */
  noResultsTitle?: string;
  /** Description shown when a search returns no results (bar variant). Supports `{query}`. */
  noResultsDescription?: string;
  /** Title shown when a search returns no results (modal variant). */
  modalNoResultsTitle?: string;
  /** Description shown when a search returns no results (modal variant). Supports `{query}`. */
  modalNoResultsDescription?: string;
  /** Bar results count when exactly 1 result. Supports `{n}`. */
  resultsCount?: string;
  /** Bar results count when multiple results. Supports `{n}`. */
  resultsCountPlural?: string;
  /** Bar/modal results count when truncated. Supports `{n}` and `{total}`. */
  resultsCountOverflow?: string;
  /** Modal footer results count when exactly 1 result. Supports `{n}`. */
  modalResultsCount?: string;
  /** Modal footer results count when multiple results. Supports `{n}`. */
  modalResultsCountPlural?: string;
  /** Modal footer count shown with the zero-results state. */
  modalResultsCountZero?: string;
  /** Modal footer text shown with the error state. */
  modalResultsCountError?: string;
  /** Label for the "see more" link when `see-more` is configured. */
  seeMoreResults?: string;

  // Modal-only
  /** Modal footer hint next to the ↑ ↓ keys. */
  navigateHint?: string;
  /** Modal footer hint next to the ↵ key. */
  selectHint?: string;
  /** Modal footer hint next to the Esc key. */
  closeHint?: string;

  // Chat
  /** Chat header title. */
  chatTitle?: string;
  /** Chat input placeholder text. */
  chatPlaceholder?: string;
  /** Aria-label for the chat textarea. */
  chatInputAriaLabel?: string;
  /** Chat send button text. */
  sendButtonLabel?: string;
  /** Chat send button aria-label. */
  sendButtonAriaLabel?: string;
  /** Empty chat state title. */
  chatEmptyTitle?: string;
  /** Empty chat state description. */
  chatEmptyDescription?: string;
  /** User message avatar text. Default: "U" */
  userAvatar?: string;
  /** Assistant message avatar text. Default: "AI" */
  assistantAvatar?: string;
  /** Fallback for chat errors with no message. */
  unknownError?: string;

  // Chat bubble
  /** Aria-label for the floating chat bubble button. */
  openChatAriaLabel?: string;
  /** Aria-label for the clear-history icon button. */
  clearHistoryAriaLabel?: string;
  /** Aria-label for the minimize icon button. */
  minimizeAriaLabel?: string;
  /** Aria-label for the close icon button. */
  closeAriaLabel?: string;

  // Chat page
  /** Sidebar heading on the chat-page variant. */
  historyTitle?: string;
  /** New-chat button label. */
  newChatButton?: string;
  /** Clear-chat header button label. */
  clearChatButton?: string;
  /** Tooltip for the sidebar toggle button. */
  toggleSidebarTitle?: string;
  /** Tooltip for a per-session delete button. */
  deleteChatTitle?: string;
  /** Empty sessions list message. */
  noChatsYet?: string;
  /** Label for "one day ago" in the sessions list. */
  yesterday?: string;

  // Relative timestamps (formatTimestamp)
  /** Relative timestamp for < 1 minute ago. */
  justNow?: string;
  /** Relative timestamp for exactly 1 minute ago. Supports `{n}`. */
  minuteAgo?: string;
  /** Relative timestamp for 2-59 minutes ago. Supports `{n}`. */
  minutesAgo?: string;
  /** Relative timestamp for exactly 1 hour ago. Supports `{n}`. */
  hourAgo?: string;
  /** Relative timestamp for 2-23 hours ago. Supports `{n}`. */
  hoursAgo?: string;

  /** Cycling loading messages shown during search/streaming. Provide the full array to override. */
  loadingMessages?: string[];
}

/**
 * Merge user-provided translations with built-in defaults.
 *
 * Performs a shallow merge so any omitted keys fall back to English. If
 * `loadingMessages` is provided, it fully replaces the default array.
 */
export function mergeTranslations(user?: Translations | null): Required<Translations> {
  if (!user || typeof user !== 'object') {
    return DEFAULT_TRANSLATIONS;
  }

  const merged = { ...DEFAULT_TRANSLATIONS } as Required<Translations>;
  for (const key of Object.keys(user) as (keyof Translations)[]) {
    const value = user[key];
    if (value === undefined || value === null) continue;

    if (key === 'loadingMessages') {
      if (Array.isArray(value) && value.length > 0) {
        merged.loadingMessages = value.filter((m): m is string => typeof m === 'string');
        if (merged.loadingMessages.length === 0) {
          merged.loadingMessages = DEFAULT_TRANSLATIONS.loadingMessages;
        }
      }
      continue;
    }

    if (typeof value === 'string') {
      (merged as Record<string, unknown>)[key] = value;
    }
  }

  return merged;
}

/**
 * Replace `{name}` tokens in a template with values from `vars`.
 *
 * Unknown tokens are left untouched. Values are coerced to strings.
 */
export function interpolate(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, name) => {
    if (Object.hasOwn(vars, name)) {
      return String(vars[name]);
    }
    return match;
  });
}

/**
 * Parse the `translations` HTML attribute (a JSON string) into an object.
 *
 * Returns `null` if the attribute is missing or invalid. Logs a warning
 * (prefixed with `componentName`) when JSON is malformed.
 */
export function parseTranslationsAttribute(
  raw: string | null,
  componentName: string
): Translations | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('translations must be a JSON object');
    }
    return parsed as Translations;
  } catch (error) {
    console.error(`${componentName}: invalid translations attribute`, error);
    return null;
  }
}

export { DEFAULT_TRANSLATIONS } from './defaults.ts';
