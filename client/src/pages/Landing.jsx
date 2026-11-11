import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { I } from '../lib/icons.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Coin, Icon, LogoMark, Num, Wallet3D } from '../components/ui.jsx';

const reduced = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const WORDS = ['Know', 'where', 'every', 'coin', 'goes.'];

function Emv(props) { return <span className="emv" {...props} />; }

export default function Landing() {
  const { session } = useAuth();
  const [seen, setSeen] = useState({});
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });
  const [bPhase, setBPhase] = useState(0);
  const ticking = useRef(false);
  const started = useRef(false);
  const timers = useRef([]);

  useEffect(() => {
    const els = document.querySelectorAll('[data-rv]');
    const reveal = (add) => {
      setSeen((s) => ({ ...s, ...add }));
      if (add.b && !started.current) {
        started.current = true;
        timers.current.push(setTimeout(() => setBPhase(1), 250), setTimeout(() => setBPhase(2), 1700), setTimeout(() => setBPhase(3), 2700));
      }
    };
    if (!('IntersectionObserver' in window)) {
      const all = {}; els.forEach((el) => { all[el.dataset.rv] = true; }); reveal(all); return undefined;
    }
    const io = new IntersectionObserver((entries) => {
      const add = {};
      entries.forEach((en) => { if (en.isIntersecting) { add[en.target.dataset.rv] = true; io.unobserve(en.target); } });
      if (Object.keys(add).length) reveal(add);
    }, { threshold: 0.25 });
    els.forEach((el) => io.observe(el));
    const t = timers.current;
    return () => { io.disconnect(); t.forEach(clearTimeout); };
  }, []);

  function onMove(e) {
    if (reduced() || ticking.current) return;
    const x = e.clientX, y = e.clientY;
    ticking.current = true;
    requestAnimationFrame(() => {
      ticking.current = false;
      const w = window.innerWidth || 1, h = window.innerHeight || 1;
      setTilt({ ry: ((x / w) - 0.5) * 24, rx: -((y / h) - 0.5) * 16 });
    });
  }

  const cls = (k) => (seen[k] ? 'in' : '');
  const startTo = session ? '/dashboard' : '/login?mode=signup';
  const loginTo = session ? '/dashboard' : '/login';
  const bW = bPhase === 0 ? 0 : bPhase === 1 ? 60 : 85;

  return (
    <div className="ss pg-landing" onMouseMove={onMove}>
      <header className="nav">
        <div className="nav-in">
          <Link to="/" className="brand" style={{ marginRight: 'auto', padding: 0 }}><LogoMark /><span>SpendSmart</span></Link>
          <nav aria-label="Sections" className="nav-links">
            <a className="lk" href="#money">Accounts</a><a className="lk" href="#budgets">Budgets</a><a className="lk" href="#split">Split</a><a className="lk" href="#renew">Renewals</a><a className="lk" href="#goals">Goals</a>
          </nav>
          <div style={{ display: 'flex', gap: 10 }}>
            {session
              ? <Link className="btn" to="/dashboard" style={{ height: 44, padding: '0 20px', fontSize: 14 }}>Open dashboard</Link>
              : <>
                  <Link className="btn-o" to="/login" style={{ height: 44, padding: '0 18px', fontSize: 14 }}>Log in</Link>
                  <Link className="btn" to="/login?mode=signup" style={{ height: 44, padding: '0 20px', fontSize: 14 }}>Get started</Link>
                </>}
          </div>
        </div>
      </header>

      <section className="hero">
        <div className="hero-txt">
          <span className="hand enter" style={{ fontSize: 36 }}>Spend smart, live happy!</span>
          <h1 className="hero-h1">
            {WORDS.map((w, i) => (
              <span key={w}><span className={`word ${w === 'coin' ? 'goldtext' : ''}`} style={{ animationDelay: `${0.15 + i * 0.12}s` }}>{w}</span>{i < WORDS.length - 1 ? ' ' : ''}</span>
            ))}
          </h1>
          <p className="enter hero-p" style={{ animationDelay: '.7s' }}>Cards, cash, budgets, shared bills and renewals — in one warm little place that tells you where you stand at a glance.</p>
          <div className="enter" style={{ display: 'flex', gap: 14, flexWrap: 'wrap', animationDelay: '.85s' }}>
            <Link className="btn" to={startTo} style={{ height: 58, padding: '0 30px', fontSize: 16 }}>Get started — it's free</Link>
            <Link className="btn-o" to={loginTo} style={{ height: 58, fontSize: 16 }}>I have an account</Link>
          </div>
          <div className="enter hero-note" style={{ animationDelay: '1s' }}>
            <span style={{ display: 'flex' }}><Coin size={26} style={{ fontSize: 11 }} /><Coin size={26} style={{ fontSize: 11, marginLeft: -8 }} /><Coin size={26} style={{ fontSize: 11, marginLeft: -8 }} /></span>
            No bank login needed · Works with cards and cash
          </div>
        </div>

        <div className="scene hero-vis">
          <div aria-hidden="true" className="hero-glow" />
          <div className="hero-tilt" style={{ transform: `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)` }} role="img" aria-label="A glossy gold wallet floating, with coins orbiting around it">
            <div className="float" style={{ transformStyle: 'preserve-3d' }}><div className="wobble"><Wallet3D /></div></div>
            <div className="orbit">
              {[[0, 0, 50, 3.2, 0.5], [72, -40, 38, 2.6, 0.62], [144, 30, 44, 3.6, 0.74], [216, -70, 32, 3.2, 0.86], [288, 56, 46, 2.9, 0.98]].map(([deg, ty, s, dur, delay]) => (
                <div key={deg} className="oc" style={{ transform: `rotateY(${deg}deg) translateZ(calc(var(--w) * .78)) translateY(${ty}px) translate(-50%, -50%)` }}>
                  <div className="popout" style={{ animationDelay: `${delay}s` }}><div className="coin coinspin" style={{ '--s': `${s}px`, animationDuration: `${dur}s` }}>DT</div></div>
                </div>
              ))}
            </div>
            <div className="shadow3d" />
          </div>
        </div>
      </section>

      <section aria-label="Dashboard preview" className="mock-wrap">
        <div className="mockfloat mock">
          <div className="mock-side">
            <span className="gold" style={{ width: 30, height: 30, borderRadius: 10 }} />
            <span style={{ width: 30, height: 30, borderRadius: 99, background: '#FDF3D2' }} />
            {[1, 2, 3].map((k) => <span key={k} style={{ width: 30, height: 8, borderRadius: 99, background: '#FDF3D2' }} />)}
          </div>
          <div className="mock-main">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontWeight: 700, fontSize: 16 }}>Hello there! 👋</span><span style={{ width: 120, height: 28, borderRadius: 10, background: '#fff' }} /></div>
            <div className="gold sheen" style={{ borderRadius: 20, padding: '16px 18px' }}><div style={{ fontSize: 12, fontWeight: 500 }}>Total available</div><div style={{ fontSize: 30, fontWeight: 700 }}>1,756.90 DT</div></div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div className="bank g1 mini-bank"><Emv style={{ width: 28, height: 20 }} /><b style={{ fontSize: 15 }}>420.00 DT</b></div>
              <div className="bank g2 mini-bank"><Emv style={{ width: 28, height: 20 }} /><b style={{ fontSize: 15 }}>1,250.40 DT</b></div>
              <div className="bank g3 mini-bank"><span style={{ fontSize: 11, fontWeight: 600 }}>Cash</span><b style={{ fontSize: 15 }}>86.50 DT</b></div>
            </div>
            <div style={{ background: '#fff', borderRadius: 16, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600 }}><span>Coffee</span><span style={{ color: '#B45309' }}>Near limit</span></div>
              <div className="bar"><div className="fill" style={{ width: '85%', animation: 'demoFill 5s cubic-bezier(.22,1,.36,1) infinite, stripes 1.4s linear infinite' }} /><span className="thr" style={{ left: '80%' }} /></div>
            </div>
          </div>
        </div>
      </section>

      <section id="money" data-rv="a" className={`sec rv ${cls('a')}`}>
        <div className="txt">
          <span className="kick">All your money in one place</span>
          <h2>Every card and wallet, side by side.</h2>
          <p>Card 1, Card 2 and your Cash Wallet with live balances that update the second you log a purchase.</p>
        </div>
        <div className="vis">
          <div className="deck">
            <div className="bank g1"><div className="bank-top"><Emv /><span style={{ fontWeight: 600 }}>Card 1</span></div><div style={{ fontSize: 28, fontWeight: 700 }}><Num value={420} start={!!seen.a} suffix=" DT" /></div><span className="digits">•••• 4821</span></div>
            <div className="bank g2"><div className="bank-top"><Emv /><span style={{ fontWeight: 600 }}>Card 2</span></div><div style={{ fontSize: 28, fontWeight: 700 }}><Num value={1250.4} start={!!seen.a} suffix=" DT" /></div><span className="digits">•••• 7390</span></div>
            <div className="bank g3"><div className="bank-top"><Icon d={I.wallet}><circle cx="16" cy="14" r="1.3" /></Icon><span style={{ fontWeight: 600 }}>Cash Wallet</span></div><div style={{ fontSize: 28, fontWeight: 700 }}><Num value={86.5} start={!!seen.a} suffix=" DT" /></div><span style={{ fontSize: 13, color: '#6B5A33' }}>Cash on hand</span></div>
          </div>
        </div>
      </section>

      <section id="budgets" data-rv="b" className={`sec rv rev ${cls('b')}`}>
        <div className="txt">
          <span className="kick">Budgets that warn you in time</span>
          <h2>A friendly nudge before you overspend.</h2>
          <p>Set a monthly limit and an alert threshold. The moment you cross it, SpendSmart lets you know — not at the end of the month.</p>
        </div>
        <div className="vis" style={{ flexDirection: 'column', gap: 18 }}>
          {bPhase >= 3 && (
            <div className="toast warn-toast" role="status" style={{ alignSelf: 'flex-end', maxWidth: 380 }}>
              <span className="warn-ic"><Icon d={I.warn} /></span>
              <span style={{ fontSize: 14, lineHeight: 1.45 }}>⚠️ You've used <b>85%</b> of your Coffee budget (98 DT / 115 DT)</span>
            </div>
          )}
          <div className="card" style={{ width: '100%', maxWidth: 460, padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontWeight: 600, fontSize: 17 }}>Coffee</span><span className={`st ${bPhase >= 2 ? 'near' : 'under'}`}>{bPhase >= 2 ? 'Near limit' : 'Under budget'}</span></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}><div className="bar lg"><div className="fill live" style={{ width: `${bW}%` }} /><span className={`thr ${bPhase >= 1 ? 'pulse' : ''}`} style={{ left: '80%' }} /></div><span style={{ fontWeight: 700, fontSize: 18, minWidth: 50, textAlign: 'right' }}>{bW}%</span></div>
            <div style={{ fontSize: 14, color: '#6B5A33' }}><b style={{ color: '#3B2F12' }}>{bPhase >= 2 ? '98 DT' : '80 DT'}</b> / 115 DT · alert at 80%</div>
          </div>
        </div>
      </section>

      <section id="split" data-rv="c" className={`sec rv ${cls('c')}`}>
        <div className="txt">
          <span className="kick">Split with roommates</span>
          <h2>Share a bill in two taps.</h2>
          <p>Send a split request to a roommate. When they accept, their half comes straight out of their balance — no awkward reminders.</p>
        </div>
        <div className="vis">
          <div className="split-demo">
            <div className="sd-person" style={{ left: 0 }}><span className="gold sd-av">ME</span><b>You</b></div>
            <div className="sd-person" style={{ right: 0 }}><span className="sd-av" style={{ background: '#FBCFE8', color: '#9D174D' }}>SA</span><b>Sarah</b></div>
            <div className="travelc" style={{ position: 'absolute', left: 70, bottom: 90, '--dx': 'min(300px, calc(100vw - 200px))' }}><Coin size={40} /></div>
            <div className="bubble sd-bubble"><span className="sd-check"><Icon d={I.check} size={14} style={{ strokeWidth: 3 }} /></span>Accept · 30 DT</div>
            <div className="sd-label">Groceries – 60 DT · 50 / 50</div>
          </div>
        </div>
      </section>

      <section id="renew" data-rv="d" className={`sec rv rev ${cls('d')}`}>
        <div className="txt">
          <span className="kick">Never miss a renewal</span>
          <h2>Subscriptions, without the surprises.</h2>
          <p>All your subscriptions in one list, with a gentle heads-up three days before each one charges.</p>
        </div>
        <div className="vis" style={{ flexDirection: 'column', gap: 22 }}>
          <div className="cal">
            <span className="ring" style={{ left: 54 }} /><span className="ring" style={{ right: 54 }} />
            <div className="pg"><span className="top" /><span className="cal-m">NOV</span><span className="cal-d">8</span><span className="cal-w">Sunday</span></div>
            <div className="pg leaf"><span className="top" /><span className="cal-m">NOV</span><span className="cal-d">5</span><span className="cal-w">Thursday</span></div>
          </div>
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 18 }}>
            <span className="sub-dot"><svg className="ic" viewBox="0 0 24 24" style={{ width: 18, height: 18, fill: 'currentColor', stroke: 'none' }} aria-hidden="true"><path d={I.play} /></svg></span>
            <div><div style={{ fontWeight: 600 }}>StreamBox · 12.99 DT</div><span className="st near" style={{ marginTop: 4 }}>Renews in 3 days</span></div>
          </div>
        </div>
      </section>

      <section id="goals" data-rv="e" className={`sec rv ${cls('e')}`}>
        <div className="txt">
          <span className="kick">Dream bigger</span>
          <h2>Watch your savings jar fill up.</h2>
          <p>Set a goal like a New Laptop, choose where the money comes from and see every coin land.</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 6 }}><span style={{ fontSize: 34, fontWeight: 700 }}><Num value={800} decimals={0} start={!!seen.e} suffix=" DT" /></span><span style={{ color: '#6B5A33' }}>/ 1,200 DT · New Laptop</span></div>
        </div>
        <div className="vis">
          <div style={{ position: 'relative' }}>
            {[[40, 150, 30, 0], [55, 130, 26, 0.9], [30, 160, 28, 1.7]].map(([l, to, s, d]) => (
              <div key={l} className="dropc" style={{ position: 'absolute', left: `${l}%`, top: 0, '--to': `${to}px`, animationDelay: `${d}s` }}><Coin size={s} style={{ fontSize: 11 }} /></div>
            ))}
            <div style={{ paddingTop: 60 }}>
              <div className="lid" style={{ '--h': '240px' }} />
              <div className="jar" style={{ '--h': '240px' }}><div className="lvl" style={{ height: `${seen.e ? 67 : 0}%`, animation: 'none' }} /><span className="glint" />
                <span className="jar-pct">{seen.e ? 67 : 0}%</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section data-rv="s" className={`rv ${cls('s')} stats-wrap`}>
        <div className="card stats">
          <div className="stat"><div className="stat-n"><Num value={3} decimals={0} suffix="" start={!!seen.s} /></div><div className="muted">sources tracked</div></div>
          <div className="stat"><div className="stat-n"><Num value={80} decimals={0} suffix="%" start={!!seen.s} /></div><div className="muted">alert threshold</div></div>
          <div className="stat"><div className="stat-n"><Num value={0} from={9} decimals={0} suffix="" start={!!seen.s} /></div><div className="muted">missed renewals</div></div>
        </div>
      </section>

      <section className="cta-wrap">
        <div className="gold sheen cta">
          <Coin size={64} className="float" style={{ position: 'absolute', right: '8%', top: '18%', fontSize: 26 }} />
          <Coin size={40} className="float" style={{ position: 'absolute', right: '22%', bottom: '14%', animationDelay: '1.2s' }} />
          <Coin size={30} className="float" style={{ position: 'absolute', right: '3%', bottom: '22%', animationDelay: '2.1s', fontSize: 12 }} />
          <div style={{ flex: '1 1 360px', position: 'relative' }}>
            <h2 className="cta-h">Ready to make every coin count?</h2>
            <p style={{ margin: '10px 0 0', fontSize: 17, color: '#57400A' }}>Set up your cards and cash in under a minute.</p>
          </div>
          <Link to={startTo} className="cta-btn">Get started — it's free <Icon d={I.arrow} size={18} /></Link>
        </div>
      </section>

      <footer className="foot">
        <div className="foot-in">
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: '#3B2F12' }}><span className="gold" style={{ width: 28, height: 28, borderRadius: 9 }} />SpendSmart</span>
          <span>© {new Date().getFullYear()} SpendSmart</span>
          <span style={{ display: 'flex', gap: 20 }}><a href="#privacy">Privacy</a><a href="#terms">Terms</a><a href="mailto:hello@spendsmart.app">Contact</a></span>
        </div>
      </footer>
    </div>
  );
}
