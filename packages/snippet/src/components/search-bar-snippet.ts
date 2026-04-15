/**
 * Search Bar Snippet
 * A search bar with results display
 */

import type { AISearchClient } from '../api/ai-search.ts';
import { POWERED_BY_BRANDING } from '../constants.ts';
import { searchStyles } from '../styles/search.ts';
import { baseStyles } from '../styles/theme.ts';
import type { SearchRequestOptions, SearchResult, SearchSnippetProps } from '../types/index.ts';
import {
  createClient,
  createCustomEvent,
  debounce,
  escapeHTML,
  formatDate,
  LOADING_MESSAGE_INTERVAL_MS,
  LOADING_MESSAGES,
  parseAttribute,
  parseBooleanAttribute,
  parseNumberAttribute,
} from '../utils/index.ts';

const COMPONENT_NAME = 'search-bar-snippet';
const DEFAULT_DISPLAY_RESULTS = 10;
const REQUEST_MAX_RESULTS = 100;

export class SearchBarSnippet extends HTMLElement {
  private shadow: ShadowRoot;
  private client: AISearchClient | null = null;
  private container: HTMLElement | null = null;
  private inputElement: HTMLInputElement | null = null;
  private resultsContainer: HTMLElement | null = null;
  private searchButton: HTMLButtonElement | null = null;
  private debouncedSearch: ((query: string) => void) | null = null;
  private currentSearchController: AbortController | null = null;
  private loadingMessageInterval: ReturnType<typeof setInterval> | null = null;
  private loadingMessageIndex = 0;

  // Event handler references for cleanup
  private handleInputChange: ((e: Event) => void) | null = null;
  private handleInputKeydownEnter: ((e: KeyboardEvent) => void) | null = null;
  private handleInputKeydownEscape: ((e: KeyboardEvent) => void) | null = null;
  private handleSearchButtonClick: (() => void) | null = null;

