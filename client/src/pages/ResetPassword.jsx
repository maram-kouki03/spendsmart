import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../context/AuthContext.jsx';
import { ErrorNote, LogoMark } from '../components/ui.jsx';

export default function ResetPassword() {
  const { session, ready } = useAuth();
  const nav = useNavigate();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr('');
    if (pw.length < 8) return setErr('Use at least 8 characters.');
    if (pw !== pw2) return setErr("Those passwords don't match.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setErr(error.message);
    nav('/dashboard', { replace: true });
  }

  return (
    <div className="ss pg-login" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <form className="card enter" onSubmit={submit} style={{ width: '100%', maxWidth: 440, padding: 28, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Link to="/" className="brand" style={{ padding: 0 }}><LogoMark /><span>SpendSmart</span></Link>
        <h1 className="login-h1" style={{ fontSize: 28 }}>Choose a new password</h1>
        {ready && !session && <ErrorNote>This reset link has expired. Request a new one from the log-in page.</ErrorNote>}
        <div><label className="lbl" htmlFor="np">New password</label><input className="inp" id="np" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
        <div><label className="lbl" htmlFor="np2">Repeat it</label><input className="inp" id="np2" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></div>
        <ErrorNote>{err}</ErrorNote>
        <button className="btn full" disabled={busy || !session}>{busy ? <span className="spin" /> : 'Save password'}</button>
      </form>
    </div>
  );
}
