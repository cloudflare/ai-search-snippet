// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatBubbleSnippet } from './chat-bubble-snippet.ts';
import { ChatPageSnippet } from './chat-page-snippet.ts';

function createBubble(): ChatBubbleSnippet {
  const bubble = new ChatBubbleSnippet();
  bubble.setAttribute('api-url', 'https://example.com');
  return bubble;
}

function chatResponse(): Response {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(
        new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n')
      );
      controller.close();
    },
  });
  return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
}

describe('ChatBubbleSnippet lazy lifecycle', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => chatResponse())
    );
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('registers once and does not initialize ChatView on connection', async () => {
    const registered = customElements.get('chat-bubble-snippet');
    vi.resetModules();
    await import('./chat-bubble-snippet.ts');
    expect(customElements.get('chat-bubble-snippet')).toBe(registered);

    const bubble = createBubble();
    const ready = vi.fn();
    bubble.addEventListener('ready', ready);
    document.body.appendChild(bubble);

    expect(ready).toHaveBeenCalledOnce();
    expect(bubble.shadowRoot?.querySelector('.chat-content')).toBeTruthy();
    expect(bubble.shadowRoot?.querySelector('.chat-container')).toBeNull();
    expect(bubble.getMessages()).toEqual([]);
    bubble.clearChat();
    expect(bubble.shadowRoot?.querySelector('.chat-container')).toBeNull();
  });

  it('initializes one view on first expansion and reuses it after closing', async () => {
    const bubble = createBubble();
    document.body.appendChild(bubble);

    bubble.shadowRoot?.querySelector<HTMLButtonElement>('.bubble-button')?.click();
    await vi.waitFor(() =>
      expect(bubble.shadowRoot?.querySelector('.chat-container')).toBeTruthy()
    );
    const firstView = bubble.shadowRoot?.querySelector('.chat-container');

    bubble.shadowRoot?.querySelector<HTMLButtonElement>('.close-button')?.click();
    bubble.shadowRoot?.querySelector<HTMLButtonElement>('.bubble-button')?.click();
    expect(bubble.shadowRoot?.querySelector('.chat-container')).toBe(firstView);
    expect(bubble.shadowRoot?.querySelectorAll('.chat-container')).toHaveLength(1);
  });

  it('initializes from sendMessage before a click and forwards the message', async () => {
    const bubble = createBubble();
    document.body.appendChild(bubble);

    await bubble.sendMessage('Hi');

    expect(bubble.getMessages()).toMatchObject([
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello' },
    ]);
    expect(bubble.shadowRoot?.querySelector('.chat-window.expanded')).toBeNull();
  });

  it('shares initialization between expansion and a concurrent send', async () => {
    const bubble = createBubble();
    document.body.appendChild(bubble);

    bubble.shadowRoot?.querySelector<HTMLButtonElement>('.bubble-button')?.click();
    await bubble.sendMessage('Hi');

    expect(bubble.shadowRoot?.querySelectorAll('.chat-container')).toHaveLength(1);
    expect(bubble.getMessages()).toHaveLength(2);
  });

  it('does not attach a view when disconnected during loading', async () => {
    const bubble = createBubble();
    document.body.appendChild(bubble);

    bubble.shadowRoot?.querySelector<HTMLButtonElement>('.bubble-button')?.click();
    bubble.remove();
    await Promise.resolve();
    await Promise.resolve();

    expect(bubble.shadowRoot?.querySelector('.chat-container')).toBeNull();

    document.body.appendChild(bubble);
    bubble.shadowRoot?.querySelector<HTMLButtonElement>('.bubble-button')?.click();
    await vi.waitFor(() =>
      expect(bubble.shadowRoot?.querySelector('.chat-container')).toBeTruthy()
    );
  });

  it('cleans the view on disconnect and creates a fresh view after reconnect', async () => {
    const bubble = createBubble();
    document.body.appendChild(bubble);
    bubble.shadowRoot?.querySelector<HTMLButtonElement>('.bubble-button')?.click();
    await vi.waitFor(() =>
      expect(bubble.shadowRoot?.querySelector('.chat-container')).toBeTruthy()
    );
    const firstContent = bubble.shadowRoot?.querySelector('.chat-content');

    bubble.remove();
    document.body.appendChild(bubble);
    expect(bubble.shadowRoot?.querySelector('.chat-container')).toBeNull();
    bubble.shadowRoot?.querySelector<HTMLButtonElement>('.bubble-button')?.click();
    await vi.waitFor(() =>
      expect(bubble.shadowRoot?.querySelector('.chat-container')).toBeTruthy()
    );

    expect(bubble.shadowRoot?.querySelector('.chat-content')).not.toBe(firstContent);
  });

  it('preserves messages and uses the new client after api-url changes', async () => {
    const bubble = createBubble();
    document.body.appendChild(bubble);
    await bubble.sendMessage('First');

    bubble.setAttribute('api-url', 'https://other.example.com');
    await bubble.sendMessage('Second');

    expect(bubble.getMessages().filter(({ role }) => role === 'user')).toMatchObject([
      { content: 'First' },
      { content: 'Second' },
    ]);
    const fetchMock = vi.mocked(fetch);
    expect(String(fetchMock.mock.calls.at(-1)?.[0])).toBe(
      'https://other.example.com/chat/completions'
    );
  });

  it('shows the existing configuration error without initializing a view', async () => {
    const bubble = new ChatBubbleSnippet();
    document.body.appendChild(bubble);
    bubble.shadowRoot?.querySelector<HTMLButtonElement>('.bubble-button')?.click();
    await Promise.resolve();

    expect(bubble.shadowRoot?.querySelector('.chat-container')).toBeNull();
    expect(bubble.shadowRoot?.textContent).toContain('api-url attribute is required');
  });
});

describe('ChatPageSnippet deferred connection initialization', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders its shell before loading ChatView and becomes ready when usable', async () => {
    const page = new ChatPageSnippet();
    page.setAttribute('api-url', 'https://example.com');
    const ready = vi.fn();
    page.addEventListener('ready', ready);
    document.body.appendChild(page);

    expect(page.shadowRoot?.querySelector('.chat-page-container')).toBeTruthy();
    await vi.waitFor(() => expect(page.shadowRoot?.querySelector('.chat-container')).toBeTruthy());
    expect(ready).toHaveBeenCalledOnce();
  });

  it('restores the active transcript after reconnecting', async () => {
    localStorage.setItem(
      'chat-page-sessions',
      JSON.stringify([
        {
          id: 'session-1',
          title: 'Existing chat',
          messages: [
            {
              id: 'message-1',
              role: 'user',
              content: 'Persisted message',
              timestamp: 1,
            },
          ],
          createdAt: 1,
          updatedAt: 1,
          titleIsDefault: false,
        },
      ])
    );
    const page = new ChatPageSnippet();
    page.setAttribute('api-url', 'https://example.com');
    document.body.appendChild(page);
    await vi.waitFor(() => expect(page.getMessages()).toHaveLength(1));

    page.remove();
    document.body.appendChild(page);
    await vi.waitFor(() => expect(page.getMessages()).toHaveLength(1));

    expect(page.getMessages()[0].content).toBe('Persisted message');
  });
});
