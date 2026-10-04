import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so `dist/` can be opened from any path, or served from a
  // subdirectory, without rebuilding. An absolute '/' base 404s every asset
  // when the build is hosted anywhere other than the web root.
  base: './',
  server: {
    port: 5173,
    open: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2020',
    // Three.js alone is ~500 kB. Splitting it into its own chunk means the
    // application code can be re-downloaded on its own when it changes, and
    // the engine stays in the browser cache across deploys.
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
        },
      },
    },
    // The single-chunk warning fires at 500 kB, but the bundle is dominated by
    // Three.js which is expected and unavoidable for this project. Raising the
    // limit keeps the warning meaningful for real regressions.
    chunkSizeWarningLimit: 900,
  },
});
