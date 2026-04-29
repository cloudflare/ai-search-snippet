/**
 * Search Modal Snippet
 * A modal combobox search component with keyboard navigation
 * Opens with Cmd/Ctrl+K shortcut by default
 */

import type { AISearchClient } from '../api/ai-search.ts';
import { StatsClient } from '../api/stats.ts';
import { POWERED_BY_BRANDING } from '../constants.ts';
import {
  interpolate,
  mergeTranslations,
  parseTranslationsAttribute,
  type Translations,
} from '../i18n/index.ts';
import { modalStyles } from '../styles/modal.ts';
import { baseStyles } from '../styles/theme.ts';
import type { SearchRequestOptions, SearchResult, SearchSnippetProps } from '../types/index.ts';
import {
  createClient,
  createCustomEvent,
  debounce,
  escapeHTML,
  formatDate,
  formatDisplayUrl,
  LOADING_MESSAGE_INTERVAL_MS,
  parseAttribute,
  parseBooleanAttribute,
  parseNumberAttribute,
} from '../utils/index.ts';

const COMPONENT_NAME = 'search-modal-snippet';
const DEFAULT_RENDER_RESULTS = 10;
const DEFAULT_REQUEST_MAX_RESULTS = 50;

export interface SearchModalProps extends SearchSnippetProps {
  /** Keyboard shortcut key (default: 'k') */
  shortcut?: string;
  /** Whether to use meta key (Cmd on Mac) or ctrl key */
  useMetaKey?: boolean;
}

export class SearchModalSnippet extends HTMLElement {
  private shadow: ShadowRoot;
  private client: AISearchClient | null = null;
  private stats: StatsClient | null = null;
  private backdrop: HTMLElement | null = null;
  private modal: HTMLElement | null = null;
  private inputElement: HTMLInputElement | null = null;
  private resultsContainer: HTMLElement | null = null;
  private footerCount: HTMLElement | null = null;
  private isOpen = false;
  private results: SearchResult[] = [];
  private activeIndex = -1;
  private debouncedSearch: (((query: string) => void) & { cancel: () => void }) | null = null;
  private currentSearchController: AbortController | null = null;
  private loadingMessageInterval: ReturnType<typeof setInterval> | null = null;
  private loadingMessageIndex = 0;
  private translationsOverride: Translations | null = null;
  private resolvedTranslations = mergeTranslations(null);

  // Analytics context: populated by performSearch so click/view-more events
  // can reuse the query and total from the most recent result set.
  private lastSearchQuery = '';
  private lastSearchTotal = 0;

  // Event handler references for cleanup
  private handleGlobalKeydown: ((e: KeyboardEvent) => void) | null = null;
  private handleInputChange: ((e: Event) => void) | null = null;
  private handleInputKeydown: ((e: KeyboardEvent) => void) | null = null;
  private handleBackdropClick: ((e: MouseEvent) => void) | null = null;
  private handleResultsContainerClick: ((e: Event) => void) | null = null;

  // Scroll lock state
  private savedBodyStyles: {
    overflow: string;
    position: string;
    top: string;
    width: string;
    scrollbarGutter: string;
  } | null = null;
  private savedHtmlOverflow: string | null = null;

