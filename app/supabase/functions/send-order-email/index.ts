// =============================================================================
//  Supabase Edge Function: Auftrag per E-Mail an die ausführende Firma senden
//
//  Versendet eine HTML-Zusammenfassung des Auftrags (optional mit PDF-Anhang,
//  vom Client erzeugt) per Resend an die Kontakt-E-Mail der zugewiesenen Firma.
//
//  Anbieter wählbar über MAIL_PROVIDER ("gmail" | "resend").
//
//  Gmail (SMTP, empfohlen für eigenes Konto):
//    MAIL_PROVIDER=gmail
//    GMAIL_USER=deinkonto@gmail.com
//    GMAIL_APP_PASSWORD=xxxxxxxxxxxxxxxx   (App-Passwort, NICHT das normale!)
//    MAIL_FROM optional (Default: GMAIL_USER)
//
//  Resend (API):
//    MAIL_PROVIDER=resend
//    RESEND_API_KEY=re_...
//    MAIL_FROM="Bauhof <auftrag@example.de>"  (verifizierte Domain)
//
//  SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY werden von Supabase automatisch
//  bereitgestellt.
// =============================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

const STATUS_LABEL: Record<string, string> = {
  entwurf: 'Entwurf', versendet: 'Versendet', angenommen: 'Angenommen',
  bearbeitung: 'In Bearbeitung', fertiggemeldet: 'Fertiggemeldet',
  abgeschlossen: 'Abgeschlossen', storniert: 'Storniert',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const { orderId, pdfBase64, pdfFilename, to: toOverride, message } = await req.json();
    if (!orderId) return json({ error: 'orderId fehlt' }, 400);

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    const GMAIL_USER = Deno.env.get('GMAIL_USER');
    const GMAIL_APP_PASSWORD = Deno.env.get('GMAIL_APP_PASSWORD');
    // Anbieter automatisch bestimmen, falls MAIL_PROVIDER nicht gesetzt
    const provider = (Deno.env.get('MAIL_PROVIDER') || (GMAIL_USER ? 'gmail' : 'resend')).toLowerCase();
    const MAIL_FROM = Deno.env.get('MAIL_FROM') || (provider === 'gmail' ? GMAIL_USER : undefined);

    if (provider === 'gmail' && (!GMAIL_USER || !GMAIL_APP_PASSWORD)) {
      return json({ error: 'Gmail-Konfiguration fehlt (GMAIL_USER / GMAIL_APP_PASSWORD).' }, 500);
    }
    if (provider === 'resend' && (!RESEND_API_KEY || !MAIL_FROM)) {
      return json({ error: 'Resend-Konfiguration fehlt (RESEND_API_KEY / MAIL_FROM).' }, 500);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Auftrag + Firma + Positionen laden
    const { data: order, error: oErr } = await supabase
      .from('orders')
      .select('code, title, description, status, planned_start_date, planned_end_date, ' +
        'assigned_company:companies!assigned_company_id ( name, contact_email )')
      .eq('id', orderId)
      .single();
    if (oErr || !order) return json({ error: 'Auftrag nicht gefunden: ' + (oErr?.message ?? '') }, 404);

    // deno-lint-ignore no-explicit-any
    const company = (order as any).assigned_company as { name: string; contact_email: string | null } | null;
    const recipient = (toOverride && String(toOverride).trim()) || company?.contact_email;
    if (!recipient) {
      return json({ error: 'Keine E-Mail-Adresse bei der ausführenden Firma hinterlegt.' }, 422);
    }

    const { data: items } = await supabase
      .from('order_items')
      .select('sort_order, planned_date, status, damage:damages!damage_id ( code, address_street, address_city )')
      .eq('order_id', orderId)
      .order('sort_order');

    // deno-lint-ignore no-explicit-any
    const rows = ((items ?? []) as any[]).map((p) => {
      const d = p.damage ?? {};
      const addr = [d.address_street, d.address_city].filter(Boolean).join(', ') || '—';
      const termin = p.planned_date ? new Date(p.planned_date).toLocaleDateString('de-DE') : '—';
      return `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #eee">${esc(p.sort_order)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;font-family:monospace">${esc(d.code ?? '—')}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee">${esc(addr)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee">${esc(termin)}</td>
      </tr>`;
    }).join('');

    const period = order.planned_start_date
      ? new Date(order.planned_start_date).toLocaleDateString('de-DE') +
        (order.planned_end_date && order.planned_end_date !== order.planned_start_date
          ? ' – ' + new Date(order.planned_end_date).toLocaleDateString('de-DE') : '')
      : '—';

    const html = `<div style="font-family:Arial,sans-serif;color:#0f172a;max-width:640px">
      <h2 style="margin:0 0 4px">Arbeitsauftrag ${esc(order.code)}</h2>
      <div style="font-size:18px;font-weight:600;margin-bottom:12px">${esc(order.title)}</div>
      ${message ? `<p style="white-space:pre-wrap">${esc(message)}</p>` : ''}
      ${order.description ? `<p style="white-space:pre-wrap;color:#334155">${esc(order.description)}</p>` : ''}
      <table style="font-size:14px;margin:8px 0 16px">
        <tr><td style="color:#64748b;padding-right:16px">Firma</td><td>${esc(company?.name ?? '—')}</td></tr>
        <tr><td style="color:#64748b;padding-right:16px">Status</td><td>${esc(STATUS_LABEL[order.status] ?? order.status)}</td></tr>
        <tr><td style="color:#64748b;padding-right:16px">Zeitraum</td><td>${esc(period)}</td></tr>
      </table>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="text-align:left;color:#64748b">
          <th style="padding:6px 8px;border-bottom:2px solid #e2e8f0">#</th>
          <th style="padding:6px 8px;border-bottom:2px solid #e2e8f0">Schaden</th>
          <th style="padding:6px 8px;border-bottom:2px solid #e2e8f0">Adresse</th>
          <th style="padding:6px 8px;border-bottom:2px solid #e2e8f0">Termin</th>
        </tr></thead>
        <tbody>${rows || '<tr><td colspan="4" style="padding:8px;color:#94a3b8">Keine Positionen</td></tr>'}</tbody>
      </table>
      <p style="color:#94a3b8;font-size:12px;margin-top:24px">
        Diese E-Mail wurde automatisch aus der Schadensverwaltung versendet.
      </p>
    </div>`;

    const subject = `Arbeitsauftrag ${order.code} – ${order.title}`;
    const attachName = pdfFilename || `Auftrag_${order.code}.pdf`;

    if (provider === 'gmail') {
      // Versand über Gmail SMTP (App-Passwort)
      const client = new SMTPClient({
        connection: {
          hostname: 'smtp.gmail.com',
          port: 465,
          tls: true,
          auth: { username: GMAIL_USER!, password: GMAIL_APP_PASSWORD! },
        },
      });
      try {
        await client.send({
          from: MAIL_FROM!,
          to: recipient,
          subject,
          html,
          content: 'Dieser Auftrag wird in HTML angezeigt.',
          attachments: pdfBase64
            ? [{ filename: attachName, encoding: 'base64', content: pdfBase64, contentType: 'application/pdf' }]
            : undefined,
        });
      } finally {
        await client.close();
      }
      return json({ ok: true, recipient, provider });
    }

    // Versand über Resend (API)
    // deno-lint-ignore no-explicit-any
    const payload: Record<string, any> = { from: MAIL_FROM, to: [recipient], subject, html };
    if (pdfBase64) {
      payload.attachments = [{ filename: attachName, content: pdfBase64 }];
    }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const txt = await res.text();
      return json({ error: 'Mailversand fehlgeschlagen: ' + txt }, 502);
    }
    return json({ ok: true, recipient, provider });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
