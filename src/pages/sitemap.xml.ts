// /sitemap.xml — the index that points Google at /sitemap/1.xml, /sitemap/2.xml, ...
import type { APIRoute } from 'astro';
import { URLS_PER_SITEMAP, buildUrlList } from '../lib/sitemap';

export const prerender = false;

export const GET: APIRoute = async ({ locals, site }) => {
  const origin = (site ?? new URL('https://rentlocalmachinery.com')).origin;
  const total = (await buildUrlList(locals.runtime.env.DB)).length;
  const files = Math.max(1, Math.ceil(total / URLS_PER_SITEMAP));
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${Array.from({ length: files }, (_, i) => `  <sitemap><loc>${origin}/sitemap/${i + 1}.xml</loc></sitemap>`).join('\n')}
</sitemapindex>
`;
  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=300, s-maxage=3600' },
  });
};
