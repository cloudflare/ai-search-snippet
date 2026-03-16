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
  /** Show URL in search results (default: false) */
  showUrl?: boolean;
  /** Hide thumbnails in search results (default: false) */
  hideThumbnails?: boolean;
}

/**
 * Search result item structure
 */
export interface SearchResult {
  id: string;
  title: string;
  description: string;
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
 * Search options
 */
export interface SearchOptions {
  query?: string;
  streaming?: boolean;
  signal?: AbortSignal;
  maxResults?: number;
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
