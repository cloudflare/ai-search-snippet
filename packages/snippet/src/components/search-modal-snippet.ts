/**
 * Search Modal Snippet
 * A modal combobox search component with keyboard navigation
 * Opens with Cmd/Ctrl+K shortcut by default
 */

import type { Client } from '../api/index.ts';
import { POWERED_BY_BRANDING } from '../constants.ts';
import { modalStyles } from '../styles/modal.ts';
import { baseStyles } from '../styles/theme.ts';
import type { SearchResult, SearchSnippetProps } from '../types/index.ts';
import {
  createClient,
  createCustomEvent,
  debounce,
  escapeHTML,
  LOADING_MESSAGE_INTERVAL_MS,
  LOADING_MESSAGES,
  parseAttribute,
  parseBooleanAttribute,
  parseNumberAttribute,
} from '../utils/index.ts';

const COMPONENT_NAME = 'search-modal-snippet';

export interface SearchModalProps extends SearchSnippetProps {
  /** Keyboard shortcut key (default: 'k') */
  shortcut?: string;
  /** Whether to use meta key (Cmd on Mac) or ctrl key */
  useMetaKey?: boolean;
}

export class SearchModalSnippet extends HTMLElement {
  private shadow: ShadowRoot;
  private client: Client | null = null;
  private backdrop: HTMLElement | null = null;
  private modal: HTMLElement | null = null;
  private inputElement: HTMLInputElement | null = null;
  private resultsContainer: HTMLElement | null = null;
  private footerCount: HTMLElement | null = null;
  private isOpen = false;
  private results: SearchResult[] = [];
  private activeIndex = -1;
  private debouncedSearch: ((query: string) => void) | null = null;
  private currentSearchController: AbortController | null = null;
  private loadingMessageInterval: ReturnType<typeof setInterval> | null = null;
  private loadingMessageIndex = 0;

  // Event handler references for cleanup
  private handleGlobalKeydown: ((e: KeyboardEvent) => void) | null = null;
  private handleInputChange: ((e: Event) => void) | null = null;
  private handleInputKeydown: ((e: KeyboardEvent) => void) | null = null;
  private handleBackdropClick: ((e: MouseEvent) => void) | null = null;

  // Scroll lock state
  private savedBodyStyles: {
    overflow: string;
    position: string;
    top: string;
    width: string;
  } | null = null;
  private savedHtmlOverflow: string | null = null;

  static get observedAttributes() {
    return [
      'api-url',
      'placeholder',
      'max-results',
      'theme',
      'shortcut',
      'use-meta-key',
      'debounce-ms',
      'hide-branding',
      'show-url',
      'hide-thumbnails',
    ] as const;
  }

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
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

