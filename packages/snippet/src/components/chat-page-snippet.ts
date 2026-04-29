/**
 * Chat Page Snippet
 * A full-page chat interface with history support
 */

import type { AISearchClient } from '../api/ai-search.ts';
import { POWERED_BY_BRANDING } from '../constants.ts';
import { mergeTranslations, parseTranslationsAttribute, type Translations } from '../i18n/index.ts';
import { chatStyles } from '../styles/chat.ts';
import { baseStyles } from '../styles/theme.ts';
import type { SearchSnippetProps } from '../types/index.ts';
import {
  createClient,
  createCustomEvent,
  escapeHTML as escapeHTMLUtil,
  parseAttribute,
  parseBooleanAttribute,
  parseChatQueryRewriteAttribute,
} from '../utils/index.ts';
import type { Message } from './chat-view.ts';
import { ChatView } from './chat-view.ts';

const COMPONENT_NAME = 'chat-page-snippet';
const STORAGE_KEY = 'chat-page-sessions';

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  /**
   * True while the session still carries the default (auto-generated) title.
   * Set to false once auto-titled from the first user message, or explicitly
   * renamed. Absent on sessions persisted before this field existed; those
   * are treated as having a default title iff the title string still matches
   * the current `newChatButton` translation (legacy behavior).
   */
  titleIsDefault?: boolean;
}

export class ChatPageSnippet extends HTMLElement {
  private shadow: ShadowRoot;
  private client: AISearchClient | null = null;
  private chatView: ChatView | null = null;
  private container: HTMLElement | null = null;
  private sessions: ChatSession[] = [];
  private currentSessionId: string | null = null;
  private sidebarCollapsed = false;
  private translationsOverride: Translations | null = null;
  private resolvedTranslations = mergeTranslations(null);

  private chatQueryRewriteOverride: SearchSnippetProps['chatQueryRewrite'] | null = null;

  // Event handler references for cleanup
  private handleClearClick: (() => void) | null = null;
  private handleNewChatClick: (() => void) | null = null;
  private handleToggleSidebarClick: (() => void) | null = null;
  private handleChatListClick: ((e: Event) => void) | null = null;
  private handleMessageEvent: (() => void) | null = null;

