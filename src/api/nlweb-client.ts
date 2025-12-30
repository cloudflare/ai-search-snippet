/**
 * NLWeb API Client
 * Handles all API communication with retry logic, streaming support, and request cancellation
 */

import type {
  ChatError,
  ChatResult,
  ChatTextResponse,
  ChatTypes,
  NLWebNonStreamingResponse,
  NLWebResponses,
  SearchError,
  SearchOptions,
  SearchResult,
} from '../types/index.ts';
import { Client } from './index.ts';

export class NLWebClient extends Client {
  private request(options: SearchOptions = {}, signal?: AbortSignal): Promise<Response> {
    const searchParams = new URLSearchParams({
      query: options.query || '',
      streaming: options.streaming ? 'true' : 'false',
      generate_mode: options.generate_mode || 'list',
    });
    return fetch(`${this.baseUrl}/ask?${searchParams.toString()}`, {
      method: 'POST',
      body: JSON.stringify(options),
      signal,
    });
  }

  /**
   * Performs a search query with optional streaming
   */
  async search(query: string, options: Omit<SearchOptions, 'query'> = {}): Promise<SearchResult[]> {
    const requestId = this.generateRequestId();
    const controller = new AbortController();
    const signal = options.signal || controller.signal;

    this.registerRequest(requestId, controller);

    try {
      const response = await this.request(
        {
          query,
          streaming: false,
          generate_mode: options.generate_mode,
          site: options.site,
          prev: options.prev,
          last_ans: options.last_ans,
          item_to_remember: options.item_to_remember,
          model: options.model,
          oauth_id: options.oauth_id,
          thread_id: options.thread_id,
          display_mode: options.display_mode,
        } satisfies SearchOptions,
        signal
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      if (!response.body) {
        throw new Error('Response body is empty');
      }
      const result: NLWebNonStreamingResponse = await response.json();
      if (result.results) {
        return result.results.map((item) => ({
          type: 'result',
          id: item.url,
          title: item.name,
          description: item.description || '',
          url: item.url,
          metadata: item.schema_object as unknown as Record<string, unknown>,
        }));
      }
      if (result.error) {
        throw new Error(result.error);
      }
      throw new Error('Unknown error');
    } finally {
      this.unregisterRequest(requestId);
    }
  }

  async *searchStream(
    query: string,
    options?: SearchOptions
  ): AsyncGenerator<SearchResult | SearchError, void, undefined> {
    const requestId = this.generateRequestId();
    const controller = new AbortController();
    const signal = options?.signal || controller.signal;

    this.registerRequest(requestId, controller);

    const response = await this.request(
      {
        query,
        streaming: true,
        generate_mode: options?.generate_mode,
        site: options?.site,
        prev: options?.prev,
        last_ans: options?.last_ans,
        item_to_remember: options?.item_to_remember,
        model: options?.model,
        oauth_id: options?.oauth_id,
        thread_id: options?.thread_id,
        display_mode: options?.display_mode,
      } satisfies SearchOptions,
      signal
    );
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    if (!response.body) {
      throw new Error('Response body is empty');
    }

    let chunks = '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      const chunk = decoder.decode(value, { stream: true });
      chunks += chunk;
    }

    const nlWebChunks: NLWebResponses[] = chunks
      .replaceAll('data: ', '')
      .trim()
      .split('\n\n')
      .map((chunk) => {
        return JSON.parse(chunk);
      });

    for (const parsedChunk of nlWebChunks) {
      if (parsedChunk?.message_type === 'result_batch') {
        for (const result of parsedChunk.results) {
          yield {
            id: result.url,
            title: result.name,
            description: result.description || '',
            url: result.url,
            type: 'result',
          } satisfies SearchResult;
        }
      }

      if (parsedChunk?.message_type === 'error') {
        yield {
          type: 'error',
          message: parsedChunk.message,
        } as SearchError;
      }
    }

    return;
  }

  async *chat(query: string, options?: SearchOptions): AsyncGenerator<ChatTypes, void, undefined> {
    const controller = new AbortController();
    const signal = options?.signal || controller.signal;
    const prevQueries: string[] = JSON.parse(localStorage.getItem('prevQueries') || '[]');
    prevQueries.push(query);
    localStorage.setItem('prevQueries', JSON.stringify(prevQueries));
    const response = await this.request(
      {
        query,
        streaming: true,
        generate_mode: 'summarize',
        site: options?.site,
        prev: prevQueries,
        last_ans: options?.last_ans,
        item_to_remember: options?.item_to_remember,
        model: options?.model,
        oauth_id: options?.oauth_id,
        thread_id: options?.thread_id,
        display_mode: options?.display_mode,
      } satisfies SearchOptions,
      signal
    );
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    if (!response.body) {
      throw new Error('Response body is empty');
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let chunks = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      const chunk = decoder.decode(value, { stream: true });
      chunks += chunk;
    }
    const nlWebChunks: NLWebResponses[] = chunks
      .replaceAll('data: ', '')
      .trim()
      .split('\n\n')
      .map((chunk) => {
        return JSON.parse(chunk);
      });
    for (const parsedChunk of nlWebChunks) {
      if (parsedChunk?.message_type === 'result_batch') {
        for (const result of parsedChunk.results) {
          yield {
            id: result.url,
            title: result.name,
            description: result.description || '',
            url: result.url,
            type: 'result',
          } satisfies ChatResult;
        }
      }

      if (parsedChunk?.message_type === 'summary') {
        yield {
          type: 'text',
          message: parsedChunk.message,
        } satisfies ChatTextResponse;
      }

      if (parsedChunk?.message_type === 'error') {
        yield {
          type: 'error',
          message: parsedChunk.message,
        } as ChatError;
      }
    }

    return;
  }

  /**
   * Cancels an active request by ID
   */
  cancelRequest(requestId: string): void {
    const request = this.activeRequests.get(requestId);
    if (request) {
      request.controller.abort();
      this.unregisterRequest(requestId);
    }
  }

  /**
   * Cancels all active requests
   */
  cancelAllRequests(): void {
    for (const [requestId] of this.activeRequests) {
      this.cancelRequest(requestId);
    }
  }

  /**
   * Register an active request
   */
  private registerRequest(id: string, controller: AbortController): void {
    this.activeRequests.set(id, {
      id,
      controller,
      timestamp: Date.now(),
    });
  }

  /**
   * Unregister a completed request
   */
  private unregisterRequest(id: string): void {
    this.activeRequests.delete(id);
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
