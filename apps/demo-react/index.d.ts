import type { SearchBarSnippet, SearchModalSnippet } from '@cloudflare/ai-search-snippet';
import type { HTMLAttributes, RefAttributes } from 'react';

/**
 * 1. Converts kebab-case-strings to camelCaseStrings
 */
type KebabToCamel<S extends string> = S extends `${infer T}-${infer U}`
  ? `${T}${Capitalize<KebabToCamel<U>>}`
  : S;

/**
 * 2. Extracts the string literal union from the static observedAttributes
 */
type GetObservedAttributes<C> = C extends { observedAttributes: readonly (infer P)[] } 
  ? P & string 
  : never;

/**
 * 3. The Core Generic: Combines attribute transformation, React HTML props, and Refs
 */
export type ReactCustomElement<
  Instance extends HTMLElement, 
  Constructor extends { observedAttributes: readonly string[] }
> = {
  [K in GetObservedAttributes<Constructor> as KebabToCamel<K>]?: string | number | boolean;
} & HTMLAttributes<Instance> & RefAttributes<Instance>;

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'search-bar-snippet': ReactCustomElement<SearchBarSnippet, typeof SearchBarSnippet>;
      'search-modal-snippet': ReactCustomElement<SearchModalSnippet, typeof SearchModalSnippet>;
    }
  }
}