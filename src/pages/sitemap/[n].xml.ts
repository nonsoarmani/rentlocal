// /sitemap/1.xml, /sitemap/2.xml, ... — up to 10,000 page URLs each.
import type { APIRoute } from 'astro';
import { URLS_PER_SITEMAP, buildUrlList, xmlEscape } from '../../lib/sitemap';

export const prerender = false;

export const GET: APIRoute = async ({ params, locals, site }) => {
  const n = Number(params.n);
  if (!Number.isInteger(n) || n < 1) return new Response(null, { status: 404 });
  const origin = (site ?? new URL('https://rentlocalmachinery.com')).origin;
  const urls = (await buildUrlList(locals.runtime.env.DB)).slice((n - 1) * URLS_PER_SITEMAP, n * URLS_PER_SITEMAP);
  if (urls.length === 0 && n > 1) return new Response(null, { status: 404 });
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${xmlEscape(origin + u)}</loc></url>`).join('\n')}
</urlset>
`;
  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=300, s-maxage=3600' },
  });
};
