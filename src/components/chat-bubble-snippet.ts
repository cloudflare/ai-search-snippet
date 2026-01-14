/**
 * Chat Bubble Snippet
 * A floating chat widget that expands from a bubble button
 * Fixed position in bottom-right corner
 */

import type { Client } from '../api/index.ts';
import { chatStyles } from '../styles/chat.ts';
import { baseStyles } from '../styles/theme.ts';
import type { SearchSnippetProps } from '../types/index.ts';
import {
  createClient,
  createCustomEvent,
  parseAttribute,
  parseBooleanAttribute,
} from '../utils/index.ts';
import { POWERED_BY_BRANDING } from '../constants.ts';
import type { Message } from './chat-view.ts';
import { ChatView } from './chat-view.ts';

const COMPONENT_NAME = 'chat-bubble-snippet';

export class ChatBubbleSnippet extends HTMLElement {
  private shadow: ShadowRoot;
  private client: Client | null = null;
  private chatView: ChatView | null = null;
  private container: HTMLElement | null = null;
  private isExpanded = false;
  private isMinimized = false;

  // Event handler references for cleanup
  private handleBubbleClick: (() => void) | null = null;
  private handleCloseClick: (() => void) | null = null;
  private handleMinimizeClick: (() => void) | null = null;
  private handleClearClick: (() => void) | null = null;

