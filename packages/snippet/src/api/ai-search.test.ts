import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ChatTypes } from '../types/index.ts';
import { AISearchClient } from './ai-search.ts';

class MockDOMParser {
  parseFromString(input: string): Document {
    return {
      documentElement: {
        textContent: input,
      },
    } as Document;
  }
}

function createSearchResponse(): Response {
  return new Response(
    JSON.stringify({
      success: true,
      result: {
        search_query: 'cloudflare',
        chunks: [
          {
            id: 'doc-1',
            type: 'chunk',
            text: 'Cloudflare docs',
            item: {
              key: 'https://example.com/docs',
              timestamp: 1710000000,
              metadata: {
                title: 'Cloudflare Docs',
                description: 'Everything about Cloudflare.',
              },
            },
            scoring_details: {
              vector_score: 0.9,
            },
          },
        ],
      },
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );
}

function createSearchStreamResponse(): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('data: {"response":"Hello"}\n\n'));
      controller.enqueue(new TextEncoder().encode('data: {"response":" world"}\n\n'));
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
    },
  });
}

function createDeltaFrame(content: string): string {
  return `data: ${JSON.stringify({
    id: 'id-1',
    object: 'chat.completion.chunk',
    choices: [{ index: 0, delta: { content } }],
  })}\n\n`;
}

function createChatStreamResponse(frames: string[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const frame of frames) {
        controller.enqueue(encoder.encode(frame));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
    },
  });
}

function createChatStreamResponseChunked(payload: string, chunkSize: number): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < payload.length; i += chunkSize) {
        controller.enqueue(encoder.encode(payload.slice(i, i + chunkSize)));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
    },
  });
}

function createChatNonStreamResponse(content: string): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content } }],
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );
}

describe('AISearchClient request enrichment', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('merges search request body, headers, and query params', async () => {
    vi.stubGlobal('DOMParser', MockDOMParser);

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(createSearchResponse());
    const client = new AISearchClient('https://example.com/');

    const results = await client.search('cloudflare', {
      maxResults: 99,
      request: {
        headers: {
          'x-tenant': 'docs',
          'Content-Type': 'text/plain',
        },
        queryParams: {
          locale: 'en',
          preview: true,
          page: 2,
        },
        body: {
          custom: 'value',
          messages: [{ role: 'system', content: 'ignored' }],
          ai_search_options: {
            retrieval: {
              metadata_only: false,
              max_num_results: 99,
              top_k: 5,
            },
            filters: {
              tag: 'docs',
            },
          },
        },
      },
    });

    expect(results).toHaveLength(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;

    expect(url).toBe('https://example.com/search?locale=en&preview=true&page=2');
    expect(init.headers).toMatchObject({
      'x-tenant': 'docs',
      'Content-Type': 'application/json',
      'cf-ai-search-source': 'snippet-search',
    });
    expect(body).toEqual({
      messages: [{ role: 'user', content: 'cloudflare' }],
      stream: false,
      custom: 'value',
      ai_search_options: {
        retrieval: {
          metadata_only: true,
          max_num_results: 99,
          top_k: 5,
        },
        filters: {
          tag: 'docs',
        },
      },
    });
  });

  it('applies request enrichment to searchStream requests', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(createSearchStreamResponse());
    const client = new AISearchClient('https://example.com/');

    const streamResults: unknown[] = [];

    for await (const result of client.searchStream('streaming query', {
      maxResults: 3,
      request: {
        headers: {
          'x-debug': '1',
        },
        queryParams: {
          locale: 'fr',
        },
        body: {
          custom: 'stream',
        },
      },
    })) {
      streamResults.push(result);
    }

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;

    expect(url).toBe('https://example.com/ai-search?locale=fr');
    expect(init.headers).toMatchObject({
      'x-debug': '1',
      'Content-Type': 'application/json',
      'cf-ai-search-source': 'snippet-chat-completions',
    });
    expect(body).toEqual({
      messages: [{ role: 'user', content: 'streaming query' }],
      stream: true,
      max_num_results: 3,
      custom: 'stream',
    });
    expect(streamResults).toEqual([
      {
        type: 'result',
        id: '',
        title: '',
        description: 'Hello world',
        url: '',
        metadata: {},
      },
    ]);
  });

  it('preserves relative api-url values when adding query params', async () => {
    vi.stubGlobal('DOMParser', MockDOMParser);

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(createSearchResponse());
    const client = new AISearchClient('/api');

    await client.search('relative query', {
      request: {
        queryParams: {
          locale: 'en',
        },
      },
    });

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toBe('/api/search?locale=en');
  });
});

