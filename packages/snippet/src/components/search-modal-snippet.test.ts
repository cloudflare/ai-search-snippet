// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchModalSnippet } from './search-modal-snippet.ts';

function createModal(): SearchModalSnippet {
  const modal = new SearchModalSnippet();
  modal.setAttribute('api-url', 'https://example.com');
  modal.setAttribute('disable-analytics', '');
  return modal;
}

function searchResponse(): Response {
  return new Response(
    JSON.stringify({
      success: true,
      result: {
        chunks: [
          {
            id: 'result-1',
            instance_id: 'instance-1',
            item: {
              key: 'https://example.com/result',
              metadata: { title: 'Lazy result', description: 'Loaded on demand' },
            },
          },
        ],
      },
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}

describe('SearchModalSnippet lazy lifecycle', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => searchResponse())
    );
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    document.body.removeAttribute('style');
    document.documentElement.removeAttribute('style');
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('registers once and reports shell readiness without rendering the modal', async () => {
    const registered = customElements.get('search-modal-snippet');
    vi.resetModules();
    await import('./search-modal-snippet.ts');
    expect(customElements.get('search-modal-snippet')).toBe(registered);

    const modal = createModal();
    const ready = vi.fn();
    modal.addEventListener('ready', ready);
    document.body.appendChild(modal);

    expect(ready).toHaveBeenCalledOnce();
    expect(modal.shadowRoot?.childElementCount).toBe(0);
    expect(modal.getResults()).toEqual([]);
    expect(modal.isModalOpen()).toBe(false);
  });

  it('preserves open, close, and toggle behavior across lazy initialization', async () => {
    const modal = createModal();
    const opened = vi.fn();
    const closed = vi.fn();
    modal.addEventListener('open', opened);
    modal.addEventListener('close', closed);
    document.body.appendChild(modal);

    expect(modal.open()).toBeUndefined();
    expect(modal.isModalOpen()).toBe(true);
    await vi.waitFor(() =>
      expect(modal.shadowRoot?.querySelector('.modal-container.open')).toBeTruthy()
    );
    expect(opened).toHaveBeenCalledOnce();

    modal.close();
    expect(modal.isModalOpen()).toBe(false);
    expect(closed).toHaveBeenCalledOnce();

    modal.toggle();
    expect(modal.isModalOpen()).toBe(true);
    modal.toggle();
    expect(modal.isModalOpen()).toBe(false);
  });

  it('honors close while the implementation is loading', async () => {
    const modal = createModal();
    const opened = vi.fn();
    modal.addEventListener('open', opened);
    document.body.appendChild(modal);

    modal.open();
    modal.close();

    await vi.waitFor(() =>
      expect(modal.shadowRoot?.querySelector('.modal-container')).toBeTruthy()
    );
    expect(modal.isModalOpen()).toBe(false);
    expect(modal.shadowRoot?.querySelector('.modal-container.open')).toBeNull();
    expect(opened).not.toHaveBeenCalled();
  });

  it('does not attach a modal when disconnected during loading', async () => {
    const modal = createModal();
    const opened = vi.fn();
    modal.addEventListener('open', opened);
    document.body.appendChild(modal);

    modal.open();
    modal.remove();
    await Promise.resolve();
    await Promise.resolve();

    expect(opened).not.toHaveBeenCalled();
    expect(modal.shadowRoot?.childElementCount).toBe(0);
    expect(modal.isModalOpen()).toBe(false);
  });

  it('opens once from the configured global shortcut and removes it on disconnect', async () => {
    const modal = createModal();
    const opened = vi.fn();
    modal.addEventListener('open', opened);
    document.body.appendChild(modal);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    await vi.waitFor(() => expect(opened).toHaveBeenCalledOnce());

    modal.remove();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    await Promise.resolve();
    expect(opened).toHaveBeenCalledOnce();
    expect(modal.shadowRoot?.childElementCount).toBe(0);
  });

  it('uses shortcut attributes changed after connection', async () => {
    const modal = createModal();
    const opened = vi.fn();
    modal.addEventListener('open', opened);
    document.body.appendChild(modal);
    modal.setAttribute('shortcut', 'p');
    modal.setAttribute('use-meta-key', 'false');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', metaKey: true }));
    await Promise.resolve();
    expect(opened).not.toHaveBeenCalled();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', ctrlKey: true }));
    await vi.waitFor(() => expect(opened).toHaveBeenCalledOnce());
  });

  it('loads, opens, and completes a programmatic search', async () => {
    const modal = createModal();
    document.body.appendChild(modal);

    await modal.search('lazy loading');

    expect(modal.isModalOpen()).toBe(true);
    expect(modal.shadowRoot?.querySelector<HTMLInputElement>('.modal-search-input')?.value).toBe(
      'lazy loading'
    );
    expect(modal.getResults()).toMatchObject([{ id: 'result-1', title: 'Lazy result' }]);
    expect(modal.shadowRoot?.textContent).toContain('Lazy result');
  });

  it('forwards translation overrides set before and after loading', async () => {
    const modal = createModal();
    modal.translations = { placeholder: 'Before load' };
    document.body.appendChild(modal);
    modal.open();

    await vi.waitFor(() =>
      expect(
        modal.shadowRoot?.querySelector<HTMLInputElement>('.modal-search-input')?.placeholder
      ).toBe('Before load')
    );

    modal.translations = { placeholder: 'After load' };
    expect(
      modal.shadowRoot?.querySelector<HTMLInputElement>('.modal-search-input')?.placeholder
    ).toBe('After load');
  });
});
