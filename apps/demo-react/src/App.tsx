import { useEffect, useRef } from 'react';
import './App.css';
import type {
  SearchBarSnippet,
  SearchModalSnippet,
  Translations,
} from '@cloudflare/ai-search-snippet';

// Partial translation map; omitted keys fall back to English defaults.
const SPANISH_TRANSLATIONS: Translations = {
  placeholder: 'Busca aquí...',
  searchButtonLabel: 'Buscar',
  emptyStateTitle: 'Empieza a buscar',
  emptyStateDescription: 'Escribe una consulta para ver resultados',
  noResultsTitle: 'Sin resultados',
  noResultsDescription: 'No hay resultados para "{query}"',
};

function App() {
  const searchBarRef = useRef<SearchBarSnippet>(null);
  const searchModalRef = useRef<SearchModalSnippet>(null);

  // Translations are a rich object — set them imperatively through the ref.
  useEffect(() => {
    if (searchBarRef.current) {
      searchBarRef.current.translations = SPANISH_TRANSLATIONS;
    }
  }, []);

  return (
    <>
      <search-bar-snippet apiUrl="http://localhost:8787" ref={searchBarRef} />
      <br />

      <button
        onClick={() => {
          searchModalRef.current?.open();
        }}
        type="button"
      >
        Show Modal Search (CMD+K)
      </button>

      <search-modal-snippet
        apiUrl="http://localhost:8787"
        ref={searchModalRef}
        translations={JSON.stringify({ placeholder: 'Busca documentación...' })}
      />
    </>
  );
}

export default App;
