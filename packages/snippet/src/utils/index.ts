/**
 * Utility functions for the Search Snippet Library
 */

import { AISearchClient } from '../api/ai-search.ts';
import type { Client } from '../api/index.ts';

export { LOADING_MESSAGE_INTERVAL_MS, LOADING_MESSAGES } from './loading-messages.ts';

/**
 * Debounce function to limit API calls
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: number | undefined;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };

    clearTimeout(timeout);
    timeout = setTimeout(later, wait) as unknown as number;
  };
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
 * Decode HTML entities (e.g., &#38; -> &, &amp; -> &)
 */
export function decodeHTMLEntities(text: string): string {
  const doc = new DOMParser().parseFromString(text, 'text/html');
  return doc.documentElement.textContent || '';
}

/**
 * Format timestamp to readable date
 */
export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  // Less than a minute
  if (diff < 60000) {
    return 'Just now';
  }

  // Less than an hour
  if (diff < 3600000) {
    const minutes = Math.floor(diff / 60000);
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
  }

  // Less than a day
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  }

  // Format as date
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
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
export function createClient(apiUrl: string): Client {
  if (!apiUrl) {
    throw new Error('API URL is required');
  }

  return new AISearchClient(apiUrl);
}
