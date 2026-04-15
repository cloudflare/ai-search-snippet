/**
 * NLWeb API Client
 * Handles all API communication with retry logic, streaming support, and request cancellation
 */

import type {
  AISearchAPIResponse,
  ChatOptions,
  ChatTextResponse,
  ChatTypes,
  RequestState,
  SearchError,
  SearchOptions,
  SearchRequestOptions,
  SearchResult,
} from '../types/index.ts';
import { decodeHTMLEntities } from '../utils/index.ts';

type RequestOperation = 'ai-search' | 'search' | 'chat/completions';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepMergeRecords(
  ...records: Array<Record<string, unknown> | undefined>
): Record<string, unknown> {
  const merged: Record<string, unknown> = {};

  for (const record of records) {
    if (!record) {
      continue;
    }

    for (const [key, value] of Object.entries(record)) {
      const currentValue = merged[key];

      if (isRecord(currentValue) && isRecord(value)) {
        merged[key] = deepMergeRecords(currentValue, value);
      } else {
        merged[key] = value;
      }
    }
  }

  return merged;
}

function buildRequestUrl(
  endpoint: string,
  queryParams: SearchRequestOptions['queryParams'] | undefined
): string {
  if (!isRecord(queryParams)) {
    return endpoint;
  }

  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(queryParams)) {
    if (value === undefined || value === null) {
      continue;
    }

    searchParams.append(key, String(value));
  }

  const query = searchParams.toString();

  if (!query) {
    return endpoint;
  }

  const hashIndex = endpoint.indexOf('#');
  const path = hashIndex === -1 ? endpoint : endpoint.slice(0, hashIndex);
  const hash = hashIndex === -1 ? '' : endpoint.slice(hashIndex);
  const separator = path.includes('?') ? '&' : '?';

  return `${path}${separator}${query}${hash}`;
}

function normalizeHeaders(
  headers: SearchRequestOptions['headers'] | undefined
): Record<string, string> {
  if (!isRecord(headers)) {
    return {};
  }

  const normalizedHeaders: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined || value === null) {
      continue;
    }

    normalizedHeaders[key] = String(value);
  }

  return normalizedHeaders;
}

function normalizeBody(
  body: SearchRequestOptions['body'] | undefined
): Record<string, unknown> | undefined {
  return isRecord(body) ? body : undefined;
}

export class AISearchClient {
  activeRequests: Map<string, RequestState> = new Map();
  baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
  }

  private request(
    body: Record<string, unknown>,
    operation: RequestOperation,
    signal?: AbortSignal,
    requestOptions?: SearchRequestOptions
  ): Promise<Response> {
    const sourceHeader = operation === 'search' ? 'snippet-search' : 'snippet-chat-completions';
    const url = buildRequestUrl(`${this.baseUrl}/${operation}`, requestOptions?.queryParams);

    return fetch(url, {
      method: 'POST',
      body: JSON.stringify(deepMergeRecords(normalizeBody(requestOptions?.body), body)),
      headers: {
        ...normalizeHeaders(requestOptions?.headers),
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
          messages: [{ role: 'user', content: query }],
          stream: false,
          ai_search_options: {
            retrieval: {
              metadata_only: true,
              max_num_results: options.maxResults ?? 30,
            },
          },
        },
        'search',
        signal,
        options.request
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      if (!response.body) {
        throw new Error('Response body is empty');
      }
      const result: AISearchAPIResponse = await response.json();
      if (result.success && result.result) {
        return result.result.chunks.map(
          (chunk) =>
            ({
              type: 'result',
              id: chunk.id,
              title: decodeHTMLEntities(chunk.item.metadata?.title),
              description: chunk.item.metadata?.description
                ? decodeHTMLEntities(chunk.item.metadata?.description)
                : '',
              timestamp: chunk.item.timestamp ?? undefined,
              url: chunk.item.key,
              image: chunk.item.metadata?.image || undefined,
              metadata: {
                ...(chunk.item.metadata as unknown as Record<string, unknown>),
                instance_id: chunk.instance_id,
              },
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
    options: Omit<SearchOptions, 'query'> = {}
  ): AsyncGenerator<SearchResult | SearchError, void, undefined> {
    const requestId = this.generateRequestId();
    const controller = new AbortController();
    const signal = options.signal || controller.signal;

    this.registerRequest(requestId, controller);

    const response = await this.request(
      {
        messages: [{ role: 'user', content: query }],
        stream: true,
        ...(options.maxResults !== undefined && {
          max_num_results: options.maxResults,
        }),
      },
      'ai-search',
      signal,
      options.request
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

  async *chat(query: string, options?: ChatOptions): AsyncGenerator<ChatTypes, void, undefined> {
    const controller = new AbortController();
    const signal = options?.signal || controller.signal;
    // const prevQueries: string[] = JSON.parse(localStorage.getItem('prevQueries') || '[]');
    // prevQueries.push(query);
    // localStorage.setItem('prevQueries', JSON.stringify(prevQueries));
    const response = await this.request(
      {
        messages: [{ role: 'user', content: query }],
        stream: false,
      },
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
