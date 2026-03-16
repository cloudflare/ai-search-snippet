/**
 * ChatView Component
 * Handles chat interface with streaming support
 */

import type { Client } from '../api/index.ts';
import type { SearchSnippetProps } from '../types/index.ts';
import {
  createCustomEvent,
  escapeHTML,
  formatTimestamp,
  generateId,
  LOADING_MESSAGE_INTERVAL_MS,
  LOADING_MESSAGES,
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
  private client: Client;
  private props: SearchSnippetProps;
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

  constructor(container: HTMLElement, client: Client, props: SearchSnippetProps) {
    this.container = container;
    this.client = client;
    this.props = props;

    this.render();
    this.attachEventListeners();
  }

  /**
   * Render the chat interface
   */
  private render(): void {
    this.container.innerHTML = `
      <div class="chat-container">
        <div class="chat-messages">
          <div class="chat-empty">
            <svg class="chat-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
            <div class="chat-empty-title">Start a Conversation</div>
            <div class="chat-empty-description">
              Send a message to begin chatting
            </div>
          </div>
        </div>
        <div class="chat-input-area">
          <div class="chat-input-wrapper">
            <textarea
              class="chat-input"
              placeholder="${escapeHTML(this.props.placeholder || 'Type a message...')}"
              aria-label="Chat message input"
              style="height: 40px;"
              rows="1"
            ></textarea>
            <button class="button chat-send-button" aria-label="Send message">
              <span>Send</span>
            </button>
          </div>
        </div>
      </div>
    `;

    this.messagesContainer = this.container.querySelector('.chat-messages');
    this.inputElement = this.container.querySelector('.chat-input');
    this.sendButton = this.container.querySelector('.chat-send-button');
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
          this.showErrorInMessage(assistantMessageId, chunk.message || 'Unknown error');
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
      this.messages[messageIndex].content = `Error: ${error}`;
      this.renderMessages();
    }
  }

  /**
   * Render all messages
   */
  private renderMessages(isStreaming = false): void {
    if (!this.messagesContainer) return;

    if (this.messages.length === 0) {
      this.messagesContainer.innerHTML = `
        <div class="chat-empty">
          <svg class="chat-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
          <div class="chat-empty-title">Start a Conversation</div>
          <div class="chat-empty-description">
            Send a message to begin chatting
          </div>
        </div>
      `;
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
    const roleClass = `chat-message-${message.role}`;
    const avatar = message.role === 'user' ? 'U' : 'AI';

    return `
      <div class="chat-message ${roleClass}">
        <div class="chat-message-avatar">${avatar}</div>
        <div class="chat-message-content">
          <div class="chat-message-bubble">
            ${message.content ? `<div class="chat-message-text">${markdownToHtml(message.content)}</div>` : ''}
            ${isStreaming ? `<div class="chat-streaming"><span class="chat-streaming-dot"></span><span class="chat-streaming-dot"></span><span class="chat-streaming-dot"></span><span class="loading-text">${LOADING_MESSAGES[this.loadingMessageIndex]}</span></div>` : ''}
          </div>
          <div class="chat-message-metadata">
            <span class="chat-message-time">${formatTimestamp(message.timestamp)}</span>
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
      this.sendButton.innerHTML = streaming ? '<div class="loading"></div>' : '<span>Send</span>';
    }

    if (streaming) {
      this.startLoadingMessages();
    } else {
      this.clearLoadingMessages();
    }
  }

  private startLoadingMessages(): void {
    this.loadingMessageIndex = Math.floor(Math.random() * LOADING_MESSAGES.length);
    this.loadingMessageInterval = setInterval(() => {
      this.loadingMessageIndex = (this.loadingMessageIndex + 1) % LOADING_MESSAGES.length;
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
