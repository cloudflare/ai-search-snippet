/**
 * Utility functions for the Search Snippet Library
 */

import { AISearchClient } from '../api/ai-search.ts';
import { interpolate, mergeTranslations, type Translations } from '../i18n/index.ts';

export { LOADING_MESSAGE_INTERVAL_MS, LOADING_MESSAGES } from './loading-messages.ts';

/**
 * Debounce function to limit API calls
 */
export type DebouncedFn<T extends (...args: unknown[]) => unknown> = ((
  ...args: Parameters<T>
) => void) & { cancel: () => void };

export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): DebouncedFn<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  function executedFunction(...args: Parameters<T>) {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      func(...args);
    }, wait);
  }

  executedFunction.cancel = () => clearTimeout(timeout);

  return executedFunction;
}

/**
 * Sanitize HTML to prevent XSS attacks
 */
export function sanitizeHTML(html: string): string {
  const div = document.createElement('div');
  div.textContent = html;
  return div.innerHTML;
}

/**
 * Escape HTML entities
 */
export function escapeHTML(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Decode percent-encoded URLs for display
 */
export function formatDisplayUrl(url: string): string {
  try {
    return decodeURI(url);
  } catch {
    return url;
  }
}

/**
 * Decode HTML entities (e.g., &#38; -> &, &amp; -> &)
 */
export function decodeHTMLEntities(text: string): string {
  const doc = new DOMParser().parseFromString(text, 'text/html');
  return doc.documentElement.textContent || '';
}

/**
 * Format timestamp to readable date.
 *
 * Accepts an optional `Translations` map (or a `Required<Translations>`
 * already merged with defaults) so relative-time strings can be localized.
 * Falls back to built-in English if no translations are provided.
 */
export function formatTimestamp(timestamp: number, translations?: Translations): string {
  const t = mergeTranslations(translations);
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  // Less than a minute
  if (diff < 60000) {
    return t.justNow;
  }

  // Less than an hour
  if (diff < 3600000) {
    const minutes = Math.floor(diff / 60000);
    const template = minutes === 1 ? t.minuteAgo : t.minutesAgo;
    return interpolate(template, { n: minutes });
  }

  // Less than a day
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    const template = hours === 1 ? t.hourAgo : t.hoursAgo;
    return interpolate(template, { n: hours });
  }

  // Format as date
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Generate unique ID
 */
export function generateId(prefix = 'id'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Parse attributes from element
 */
export function parseAttribute(value: string | null, defaultValue: string): string {
  return value !== null ? value : defaultValue;
}

export function parseBooleanAttribute(value: string | null, defaultValue: boolean): boolean {
  if (value === null) return defaultValue;
  return value === 'true' || value === '';
}

export function parseNumberAttribute(value: string | null, defaultValue: number): number {
  if (value === null) return defaultValue;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Create custom event
 */
export function createCustomEvent<T>(name: string, detail: T): CustomEvent<T> {
  return new CustomEvent(name, {
    detail,
    bubbles: true,
    composed: true,
    cancelable: true,
  });
}

/**
 * Create API client
 */
export function createClient(apiUrl: string): AISearchClient {
  if (!apiUrl) {
    throw new Error('API URL is required');
  }

  return new AISearchClient(apiUrl);
}
