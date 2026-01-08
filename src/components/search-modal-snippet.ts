/**
 * Search Modal Snippet
 * A modal combobox search component with keyboard navigation
 * Opens with Cmd/Ctrl+K shortcut by default
 */

import type { Client } from '../api/index.ts';
import { modalStyles } from '../styles/modal.ts';
import { baseStyles } from '../styles/theme.ts';
import type { SearchResult, SearchSnippetProps } from '../types/index.ts';
import {
  createClient,
  createCustomEvent,
  debounce,
  escapeHTML,
  parseAttribute,
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
  private isLoading = false;
  private results: SearchResult[] = [];
  private activeIndex = -1;
  private debouncedSearch: ((query: string) => void) | null = null;

  // Event handler references for cleanup
  private handleGlobalKeydown: ((e: KeyboardEvent) => void) | null = null;
  private handleInputChange: ((e: Event) => void) | null = null;
  private handleInputKeydown: ((e: KeyboardEvent) => void) | null = null;
  private handleBackdropClick: ((e: MouseEvent) => void) | null = null;

  static get observedAttributes(): string[] {
    return [
      'api-url',
      'placeholder',
      'max-results',
      'theme',
      'shortcut',
      'debounce-ms',
      'hide-branding',
    ];
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
      hideBranding: this.hasAttribute('hide-branding'),
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
      : `<div class="powered-by-inline">
          Powered by <a href="https://ai.cloudflare.com" target="_blank" rel="noopener noreferrer">Cloudflare AI Search</a>
        </div>`;

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
          <div class="modal-shortcut-hint">
            <kbd class="modal-kbd">Esc</kbd>
          </div>
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

    // Navigate to URL if present
    if (result.url) {
      window.location.href = result.url;
    }

    this.close();
  }

  private async performSearch(query: string): Promise<void> {
    if (this.isLoading || !this.client) return;

    this.isLoading = true;
    this.showLoadingState();

    try {
      const results = await this.client.search(query, { streaming: false });
      const props = this.getProps();
      this.results = results.slice(0, props.maxResults || 10);
      this.activeIndex = this.results.length > 0 ? 0 : -1;
      this.displayResults(this.results, query);
    } catch (error) {
      this.showErrorState((error as Error).message);
    } finally {
      this.isLoading = false;
    }
  }

  private displayResults(results: SearchResult[], query: string): void {
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
    return `
      <div 
        class="modal-result-item${index === this.activeIndex ? ' active' : ''}" 
        role="option" 
        id="result-${index}"
        aria-selected="${index === this.activeIndex}"
        tabindex="-1"
        data-index="${index}"
        data-url="${escapeHTML(result.url || '')}"
      >
        <div class="modal-result-title">${escapeHTML(result.title || '')}</div>
        ${result.description ? `<div class="modal-result-description">${escapeHTML(result.description)}</div>` : ''}
        ${result.url ? `<a href="${escapeHTML(result.url)}" class="modal-result-url" tabindex="-1">${escapeHTML(result.url)}</a>` : ''}
      </div>
    `;
  }

  private attachResultHandlers(): void {
    const items = this.resultsContainer?.querySelectorAll('.modal-result-item');
    if (!items) return;

    items.forEach((item, index) => {
      item.addEventListener('click', (e) => {
        // Don't navigate if clicking the URL link directly
        if ((e.target as HTMLElement).classList.contains('modal-result-url')) {
          return;
        }
        this.activeIndex = index;
        this.selectActiveResult();
      });

      item.addEventListener('mouseenter', () => {
        this.activeIndex = index;
        this.updateActiveResult();
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
        <div class="modal-empty-title">Search</div>
        <div class="modal-empty-description">Start typing to search</div>
      </div>
    `;
  }

  private showEmptyState(): void {
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

    this.resultsContainer.innerHTML = `
      <div class="modal-loading">
        <div class="loading" aria-label="Loading"></div>
        <div>Searching...</div>
      </div>
    `;

    if (this.footerCount) {
      this.footerCount.textContent = 'Searching...';
    }
  }

  private showNoResultsState(query: string): void {
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

  private cleanup(): void {
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

    // Prevent body scroll
    document.body.style.overflow = 'hidden';

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
    document.body.style.overflow = '';

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
