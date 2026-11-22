/**
 * Checks the SMTP settings in server/.env: connects + logs in (transporter.verify()), then sends a
 * test email to SMTP_USER. Never prints the password or other secrets.
 *
 *   npm run email:test -w server
 *   npm run email:test -w server -- someone@example.com   (send the test to another address)
 */
import { createTransport, describeMailError, explainMailError, mailConfig, mailEnabled } from '../src/lib/mailer.js';

const mask = (v) => (v ? `${v.slice(0, 2)}***${v.includes('@') ? v.slice(v.indexOf('@')) : ''}` : '(empty)');
const rawPass = process.env.SMTP_PASS ?? '';

async function main() {
  if (!mailEnabled()) {
    console.log('SMTP_HOST is empty → emails are printed in the server console instead of being sent. Nothing to test.');
    return;
  }
  const cfg = mailConfig();
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
      subject: 'SpendSmart SMTP test',
      text: 'If you can read this, SpendSmart can send emails. 🎉',
      html: '<p style="font-family:sans-serif">If you can read this, <b>SpendSmart</b> can send emails. 🎉</p>'
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
