/**
 * Core type definitions for the Search Snippet Library
 */

import type { Translations } from '../i18n/index.ts';

export type Theme = 'light' | 'dark' | 'auto';

/**
 * Main component properties
 */
export interface SearchSnippetProps {
  /** Required: AI Search API endpoint */
  apiUrl: string;
  /** Input placeholder text */
  placeholder?: string;
  /** Maximum search results to request from the API */
  maxResults?: number;
  /** Maximum search results to render in the UI (caps the visible list and drives the "see more" affordance) */
  maxRenderResults?: number;
  /** Input debounce delay in milliseconds (search-bar only) */
  debounceMs?: number;
  /** Color scheme */
  theme?: Theme;
  /** Hide the "Powered by Cloudflare AI Search" branding */
  hideBranding?: boolean;
  /** Show URL in search results (default: false) */
  showUrl?: boolean;
  /** Show date in search results when timestamp is present (default: false) */
  showDate?: boolean;
  /** Hide thumbnails in search results (default: false) */
  hideThumbnails?: boolean;
  /** URL template for "See more" link. The search query is appended URL-encoded. Example: "https://example.com/search?q=" */
  seeMore?: string;
  /**
   * Disable sending search / click / view-more analytics events to the
   * `/stats` endpoint. Defaults to `false` (analytics enabled).
   */
  disableAnalytics?: boolean;
  /**
   * Override any user-facing string. Omitted keys fall back to English defaults.
   *
   * @example
   * ```ts
   * element.translations = { placeholder: 'Busca aquí...' };
   * ```
   */
  translations?: Translations;
  /**
   * Customize AI Search query rewriting on subsequent chat turns.
   *
   * Query rewriting is automatically enabled from the second user message
   * onward (the first message has no history to rewrite from). Use this to
   * override the model, the rewrite prompt, or to disable the feature.
   *
   * @example
   * ```ts
   * element.chatQueryRewrite = { enabled: false };
   * element.chatQueryRewrite = { model: 'openai/gpt-5-mini' };
   * element.chatQueryRewrite = { rewritePrompt: 'Rewrite the latest user message...' };
   * ```
   */
  chatQueryRewrite?: {
    /** Override the auto-enable behavior. Defaults to true on subsequent turns. */
    enabled?: boolean;
    /** Override the rewriter model. Defaults to '@cf/meta/llama-3.3-70b-instruct-fp8-fast'. */
    model?: string;
    /** Override the system prompt sent as `rewrite_prompt`. Defaults to a built-in prompt. */
    rewritePrompt?: string;
  };
}

/**
 * Search result item structure
 */
export interface SearchResult {
  id: string;
  title: string;
  description: string;
  timestamp?: number;
  url?: string;
  image?: string;
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
 * Additional request fields for search requests
 */
export interface SearchRequestOptions {
  /** Additional JSON fields to merge into the request body */
  body?: Record<string, unknown>;
  /** Additional headers to send with the request */
  headers?: Record<string, string>;
  /** Additional query parameters to append to the request URL */
  queryParams?: Record<string, boolean | number | string | null | undefined>;
}

/**
 * Search options
 */
export interface SearchOptions {
  query?: string;
  streaming?: boolean;
  signal?: AbortSignal;
  /** Maximum search results to request from the API */
  maxResults?: number;
  /** Additional request fields for search endpoints */
  request?: SearchRequestOptions;
}

/**
 * A single chat message in the conversation history.
 */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * Chat options
 */
export interface ChatOptions {
  stream?: boolean;
  signal?: AbortSignal;
  /** Prior conversation turns to send before the new user query. */
  history?: ChatMessage[];
  /**
   * Enable AI Search query rewriting. Pass `true` to use built-in defaults,
   * an object to override the model and/or rewrite prompt, or omit / pass
   * `false` to disable.
   */
  queryRewrite?: boolean | { model?: string; rewritePrompt?: string };
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

export interface AISearchAPIResponse {
  success: boolean;
  result: Result;
}

export interface Result {
  search_query: string;
  chunks: Chunk[];
}

export interface Chunk {
  id: string;
  type: string;
  text: string;
  item: Item;
  instance_id?: string;
  scoring_details: ScoringDetails;
}

export interface Item {
  key: string;
  timestamp: number;
  metadata: Metadata;
}

export interface Metadata {
  description: string;
  image?: string;
  title: string;
}

export interface ScoringDetails {
  vector_score: number;
}
