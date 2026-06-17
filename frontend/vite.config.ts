import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const isProduction = mode === 'production';
  
  return {
    plugins: [react()],
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
          manualChunks: (id) => {
            // Node modules chunking strategy
            if (id.includes('node_modules')) {
              // Core React - always needed, load first
              if (id.includes('react-dom') || id.includes('/react/') || id.includes('react-router')) {
                return 'vendor-react';
              }
              
              // UI component libraries
              if (id.includes('@headlessui') || id.includes('@heroicons')) {
                return 'vendor-ui';
              }
              
              // Form handling
              if (id.includes('react-hook-form') || id.includes('yup') || id.includes('zod')) {
                return 'vendor-forms';
              }
              
              // Data fetching & state
              if (id.includes('@tanstack/react-query') || id.includes('axios')) {
                return 'vendor-query';
              }
              
              // Rich text editor (heavy - ~200KB) - only loads with KB pages
              if (id.includes('react-quill') || id.includes('quill')) {
                return 'vendor-editor';
              }
              
              // PDF export (heavy - ~300KB) - uses dynamic import
              if (id.includes('jspdf')) {
                return 'vendor-pdf';
              }
              
              // Excel export (heavy - ~500KB) - uses dynamic import, separate chunk
              if (id.includes('xlsx')) {
                return 'vendor-xlsx';
              }
              
              // HTML to canvas (for screenshots/exports)
              if (id.includes('html2canvas')) {
                return 'vendor-canvas';
              }
              
              // Drag & drop - only loads with KB level management
              if (id.includes('react-beautiful-dnd') || id.includes('beautiful-dnd')) {
                return 'vendor-dnd';
              }
              
              // Internationalization
              if (id.includes('i18next')) {
                return 'vendor-i18n';
              }
              
              // Date utilities
              if (id.includes('date-fns')) {
                return 'vendor-date';
              }
              
              // Icons - consolidate all icon libraries
              if (id.includes('lucide-react') || id.includes('react-icons') || id.includes('@heroicons')) {
                return 'vendor-icons';
              }
              
              // Other smaller vendor libraries
              return 'vendor-common';
            }
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