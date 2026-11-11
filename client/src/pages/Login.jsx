import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase, supabaseConfigured, setRemember } from '../lib/supabase.js';
import { I } from '../lib/icons.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Coin, ErrorNote, Icon, LogoMark, Seg, Wallet3D } from '../components/ui.jsx';

export default function Login() {
  const [params] = useSearchParams();
  const { session, ready } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [mode, setMode] = useState(params.get('mode') === 'signup' ? 'signup' : 'login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [remember, setRem] = useState(true);
  const [status, setStatus] = useState('idle');
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const t = useRef(0);
  useEffect(() => () => clearTimeout(t.current), []);

  const signup = mode === 'signup';
  const dest = loc.state?.from || '/dashboard';
  if (ready && session && status === 'idle') return <Navigate to={dest} replace />;

  function switchMode(m) { setMode(m); setStatus('idle'); setErr(''); setInfo(''); }

  async function submit(e) {
    e.preventDefault();
    if (status !== 'idle') return;
    setErr(''); setInfo('');
    if (!supabaseConfigured) { setErr('Supabase is not configured — add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to client/.env.'); return; }
    if (signup && !name.trim()) { setErr('Tell us your name.'); return; }
    if (pw.length < 8) { setErr('Use at least 8 characters for your password.'); return; }
    setRemember(remember);
    setStatus('loading');
    const res = signup
      ? await supabase.auth.signUp({ email, password: pw, options: { data: { full_name: name.trim() }, emailRedirectTo: `${window.location.origin}/dashboard` } })
      : await supabase.auth.signInWithPassword({ email, password: pw });
    if (res.error) { setStatus('idle'); setErr(res.error.message); return; }
    if (signup && !res.data.session) {
      setStatus('idle');
      setInfo(`Almost there! We sent a confirmation link to ${email}. Open it to start tracking.`);
      return;
    }
    setStatus('done');
    t.current = setTimeout(() => nav(dest, { replace: true }), 900);
  }

  async function forgot() {
    setErr(''); setInfo('');
    if (!email) { setErr('Type your email first, then tap “Forgot password?”.'); return; }
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
    if (error) setErr(error.message); else setInfo(`If ${email} has an account, a reset link is on its way.`);
  }

  async function oauth(provider) {
    setErr('');
    setRemember(remember);
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: `${window.location.origin}/dashboard` } });
    if (error) setErr(error.message);
  }

  return (
    <div className="ss pg-login">
      <div className="enter login-left">
        <Link to="/" className="brand" style={{ padding: 0 }}><LogoMark /><span>SpendSmart</span></Link>
        <div className="login-center">
          <form className="stg login-form" onSubmit={submit} noValidate>
            <div>
              <h1 className="login-h1">{signup ? 'Create your account' : 'Welcome back'}</h1>
              <p className="login-sub">{signup ? 'Start tracking in under a minute.' : 'Log in to see where your money stands.'}</p>
            </div>
            <Seg label="Account" value={mode} onChange={switchMode} options={[{ value: 'login', label: 'Log in' }, { value: 'signup', label: 'Sign up' }]} />
            <div className="name-slot" style={{ maxHeight: signup ? 100 : 0, opacity: signup ? 1 : 0, marginBottom: signup ? 18 : 0 }} aria-hidden={!signup}>
              <label className="lbl" htmlFor="nm">Full name</label>
              <div className="inp inpw"><Icon d={I.user}><circle cx="12" cy="8" r="4" /></Icon><input id="nm" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} tabIndex={signup ? 0 : -1} placeholder="Your name" /></div>
            </div>
            <div style={{ marginTop: -18 }}>
              <label className="lbl" htmlFor="em">Email</label>
              <div className="inp inpw"><Icon d={I.mail}><rect x="3" y="5" width="18" height="14" rx="3" /></Icon><input id="em" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" /></div>
            </div>
            <div>
              <label className="lbl" htmlFor="pw">Password</label>
              <div className="inp inpw">
                <Icon d={I.lock}><rect x="4" y="10" width="16" height="11" rx="3" /></Icon>
                <input id="pw" type={show ? 'text' : 'password'} autoComplete={signup ? 'new-password' : 'current-password'} required value={pw} onChange={(e) => setPw(e.target.value)} placeholder="At least 8 characters" />
                <button type="button" aria-label={show ? 'Hide password' : 'Show password'} className="pw-eye" onClick={() => setShow(!show)}>
                  {show ? <Icon d={I.eyeOff} /> : <Icon d={I.eye}><circle cx="12" cy="12" r="3" /></Icon>}
                </button>
              </div>
            </div>
            <div className="login-row">
              <label className="remember"><input type="checkbox" checked={remember} onChange={(e) => setRem(e.target.checked)} /> Remember me</label>
              {!signup && <button type="button" className="link-btn" style={{ fontSize: 13 }} onClick={forgot}>Forgot password?</button>}
            </div>
            <ErrorNote>{err}</ErrorNote>
            {info && <div className="note-ok" role="status">{info}</div>}
            <button className="btn full" type="submit" aria-live="polite" style={{ height: 56, fontSize: 16 }} disabled={status === 'loading'}>
              {status === 'idle' && <span>{signup ? 'Create account' : 'Log in'}</span>}
              {status === 'loading' && <span className="spin" aria-label="Loading" />}
              {status === 'done' && <svg viewBox="0 0 24 24" className="done-check" aria-label="Done"><path className="draw" d={I.check} /></svg>}
            </button>
            {status === 'done' && <Link to={dest} className="toast" style={{ textAlign: 'center', fontWeight: 600 }}>You're in! Open my dashboard →</Link>}
            <div className="or-line"><div />or continue with<div /></div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <button type="button" className="soc" onClick={() => oauth('google')}><span className="mono" aria-hidden="true">G</span>Continue with Google</button>
              <button type="button" className="soc" onClick={() => oauth('apple')}><span className="mono" aria-hidden="true">A</span>Continue with Apple</button>
            </div>
          </form>
        </div>
      </div>

      <div className="scene login-art">
        <div aria-hidden="true" className="login-wallet">
          <div className="dropc" style={{ position: 'absolute', left: '30%', top: 0, '--to': '150px', animationDuration: '2.4s' }}><Coin size={40} /></div>
          <div className="dropc" style={{ position: 'absolute', left: '55%', top: 0, '--to': '160px', animationDuration: '2.4s', animationDelay: '.8s' }}><Coin size={34} /></div>
          <div className="dropc" style={{ position: 'absolute', left: '42%', top: 0, '--to': '140px', animationDuration: '2.4s', animationDelay: '1.6s' }}><Coin size={46} /></div>
          <div className="float" style={{ transformStyle: 'preserve-3d' }}><div className="wobble"><Wallet3D layers={3} /></div></div>
          <div className="shadow3d" style={{ bottom: -36 }} />
        </div>
        <div style={{ textAlign: 'center', position: 'relative', padding: '0 24px' }}>
          <span className="hand" style={{ fontSize: 40 }}>Your coins missed you!</span>
          <p className="login-art-p">Bank-level encryption keeps your balances and budgets private.</p>
        </div>
      </div>
    </div>
  );
}
