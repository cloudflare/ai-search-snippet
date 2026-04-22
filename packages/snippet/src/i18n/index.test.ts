import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_TRANSLATIONS } from './defaults.ts';
import {
  interpolate,
  mergeTranslations,
  parseTranslationsAttribute,
  type Translations,
} from './index.ts';

describe('mergeTranslations', () => {
  it('returns defaults when no overrides are provided', () => {
    expect(mergeTranslations()).toBe(DEFAULT_TRANSLATIONS);
    expect(mergeTranslations(null)).toBe(DEFAULT_TRANSLATIONS);
  });

  it('overrides only the specified keys and keeps defaults for the rest', () => {
    const result = mergeTranslations({ placeholder: 'Busca aquí...' });
    expect(result.placeholder).toBe('Busca aquí...');
    expect(result.emptyStateTitle).toBe(DEFAULT_TRANSLATIONS.emptyStateTitle);
    expect(result.loadingMessages).toEqual(DEFAULT_TRANSLATIONS.loadingMessages);
  });

  it('overrides loadingMessages as a full-array replacement', () => {
    const result = mergeTranslations({ loadingMessages: ['Buscando...', 'Cargando...'] });
    expect(result.loadingMessages).toEqual(['Buscando...', 'Cargando...']);
  });

  it('ignores an empty loadingMessages array and keeps defaults', () => {
    const result = mergeTranslations({ loadingMessages: [] });
    expect(result.loadingMessages).toEqual(DEFAULT_TRANSLATIONS.loadingMessages);
  });

  it('ignores non-string values in loadingMessages', () => {
    const result = mergeTranslations({
      loadingMessages: ['Buscando...', 123 as unknown as string, 'Cargando...'],
    });
    expect(result.loadingMessages).toEqual(['Buscando...', 'Cargando...']);
  });

  it('skips null, undefined, and non-string values', () => {
    const result = mergeTranslations({
      placeholder: undefined,
      chatTitle: null as unknown as string,
      sendButtonLabel: 42 as unknown as string,
    });
    expect(result.placeholder).toBe(DEFAULT_TRANSLATIONS.placeholder);
    expect(result.chatTitle).toBe(DEFAULT_TRANSLATIONS.chatTitle);
    expect(result.sendButtonLabel).toBe(DEFAULT_TRANSLATIONS.sendButtonLabel);
  });

  it('does not mutate the defaults object', () => {
    const before = DEFAULT_TRANSLATIONS.placeholder;
    mergeTranslations({ placeholder: 'Custom' });
    expect(DEFAULT_TRANSLATIONS.placeholder).toBe(before);
  });
});

describe('interpolate', () => {
  it('replaces a single {name} token', () => {
    expect(interpolate('Hello {name}!', { name: 'World' })).toBe('Hello World!');
  });

  it('replaces multiple tokens', () => {
    expect(interpolate('Showing {n} of {total}', { n: 5, total: 25 })).toBe('Showing 5 of 25');
  });

  it('coerces number values to strings', () => {
    expect(interpolate('{n} result', { n: 1 })).toBe('1 result');
  });

  it('leaves unknown tokens untouched', () => {
    expect(interpolate('Hello {name}!', {})).toBe('Hello {name}!');
  });

  it('handles templates with no tokens', () => {
    expect(interpolate('No tokens here', { n: 1 })).toBe('No tokens here');
  });

  it('uses hasOwn to avoid prototype pollution', () => {
    // Even if Object.prototype has a `toString` property, it should not be substituted.
    expect(interpolate('{toString}', {})).toBe('{toString}');
  });
});

describe('parseTranslationsAttribute', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null for missing attribute', () => {
    expect(parseTranslationsAttribute(null, 'TestComponent')).toBeNull();
    expect(parseTranslationsAttribute('', 'TestComponent')).toBeNull();
  });

  it('parses valid JSON into a translations object', () => {
    const result = parseTranslationsAttribute('{"placeholder":"Hola"}', 'TestComponent');
    expect(result).toEqual({ placeholder: 'Hola' });
  });

  it('returns null and logs when JSON is malformed', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = parseTranslationsAttribute('{ not json', 'TestComponent');
    expect(result).toBeNull();
    expect(consoleError).toHaveBeenCalledWith(
      'TestComponent: invalid translations attribute',
      expect.any(Error)
    );
  });

  it('returns null for arrays', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(parseTranslationsAttribute('[]', 'TestComponent')).toBeNull();
    expect(consoleError).toHaveBeenCalled();
  });

  it('returns null for JSON null', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(parseTranslationsAttribute('null', 'TestComponent')).toBeNull();
    expect(consoleError).toHaveBeenCalled();
  });

  it('returns null for primitives', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(parseTranslationsAttribute('"string"', 'TestComponent')).toBeNull();
    expect(parseTranslationsAttribute('42', 'TestComponent')).toBeNull();
    expect(consoleError).toHaveBeenCalled();
  });

  it('accepts a partial Translations object', () => {
    const raw = JSON.stringify({ placeholder: 'Buscar', chatTitle: 'Asistente' });
    const result = parseTranslationsAttribute(raw, 'TestComponent');
    expect(result).toEqual({ placeholder: 'Buscar', chatTitle: 'Asistente' });
    // Confirm mergeTranslations accepts it without widening.
    const merged: Required<Translations> = mergeTranslations(result);
    expect(merged.placeholder).toBe('Buscar');
    expect(merged.chatTitle).toBe('Asistente');
  });
});