    if (name === 'api-url') {
      this.initializeClient();
    } else if (name === 'theme') {
      this.updateTheme(newValue);
    }
  }

  private getProps(): SearchModalProps {
    return {
      apiUrl: parseAttribute(this.getAttribute('api-url'), 'http://localhost:3000'),
      placeholder: parseAttribute(this.getAttribute('placeholder'), 'Search...'),
      maxResults: parseNumberAttribute(this.getAttribute('max-results'), 10),
      debounceMs: parseNumberAttribute(this.getAttribute('debounce-ms'), 300),
      theme: parseAttribute(this.getAttribute('theme'), 'auto') as 'light' | 'dark' | 'auto',
      shortcut: parseAttribute(this.getAttribute('shortcut'), 'k'),
      useMetaKey: this.getAttribute('use-meta-key') !== 'false',
      hideBranding: parseBooleanAttribute(this.getAttribute('hide-branding'), false),
      showUrl: parseBooleanAttribute(this.getAttribute('show-url'), false),
      hideThumbnails: parseBooleanAttribute(this.getAttribute('hide-thumbnails'), false),
    };
  }

  private initializeClient(): void {
    const props = this.getProps();

    if (!props.apiUrl) {
      console.error('SearchModalSnippet: api-url attribute is required');
      return;
    }

    try {
      this.client = createClient(props.apiUrl);
    } catch (error) {
      console.error('SearchModalSnippet:', error);
    }
  }

  private render(): void {
    const props = this.getProps();

    // Create debounced search function
    const searchFn = (query: string) => this.performSearch(query);
    this.debouncedSearch = debounce(
      searchFn as (...args: unknown[]) => unknown,
      props.debounceMs || 300
    ) as (query: string) => void;

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
            placeholder="${escapeHTML(props.placeholder || 'Search...')}"
            aria-label="Search"
            aria-autocomplete="list"
            aria-controls="modal-results-list"
            aria-expanded="false"
            autocomplete="off"
            spellcheck="false"
          />
        </div>
        <div class="modal-content">
          <div class="modal-results" id="modal-results-list" role="listbox" aria-label="Search results">
            ${this.renderEmptyState()}
          </div>
        </div>
        <div class="modal-footer">
          <div class="modal-footer-hints">
            <div class="modal-footer-hint">
              <kbd class="modal-kbd">↑</kbd>
              <kbd class="modal-kbd">↓</kbd>
              <span>Navigate</span>
            </div>
            <div class="modal-footer-hint">
              <kbd class="modal-kbd">↵</kbd>
              <span>Select</span>
            </div>
            <div class="modal-footer-hint">
              <kbd class="modal-kbd">Esc</kbd>
              <span>Close</span>
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
    if (!this.client) return;

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
        streaming: false,
        signal: this.currentSearchController.signal,
      });
      const props = this.getProps();
      this.results = results.slice(0, props.maxResults || 10);
      this.activeIndex = this.results.length > 0 ? 0 : -1;
      this.displayResults(this.results, query);
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

  private displayResults(results: SearchResult[], query: string): void {
    this.clearLoadingInterval();
    if (!this.resultsContainer) return;

    if (results.length === 0) {
      this.showNoResultsState(query);
      return;
    }

    const resultsHTML = results.map((result, index) => this.renderResult(result, index)).join('');

    this.resultsContainer.innerHTML = resultsHTML;

    // Update footer count
    if (this.footerCount) {
      this.footerCount.textContent = `${results.length} result${results.length === 1 ? '' : 's'}`;
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

    return `
      <a 
        href="${href}"
        class="modal-result-item${index === this.activeIndex ? ' active' : ''}" 
        role="option" 
        id="result-${index}"
        aria-selected="${index === this.activeIndex}"
        tabindex="-1"
        data-index="${index}"
        data-url="${escapeHTML(result.url || '')}"
      >
        ${imageHTML}
        <div class="modal-result-content">
          <div class="modal-result-title">${escapeHTML(result.title || '')}</div>
          ${result.description ? `<div class="modal-result-description">${escapeHTML(result.description)}</div>` : ''}
          ${props.showUrl && result.url ? `<span class="modal-result-url">${escapeHTML(result.url)}</span>` : ''}
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
    const items = this.resultsContainer?.querySelectorAll('.modal-result-item');
    if (!items) return;

    items.forEach((item, index) => {
      // Handle clicks on results without URLs (prevent default anchor behavior)
      const href = item.getAttribute('href');
      if (href === '#') {
        item.addEventListener('click', (e) => {
          e.preventDefault();
        });
      }

      item.addEventListener('mouseenter', () => {
        this.activeIndex = index;
        this.updateActiveResult();
      });
    });

    // Image load/error handlers
    const images = this.resultsContainer?.querySelectorAll('.modal-result-image');
    images?.forEach((img) => {
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

  private renderEmptyState(): string {
    return `
      <div class="modal-empty">
        <svg class="modal-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"></circle>
          <path d="m21 21-4.35-4.35"></path>
        </svg>
        <div class="modal-empty-description">Start typing to search</div>
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
    this.loadingMessageIndex = Math.floor(Math.random() * LOADING_MESSAGES.length);

    this.resultsContainer.innerHTML = `
      <div class="modal-loading">
        <div class="loading" aria-label="Loading"></div>
        <div class="loading-text loading-text-animate">${LOADING_MESSAGES[this.loadingMessageIndex]}</div>
      </div>
    `;

    if (this.footerCount) {
      this.footerCount.textContent = LOADING_MESSAGES[this.loadingMessageIndex];
    }

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
      if (this.footerCount) {
        this.footerCount.textContent = LOADING_MESSAGES[this.loadingMessageIndex];
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

    this.resultsContainer.innerHTML = `
      <div class="modal-empty">
        <svg class="modal-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <div class="modal-empty-title">No results found</div>
        <div class="modal-empty-description">No results for "${escapeHTML(query)}"</div>
      </div>
    `;

    if (this.footerCount) {
      this.footerCount.textContent = '0 results';
    }

    if (this.inputElement) {
      this.inputElement.setAttribute('aria-expanded', 'false');
    }
  }

  private showErrorState(message: string): void {
    this.clearLoadingInterval();
    if (!this.resultsContainer) return;

    this.resultsContainer.innerHTML = `
      <div class="error">
        <strong>Error:</strong> ${escapeHTML(message)}
      </div>
    `;

    if (this.footerCount) {
      this.footerCount.textContent = 'Error';
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
    };
    this.savedHtmlOverflow = document.documentElement.style.overflow;

    // Apply scroll lock styles to both html and body for cross-browser support
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

    // Clear handler references
    this.handleInputChange = null;
    this.handleInputKeydown = null;
    this.handleBackdropClick = null;

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
