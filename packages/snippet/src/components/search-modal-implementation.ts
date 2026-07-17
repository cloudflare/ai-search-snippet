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
  groupResultsByMetadata,
  LOADING_MESSAGE_INTERVAL_MS,
  parseAttribute,
  parseBooleanAttribute,
  parseNumberAttribute,
  renderResultGroups,
  renderResultIcon,
} from '../utils/index.ts';
import {
  FAVORITE_RESULTS_STORAGE_KEY,
  hasStoredResult,
  loadStoredResults,
  RECENT_RESULTS_STORAGE_KEY,
  storeRecentResult,
  toggleFavoriteResult,
} from '../utils/stored-results.ts';
import { sanitizeUrl } from '../utils/url-safety.ts';

const DEFAULT_RENDER_RESULTS = 10;
const DEFAULT_REQUEST_MAX_RESULTS = 50;

interface SearchModalProps extends SearchSnippetProps {
  /** Keyboard shortcut key (default: 'k') */
  shortcut?: string;
  /** Whether to use meta key (Cmd on Mac) or ctrl key */
  useMetaKey?: boolean;
}

export class SearchModalImplementation {
  private host: HTMLElement;
  private shadow: ShadowRoot;
  private handleOpenStateChange: (isOpen: boolean) => void;
  private client: AISearchClient | null = null;
  private stats: StatsClient | null = null;
  private backdrop: HTMLElement | null = null;
  private modal: HTMLElement | null = null;
  private inputElement: HTMLInputElement | null = null;
  private resultsContainer: HTMLElement | null = null;
  private footerCount: HTMLElement | null = null;
  private isOpen = false;
  private results: SearchResult[] = [];
  private favoriteResults: SearchResult[] = [];
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

  constructor(
    host: HTMLElement,
    shadow: ShadowRoot,
    translations: Translations | null,
    handleOpenStateChange: (isOpen: boolean) => void
  ) {
    this.host = host;
    this.shadow = shadow;
    this.handleOpenStateChange = handleOpenStateChange;
    this.translationsOverride = translations;
    this.syncTranslationsFromAttribute();
    this.initializeClient();
    this.render();
  }

  public attributeChangedCallback(
    name: string,
    oldValue: string | null,
    newValue: string | null
  ): void {
    if (oldValue === newValue) return;

    if (name === 'api-url' || name === 'disable-analytics') {
      this.initializeClient();
    } else if (name === 'theme') {
      this.updateTheme(newValue);
    } else if (name === 'translations') {
      this.syncTranslationsFromAttribute();
      this.rerender();
    }
  }

