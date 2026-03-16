/**
 * NLWeb API Client
 * Handles all API communication with retry logic, streaming support, and request cancellation
 */

import type {
  AISearchAPIResponse,
  ChatTextResponse,
  ChatTypes,
  SearchError,
  SearchOptions,
  SearchResult,
} from '../types/index.ts';
import { decodeHTMLEntities } from '../utils/index.ts';
import { Client } from './index.ts';

export class AISearchClient extends Client {
  private request(
    options: SearchOptions = {},
    operation: 'ai-search' | 'search' | 'chat/completions',
    signal?: AbortSignal
  ): Promise<Response> {
    const sourceHeader = operation === 'search' ? 'snippet-search' : 'snippet-chat-completions';
    return fetch(`${this.baseUrl}/${operation}`, {
      method: 'POST',
      body: JSON.stringify({
        messages: [{ role: 'user', content: options.query }],
        stream: options.streaming,
        max_results: options.maxResults,
        ...(operation === 'search' && {
          ai_search_options: { retrieval: { metadata_only: true } },
        }),
      }),
      headers: {
        'Content-Type': 'application/json',
        'cf-ai-search-source': sourceHeader,
      },
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
          maxResults: 30,
        } satisfies SearchOptions,
        'search',
        signal
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      if (!response.body) {
        throw new Error('Response body is empty');
      }
      const result: AISearchAPIResponse = await response.json();
      if (result.success && result.result) {
        return result.result.chunks.slice(0, 10).map(
          (chunk) =>
            ({
              type: 'result',
              id: chunk.id,
              title: decodeHTMLEntities(chunk.item.metadata.title),
              description: chunk.item.metadata.description
                ? decodeHTMLEntities(chunk.item.metadata.description)
                : '',
              url: chunk.item.key,
              image: chunk.item.metadata.image || undefined,
              metadata: chunk.item.metadata as unknown as Record<string, unknown>,
            }) satisfies SearchResult
        );
      }

      if (result.success === false) {
        // @ts-expect-error need to check this
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
      } satisfies SearchOptions,
      'ai-search',
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

    const result: string = chunks
      .replaceAll('data: ', '')
      .trim()
      .split('\n\n')
      .map((chunk) => {
        return JSON.parse(chunk) as { response: string };
      })
      .map((chunk) => chunk.response)
      .join('');

    yield {
      type: 'result',
      id: '',
      title: '',
      description: result,
      url: '',
      metadata: {},
    };
  }

  async *chat(query: string, options?: SearchOptions): AsyncGenerator<ChatTypes, void, undefined> {
    const controller = new AbortController();
    const signal = options?.signal || controller.signal;
    // const prevQueries: string[] = JSON.parse(localStorage.getItem('prevQueries') || '[]');
    // prevQueries.push(query);
    // localStorage.setItem('prevQueries', JSON.stringify(prevQueries));
    const response = await this.request(
      {
        query,
        streaming: false,
      } satisfies SearchOptions,
      'chat/completions',
      signal
    );
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    if (!response.body) {
      throw new Error('Response body is empty');
    }
    const result = (await response.json()) as {
      choices: {
        message: {
          content: string;
        };
      }[];
    };

    yield {
      type: 'text',
      message: result.choices.map((choice) => choice.message.content).join(''),
    } satisfies ChatTextResponse;

    // for (const item of result.data) {
    //   yield {
    //     type: 'result',
    //     id: item.filename,
    //     title: item.filename,
    //     description: item.content.text,
    //     url: item.filename,
    //     metadata: item.attributes
    //     ,
    //   } satisfies ChatResult;
    // }

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
