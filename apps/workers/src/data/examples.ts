import { SNIPPET_VERSION } from './snippets.ts';

export type ExampleId = 'html' | 'react' | 'vue';

export interface QuickStartExample {
  id: ExampleId;
  label: string;
  fileName: string;
  language: 'html' | 'jsx';
  code: string;
}

export const QUICK_START_EXAMPLES = [
  {
    id: 'html',
    label: 'HTML',
    fileName: 'index.html',
    language: 'html',
    code: `<!-- Import the library -->
<script type="module" src="https://<hash>.search.ai.cloudflare.com/assets/v${SNIPPET_VERSION}/search-snippet.es.js"></script>

<!-- 1. Chat Bubble Widget (Fixed bottom-right) -->
<chat-bubble-snippet 
    api-url="https://api.example.com">
</chat-bubble-snippet>

<!-- 2. Search Bar Widget -->
<search-bar-snippet 
    api-url="https://api.example.com"
    placeholder="Search..."
    max-results="50"
    max-render-results="10"
    show-url="true"
    show-date="true">
</search-bar-snippet>

<!-- 3. Search Modal (Cmd/Ctrl+K to open) -->
<search-modal-snippet 
    api-url="https://api.example.com"
    placeholder="Search documentation..."
    shortcut="k"
    show-url="true"
    show-date="true">
</search-modal-snippet>

<!-- 4. Full Page Chat (use in dedicated page) -->
<chat-page-snippet 
    api-url="https://api.example.com">
</chat-page-snippet>

<!-- Customize with CSS Variables -->
<style>
    chat-bubble-snippet {
        --search-snippet-primary-color: #F6821F;
        --search-snippet-border-radius: 12px;
    }
</style>`,
  },
  {
    id: 'react',
    label: 'React',
    fileName: 'App.tsx',
    language: 'jsx',
    code: `import "@cloudflare/ai-search-snippet";

// Usage in your app
export default function App() {
  return (
    <div>
      <search-bar-snippet 
        apiUrl="https://api.example.com"
        placeholder="Search..."
        maxResults={50}
        maxRenderResults={10}
        show-url="true"
        show-date="true"
      />

      {/* Chat Bubble - works directly as Web Component */}
      <chat-bubble-snippet 
        apiUrl="https://api.example.com"
        style={{ '--search-snippet-primary-color': '#F6821F' } as React.CSSProperties}
      />

      {/* Search Modal with keyboard shortcut */}
      <search-modal-snippet 
        apiUrl="https://api.example.com"
        placeholder="Search documentation..."
        shortcut="k"
        show-url="true"
        show-date="true"
      />
    </div>
  );
}

// TypeScript declarations see example here: https://github.com/cloudflare/ai-search-snippet/blob/main/demos/react/index.d.ts`,
  },
  {
    id: 'vue',
    label: 'Vue',
    fileName: 'App.vue',
    language: 'html',
    code: `<script setup lang="ts">
import "@cloudflare/ai-search-snippet";
import { ref } from 'vue';

const apiUrl = 'https://api.example.com';
const searchPlaceholder = ref('Search...');
const maxResults = ref(50);
const maxRenderResults = ref(10);

// Handle custom events from components
function onSearchComplete(event: CustomEvent) {
  console.log('Search results:', event.detail);
}

function onChatMessage(event: CustomEvent) {
  console.log('Chat message:', event.detail);
}
</script>

<template>
  <div>
    <!-- Search Bar with v-bind -->
    <search-bar-snippet
      :api-url="apiUrl"
      :placeholder="searchPlaceholder"
      :max-results="maxResults"
      :max-render-results="maxRenderResults"
      show-url="true"
      show-date="true"
      @search-complete="onSearchComplete"
    />

    <!-- Chat Bubble Widget -->
    <chat-bubble-snippet
      :api-url="apiUrl"
      placeholder="Ask me anything..."
      @chat-message="onChatMessage"
    />

    <!-- Search Modal (Cmd/Ctrl+K) -->
    <search-modal-snippet
      :api-url="apiUrl"
      placeholder="Search documentation..."
      shortcut="k"
      show-url="true"
      show-date="true"
    />

    <!-- Full Page Chat -->
    <chat-page-snippet
      :api-url="apiUrl"
      class="chat-container"
    />
  </div>
</template>

<style>
/* Customize with CSS Variables */
search-bar-snippet,
chat-bubble-snippet {
  --search-snippet-primary-color: #F6821F;
  --search-snippet-border-radius: 12px;
}

.chat-container {
  height: 500px;
}
</style>

<!-- vite.config.ts - Configure Vue to recognize custom elements -->
<!--
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => tag.includes('-snippet')
        }
      }
    })
  ]
});
-->`,
  },
] as const satisfies readonly QuickStartExample[];
