/**
 * ChatView Component
 * Handles chat interface with streaming support
 */

import type { AISearchClient } from '../api/ai-search.ts';
import { mergeTranslations } from '../i18n/index.ts';
import type { SearchSnippetProps } from '../types/index.ts';
import {
  createCustomEvent,
  escapeHTML,
  formatTimestamp,
  generateId,
  LOADING_MESSAGE_INTERVAL_MS,
} from '../utils/index.ts';
import { markdownToHtml } from '../utils/markdown.ts';
export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}
/**
 * Pixel threshold below which we consider the user to still be reading the
 * latest message and auto-follow the stream. If they've scrolled further up,
 * we leave them alone.
 */
const BOTTOM_FOLLOW_THRESHOLD_PX = 64;

export class ChatView {
  private container: HTMLElement;
  private client: AISearchClient;
  private props: SearchSnippetProps;
  private translations: ReturnType<typeof mergeTranslations>;
  private inputElement: HTMLTextAreaElement | null = null;
  private messagesContainer: HTMLElement | null = null;
  private sendButton: HTMLButtonElement | null = null;
  private messages: Message[] = [];
  private isStreaming = false;
  private currentStreamingMessageId: string | null = null;
  private loadingMessageInterval: ReturnType<typeof setInterval> | null = null;
  private loadingMessageIndex = 0;
  private pendingScrollFrame: number | null = null;

  // Event handler references for cleanup
  private handleInputResize: ((e: Event) => void) | null = null;
  private handleInputKeydown: ((e: KeyboardEvent) => void) | null = null;
  private handleSendClick: (() => void) | null = null;

  constructor(container: HTMLElement, client: AISearchClient, props: SearchSnippetProps) {
    this.container = container;
    this.client = client;
    this.props = props;
    this.translations = mergeTranslations(props.translations);

    this.render();
    this.attachEventListeners();
  }

  /**
   * Render the chat interface
   */
  private render(): void {
    const t = this.translations;
    this.container.innerHTML = `
      <div class="chat-container">
        <div class="chat-messages">
          ${this.renderEmptyStateHTML()}
        </div>
        <div class="chat-input-area">
          <div class="chat-input-wrapper">
            <textarea
              class="chat-input"
              placeholder="${escapeHTML(this.props.placeholder || t.chatPlaceholder)}"
              aria-label="${escapeHTML(t.chatInputAriaLabel)}"
              style="height: 40px;"
              rows="1"
            ></textarea>
            <button class="button chat-send-button" aria-label="${escapeHTML(t.sendButtonAriaLabel)}">
              <span>${escapeHTML(t.sendButtonLabel)}</span>
            </button>
          </div>
        </div>
      </div>
    `;

    this.messagesContainer = this.container.querySelector('.chat-messages');
    this.inputElement = this.container.querySelector('.chat-input');
    this.sendButton = this.container.querySelector('.chat-send-button');
  }

  private renderEmptyStateHTML(): string {
    const t = this.translations;
    return `
      <div class="chat-empty">
        <svg class="chat-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
        <div class="chat-empty-title">${escapeHTML(t.chatEmptyTitle)}</div>
        <div class="chat-empty-description">
          ${escapeHTML(t.chatEmptyDescription)}
        </div>
      </div>
    `;
  }

