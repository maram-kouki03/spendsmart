import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { friendlyAuthError } from '../lib/authErrors.js';
import { useAuth } from '../context/AuthContext.jsx';
import { checkPassword, newPasswordProblem } from '../lib/passwordRules.js';
import { ErrorNote, LogoMark } from '../components/ui.jsx';
import { MatchNote, PasswordChecklist, PasswordInput } from '../components/PasswordChecklist.jsx';

/** Opened from the emailed (or console-logged) link: /reset-password?token=… */
export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const { setUser } = useAuth();
  const nav = useNavigate();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const t = useRef(0);
  useEffect(() => () => clearTimeout(t.current), []);
  // The page doesn't know the account's name/email, so that one rule is checked by the server only.
  const pwCheck = useMemo(() => checkPassword(pw), [pw]);
  const ready = pwCheck.ok && pw === pw2;

  async function submit(e) {
    e.preventDefault();
    setErr('');
    const bad = newPasswordProblem(pw, pw2);
    if (bad) return setErr(bad.message);
    setBusy(true);
    try {
      // The server sets the new session cookie, so you're signed in straight away.
      const { user } = await api.post('/auth/reset-password', { token, password: pw, confirmPassword: pw2 });
      setUser(user);
      setDone(true);
      t.current = setTimeout(() => nav('/dashboard', { replace: true }), 1200);
    } catch (ex) {
      setErr(friendlyAuthError(ex));
    } finally {
      setBusy(false);
    }
  }

  const noToken = !token;

  return (
    <div className="ss pg-login" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <form className="card enter" onSubmit={submit} style={{ width: '100%', maxWidth: 440, padding: 28, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Link to="/" className="brand" style={{ padding: 0 }}><LogoMark /><span>SpendSmart</span></Link>
        <h1 className="login-h1" style={{ fontSize: 28 }}>Choose a new password</h1>
        {noToken && (
          <ErrorNote>
            This reset link is incomplete. <Link to="/login">Request a new one</Link> from the log-in page.
          </ErrorNote>
        )}
        <div>
          <label className="lbl" htmlFor="np">New password</label>
          <PasswordInput id="np" value={pw} onChange={setPw} disabled={noToken || done} placeholder="At least 8 characters" describedBy="np-help" />
          <PasswordChecklist result={pwCheck} id="np-help" />
        </div>
        <div>
          <label className="lbl" htmlFor="np2">Confirm password</label>
          <PasswordInput id="np2" value={pw2} onChange={setPw2} disabled={noToken || done} placeholder="Type it again" describedBy="np2-match" showLabel="confirm password" />
          <MatchNote pw={pw} confirm={pw2} id="np2-match" />
        </div>
        <ErrorNote>{err}</ErrorNote>
        {/expired|invalid/i.test(err) && <Link to="/login" style={{ fontSize: 14, fontWeight: 600 }}>Back to log in →</Link>}
        {done && <div className="note-ok" role="status">Password updated! Taking you to your dashboard…</div>}
        <button className="btn full" disabled={busy || noToken || done} aria-disabled={!ready && !busy ? 'true' : undefined}>{busy ? <span className="spin" /> : 'Save password'}</button>
      </form>
    </div>
  );
}
