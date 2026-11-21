import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // Vite exposes .env values through loadEnv in config files, not import.meta.env.
  // An empty prefix also picks up non-VITE flags such as DISABLE_HMR.
  const env = loadEnv(mode, __dirname, '');
  const backendUrl = env.VITE_BACKEND_URL || 'http://127.0.0.1:3000';
  const disableHmr = env.DISABLE_HMR === 'true' || process.env.DISABLE_HMR === 'true';

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
      hmr: !disableHmr,
      watch: disableHmr ? null : {},
      proxy: {
        '/api': {
          target: backendUrl,
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
          target: backendUrl,
          changeOrigin: true,
        },
        '/socket.io': {
          target: backendUrl,
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
