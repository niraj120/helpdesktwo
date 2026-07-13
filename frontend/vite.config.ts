import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const isProduction = mode === 'production';
  
  return {
    plugins: [
      react({
        jsxImportSource: '@/utils/csp-jsx-runtime',
      }),
    ],
    server: {
      port: 3001,
      strictPort: true,
      host: true, // Allow external access
      allowedHosts: [
        'localhost',
        '127.0.0.1',
        'helpdesk.hubblehox.ai',
        '.hubblehox.ai', // Allow all subdomains
      ],
      // Only use proxy in local development
      ...(!isProduction ? {
        proxy: {
          '/api': {
            target: 'http://localhost:3003',
            changeOrigin: true,
          },
        },
        hmr: {
          clientPort: 3001,
        },
      } : {}),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    // CSS optimization settings
    css: {
      devSourcemap: !isProduction,
      // CSS modules configuration
      modules: {
        localsConvention: 'camelCase',
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false, // Never emit source maps in production builds (VAPT CODE-2 / CWE-209)
      minify: 'esbuild',
      // CSS code splitting - separate CSS files for better caching
      cssCodeSplit: true,
      // Target modern browsers for smaller bundles
      target: 'es2020',
      // Ensure assets are properly referenced
      assetsDir: 'assets',
      // Generate manifest for better caching
      manifest: true,
      // Increase chunk size warning limit (some vendor chunks are intentionally large)
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          // ============================================================================
          // PERFORMANCE OPTIMIZATION: Manual Chunk Splitting
          // ============================================================================
          // Heavy libraries are split into separate chunks to enable:
          // 1. Better caching - unchanged chunks stay cached
          // 2. Parallel loading - browser can load multiple chunks
          // 3. On-demand loading - chunks only load when needed
          //
          // NOTE: xlsx is NOT included here - it uses dynamic import for on-demand loading
          // ============================================================================
          // Only isolate HEAVY, LEAF libraries (each depends one-way on the
          // shared `vendor` chunk and nothing imports it back, so it cannot form
          // a cross-chunk cycle). Everything else — React core, router, forms
          // (react-hook-form / yup / @hookform/resolvers), query, UI, icons,
          // i18n, date utils — MUST stay together in a single `vendor` chunk.
          //
          // The previous strategy split these interdependent packages across
          // separate chunks (e.g. react-hook-form/yup in vendor-forms but
          // @hookform/resolvers in vendor-common), creating a circular import
          // whose minified output crashed at module init with
          // "Cannot access 'X' before initialization" (temporal dead zone),
          // white-screening the production app.
          manualChunks: (id) => {
            if (!id.includes('node_modules')) return;

            // Excel export (~500KB) — code-split via dynamic import in app code
            if (id.includes('xlsx')) return 'vendor-xlsx';
            // PDF export (~300KB) — dynamic import
            if (id.includes('jspdf')) return 'vendor-pdf';
            // Rich text editor (~200KB)
            if (id.includes('react-quill') || id.includes('quill'))
              return 'vendor-editor';
            // HTML to canvas (screenshots / exports)
            if (id.includes('html2canvas')) return 'vendor-canvas';
            // Charts (recharts only — its d3 deps stay in `vendor` to avoid a cycle)
            if (id.includes('recharts')) return 'vendor-charts';
            // Drag & drop
            if (
              id.includes('@dnd-kit') ||
              id.includes('@hello-pangea/dnd') ||
              id.includes('react-beautiful-dnd') ||
              id.includes('beautiful-dnd')
            ) {
              return 'vendor-dnd';
            }

            // All remaining (interdependent) node_modules share one chunk.
            return 'vendor';
          },
        },
      },
    },
    // Set base path for production
    base: '/',
    // Explicitly define mode-based settings
    define: {
      'import.meta.env.MODE': JSON.stringify(mode),
      'process.env.NODE_ENV': JSON.stringify(isProduction ? 'production' : 'development'),
    },
  };
});
