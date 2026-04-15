/**
 * Search Snippet Library
 * A production-ready, self-contained search and chat widget
 *
 * @example
 * ```html
 * <script type="module" src="search-snippet.js"></script>
 * <search-snippet api-url="https://api.example.com" mode="chat"></search-snippet>
 * ```
 */

// Export API client for advanced usage
export { AISearchClient } from './api/ai-search.ts';

// Export all snippet components
export { ChatBubbleSnippet } from './components/chat-bubble-snippet.ts';
export { ChatPageSnippet } from './components/chat-page-snippet.ts';
export { SearchBarSnippet } from './components/search-bar-snippet.ts';
export { SearchModalSnippet } from './components/search-modal-snippet.ts';

// Export types for TypeScript users
export type {
  ApiError,
  ChatOptions,
  SearchOptions,
  SearchRequestOptions,
  SearchResult,
  SearchSnippetProps,
  Theme,
} from './types/index.ts';

// Auto-register all components when imported
import './components/chat-bubble-snippet.ts';
import './components/search-bar-snippet.ts';
import './components/chat-page-snippet.ts';
import './components/search-modal-snippet.ts';

// Provide a default export for convenience
import { SearchBarSnippet } from './components/search-bar-snippet.ts';
export default SearchBarSnippet;
