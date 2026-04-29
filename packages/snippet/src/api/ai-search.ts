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

const DEFAULT_QUERY_REWRITE_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

const DEFAULT_QUERY_REWRITE_PROMPT = `You rewrite a multi-turn chat into a single standalone search query for a retrieval system.

Inputs: the full conversation in \`messages\`. The final user message is the one to answer; earlier messages are context only.

Rules:
- Output ONLY the rewritten query as plain text. No preamble, no quotes, no markdown, no explanation.
- Resolve pronouns and references (it, that, they, the second one, the previous one, etc.) using prior turns.
- Inline any entities, names, versions, products, or constraints from earlier turns that the final message depends on.
- Preserve the user's original language and terminology. Do not translate.
- Do not invent facts, sources, dates, or details not present in the conversation.
- If the final user message is already fully self-contained, return it unchanged (modulo trivial cleanup).
- Drop greetings, thanks, and meta questions about the assistant itself; keep only the information need.
- Keep it concise — a search query, not a sentence. Aim for under 200 characters when possible.

Return only the rewritten query.`;

interface ParsedSSEEvent {
  event: string;
  data: string;
}

/**
 * Parse a single SSE event block (text between blank lines) into its event
 * name and concatenated data payload. Returns null when the block carries no
 * data field. Implements the subset of the SSE spec we need: comment lines,
 * `event:` and `data:` fields, optional single leading space stripping, and
 * multi-line data joined with newlines.
 */
function parseSSEEvent(block: string): ParsedSSEEvent | null {
  let event = 'message';
  const dataLines: string[] = [];

  for (const rawLine of block.split('\n')) {
    // Tolerate CRLF line endings.
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;

    if (line === '' || line.startsWith(':')) {
      continue;
    }

    const colonIndex = line.indexOf(':');
    const field = colonIndex === -1 ? line : line.slice(0, colonIndex);
    let value = colonIndex === -1 ? '' : line.slice(colonIndex + 1);
    if (value.startsWith(' ')) {
      value = value.slice(1);
    }

    if (field === 'event') {
      event = value;
    } else if (field === 'data') {
      dataLines.push(value);
    }
  }

  if (dataLines.length === 0) {
    return null;
  }

  return { event, data: dataLines.join('\n') };
}

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
        Accept: body.stream ? 'text/event-stream' : 'application/json',
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
    const stream = options?.stream ?? true;

    const messages = [...(options?.history ?? []), { role: 'user' as const, content: query }];

    const body: Record<string, unknown> = { messages, stream };

    if (options?.queryRewrite) {
      const overrides = typeof options.queryRewrite === 'object' ? options.queryRewrite : {};
      body.ai_search_options = {
        query_rewrite: {
          enabled: true,
          model: overrides.model ?? DEFAULT_QUERY_REWRITE_MODEL,
          rewrite_prompt: overrides.rewritePrompt ?? DEFAULT_QUERY_REWRITE_PROMPT,
        },
      };
    }

    const response = await this.request(body, 'chat/completions', signal);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    if (!response.body) {
      throw new Error('Response body is empty');
    }

    if (!stream) {
      const result = (await response.json()) as {
        choices: { message: { content: string } }[];
      };

      yield {
        type: 'text',
        message: result.choices.map((choice) => choice.message.content).join(''),
      } satisfies ChatTextResponse;

      return;
    }

    yield* this.parseChatStream(response.body);
  }

  /**
   * Consume an SSE stream from the chat/completions endpoint and yield one
   * ChatTextResponse per non-empty content delta. Discards `event: chunks`
   * (RAG sources) and the `[DONE]` sentinel; tolerates malformed individual
   * frames without aborting the whole stream.
   */
  private async *parseChatStream(
    body: ReadableStream<Uint8Array>
  ): AsyncGenerator<ChatTypes, void, undefined> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const consumeEvent = (block: string): ChatTextResponse | 'done' | null => {
      const parsed = parseSSEEvent(block);
      if (!parsed) {
        return null;
      }

      if (parsed.event === 'chunks') {
        // RAG source documents - discard for now.
        return null;
      }

      if (parsed.data === '[DONE]') {
        return 'done';
      }

      try {
        const chunk = JSON.parse(parsed.data) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const content = chunk.choices?.[0]?.delta?.content;
        if (typeof content === 'string' && content.length > 0) {
          return { type: 'text', message: content } satisfies ChatTextResponse;
        }
      } catch (error) {
        console.error('AISearchClient: failed to parse SSE chat chunk', error);
      }

      return null;
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });

        let boundaryIndex = buffer.indexOf('\n\n');
        while (boundaryIndex !== -1) {
          const block = buffer.slice(0, boundaryIndex);
          buffer = buffer.slice(boundaryIndex + 2);
          const result = consumeEvent(block);
          if (result === 'done') {
            return;
          }
          if (result) {
            yield result;
          }
          boundaryIndex = buffer.indexOf('\n\n');
        }
      }

      // Flush any trailing event that wasn't terminated by a blank line.
      buffer += decoder.decode();
      if (buffer.trim().length > 0) {
        const result = consumeEvent(buffer);
        if (result && result !== 'done') {
          yield result;
        }
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return;
      }
      throw error;
    } finally {
      reader.releaseLock();
    }
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
