import { describe, expect, it } from 'vitest';
import { assertSupabaseUrlAllowed } from './supabase-url-policy';

describe('Supabase URL policy', () => {
  it('allows a clean HTTPS Supabase Cloud project URL in production', () => {
    expect(() => assertSupabaseUrlAllowed(
      'https://rxueruaiunqzgyxicrgy.supabase.co',
      { isDevelopment: false },
    )).not.toThrow();
  });

  it('rejects local, non-Supabase, and decorated URLs in production', () => {
    for (const url of [
      'http://127.0.0.1:54321',
      'http://localhost:54321',
      'http://rxueruaiunqzgyxicrgy.supabase.co',
      'https://example.invalid',
      'https://rxueruaiunqzgyxicrgy.supabase.co.evil.invalid',
      'https://rxueruaiunqzgyxicrgy.supabase.co:8443',
      'https://rxueruaiunqzgyxicrgy.supabase.co/path',
      'https://user:password@rxueruaiunqzgyxicrgy.supabase.co',
      'https://rxueruaiunqzgyxicrgy.supabase.co/?redirect=example.invalid',
      'https://rxueruaiunqzgyxicrgy.supabase.co/#fragment',
    ]) {
      expect(() => assertSupabaseUrlAllowed(url, { isDevelopment: false })).toThrow();
    }
  });

  it('allows only the local Supabase endpoint in development by default', () => {
    expect(() => assertSupabaseUrlAllowed(
      'http://127.0.0.1:54321',
      { isDevelopment: true },
    )).not.toThrow();
    expect(() => assertSupabaseUrlAllowed(
      'https://rxueruaiunqzgyxicrgy.supabase.co',
      { isDevelopment: true },
    )).toThrow();

    for (const url of [
      'http://127.0.0.1:54322',
      'http://localhost:54321/other-path',
      'http://user@127.0.0.1:54321',
      'http://127.0.0.1:54321/?project=other',
    ]) {
      expect(() => assertSupabaseUrlAllowed(url, { isDevelopment: true })).toThrow();
    }
  });

  it('allows only the explicitly enabled Tailnet Supabase proxy in development', () => {
    expect(() => assertSupabaseUrlAllowed(
      'http://my-tailnet-host:5173/supabase/',
      { isDevelopment: true, tailnetTestMode: true, tailnetHost: 'my-tailnet-host' },
    )).not.toThrow();

    for (const [url, tailnetTestMode] of [
      ['http://my-tailnet-host:5173/supabase/', false],
      ['http://other-host:5173/supabase/', true],
      ['http://my-tailnet-host:5173/other-path/', true],
      ['http://user@my-tailnet-host:5173/supabase/', true],
    ] as const) {
      expect(() => assertSupabaseUrlAllowed(url, {
        isDevelopment: true,
        tailnetTestMode,
        tailnetHost: 'my-tailnet-host',
      })).toThrow();
    }
  });
});