  static get observedAttributes() {
    return [
      'api-url',
      'placeholder',
      'max-results',
      'max-render-results',
      'theme',
      'shortcut',
      'use-meta-key',
      'debounce-ms',
      'hide-branding',
      'show-url',
      'show-date',
      'hide-thumbnails',
      'see-more',
      'disable-analytics',
      'request-options',
      'translations',
    ] as const;
  }

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    this.syncTranslationsFromAttribute();
    this.initializeClient();
    this.render();
    this.attachGlobalKeyboardShortcut();
    this.dispatchEvent(createCustomEvent('ready', undefined));
  }

  disconnectedCallback(): void {
    this.cleanup();
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue) return;

    if (name === 'api-url' || name === 'disable-analytics') {
      this.initializeClient();
    } else if (name === 'theme') {
      this.updateTheme(newValue);
    } else if (name === 'translations') {
      this.syncTranslationsFromAttribute();
      if (this.isConnected) {
        this.rerender();
      }
    }
  }

  /**
   * Get the current translations object.
   */
  public get translations(): Translations | null {
    return this.translationsOverride;
  }

  /**
   * Override any user-facing string. Omitted keys fall back to English defaults.
   */
  public set translations(value: Translations | null | undefined) {
    this.translationsOverride = value ?? null;
    this.resolvedTranslations = mergeTranslations(this.translationsOverride);
    if (this.isConnected) {
      this.rerender();
    }
  }

  /**
   * Re-render while preserving open state and the current query. Results are
   * re-fetched so the list reflects the updated translation strings around
   * them (counts, footer hints, etc.). Selection resets to none — the same
   * behavior as the immediate post-search state.
   */
  private rerender(): void {
    const wasOpen = this.isOpen;
    const previousQuery = this.inputElement?.value ?? '';
    // render() replaces the DOM but does not touch isOpen, so flip it to
    // false so open() will re-apply the `.open` class on the new elements.
    // Skip the scroll-lock side effects since they are already in place.
    this.isOpen = false;
    this.render();
    if (wasOpen) {
      this.isOpen = true;
      this.backdrop?.classList.add('open');
      this.modal?.classList.add('open');
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.inputElement?.focus();
        });
      });
    }
    if (previousQuery && this.inputElement) {
      this.inputElement.value = previousQuery;
      if (previousQuery.trim().length > 0) {
        this.performSearch(previousQuery.trim());
      }
    }
  }

  private syncTranslationsFromAttribute(): void {
    if (this.translationsOverride) {
      this.resolvedTranslations = mergeTranslations(this.translationsOverride);
      return;
    }
    const parsed = parseTranslationsAttribute(
      this.getAttribute('translations'),
      'SearchModalSnippet'
    );
    this.resolvedTranslations = mergeTranslations(parsed);
  }

  private getProps(): SearchModalProps {
    const t = this.resolvedTranslations;
    return {
      apiUrl: parseAttribute(this.getAttribute('api-url'), ''),
      placeholder: parseAttribute(this.getAttribute('placeholder'), t.placeholder),
      maxResults: parseNumberAttribute(
        this.getAttribute('max-results'),
        DEFAULT_REQUEST_MAX_RESULTS
      ),
      maxRenderResults: parseNumberAttribute(
        this.getAttribute('max-render-results'),
        DEFAULT_RENDER_RESULTS
      ),
      debounceMs: parseNumberAttribute(this.getAttribute('debounce-ms'), 300),
      theme: parseAttribute(this.getAttribute('theme'), 'auto') as 'light' | 'dark' | 'auto',
      shortcut: parseAttribute(this.getAttribute('shortcut'), 'k'),
      useMetaKey: this.getAttribute('use-meta-key') !== 'false',
      hideBranding: parseBooleanAttribute(this.getAttribute('hide-branding'), false),
      showUrl: parseBooleanAttribute(this.getAttribute('show-url'), false),
      showDate: parseBooleanAttribute(this.getAttribute('show-date'), false),
      hideThumbnails: parseBooleanAttribute(this.getAttribute('hide-thumbnails'), false),
      seeMore: parseAttribute(this.getAttribute('see-more'), ''),
      disableAnalytics: parseBooleanAttribute(this.getAttribute('disable-analytics'), false),
      translations: this.translationsOverride ?? undefined,
    };
  }

  private getRequestOptions(): SearchRequestOptions | undefined {
    const rawRequestOptions = this.getAttribute('request-options');

    if (!rawRequestOptions) {
      return undefined;
    }

    try {
      const parsedRequestOptions = JSON.parse(rawRequestOptions) as unknown;

      if (
        parsedRequestOptions === null ||
        typeof parsedRequestOptions !== 'object' ||
        Array.isArray(parsedRequestOptions)
      ) {
        throw new Error('request-options must be a JSON object');
      }

      return parsedRequestOptions as SearchRequestOptions;
    } catch (error) {
      console.error('SearchModalSnippet: invalid request-options attribute', error);
      return undefined;
    }
  }

  private initializeClient(): void {
    const props = this.getProps();

    if (!props.apiUrl) {
      console.error('SearchModalSnippet: api-url attribute is required');
      this.client = null;
      this.destroyStatsClient();
      this.showMissingApiUrlError();
      return;
    }

    try {
      this.client = createClient(props.apiUrl);
      this.destroyStatsClient();
      if (!props.disableAnalytics) {
        this.stats = new StatsClient(props.apiUrl);
      }
    } catch (error) {
      console.error('SearchModalSnippet:', error);
    }
  }

  private destroyStatsClient(): void {
    if (this.stats) {
      this.stats.destroy();
      this.stats = null;
    }
  }

  private render(): void {
    const props = this.getProps();
    const t = this.resolvedTranslations;

    // Create debounced search function
    const searchFn = (query: string) => this.performSearch(query);
    this.debouncedSearch = debounce(
      searchFn as (...args: unknown[]) => unknown,
      props.debounceMs || 300
    );

    const style = document.createElement('style');
    style.textContent = `${baseStyles}\n${modalStyles}`;

    const brandingHTML = props.hideBranding
      ? ''
      : `<div class="powered-by-inline">${POWERED_BY_BRANDING}</div>`;

    const container = document.createElement('div');
    container.innerHTML = `
      <div class="modal-backdrop" role="presentation"></div>
      <div class="modal-container" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal-header">
          <svg class="modal-search-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor">
            <path d="M784-120 532-372q-30 24-69 38t-83 14q-109 0-184.5-75.5T120-580q0-109 75.5-184.5T380-840q109 0 184.5 75.5T640-580q0 44-14 83t-38 69l252 252-56 56ZM380-400q75 0 127.5-52.5T560-580q0-75-52.5-127.5T380-760q-75 0-127.5 52.5T200-580q0 75 52.5 127.5T380-400Z"/>
          </svg>
          <input
            type="text"
            class="modal-search-input"
            placeholder="${escapeHTML(props.placeholder || t.placeholder)}"
            aria-label="${escapeHTML(t.searchButtonLabel)}"
            aria-autocomplete="list"
            aria-controls="modal-results-list"
            aria-expanded="false"
            autocomplete="off"
            spellcheck="false"
          />
        </div>
        <div class="modal-content">
          <div class="modal-results" id="modal-results-list" role="listbox" aria-label="${escapeHTML(t.searchResultsAriaLabel)}">
            ${this.renderEmptyState()}
          </div>
        </div>
        <div class="modal-footer">
          <div class="modal-footer-hints">
            <div class="modal-footer-hint">
              <kbd class="modal-kbd">↑</kbd>
              <kbd class="modal-kbd">↓</kbd>
              <span>${escapeHTML(t.navigateHint)}</span>
            </div>
            <div class="modal-footer-hint">
              <kbd class="modal-kbd">↵</kbd>
              <span>${escapeHTML(t.selectHint)}</span>
            </div>
            <div class="modal-footer-hint">
              <kbd class="modal-kbd">Esc</kbd>
              <span>${escapeHTML(t.closeHint)}</span>
            </div>
          </div>
          ${brandingHTML}
        </div>
      </div>
    `;

    this.shadow.innerHTML = '';
    this.shadow.appendChild(style);
    this.shadow.appendChild(container);

    // Get references to elements
    this.backdrop = this.shadow.querySelector('.modal-backdrop');
    this.modal = this.shadow.querySelector('.modal-container');
    this.inputElement = this.shadow.querySelector('.modal-search-input');
    this.resultsContainer = this.shadow.querySelector('.modal-results');
    this.footerCount = this.shadow.querySelector('.modal-results-count');

    this.attachEventListeners();

    // Show error immediately if api-url was missing when the component was connected
    if (!this.client) {
      this.showMissingApiUrlError();
    }
  }

  private attachGlobalKeyboardShortcut(): void {
    const props = this.getProps();
    const shortcutKey = props.shortcut?.toLowerCase() || 'k';

    this.handleGlobalKeydown = (e: KeyboardEvent) => {
      // Check for shortcut to open modal
      const modifierPressed = props.useMetaKey ? e.metaKey || e.ctrlKey : e.ctrlKey;

      if (modifierPressed && e.key.toLowerCase() === shortcutKey && !this.isOpen) {
        e.preventDefault();
        this.open();
      }
    };

    document.addEventListener('keydown', this.handleGlobalKeydown);
  }

  private attachEventListeners(): void {
    if (!this.inputElement || !this.backdrop) return;

    // Input change event
    this.handleInputChange = (e: Event) => {
      const target = e.target as HTMLInputElement;
      const query = target.value.trim();

      if (query.length > 0 && this.debouncedSearch) {
        this.debouncedSearch(query);
      } else {
        this.debouncedSearch?.cancel();
        this.currentSearchController?.abort();
        this.results = [];
        this.activeIndex = -1;
        this.showEmptyState();
      }
    };
    this.inputElement.addEventListener('input', this.handleInputChange);

    // Keyboard navigation
    this.handleInputKeydown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          this.navigateResults(1);
          break;
        case 'ArrowUp':
          e.preventDefault();
          this.navigateResults(-1);
          break;
        case 'Enter':
          e.preventDefault();
          this.selectActiveResult();
          break;
        case 'Escape':
          e.preventDefault();
          this.close();
          break;
      }
    };
    this.inputElement.addEventListener('keydown', this.handleInputKeydown);

    // Backdrop click to close
    this.handleBackdropClick = (e: MouseEvent) => {
      if (e.target === this.backdrop) {
        this.close();
      }
    };
    this.backdrop.addEventListener('click', this.handleBackdropClick);
  }

  private navigateResults(direction: number): void {
    if (this.results.length === 0) return;

    const newIndex = this.activeIndex + direction;

    if (newIndex < 0) {
      this.activeIndex = this.results.length - 1;
    } else if (newIndex >= this.results.length) {
      this.activeIndex = 0;
    } else {
      this.activeIndex = newIndex;
    }

    this.updateActiveResult();
  }

  private updateActiveResult(): void {
    const items = this.resultsContainer?.querySelectorAll('.modal-result-item');
    if (!items) return;

    items.forEach((item, index) => {
      if (index === this.activeIndex) {
        item.classList.add('active');
        item.setAttribute('aria-selected', 'true');
        // Scroll into view if needed
        (item as HTMLElement).scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('active');
        item.setAttribute('aria-selected', 'false');
      }
    });

    // Update aria-activedescendant
    if (this.inputElement && this.activeIndex >= 0) {
      this.inputElement.setAttribute('aria-activedescendant', `result-${this.activeIndex}`);
    } else if (this.inputElement) {
      this.inputElement.removeAttribute('aria-activedescendant');
    }
  }

  private selectActiveResult(): void {
    if (this.activeIndex < 0 || this.activeIndex >= this.results.length) {
      // If no result selected but there's a query, perform immediate search
      const query = this.inputElement?.value.trim();
      if (query && query.length > 0) {
        this.performSearch(query);
      }
      return;
    }

    const result = this.results[this.activeIndex];
    this.dispatchEvent(
      createCustomEvent('result-select', {
        result,
        index: this.activeIndex,
      })
    );

    // Navigate to URL - click the active link element to trigger navigation
    const activeItem = this.resultsContainer?.querySelector(
      `.modal-result-item[data-index="${this.activeIndex}"]`
    ) as HTMLAnchorElement | null;

    if (activeItem && result.url) {
      activeItem.click();
    }

    this.close();
  }

  private async performSearch(query: string): Promise<void> {
    if (!this.client) {
      this.showMissingApiUrlError();
      return;
    }

    // Cancel any existing request before starting a new one
    if (this.currentSearchController) {
      this.currentSearchController.abort();
      this.currentSearchController = null;
    }

    // Create new controller for this request
    this.currentSearchController = new AbortController();
    this.showLoadingState();

    try {
      const props = this.getProps();
      const results = await this.client.search(query, {
        signal: this.currentSearchController.signal,
        maxResults: props.maxResults || DEFAULT_REQUEST_MAX_RESULTS,
        request: this.getRequestOptions(),
      });
      this.results = results.slice(0, props.maxRenderResults || DEFAULT_RENDER_RESULTS);
      this.activeIndex = this.results.length > 0 ? 0 : -1;
      this.lastSearchQuery = query;
      this.lastSearchTotal = results.length;
      this.stats?.trackSearch(query, results.length);
      this.displayResults(this.results, query, results.length);
    } catch (error) {
      // Don't show error state for cancelled requests
      if ((error as Error).name === 'AbortError') {
        return;
      }
      this.showErrorState((error as Error).message);
    } finally {
      this.currentSearchController = null;
    }
  }

  private displayResults(
    results: SearchResult[],
    query: string,
    totalResults = results.length
  ): void {
    this.clearLoadingInterval();
    if (!this.resultsContainer) return;

    if (results.length === 0) {
      this.showNoResultsState(query);
      return;
    }

    const props = this.getProps();
    const t = this.resolvedTranslations;
    const resultsHTML = results.map((result, index) => this.renderResult(result, index)).join('');
    const hasMoreResults = totalResults > results.length;
    const resultsCountLabel = hasMoreResults
      ? interpolate(t.resultsCountOverflow, { n: results.length, total: totalResults })
      : interpolate(totalResults === 1 ? t.modalResultsCount : t.modalResultsCountPlural, {
          n: totalResults,
        });
    const seeMoreHTML =
      props.seeMore && hasMoreResults
        ? `<a href="${escapeHTML(props.seeMore + encodeURIComponent(query))}" class="modal-see-more">
            <span>${escapeHTML(t.seeMoreResults)}</span>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
          </a>`
        : '';

    this.resultsContainer.innerHTML = resultsHTML + seeMoreHTML;

    // Update footer count
    if (this.footerCount) {
      this.footerCount.textContent = resultsCountLabel;
    }

    // Update aria-expanded
    if (this.inputElement) {
      this.inputElement.setAttribute('aria-expanded', 'true');
    }

    // Attach click handlers
    this.attachResultHandlers();

    // Update active state
    this.updateActiveResult();
  }

  private renderResult(result: SearchResult, index: number): string {
    const props = this.getProps();
    const imageHTML = props.hideThumbnails
      ? ''
      : this.renderResultImage(result.image, result.title);
    const href = result.url ? escapeHTML(result.url) : '#';
    const displayUrl = result.url ? escapeHTML(formatDisplayUrl(result.url)) : '';
    const timestampHTML =
      props.showDate && result.timestamp !== undefined
        ? `<div class="modal-result-date">${escapeHTML(formatDate(result.timestamp))}</div>`
        : '';
    const metadataHTML =
      (props.showUrl && result.url) || timestampHTML
        ? `<div class="modal-result-metadata">
            ${props.showUrl && result.url ? `<span class="modal-result-url">${displayUrl}</span>` : '<span class="modal-result-url modal-result-url-empty"></span>'}
            ${timestampHTML}
          </div>`
        : '';

    return `
      <a 
        href="${href}"
        class="modal-result-item${index === this.activeIndex ? ' active' : ''}" 
        role="option" 
        id="result-${index}"
        aria-selected="${index === this.activeIndex}"
        tabindex="-1"
        data-index="${index}"
        data-result-id="${escapeHTML(result.id || '')}"
        data-url="${escapeHTML(result.url || '')}"
      >
        ${imageHTML}
        <div class="modal-result-content">
          <div class="modal-result-title">${escapeHTML(result.title || '')}</div>
          ${result.description ? `<div class="modal-result-description">${escapeHTML(result.description)}</div>` : ''}
          ${metadataHTML}
        </div>
      </a>
    `;
  }

  private renderResultImage(imageUrl: string | undefined, alt: string): string {
    const placeholderSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`;

    if (!imageUrl) {
      return `
        <div class="modal-result-image-container">
          <div class="modal-result-image-placeholder">${placeholderSVG}</div>
        </div>
      `;
    }

    return `
      <div class="modal-result-image-container">
        <div class="modal-result-image-loading"></div>
        <div class="modal-result-image-placeholder" style="display: none;">${placeholderSVG}</div>
        <img 
          class="modal-result-image" 
          src="${escapeHTML(imageUrl)}" 
          alt="${escapeHTML(alt)}"
          loading="lazy"
        />
      </div>
    `;
  }

  private attachResultHandlers(): void {
    this.detachResultsContainerClick();

    const resultsWrapper = this.resultsContainer;
    if (!resultsWrapper) return;

    // Single delegated click listener covers both result items (including
    // keyboard-triggered clicks via `selectActiveResult`) and the see-more link.
    this.handleResultsContainerClick = (e: Event) => {
      const target = e.target as Element | null;
      if (!target) return;

      const item = target.closest('.modal-result-item') as HTMLElement | null;
      if (item) {
        const href = item.getAttribute('href');
        if (href === '#') {
          e.preventDefault();
        }

        const indexAttr = item.getAttribute('data-index');
        const resultId = item.getAttribute('data-result-id') ?? '';
        const index = indexAttr !== null ? Number.parseInt(indexAttr, 10) : Number.NaN;

        if (!Number.isNaN(index) && resultId) {
          this.stats?.trackClick(this.lastSearchQuery, this.lastSearchTotal, resultId, index);
        }
        return;
      }

      const seeMore = target.closest('.modal-see-more');
      if (seeMore) {
        this.stats?.trackViewMore(this.lastSearchQuery, this.lastSearchTotal);
      }
    };
    resultsWrapper.addEventListener('click', this.handleResultsContainerClick);

    const items = resultsWrapper.querySelectorAll('.modal-result-item');
    items.forEach((item, index) => {
      item.addEventListener('mouseenter', () => {
        this.activeIndex = index;
        this.updateActiveResult();
      });
    });

    // Image load/error handlers
    const images = resultsWrapper.querySelectorAll('.modal-result-image');
    images.forEach((img) => {
      img.addEventListener('load', () => {
        img.classList.add('loaded');
        const container = img.closest('.modal-result-image-container');
        container?.querySelector('.modal-result-image-loading')?.remove();
      });

      img.addEventListener('error', () => {
        const container = img.closest('.modal-result-image-container');
        container?.querySelector('.modal-result-image-loading')?.remove();
        const placeholder = container?.querySelector(
          '.modal-result-image-placeholder'
        ) as HTMLElement;
        if (placeholder) placeholder.style.display = 'flex';
        (img as HTMLElement).style.display = 'none';
      });
    });
  }

  private detachResultsContainerClick(): void {
    if (this.resultsContainer && this.handleResultsContainerClick) {
      this.resultsContainer.removeEventListener('click', this.handleResultsContainerClick);
    }
    this.handleResultsContainerClick = null;
  }

  private renderEmptyState(): string {
    const t = this.resolvedTranslations;
    return `
      <div class="modal-empty">
        <svg class="modal-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"></circle>
          <path d="m21 21-4.35-4.35"></path>
        </svg>
        <div class="modal-empty-description">${escapeHTML(t.modalEmptyStateDescription)}</div>
      </div>
    `;
  }

  private showEmptyState(): void {
    this.clearLoadingInterval();
    if (!this.resultsContainer) return;
    this.resultsContainer.innerHTML = this.renderEmptyState();

    if (this.footerCount) {
      this.footerCount.textContent = '';
    }

    if (this.inputElement) {
      this.inputElement.setAttribute('aria-expanded', 'false');
    }
  }

  private showLoadingState(): void {
    if (!this.resultsContainer) return;

    this.clearLoadingInterval();
    const messages = this.resolvedTranslations.loadingMessages;
    const t = this.resolvedTranslations;
    this.loadingMessageIndex = Math.floor(Math.random() * messages.length);

    this.resultsContainer.innerHTML = `
      <div class="modal-loading">
        <div class="loading" aria-label="${escapeHTML(t.loadingAriaLabel)}"></div>
        <div class="loading-text loading-text-animate">${escapeHTML(messages[this.loadingMessageIndex])}</div>
      </div>
    `;

    if (this.footerCount) {
      this.footerCount.textContent = messages[this.loadingMessageIndex];
    }

    this.startLoadingInterval();
  }

  private startLoadingInterval(): void {
    this.loadingMessageInterval = setInterval(() => {
      const messages = this.resolvedTranslations.loadingMessages;
      this.loadingMessageIndex = (this.loadingMessageIndex + 1) % messages.length;
      const textEl = this.resultsContainer?.querySelector('.loading-text');
      if (textEl) {
        textEl.classList.remove('loading-text-animate');
        void (textEl as HTMLElement).offsetWidth;
        textEl.textContent = messages[this.loadingMessageIndex];
        textEl.classList.add('loading-text-animate');
      }
      if (this.footerCount) {
        this.footerCount.textContent = messages[this.loadingMessageIndex];
      }
    }, LOADING_MESSAGE_INTERVAL_MS);
  }

  private clearLoadingInterval(): void {
    if (this.loadingMessageInterval) {
      clearInterval(this.loadingMessageInterval);
      this.loadingMessageInterval = null;
    }
  }

  private showNoResultsState(query: string): void {
    this.clearLoadingInterval();
    if (!this.resultsContainer) return;
    const t = this.resolvedTranslations;

    this.resultsContainer.innerHTML = `
      <div class="modal-empty">
        <svg class="modal-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <div class="modal-empty-title">${escapeHTML(t.modalNoResultsTitle)}</div>
        <div class="modal-empty-description">${escapeHTML(interpolate(t.modalNoResultsDescription, { query }))}</div>
      </div>
    `;

    if (this.footerCount) {
      this.footerCount.textContent = t.modalResultsCountZero;
    }

    if (this.inputElement) {
      this.inputElement.setAttribute('aria-expanded', 'false');
    }
  }

  private showErrorState(message: string): void {
    this.clearLoadingInterval();
    if (!this.resultsContainer) return;
    const t = this.resolvedTranslations;

    this.resultsContainer.innerHTML = `
      <div class="error">
        <strong>${escapeHTML(t.errorPrefix)}</strong> ${escapeHTML(message)}
      </div>
    `;

    if (this.footerCount) {
      this.footerCount.textContent = t.modalResultsCountError;
    }
  }

  private showMissingApiUrlError(): void {
    if (this.resultsContainer) {
      this.showErrorState(this.resolvedTranslations.missingApiUrlError);
    }
  }

  private updateTheme(theme: string | null): void {
    const validTheme = theme === 'light' || theme === 'dark' || theme === 'auto' ? theme : 'auto';

    if (validTheme === 'auto') {
      this.removeAttribute('theme');
    } else {
      this.setAttribute('theme', validTheme);
    }
  }

  private lockBodyScroll(): void {
    // Save current body styles
    const scrollY = window.scrollY;
    this.savedBodyStyles = {
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
      scrollbarGutter: document.body.style.scrollbarGutter,
    };

    this.savedHtmlOverflow = document.documentElement.style.overflow;

    // Apply scroll lock styles to both html and body for cross-browser support
    document.body.style.scrollbarGutter = 'stable';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
  }

  private unlockBodyScroll(): void {
    if (!this.savedBodyStyles) return;

    // Get the scroll position from the top style
    const scrollY = Math.abs(Number.parseInt(document.body.style.top || '0', 10));

    // Restore original styles
    document.documentElement.style.overflow = this.savedHtmlOverflow || '';
    document.body.style.overflow = this.savedBodyStyles.overflow;
    document.body.style.position = this.savedBodyStyles.position;
    document.body.style.top = this.savedBodyStyles.top;
    document.body.style.width = this.savedBodyStyles.width;
    document.body.style.scrollbarGutter = this.savedBodyStyles.scrollbarGutter || '';

    // Restore scroll position
    window.scrollTo(0, scrollY);

    this.savedBodyStyles = null;
    this.savedHtmlOverflow = null;
  }

  private cleanup(): void {
    this.clearLoadingInterval();

    // Cancel any in-flight search request
    if (this.currentSearchController) {
      this.currentSearchController.abort();
      this.currentSearchController = null;
    }

    // Remove global keyboard listener
    if (this.handleGlobalKeydown) {
      document.removeEventListener('keydown', this.handleGlobalKeydown);
      this.handleGlobalKeydown = null;
    }

    // Remove element event listeners
    if (this.inputElement) {
      if (this.handleInputChange) {
        this.inputElement.removeEventListener('input', this.handleInputChange);
      }
      if (this.handleInputKeydown) {
        this.inputElement.removeEventListener('keydown', this.handleInputKeydown);
      }
    }

    if (this.backdrop && this.handleBackdropClick) {
      this.backdrop.removeEventListener('click', this.handleBackdropClick);
    }

    this.detachResultsContainerClick();

    // Clear handler references
    this.handleInputChange = null;
    this.handleInputKeydown = null;
    this.handleBackdropClick = null;

    // Flush remaining analytics and remove unload listeners
    this.destroyStatsClient();

    // Cancel any pending requests
    if (this.client) {
      this.client.cancelAllRequests();
    }
  }

  // Public API

  /**
   * Open the search modal
   */
  public open(): void {
    if (this.isOpen) return;

    this.isOpen = true;
    this.backdrop?.classList.add('open');
    this.modal?.classList.add('open');

    // Focus input after animation completes
    // Use double rAF to ensure DOM has updated and transitions have started
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.inputElement?.focus();
      });
    });

    // Prevent body scroll (save current styles to restore later)
    this.lockBodyScroll();

    this.dispatchEvent(createCustomEvent('open', undefined));
  }

  /**
   * Close the search modal
   */
  public close(): void {
    if (!this.isOpen) return;

    this.isOpen = false;
    this.backdrop?.classList.remove('open');
    this.modal?.classList.remove('open');

    // Clear state
    if (this.inputElement) {
      this.inputElement.value = '';
    }
    this.results = [];
    this.activeIndex = -1;
    this.showEmptyState();

    // Restore body scroll
    this.unlockBodyScroll();

    this.dispatchEvent(createCustomEvent('close', undefined));
  }

  /**
   * Toggle the search modal open/closed
   */
  public toggle(): void {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  /**
   * Perform a search programmatically
   */
  public async search(query: string): Promise<void> {
    if (!this.isOpen) {
      this.open();
    }

    if (this.inputElement) {
      this.inputElement.value = query;
    }

    await this.performSearch(query);
  }

  /**
   * Get current search results
   */
  public getResults(): SearchResult[] {
    return [...this.results];
  }

  /**
   * Check if modal is currently open
   */
  public isModalOpen(): boolean {
    return this.isOpen;
  }
}

// Register the custom element
if (!customElements.get(COMPONENT_NAME)) {
  customElements.define(COMPONENT_NAME, SearchModalSnippet);
}
