// src/lib/notify.ts — optional email alert when a new lead arrives (via Resend, resend.com).
// If the three settings below are not configured, this quietly does nothing and the lead still
// appears in /admin/leads.
//
//   RESEND_API_KEY  (secret)  from resend.com → API Keys
//   NOTIFY_EMAIL    (text)    where alerts go; several allowed, comma-separated
//   NOTIFY_FROM     (text)    e.g. "RentLocalMachinery <leads@yourdomain.com>" — the domain must be verified in Resend

export interface NotifyEnv {
  RESEND_API_KEY?: string;
  NOTIFY_EMAIL?: string;
  NOTIFY_FROM?: string;
}

export interface NotifyLead {
  name: string;
  phone: string;
  email: string;
  delivery_zip: string;
  start_date: string;
  duration: string;
  equipment_slug: string;
  state: string;
  city_slug: string;
}

export async function notifyNewLead(env: NotifyEnv, lead: NotifyLead, siteOrigin: string): Promise<void> {
  if (!env.RESEND_API_KEY || !env.NOTIFY_EMAIL || !env.NOTIFY_FROM) return;
  const city = lead.city_slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  const machine = lead.equipment_slug.replace(/-rental$/, '').replace(/-/g, ' ');
  const text = [
    `New quote request: ${machine} in ${city}, ${lead.state}`,
    '',
    `Name: ${lead.name}`,
    `Phone: ${lead.phone}`,
    `Email: ${lead.email}`,
    `Delivery ZIP: ${lead.delivery_zip}`,
    `Start date: ${lead.start_date}`,
    `Duration: ${lead.duration}`,
    '',
    `Open in admin: ${siteOrigin}/admin/leads`,
  ].join('\n');
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.NOTIFY_FROM,
        to: env.NOTIFY_EMAIL.split(',').map((s) => s.trim()).filter(Boolean),
        reply_to: lead.email,
        subject: `New lead: ${machine} in ${city}, ${lead.state}`,
        text,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) console.error('lead email failed', res.status, await res.text());
  } catch (e) {
    console.error('lead email error', e); // never block the visitor's form because of an email problem
  }
}
