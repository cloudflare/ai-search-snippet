import { describe, expect, it } from 'vitest';

import { isSafeUrl, sanitizeUrl } from './url-safety.ts';

describe('sanitizeUrl', () => {
  describe('safe absolute URLs', () => {
    it.each([
      ['https://example.com/path?q=1#frag'],
      ['http://example.com/'],
      ['https://sub.domain.example.com:8443/x'],
      ['mailto:user@example.com'],
      ['tel:+15551234567'],
    ])('preserves %s', (input) => {
      expect(sanitizeUrl(input)).toBe(input);
    });
  });

  describe('relative URLs', () => {
    it.each([
      ['/foo/bar'],
      ['./foo'],
      ['../foo'],
      ['foo/bar'],
      ['?q=abc'],
      ['#anchor'],
      ['plainword'],
      ['file.html'],
    ])('preserves %s', (input) => {
      expect(sanitizeUrl(input)).toBe(input);
    });
  });

  describe('non-allowlisted schemes', () => {
    it.each([
      ['javascript:alert(1)'],
      ['javascript:alert`x`'],
      ["javascript:alert('x')"],
      ['javascript:alert(document.cookie)'],
      // Scheme matching is case-insensitive.
      ['JaVaScRiPt:alert(1)'],
      ['JAVASCRIPT:alert(1)'],
      ['data:text/html,<p>hi</p>'],
      ['data:image/svg+xml,<svg/>'],
      ['vbscript:msgbox(1)'],
      ['file:///etc/passwd'],
      // blob:, ws:/wss:, ftp: etc. are all outside the allowlist.
      ['blob:https://example.com/abc'],
      ['ws://example.com/'],
      ['wss://example.com/'],
      ['ftp://example.com/'],
      ['chrome://settings'],
      ['about:blank'],
    ])('rejects %s', (input) => {
      expect(sanitizeUrl(input)).toBe('');
    });
  });

  describe('whitespace + control-char prefixes', () => {
    it.each([
      ['\tjavascript:alert(1)'],
      [' javascript:alert(1)'],
      ['  \t \njavascript:alert(1)'],
      ['\u0000javascript:alert(1)'],
      ['\u0009javascript:alert(1)'],
      ['\u001fjavascript:alert(1)'],
      ['\u007fjavascript:alert(1)'],
      ['javascript:alert(1)\t'],
      ['javascript:alert(1) '],
    ])('rejects %j after stripping leading/trailing whitespace + control chars', (input) => {
      expect(sanitizeUrl(input)).toBe('');
    });

    it('strips leading whitespace from safe URLs', () => {
      expect(sanitizeUrl('  https://example.com/  ')).toBe('https://example.com/');
    });
  });

  describe('edge cases', () => {
    it('returns empty string for empty / nullish input', () => {
      expect(sanitizeUrl('')).toBe('');
      expect(sanitizeUrl(null)).toBe('');
      expect(sanitizeUrl(undefined)).toBe('');
    });

    it('returns empty string for non-string input', () => {
      expect(sanitizeUrl(123 as unknown as string)).toBe('');
      expect(sanitizeUrl({} as unknown as string)).toBe('');
    });

    it('returns empty string for whitespace-only input', () => {
      expect(sanitizeUrl('   ')).toBe('');
      expect(sanitizeUrl('\t\n')).toBe('');
    });

    it('returns empty string for absolute URLs the URL parser rejects', () => {
      // Scheme matches but rest is unparseable as a URL.
      expect(sanitizeUrl('https://')).toBe('');
    });

    it('rejects unknown but valid-looking schemes', () => {
      // We allowlist; we don't blocklist. `irc:` is a real scheme but
      // not appropriate for chat / search output.
      expect(sanitizeUrl('irc://chat.example.com/foo')).toBe('');
      expect(sanitizeUrl('steam://run/123')).toBe('');
    });
  });
});

describe('isSafeUrl', () => {
  it('returns true for safe URLs', () => {
    expect(isSafeUrl('https://example.com/')).toBe(true);
    expect(isSafeUrl('/relative/path')).toBe(true);
    expect(isSafeUrl('mailto:a@b.com')).toBe(true);
  });

  it('returns false for unsafe URLs', () => {
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('data:text/html,<script>')).toBe(false);
    expect(isSafeUrl(null)).toBe(false);
    expect(isSafeUrl('')).toBe(false);
  });
});
