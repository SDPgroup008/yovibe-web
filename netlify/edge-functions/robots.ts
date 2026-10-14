type EdgeRuntimeGlobals = typeof globalThis & {
  Netlify?: { env?: { get(name: string): string | undefined } };
  Deno?: { env?: { get(name: string): string | undefined } };
};

function getEdgeEnv(name: string): string | undefined {
  const runtime = globalThis as EdgeRuntimeGlobals;
  try {
    const value = runtime.Netlify?.env?.get(name);
    if (value) return value;
  } catch {
    // Use the Deno fallback in local or older Edge runtimes.
  }
  try {
    return runtime.Deno?.env?.get(name);
  } catch {
    return undefined;
  }
}

export function robotsBody(appEnvironment?: string): string {
  if (String(appEnvironment || '').toLowerCase() === 'staging') {
    return '# Staging is intentionally excluded from search engines.\nUser-agent: *\nDisallow: /\n';
  }
  return 'User-agent: *\nAllow: /\n\nSitemap: https://yovibe.net/sitemap.xml\n';
}

export default async () => new Response(robotsBody(getEdgeEnv('APP_ENV')), {
  status: 200,
  headers: {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'public, max-age=300, s-maxage=300',
  },
});
