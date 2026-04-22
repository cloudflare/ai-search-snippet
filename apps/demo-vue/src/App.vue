<script setup lang="ts">
import HelloWorld from './components/HelloWorld.vue';
import '@cloudflare/ai-search-snippet';
import type { Translations } from '@cloudflare/ai-search-snippet';
import { useTemplateRef } from 'vue';

const modalSearch = useTemplateRef('modalSearch');

// Partial translation map; omitted keys fall back to English defaults.
const spanishTranslations: Translations = {
  placeholder: 'Busca aquí...',
  searchButtonLabel: 'Buscar',
  emptyStateTitle: 'Empieza a buscar',
  emptyStateDescription: 'Escribe una consulta para ver resultados',
  noResultsTitle: 'Sin resultados',
  noResultsDescription: 'No hay resultados para "{query}"',
};
</script>

<template>
  <div>
    <a href="https://vite.dev" target="_blank">
      <img src="/vite.svg" class="logo" alt="Vite logo" />
    </a>
    <a href="https://vuejs.org/" target="_blank">
      <img src="./assets/vue.svg" class="logo vue" alt="Vue logo" />
    </a>
  </div>
  <HelloWorld msg="Vite + Vue" />
  <!-- Vue routes rich object bindings to the matching property on custom elements -->
  <search-bar-snippet
    apiUrl="http://localhost:8787"
    :translations="spanishTranslations"
  />
  <br />
  <button @click="modalSearch.open()">Show Modal Search (CMD+K)</button>

  <search-modal-snippet apiUrl="http://localhost:8787" ref="modalSearch" />
</template>

<style scoped>
.logo {
  height: 6em;
  padding: 1.5em;
  will-change: filter;
  transition: filter 300ms;
}
.logo:hover {
  filter: drop-shadow(0 0 2em #646cffaa);
}
.logo.vue:hover {
  filter: drop-shadow(0 0 2em #42b883aa);
}
</style>
