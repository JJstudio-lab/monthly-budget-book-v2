import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'VITE_');
  const tailnetTestMode = env.VITE_TAILNET_TEST_MODE === 'true';
  const tailnetHost = env.VITE_TAILNET_HOST;

  return {
    root: 'app',
    envDir: '..',
    plugins: [react()],
    server: {
      host: tailnetTestMode && tailnetHost ? tailnetHost : '127.0.0.1',
      ...(tailnetTestMode ? {
        proxy: {
          '/supabase': {
            target: 'http://127.0.0.1:54321',
            rewrite: (path: string) => path.replace(/^\/supabase/, ''),
          },
        },
      } : {}),
    },
    build: { outDir: '../dist', emptyOutDir: true },
    test: { include: ['../src/**/*.{test,spec}.{ts,tsx}'] },
  };
});
