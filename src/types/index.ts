/**
 * Core type definitions for the Search Snippet Library
 */

export type Theme = 'light' | 'dark' | 'auto';

/**
 * Main component properties
 */
export interface SearchSnippetProps {
  /** Required: AI Search API endpoint */
  apiUrl: string;
  /** Input placeholder text */
  placeholder?: string;
  /** Maximum search results to display (search-bar only) */
  maxResults?: number;
  /** Input debounce delay in milliseconds (search-bar only) */
  debounceMs?: number;
  /** Color scheme */
  theme?: Theme;
  /** Hide the "Powered by Cloudflare AI Search" branding */
  hideBranding?: boolean;
}

/**
 * Search result item structure
 */
export interface SearchResult {
  id: string;
  title: string;
  description: string;
  url?: string;
  metadata?: Record<string, unknown>;
  type: 'result';
}

export interface SearchError {
  type: 'error';
  message: string;
  code?: string;
  status?: number;
  details?: Record<string, unknown>;
}

export type ChatResult = {
  id: string;
  title: string;
  description: string;
  url?: string;
  metadata?: Record<string, unknown>;
  type: 'result';
};

export type ChatTextResponse = {
  type: 'text';
  message: string;
};

export type ChatError = {
  type: 'error';
  message: string;
};

export type ChatTypes = ChatResult | ChatTextResponse | ChatError;

/**
 * Search options
 */
export interface SearchOptions {
  query?: string;
  streaming?: boolean;
  signal?: AbortSignal;
}

/**
 * Chat options
 */
export interface ChatOptions {
  stream?: boolean;
  signal?: AbortSignal;
}

/**
 * API error structure
 */
export interface ApiError {
  message: string;
  code?: string;
  status?: number;
  details?: Record<string, unknown>;
}

/**
 * Component lifecycle events
 */
export interface ComponentEvents {
  search: CustomEvent<{ query: string; results: SearchResult[] }>;
  error: CustomEvent<{ error: ApiError }>;
  ready: CustomEvent<void>;
}

/**
 * Request state
 */
export interface RequestState {
  id: string;
  controller: AbortController;
  timestamp: number;
}
