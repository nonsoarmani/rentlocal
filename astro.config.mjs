// astro.config.mjs
// Why Astro + SSR on Cloudflare (not full SSG) for 10,000+ pages:
//  - A static build would need every page rendered at build time (slow builds, huge deploys,
//    and Pages has a 20,000-file limit). With SSR on the edge, each page is rendered on first
//    request from D1, then cached by Cloudflare's CDN (see Cache-Control in the page file).
//  - Astro ships zero client JS by default, which is great for Core Web Vitals.
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://rentlocalmachinery.com',
  output: 'server',
  trailingSlash: 'never',
  adapter: cloudflare({
    // Lets `astro dev` talk to a local D1 database via wrangler's platform proxy.
    platformProxy: { enabled: true },
    imageService: 'passthrough',
  }),
  vite: {
    plugins: [tailwindcss()],
  },
});
