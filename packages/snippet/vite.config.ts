import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
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
