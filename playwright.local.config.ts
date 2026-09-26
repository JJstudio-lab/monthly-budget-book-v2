import { execFileSync } from 'node:child_process';
import { defineConfig, devices } from '@playwright/test';

const status = execFileSync('npm', ['exec', '--', 'supabase', 'status', '-o', 'env'], { encoding: 'utf8' });
const localEnv = Object.fromEntries(status.split(/\r?\n/).flatMap((line) => {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  return match ? [[match[1], match[2].replace(/^['"]|['"]$/g, '')]] : [];
}));
const apiUrl = localEnv.API_URL;
const anonKey = localEnv.ANON_KEY;
if (!apiUrl || !anonKey || !['127.0.0.1', 'localhost'].includes(new URL(apiUrl).hostname)) {
  throw new Error('Local Supabase API and anon key are required for this test config.');
}

export default defineConfig({
  testDir: './e2e',
  testMatch: ['shared-ledger.spec.ts', 'category-budget.spec.ts', 'local-acceptance.spec.ts', 'transaction-ux.spec.ts', 'transaction-list-ux.spec.ts'],
  fullyParallel: false,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5174', trace: 'retain-on-failure', ...devices['Desktop Chrome'] },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5174 --strictPort',
    url: 'http://127.0.0.1:5174',
    reuseExistingServer: false,
    timeout: 30_000,
    env: { VITE_DEMO_MODE: 'false', VITE_SUPABASE_URL: apiUrl, VITE_SUPABASE_ANON_KEY: anonKey },
  },
});
