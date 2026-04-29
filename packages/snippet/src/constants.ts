/**
 * Cloudflare AI Search branding constants
 */

/**
 * Injected at build time by Vite's `define` from package.json.
 * Falls back to a sentinel value so tests / direct imports don't crash if
 * the constant somehow isn't replaced (should never happen in production).
 */
declare const __SNIPPET_VERSION__: string;

export const SNIPPET_VERSION: string =
  typeof __SNIPPET_VERSION__ === 'string' ? __SNIPPET_VERSION__ : '0.0.0';

export const CLOUDFLARE_LOGO_SVG = `<svg width="32" height="10" viewBox="0 0 412 186" xmlns="http://www.w3.org/2000/svg" aria-label="Cloudflare" role="img">
  <path fill="#f38020" d="m280.8395,183.31456c11,-26 -4,-38 -19,-38l-148,-2c-4,0 -4,-6 1,-7l150,-2c17,-1 37,-15 43,-33c0,0 10,-21 9,-24a97,97 0 0 0 -187,-11c-38,-25 -78,9 -69,46c-48,3 -65,46 -60,72c0,1 1,2 3,2l274,0c1,0 3,-1 3,-3z"/>
  <path fill="#faae40" d="m330.8395,81.31456c-4,0 -6,-1 -7,1l-5,21c-5,16 3,30 20,31l32,2c4,0 4,6 -1,7l-33,1c-36,4 -46,39 -46,39c0,2 0,3 2,3l113,0l3,-2a81,81 0 0 0 -78,-103"/>
</svg>`;

export const CLOUDFLARE_SEARCH_URL = 'https://workers.cloudflare.com/product/ai-search';

export const POWERED_BY_BRANDING = `Powered by <a href="${CLOUDFLARE_SEARCH_URL}" target="_blank" rel="noopener noreferrer">Cloudflare AI Search ${CLOUDFLARE_LOGO_SVG}</a>`;
