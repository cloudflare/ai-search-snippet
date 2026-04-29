import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StatsClient } from './stats.ts';

/**
 * Minimal `window` / `document` stubs backed by `EventTarget` (available in
 * Node 18+). Avoids pulling in `jsdom` / `happy-dom` just to exercise the
 * unload + visibility-change flows.
 */
function createDomStubs(): {
  windowStub: EventTarget;
  documentStub: EventTarget & { visibilityState: 'visible' | 'hidden' };
} {
  const windowStub = new EventTarget();
  const documentTarget = new EventTarget() as EventTarget & {
    visibilityState: 'visible' | 'hidden';
  };
  documentTarget.visibilityState = 'visible';
  return { windowStub, documentStub: documentTarget };
}

function jsonBodyOf(init: RequestInit | undefined): Record<string, unknown> {
  if (!init?.body) {
    throw new Error('Request was called without a body');
  }
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

describe('StatsClient', () => {
  let windowStub: EventTarget;
  let documentStub: EventTarget & { visibilityState: 'visible' | 'hidden' };

  beforeEach(() => {
    vi.useFakeTimers();
    const stubs = createDomStubs();
    windowStub = stubs.windowStub;
    documentStub = stubs.documentStub;
    vi.stubGlobal('window', windowStub);
    vi.stubGlobal('document', documentStub);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('strips a trailing slash from baseUrl and posts to /stats', () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null));
    const client = new StatsClient('https://example.com/');

    client.trackSearch('hello', 3);
    client.flush();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://example.com/stats');
    expect(init.method).toBe('POST');
    expect(init.keepalive).toBe(true);
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('batches events in a single POST body', () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null));
    const client = new StatsClient('https://example.com');

    client.trackSearch('q1', 10);
    client.trackClick('q1', 10, 'doc-a', 2);
    client.trackViewMore('q1', 10);

    expect(fetchMock).not.toHaveBeenCalled();

    client.flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = jsonBodyOf(init);

    expect(body).toEqual({
      events: [
        { inputQuery: 'q1', snippetVersion: expect.any(String), totalResult: 10 },
        {
          inputQuery: 'q1',
          snippetVersion: expect.any(String),
          totalResult: 10,
          clickedResultId: 'doc-a',
          clickPosition: 2,
          clickViewMore: false,
        },
        {
          inputQuery: 'q1',
          snippetVersion: expect.any(String),
          totalResult: 10,
          clickViewMore: true,
        },
      ],
    });
  });

  it('flushes automatically after flushIntervalMs', () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null));
    const client = new StatsClient('https://example.com', { flushIntervalMs: 500 });

    client.trackSearch('deferred', 1);

    expect(fetchMock).not.toHaveBeenCalled();

    vi.advanceTimersByTime(499);
    expect(fetchMock).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('flushes immediately when buffer reaches maxBufferSize', () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null));
    const client = new StatsClient('https://example.com', {
      maxBufferSize: 2,
      flushIntervalMs: 10_000,
    });

    client.trackSearch('a', 1);
    expect(fetchMock).not.toHaveBeenCalled();

    client.trackSearch('b', 1);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = jsonBodyOf(init);
    expect((body.events as unknown[]).length).toBe(2);
  });

  it('does not POST when the buffer is empty', () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null));
    const client = new StatsClient('https://example.com');

    client.flush();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses navigator.sendBeacon on visibilitychange when the page is hidden', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null));
    const sendBeacon = vi.fn().mockReturnValue(true);
    vi.stubGlobal('navigator', { sendBeacon });

    const client = new StatsClient('https://example.com');
    client.trackSearch('beacon', 2);

    documentStub.visibilityState = 'hidden';
    documentStub.dispatchEvent(new Event('visibilitychange'));

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    const [url, blob] = sendBeacon.mock.calls[0] as [string, Blob];
    expect(url).toBe('https://example.com/stats');
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/json');

    client.destroy();
  });

  it('falls back to fetch keepalive when sendBeacon returns false', () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null));
    const sendBeacon = vi.fn().mockReturnValue(false);
    vi.stubGlobal('navigator', { sendBeacon });

    const client = new StatsClient('https://example.com');
    client.trackSearch('fallback', 1);
    windowStub.dispatchEvent(new Event('pagehide'));

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.keepalive).toBe(true);

    client.destroy();
  });

  it('destroy() flushes remaining events and removes unload listeners', () => {
    const sendBeacon = vi.fn().mockReturnValue(true);
    vi.stubGlobal('navigator', { sendBeacon });

    const addSpy = vi.spyOn(windowStub, 'addEventListener');
    const removeSpy = vi.spyOn(windowStub, 'removeEventListener');

    const client = new StatsClient('https://example.com');
    expect(addSpy).toHaveBeenCalledWith('pagehide', expect.any(Function));

    client.trackSearch('bye', 1);
    client.destroy();

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(removeSpy).toHaveBeenCalledWith('pagehide', expect.any(Function));

    // Post-destroy tracks are no-ops
    sendBeacon.mockClear();
    client.track({
      inputQuery: 'late',
      snippetVersion: 'x',
      totalResult: 0,
    });
    client.flush();
    expect(sendBeacon).not.toHaveBeenCalled();
  });

  it('swallows network errors from fetch', async () => {
    const rejection = new Error('network down');
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(rejection);

    const client = new StatsClient('https://example.com');
    client.trackSearch('q', 1);
    client.flush();

    // Drain microtasks so the rejected fetch settles within .catch()
    await vi.runAllTimersAsync();
    // If the error were unhandled, vitest would fail the test.
    expect(true).toBe(true);
  });

  it('respects custom snippetVersion option', () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null));
    const client = new StatsClient('https://example.com', { snippetVersion: '9.9.9' });
    client.trackSearch('v', 0);
    client.flush();

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = jsonBodyOf(init);
    const events = body.events as Array<{ snippetVersion: string }>;
    expect(events[0].snippetVersion).toBe('9.9.9');
  });

  it('uses a custom endpoint path when provided', () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null));
    const client = new StatsClient('https://example.com', { endpoint: 'analytics' });
    client.trackSearch('v', 0);
    client.flush();

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://example.com/analytics');
  });
});
