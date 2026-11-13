// src/lib/admin-guard.ts — one-line "is this visitor logged in as admin?" for every /admin page.
import type { AstroCookies } from 'astro';
import { COOKIE_NAME, sessionIsValid } from './admin-auth';

export async function isAdmin(cookies: AstroCookies, env: { ADMIN_PASSWORD?: string }): Promise<boolean> {
  const password = env.ADMIN_PASSWORD ?? '';
  if (password.length < 8) return false;
  return sessionIsValid(cookies.get(COOKIE_NAME)?.value, password);
}
