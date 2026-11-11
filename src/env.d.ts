/// <reference path="../.astro/types.d.ts" />

// Typed access to the D1 binding: Astro.locals.runtime.env.DB
type D1Database = import('@cloudflare/workers-types').D1Database;
type Runtime = import('@astrojs/cloudflare').Runtime<Env>;

interface Env {
  DB: D1Database;
}

declare namespace App {
  interface Locals extends Runtime {}
}
