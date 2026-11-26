/**
 * Checks the email settings in server/.env. With Mailjet or Brevo keys: sends one test email through its
 * HTTP API. With SMTP: connects + logs in (transporter.verify()), then sends a test email to
 * SMTP_USER. Never prints the password, the API key or other secrets.
 *
 *   npm run email:test -w server
 *   npm run email:test -w server -- someone@example.com   (send the test to another address)
 */
import {
  brevoEnabled,
  createTransport,
  describeMailError,
  explainMailError,
  mailConfig,
  mailEnabled,
  mailjetEnabled,
  sendViaBrevo,
  sendViaMailjet,
} from '../src/lib/mailer.js';

const mask = (v) => (v ? `${v.slice(0, 2)}***${v.includes('@') ? v.slice(v.indexOf('@')) : ''}` : '(empty)');
const rawPass = process.env.SMTP_PASS ?? '';
const TEST = {
  subject: 'SpendSmart email test',
  text: 'If you can read this, SpendSmart can send emails. 🎉',
  html: '<p style="font-family:sans-serif">If you can read this, <b>SpendSmart</b> can send emails. 🎉</p>'
};

async function main() {
  if (!mailEnabled()) {
    console.log('No email service is configured (Mailjet, Brevo or SMTP_HOST) → emails are printed in the server console instead of being sent. Nothing to test.');
    return;
  }
  const cfg = mailConfig();
  // HTTP APIs (Mailjet, Brevo): there is no login step, so the test is one send. Needs a recipient.
  const api = mailjetEnabled()
    ? { name: 'Mailjet', keys: ['MAILJET_API_KEY', 'MAILJET_SECRET_KEY'], send: sendViaMailjet }
    : brevoEnabled()
      ? { name: 'Brevo', keys: ['BREVO_API_KEY'], send: sendViaBrevo }
      : null;
  if (api) {
    const to = process.argv[2] || cfg.user || (cfg.from.match(/<([^>]+)>/) || [])[1] || cfg.from;
    console.log(`${api.name} HTTP API (SMTP settings are ignored)`);
    for (const k of api.keys) console.log(`  ${k.padEnd(19)} ${String(process.env[k]).trim().length} characters`);
    console.log(`  from                ${cfg.from.replace(/<([^>]+)>/, (_, a) => `<${mask(a)}>`)}`);
    process.stdout.write(`\nSending a test email to ${mask(to)} … `);
    try {
      await api.send({ from: cfg.from, to, ...TEST });
      console.log('OK');
      console.log(`\n✅ ${api.name} accepted the email. Check the inbox (and spam) of ${mask(to)}.`);
    } catch (e) {
      fail(e);
    }
    return;
  }
  console.log('SMTP settings (as the server will use them):');
  console.log(`  host    ${cfg.host}`);
  console.log(`  port    ${cfg.port} (${cfg.secure ? 'TLS from the start' : 'STARTTLS required'})`);
  console.log(`  user    ${mask(cfg.user)}${/^[^@\s]+@[^@\s]+$/.test(cfg.user) ? '' : '   ⚠ not a full email address'}`);
  console.log(`  pass    ${cfg.pass.length} characters${rawPass.length !== cfg.pass.length ? ` (${rawPass.length} before removing spaces/quotes)` : ''}`
    + `${/gmail\.com$/i.test(cfg.host) && !/^[a-z]{16}$/i.test(cfg.pass) ? '   ⚠ a Gmail app password is exactly 16 letters' : ''}`);
  console.log(`  from    ${cfg.from.replace(/<([^>]+)>/, (_, a) => `<${mask(a)}>`)}${cfg.fromNote ? `   (${cfg.fromNote})` : ''}`);
  if (!cfg.user || !cfg.pass) console.log('  ⚠ SMTP_USER or SMTP_PASS is empty');

  const to = process.argv[2] || cfg.user;
  const t = await createTransport(cfg);

  process.stdout.write('\n1/2 Connecting and logging in … ');
  try {
    await t.verify();
    console.log('OK');
  } catch (e) {
    return fail(e);
  }

  process.stdout.write(`2/2 Sending a test email to ${mask(to)} … `);
  try {
    const info = await t.sendMail({
      from: cfg.from,
      to,
      ...TEST
    });
    console.log('OK');
    console.log(`\n✅ Email sent (${info.response || 'accepted'}). Check the inbox (and spam) of ${mask(to)}.`);
  } catch (e) {
    return fail(e);
  }
}

function fail(e) {
  console.log('FAILED');
  console.log(`\n❌ ${describeMailError(e)}`);
  console.log(`   ${explainMailError(e)}`);
  process.exitCode = 1;
}

main().catch((e) => { console.error('Unexpected error:', e.message); process.exitCode = 1; });