  /**
   * Get the current translations object.
   */
  public setTranslations(value: Translations | null | undefined): void {
    this.translationsOverride = value ?? null;
    this.resolvedTranslations = mergeTranslations(this.translationsOverride);
    this.rerender();
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
      this.host.getAttribute('translations'),
      'SearchModalSnippet'
    );
    this.resolvedTranslations = mergeTranslations(parsed);
  }

  private getProps(): SearchModalProps {
    const t = this.resolvedTranslations;
    return {
      apiUrl: parseAttribute(this.host.getAttribute('api-url'), ''),
      placeholder: parseAttribute(this.host.getAttribute('placeholder'), t.placeholder),
      maxResults: parseNumberAttribute(
        this.host.getAttribute('max-results'),
        DEFAULT_REQUEST_MAX_RESULTS
      ),
      maxRenderResults: parseNumberAttribute(
        this.host.getAttribute('max-render-results'),
        DEFAULT_RENDER_RESULTS
      ),
      debounceMs: parseNumberAttribute(this.host.getAttribute('debounce-ms'), 300),
      theme: parseAttribute(this.host.getAttribute('theme'), 'auto') as 'light' | 'dark' | 'auto',
      shortcut: parseAttribute(this.host.getAttribute('shortcut'), 'k'),
      useMetaKey: this.host.getAttribute('use-meta-key') !== 'false',
      hideBranding: parseBooleanAttribute(this.host.getAttribute('hide-branding'), false),
      showUrl: parseBooleanAttribute(this.host.getAttribute('show-url'), false),
      showDate: parseBooleanAttribute(this.host.getAttribute('show-date'), false),
      hideThumbnails: parseBooleanAttribute(this.host.getAttribute('hide-thumbnails'), false),
      seeMore: parseAttribute(this.host.getAttribute('see-more'), ''),
      groupBy: parseAttribute(this.host.getAttribute('group-by'), ''),
      disableAnalytics: parseBooleanAttribute(this.host.getAttribute('disable-analytics'), false),
      translations: this.translationsOverride ?? undefined,
    };
  }

  private getRequestOptions(): SearchRequestOptions | undefined {
    const rawRequestOptions = this.host.getAttribute('request-options');

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
          <div class="modal-results" id="modal-results-list" role="listbox" aria-label="${escapeHTML(t.searchResultsAriaLabel)}"></div>
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
    } else {
      this.showEmptyState();
    }
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
    this.host.dispatchEvent(
      createCustomEvent('result-select', {
        result,
        index: this.activeIndex,
      })
    );

    // Navigate to URL - click the active link element to trigger navigation.
    // Gate the programmatic click on the allowlisted scheme check so the
    // Enter-key selection follows the same policy as a mouse click on the
    // rendered anchor (whose href is already `#` for non-allowlisted URLs).
    const activeItem = this.resultsContainer?.querySelector(
      `.modal-result-item[data-index="${this.activeIndex}"]`
    ) as HTMLAnchorElement | null;

    if (activeItem && sanitizeUrl(result.url)) {
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
      const visibleResults = results.slice(0, props.maxRenderResults || DEFAULT_RENDER_RESULTS);
      this.lastSearchQuery = query;
      this.lastSearchTotal = results.length;
      this.stats?.trackSearch(query, results.length);
      this.displayResults(visibleResults, query, results.length);
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
    const props = this.getProps();
    const t = this.resolvedTranslations;
    const groups = props.groupBy
      ? groupResultsByMetadata(results, props.groupBy, t.groupOther)
      : null;
    this.results = groups ? groups.flatMap((group) => group.results) : results;
    this.favoriteResults = loadStoredResults(FAVORITE_RESULTS_STORAGE_KEY);
    this.activeIndex = this.results.length > 0 ? 0 : -1;

    this.clearLoadingInterval();
    if (!this.resultsContainer) return;

    if (this.results.length === 0) {
      this.showNoResultsState(query);
      return;
    }

    const resultsHTML = groups
      ? renderResultGroups(groups, (result, index) => this.renderResult(result, index))
      : this.results.map((result, index) => this.renderResult(result, index)).join('');
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
    const iconHTML = renderResultIcon(result.metadata?.icon);
    const imageHTML = props.hideThumbnails
      ? ''
      : this.renderResultImage(result.image, result.title);
    // Restrict result.url to an allowlisted set of URL schemes before
    // stamping it into the anchor href / data-url. The URL originates
    // from the search API's `chunk.item.key` field and is not a
    // same-origin value. Also consumed by `selectActiveResult` to gate
    // the programmatic click triggered by the Enter key.
    const safeUrl = sanitizeUrl(result.url);
    const href = safeUrl ? escapeHTML(safeUrl) : '#';
    const displayUrl = safeUrl ? escapeHTML(formatDisplayUrl(safeUrl)) : '';
    const timestampHTML =
      props.showDate && result.timestamp !== undefined
        ? `<div class="modal-result-date">${escapeHTML(formatDate(result.timestamp))}</div>`
        : '';
    const metadataHTML =
      (props.showUrl && safeUrl) || timestampHTML
        ? `<div class="modal-result-metadata">
            ${props.showUrl && safeUrl ? `<span class="modal-result-url">${displayUrl}</span>` : '<span class="modal-result-url modal-result-url-empty"></span>'}
            ${timestampHTML}
          </div>`
        : '';
    const isFavorite = hasStoredResult(this.favoriteResults, result);
    const favoriteLabel = isFavorite
      ? this.resolvedTranslations.removeFavorite
      : this.resolvedTranslations.addFavorite;

    return `
      <div class="modal-result-row">
        <a
          href="${href}"
          class="modal-result-item${index === this.activeIndex ? ' active' : ''}"
          role="option"
          id="result-${index}"
          aria-selected="${index === this.activeIndex}"
          tabindex="-1"
          data-index="${index}"
          data-result-id="${escapeHTML(result.id || '')}"
          data-url="${escapeHTML(safeUrl)}"
        >
          ${iconHTML}
          ${imageHTML}
          <div class="modal-result-content">
            <div class="modal-result-title">${escapeHTML(result.title || '')}</div>
            ${result.description ? `<div class="modal-result-description">${escapeHTML(result.description)}</div>` : ''}
            ${metadataHTML}
          </div>
        </a>
        <button
          type="button"
          class="modal-favorite-button${isFavorite ? ' favorite' : ''}"
          data-favorite-index="${index}"
          aria-label="${escapeHTML(favoriteLabel)}"
          title="${escapeHTML(favoriteLabel)}"
          aria-pressed="${isFavorite}"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m12 2.7 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.3l6.2-.9L12 2.7Z"></path>
          </svg>
        </button>
      </div>
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

      const favoriteButton = target.closest('.modal-favorite-button') as HTMLButtonElement | null;
      if (favoriteButton) {
        const index = Number.parseInt(favoriteButton.dataset.favoriteIndex ?? '', 10);
        const result = this.results[index];
        if (!Number.isNaN(index) && result) {
          this.favoriteResults = toggleFavoriteResult(result);
          if (this.inputElement?.value.trim()) {
            const isFavorite = hasStoredResult(this.favoriteResults, result);
            const label = isFavorite
              ? this.resolvedTranslations.removeFavorite
              : this.resolvedTranslations.addFavorite;
            favoriteButton.classList.toggle('favorite', isFavorite);
            favoriteButton.setAttribute('aria-pressed', String(isFavorite));
            favoriteButton.setAttribute('aria-label', label);
            favoriteButton.title = label;
          } else {
            this.showEmptyState();
          }
        }
        return;
      }

      const item = target.closest('.modal-result-item') as HTMLElement | null;
      if (item) {
        const href = item.getAttribute('href');
        if (href === '#') {
          e.preventDefault();
        }

        const indexAttr = item.getAttribute('data-index');
        const resultId = item.getAttribute('data-result-id') ?? '';
        const index = indexAttr !== null ? Number.parseInt(indexAttr, 10) : Number.NaN;

        if (!Number.isNaN(index)) {
          const result = this.results[index];
          if (result) {
            storeRecentResult(result);
          }
          if (resultId) {
            this.stats?.trackClick(this.lastSearchQuery, this.lastSearchTotal, resultId, index);
          }
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

  private renderInitialSection(
    results: SearchResult[],
    title: string,
    id: string,
    startIndex: number,
    icon: 'favorite' | 'recent'
  ): string {
    if (results.length === 0) return '';

    const iconHTML =
      icon === 'favorite'
        ? `<svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m12 2.7 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.3l6.2-.9L12 2.7Z"></path>
          </svg>`
        : `<svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 12a9 9 0 1 0 3-6.7L3 8"></path>
            <path d="M3 3v5h5"></path>
            <path d="M12 7v5l4 2"></path>
          </svg>`;

    return `
      <section class="modal-initial-section" aria-labelledby="${id}">
        <h2 class="modal-initial-section-title" id="${id}">
          ${iconHTML}
          <span>${escapeHTML(title)}</span>
        </h2>
        ${results.map((result, index) => this.renderResult(result, startIndex + index)).join('')}
      </section>
    `;
  }

  private showEmptyState(): void {
    this.clearLoadingInterval();
    if (!this.resultsContainer) return;

    this.favoriteResults = loadStoredResults(FAVORITE_RESULTS_STORAGE_KEY);
    const recentResults = loadStoredResults(RECENT_RESULTS_STORAGE_KEY).filter(
      (result) => !hasStoredResult(this.favoriteResults, result)
    );
    this.results = [...this.favoriteResults, ...recentResults];
    this.activeIndex = this.results.length > 0 ? 0 : -1;
    this.resultsContainer.innerHTML =
      this.results.length > 0
        ? `${this.renderInitialSection(
            this.favoriteResults,
            this.resolvedTranslations.favoriteResults,
            'modal-favorite-results-title',
            0,
            'favorite'
          )}${this.renderInitialSection(
            recentResults,
            this.resolvedTranslations.recentResults,
            'modal-recent-results-title',
            this.favoriteResults.length,
            'recent'
          )}`
        : this.renderEmptyState();
    this.attachResultHandlers();
    this.updateActiveResult();

    if (this.footerCount) {
      this.footerCount.textContent = '';
    }

    if (this.inputElement) {
      this.inputElement.setAttribute('aria-expanded', String(this.results.length > 0));
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
      this.host.removeAttribute('theme');
    } else {
      this.host.setAttribute('theme', validTheme);
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

  public cleanup(): void {
    this.clearLoadingInterval();
    this.debouncedSearch?.cancel();

    // Cancel any in-flight search request
    if (this.currentSearchController) {
      this.currentSearchController.abort();
      this.currentSearchController = null;
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

    if (this.isOpen) {
      this.isOpen = false;
      this.handleOpenStateChange(false);
      this.backdrop?.classList.remove('open');
      this.modal?.classList.remove('open');
      this.unlockBodyScroll();
    }
  }

  // Public API

  /**
   * Open the search modal
   */
  public open(): void {
    if (this.isOpen) return;

    this.isOpen = true;
    this.handleOpenStateChange(true);
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

    this.host.dispatchEvent(createCustomEvent('open', undefined));
  }

  /**
   * Close the search modal
   */
  public close(): void {
    if (!this.isOpen) return;

    this.isOpen = false;
    this.handleOpenStateChange(false);
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

    this.host.dispatchEvent(createCustomEvent('close', undefined));
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
