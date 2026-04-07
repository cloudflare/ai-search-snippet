import { useRef, useState } from 'react';
import viteLogo from '/vite.svg';
import reactLogo from './assets/react.svg';
import './App.css';
import type { SearchModalSnippet } from '@cloudflare/ai-search-snippet';

function App() {
  const [count, setCount] = useState(0);

  const searchModalRef = useRef<SearchModalSnippet>(null);

  return (
    <>
      <div>
        <a href="https://vite.dev" target="_blank" rel="noopener">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank" rel="noopener">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>Vite + React</h1>
      <div className="card">
        <button onClick={() => setCount((count) => count + 1)} type="button">
          count is {count}
        </button>
        <p>
          Edit <code>src/App.tsx</code> and save to test HMR
        </p>
      </div>
      <p className="read-the-docs">Click on the Vite and React logos to learn more</p>
      <search-bar-snippet apiUrl="http://localhost:8787" />
      <br />

      <button
        onClick={() => {
          searchModalRef.current?.open();
        }}
        type="button"
      >
        Show Modal Search (CMD+K)
      </button>

      <search-modal-snippet api-url="http://localhost:8787" ref={searchModalRef} />
    </>
  );
}

export default App;
