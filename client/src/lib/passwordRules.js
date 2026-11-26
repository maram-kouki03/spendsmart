/**
 * SpendSmart password rules — ONE definition, used by the client (live checklist) and the server
 * (validation on every endpoint that sets a password). This file exists twice with identical
 * content: client/src/lib/passwordRules.js and server/src/lib/passwordRules.js (the smoke test
 * fails if they differ). Plain ES module, no dependencies, works in browsers and Node.
 *
 * Not used at log-in, so accounts with older passwords can still sign in.
 */

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX_BYTES = 72; // bcrypt ignores everything after 72 bytes
export const SYMBOL_EXAMPLES = '! @ # $ % & * ? -';

/** Very common passwords and base words (compared case-insensitively, also with leading/trailing digits and symbols removed). */
export const COMMON_PASSWORDS = [
  'password',
  'passw0rd',
  'p@ssword',
  'p@ssw0rd',
  'password1',
  'password123',
  'motdepasse',
  'mot2passe',
  '12345678',
  '123456789',
  '1234567890',
  '87654321',
  '11111111',
  '00000000',
  '12341234',
  '11223344',
  'qwerty',
  'qwerty123',
  'qwertyuiop',
  'azerty',
  'azerty123',
  'azertyuiop',
  'asdfghjk',
  'zxcvbnm',
  '1q2w3e4r',
  '1qaz2wsx',
  'abc12345',
  'abcd1234',
  'aa123456',
  'iloveyou',
  'jetaime',
  'soleil',
  'letmein',
  'welcome',
  'bienvenue',
  'admin',
  'administrator',
  'root',
  'login',
  'changeme',
  'secret',
  'master',
  'dragon',
  'monkey',
  'football',
  'baseball',
  'sunshine',
  'princess',
  'shadow',
  'superman',
  'batman',
  'trustno1',
  'starwars',
  'spendsmart',
  'money',
  'bonjour',
];
const COMMON = new Set(COMMON_PASSWORDS);

const UPPER = /\p{Lu}/u;
const LOWER = /\p{Ll}/u;
const DIGIT = /\p{Nd}/u;
const SYMBOL = /[^\p{L}\p{N}\s]/u;

const byteLength = (s) => new TextEncoder().encode(s).length;

/** The parts of the user's identity a password must not contain (3+ characters each), lower-cased. */
function personalWords({ email, name } = {}) {
  const words = [];
  const local = String(email || '')
    .split('@')[0]
    .trim()
    .toLowerCase();
  if (local.length >= 3) words.push(local);
  const first = String(name || '')
    .trim()
    .split(/\s+/)[0]
    .toLowerCase();
  if (first.length >= 3) words.push(first);
  return words;
}

function isCommon(pw) {
  const low = pw.trim().toLowerCase();
  const core = low.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, ''); // "Password123!" → "password"
  return COMMON.has(low) || (core.length >= 4 && COMMON.has(core));
}

/**
 * Checks `pw` against every rule. `ctx` = { email, name } when known; the "not your name or email"
 * rule is left out of the list when neither is known (the server always knows and checks it).
 * Returns { ok, rules: [{ id, label, ok, message }], problem (first failing rule's message or null), strength }.
 */
export function checkPassword(pw, ctx = {}) {
  const p = typeof pw === 'string' ? pw : '';
  const empty = p.length === 0;
  const words = personalWords(ctx);
  const low = p.toLowerCase();
  const rules = [
    {
      id: 'length',
      label: `${PASSWORD_MIN}–${PASSWORD_MAX_BYTES} characters`,
      ok: p.length >= PASSWORD_MIN && byteLength(p) <= PASSWORD_MAX_BYTES,
      message:
        p.length < PASSWORD_MIN
          ? `Use at least ${PASSWORD_MIN} characters for your password.`
          : `Use at most ${PASSWORD_MAX_BYTES} characters for your password.`,
    },
    {
      id: 'upper',
      label: 'An uppercase letter',
      ok: UPPER.test(p),
      message: 'Add an uppercase letter (A–Z) to your password.',
    },
    {
      id: 'lower',
      label: 'A lowercase letter',
      ok: LOWER.test(p),
      message: 'Add a lowercase letter (a–z) to your password.',
    },
    { id: 'number', label: 'A number', ok: DIGIT.test(p), message: 'Add a number (0–9) to your password.' },
    {
      id: 'symbol',
      label: `A symbol (${SYMBOL_EXAMPLES})`,
      ok: SYMBOL.test(p),
      message: `Add a symbol to your password, like ${SYMBOL_EXAMPLES}`,
    },
    {
      id: 'spaces',
      label: 'No spaces at the start or end',
      ok: !empty && p === p.trim(),
      message: 'Remove the spaces at the start or end of your password.',
    },
  ];
  if (words.length) {
    rules.push({
      id: 'personal',
      label: 'Not your name or email',
      ok: !empty && !words.some((w) => low.includes(w)),
      message: "Don't use your name or email address in your password.",
    });
  }
  rules.push({
    id: 'common',
    label: 'Not a common password',
    ok: !empty && !isCommon(p),
    message: 'That password is too common — pick something harder to guess.',
  });

  const failing = rules.find((r) => !r.ok);
  const ok = !failing;
  return { ok, rules, problem: failing ? failing.message : null, strength: strengthOf(p, rules, ok) };
}

export const STRENGTH_LABELS = ['', 'Weak', 'Fair', 'Good', 'Strong'];

/** 0 (empty) … 4. Below 3 means at least one rule fails. */
function strengthOf(p, rules, ok) {
  if (!p) return { score: 0, label: '' };
  let score;
  if (!ok) score = rules.filter((r) => r.ok).length >= rules.length - 2 ? 2 : 1;
  else {
    const varied = new Set(p).size >= 6;
    score = !varied ? 2 : p.length >= 12 ? 4 : 3;
  }
  return { score, label: STRENGTH_LABELS[score] };
}

/** The first problem with a new password + its confirmation, or null when both are fine. */
export function newPasswordProblem(pw, confirm, ctx = {}) {
  const r = checkPassword(pw, ctx);
  if (!r.ok) return { code: 'weak_password', message: r.problem };
  if (typeof confirm !== 'string' || confirm.length === 0)
    return { code: 'password_mismatch', message: 'Confirm your password.' };
  if (confirm !== pw) return { code: 'password_mismatch', message: "Passwords don't match." };
  return null;
}
