import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// Point workspace packages at source during local development.
// NPM package exports intentionally target dist/ for published consumers.
const workspace = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@logscope/react', replacement: workspace('../../packages/react/src/index.tsx') },
      { find: '@logscope/core', replacement: workspace('../../packages/core/src/index.ts') },
      { find: '@logscope/adapter-rest', replacement: workspace('../../packages/adapter-rest/src/index.ts') },
      { find: '@logscope/adapter-sse', replacement: workspace('../../packages/adapter-sse/src/index.ts') },
      { find: '@logscope/adapter-websocket', replacement: workspace('../../packages/adapter-websocket/src/index.ts') },
    ],
  },
  server: { port: 5173 },
});
