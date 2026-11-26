import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { friendlyAuthError } from '../lib/authErrors.js';
import { I } from '../lib/icons.js';
import { useAuth } from '../context/AuthContext.jsx';
import { checkPassword, newPasswordProblem } from '../lib/passwordRules.js';
import { Coin, ErrorNote, Icon, LogoMark, Seg, Wallet3D } from '../components/ui.jsx';
import { MatchNote, PasswordChecklist, PasswordInput } from '../components/PasswordChecklist.jsx';
import { preloadDashboard } from './lazy.js';

// Only return to in-app paths (never back to the auth pages themselves).
function safeDest(from) {
  if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//')) return '/dashboard';
  if (from.startsWith('/login') || from.startsWith('/reset-password')) return '/dashboard';
  return from;
}

// The checkbox remembers its last state on this device (the session itself is an httpOnly cookie).
const PREF = 'ss-remember';
const rememberedChoice = () => {
  try {
    return localStorage.getItem(PREF) !== '0';
  } catch {
    return true;
  }
};
const saveChoice = (on) => {
  try {
    localStorage.setItem(PREF, on ? '1' : '0');
  } catch {
    /* storage blocked */
  }
};

// Google Identity Services script, loaded once and only when the server has Google sign-in enabled.
let gisPromise;
function loadGis() {
  if (window.google?.accounts?.id) return Promise.resolve();
  gisPromise ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      gisPromise = null;
      reject(new Error('Could not load Google sign-in'));
    };
    document.head.appendChild(s);
  });
  return gisPromise;
}

function GoogleButton({ clientId, onCredential, onError }) {
  const box = useRef(null);
  // The callbacks live in refs: Google's button is rendered once per client id, not on every render.
  const cb = useRef(onCredential);
  cb.current = onCredential;
  const errRef = useRef(onError);
  errRef.current = onError;
  useEffect(() => {
    let live = true;
    loadGis()
      .then(() => {
        if (!live || !box.current) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (r) => cb.current(r.credential),
          ux_mode: 'popup',
        });
        box.current.innerHTML = '';
        window.google.accounts.id.renderButton(box.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          shape: 'pill',
          text: 'continue_with',
          logo_alignment: 'center',
          width: Math.min(400, Math.max(200, box.current.offsetWidth || 320)),
        });
      })
      .catch((e) => live && errRef.current?.(e.message));
    return () => {
      live = false;
    };
  }, [clientId]);
  return <div ref={box} className="gsi-box" />;
}

const CODE_LEN = 6;

/** Six one-digit boxes: typing advances, Backspace goes back, pasting (or SMS/email autofill) fills them all. */
function CodeBoxes({ digits, onChange, onComplete, disabled }) {
  const refs = useRef([]);
  // The code step opens after the user submits the form, so the first box takes the focus.
  useEffect(() => {
    refs.current[0]?.focus();
  }, []);
  const focus = (i) => {
    const el = refs.current[Math.max(0, Math.min(CODE_LEN - 1, i))];
    el?.focus();
    el?.select();
  };

  function fill(i, raw) {
    const clean = raw.replace(/\D/g, '');
    const next = digits.slice();
    if (!clean) {
      next[i] = '';
      onChange(next);
      return;
    }
    // A whole code pasted into any box starts from the first box.
    let j = clean.length >= CODE_LEN ? 0 : i;
    for (const ch of clean) {
      if (j >= CODE_LEN) break;
      next[j++] = ch;
    }
    onChange(next);
    focus(j);
    if (next.every(Boolean)) onComplete(next.join(''));
  }

  function onKeyDown(i, e) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      e.preventDefault();
      const next = digits.slice();
      next[i - 1] = '';
      onChange(next);
      focus(i - 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      focus(i - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      focus(i + 1);
    }
  }

  return (
    <div className="code-boxes" role="group" aria-label="6-digit confirmation code">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          className="inp code-box"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          aria-label={`Digit ${i + 1}`}
          value={d}
          disabled={disabled}
          onFocus={(e) => e.target.select()}
          onChange={(e) => fill(i, e.target.value)}
          onPaste={(e) => {
            e.preventDefault();
            fill(i, e.clipboardData.getData('text'));
          }}
          onKeyDown={(e) => onKeyDown(i, e)}
        />
      ))}
    </div>
  );
}

