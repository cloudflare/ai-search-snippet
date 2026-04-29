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
      rollupTypes: true,
      tsconfigPath: './tsconfig.json',
    }),
  ],
  build: {
    lib: {
      entry: './src/main.ts',
      name: 'SearchSnippet',
      formats: ['es', 'umd'],
      fileName: (format) => `search-snippet.${format}.js`,
    },
    rollupOptions: {
      output: {
        // Ensure CSS is inlined in JS
        inlineDynamicImports: true,
        // Provide global names for UMD build
        globals: {},
        // Use named exports only
        exports: 'named',
      },
    },

    target: 'es2020',
    minify: 'esbuild',
    sourcemap: true,
    // Optimize bundle size
    reportCompressedSize: true,
    chunkSizeWarningLimit: 100,
  },
  // Optimize dependencies
  optimizeDeps: {
    include: [],
  },
});