describe('AISearchClient.chat', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('streams content deltas as they arrive', async () => {
    const chunksFrame =
      'event: chunks\n' +
      `data: ${JSON.stringify([
        {
          id: 'src-1',
          item: {
            key: 'https://example.com/a',
            metadata: { title: 'A', description: 'a' },
          },
        },
      ])}\n\n`;

    const finishFrame = `data: ${JSON.stringify({
      id: 'id-1',
      object: 'chat.completion.chunk',
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    })}\n\n`;

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        createChatStreamResponse([
          chunksFrame,
          createDeltaFrame('Hello'),
          createDeltaFrame(', '),
          createDeltaFrame('world!'),
          finishFrame,
          'data: [DONE]\n\n',
        ])
      );

    const client = new AISearchClient('https://example.com');
    const yields: ChatTypes[] = [];
    for await (const chunk of client.chat('hi')) {
      yields.push(chunk);
    }

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(url).toBe('https://example.com/chat/completions');
    expect(body).toEqual({
      messages: [{ role: 'user', content: 'hi' }],
      stream: true,
    });
    expect(init.headers).toMatchObject({
      Accept: 'text/event-stream',
      'cf-ai-search-source': 'snippet-chat-completions',
    });

    expect(yields).toEqual([
      { type: 'text', message: 'Hello' },
      { type: 'text', message: ', ' },
      { type: 'text', message: 'world!' },
    ]);
  });

  it('reassembles deltas across arbitrary network chunk boundaries', async () => {
    const payload = [
      'event: chunks\n',
      `data: ${JSON.stringify([{ id: 'x' }])}\n\n`,
      createDeltaFrame('Ol'),
      createDeltaFrame('á'),
      createDeltaFrame(' world'),
      'data: [DONE]\n\n',
    ].join('');

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(createChatStreamResponseChunked(payload, 7));

    const client = new AISearchClient('https://example.com');
    const collected: string[] = [];
    for await (const chunk of client.chat('hi')) {
      if (chunk.type === 'text') {
        collected.push(chunk.message);
      }
    }

    expect(collected.join('')).toBe('Olá world');
    expect(collected).toEqual(['Ol', 'á', ' world']);
  });

  it('returns single concatenated yield when stream: false', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(createChatNonStreamResponse('full answer'));

    const client = new AISearchClient('https://example.com');
    const yields: ChatTypes[] = [];
    for await (const chunk of client.chat('hi', { stream: false })) {
      yields.push(chunk);
    }

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toEqual({
      messages: [{ role: 'user', content: 'hi' }],
      stream: false,
    });
    expect(init.headers).toMatchObject({
      Accept: 'application/json',
    });

    expect(yields).toEqual([{ type: 'text', message: 'full answer' }]);
  });

  it('skips malformed SSE frames without aborting the stream', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createChatStreamResponse([
        createDeltaFrame('hi'),
        'data: not-json\n\n',
        createDeltaFrame(' there'),
        'data: [DONE]\n\n',
      ])
    );

    const client = new AISearchClient('https://example.com');
    const yields: ChatTypes[] = [];
    for await (const chunk of client.chat('hi')) {
      yields.push(chunk);
    }

    expect(yields).toEqual([
      { type: 'text', message: 'hi' },
      { type: 'text', message: ' there' },
    ]);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('omits ai_search_options on a first-turn chat request', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(createChatNonStreamResponse('ok'));

    const client = new AISearchClient('https://example.com');
    for await (const _ of client.chat('hi', { stream: false })) {
      // drain
    }

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;

    expect(body).toEqual({
      messages: [{ role: 'user', content: 'hi' }],
      stream: false,
    });
    expect(body).not.toHaveProperty('ai_search_options');
  });

  it('forwards history and enables query_rewrite with defaults on subsequent turns', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(createChatNonStreamResponse('ok'));

    const client = new AISearchClient('https://example.com');
    for await (const _ of client.chat('and the second one?', {
      stream: false,
      history: [
        { role: 'user', content: 'list cloudflare products' },
        { role: 'assistant', content: 'Workers, R2, D1, ...' },
      ],
      queryRewrite: true,
    })) {
      // drain
    }

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;

    expect(body.messages).toEqual([
      { role: 'user', content: 'list cloudflare products' },
      { role: 'assistant', content: 'Workers, R2, D1, ...' },
      { role: 'user', content: 'and the second one?' },
    ]);

    const aiSearchOptions = body.ai_search_options as
      | { query_rewrite?: { enabled: boolean; model: string; rewrite_prompt: string } }
      | undefined;
    expect(aiSearchOptions?.query_rewrite?.enabled).toBe(true);
    expect(aiSearchOptions?.query_rewrite?.model).toBe('@cf/meta/llama-3.3-70b-instruct-fp8-fast');
    expect(aiSearchOptions?.query_rewrite?.rewrite_prompt).toContain(
      'You rewrite a multi-turn chat'
    );
  });

  it('honors per-call query_rewrite model and rewritePrompt overrides', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(createChatNonStreamResponse('ok'));

    const client = new AISearchClient('https://example.com');
    for await (const _ of client.chat('follow up', {
      stream: false,
      history: [{ role: 'user', content: 'hi' }],
      queryRewrite: {
        model: 'openai/gpt-5-mini',
        rewritePrompt: 'custom rewrite instructions',
      },
    })) {
      // drain
    }

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.ai_search_options).toEqual({
      query_rewrite: {
        enabled: true,
        model: 'openai/gpt-5-mini',
        rewrite_prompt: 'custom rewrite instructions',
      },
    });
  });

  it('terminates silently when the request is aborted mid-stream', async () => {
    const controller = new AbortController();
    const stream = new ReadableStream<Uint8Array>({
      start(streamController) {
        const encoder = new TextEncoder();
        streamController.enqueue(encoder.encode(createDeltaFrame('partial')));
      },
      pull() {
        return new Promise<void>((_, reject) => {
          controller.signal.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        });
      },
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })
    );

    const client = new AISearchClient('https://example.com');
    const yields: ChatTypes[] = [];
    const iterator = client.chat('hi', { signal: controller.signal });

    const first = await iterator.next();
    if (!first.done) {
      yields.push(first.value);
    }

    controller.abort();

    for await (const chunk of iterator) {
      yields.push(chunk);
    }

    expect(yields).toEqual([{ type: 'text', message: 'partial' }]);
  });
});
