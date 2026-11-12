// src/lib/admin-auth.ts
// Password login for /admin without any extra database tables.
//
// How it works:
//  - The password lives ONLY in a Cloudflare secret called ADMIN_PASSWORD (never in the code or GitHub).
//  - After a correct login we hand the browser a cookie containing an expiry time plus a signature
//    (HMAC) made with the password. Nobody can forge it without knowing the password, and changing
//    the password instantly logs everyone out.

export const COOKIE_NAME = 'rlm_admin';
export const SESSION_HOURS = 12;

const enc = new TextEncoder();

async function hmacHex(key: string, message: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time string comparison (does not leak how many characters matched). */
function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Compare a typed password with the real one without timing leaks. */
export async function passwordMatches(typed: string, real: string): Promise<boolean> {
  const [a, b] = await Promise.all([hmacHex('compare', typed), hmacHex('compare', real)]);
  return sameString(a, b);
}

export async function makeSessionValue(password: string): Promise<string> {
  const expires = Date.now() + SESSION_HOURS * 3600 * 1000;
  return `${expires}.${await hmacHex(password, `admin-session:${expires}`)}`;
}

export async function sessionIsValid(cookieValue: string | undefined, password: string): Promise<boolean> {
  if (!cookieValue || !password) return false;
  const [expires, signature] = cookieValue.split('.');
  if (!expires || !signature || !/^\d+$/.test(expires) || Number(expires) < Date.now()) return false;
  return sameString(signature, await hmacHex(password, `admin-session:${expires}`));
}
