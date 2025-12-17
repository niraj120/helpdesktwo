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
    build: {
      outDir: 'dist',
      sourcemap: isProduction ? false : true, // Disable sourcemaps in production
      minify: 'esbuild',
      // Ensure assets are properly referenced
      assetsDir: 'assets',
      // Generate manifest for better caching
      manifest: true,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom', 'react-router-dom'],
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