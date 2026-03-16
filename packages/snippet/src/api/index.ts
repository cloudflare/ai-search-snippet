/** biome-ignore-all lint/correctness/noUnusedFunctionParameters: this is a placeholder */
import type { ChatTypes, RequestState, SearchError, SearchOptions, SearchResult } from '../types';

export class Client {
  activeRequests: Map<string, RequestState> = new Map();
  baseUrl: string;
  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash;
  }

  search(_query: string, _options?: SearchOptions): Promise<SearchResult[]> {
    throw new Error('Not implemented');
  }

  searchStream(
    _query: string,
    _options?: SearchOptions
  ): AsyncGenerator<SearchResult | SearchError, void, undefined> {
    throw new Error('Not implemented');
  }

  chat(_message: string, _options?: SearchOptions): AsyncGenerator<ChatTypes, void, undefined> {
    throw new Error('Not implemented');
  }

  cancelRequest(_requestId: string): void {
    throw new Error('Not implemented');
  }

  cancelAllRequests(): void {
    throw new Error('Not implemented');
  }
}
