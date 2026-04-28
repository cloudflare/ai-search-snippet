/**
 * Chat mode specific styles
 */

export const chatStyles = `
/* Chat container */
.chat-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
}

/* Messages area */
.chat-messages {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: var(--search-snippet-spacing-md);
  display: flex;
  flex-direction: column;
  gap: var(--search-snippet-spacing-md);
}

.chat-messages::-webkit-scrollbar {
  width: 8px;
}

.chat-messages::-webkit-scrollbar-track {
  background: var(--search-snippet-surface);
}

.chat-messages::-webkit-scrollbar-thumb {
  background: var(--search-snippet-border-color);
  border-radius: var(--search-snippet-border-radius);
}

.chat-messages::-webkit-scrollbar-thumb:hover {
  background: var(--search-snippet-text-secondary);
}

/* Message */
.chat-message {
  display: flex;
  gap: var(--search-snippet-spacing-sm);
  max-width: 85%;
  animation: slideIn var(--search-snippet-animation-duration) ease-out;
  animation-fill-mode: both;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.chat-message-user {
  align-self: flex-end;
  flex-direction: row-reverse;
}

.chat-message-assistant {
  align-self: flex-start;
}

.chat-message-system {
  align-self: center;
  max-width: 100%;
}

/* Message avatar */
.chat-message-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: var(--search-snippet-font-size-sm);
  font-weight: var(--search-snippet-font-weight-bold);
  background: var(--search-snippet-primary-color);
  color: white;
}

.chat-message-assistant .chat-message-avatar {
  background: var(--search-snippet-surface);
  color: var(--search-snippet-text-color);
  border: var(--search-snippet-border-width) solid var(--search-snippet-border-color);
}

/* Message content */
.chat-message-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--search-snippet-spacing-xs);
  max-width: 100%;
}

.chat-message-content ol, .chat-message-content ul {
  margin-inline-start: 16px;
}

.chat-message-content ol li, .chat-message-content ul li {
  padding-inline-start: 0;
}

.chat-message-bubble {
  padding: var(--search-snippet-spacing-sm) var(--search-snippet-spacing-md);
  border-radius: var(--search-snippet-border-radius);
  word-wrap: break-word;
  overflow-wrap: break-word;
  /* Isolate layout cost of bubble height changes during streaming so
     siblings don't reflow. */
  contain: layout style;
}

.chat-message-user .chat-message-bubble {
  background: var(--search-snippet-user-message-bg);
  color: var(--search-snippet-user-message-text);
  border-top-right-radius: var(--search-snippet-spacing-xs);
}

.chat-message-assistant .chat-message-bubble {
  background: var(--search-snippet-assistant-message-bg);
  color: var(--search-snippet-assistant-message-text);
  border-top-left-radius: var(--search-snippet-spacing-xs);
  border: var(--search-snippet-border-width) solid var(--search-snippet-border-color);
}

.chat-message-system .chat-message-bubble {
  background: var(--search-snippet-system-message-bg);
  color: var(--search-snippet-system-message-text);
  text-align: center;
  font-size: var(--search-snippet-font-size-sm);
  padding: var(--search-snippet-spacing-xs) var(--search-snippet-spacing-md);
}

.chat-message-text {
  font-size: var(--search-snippet-font-size-base);
  line-height: 1.5;
  white-space: wrap;
}
.chat-message-text li{
  padding-inline-start: var(--search-snippet-spacing-md);
}

.chat-message-metadata {
  display: flex;
  align-items: center;
  gap: var(--search-snippet-spacing-sm);
  font-size: var(--search-snippet-font-size-sm);
  color: var(--search-snippet-text-secondary);
}

.chat-message-user .chat-message-metadata {
  justify-content: flex-end;
}

.chat-message-time {
  opacity: 0.7;
}

/* Streaming indicator */
.chat-streaming {
  display: flex;
  align-items: center;
  gap: var(--search-snippet-spacing-xs);
}

.chat-streaming-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
  animation: pulse 1.4s ease-in-out infinite;
}

.chat-streaming-dot:nth-child(2) {
  animation-delay: 0.2s;
}

.chat-streaming-dot:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes pulse {
  0%, 80%, 100% {
    opacity: 0.3;
    transform: scale(0.8);
  }
  40% {
    opacity: 1;
    transform: scale(1);
  }
}

.chat-streaming .loading-text {
  margin-left: var(--search-snippet-spacing-xs);
}

/* Input area */
.chat-input-area {
  padding: var(--search-snippet-spacing-md);
  border-top: var(--search-snippet-border-width) solid var(--search-snippet-border-color);
  background: var(--search-snippet-surface);
}

.chat-input-wrapper {
  display: flex;
  gap: var(--search-snippet-spacing-sm);
  align-items: flex-end;
}

.chat-input {
  flex: 1;
  min-height: var(--search-snippet-input-height);
  max-height: 120px;
  padding: var(--search-snippet-spacing-sm) var(--search-snippet-spacing-md);
  font-family: var(--search-snippet-font-family);
  font-size: var(--search-snippet-font-size-base);
  line-height: var(--search-snippet-line-height);
  color: var(--search-snippet-text-color);
  background: var(--search-snippet-background);
  border: var(--search-snippet-border-width) solid var(--search-snippet-border-color);
  border-radius: var(--search-snippet-border-radius);
  outline: none;
  resize: vertical;
  transition: var(--search-snippet-transition);
}

.chat-input:focus {
  border-color: var(--search-snippet-primary-color);
  box-shadow: 0 0 0 3px var(--search-snippet-focus-ring);
}

.chat-input::placeholder {
  color: var(--search-snippet-text-secondary);
}

.chat-input:disabled {
  background: var(--search-snippet-surface);
  cursor: not-allowed;
  opacity: 0.6;
}

.chat-send-button {
  flex-shrink: 0;
  height: var(--search-snippet-input-height);
  padding: 0 var(--search-snippet-spacing-lg);
}

.chat-send-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Empty chat state */
.chat-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--search-snippet-spacing-xxl);
  gap: var(--search-snippet-spacing-md);
  color: var(--search-snippet-text-secondary);
  text-align: center;
  height: 100%;
}

.chat-empty-icon {
  width: 64px;
  height: 64px;
  opacity: 0.5;
}

.chat-empty-title {
  font-size: var(--search-snippet-font-size-lg);
  font-weight: var(--search-snippet-font-weight-medium);
  color: var(--search-snippet-text-color);
}

.chat-empty-description {
  font-size: var(--search-snippet-font-size-sm);
}

/* Code blocks in messages */
.chat-message-bubble pre {
  background: var(--search-snippet-surface);
  padding: var(--search-snippet-spacing-sm);
  border-radius: var(--search-snippet-border-radius);
  overflow-x: auto;
  font-family: var(--search-snippet-font-family-mono);
  font-size: var(--search-snippet-font-size-sm);
  margin: var(--search-snippet-spacing-xs) 0;
}

.chat-message-bubble code {
  font-family: var(--search-snippet-font-family-mono);
  font-size: 0.9em;
  background: var(--search-snippet-surface);
  padding: 2px 4px;
  border-radius: var(--search-snippet-border-radius);
}

.chat-message-bubble pre code {
  background: none;
  padding: 0;
}

/* Links in messages */
.chat-message-bubble a {
  color: var(--search-snippet-primary-color);
  text-decoration: underline;
}

.chat-message-bubble a:hover {
  text-decoration: none;
}
`;
