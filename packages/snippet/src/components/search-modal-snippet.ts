/**
 * Search Modal Snippet
 * A lightweight host that loads the modal implementation on first use.
 */

import type { Translations } from '../i18n/index.ts';
import type { SearchResult, SearchSnippetProps } from '../types/index.ts';

const COMPONENT_NAME = 'search-modal-snippet';

export interface SearchModalProps extends SearchSnippetProps {
  /** Keyboard shortcut key (default: 'k') */
  shortcut?: string;
  /** Whether to use meta key (Cmd on Mac) or ctrl key */
  useMetaKey?: boolean;
}

type SearchModalImplementation =
  import('./search-modal-implementation.ts').SearchModalImplementation;

function createCustomEvent<T>(name: string, detail: T): CustomEvent<T> {
  return new CustomEvent(name, {
    detail,
    bubbles: true,
    composed: true,
    cancelable: true,
  });
}

export class SearchModalSnippet extends HTMLElement {
  private shadow: ShadowRoot;
  private implementation: SearchModalImplementation | null = null;
  private implementationPromise: Promise<SearchModalImplementation | null> | null = null;
  private connectionGeneration = 0;
  private desiredOpen = false;
  private translationsOverride: Translations | null = null;
  private handleGlobalKeydown: ((event: KeyboardEvent) => void) | null = null;

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
    this.connectionGeneration += 1;
    this.attachGlobalKeyboardShortcut();
    this.dispatchEvent(createCustomEvent('ready', undefined));
  }

  disconnectedCallback(): void {
    this.connectionGeneration += 1;
    this.removeGlobalKeyboardShortcut();
    this.implementation?.cleanup();
    this.implementation = null;
    this.implementationPromise = null;
    this.desiredOpen = false;
    this.shadow.innerHTML = '';
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue) return;
    if ((name === 'shortcut' || name === 'use-meta-key') && this.isConnected) {
      this.attachGlobalKeyboardShortcut();
    }
    this.implementation?.attributeChangedCallback(name, oldValue, newValue);
  }

  public get translations(): Translations | null {
    return this.translationsOverride;
  }

  public set translations(value: Translations | null | undefined) {
    this.translationsOverride = value ?? null;
    this.implementation?.setTranslations(this.translationsOverride);
  }

  private attachGlobalKeyboardShortcut(): void {
    this.removeGlobalKeyboardShortcut();
    const shortcutKey = (this.getAttribute('shortcut') ?? 'k').toLowerCase();
    const useMetaKey = this.getAttribute('use-meta-key') !== 'false';

    this.handleGlobalKeydown = (event: KeyboardEvent) => {
      const modifierPressed = useMetaKey ? event.metaKey || event.ctrlKey : event.ctrlKey;
      if (modifierPressed && event.key.toLowerCase() === shortcutKey && !this.isModalOpen()) {
        event.preventDefault();
        this.open();
      }
    };
    document.addEventListener('keydown', this.handleGlobalKeydown);
  }

  private removeGlobalKeyboardShortcut(): void {
    if (this.handleGlobalKeydown) {
      document.removeEventListener('keydown', this.handleGlobalKeydown);
      this.handleGlobalKeydown = null;
    }
  }

  private ensureImplementation(): Promise<SearchModalImplementation | null> {
    if (this.implementation) return Promise.resolve(this.implementation);
    if (this.implementationPromise) return this.implementationPromise;

    const generation = this.connectionGeneration;
    const loading = import('./search-modal-implementation.ts')
      .then(({ SearchModalImplementation }) => {
        if (!this.isConnected || generation !== this.connectionGeneration) return null;

        const implementation = new SearchModalImplementation(
          this,
          this.shadow,
          this.translationsOverride,
          (isOpen) => {
            if (this.implementation === implementation) {
              this.desiredOpen = isOpen;
            }
          }
        );
        if (!this.isConnected || generation !== this.connectionGeneration) {
          implementation.cleanup();
          return null;
        }

        this.implementation = implementation;
        if (this.desiredOpen) implementation.open();
        return implementation;
      })
      .catch((error: unknown) => {
        if (generation === this.connectionGeneration) {
          this.desiredOpen = false;
          console.error('SearchModalSnippet:', error);
        }
        return null;
      })
      .finally(() => {
        if (this.implementationPromise === loading) {
          this.implementationPromise = null;
        }
      });

    this.implementationPromise = loading;
    return loading;
  }

  public open(): void {
    this.desiredOpen = true;
    if (this.implementation) {
      this.implementation.open();
      return;
    }
    void this.ensureImplementation();
  }

  public close(): void {
    this.desiredOpen = false;
    this.implementation?.close();
  }

  public toggle(): void {
    if (this.isModalOpen()) {
      this.close();
    } else {
      this.open();
    }
  }

  public async search(query: string): Promise<void> {
    this.desiredOpen = true;
    const generation = this.connectionGeneration;
    const implementation = await this.ensureImplementation();
    if (
      implementation &&
      this.isConnected &&
      generation === this.connectionGeneration &&
      this.desiredOpen
    ) {
      await implementation.search(query);
    }
  }

  public getResults(): SearchResult[] {
    return this.implementation?.getResults() ?? [];
  }

  public isModalOpen(): boolean {
    return this.implementation?.isModalOpen() ?? this.desiredOpen;
  }
}

if (!customElements.get(COMPONENT_NAME)) {
  customElements.define(COMPONENT_NAME, SearchModalSnippet);
}