  /**
   * Attach event listeners
   */
  private attachEventListeners(): void {
    if (!this.inputElement || !this.sendButton) return;

    // Auto-resize textarea
    this.handleInputResize = (e: Event) => {
      const target = e.target as HTMLTextAreaElement;
      target.style.height = 'auto';
      target.style.height = `${target.scrollHeight}px`;
    };
    this.inputElement.addEventListener('input', this.handleInputResize);

    // Enter to send (Shift+Enter for new line)
    this.handleInputKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleSendMessage();
      }
    };
    this.inputElement.addEventListener('keydown', this.handleInputKeydown);

    // Send button click
    this.handleSendClick = () => {
      this.handleSendMessage();
    };
    this.sendButton.addEventListener('click', this.handleSendClick);
  }

  /**
   * Handle send message
   */
  private async handleSendMessage(): Promise<void> {
    if (!this.inputElement || this.isStreaming) return;

    const content = this.inputElement.value.trim();
    if (content.length === 0) return;

    // Clear input
    this.inputElement.value = '';
    this.inputElement.style.height = 'auto';

    // Send message
    await this.sendMessage(content);
  }

  /**
   * Send a message
   */
  public async sendMessage(content: string): Promise<void> {
    // Add user message
    const userMessage: Message = {
      id: generateId('msg'),
      role: 'user',
      content,
      timestamp: Date.now(),
    };

    this.addMessage(userMessage);
    this.renderMessages(true);
    this.setStreamingState(true);

    // Create placeholder for assistant response
    const assistantMessageId = generateId('msg');
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };

    this.addMessage(assistantMessage);
    this.currentStreamingMessageId = assistantMessageId;
    this.renderMessages(true);

    try {
      // Stream the response
      const stream = this.client.chat(content);

      let fullContent = '';

      for await (const chunk of stream) {
        if (chunk.type === 'text' && chunk.message) {
          fullContent += chunk.message;
          this.updateStreamingMessage(assistantMessageId, fullContent);
        } else if (chunk.type === 'error') {
          this.showErrorInMessage(
            assistantMessageId,
            chunk.message || this.translations.unknownError
          );
          break;
        }
        // else if (chunk.type === 'done') {
        //   break;
        // }
      }

      // Update final message
      const messageIndex = this.messages.findIndex((m) => m.id === assistantMessageId);
      if (messageIndex !== -1) {
        this.messages[messageIndex].content = fullContent;
      }

      // Emit message event
      this.container.dispatchEvent(createCustomEvent('message', { message: assistantMessage }));
    } catch (error) {
      this.showErrorInMessage(assistantMessageId, (error as Error).message);

      // Emit error event
      this.container.dispatchEvent(
        createCustomEvent('error', {
          error: {
            message: (error as Error).message,
            code: 'CHAT_ERROR',
          },
        })
      );
    } finally {
      this.setStreamingState(false);
      this.renderMessages();
      this.currentStreamingMessageId = null;
    }
  }

  /**
   * Add a message to the chat
   */
  private addMessage(message: Message): void {
    this.messages.push(message);
    this.renderMessages();
  }

  /**
   * Update streaming message content.
   *
   * During streaming this performs a surgical DOM update on the streaming
   * bubble only — no full message-list re-render. Content is written as plain
   * text (escaped via textContent) to avoid markdown structural flips that
   * cause height jumps. Markdown is applied once the stream completes via the
   * final `renderMessages()` call in `sendMessage`'s `finally` block.
   */
  private updateStreamingMessage(messageId: string, content: string): void {
    const messageIndex = this.messages.findIndex((m) => m.id === messageId);
    if (messageIndex === -1) {
      return;
    }
    this.messages[messageIndex].content = content;

    if (!this.updateStreamingMessageDOM(messageId, content)) {
      // Fallback: if the bubble can't be located (e.g. immediately after a
      // setProps re-render), do a full render so the UI never stays stale.
      this.renderMessages(true);
    }
  }

  /**
   * Surgically update the streaming bubble's text node. Returns true on
   * success, false if the target nodes weren't found (caller should fall back
   * to a full re-render).
   */
  private updateStreamingMessageDOM(messageId: string, content: string): boolean {
    if (!this.messagesContainer) {
      return false;
    }

    const messageRoot = this.messagesContainer.querySelector(
      `[data-message-id="${CSS.escape(messageId)}"]`
    );
    if (!messageRoot) {
      return false;
    }

    const bubble = messageRoot.querySelector('.chat-message-bubble');
    if (!bubble) {
      return false;
    }

    // Capture scroll position BEFORE mutating the DOM so the smart-follow
    // decision is based on where the user actually is right now.
    const wasNearBottom = this.isNearBottom();

    let textNode = bubble.querySelector('.chat-message-text');
    if (!textNode) {
      // Bubble was rendered with empty content; insert the text node now,
      // before the streaming dots indicator if present.
      const created = document.createElement('div');
      created.className = 'chat-message-text';
      const streamingIndicator = bubble.querySelector('.chat-streaming');
      if (streamingIndicator) {
        bubble.insertBefore(created, streamingIndicator);
      } else {
        bubble.appendChild(created);
      }
      textNode = created;
    }

    // Plain-text update during streaming. textContent escapes safely and is
    // significantly cheaper than reparsing markdown into innerHTML each token.
    textNode.textContent = content;

    if (wasNearBottom) {
      this.scheduleScrollToBottom();
    }
    return true;
  }

  /**
   * Show error in message
   */
  private showErrorInMessage(messageId: string, error: string): void {
    const messageIndex = this.messages.findIndex((m) => m.id === messageId);
    if (messageIndex !== -1) {
      this.messages[messageIndex].content = `${this.translations.errorPrefix} ${error}`;
      this.renderMessages();
    }
  }

  /**
   * Render all messages. Forces a scroll to bottom regardless of current
   * scroll position; called only on full-list mutations (add, clear, set,
   * end-of-stream final render, prop changes), not on per-token updates.
   */
  private renderMessages(isStreaming = false): void {
    if (!this.messagesContainer) return;

    if (this.messages.length === 0) {
      this.messagesContainer.innerHTML = this.renderEmptyStateHTML();
      return;
    }

    const messagesHTML = this.messages
      .map((message) =>
        this.renderMessage(message, isStreaming && message.id === this.currentStreamingMessageId)
      )
      .join('');

    this.messagesContainer.innerHTML = messagesHTML;

    // Force scroll on full re-renders (new turn, clear, set, end-of-stream).
    this.scheduleScrollToBottom();
  }

  /**
   * Render a single message
   */
  private renderMessage(message: Message, isStreaming = false): string {
    const t = this.translations;
    const roleClass = `chat-message-${message.role}`;
    const avatar = message.role === 'user' ? t.userAvatar : t.assistantAvatar;
    const loadingMessage = t.loadingMessages[this.loadingMessageIndex] ?? '';
    // While streaming, show the in-progress text as plain (escaped) text to
    // avoid markdown structural flips that cause bubble-height jumps. The
    // final render after stream completion applies markdown.
    const renderedContent = message.content
      ? isStreaming
        ? escapeHTML(message.content)
        : markdownToHtml(message.content)
      : '';

    return `
      <div class="chat-message ${roleClass}" data-message-id="${escapeHTML(message.id)}">
        <div class="chat-message-avatar">${escapeHTML(avatar)}</div>
        <div class="chat-message-content">
          <div class="chat-message-bubble">
            ${renderedContent ? `<div class="chat-message-text">${renderedContent}</div>` : ''}
            ${isStreaming ? `<div class="chat-streaming"><span class="chat-streaming-dot"></span><span class="chat-streaming-dot"></span><span class="chat-streaming-dot"></span><span class="loading-text">${escapeHTML(loadingMessage)}</span></div>` : ''}
          </div>
          <div class="chat-message-metadata">
            <span class="chat-message-time">${escapeHTML(formatTimestamp(message.timestamp, this.translations))}</span>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * True when the user is within `BOTTOM_FOLLOW_THRESHOLD_PX` of the bottom
   * of the messages list. Used to decide whether to auto-follow the stream
   * or leave the user where they scrolled.
   */
  private isNearBottom(): boolean {
    const container = this.messagesContainer;
    if (!container) return true;
    return (
      container.scrollHeight - container.scrollTop - container.clientHeight <
      BOTTOM_FOLLOW_THRESHOLD_PX
    );
  }

  /**
   * Schedule a single scroll-to-bottom on the next animation frame. Multiple
   * calls within the same frame are coalesced into one DOM write. The "should
   * I scroll?" decision is gated by callers — `updateStreamingMessageDOM`
   * only calls this when the user is near the bottom; full re-renders always
   * call it.
   */
  private scheduleScrollToBottom(): void {
    if (!this.messagesContainer) return;
    if (this.pendingScrollFrame !== null) return;

    this.pendingScrollFrame = requestAnimationFrame(() => {
      this.pendingScrollFrame = null;
      const container = this.messagesContainer;
      if (!container) return;
      container.scrollTop = container.scrollHeight;
    });
  }

  /**
   * Set streaming state
   */
  private setStreamingState(streaming: boolean): void {
    this.isStreaming = streaming;

    if (this.inputElement) {
      this.inputElement.disabled = streaming;
    }

    if (this.sendButton) {
      this.sendButton.disabled = streaming;
      this.sendButton.innerHTML = streaming
        ? '<div class="loading"></div>'
        : `<span>${escapeHTML(this.translations.sendButtonLabel)}</span>`;
    }

    if (streaming) {
      this.startLoadingMessages();
    } else {
      this.clearLoadingMessages();
    }
  }

  private startLoadingMessages(): void {
    // Guard against double-starting (e.g. setStreamingState(true) called twice
    // via setProps during an active stream).
    this.clearLoadingMessages();
    const messages = this.translations.loadingMessages;
    this.loadingMessageIndex = Math.floor(Math.random() * messages.length);
    this.loadingMessageInterval = setInterval(() => {
      const current = this.translations.loadingMessages;
      this.loadingMessageIndex = (this.loadingMessageIndex + 1) % current.length;
      if (!this.isStreaming) return;

      // Surgically update only the streaming bubble's loading-text span.
      // Avoids tearing down the full message list (which would restart the
      // pulse animation on the streaming dots and the slide-in animation on
      // every prior message).
      const updated = this.updateLoadingTextDOM(current[this.loadingMessageIndex] ?? '');
      if (!updated) {
        this.renderMessages(true);
      }
    }, LOADING_MESSAGE_INTERVAL_MS);
  }

  /**
   * Update the rotating loading-text label inside the currently-streaming
   * bubble only. Returns true on success, false if the target wasn't found.
   */
  private updateLoadingTextDOM(text: string): boolean {
    if (!this.messagesContainer || !this.currentStreamingMessageId) {
      return false;
    }
    const bubbleRoot = this.messagesContainer.querySelector(
      `[data-message-id="${CSS.escape(this.currentStreamingMessageId)}"]`
    );
    if (!bubbleRoot) return false;
    const loadingText = bubbleRoot.querySelector('.chat-streaming .loading-text');
    if (!loadingText) return false;
    loadingText.textContent = text;
    return true;
  }

  private clearLoadingMessages(): void {
    if (this.loadingMessageInterval) {
      clearInterval(this.loadingMessageInterval);
      this.loadingMessageInterval = null;
    }
  }

  /**
   * Get all messages
   */
  public getMessages(): Message[] {
    return [...this.messages];
  }

  /**
   * Clear all messages
   */
  public clearMessages(): void {
    this.messages = [];
    this.renderMessages();
  }

  /**
   * Set messages (for restoring history)
   */
  public setMessages(messages: Message[]): void {
    this.messages = [...messages];
    this.renderMessages();
  }

  /**
   * Update the props (e.g. placeholder / translations) and re-render.
   *
   * Safe to call at any time: existing messages and streaming state are
   * preserved; listeners on the old DOM are removed and re-attached to the
   * newly rendered elements.
   */
  public setProps(props: SearchSnippetProps): void {
    this.props = props;
    this.translations = mergeTranslations(props.translations);
    this.detachEventListeners();
    this.render();
    this.attachEventListeners();
    this.renderMessages(this.isStreaming);
    // Re-apply streaming UI state (disabled input, spinner button, loading
    // messages) since render() reset the DOM to its idle state.
    if (this.isStreaming) {
      this.setStreamingState(true);
    }
  }

  private detachEventListeners(): void {
    if (this.inputElement) {
      if (this.handleInputResize) {
        this.inputElement.removeEventListener('input', this.handleInputResize);
      }
      if (this.handleInputKeydown) {
        this.inputElement.removeEventListener('keydown', this.handleInputKeydown);
      }
    }
    if (this.sendButton && this.handleSendClick) {
      this.sendButton.removeEventListener('click', this.handleSendClick);
    }
    this.handleInputResize = null;
    this.handleInputKeydown = null;
    this.handleSendClick = null;
  }

  /**
   * Destroy and cleanup
   */
  public destroy(): void {
    this.clearLoadingMessages();

    if (this.pendingScrollFrame !== null) {
      cancelAnimationFrame(this.pendingScrollFrame);
      this.pendingScrollFrame = null;
    }

    if (this.isStreaming) {
      this.client.cancelAllRequests();
    }

    // Remove event listeners
    if (this.inputElement) {
      if (this.handleInputResize) {
        this.inputElement.removeEventListener('input', this.handleInputResize);
      }
      if (this.handleInputKeydown) {
        this.inputElement.removeEventListener('keydown', this.handleInputKeydown);
      }
    }

    if (this.sendButton && this.handleSendClick) {
      this.sendButton.removeEventListener('click', this.handleSendClick);
    }

    // Clear handler references
    this.handleInputResize = null;
    this.handleInputKeydown = null;
    this.handleSendClick = null;
  }
}
