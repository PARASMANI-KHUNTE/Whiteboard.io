import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    root: __dirname,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    build: {
      outDir: path.resolve(__dirname, 'dist'),
      emptyOutDir: true,
    },
    server: {
      port: 5173,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
          configure: (proxy) => {
            proxy.on('error', (err: any) => {
              if (err.code === 'ECONNRESET' || err.code === 'ECONNABORTED' || err.code === 'ECONNREFUSED') {
                return;
              }
              console.warn('[Vite Proxy API Error]:', err.message);
            });
          },
        },
        '/auth': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
        },
        '/socket.io': {
          target: 'http://127.0.0.1:3000',
          ws: true,
          changeOrigin: true,
          configure: (proxy) => {
            proxy.on('error', (err: any) => {
              if (err.code === 'ECONNRESET' || err.code === 'ECONNABORTED' || err.code === 'ECONNREFUSED') {
                return;
              }
              console.warn('[Vite Proxy WS Error]:', err.message);
            });
          },
        },
      },
    },
  };
});
