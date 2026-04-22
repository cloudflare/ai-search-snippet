export interface ReferenceTableData {
  columns: readonly string[];
  rows: readonly string[][];
  codeColumns?: readonly number[];
  defaultColumns?: readonly number[];
  title?: string;
}

export interface ReferenceSectionData {
  id: string;
  title: string;
  description?: string;
  tables: readonly ReferenceTableData[];
}

export const API_REFERENCE_SECTIONS: readonly ReferenceSectionData[] = [
  {
    id: 'props-common',
    title: 'Common Props (All Components)',
    tables: [
      {
        columns: ['Attribute', 'Type', 'Default', 'Description'],
        codeColumns: [0],
        defaultColumns: [2],
        rows: [
          ['api-url', 'string', 'Required', 'AI Search API endpoint URL'],
          ['placeholder', 'string', '"Search..." / "Type a message..."', 'Input placeholder text'],
          [
            'theme',
            '"light" | "dark" | "auto"',
            '"auto"',
            'Color scheme (auto follows system preference)',
          ],
          ['hide-branding', 'boolean', 'false', 'Hide "Powered by Cloudflare" branding'],
          [
            'translations',
            'JSON string / object',
            '-',
            'Override any user-facing string. Omitted keys fall back to English defaults. See Translations section below.',
          ],
        ],
      },
    ],
  },
  {
    id: 'props-search-bar',
    title: '<search-bar-snippet> Props',
    tables: [
      {
        columns: ['Attribute', 'Type', 'Default', 'Description'],
        codeColumns: [0],
        defaultColumns: [2],
        rows: [
          ['max-results', 'number', '10', 'Maximum number of search results to display'],
          ['debounce-ms', 'number', '300', 'Input debounce delay in milliseconds'],
          ['show-url', 'boolean', 'false', 'Show URL in search results'],
          ['show-date', 'boolean', 'false', 'Show result dates when a timestamp is available'],
          ['hide-thumbnails', 'boolean', 'false', 'Hide result thumbnails/images'],
          [
            'request-options',
            'JSON string',
            '-',
            'Extra search request configuration with headers, query params, and body fields',
          ],
          [
            'see-more',
            'string',
            '-',
            'URL template for "See more" link. The search query is appended URL-encoded (e.g. "https://example.com/search?q=")',
          ],
        ],
      },
      {
        title: 'Methods',
        columns: ['Method', 'Parameters', 'Returns', 'Description'],
        codeColumns: [0],
        defaultColumns: [2],
        rows: [
          ['search(query)', 'query: string', 'Promise<void>', 'Programmatically perform a search'],
        ],
      },
    ],
  },
  {
    id: 'props-search-modal',
    title: '<search-modal-snippet> Props',
    tables: [
      {
        columns: ['Attribute', 'Type', 'Default', 'Description'],
        codeColumns: [0],
        defaultColumns: [2],
        rows: [
          ['max-results', 'number', '10', 'Maximum number of search results to display'],
          ['debounce-ms', 'number', '300', 'Input debounce delay in milliseconds'],
          ['show-url', 'boolean', 'false', 'Show URL in search results'],
          ['show-date', 'boolean', 'false', 'Show result dates when a timestamp is available'],
          ['hide-thumbnails', 'boolean', 'false', 'Hide result thumbnails/images'],
          [
            'request-options',
            'JSON string',
            '-',
            'Extra search request configuration with headers, query params, and body fields',
          ],
          ['shortcut', 'string', '"k"', 'Keyboard shortcut key (used with Cmd/Ctrl)'],
          [
            'use-meta-key',
            '"true" | "false"',
            '"true"',
            'Use Cmd/Ctrl modifier for keyboard shortcut',
          ],
          [
            'see-more',
            'string',
            '-',
            'URL template for "See more" link. The search query is appended URL-encoded (e.g. "https://example.com/search?q=")',
          ],
        ],
      },
      {
        title: 'Methods',
        columns: ['Method', 'Parameters', 'Returns', 'Description'],
        codeColumns: [0],
        defaultColumns: [2],
        rows: [
          ['open()', '-', 'void', 'Open the search modal'],
          ['close()', '-', 'void', 'Close the search modal'],
          ['toggle()', '-', 'void', 'Toggle the modal open/closed'],
          ['search(query)', 'query: string', 'Promise<void>', 'Open modal and perform search'],
          ['getResults()', '-', 'SearchResult[]', 'Get current search results'],
          ['isModalOpen()', '-', 'boolean', 'Check if modal is currently open'],
        ],
      },
    ],
  },
  {
    id: 'props-chat-bubble',
    title: '<chat-bubble-snippet> Props',
    description: 'Uses common props only (api-url, placeholder, theme, hide-branding).',
    tables: [
      {
        title: 'Methods',
        columns: ['Method', 'Parameters', 'Returns', 'Description'],
        codeColumns: [0],
        defaultColumns: [2],
        rows: [
          ['clearChat()', '-', 'void', 'Clear all chat messages'],
          [
            'sendMessage(content)',
            'content: string',
            'Promise<void>',
            'Programmatically send a message',
          ],
          ['getMessages()', '-', 'Message[]', 'Get all chat messages'],
        ],
      },
    ],
  },
  {
    id: 'props-chat-page',
    title: '<chat-page-snippet> Props',
    description:
      'Uses common props only (api-url, placeholder, theme, hide-branding). Includes session history with localStorage persistence.',
    tables: [
      {
        title: 'Methods',
        columns: ['Method', 'Parameters', 'Returns', 'Description'],
        codeColumns: [0],
        defaultColumns: [2],
        rows: [
          ['clearChat()', '-', 'void', 'Clear current chat session'],
          [
            'sendMessage(content)',
            'content: string',
            'Promise<void>',
            'Programmatically send a message',
          ],
          ['getMessages()', '-', 'Message[]', 'Get messages from current session'],
          ['getSessions()', '-', 'ChatSession[]', 'Get all chat sessions'],
          ['getCurrentSession()', '-', 'ChatSession | null', 'Get the current active session'],
        ],
      },
    ],
  },
  {
    id: 'search-request-options',
    title: 'Search Request Options',
    description:
      'Use the `request-options` attribute on search components or the `request` option on `AISearchClient.search()` and `searchStream()` to enrich search requests.',
    tables: [
      {
        columns: ['Key', 'Type', 'Description'],
        codeColumns: [0],
        rows: [
          ['headers', 'Record<string, string>', 'Extra headers to send with search requests'],
          [
            'queryParams',
            'Record<string, string | number | boolean>',
            'Extra query params appended to the request URL',
          ],
          ['body', 'Record<string, unknown>', 'Extra JSON fields merged into the request body'],
        ],
      },
      {
        title: 'Notes',
        columns: ['Behavior', 'Details'],
        rows: [
          [
            'Conflict resolution',
            'Core request fields still win over conflicts: `messages`, `stream`, `max_num_results`, and the default search `ai_search_options.retrieval.metadata_only` value.',
          ],
        ],
      },
    ],
  },
  {
    id: 'api-client',
    title: 'AISearchClient',
    tables: [
      {
        title: 'Methods',
        columns: ['Method', 'Parameters', 'Returns', 'Description'],
        codeColumns: [0],
        defaultColumns: [2],
        rows: [
          [
            'search(query, options?)',
            'query: string, options?: { maxResults?, signal?, request? }',
            'Promise<SearchResult[]>',
            'Perform a search request with optional request enrichment',
          ],
          [
            'searchStream(query, options?)',
            'query: string, options?: { maxResults?, signal?, request? }',
            'AsyncGenerator<SearchResult | SearchError>',
            'Perform a streaming search request with optional request enrichment',
          ],
          [
            'chat(query, options?)',
            'query: string, options?: { signal? }',
            'AsyncGenerator<ChatTypes>',
            'Perform a chat completion request',
          ],
        ],
      },
    ],
  },
  {
    id: 'component-events',
    title: 'Custom Events',
    tables: [
      {
        columns: ['Event', 'Components', 'Detail', 'Description'],
        codeColumns: [0],
        defaultColumns: [2],
        rows: [
          ['ready', 'All', 'undefined', 'Fired when component is initialized'],
          ['open', 'search-modal', 'undefined', 'Fired when modal opens'],
          ['close', 'search-modal', 'undefined', 'Fired when modal closes'],
          [
            'result-select',
            'search-modal',
            '{ result, index }',
            'Fired when a search result is selected',
          ],
        ],
      },
    ],
  },
];

