import { spawnSync } from 'node:child_process';

function run(args) {
  const result = spawnSync('supabase', args, { stdio: 'inherit', env: process.env });
  if (result.error?.code === 'ENOENT') {
    console.error('Supabase CLI is not installed. Install it, then rerun this local-only check.');
    process.exit(2);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log('Starting isolated local Supabase only; no linked/remote flags are used.');
run(['start']);
console.log('Replaying all migrations against a fresh local database.');
run(['db', 'reset', '--local']);
console.log('Running pgTAP RLS and RPC authorization tests against local DB.');
run(['test', 'db', '--local']);
console.log('Local migration replay and RLS tests passed.');
