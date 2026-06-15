import { describe, expect, it } from 'vitest';

import { markdownToHtml } from './markdown.ts';

describe('markdownToHtml — link rendering', () => {
  it('renders http/https links as anchors with target=_blank', () => {
    const html = markdownToHtml('[link](https://example.com/foo)');
    expect(html).toBe(
      '<p><a href="https://example.com/foo" target="_blank" rel="noopener noreferrer">link</a></p>'
    );
  });

  it('renders mailto and tel links', () => {
    expect(markdownToHtml('[email](mailto:user@example.com)')).toContain(
      'href="mailto:user@example.com"'
    );
    expect(markdownToHtml('[call](tel:+15551234567)')).toContain('href="tel:+15551234567"');
  });

  it('renders relative URLs', () => {
    expect(markdownToHtml('[doc](/docs/intro)')).toContain('href="/docs/intro"');
    expect(markdownToHtml('[anchor](#section)')).toContain('href="#section"');
  });
});

describe('markdownToHtml — non-allowlisted link schemes', () => {
  it('drops `javascript:` links and keeps only the link text', () => {
    const html = markdownToHtml('[Click here](javascript:alert`x`)');
    expect(html).not.toContain('href');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('Click here');
  });

  it('drops case-folded `javascript:` links', () => {
    const html = markdownToHtml('[x](JaVaScRiPt:alert(1))');
    expect(html).not.toContain('href');
    expect(html.toLowerCase()).not.toContain('javascript:');
  });

  it('drops `data:` links', () => {
    const html = markdownToHtml('[x](data:text/html,<p>hi</p>)');
    expect(html).not.toContain('href');
    expect(html).not.toContain('data:text/html');
  });

  it('drops `vbscript:` links', () => {
    const html = markdownToHtml('[x](vbscript:msgbox(1))');
    expect(html).not.toContain('href');
    expect(html).not.toContain('vbscript:');
  });

  it('drops whitespace-prefixed `javascript:` links', () => {
    const html = markdownToHtml('[x](\tjavascript:alert(1))');
    expect(html).not.toContain('href');
    expect(html).not.toContain('javascript:');
  });

  it('renders allowlisted links alongside dropped ones in the same paragraph', () => {
    const html = markdownToHtml('[good](https://example.com) and [bad](javascript:alert(1))');
    expect(html).toContain('href="https://example.com"');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('href="javascript');
    expect(html).toContain('bad');
  });
});
