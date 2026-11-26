/**
 * Email transports, picked in this order:
 *   1. Brevo's HTTP API when BREVO_API_KEY is set (HTTPS on port 443, which works on hosts such as
 *      Render's free plan that block outgoing SMTP ports). Sender: SMTP_FROM.
 *   2. SMTP (nodemailer) when SMTP_HOST is set:
 *        SMTP_HOST, SMTP_PORT (465 = TLS, 587 = STARTTLS), SMTP_USER, SMTP_PASS, SMTP_FROM
 *   3. Neither: messages are printed in the server console — enough for local development (copy the
 *      code / reset link from there).
 * The same subject, text and HTML are sent whichever transport is used.
 *
 * The environment is read when the first email is sent (not at import time), and `--env-file`
 * has already filled process.env before any module runs.
 */
const PLACEHOLDER_DOMAINS = /@(example\.(com|org|net)|.*\.invalid)>?$/i;

const clean = (v) =>
  (v ?? '')
    .trim()
    .replace(/^(["'])(.*)\1$/, '$2')
    .trim();

/** The SMTP settings, normalised: trimmed, quotes removed, and spaces taken out of the password
 *  (Google shows app passwords as four groups of four letters). */
export function mailConfig() {
  const host = clean(process.env.SMTP_HOST);
  const port = Number(clean(process.env.SMTP_PORT)) || 587;
  const user = clean(process.env.SMTP_USER);
  const pass = clean(process.env.SMTP_PASS).replace(/\s+/g, '');
  let from = clean(process.env.SMTP_FROM) || user;
  let fromNote = null;
  // The .env.example placeholder (or any example.com address) can't be sent from: use the account itself.
  if (user && PLACEHOLDER_DOMAINS.test(from)) {
    const name = (from.match(/^([^<]+)</) || [])[1]?.trim() || 'SpendSmart';
    from = `${name} <${user}>`;
    fromNote = 'SMTP_FROM uses a placeholder address, so the SMTP_USER address is used instead.';
  }
  return { host, port, secure: port === 465, user, pass, from, fromNote };
}

export const brevoEnabled = () => Boolean(clean(process.env.BREVO_API_KEY));
export const smtpEnabled = () => Boolean(clean(process.env.SMTP_HOST));
export const mailEnabled = () => brevoEnabled() || smtpEnabled();
/** 'brevo', 'smtp' or 'console' (for logs and the email test script). */
export const mailTransportName = () => (brevoEnabled() ? 'brevo' : smtpEnabled() ? 'smtp' : 'console');

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

/** 'Name <a@b.c>' or 'a@b.c' → { name?, email } (Brevo wants the sender split up). */
export function parseAddress(v) {
  const m = String(v || '').match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (m) return m[1] ? { name: m[1].replace(/^(["'])(.*)\1$/, '$2'), email: m[2].trim() } : { email: m[2].trim() };
  return { email: String(v || '').trim() };
}

/**
 * One email through Brevo's transactional API (POST /v3/smtp/email with the api-key header). A
 * failed answer becomes an Error with code 'EBREVO', the HTTP status in `responseCode` and Brevo's
 * message in `response`, so describeMailError / explainMailError work as for SMTP.
 */
export async function sendViaBrevo({ from, to, subject, text, html }, timeoutMs = 20000) {
  let res;
  try {
    res = await fetch(BREVO_URL, {
      method: 'POST',
      headers: {
        'api-key': clean(process.env.BREVO_API_KEY),
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: parseAddress(from),
        to: [{ email: to }],
        subject,
        textContent: text,
        htmlContent: html,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    const timeout = e?.name === 'TimeoutError' || e?.name === 'AbortError';
    throw Object.assign(new Error(timeout ? `Brevo did not answer within ${timeoutMs / 1000} s` : e.message), {
      code: timeout ? 'ETIMEDOUT' : 'EBREVO',
    });
  }
  if (res.ok) return res.json().catch(() => ({}));
  const body = await res.json().catch(() => ({}));
  throw Object.assign(new Error(`Brevo answered ${res.status}`), {
    code: 'EBREVO',
    responseCode: res.status,
    response: [body.code, body.message].filter(Boolean).join(': ') || res.statusText,
  });
}

/** A new nodemailer transport for the current settings. */
export async function createTransport(cfg = mailConfig()) {
  const { default: nodemailer } = await import('nodemailer');
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure, // 465: TLS from the first byte
    requireTLS: !cfg.secure, // 587: plain connection upgraded with STARTTLS, refuse to continue without it
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
    connectionTimeout: 10000, // TCP (+ TLS on 465) connection
    greetingTimeout: 10000, // waiting for the server's greeting after connecting
    socketTimeout: 20000, // no activity on the socket
  });
}

/** Hard cap on one send (DNS + connect + login + upload), so a send can never outlive the request. */
export const SEND_DEADLINE_MS = 20000;

let transportPromise;
function getTransport() {
  if (!smtpEnabled()) return null;
  if (!transportPromise) {
    const cfg = mailConfig();
    if (cfg.fromNote) console.warn(`[mail] ${cfg.fromNote}`);
    transportPromise = createTransport(cfg).catch((e) => {
      transportPromise = null;
      throw e;
    });
  }
  return transportPromise;
}

/** Turns a nodemailer error into a short human explanation (never includes credentials). */
export function explainMailError(err) {
  const code = err?.code || '';
  const rc = err?.responseCode;
  const msg = String(err?.response || err?.message || '');
  if (code === 'EBREVO') {
    if (rc === 401) return 'Brevo rejected the API key — check BREVO_API_KEY (Brevo → SMTP & API → API keys).';
    if (rc === 400 && /sender/i.test(msg))
      return 'Brevo refused the sender — SMTP_FROM must be a sender (or domain) verified in Brevo → Senders & IP.';
    if (rc === 403) return 'Brevo refused the request — the account may not be activated for transactional emails yet.';
    if (rc === 429) return 'Brevo rate limit or daily quota reached — try again later.';
    return 'Brevo could not send the email — see the status and message above.';
  }
  if (
    code === 'EAUTH' ||
    rc === 535 ||
    rc === 534 ||
    /535|BadCredentials|Username and Password not accepted/i.test(msg)
  ) {
    return (
      'The SMTP server rejected the username/password. For Gmail: SMTP_USER must be the full Gmail address, ' +
      '2-Step Verification must be ON, and SMTP_PASS must be a 16-letter App Password (not your normal password) ' +
      'created for that same account at https://myaccount.google.com/apppasswords.'
    );
  }
  if (code === 'ETIMEDOUT' || (code === 'ESOCKET' && /timeout/i.test(msg))) {
    return 'Connection timed out — the network or a firewall/antivirus is probably blocking this port. Try SMTP_PORT=587 (or 465).';
  }
  if (code === 'ECONNREFUSED')
    return 'Connection refused — wrong SMTP_HOST/SMTP_PORT, or the port is blocked. For Gmail use smtp.gmail.com with 465 or 587.';
  if (code === 'EDNS' || code === 'ENOTFOUND' || code === 'EAI_AGAIN')
    return 'SMTP_HOST could not be resolved — check the host name and your internet connection.';
  if (code === 'ETLS' || /wrong version number|ssl3_get_record|self[- ]signed|certificate/i.test(msg)) {
    return 'TLS problem — port 465 needs a TLS connection and 587 needs STARTTLS. Check that SMTP_PORT matches the server (465 or 587).';
  }
  if (code === 'EENVELOPE')
    return 'The recipient or sender address was refused — check SMTP_FROM and the "to" address.';
  if (code === 'EMESSAGE') return 'The message itself was rejected by the SMTP server.';
  if (rc === 550 || rc === 553)
    return "The SMTP server refused the sender/recipient (often SMTP_FROM isn't an address this account may send as).";
  if (rc === 454 || rc === 421)
    return 'The SMTP server is temporarily refusing connections (rate limit or outage) — try again later.';
  return 'Unexpected email error — see the code and response above.';
}

/** One-line description of a mail error for logs: code, SMTP status and server reply. */
export const describeMailError = (err) =>
  [err?.code, err?.responseCode, (err?.response || err?.message || '').split('\n')[0]].filter(Boolean).join(' · ');

export async function sendMail({ to, subject, text, html }) {
  if (brevoEnabled()) {
    await sendViaBrevo({ from: mailConfig().from, to, subject, text, html }, SEND_DEADLINE_MS);
    return;
  }
  const t = await getTransport();
  if (!t) {
    console.log(
      `\n✉️  [email not sent — no email service is configured]\n   To: ${to}\n   Subject: ${subject}\n   ${text.split('\n').join('\n   ')}\n`
    );
    return;
  }
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          Object.assign(new Error(`Sending took longer than ${SEND_DEADLINE_MS / 1000} s`), { code: 'ETIMEDOUT' })
        ),
      SEND_DEADLINE_MS
    );
  });
  try {
    await Promise.race([t.sendMail({ from: mailConfig().from, to, subject, text, html }), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * Sends the 6-digit email-confirmation code; throws if email is configured but sending fails (the
 * caller then rolls the code back, so it is never printed). Without Brevo or SMTP the code is printed in
 * the console for development — never when NODE_ENV=production, where that's an error instead.
 */
export async function sendVerificationCode({ to, name, code, minutes = 15 }) {
  if (!mailEnabled()) {
    if (process.env.NODE_ENV === 'production')
      throw new Error('Email is not configured (set BREVO_API_KEY, or SMTP_HOST and the other SMTP_* variables)');
    console.log(`\n[DEV] Verification code for ${to}: ${code}\n`);
    return;
  }
  const hi = name ? `Hi ${name.split(/\s+/)[0]},` : 'Hi,';
  const text = `${hi}

Your SpendSmart confirmation code is: ${code}

Type it on the sign-up screen to confirm your email address.
This code expires in ${minutes} minutes.

If you didn't create a SpendSmart account, you can ignore this email.`;

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your SpendSmart code</title></head>
<body style="margin:0;padding:0;background:#FFFBEF;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFFBEF;padding:32px 12px;font-family:Poppins,'Segoe UI',Helvetica,Arial,sans-serif;color:#3B2F12;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #F5E2A8;border-radius:24px;">
        <tr><td style="padding:32px 32px 8px;font-size:20px;font-weight:700;">
          <span style="display:inline-block;width:28px;height:28px;border-radius:50%;background:#F2D06B;vertical-align:middle;margin-right:8px;"></span>SpendSmart
        </td></tr>
        <tr><td style="padding:16px 32px 0;font-size:15px;line-height:1.6;">
          <p style="margin:0 0 12px;">${esc(hi)}</p>
          <p style="margin:0;">Here's the code to confirm your email address:</p>
        </td></tr>
        <tr><td align="center" style="padding:24px 32px;">
          <div style="display:inline-block;background:#FFF0B3;border:1.5px solid #F2D06B;border-radius:18px;padding:16px 28px;font-size:34px;font-weight:700;letter-spacing:10px;color:#3B2F12;font-family:'SFMono-Regular',Consolas,'Courier New',monospace;">${esc(code)}</div>
        </td></tr>
        <tr><td style="padding:0 32px 32px;font-size:14px;line-height:1.6;color:#6B5A33;">
          <p style="margin:0 0 8px;"><b>This code expires in ${minutes} minutes.</b></p>
          <p style="margin:0;">If you didn't create a SpendSmart account, you can ignore this email.</p>
        </td></tr>
      </table>
      <p style="margin:16px 0 0;font-size:12px;color:#9A8758;">SpendSmart — know where every coin goes.</p>
    </td></tr>
  </table>
</body></html>`;

  try {
    await sendMail({ to, subject: `${code} is your SpendSmart confirmation code`, text, html });
  } catch (err) {
    console.error(
      `[mail] Verification email to ${to} failed: ${describeMailError(err)}\n[mail] ${explainMailError(err)}`
    );
    throw err;
  }
}