/** The "Check your email" step shown after sign-up, or after logging in with an unconfirmed email. */
function VerifyStep({ email, resendIn, error, remember, onBack, onVerified }) {
  const { verifyEmail, resendCode } = useAuth();
  const [digits, setDigits] = useState(() => Array(CODE_LEN).fill(''));
  const [status, setStatus] = useState('idle');
  const [err, setErr] = useState(error || ''); // e.g. "We couldn't send the email…" from sign-up
  const [info, setInfo] = useState('');
  const [until, setUntil] = useState(() => Date.now() + (resendIn ?? 60) * 1000);
  const [left, setLeft] = useState(resendIn ?? 60);
  const [sending, setSending] = useState(false);
  const busy = useRef(false);

  // Resend countdown, computed from an end time so it stays right if the tab sleeps.
  useEffect(() => {
    const tick = () => setLeft(Math.max(0, Math.ceil((until - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [until]);

  const reset = () => setDigits(Array(CODE_LEN).fill(''));
  const firstBox = () => setTimeout(() => document.querySelector('.code-box')?.focus(), 0);

  async function confirm(code) {
    if (busy.current) return; // the last digit and a click on Confirm can arrive together
    if (!/^\d{6}$/.test(code)) {
      setErr('Enter all 6 digits from the email.');
      return;
    }
    busy.current = true;
    setErr('');
    setInfo('');
    setStatus('loading');
    try {
      await verifyEmail(email, code, remember);
    } catch (ex) {
      busy.current = false;
      setStatus('idle');
      setErr(friendlyAuthError(ex));
      reset();
      firstBox();
      return;
    }
    setStatus('done');
    onVerified();
  }

  async function resend() {
    if (left > 0 || sending) return;
    setErr('');
    setInfo('');
    setSending(true);
    try {
      const r = await resendCode(email);
      setInfo(`A new code is on its way to ${email}.`);
      setUntil(Date.now() + (r?.resendIn ?? 60) * 1000);
      reset();
      firstBox();
    } catch (ex) {
      if (ex.data?.secondsLeft) setUntil(Date.now() + ex.data.secondsLeft * 1000);
      setErr(friendlyAuthError(ex));
    } finally {
      setSending(false);
    }
  }

  return (
    <form
      className="stg login-form"
      onSubmit={(e) => {
        e.preventDefault();
        confirm(digits.join(''));
      }}
      noValidate
    >
      <div>
        <h1 className="login-h1">Check your email</h1>
        <p className="login-sub">
          We sent a 6-digit code to <b className="verify-email">{email}</b>. Enter it below to confirm your account — it
          expires in 15 minutes.
        </p>
      </div>
      <CodeBoxes
        digits={digits}
        onChange={(d) => {
          setDigits(d);
          if (err) setErr('');
        }}
        onComplete={confirm}
        disabled={status !== 'idle'}
      />
      <ErrorNote>{err}</ErrorNote>
      {info && (
        <div className="note-ok" role="status">
          {info}
        </div>
      )}
      <button
        className="btn full"
        type="submit"
        aria-live="polite"
        style={{ height: 56, fontSize: 16 }}
        disabled={status !== 'idle'}
      >
        {status === 'idle' && <span>Confirm</span>}
        {status === 'loading' && <span className="spin" aria-label="Checking the code" />}
        {status === 'done' && (
          <svg viewBox="0 0 24 24" className="done-check" aria-label="Confirmed">
            <path className="draw" d={I.check} />
          </svg>
        )}
      </button>
      {status === 'done' && (
        <Link to="/dashboard" className="toast" style={{ textAlign: 'center', fontWeight: 600 }}>
          Email confirmed! Open my dashboard →
        </Link>
      )}
      <div className="verify-links">
        <button
          type="button"
          className="link-btn"
          onClick={resend}
          disabled={left > 0 || sending || status === 'done'}
          aria-live="polite"
        >
          {sending ? 'Sending…' : left > 0 ? `Resend code in ${left}s` : 'Resend code'}
        </button>
        <button type="button" className="link-btn" onClick={onBack} disabled={status === 'done'}>
          Use a different email
        </button>
      </div>
      <p className="small-muted" style={{ margin: 0 }}>
        Can't find it? Check your spam folder.
      </p>
    </form>
  );
}

export default function Login() {
  const [params, setParams] = useSearchParams();
  const { user, ready, login, register, loginWithGoogle, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  // The tab is driven by the URL so ?mode=signup deep-links work and back/forward switch tabs.
  const mode = params.get('mode') === 'signup' ? 'signup' : 'login';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState(''); // sign-up only: "Confirm password"
  const [show, setShow] = useState(false);
  const [remember, setRem] = useState(rememberedChoice);
  const [status, setStatus] = useState('idle');
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [leaving, setLeaving] = useState(false);
  const [google, setGoogle] = useState(null); // { google, googleClientId } from the server
  const [verify, setVerify] = useState(null); // { email, resendIn } while the "Check your email" step shows
  const t = useRef(0);
  useEffect(() => () => clearTimeout(t.current), []);

  useEffect(() => {
    let live = true;
    api
      .get('/auth/config')
      .then((c) => live && setGoogle(c))
      .catch(() => live && setGoogle({ google: false }));
    return () => {
      live = false;
    };
  }, []);

  const signup = mode === 'signup';
  const dest = safeDest(loc.state?.from);
  // Live check of the sign-up password (same rules as the server: lib/passwordRules.js).
  const pwCheck = useMemo(() => checkPassword(pw, { email, name }), [pw, email, name]);
  const pwReady = pwCheck.ok && pw === pw2;

  function switchMode(m) {
    if (m === mode) return;
    const next = new URLSearchParams(params);
    if (m === 'signup') next.set('mode', 'signup');
    else next.delete('mode');
    setParams(next, { replace: true, state: loc.state });
    setStatus('idle');
    setErr('');
    setInfo('');
    setPw2('');
  }

  async function logOut() {
    setLeaving(true);
    setErr('');
    setInfo('');
    try {
      await logout();
    } catch (e) {
      setErr(friendlyAuthError(e));
    } finally {
      setLeaving(false);
    }
  }

  // Signed in: fetch the dashboard's code during the short success animation, so it opens instantly.
  function done() {
    preloadDashboard();
    saveChoice(remember);
    setStatus('done');
    t.current = setTimeout(() => nav(dest, { replace: true }), 900);
  }

  async function submit(e) {
    e.preventDefault();
    if (status !== 'idle') return;
    setErr('');
    setInfo('');
    if (signup && !name.trim()) {
      setErr('Tell us your name.');
      return;
    }
    if (!email.trim()) {
      setErr('Enter your email address.');
      return;
    }
    if (signup) {
      const bad = newPasswordProblem(pw, pw2, { email, name });
      if (bad) {
        setErr(bad.message);
        return;
      }
    } else if (!pw) {
      setErr('Enter your password.');
      return;
    }
    setStatus('loading');
    try {
      if (signup) {
        const r = await register(name.trim(), email.trim(), pw, pw2, remember);
        setStatus('idle');
        setPw('');
        setPw2('');
        setVerify({ email: r.email || email.trim(), resendIn: r.resendIn });
        return;
      }
      await login(email.trim(), pw, remember);
    } catch (ex) {
      setStatus('idle');
      if (ex.code === 'email_not_verified') {
        // Right password for a sign-up that isn't confirmed yet: show the code step
        // (with an error if the fresh code couldn't be emailed).
        setPw('');
        setVerify({
          email: ex.data?.email || email.trim(),
          resendIn: ex.data?.resendIn,
          error: ex.data?.emailError || '',
        });
        return;
      }
      setErr(friendlyAuthError(ex));
      return;
    }
    done();
  }

  function verified() {
    preloadDashboard();
    saveChoice(remember);
    t.current = setTimeout(() => nav('/dashboard', { replace: true }), 900);
  }

  function leaveVerify() {
    setVerify(null);
    setErr('');
    setInfo('');
    setTimeout(() => document.getElementById('em')?.focus(), 0);
  }

  async function forgot() {
    setErr('');
    setInfo('');
    if (!email.trim()) {
      setErr('Type your email first, then tap “Forgot password?”.');
      return;
    }
    try {
      await api.post('/auth/forgot-password', { email: email.trim() });
      setInfo(`If ${email.trim()} has an account, a reset link is on its way.`);
    } catch (ex) {
      setErr(friendlyAuthError(ex));
    }
  }

  async function onGoogle(credential) {
    setErr('');
    setInfo('');
    setStatus('loading');
    try {
      await loginWithGoogle(credential, remember);
    } catch (ex) {
      setStatus('idle');
      setErr(friendlyAuthError(ex));
      return;
    }
    done();
  }

  const showSignedIn = ready && user && status !== 'done' && !verify;

  return (
    <main className="ss pg-login">
      <div className="enter login-left">
        <Link to="/" className="brand" style={{ padding: 0 }}>
          <LogoMark />
          <span>SpendSmart</span>
        </Link>
        <div className="login-center">
          {verify ? (
            <VerifyStep
              key={verify.email}
              email={verify.email}
              resendIn={verify.resendIn}
              error={verify.error}
              remember={remember}
              onBack={leaveVerify}
              onVerified={verified}
            />
          ) : (
            <form className="stg login-form" onSubmit={submit} noValidate>
              {showSignedIn && (
                <div className="signed-in" role="status">
                  <div className="signed-in-txt">
                    You're signed in as <b>{user.email || 'this account'}</b>
                  </div>
                  <div className="signed-in-act">
                    <button type="button" className="btn sm" onClick={() => nav(dest, { replace: true })}>
                      Continue to dashboard
                    </button>
                    <button type="button" className="btn-o sm" onClick={logOut} disabled={leaving}>
                      {leaving ? 'Logging out…' : 'Log out'}
                    </button>
                  </div>
                </div>
              )}
              <div>
                <h1 className="login-h1">{signup ? 'Create your account' : 'Welcome back'}</h1>
                <p className="login-sub">
                  {signup ? 'Start tracking in under a minute.' : 'Log in to see where your money stands.'}
                </p>
              </div>
              <Seg
                label="Account"
                value={mode}
                onChange={switchMode}
                options={[
                  { value: 'login', label: 'Log in' },
                  { value: 'signup', label: 'Sign up' },
                ]}
              />
              <div
                className="name-slot"
                style={{ maxHeight: signup ? 100 : 0, opacity: signup ? 1 : 0, marginBottom: signup ? 18 : 0 }}
                aria-hidden={!signup}
              >
                <label className="lbl" htmlFor="nm">
                  Full name
                </label>
                <div className="inp inpw">
                  <Icon d={I.user}>
                    <circle cx="12" cy="8" r="4" />
                  </Icon>
                  <input
                    id="nm"
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    tabIndex={signup ? 0 : -1}
                    placeholder="Your name"
                  />
                </div>
              </div>
              <div style={{ marginTop: -18 }}>
                <label className="lbl" htmlFor="em">
                  Email
                </label>
                <div className="inp inpw">
                  <Icon d={I.mail}>
                    <rect x="3" y="5" width="18" height="14" rx="3" />
                  </Icon>
                  <input
                    id="em"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@email.com"
                  />
                </div>
              </div>
              <div>
                <label className="lbl" htmlFor="pw">
                  Password
                </label>
                <div className="inp inpw">
                  <Icon d={I.lock}>
                    <rect x="4" y="10" width="16" height="11" rx="3" />
                  </Icon>
                  <input
                    id="pw"
                    type={show ? 'text' : 'password'}
                    autoComplete={signup ? 'new-password' : 'current-password'}
                    required
                    value={pw}
                    onChange={(e) => setPw(e.target.value)}
                    placeholder={signup ? 'At least 8 characters' : 'Your password'}
                    aria-describedby={signup ? 'pw-help' : undefined}
                  />
                  <button
                    type="button"
                    aria-label={show ? 'Hide password' : 'Show password'}
                    className="pw-eye"
                    onClick={() => setShow(!show)}
                  >
                    {show ? (
                      <Icon d={I.eyeOff} />
                    ) : (
                      <Icon d={I.eye}>
                        <circle cx="12" cy="12" r="3" />
                      </Icon>
                    )}
                  </button>
                </div>
                {signup && <PasswordChecklist result={pwCheck} id="pw-help" />}
              </div>
              {signup && (
                <div>
                  <label className="lbl" htmlFor="pw2">
                    Confirm password
                  </label>
                  <PasswordInput
                    id="pw2"
                    value={pw2}
                    onChange={setPw2}
                    placeholder="Type it again"
                    describedBy="pw2-match"
                    showLabel="confirm password"
                  />
                  <MatchNote pw={pw} confirm={pw2} id="pw2-match" />
                </div>
              )}
              <div className="login-row">
                <label className="remember">
                  <input type="checkbox" checked={remember} onChange={(e) => setRem(e.target.checked)} /> Remember me
                </label>
                {!signup && (
                  <button type="button" className="link-btn" style={{ fontSize: 13 }} onClick={forgot}>
                    Forgot password?
                  </button>
                )}
              </div>
              <ErrorNote>{err}</ErrorNote>
              {info && (
                <div className="note-ok" role="status">
                  {info}
                </div>
              )}
              {/* aria-disabled (not disabled) until the password is ready, so a click/Enter still explains what's missing. */}
              <button
                className="btn full"
                type="submit"
                aria-live="polite"
                style={{ height: 56, fontSize: 16 }}
                disabled={status === 'loading'}
                aria-disabled={signup && status === 'idle' && !pwReady ? 'true' : undefined}
              >
                {status === 'idle' && <span>{signup ? 'Create account' : 'Log in'}</span>}
                {status === 'loading' && <span className="spin" aria-label="Loading" />}
                {status === 'done' && (
                  <svg viewBox="0 0 24 24" className="done-check" aria-label="Done">
                    <path className="draw" d={I.check} />
                  </svg>
                )}
              </button>
              {status === 'done' && (
                <Link to={dest} className="toast" style={{ textAlign: 'center', fontWeight: 600 }}>
                  You're in! Open my dashboard →
                </Link>
              )}
              {google?.google && google.googleClientId && (
                <>
                  <div className="or-line">
                    <div />
                    or continue with
                    <div />
                  </div>
                  <GoogleButton clientId={google.googleClientId} onCredential={onGoogle} onError={(m) => setErr(m)} />
                </>
              )}
            </form>
          )}
        </div>
      </div>

      <div className="scene login-art">
        <div aria-hidden="true" className="login-wallet">
          <div
            className="dropc"
            style={{ position: 'absolute', left: '30%', top: 0, '--to': '150px', animationDuration: '2.4s' }}
          >
            <Coin size={40} />
          </div>
          <div
            className="dropc"
            style={{
              position: 'absolute',
              left: '55%',
              top: 0,
              '--to': '160px',
              animationDuration: '2.4s',
              animationDelay: '.8s',
            }}
          >
            <Coin size={34} />
          </div>
          <div
            className="dropc"
            style={{
              position: 'absolute',
              left: '42%',
              top: 0,
              '--to': '140px',
              animationDuration: '2.4s',
              animationDelay: '1.6s',
            }}
          >
            <Coin size={46} />
          </div>
          <div className="float" style={{ transformStyle: 'preserve-3d' }}>
            <div className="wobble">
              <Wallet3D layers={3} />
            </div>
          </div>
          <div className="shadow3d" style={{ bottom: -36 }} />
        </div>
        <div style={{ textAlign: 'center', position: 'relative', padding: '0 24px' }}>
          <span className="hand" style={{ fontSize: 40 }}>
            Your coins missed you!
          </span>
          <p className="login-art-p">Bank-level encryption keeps your balances and budgets private.</p>
        </div>
      </div>
    </main>
  );
}
