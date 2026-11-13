/// <reference path="../.astro/types.d.ts" />

// Typed access to the D1 binding: Astro.locals.runtime.env.DB
type D1Database = import('@cloudflare/workers-types').D1Database;
type Runtime = import('@astrojs/cloudflare').Runtime<Env>;

interface Env {
  DB: D1Database;
  /** Secret set in Cloudflare (Settings → Variables and Secrets). Protects /admin. */
  ADMIN_PASSWORD?: string;
  /** Optional lead-alert emails (Resend). See src/lib/notify.ts */
  RESEND_API_KEY?: string;
  NOTIFY_EMAIL?: string;
  NOTIFY_FROM?: string;
}

declare namespace App {
  interface Locals extends Runtime {}
}
