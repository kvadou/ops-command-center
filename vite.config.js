import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react({
    include: /\.(jsx|js)$/,
    jsxRuntime: 'automatic',
  })],
  esbuild: {
    loader: 'jsx',
    include: /src\/.*\.jsx?$/,
    exclude: [],
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        '.js': 'jsx',
      },
    },
  },
  server: {
    port: 3001,
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
        timeout: 60000, // 60 seconds timeout for large PDF files
        proxyTimeout: 60000,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'mui-vendor': [
            '@mui/material',
            '@mui/x-charts',
            '@mui/x-data-grid',
            '@mui/x-date-pickers',
          ],
          'chart-vendor': ['chart.js', 'react-chartjs-2', 'recharts'],
          'utils-vendor': ['axios', 'dayjs', 'luxon'],
          'editor-vendor': [
            '@tiptap/extension-bubble-menu', '@tiptap/extension-color',
            '@tiptap/extension-floating-menu', '@tiptap/extension-highlight',
            '@tiptap/extension-image', '@tiptap/extension-link',
            '@tiptap/extension-mention', '@tiptap/extension-placeholder',
            '@tiptap/extension-table', '@tiptap/extension-text-align',
            '@tiptap/extension-text-style', '@tiptap/extension-underline',
            '@tiptap/react', '@tiptap/starter-kit',
          ],
          'pdf-vendor': ['react-pdf', 'pdfjs-dist'],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    // Only expose specific env vars to the client (never leak secrets)
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
  },
  envPrefix: ['VITE_', 'REACT_APP_'], // Support both VITE_ and REACT_APP_ prefixes
});

