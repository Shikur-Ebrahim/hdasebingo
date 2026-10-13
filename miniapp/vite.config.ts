import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, host: true },
  build: {
    outDir: 'dist',
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,   // Remove all console.log in production
        drop_debugger: true,
      },
    },
    rollupOptions: {
      output: {
        // Split vendor libraries into separate cacheable chunks
        manualChunks: {
          react: ['react', 'react-dom'],
          router: ['react-router-dom'],
          zustand: ['zustand'],
        },
      },
    },
    // Increase chunk warning limit
    chunkSizeWarningLimit: 600,
  },
});
