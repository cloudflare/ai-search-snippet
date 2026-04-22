import { afterEach, describe, expect, it, vi } from 'vitest';

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
