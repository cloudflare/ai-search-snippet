import type { SnippetId } from './snippets.ts';

export type PropInputType = 'text' | 'number' | 'boolean' | 'select';
export type CssVarInputType = 'color' | 'text';
export type ThemeMode = 'light' | 'dark';

export interface PropConfig {
  name: string;
  type: PropInputType;
  defaultValue: boolean | number | string;
  description: string;
  appliesTo: SnippetId[];
  options?: string[];
}

export interface CssVarConfig {
  name: string;
  type: CssVarInputType;
  category: string;
  description: string;
  defaultValue?: string;
  lightDefault?: string;
  darkDefault?: string;
  themeable?: boolean;
}

export const DEMO_API_URL =
  'https://70b18965-6ccb-40df-902d-313de9c5c89e.search.ai.cloudflare.com/';

export function createPropConfigs(defaultApiUrl = ''): readonly PropConfig[] {
  return [
    {
      name: 'api-url',
      type: 'text',
      defaultValue: defaultApiUrl,
      description: 'API endpoint URL',
      appliesTo: ['search-bar', 'search-modal', 'chat-bubble', 'chat-page'],
    },
    {
      name: 'placeholder',
      type: 'text',
      defaultValue: 'Type a message...',
      description: 'Input placeholder text',
      appliesTo: ['search-bar', 'search-modal', 'chat-bubble', 'chat-page'],
    },
    {
      name: 'max-results',
      type: 'number',
      defaultValue: 50,
      description: 'Maximum number of results to request from the API',
      appliesTo: ['search-bar', 'search-modal'],
    },
    {
      name: 'max-render-results',
      type: 'number',
      defaultValue: 10,
      description: 'Maximum number of results rendered in the UI',
      appliesTo: ['search-bar', 'search-modal'],
    },
    {
      name: 'debounce-ms',
      type: 'number',
      defaultValue: 300,
      description: 'Debounce delay in milliseconds',
      appliesTo: ['search-bar', 'search-modal'],
    },
    {
      name: 'show-url',
      type: 'boolean',
      defaultValue: false,
      description: 'Show URL in search results',
      appliesTo: ['search-bar', 'search-modal'],
    },
    {
      name: 'show-date',
      type: 'boolean',
      defaultValue: false,
      description: 'Show result dates when a timestamp is available',
      appliesTo: ['search-bar', 'search-modal'],
    },
    {
      name: 'hide-thumbnails',
      type: 'boolean',
      defaultValue: false,
      description: 'Hide result thumbnails',
      appliesTo: ['search-bar', 'search-modal'],
    },
    {
      name: 'see-more',
      type: 'text',
      defaultValue: '',
      description: 'URL for "See more" link (query appended)',
      appliesTo: ['search-bar', 'search-modal'],
    },
    {
      name: 'theme',
      type: 'select',
      options: ['light', 'dark', 'auto'],
      defaultValue: 'auto',
      description: 'Color theme',
      appliesTo: ['search-bar', 'search-modal', 'chat-bubble', 'chat-page'],
    },
    {
      name: 'shortcut',
      type: 'text',
      defaultValue: 'k',
      description: 'Keyboard shortcut key',
      appliesTo: ['search-modal'],
    },
    {
      name: 'use-meta-key',
      type: 'select',
      options: ['true', 'false'],
      defaultValue: 'true',
      description: 'Use Cmd/Ctrl modifier',
      appliesTo: ['search-modal'],
    },
    {
      name: 'hide-branding',
      type: 'boolean',
      defaultValue: false,
      description: 'Hide branding',
      appliesTo: ['search-bar', 'search-modal', 'chat-bubble', 'chat-page'],
    },
  ];
}

export const CSS_VAR_CONFIGS: readonly CssVarConfig[] = [
  {
    name: '--search-snippet-primary-color',
    type: 'color',
    lightDefault: '#F6821F',
    darkDefault: '#FBAD41',
    description: 'Primary brand color',
    category: 'Primary Colors',
    themeable: true,
  },
  {
    name: '--search-snippet-primary-hover',
    type: 'color',
    lightDefault: '#FBAD41',
    darkDefault: '#F6821F',
    description: 'Primary hover state color',
    category: 'Primary Colors',
    themeable: true,
  },
  {
    name: '--search-snippet-focus-ring',
    type: 'color',
    lightDefault: '#F6821F40',
    darkDefault: '#FBAD4140',
    description: 'Focus ring color (with opacity)',
    category: 'Primary Colors',
    themeable: true,
  },
  {
    name: '--search-snippet-background',
    type: 'color',
    lightDefault: '#ffffff',
    darkDefault: '#1a1a1a',
    description: 'Main background color',
    category: 'Background Colors',
    themeable: true,
  },
  {
    name: '--search-snippet-surface',
    type: 'color',
    lightDefault: '#f8f9fa',
    darkDefault: '#262626',
    description: 'Surface/card background',
    category: 'Background Colors',
    themeable: true,
  },
  {
    name: '--search-snippet-hover-background',
    type: 'color',
    lightDefault: '#f1f3f5',
    darkDefault: '#333333',
    description: 'Hover state background',
    category: 'Background Colors',
    themeable: true,
  },
  {
    name: '--search-snippet-text-color',
    type: 'color',
    lightDefault: '#212529',
    darkDefault: '#f1f1f1',
    description: 'Primary text color',
    category: 'Text Colors',
    themeable: true,
  },
  {
    name: '--search-snippet-text-secondary',
    type: 'color',
    lightDefault: '#6c757d',
    darkDefault: '#a0a0a0',
    description: 'Secondary/muted text',
    category: 'Text Colors',
    themeable: true,
  },
  {
    name: '--search-snippet-text-description',
    type: 'color',
    lightDefault: '#495057',
    darkDefault: '#adb5bd',
    description: 'Search result description text',
    category: 'Text Colors',
    themeable: true,
  },
  {
    name: '--search-snippet-border-color',
    type: 'color',
    lightDefault: '#dee2e6',
    darkDefault: '#404040',
    description: 'Border color',
    category: 'Border Colors',
    themeable: true,
  },
  {
    name: '--search-snippet-font-size-base',
    type: 'text',
    defaultValue: '14px',
    description: 'Base font size',
    category: 'Typography',
  },
  {
    name: '--search-snippet-border-radius',
    type: 'text',
    defaultValue: '18px',
    description: 'Border radius',
    category: 'Border',
  },
  {
    name: '--chat-bubble-button-size',
    type: 'text',
    defaultValue: '60px',
    description: 'Bubble button size',
    category: 'Chat Bubble',
  },
  {
    name: '--chat-bubble-button-bottom',
    type: 'text',
    defaultValue: '20px',
    description: 'Button bottom position',
    category: 'Chat Bubble',
  },
  {
    name: '--chat-bubble-button-right',
    type: 'text',
    defaultValue: '20px',
    description: 'Button right position',
    category: 'Chat Bubble',
  },
];
