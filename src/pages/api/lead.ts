// src/pages/api/lead.ts — receives lead-form submissions and stores them in D1.
import type { APIRoute } from 'astro';
import { insertLead } from '../../lib/db';
import { notifyNewLead } from '../../lib/notify';
import { ensureLeadSchema } from '../../lib/leads';
import { slugify } from '../../lib/us-states';

export const prerender = false;

const json = (body: object, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const clean = (v: FormDataEntryValue | null, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export const POST: APIRoute = async ({ request, locals }) => {
  const wantsJson = (request.headers.get('accept') ?? '').includes('application/json');
  const fail = (error: string, status = 400) =>
    wantsJson ? json({ error }, status) : new Response(error, { status });

  const form = await request.formData();

  // Honeypot: pretend success so bots don't learn they were caught.
  if (clean(form.get('company_website'))) return wantsJson ? json({ ok: true }) : new Response(null, { status: 204 });

  if (form.get('consent') !== 'on') return fail('Please tick the box to agree to be contacted about your request.');

  const name = clean(form.get('name'), 100);
  const phone = clean(form.get('phone'), 30);
  const email = clean(form.get('email'), 150);
  const delivery_zip = clean(form.get('delivery_zip'), 5);
  const start_date = clean(form.get('start_date'), 10);
  const duration = clean(form.get('duration'), 30);
  const equipment_slug = clean(form.get('equipment_slug'), 100);
  const state = clean(form.get('state'), 2).toUpperCase();
  // City comes from a hidden field (city/machine pages) or a typed box (state pages)
  const city_slug = clean(form.get('city_slug'), 100) || slugify(clean(form.get('city_text'), 60));
  const page_path = clean(form.get('page_path'), 300);
  const yardRaw = clean(form.get('yard_id'), 12);

  if (!name || !phone || !email || !delivery_zip || !start_date || !duration) return fail('Please fill in every field.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail('Please enter a valid email address.');
  if (!/^\d{5}$/.test(delivery_zip)) return fail('Delivery ZIP must be 5 digits.');
  if (phone.replace(/\D/g, '').length < 10) return fail('Please enter a valid phone number.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start_date)) return fail('Please choose a valid start date.');
  if (!equipment_slug || !state || !city_slug) return fail('Missing request details. Please reload the page.');

  const yard_id = /^\d+$/.test(yardRaw) ? Number(yardRaw) : null;
  const db = locals.runtime.env.DB;

  try {
    await ensureLeadSchema(db);
    await insertLead(db, {
      name, phone, email, delivery_zip, start_date, duration,
      equipment_slug, state, city_slug, yard_id,
      page_url: page_path || null,
    });
  } catch (err) {
    console.error('lead insert failed', err);
    return fail('We could not save your request. Please try again.', 500);
  }

  // Optional email alert to you (does nothing unless RESEND_API_KEY / NOTIFY_EMAIL / NOTIFY_FROM are set).
  await notifyNewLead(
    locals.runtime.env,
    { name, phone, email, delivery_zip, start_date, duration, equipment_slug, state, city_slug },
    new URL(request.url).origin,
  );
  if (wantsJson) return json({ ok: true });
  // No-JS fallback: bounce back to the page the form was on.
  return new Response(null, { status: 303, headers: { Location: `${page_path || '/'}?quote=sent#quote` } });
};
