/**
 * URL scheme allowlist helpers.
 *
 * The snippet renders URLs from two external sources:
 *   1. Markdown links in chat responses produced by the model.
 *   2. The `key` field on AI Search result chunks, surfaced to the
 *      snippet as `SearchResult.url`.
 *
 * Both flow into anchor `href` attributes. `sanitizeUrl` keeps the
 * link shapes a chat / search snippet actually needs and drops anything
 * outside that set:
 *
 *   - Absolute URLs with one of: `http:`, `https:`, `mailto:`, `tel:`
 *   - Any relative URL (path, query, or fragment — same-origin)
 *
 * Everything else collapses to the empty string. Callers should treat
 * an empty return value as "no navigable URL" and either render a non-
 * link element or fall back to `#`.
 */

// Matches any input that begins with a URI scheme followed by `:`.
// The leading-whitespace / C0-control strip below mirrors what the URL
// parser already does before scheme matching, so a tab-prefixed string
// does not slip past a naive `startsWith` check.
const ABSOLUTE_URL_RE = /^[a-z][a-z0-9+.-]*:/i;
const SAFE_ABSOLUTE_SCHEMES = new Set(['http:', 'https:', 'mailto:', 'tel:']);

/**
 * Returns the input URL if it is safe to navigate to, otherwise the
 * empty string. The returned value is unmodified from the input (modulo
 * leading / trailing whitespace and C0 control-char stripping) so the
 * caller can stamp it back into the original HTML context.
 */
export function sanitizeUrl(url: string | undefined | null): string {
  if (typeof url !== 'string') return '';

  // Strip leading + trailing ASCII whitespace and C0 control chars to
  // match what the HTML spec says the URL parser does before scheme
  // matching. The control-char ranges are deliberate so the
  // post-strip scheme check sees the same input the browser would.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: deliberate — strips the same C0 chars the URL parser strips before scheme matching.
  const stripped = url.replace(/^[\s\u0000-\u001f\u007f]+|[\s\u0000-\u001f\u007f]+$/g, '');
  if (stripped === '') return '';

  // Relative URL (path, query, or fragment): always safe because it
  // resolves against the current document origin.
  if (!ABSOLUTE_URL_RE.test(stripped)) return stripped;

  // Absolute URL: parse and allowlist scheme. `new URL` normalizes the
  // scheme to lowercase so a case-folded `JaVaScRiPt:` is still caught.
  let parsed: URL;
  try {
    parsed = new URL(stripped);
  } catch {
    return '';
  }
  return SAFE_ABSOLUTE_SCHEMES.has(parsed.protocol) ? stripped : '';
}

/**
 * Convenience predicate. Equivalent to `sanitizeUrl(url) !== ''`.
 */
export function isSafeUrl(url: string | undefined | null): boolean {
  return sanitizeUrl(url) !== '';
}
