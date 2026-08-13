import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // `''` prefix loads every key, not just VITE_* — the proxy needs API_PORT.
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
      proxy: {
        // Keeps the browser on one origin, so DATABASE_URL never leaves the server.
        '/api': {
          target: `http://localhost:${env.API_PORT || 4000}`,
          changeOrigin: true,
        },
      },
    },
    build: {
      rollupOptions: {
        output: {
          // Vendor code changes far less often than app code; splitting it keeps
          // the long-lived chunks cacheable and each bundle under the size warning.
          manualChunks(id) {
            // pnpm paths embed peer versions, so resolve the real package name
            // from the last `node_modules/` segment instead of substring matching.
            const marker = 'node_modules/';
            const index = id.lastIndexOf(marker);
            if (index === -1) return undefined;

            const rest = id.slice(index + marker.length);
            const segments = rest.split('/');
            const pkg = rest.startsWith('@') ? `${segments[0]}/${segments[1]}` : segments[0];

            if (['react', 'react-dom', 'scheduler'].includes(pkg)) return 'react';
            if (pkg.startsWith('@radix-ui/')) return 'radix';
            if (pkg.startsWith('@tanstack/')) return 'query';
            if (['react-hook-form', 'zod'].includes(pkg) || pkg.startsWith('@hookform/')) {
              return 'forms';
            }
            if (pkg === 'lucide-react') return 'icons';
            return 'vendor';
          },
        },
      },
    },
  };
});
