import { describe, expect, it } from 'vitest';
import { renderResultIcon } from './index.ts';

const icon = (slug: string): string =>
  `<span class="result-icon" part="result-icon result-icon-${slug}" aria-hidden="true"></span>`;

describe('renderResultIcon', () => {
  it.each(['page', 'section', 'api-reference', '404'])('renders valid icon slug %j', (value) => {
    expect(renderResultIcon(value)).toBe(icon(value));
  });

  it.each([
    undefined,
    null,
    '',
    ' page ',
    'Page',
    'api_reference',
    'api reference',
    'page/active',
    '日本語',
    42,
    true,
    [],
    {},
    Number.NaN,
  ])('rejects invalid icon metadata value %j', (value) => {
    expect(renderResultIcon(value)).toBe('');
  });
});
