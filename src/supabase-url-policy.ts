export type SupabaseUrlPolicyOptions = {
  isDevelopment: boolean;
  tailnetTestMode?: boolean;
  tailnetHost?: string;
};

export function assertSupabaseUrlAllowed(url: string, options: SupabaseUrlPolicyOptions): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Invalid Supabase URL.');
  }

  const hasUnsafeUrlParts = Boolean(
    parsed.username || parsed.password || parsed.search || parsed.hash,
  );
  const isLoopback = ['127.0.0.1', 'localhost'].includes(parsed.hostname);
  const isTailnetProxy = options.tailnetTestMode === true
    && typeof options.tailnetHost === 'string'
    && options.tailnetHost.length > 0
    && parsed.hostname === options.tailnetHost.toLowerCase()
    && parsed.port === '5173'
    && parsed.pathname === '/supabase/';

  if (options.isDevelopment) {
    const isLocalSupabase = parsed.protocol === 'http:'
      && isLoopback
      && parsed.port === '54321'
      && parsed.pathname === '/';
    const isAllowedTailnetProxy = parsed.protocol === 'http:' && isTailnetProxy;
    if (hasUnsafeUrlParts || (!isLocalSupabase && !isAllowedTailnetProxy)) {
      throw new Error('安全限制：開發版僅允許連線至本機 Supabase；Tailnet 測試須明確啟用本機代理。');
    }
    return;
  }

  const isSupabaseCloudHost = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.supabase\.co$/.test(parsed.hostname);
  if (
    hasUnsafeUrlParts
    || parsed.protocol !== 'https:'
    || parsed.port !== ''
    || parsed.pathname !== '/'
    || !isSupabaseCloudHost
  ) {
    throw new Error('安全限制：production frontend 必須使用乾淨的 HTTPS Supabase Cloud project URL。');
  }
}