  static get observedAttributes() {
    return [
      'api-url',
      'placeholder',
      'theme',
      'hide-branding',
      'translations',
      'chat-query-rewrite',
    ] as const;
  }

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: 'open' });
    this.loadSessions();
  }

  connectedCallback(): void {
    this.syncTranslationsFromAttribute();
    this.render();
    this.initializeClient();
    this.setupView();
    this.dispatchEvent(createCustomEvent('ready', undefined));
  }

  disconnectedCallback(): void {
    this.saveCurrentSession();
    this.cleanup();
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue) return;

    if (name === 'api-url') {
      this.initializeClient();
      this.setupView();
    } else if (name === 'theme') {
      // Theme changes are handled automatically by CSS :host([theme]) selectors
      this.updateTheme(newValue);
    } else if (name === 'translations') {
      this.syncTranslationsFromAttribute();
      if (this.isConnected) {
        this.rerenderAfterTranslationsChange();
      }
    } else if (name === 'chat-query-rewrite') {
      // No re-render needed: the value is read fresh on each `sendMessage`
      // via `getProps()`.
    }
  }

  /**
   * Get the current translations object.
   */
  public get translations(): Translations | null {
    return this.translationsOverride;
  }

  /**
   * Override AI Search query rewriting on subsequent chat turns. Setting
   * `null` falls back to parsing the `chat-query-rewrite` attribute.
   */
  public get chatQueryRewrite(): SearchSnippetProps['chatQueryRewrite'] | null {
    return this.chatQueryRewriteOverride;
  }

  public set chatQueryRewrite(value: SearchSnippetProps['chatQueryRewrite'] | null | undefined) {
    this.chatQueryRewriteOverride = value ?? null;
    if (this.chatView) {
      this.chatView.setProps(this.getProps());
    }
  }

  /**
   * Override any user-facing string. Omitted keys fall back to English defaults.
   */
  public set translations(value: Translations | null | undefined) {
    this.translationsOverride = value ?? null;
    this.resolvedTranslations = mergeTranslations(this.translationsOverride);
    this.refreshDefaultSessionTitles();
    if (this.isConnected) {
      this.rerenderAfterTranslationsChange();
    }
  }

  private syncTranslationsFromAttribute(): void {
    if (this.translationsOverride) {
      this.resolvedTranslations = mergeTranslations(this.translationsOverride);
      this.refreshDefaultSessionTitles();
      return;
    }
    const parsed = parseTranslationsAttribute(this.getAttribute('translations'), 'ChatPageSnippet');
    this.resolvedTranslations = mergeTranslations(parsed);
    this.refreshDefaultSessionTitles();
  }

  /**
   * Replace the stored title of any still-default-titled session with the
   * current `newChatButton` translation, so the sidebar reflects the active
   * language after a translations change.
   */
  private refreshDefaultSessionTitles(): void {
    if (this.sessions.length === 0) return;
    const current = this.resolvedTranslations.newChatButton;
    let changed = false;
    for (const session of this.sessions) {
      if (session.titleIsDefault && session.title !== current) {
        session.title = current;
        changed = true;
      }
    }
    if (changed) this.saveSessions();
  }

  private rerenderAfterTranslationsChange(): void {
    // Re-render the sidebar + header shell so their strings update. We take
    // care to preserve the existing ChatView (and thus any in-flight stream
    // and streaming UI state) by re-parenting its container into the new
    // shell rather than destroying the view.
    this.removeEventListeners();

    // Detach the existing chat container from the old shell so render() does
    // not discard it. If no chat view exists yet (e.g. missing api-url),
    // fall through to a plain re-render.
    const previousChatContent = this.chatView
      ? (this.shadow.querySelector('.container') as HTMLElement | null)
      : null;
    if (previousChatContent?.parentNode) {
      previousChatContent.parentNode.removeChild(previousChatContent);
    }

    this.render();
    this.attachEventListeners();
    this.renderChatList();

    const newChatSlot = this.shadow.querySelector('.chat-page-content') as HTMLElement | null;
    if (this.chatView && previousChatContent && newChatSlot) {
      // Replace the freshly-rendered empty `.container` with the preserved one.
      const placeholder = newChatSlot.querySelector('.container');
      if (placeholder) {
        newChatSlot.replaceChild(previousChatContent, placeholder);
      } else {
        newChatSlot.appendChild(previousChatContent);
      }
      // Update translations/placeholder on the live view.
      this.chatView.setProps(this.getProps());
      // Re-wire the message listener on the (preserved) container.
      this.handleMessageEvent = () => {
        this.saveCurrentSession();
        this.updateSessionTitle();
        this.renderChatList();
      };
      previousChatContent.addEventListener('message', this.handleMessageEvent);
    }
  }

  private getProps(): SearchSnippetProps {
    const t = this.resolvedTranslations;
    return {
      apiUrl: parseAttribute(this.getAttribute('api-url'), ''),
      placeholder: parseAttribute(this.getAttribute('placeholder'), t.chatPlaceholder),
      theme: parseAttribute(this.getAttribute('theme'), 'auto') as 'light' | 'dark' | 'auto',
      hideBranding: parseBooleanAttribute(this.getAttribute('hide-branding'), false),
      translations: this.translationsOverride ?? undefined,
      chatQueryRewrite: this.resolveChatQueryRewrite(),
    };
  }

  private resolveChatQueryRewrite(): SearchSnippetProps['chatQueryRewrite'] {
    if (this.chatQueryRewriteOverride !== null) {
      return this.chatQueryRewriteOverride;
    }
    return parseChatQueryRewriteAttribute(
      this.getAttribute('chat-query-rewrite'),
      'ChatPageSnippet'
    );
  }

  private initializeClient(): void {
    const props = this.getProps();

    if (!props.apiUrl) {
      console.error('ChatPageSnippet: api-url attribute is required');
      this.client = null;
      return;
    }

    try {
      this.client = createClient(props.apiUrl);
    } catch (error) {
      console.error('ChatPageSnippet:', error);
    }
  }

  private render(): void {
    const style = document.createElement('style');
    style.textContent = `${baseStyles}\n${chatStyles}\n${this.getPageStyles()}`;

    this.container = document.createElement('div');
    this.container.className = 'chat-page-container';
    this.container.innerHTML = this.getBaseHTML();

    this.shadow.innerHTML = '';
    this.shadow.appendChild(style);
    this.shadow.appendChild(this.container);

    this.attachEventListeners();
  }

  private getPageStyles(): string {
    return `
      :host {
        display: block;
        width: 100%;
        height: 100vh;
      }

      .chat-page-container {
        display: flex;
        height: 100%;
        background: var(--search-snippet-background);
      }

      /* Sidebar styles */
      .chat-sidebar {
        width: 280px;
        min-width: 280px;
        background: var(--search-snippet-surface);
        border-right: var(--search-snippet-border-width) solid var(--search-snippet-border-color);
        display: flex;
        flex-direction: column;
        transition: var(--search-snippet-transition);
        overflow: hidden;
      }

      .chat-sidebar.collapsed {
        width: 0;
        min-width: 0;
        border-right: none;
      }

      .sidebar-header {
        padding: var(--search-snippet-spacing-lg);
        border-bottom: var(--search-snippet-border-width) solid var(--search-snippet-border-color);
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-shrink: 0;
        height: 69px;
      }

      .sidebar-title {
        font-size: var(--search-snippet-font-size-lg);
        font-weight: var(--search-snippet-font-weight-bold);
        color: var(--search-snippet-text-color);
      }

      .new-chat-button {
        width: 100%;
        height: var(--search-snippet-button-height);
        margin: var(--search-snippet-spacing-md) var(--search-snippet-spacing-lg);
        padding: 0 var(--search-snippet-spacing-lg);
        font-family: var(--search-snippet-font-family);
        font-size: var(--search-snippet-font-size-base);
        font-weight: var(--search-snippet-font-weight-medium);
        color: #fff;
        background: var(--search-snippet-primary-color);
        border: none;
        border-radius: var(--search-snippet-border-radius);
        cursor: pointer;
        outline: none;
        transition: var(--search-snippet-transition);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: var(--search-snippet-spacing-sm);
        box-sizing: border-box;
        width: calc(100% - var(--search-snippet-spacing-lg) * 2);
      }

      .new-chat-button:hover {
        opacity: 0.9;
      }

      .new-chat-button svg {
        width: 16px;
        height: 16px;
      }

      .chat-list {
        flex: 1;
        overflow-y: auto;
        padding: var(--search-snippet-spacing-sm);
      }

      .chat-list-item {
        display: flex;
        align-items: center;
        padding: var(--search-snippet-spacing-md) var(--search-snippet-spacing-lg);
        margin-bottom: var(--search-snippet-spacing-xs);
        border-radius: var(--search-snippet-border-radius);
        cursor: pointer;
        transition: var(--search-snippet-transition);
        gap: var(--search-snippet-spacing-sm);
      }

      .chat-list-item:hover {
        background: var(--search-snippet-hover-background);
      }

      .chat-list-item.active {
        background: var(--search-snippet-hover-background);
        border: var(--search-snippet-border-width) solid var(--search-snippet-border-color);
      }

      .chat-list-item-content {
        flex: 1;
        min-width: 0;
      }

      .chat-list-item-title {
        font-size: var(--search-snippet-font-size-base);
        font-weight: var(--search-snippet-font-weight-medium);
        color: var(--search-snippet-text-color);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .chat-list-item-date {
        font-size: var(--search-snippet-font-size-sm);
        color: var(--search-snippet-text-secondary);
        margin-top: 2px;
      }

      .chat-list-item-delete {
        opacity: 0;
        background: none;
        border: none;
        padding: var(--search-snippet-spacing-xs);
        cursor: pointer;
        color: var(--search-snippet-text-secondary);
        border-radius: var(--search-snippet-border-radius-sm);
        transition: var(--search-snippet-transition);
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .chat-list-item:hover .chat-list-item-delete {
        opacity: 1;
      }

      .chat-list-item-delete:hover {
        background: var(--search-snippet-error-background, rgba(239, 68, 68, 0.1));
        color: var(--search-snippet-error-color, #ef4444);
      }

      .chat-list-item-delete svg {
        width: 14px;
        height: 14px;
      }

      .chat-list-empty {
        padding: var(--search-snippet-spacing-xl);
        text-align: center;
        color: var(--search-snippet-text-secondary);
        font-size: var(--search-snippet-font-size-sm);
      }

      /* Main content area */
      .chat-main {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-width: 0;
      }

      .chat-page-header {
        background: var(--search-snippet-surface);
        padding: var(--search-snippet-spacing-lg);
        border-bottom: var(--search-snippet-border-width) solid var(--search-snippet-border-color);
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-shrink: 0;
      }

      .chat-page-header-left {
        display: flex;
        align-items: center;
        gap: var(--search-snippet-spacing-md);
      }

      .toggle-sidebar-button {
        width: 36px;
        height: 36px;
        padding: 0;
        font-family: var(--search-snippet-font-family);
        color: var(--search-snippet-text-color);
        background: var(--search-snippet-background);
        border: var(--search-snippet-border-width) solid var(--search-snippet-border-color);
        border-radius: var(--search-snippet-border-radius);
        cursor: pointer;
        outline: none;
        transition: var(--search-snippet-transition);
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      .toggle-sidebar-button:hover {
        background: var(--search-snippet-hover-background);
      }

      .toggle-sidebar-button svg {
        width: 18px;
        height: 18px;
      }

      .chat-page-header-title {
        font-size: var(--search-snippet-font-size-xl);
        font-weight: var(--search-snippet-font-weight-bold);
        color: var(--search-snippet-text-color);
        display: flex;
        align-items: center;
        gap: var(--search-snippet-spacing-md);
      }

      .chat-page-header-title svg {
        width: 28px;
        height: 28px;
      }

      .chat-page-header-actions {
        display: flex;
        gap: var(--search-snippet-spacing-sm);
      }

      .header-button {
        height: var(--search-snippet-button-height);
        padding: 0 var(--search-snippet-spacing-lg);
        font-family: var(--search-snippet-font-family);
        font-size: var(--search-snippet-font-size-base);
        font-weight: var(--search-snippet-font-weight-medium);
        color: var(--search-snippet-text-color);
        background: var(--search-snippet-background);
        border: var(--search-snippet-border-width) solid var(--search-snippet-border-color);
        border-radius: var(--search-snippet-border-radius);
        cursor: pointer;
        outline: none;
        transition: var(--search-snippet-transition);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: var(--search-snippet-spacing-sm);
      }

      .header-button:hover {
        background: var(--search-snippet-hover-background);
      }

      .header-button svg {
        width: 16px;
        height: 16px;
      }

      .chat-page-content {
        flex: 1;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        width: 100%;
      }

      .container {
        border: none;
        box-shadow: none;
        height: 100%;
        width: 100%;
        background: var(--search-snippet-background);
        border-radius: 0;
      }
    `;
  }

  private getBaseHTML(): string {
    const props = this.getProps();
    const t = this.resolvedTranslations;
    const brandingHTML = props.hideBranding
      ? ''
      : `<div class="powered-by">${POWERED_BY_BRANDING}</div>`;

    return `
      <div class="chat-sidebar">
        <div class="sidebar-header">
          <span class="sidebar-title">${escapeHTMLUtil(t.historyTitle)}</span>
        </div>
        <button class="new-chat-button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 5v14M5 12h14"></path>
          </svg>
          ${escapeHTMLUtil(t.newChatButton)}
        </button>
        <div class="chat-list"></div>
        ${brandingHTML}
      </div>
      <div class="chat-main">
        <div class="chat-page-header">
          <div class="chat-page-header-left">
            <button class="toggle-sidebar-button" title="${escapeHTMLUtil(t.toggleSidebarTitle)}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 12h18M3 6h18M3 18h18"></path>
              </svg>
            </button>
            <div class="chat-page-header-title">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
              <span>${escapeHTMLUtil(t.chatTitle)}</span>
            </div>
          </div>
          <div class="chat-page-header-actions">
            <button class="header-button clear-button">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
              ${escapeHTMLUtil(t.clearChatButton)}
            </button>
          </div>
        </div>
        <div class="chat-page-content">
          <div class="container"></div>
        </div>
      </div>
    `;
  }

  private attachEventListeners(): void {
    const clearButton = this.shadow.querySelector('.clear-button');
    const newChatButton = this.shadow.querySelector('.new-chat-button');
    const toggleSidebarButton = this.shadow.querySelector('.toggle-sidebar-button');
    const chatList = this.shadow.querySelector('.chat-list');

    this.handleClearClick = () => this.clearCurrentChat();
    this.handleNewChatClick = () => this.createNewChat();
    this.handleToggleSidebarClick = () => this.toggleSidebar();
    this.handleChatListClick = (e: Event) => this.onChatListClick(e);

    clearButton?.addEventListener('click', this.handleClearClick);
    newChatButton?.addEventListener('click', this.handleNewChatClick);
    toggleSidebarButton?.addEventListener('click', this.handleToggleSidebarClick);
    chatList?.addEventListener('click', this.handleChatListClick);
  }

  private removeEventListeners(): void {
    const clearButton = this.shadow.querySelector('.clear-button');
    const newChatButton = this.shadow.querySelector('.new-chat-button');
    const toggleSidebarButton = this.shadow.querySelector('.toggle-sidebar-button');
    const chatList = this.shadow.querySelector('.chat-list');
    const chatContent = this.shadow.querySelector('.container') as HTMLElement;

    if (this.handleClearClick) {
      clearButton?.removeEventListener('click', this.handleClearClick);
    }
    if (this.handleNewChatClick) {
      newChatButton?.removeEventListener('click', this.handleNewChatClick);
    }
    if (this.handleToggleSidebarClick) {
      toggleSidebarButton?.removeEventListener('click', this.handleToggleSidebarClick);
    }
    if (this.handleChatListClick) {
      chatList?.removeEventListener('click', this.handleChatListClick);
    }
    if (this.handleMessageEvent && chatContent) {
      chatContent.removeEventListener('message', this.handleMessageEvent);
    }

    // Clear handler references
    this.handleClearClick = null;
    this.handleNewChatClick = null;
    this.handleToggleSidebarClick = null;
    this.handleChatListClick = null;
    this.handleMessageEvent = null;
  }

  private setupView(): void {
    const chatContent = this.shadow.querySelector('.container') as HTMLElement;

    if (!this.client) {
      if (chatContent) {
        const t = this.resolvedTranslations;
        chatContent.innerHTML = `
          <div style="padding: 16px; color: var(--search-snippet-error-color, #ef4444); font-family: var(--search-snippet-font-family, sans-serif); font-size: var(--search-snippet-font-size-base, 14px);">
            <strong>${escapeHTMLUtil(t.errorPrefix)}</strong> ${escapeHTMLUtil(t.missingApiUrlError)}
          </div>
        `;
      }
      return;
    }

    if (!chatContent) return;

    const props = this.getProps();
    this.chatView = new ChatView(chatContent, this.client, props);

    // Load current session or create new one
    if (this.sessions.length === 0) {
      this.createNewChat();
    } else {
      // Load the most recent session
      const lastSession = this.sessions[0];
      this.switchToSession(lastSession.id);
    }

    // Listen for new messages to save session
    this.handleMessageEvent = () => {
      this.saveCurrentSession();
      this.updateSessionTitle();
      this.renderChatList();
    };
    chatContent.addEventListener('message', this.handleMessageEvent);

    this.renderChatList();
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private loadSessions(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.sessions = JSON.parse(stored);
        // Sort by updatedAt descending
        this.sessions.sort((a, b) => b.updatedAt - a.updatedAt);
      }
    } catch (error) {
      console.error('Failed to load chat sessions:', error);
    }
  }

  private saveSessions(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.sessions));
    } catch (error) {
      console.error('Failed to save chat sessions:', error);
    }
  }

  private saveCurrentSession(): void {
    if (!this.currentSessionId || !this.chatView) return;

    const sessionIndex = this.sessions.findIndex((s) => s.id === this.currentSessionId);
    if (sessionIndex !== -1) {
      this.sessions[sessionIndex].messages = this.chatView.getMessages();
      this.sessions[sessionIndex].updatedAt = Date.now();
      this.saveSessions();
    }
  }

  private updateSessionTitle(): void {
    if (!this.currentSessionId) return;

    const session = this.sessions.find((s) => s.id === this.currentSessionId);
    if (!session || session.messages.length === 0) return;

    // New sessions created with this code set `titleIsDefault`. For legacy
    // sessions persisted before that field existed, fall back to comparing
    // against the current translation so behavior is unchanged in the common
    // case where the language hasn't shifted since the session was created.
    const hasDefaultTitle =
      session.titleIsDefault ?? session.title === this.resolvedTranslations.newChatButton;
    if (!hasDefaultTitle) return;

    const firstUserMessage = session.messages.find((m) => m.role === 'user');
    if (firstUserMessage) {
      session.title =
        firstUserMessage.content.slice(0, 50) + (firstUserMessage.content.length > 50 ? '...' : '');
      session.titleIsDefault = false;
      this.saveSessions();
    }
  }

  private createNewChat(): void {
    // Save current session first
    this.saveCurrentSession();

    const newSession: ChatSession = {
      id: this.generateSessionId(),
      title: this.resolvedTranslations.newChatButton,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      titleIsDefault: true,
    };

    this.sessions.unshift(newSession);
    this.currentSessionId = newSession.id;
    this.saveSessions();

    // Clear the chat view
    this.chatView?.clearMessages();
    this.renderChatList();
  }

  private switchToSession(sessionId: string): void {
    if (sessionId === this.currentSessionId) return;

    // Save current session first
    this.saveCurrentSession();

    const session = this.sessions.find((s) => s.id === sessionId);
    if (session && this.chatView) {
      this.currentSessionId = sessionId;
      this.chatView.setMessages(session.messages);
      this.renderChatList();
    }
  }

  private deleteSession(sessionId: string): void {
    const sessionIndex = this.sessions.findIndex((s) => s.id === sessionId);
    if (sessionIndex === -1) return;

    this.sessions.splice(sessionIndex, 1);
    this.saveSessions();

    // If we deleted the current session, switch to another or create new
    if (sessionId === this.currentSessionId) {
      if (this.sessions.length > 0) {
        this.switchToSession(this.sessions[0].id);
      } else {
        this.createNewChat();
      }
    }

    this.renderChatList();
  }

  private clearCurrentChat(): void {
    if (!this.currentSessionId) return;

    const session = this.sessions.find((s) => s.id === this.currentSessionId);
    if (session) {
      session.messages = [];
      session.title = this.resolvedTranslations.newChatButton;
      session.titleIsDefault = true;
      session.updatedAt = Date.now();
      this.saveSessions();
    }

    this.chatView?.clearMessages();
    this.renderChatList();
  }

  private toggleSidebar(): void {
    this.sidebarCollapsed = !this.sidebarCollapsed;
    const sidebar = this.shadow.querySelector('.chat-sidebar');
    sidebar?.classList.toggle('collapsed', this.sidebarCollapsed);
  }

  private onChatListClick(e: Event): void {
    const target = e.target as HTMLElement;

    // Handle delete button click
    const deleteButton = target.closest('.chat-list-item-delete');
    if (deleteButton) {
      e.stopPropagation();
      const sessionId = deleteButton.getAttribute('data-session-id');
      if (sessionId) {
        this.deleteSession(sessionId);
      }
      return;
    }

    // Handle chat item click
    const chatItem = target.closest('.chat-list-item');
    if (chatItem) {
      const sessionId = chatItem.getAttribute('data-session-id');
      if (sessionId) {
        this.switchToSession(sessionId);
      }
    }
  }

  private renderChatList(): void {
    const chatList = this.shadow.querySelector('.chat-list');
    if (!chatList) return;

    const t = this.resolvedTranslations;
    if (this.sessions.length === 0) {
      chatList.innerHTML = `<div class="chat-list-empty">${this.escapeHTML(t.noChatsYet)}</div>`;
      return;
    }

    chatList.innerHTML = this.sessions.map((session) => this.renderChatListItem(session)).join('');
  }

  private renderChatListItem(session: ChatSession): string {
    const isActive = session.id === this.currentSessionId;
    const date = this.formatDate(session.updatedAt);
    const deleteTitle = this.resolvedTranslations.deleteChatTitle;

    return `
      <div class="chat-list-item ${isActive ? 'active' : ''}" data-session-id="${session.id}">
        <div class="chat-list-item-content">
          <div class="chat-list-item-title">${this.escapeHTML(session.title)}</div>
          <div class="chat-list-item-date">${date}</div>
        </div>
        <button class="chat-list-item-delete" data-session-id="${session.id}" title="${this.escapeHTML(deleteTitle)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    `;
  }

  private formatDate(timestamp: number): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return this.resolvedTranslations.yesterday;
    } else if (diffDays < 7) {
      return date.toLocaleDateString(undefined, { weekday: 'long' });
    } else {
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }
  }

  private escapeHTML(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
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
    this.clearCurrentChat();
  }

  public async sendMessage(content: string): Promise<void> {
    if (this.chatView) {
      await this.chatView.sendMessage(content);
      this.saveCurrentSession();
    }
  }

  public getMessages(): Message[] {
    return this.chatView?.getMessages() || [];
  }

  public getSessions(): ChatSession[] {
    return [...this.sessions];
  }

  public getCurrentSession(): ChatSession | null {
    return this.sessions.find((s) => s.id === this.currentSessionId) || null;
  }
}

// Register the custom element
if (!customElements.get(COMPONENT_NAME)) {
  customElements.define(COMPONENT_NAME, ChatPageSnippet);
}
