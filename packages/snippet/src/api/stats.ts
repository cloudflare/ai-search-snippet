/**
 * Stats Client
 *
 * Sends search analytics events to the `/stats` endpoint as fire-and-forget
 * POST requests. Events are buffered and flushed in batches to reduce request
 * count, and any remaining events are flushed via `navigator.sendBeacon` (or a
 * keepalive `fetch` fallback) when the page is unloaded.
 */

import { SNIPPET_VERSION } from '../constants.ts';

/**
 * Shared fields across every analytics event.
 */
interface BaseStatsEvent {
  inputQuery: string;
  snippetVersion: string;
  totalResult: number;
}

/**
 * Fired after a search completes successfully (or returns zero results).
 * Click-related fields are intentionally omitted.
 */
export type SearchStatsEvent = BaseStatsEvent;

/**
 * Fired when a user clicks a specific result in the list.
 */
export interface ClickStatsEvent extends BaseStatsEvent {
  clickedResultId: string;
  clickPosition: number;
  clickViewMore: false;
}

/**
 * Fired when a user clicks the "See more" affordance beneath the results.
 */
export interface ViewMoreStatsEvent extends BaseStatsEvent {
  clickViewMore: true;
}

export type StatsEvent = SearchStatsEvent | ClickStatsEvent | ViewMoreStatsEvent;

export interface StatsClientOptions {
  /** Overrides the library version placed on each event. Defaults to the built-in `SNIPPET_VERSION`. */
  snippetVersion?: string;
  /** Milliseconds to wait before auto-flushing a non-empty buffer. Defaults to 1500ms. */
  flushIntervalMs?: number;
  /** Buffer size that triggers an immediate flush. Defaults to 20. */
  maxBufferSize?: number;
  /** Path appended to `baseUrl`. Defaults to `/stats`. */
  endpoint?: string;
}

const DEFAULT_FLUSH_INTERVAL_MS = 20000; // 20 seconds
const DEFAULT_MAX_BUFFER_SIZE = 20;
const DEFAULT_ENDPOINT = '/stats';

/**
 * Shape of the POST body sent to `/stats`.
 */
interface StatsRequestBody {
  events: StatsEvent[];
}

function isBrowserEnv(): boolean {
  return typeof document !== 'undefined' && typeof window !== 'undefined';
}

export class StatsClient {
  private readonly baseUrl: string;
  private readonly endpoint: string;
  private readonly snippetVersion: string;
  private readonly flushIntervalMs: number;
  private readonly maxBufferSize: number;

  private buffer: StatsEvent[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  private readonly boundUnloadHandler: () => void;
  private readonly boundVisibilityHandler: () => void;

  constructor(baseUrl: string, options: StatsClientOptions = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
    this.snippetVersion = options.snippetVersion ?? SNIPPET_VERSION;
    this.flushIntervalMs = options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
    this.maxBufferSize = Math.max(1, options.maxBufferSize ?? DEFAULT_MAX_BUFFER_SIZE);

    this.boundUnloadHandler = () => this.flushBeacon();
    this.boundVisibilityHandler = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        this.flushBeacon();
      }
    };

    if (isBrowserEnv()) {
      // `pagehide` fires reliably on mobile Safari for bfcache navigations;
      // `visibilitychange` covers tab switches / background.
      window.addEventListener('pagehide', this.boundUnloadHandler);
      document.addEventListener('visibilitychange', this.boundVisibilityHandler);
    }
  }

  /**
   * Record a completed search (no click).
   */
  trackSearch(inputQuery: string, totalResult: number): void {
    this.track({
      inputQuery,
      snippetVersion: this.snippetVersion,
      totalResult,
    });
  }

  /**
   * Record a click on a specific result.
   */
  trackClick(
    inputQuery: string,
    totalResult: number,
    clickedResultId: string,
    clickPosition: number
  ): void {
    this.track({
      inputQuery,
      snippetVersion: this.snippetVersion,
      totalResult,
      clickedResultId,
      clickPosition,
      clickViewMore: false,
    });
  }

  /**
   * Record a click on the "See more" link.
   */
  trackViewMore(inputQuery: string, totalResult: number): void {
    this.track({
      inputQuery,
      snippetVersion: this.snippetVersion,
      totalResult,
      clickViewMore: true,
    });
  }

  /**
   * Buffer a pre-built event. Higher-level `track*` helpers call this.
   */
  track(event: StatsEvent): void {
    if (this.destroyed) {
      return;
    }

    this.buffer.push(event);

    if (this.buffer.length >= this.maxBufferSize) {
      this.flush();
      return;
    }

    this.scheduleFlush();
  }

  /**
   * Force an immediate flush using `fetch` with `keepalive: true`.
   * Returns synchronously; network errors are swallowed.
   */
  flush(): void {
    const events = this.drainBuffer();
    if (events.length === 0) {
      return;
    }
    const body = JSON.stringify({ events } satisfies StatsRequestBody);

    // Fire-and-forget. Swallow errors so analytics failures never surface.
    fetch(this.buildUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch((e) => {
      console.log(e);
      /* intentionally ignored - analytics is best-effort */
    });
  }

  /**
   * Flush path optimized for page-unload. Prefers `navigator.sendBeacon`
   * when available; falls back to `fetch({ keepalive: true })`.
   */
  private flushBeacon(): void {
    const events = this.drainBuffer();
    if (events.length === 0) {
      return;
    }

    const body = JSON.stringify({ events } satisfies StatsRequestBody);
    const url = this.buildUrl();

    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      try {
        const blob = new Blob([body], { type: 'application/json' });
        const queued = navigator.sendBeacon(url, blob);
        if (queued) {
          return;
        }
      } catch {
        /* fall through to fetch keepalive */
      }
    }

    if (typeof fetch !== 'undefined') {
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {
        /* intentionally ignored */
      });
    }
  }

  /**
   * Remove unload listeners, clear timers, and flush anything still buffered.
   * Call from the host component's `disconnectedCallback`.
   */
  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;

    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (isBrowserEnv()) {
      window.removeEventListener('pagehide', this.boundUnloadHandler);
      document.removeEventListener('visibilitychange', this.boundVisibilityHandler);
    }

    // Best-effort final send. Prefer beacon so it survives navigation.
    this.flushBeacon();
  }

  private scheduleFlush(): void {
    if (this.flushTimer !== null || this.destroyed) {
      return;
    }

    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, this.flushIntervalMs);
  }

  private drainBuffer(): StatsEvent[] {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.buffer.length === 0) {
      return [];
    }

    const events = this.buffer;
    this.buffer = [];
    return events;
  }

  private buildUrl(): string {
    const path = this.endpoint.startsWith('/') ? this.endpoint : `/${this.endpoint}`;
    return `${this.baseUrl}${path}`;
  }
}