  static get observedAttributes() {
    return [
      'api-url',
      'placeholder',
      'max-results',
      'debounce-ms',
      'theme',
      'hide-branding',
      'show-url',
      'show-date',
      'hide-thumbnails',
      'see-more',
      'request-options',
    ] as const;
  }

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    this.initializeClient();
    this.render();
    this.dispatchEvent(createCustomEvent('ready', undefined));
  }

  disconnectedCallback(): void {
    this.cleanup();
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue) return;

    if (name === 'api-url') {
      this.initializeClient();
    } else if (name === 'theme') {
      // Theme changes are handled automatically by CSS :host([theme]) selectors
      // But we trigger this to ensure any dynamic updates are applied
      this.updateTheme(newValue);
    }
  }

  private getProps(): SearchSnippetProps {
    return {
      apiUrl: parseAttribute(this.getAttribute('api-url'), ''),
      placeholder: parseAttribute(this.getAttribute('placeholder'), 'Search...'),
      maxResults: parseNumberAttribute(this.getAttribute('max-results'), 10),
      debounceMs: parseNumberAttribute(this.getAttribute('debounce-ms'), 300),
      theme: parseAttribute(this.getAttribute('theme'), 'auto') as 'light' | 'dark' | 'auto',
      hideBranding: parseBooleanAttribute(this.getAttribute('hide-branding'), false),
      showUrl: parseBooleanAttribute(this.getAttribute('show-url'), false),
      showDate: parseBooleanAttribute(this.getAttribute('show-date'), false),
      hideThumbnails: parseBooleanAttribute(this.getAttribute('hide-thumbnails'), false),
      seeMore: parseAttribute(this.getAttribute('see-more'), ''),
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
      console.error('SearchBarSnippet: invalid request-options attribute', error);
      return undefined;
    }
  }

  private initializeClient(): void {
    const props = this.getProps();

    if (!props.apiUrl) {
      console.error('SearchBarSnippet: api-url attribute is required');
      this.client = null;
      this.showMissingApiUrlError();
      return;
    }

    try {
      this.client = createClient(props.apiUrl);
    } catch (error) {
      console.error('SearchBarSnippet:', error);
    }
  }

  private render(): void {
    const props = this.getProps();

    // Create debounced search function
    const searchFn = (query: string) => this.performSearch(query);
    this.debouncedSearch = debounce(
      searchFn as (...args: unknown[]) => unknown,
      props.debounceMs || 400
    ) as (query: string) => void;

    const style = document.createElement('style');
    style.textContent = `${baseStyles}\n${searchStyles}`;

    this.container = document.createElement('div');
    this.container.className = 'container';
    this.container.innerHTML = `
            <div class="search-view"> 
                <div class="search-input-wrapper">
                    <svg xmlns="http://www.w3.org/2000/svg" class="search-icon" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M784-120 532-372q-30 24-69 38t-83 14q-109 0-184.5-75.5T120-580q0-109 75.5-184.5T380-840q109 0 184.5 75.5T640-580q0 44-14 83t-38 69l252 252-56 56ZM380-400q75 0 127.5-52.5T560-580q0-75-52.5-127.5T380-760q-75 0-127.5 52.5T200-580q0 75 52.5 127.5T380-400Z"/></svg>
                    <input
                        type="text"
                        name="search-input"
                        class="search-input"
                        placeholder="${escapeHTML(props.placeholder || 'Search...')}"
                        aria-label="Search input"
                        autocomplete="off"
                    />
                    <button class="button search-submit-button" aria-label="Search">
                        <span>Search</span>
                    </button>
                </div>
                <div class="search-content">
                    <div class="search-results-wrapper">
                        <!-- Results will be inserted here -->
                    </div>
                </div>
            </div>
        `;

    this.shadow.innerHTML = '';
    this.shadow.appendChild(style);
    this.shadow.appendChild(this.container);

    // Get references to elements
    this.inputElement = this.container.querySelector('.search-input');
    this.resultsContainer = this.container.querySelector('.search-results-wrapper');
    this.searchButton = this.container.querySelector('.search-submit-button');

    this.attachEventListeners();

    // Show error immediately if api-url was missing when the component was connected
    if (!this.client) {
      this.showMissingApiUrlError();
    }
  }

  private attachEventListeners(): void {
    if (!this.inputElement) return;

    // Input event for real-time search
    this.handleInputChange = (e: Event) => {
      const target = e.target as HTMLInputElement;
      const query = target.value.trim();

      if (query.length > 0 && this.debouncedSearch) {
        this.debouncedSearch(query);
      } else {
        this.showEmptyState();
      }
    };
    this.inputElement.addEventListener('input', this.handleInputChange);

    // Enter key to search immediately
    this.handleInputKeydownEnter = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        const query = (e.target as HTMLInputElement).value.trim();
        if (query.length > 0) {
          this.performSearch(query);
        }
      }
    };
    this.inputElement.addEventListener('keydown', this.handleInputKeydownEnter);

    this.handleInputKeydownEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.inputElement) {
        this.inputElement.value = '';
      }
    };
    window.addEventListener('keydown', this.handleInputKeydownEscape);

    // Search button click
    if (this.searchButton) {
      this.handleSearchButtonClick = () => {
        const query = this.inputElement?.value.trim() || '';
        if (query.length > 0) {
          this.performSearch(query);
        }
      };
      this.searchButton.addEventListener('click', this.handleSearchButtonClick);
    }
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
      const results = await this.client.search(query, {
        signal: this.currentSearchController.signal,
        maxResults: REQUEST_MAX_RESULTS,
        request: this.getRequestOptions(),
      });
      const props = this.getProps();
      const visibleResults = results.slice(0, props.maxResults || DEFAULT_DISPLAY_RESULTS);
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
    this.clearLoadingInterval();
    if (!this.resultsContainer) return;

    if (results.length === 0) {
      this.showNoResultsState(query);
      return;
    }
    const props = this.getProps();
    const brandingHTML = props.hideBranding
      ? ''
      : `<div class="powered-by-inline">${POWERED_BY_BRANDING}</div>`;
    const hasMoreResults = totalResults > results.length;
    const resultsCountLabel = hasMoreResults
      ? `Showing ${results.length} of ${totalResults} results`
      : `Found ${totalResults} result${totalResults === 1 ? '' : 's'}`;

    const seeMoreHTML =
      props.seeMore && hasMoreResults
        ? `<div class="search-footer">
            <a href="${escapeHTML(props.seeMore + encodeURIComponent(query))}" class="search-see-more">
              <span>See more results</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
            </a>
          </div>`
        : '';

    const resultsHTML = `
            <div class="search-header">
                <div class="search-count">
                    ${resultsCountLabel}
                </div>
                ${brandingHTML}
            </div>
            <div class="search-results">
                ${results.map((result) => this.renderResult(result)).join('')}
            </div>
            ${seeMoreHTML}
        `;

    this.resultsContainer.innerHTML = resultsHTML;

    // Attach click handlers to results
    this.attachResultHandlers();
  }

  private renderResult(result: SearchResult): string {
    const props = this.getProps();
    const imageHTML = props.hideThumbnails
      ? ''
      : this.renderResultImage(result.image, result.title);
    const href = result.url ? escapeHTML(result.url) : '#';
    const timestampHTML =
      props.showDate && result.timestamp !== undefined
        ? `<div class="search-result-date">${escapeHTML(formatDate(result.timestamp))}</div>`
        : '';
    const metadataHTML =
      (props.showUrl && result.url) || timestampHTML
        ? `<div class="search-result-metadata">
            ${props.showUrl && result.url ? `<span class="search-result-url">${escapeHTML(result.url)}</span>` : '<span class="search-result-url search-result-url-empty"></span>'}
            ${timestampHTML}
          </div>`
        : '';

    return `
            <a href="${href}" class="search-result-item" data-result-id="${escapeHTML(result.url || '')}">
                ${imageHTML}
                <div class="search-result-content">
                    <div class="search-result-title">${escapeHTML(result.title || '')}</div>
                    <div class="search-result-snippet">${escapeHTML(result.description || '')}</div>
                    ${metadataHTML}
                </div>
            </a>
        `;
  }

  private renderResultImage(imageUrl: string | undefined, alt: string): string {
    const placeholderSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`;

    if (!imageUrl) {
      return `
        <div class="search-result-image-container">
          <div class="search-result-image-placeholder">${placeholderSVG}</div>
        </div>
      `;
    }

    return `
      <div class="search-result-image-container">
        <div class="search-result-image-loading"></div>
        <div class="search-result-image-placeholder" style="display: none;">${placeholderSVG}</div>
        <img 
          class="search-result-image" 
          src="${escapeHTML(imageUrl)}" 
          alt="${escapeHTML(alt)}"
          loading="lazy"
        />
      </div>
    `;
  }

  private attachResultHandlers(): void {
    const resultItems = this.container?.querySelectorAll('.search-result-item');
    if (!resultItems) return;

    // Handle clicks on results without URLs (prevent default anchor behavior)
    for (const item of resultItems) {
      const href = item.getAttribute('href');
      if (href === '#') {
        item.addEventListener('click', (e) => {
          e.preventDefault();
        });
      }
    }

    // Image load/error handlers
    const images = this.container?.querySelectorAll('.search-result-image');
    images?.forEach((img) => {
      img.addEventListener('load', () => {
        img.classList.add('loaded');
        const container = img.closest('.search-result-image-container');
        container?.querySelector('.search-result-image-loading')?.remove();
      });

      img.addEventListener('error', () => {
        const container = img.closest('.search-result-image-container');
        container?.querySelector('.search-result-image-loading')?.remove();
        const placeholder = container?.querySelector(
          '.search-result-image-placeholder'
        ) as HTMLElement;
        if (placeholder) placeholder.style.display = 'flex';
        (img as HTMLElement).style.display = 'none';
      });
    });
  }

  private showLoadingState(): void {
    if (!this.resultsContainer) return;

    this.clearLoadingInterval();
    this.loadingMessageIndex = Math.floor(Math.random() * LOADING_MESSAGES.length);

    this.resultsContainer.innerHTML = `
            <div class="search-loading">
                <div class="loading" aria-label="Loading"></div>
                <div class="loading-text loading-text-animate">${LOADING_MESSAGES[this.loadingMessageIndex]}</div>
            </div>
        `;

    this.startLoadingInterval();
  }

  private startLoadingInterval(): void {
    this.loadingMessageInterval = setInterval(() => {
      this.loadingMessageIndex = (this.loadingMessageIndex + 1) % LOADING_MESSAGES.length;
      const textEl = this.resultsContainer?.querySelector('.loading-text');
      if (textEl) {
        textEl.classList.remove('loading-text-animate');
        void (textEl as HTMLElement).offsetWidth;
        textEl.textContent = LOADING_MESSAGES[this.loadingMessageIndex];
        textEl.classList.add('loading-text-animate');
      }
    }, LOADING_MESSAGE_INTERVAL_MS);
  }

  private clearLoadingInterval(): void {
    if (this.loadingMessageInterval) {
      clearInterval(this.loadingMessageInterval);
      this.loadingMessageInterval = null;
    }
  }

  private showEmptyState(): void {
    this.clearLoadingInterval();
    if (!this.resultsContainer) return;

    this.resultsContainer.innerHTML = `
            <div class="search-empty">
                <svg class="search-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8"></circle>
                    <path d="m21 21-4.35-4.35"></path>
                </svg>
                <div class="search-empty-title">Start Searching</div>
                <div class="search-empty-description">
                    Enter a query to search for results
                </div>
            </div>
        `;
  }

  private showNoResultsState(query: string): void {
    this.clearLoadingInterval();
    if (!this.resultsContainer) return;

    this.resultsContainer.innerHTML = `
            <div class="search-empty">
                <svg class="search-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <div class="search-empty-title">No Results Found</div>
                <div class="search-empty-description">
                    No results found for "${escapeHTML(query)}"
                </div>
            </div>
        `;
  }

  private showErrorState(message: string): void {
    this.clearLoadingInterval();
    if (!this.resultsContainer) return;

    this.resultsContainer.innerHTML = `
            <div class="error">
                <strong>Error:</strong> ${escapeHTML(message)}
            </div>
        `;
  }

  private showMissingApiUrlError(): void {
    if (this.resultsContainer) {
      this.showErrorState('The api-url attribute is required. Please provide a valid API URL.');
    }
  }

  private updateTheme(theme: string | null): void {
    // CSS custom properties via :host([theme]) selectors handle the actual theming
    // This method is here for any additional theme-related logic if needed
    const validTheme = theme === 'light' || theme === 'dark' || theme === 'auto' ? theme : 'auto';

    // Ensure the attribute is set on the host for CSS selectors
    if (validTheme === 'auto') {
      // Let the @media (prefers-color-scheme) handle it
      this.removeAttribute('theme');
    } else {
      this.setAttribute('theme', validTheme);
    }
  }

  private cleanup(): void {
    this.clearLoadingInterval();

    // Cancel any in-flight search request
    if (this.currentSearchController) {
      this.currentSearchController.abort();
      this.currentSearchController = null;
    }

    if (this.client) {
      this.client.cancelAllRequests();
    }

    // Remove event listeners
    if (this.inputElement) {
      if (this.handleInputChange) {
        this.inputElement.removeEventListener('input', this.handleInputChange);
      }
      if (this.handleInputKeydownEnter) {
        this.inputElement.removeEventListener('keydown', this.handleInputKeydownEnter);
      }
      if (this.handleInputKeydownEscape) {
        window.removeEventListener('keydown', this.handleInputKeydownEscape);
      }
    }

    if (this.searchButton && this.handleSearchButtonClick) {
      this.searchButton.removeEventListener('click', this.handleSearchButtonClick);
    }

    // Clear handler references
    this.handleInputChange = null;
    this.handleInputKeydownEnter = null;
    this.handleInputKeydownEscape = null;
    this.handleSearchButtonClick = null;
  }

  // Public API
  public async search(query: string): Promise<void> {
    await this.performSearch(query);
  }
}

// Register the custom element
if (!customElements.get(COMPONENT_NAME)) {
  customElements.define(COMPONENT_NAME, SearchBarSnippet);
}
