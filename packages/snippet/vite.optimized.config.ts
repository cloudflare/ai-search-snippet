import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8')
) as { version: string };

export default defineConfig({
  define: {
    __SNIPPET_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    dts({
      exclude: ['src/main.ts', 'src/**/*.test.ts'],
      include: ['src'],
      rollupTypes: true,
      tsconfigPath: './tsconfig.json',
    }),
  ],
  build: {
    emptyOutDir: false,
    lib: {
      entry: {
        chat: './src/entries/chat.ts',
        search: './src/entries/search.ts',
      },
      formats: ['es'],
      fileName: (_format, entryName) => `search-snippet.${entryName}.es.js`,
    },
    manifest: 'manifest.json',
    minify: 'esbuild',
    outDir: 'dist',
    reportCompressedSize: true,
    rollupOptions: {
      output: {
        chunkFileNames: 'chunks/[name]-[hash].js',
      },
    },
    sourcemap: true,
    target: 'es2020',
  },
  optimizeDeps: {
    include: [],
  },
});
