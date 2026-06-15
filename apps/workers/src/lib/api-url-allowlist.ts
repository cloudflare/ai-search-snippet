/**
 * Validates the `?api-url=` query parameter exposed on the demo /
 * configurator pages of `search.ai.cloudflare.com`.
 *
 * The legitimate use of this parameter is to wire the live snippet
 * preview against the caller's own AI Search instance, which always
 * lives at `https://<hash>.search.ai.cloudflare.com/`, where `<hash>`
 * matches the same `[A-Za-z0-9-]{1,64}` shape enforced by the public
 * worker that serves those subdomains.
 *
 * Returns the original string when it parses to an allowed URL,
 * otherwise `null`. Callers should fall back to `DEMO_API_URL` and
 * surface a console warning on rejection.
 */

const HASH_RE = /^[A-Za-z0-9-]{1,64}$/;
const PUBLIC_DOMAIN_SUFFIX = '.search.ai.cloudflare.com';

export function validateApiUrlParam(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || value === '') return null;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }

  // Public AI Search endpoints are always HTTPS.
  if (parsed.protocol !== 'https:') return null;

  // Host must be `<hash>.search.ai.cloudflare.com`. Reject the apex
  // (e.g. `search.ai.cloudflare.com` itself) — it isn't an API host.
  const host = parsed.hostname;
  if (!host.endsWith(PUBLIC_DOMAIN_SUFFIX)) return null;
  const hash = host.slice(0, host.length - PUBLIC_DOMAIN_SUFFIX.length);
  if (hash === '' || hash.includes('.')) return null;
  if (!HASH_RE.test(hash)) return null;

  return value;
}