  static get observedAttributes(): string[] {
    return ['api-url', 'placeholder', 'theme', 'hide-branding'];
  }

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    this.render();
    this.initializeClient();
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
      this.updateTheme(newValue);
    }
  }

  private getProps(): SearchSnippetProps {
    return {
      apiUrl: parseAttribute(this.getAttribute('api-url'), 'http://localhost:3000'),
      placeholder: parseAttribute(this.getAttribute('placeholder'), 'Type a message...'),
      theme: parseAttribute(this.getAttribute('theme'), 'auto') as 'light' | 'dark' | 'auto',
      hideBranding: parseBooleanAttribute(this.getAttribute('hide-branding'), false),
    };
  }

  private initializeClient(): void {
    const props = this.getProps();

    if (!props.apiUrl) {
      console.error('ChatBubbleSnippet: api-url attribute is required');
      return;
    }

    try {
      this.client = createClient(props.apiUrl);
    } catch (error) {
      console.error('ChatBubbleSnippet:', error);
    }
  }

  private render(): void {
    const style = document.createElement('style');
    style.textContent = `${baseStyles}\n${chatStyles}\n${this.getBubbleStyles()}`;

    this.container = document.createElement('div');
    this.container.className = 'chat-bubble-widget';
    this.container.innerHTML = this.getBaseHTML();

    this.shadow.innerHTML = '';
    this.shadow.appendChild(style);
    this.shadow.appendChild(this.container);

    this.attachEventListeners();
  }

  private getBubbleStyles(): string {
    return `
      .chat-bubble-widget {
        position: var(--chat-bubble-position);
        bottom: var(--chat-bubble-button-bottom);
        right: var(--chat-bubble-button-right);
        z-index: var(--chat-bubble-button-z-index);
        font-family: var(--search-snippet-font-family);
        font-size: var(--search-snippet-font-size-base);
      }

      .bubble-button {
        width: var(--chat-bubble-button-size);
        height: var(--chat-bubble-button-size);
        border-radius: var(--chat-bubble-button-radius);
        background: var(--search-snippet-primary-color);
        border: none;
        cursor: pointer;
        box-shadow: var(--chat-bubble-button-shadow);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.3s ease;
        position: relative;
      }

      .bubble-button:hover {
        background: var(--search-snippet-primary-hover);
        transform: scale(1.05);
      }

      .bubble-button svg {
        width: var(--chat-bubble-button-icon-size);
        height: var(--chat-bubble-button-icon-size);
        color: var(--chat-bubble-button-icon-color);
      }

      .bubble-button.hidden {
        opacity: 0;
        pointer-events: none;
        transform: scale(0);
      }

      .chat-window {
        position: absolute;
        bottom: 0;
        right: 0;
        width: 380px;
        height: 500px;
        background: var(--search-snippet-background);
        border-radius: var(--search-snippet-border-radius);
        box-shadow: var(--chat-bubble-window-shadow);
        display: flex;
        flex-direction: column;
        opacity: 0;
        transform: scale(0.8) translateY(20px);
        transform-origin: bottom right;
        transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        pointer-events: none;
        overflow: hidden;
        border: var(--search-snippet-border-width) solid var(--search-snippet-border-color);
      }

      .chat-window.expanded {
        opacity: 1;
        transform: scale(1) translateY(0);
        pointer-events: auto;
      }

      .chat-window.minimized {
        height: 58px;
        overflow: hidden;
      }

      .chat-header {
        background: var(--search-snippet-surface);
        padding: var(--search-snippet-spacing-md);
        border-bottom: var(--search-snippet-border-width) solid var(--search-snippet-border-color);
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-shrink: 0;
      }

      .chat-header-title {
        font-weight: var(--search-snippet-font-weight-bold);
        color: var(--search-snippet-text-color);
        display: flex;
        align-items: center;
        gap: var(--search-snippet-spacing-sm);
        font-size: var(--search-snippet-font-size-lg);
      }

      .chat-header-title svg {
        width: 20px;
        height: 20px;
      }

      .chat-header-actions {
        display: flex;
        gap: var(--search-snippet-spacing-xs);
      }

      .icon-button {
        width: 32px;
        height: 32px;
        border: none;
        background: transparent;
        border-radius: var(--search-snippet-border-radius);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background var(--search-snippet-transition-fast);
        color: var(--search-snippet-text-color);
      }

      .icon-button:hover {
        background: var(--search-snippet-hover-background);
      }

      .icon-button svg {
        width: 18px;
        height: 18px;
      }

      .chat-content {
        flex: 1;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }

      @media (max-width: 480px) {
        .chat-window {
          width: calc(100vw - 40px);
          max-width: 400px;
        }
      }
    `;
  }

  private getBaseHTML(): string {
    const props = this.getProps();
    const brandingHTML = props.hideBranding
      ? ''
      : `<div class="powered-by">${POWERED_BY_BRANDING}</div>`;

    return `
      <button class="bubble-button" aria-label="Open chat">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
      </button>
      <div class="chat-window">
        <div class="chat-header">
          <div class="chat-header-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
            <span>Chat</span>
          </div>
          <div class="chat-header-actions">
            <button class="icon-button clear-button" aria-label="Clear history">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
            <button class="icon-button minimize-button" aria-label="Minimize">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </button>
            <button class="icon-button close-button" aria-label="Close">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>
        <div class="chat-content"></div>
        ${brandingHTML}
      </div>
    `;
  }

  private attachEventListeners(): void {
    const bubbleButton = this.shadow.querySelector('.bubble-button');
    const closeButton = this.shadow.querySelector('.close-button');
    const minimizeButton = this.shadow.querySelector('.minimize-button');
    const clearButton = this.shadow.querySelector('.clear-button');

    this.handleBubbleClick = () => this.toggleChat();
    this.handleCloseClick = () => this.closeChat();
    this.handleMinimizeClick = () => this.toggleMinimize();
    this.handleClearClick = () => this.clearChat();

    bubbleButton?.addEventListener('click', this.handleBubbleClick);
    closeButton?.addEventListener('click', this.handleCloseClick);
    minimizeButton?.addEventListener('click', this.handleMinimizeClick);
    clearButton?.addEventListener('click', this.handleClearClick);
  }

  private removeEventListeners(): void {
    const bubbleButton = this.shadow.querySelector('.bubble-button');
    const closeButton = this.shadow.querySelector('.close-button');
    const minimizeButton = this.shadow.querySelector('.minimize-button');
    const clearButton = this.shadow.querySelector('.clear-button');

    if (this.handleBubbleClick) {
      bubbleButton?.removeEventListener('click', this.handleBubbleClick);
    }
    if (this.handleCloseClick) {
      closeButton?.removeEventListener('click', this.handleCloseClick);
    }
    if (this.handleMinimizeClick) {
      minimizeButton?.removeEventListener('click', this.handleMinimizeClick);
    }
    if (this.handleClearClick) {
      clearButton?.removeEventListener('click', this.handleClearClick);
    }

    // Clear handler references
    this.handleBubbleClick = null;
    this.handleCloseClick = null;
    this.handleMinimizeClick = null;
    this.handleClearClick = null;
  }

  private toggleChat(): void {
    this.isExpanded = !this.isExpanded;
    const bubbleButton = this.shadow.querySelector('.bubble-button');
    const chatWindow = this.shadow.querySelector('.chat-window');

    if (this.isExpanded) {
      bubbleButton?.classList.add('hidden');
      chatWindow?.classList.add('expanded');
      this.initializeChatView();
    } else {
      bubbleButton?.classList.remove('hidden');
      chatWindow?.classList.remove('expanded');
    }
  }

  private closeChat(): void {
    this.isExpanded = false;
    this.isMinimized = false;
    const bubbleButton = this.shadow.querySelector('.bubble-button');
    const chatWindow = this.shadow.querySelector('.chat-window');

    bubbleButton?.classList.remove('hidden');
    chatWindow?.classList.remove('expanded', 'minimized');
  }

  private toggleMinimize(): void {
    this.isMinimized = !this.isMinimized;
    const chatWindow = this.shadow.querySelector('.chat-window');

    if (this.isMinimized) {
      chatWindow?.classList.add('minimized');
    } else {
      chatWindow?.classList.remove('minimized');
    }
  }

  private initializeChatView(): void {
    if (this.chatView || !this.client) return;

    const chatContent = this.shadow.querySelector('.chat-content') as HTMLElement;
    if (!chatContent) return;

    const props = this.getProps();
    this.chatView = new ChatView(chatContent, this.client, props);
  }

  private updateTheme(theme: string | null): void {
    // CSS :host([theme]) selectors handle theming automatically
    // For 'auto' mode, remove the attribute to let @media (prefers-color-scheme) work
    const validTheme = theme === 'light' || theme === 'dark' ? theme : null;

    if (
      validTheme === null &&
      this.hasAttribute('theme') &&
      this.getAttribute('theme') !== 'auto'
    ) {
      this.removeAttribute('theme');
    }
  }

  private cleanup(): void {
    this.removeEventListeners();

    if (this.client) {
      this.client.cancelAllRequests();
    }

    if (this.chatView) {
      this.chatView.destroy();
    }
  }

  // Public API
  public clearChat(): void {
    this.chatView?.clearMessages();
  }

  public async sendMessage(content: string): Promise<void> {
    if (this.chatView) {
      await this.chatView.sendMessage(content);
    }
  }

  public getMessages(): Message[] {
    return this.chatView?.getMessages() || [];
  }
}

// Register the custom element
if (!customElements.get(COMPONENT_NAME)) {
  customElements.define(COMPONENT_NAME, ChatBubbleSnippet);
}
