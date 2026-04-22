export type SnippetId = 'search-bar' | 'search-modal' | 'chat-bubble' | 'chat-page';

export interface SnippetMeta {
  id: SnippetId;
  title: string;
  description: string;
  tabLabel: string;
}

export const SNIPPET_VERSION = '0.0.38';

export const SNIPPETS = [
  {
    id: 'search-bar',
    title: 'Search Bar',
    description:
      'Inline search input with real-time results dropdown. Perfect for navigation bars and sidebars.',
    tabLabel: 'Search Bar',
  },
  {
    id: 'search-modal',
    title: 'Search Modal',
    description:
      'Command palette style search with Cmd/Ctrl+K keyboard shortcut. Great for documentation sites.',
    tabLabel: 'Search Modal',
  },
  {
    id: 'chat-bubble',
    title: 'Chat Bubble',
    description:
      'Floating chat widget that opens from the corner of any page. Ideal for support and assistance.',
    tabLabel: 'Chat Bubble',
  },
  {
    id: 'chat-page',
    title: 'Chat Page',
    description:
      'Full-page conversational interface with message history. Best for dedicated chat experiences.',
    tabLabel: 'Chat Page',
  },
] as const satisfies readonly SnippetMeta[];

export function getSnippetTag(snippetId: SnippetId): `${SnippetId}-snippet` {
  return `${snippetId}-snippet`;
}