export const CSS_VARIABLE_SECTIONS: readonly ReferenceSectionData[] = [
  {
    id: 'vars-colors',
    title: 'Colors',
    tables: [
      {
        columns: ['Variable', 'Default', 'Description'],
        codeColumns: [0],
        defaultColumns: [1],
        rows: [
          ['--search-snippet-primary-color', '#2563eb', 'Primary brand color'],
          ['--search-snippet-primary-hover', '#0f51df', 'Primary hover state'],
          ['--search-snippet-background', '#ffffff', 'Main background color'],
          ['--search-snippet-surface', '#f8f9fa', 'Surface/card background'],
          ['--search-snippet-text-color', '#212529', 'Primary text color'],
          ['--search-snippet-text-secondary', '#6c757d', 'Secondary/muted text'],
          [
            '--search-snippet-text-description',
            '#495057',
            'Search result description text (higher contrast)',
          ],
          ['--search-snippet-border-color', '#dee2e6', 'Border color'],
          ['--search-snippet-hover-background', '#f1f3f5', 'Hover state background'],
          ['--search-snippet-focus-ring', '#0066cc40', 'Focus ring color (with opacity)'],
        ],
      },
    ],
  },
  {
    id: 'vars-state-colors',
    title: 'State Colors',
    tables: [
      {
        columns: ['Variable', 'Default', 'Description'],
        codeColumns: [0],
        defaultColumns: [1],
        rows: [
          ['--search-snippet-error-color', '#dc3545', 'Error text color'],
          ['--search-snippet-error-background', '#f8d7da', 'Error background color'],
          ['--search-snippet-success-color', '#28a745', 'Success text color'],
          ['--search-snippet-success-background', '#d4edda', 'Success background color'],
          ['--search-snippet-warning-color', '#ffc107', 'Warning text color'],
          ['--search-snippet-warning-background', '#fff3cd', 'Warning background color'],
        ],
      },
    ],
  },
  {
    id: 'vars-message-colors',
    title: 'Message Colors (Chat)',
    tables: [
      {
        columns: ['Variable', 'Default', 'Description'],
        codeColumns: [0],
        defaultColumns: [1],
        rows: [
          ['--search-snippet-user-message-bg', '#0066cc', 'User message bubble background'],
          ['--search-snippet-user-message-text', '#ffffff', 'User message text color'],
          [
            '--search-snippet-assistant-message-bg',
            '#f1f3f5',
            'Assistant message bubble background',
          ],
          ['--search-snippet-assistant-message-text', '#212529', 'Assistant message text color'],
          ['--search-snippet-system-message-bg', '#fff3cd', 'System message background'],
          ['--search-snippet-system-message-text', '#856404', 'System message text color'],
        ],
      },
    ],
  },
  {
    id: 'vars-typography',
    title: 'Typography',
    tables: [
      {
        columns: ['Variable', 'Default', 'Description'],
        codeColumns: [0],
        defaultColumns: [1],
        rows: [
          [
            '--search-snippet-font-family',
            '-apple-system, BlinkMacSystemFont, ...',
            'Primary font family stack',
          ],
          [
            '--search-snippet-font-family-mono',
            "'SFMono-Regular', Consolas, ...",
            'Monospace font family stack',
          ],
          ['--search-snippet-font-size-base', '14px', 'Base font size'],
          ['--search-snippet-font-size-sm', '12px', 'Small font size'],
          ['--search-snippet-font-size-lg', '16px', 'Large font size'],
          ['--search-snippet-font-size-xl', '18px', 'Extra large font size'],
          ['--search-snippet-line-height', '1.5', 'Line height'],
          ['--search-snippet-font-weight-normal', '400', 'Normal font weight'],
          ['--search-snippet-font-weight-medium', '500', 'Medium font weight'],
          ['--search-snippet-font-weight-bold', '600', 'Bold font weight'],
        ],
      },
    ],
  },
  {
    id: 'vars-spacing',
    title: 'Spacing',
    tables: [
      {
        columns: ['Variable', 'Default', 'Description'],
        codeColumns: [0],
        defaultColumns: [1],
        rows: [
          ['--search-snippet-spacing-xs', '4px', 'Extra small spacing'],
          ['--search-snippet-spacing-sm', '8px', 'Small spacing'],
          ['--search-snippet-spacing-md', '12px', 'Medium spacing'],
          ['--search-snippet-spacing-lg', '16px', 'Large spacing'],
          ['--search-snippet-spacing-xl', '24px', 'Extra large spacing'],
          ['--search-snippet-spacing-xxl', '32px', 'Double extra large spacing'],
        ],
      },
    ],
  },
  {
    id: 'vars-sizing',
    title: 'Sizing',
    tables: [
      {
        columns: ['Variable', 'Default', 'Description'],
        codeColumns: [0],
        defaultColumns: [1],
        rows: [
          ['--search-snippet-width', '100%', 'Component width'],
          ['--search-snippet-max-width', '100%', 'Maximum width'],
          ['--search-snippet-min-width', '320px', 'Minimum width'],
          ['--search-snippet-max-height', '600px', 'Maximum height (results area)'],
          ['--search-snippet-input-height', '44px', 'Input field height'],
          ['--search-snippet-button-height', '36px', 'Button height'],
          ['--search-snippet-icon-size', '20px', 'Icon size'],
        ],
      },
    ],
  },
  {
    id: 'vars-border',
    title: 'Border',
    tables: [
      {
        columns: ['Variable', 'Default', 'Description'],
        codeColumns: [0],
        defaultColumns: [1],
        rows: [
          ['--search-snippet-border-width', '1px', 'Border width'],
          ['--search-snippet-border-radius', '18px', 'Border radius'],
        ],
      },
    ],
  },
  {
    id: 'vars-shadows',
    title: 'Shadows',
    tables: [
      {
        columns: ['Variable', 'Default', 'Description'],
        codeColumns: [0],
        defaultColumns: [1],
        rows: [
          ['--search-snippet-shadow-sm', '0 1px 2px 0 rgba(0,0,0,0.05)', 'Small shadow'],
          ['--search-snippet-shadow', '0 2px 8px rgba(0,0,0,0.1)', 'Default shadow'],
          ['--search-snippet-shadow-md', '0 4px 12px rgba(0,0,0,0.15)', 'Medium shadow'],
          ['--search-snippet-shadow-lg', '0 8px 24px rgba(0,0,0,0.2)', 'Large shadow'],
          ['--search-snippet-shadow-inner', 'inset 0 2px 4px 0 rgba(0,0,0,0.06)', 'Inner shadow'],
          [
            '--search-snippet-result-item-shadow',
            '0 1px 2px 0 rgba(0,0,0,0.05)',
            'Search result item hover shadow',
          ],
        ],
      },
    ],
  },
  {
    id: 'vars-animation',
    title: 'Animation & Transitions',
    tables: [
      {
        columns: ['Variable', 'Default', 'Description'],
        codeColumns: [0],
        defaultColumns: [1],
        rows: [
          ['--search-snippet-transition-fast', '150ms ease', 'Fast transition timing'],
          ['--search-snippet-transition', '200ms ease', 'Default transition timing'],
          ['--search-snippet-transition-slow', '300ms ease', 'Slow transition timing'],
          ['--search-snippet-animation-duration', '0.2s', 'Animation duration'],
        ],
      },
    ],
  },
  {
    id: 'vars-z-index',
    title: 'Z-Index Layers',
    tables: [
      {
        columns: ['Variable', 'Default', 'Description'],
        codeColumns: [0],
        defaultColumns: [1],
        rows: [
          ['--search-snippet-z-dropdown', '1000', 'Dropdown z-index'],
          ['--search-snippet-z-modal', '1050', 'Modal z-index'],
          ['--search-snippet-z-popover', '1060', 'Popover z-index'],
          ['--search-snippet-z-tooltip', '1070', 'Tooltip z-index'],
        ],
      },
    ],
  },
  {
    id: 'vars-search',
    title: 'Search Specific',
    tables: [
      {
        columns: ['Variable', 'Default', 'Description'],
        codeColumns: [0],
        defaultColumns: [1],
        rows: [
          ['--search-snippet-icon-margin-left', '6px', 'Search icon left margin'],
          ['--search-snippet-button-min-border-radius', '4px', 'Minimum button border radius'],
        ],
      },
    ],
  },
  {
    id: 'vars-chat-bubble',
    title: 'Chat Bubble Specific',
    tables: [
      {
        columns: ['Variable', 'Default', 'Description'],
        codeColumns: [0],
        defaultColumns: [1],
        rows: [
          ['--chat-bubble-button-size', '60px', 'Bubble button size'],
          ['--chat-bubble-button-radius', '50%', 'Bubble button radius'],
          ['--chat-bubble-button-bottom', '20px', 'Button bottom position'],
          ['--chat-bubble-button-right', '20px', 'Button right position'],
          ['--chat-bubble-position', 'fixed', 'Bubble position type'],
          ['--chat-bubble-button-shadow', '0 8px 24px rgba(0,0,0,0.2)', 'Button shadow'],
          ['--chat-bubble-window-shadow', '0 8px 24px rgba(0,0,0,0.2)', 'Chat window shadow'],
          ['--chat-bubble-button-icon-size', '28px', 'Button icon size'],
          ['--chat-bubble-button-icon-color', 'white', 'Button icon color'],
          ['--chat-bubble-button-z-index', '9999', 'Button z-index'],
        ],
      },
    ],
  },
  {
    id: 'translations-keys',
    title: 'Translations',
    description:
      'Pass a `translations` JSON object (HTML) or property (JS) to localize any user-facing string. Omitted keys fall back to the built-in English defaults. Strings with `{n}`, `{total}`, or `{query}` placeholders are interpolated at render time.',
    tables: [
      {
        title: 'Common keys',
        columns: ['Key', 'Default', 'Notes'],
        codeColumns: [0],
        defaultColumns: [1],
        rows: [
          ['placeholder', '"Search..."', 'Search input placeholder'],
          ['chatPlaceholder', '"Type a message..."', 'Chat input placeholder'],
          ['searchButtonLabel', '"Search"', 'Search button text / aria-label'],
          ['sendButtonLabel', '"Send"', 'Chat send button text'],
          ['emptyStateTitle', '"Start Searching"', 'Bar-variant empty state title'],
          [
            'emptyStateDescription',
            '"Enter a query to search for results"',
            'Bar-variant empty state description',
          ],
          ['noResultsTitle', '"No Results Found"', 'Bar-variant no-results title'],
          [
            'noResultsDescription',
            '`No results found for "{query}"`',
            'Bar-variant no-results description; supports {query}',
          ],
          ['resultsCount', '"Found {n} result"', 'Bar count, singular; supports {n}'],
          ['resultsCountPlural', '"Found {n} results"', 'Bar count, plural; supports {n}'],
          [
            'resultsCountOverflow',
            '"Showing {n} of {total} results"',
            'Bar/modal truncated count; supports {n}, {total}',
          ],
          ['errorPrefix', '"Error:"', 'Bold prefix for error messages'],
          [
            'missingApiUrlError',
            '"The api-url attribute is required. …"',
            'Shown when api-url is missing',
          ],
          ['poweredBy', '"Powered by"', 'Branding prefix'],
          ['poweredByLinkLabel', '"Cloudflare AI Search"', 'Branding link label'],
          [
            'loadingMessages',
            'array of 10 English strings',
            'Cycling loading phrases; provide the full array to replace',
          ],
        ],
      },
      {
        title: 'Chat & modal only',
        columns: ['Key', 'Default', 'Notes'],
        codeColumns: [0],
        defaultColumns: [1],
        rows: [
          ['chatTitle', '"Chat"', 'Chat header title'],
          ['chatEmptyTitle', '"Start a Conversation"', 'Chat empty state title'],
          [
            'chatEmptyDescription',
            '"Send a message to begin chatting"',
            'Chat empty state description',
          ],
          ['historyTitle', '"History"', 'Chat-page sidebar heading'],
          ['newChatButton', '"New Chat"', 'Chat-page new-chat button / default session title'],
          ['clearChatButton', '"Clear Chat"', 'Chat-page clear button'],
          ['yesterday', '"Yesterday"', 'Session list relative date'],
          ['navigateHint', '"Navigate"', 'Modal footer hint'],
          ['selectHint', '"Select"', 'Modal footer hint'],
          ['closeHint', '"Close"', 'Modal footer hint'],
        ],
      },
    ],
  },
];
