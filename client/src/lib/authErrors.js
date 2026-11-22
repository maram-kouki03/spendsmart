// The SpendSmart API already answers with short, human messages (see server/src/routes/auth.js),
// so they are shown as they are. Only browser-level failures need translating.
const RULES = [
  [/failed to fetch|networkerror|load failed/i, "Can't reach the server — check your connection and try again."]
];

export function friendlyAuthError(error) {
  const msg = typeof error === 'string' ? error : error?.message || '';
  if (!msg) return 'Something went wrong — please try again.';
  for (const [re, out] of RULES) if (re.test(msg)) return out;
  return msg;
}
