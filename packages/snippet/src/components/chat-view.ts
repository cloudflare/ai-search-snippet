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
   * Update streaming message content
   */
  private updateStreamingMessage(messageId: string, content: string): void {
    const messageIndex = this.messages.findIndex((m) => m.id === messageId);
    if (messageIndex !== -1) {
      this.messages[messageIndex].content = content;
      this.renderMessages(true);
    }
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
   * Render all messages
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

    // Scroll to bottom
    this.scrollToBottom();
  }

  /**
   * Render a single message
   */
  private renderMessage(message: Message, isStreaming = false): string {
    const t = this.translations;
    const roleClass = `chat-message-${message.role}`;
    const avatar = message.role === 'user' ? t.userAvatar : t.assistantAvatar;
    const loadingMessage = t.loadingMessages[this.loadingMessageIndex] ?? '';

    return `
      <div class="chat-message ${roleClass}">
        <div class="chat-message-avatar">${escapeHTML(avatar)}</div>
        <div class="chat-message-content">
          <div class="chat-message-bubble">
            ${message.content ? `<div class="chat-message-text">${markdownToHtml(message.content)}</div>` : ''}
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
   * Scroll to bottom of messages
   */
  private scrollToBottom(): void {
    if (!this.messagesContainer) return;

    requestAnimationFrame(() => {
      if (this.messagesContainer) {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
      }
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
      if (this.isStreaming) {
        this.renderMessages(true);
      }
    }, LOADING_MESSAGE_INTERVAL_MS);
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
