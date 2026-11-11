import { useEffect, useRef, useState } from 'react';
import { I } from '../lib/icons.js';
import { SYMBOL } from '../lib/format.js';
import { useApp } from '../context/AppContext.jsx';

export function Icon({ d, size, className = '', style, children, ...rest }) {
  const s = size ? { width: size, height: size, ...style } : style;
  return (
    <svg className={`ic ${className}`} viewBox="0 0 24 24" aria-hidden="true" style={s} {...rest}>
      {d && <path d={d} />}
      {children}
    </svg>
  );
}

const reduced = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const ease = (t) => 1 - Math.pow(1 - t, 3);

/** Count-up number. Animates from `from` (or the last shown value) to `value`. */
export function Num({ value = 0, from = 0, decimals = 2, prefix = '', suffix, start = true, duration = 1000 }) {
  const app = useApp();
  const sfx = suffix ?? ` ${SYMBOL[app?.currency] || 'DT'}`;
  const [cur, setCur] = useState(from);
  const curRef = useRef(from);
  const raf = useRef(0);

  useEffect(() => {
    if (!start) return undefined;
    const a = curRef.current, b = Number(value) || 0;
    cancelAnimationFrame(raf.current);
    if (reduced() || a === b) { curRef.current = b; setCur(b); return undefined; }
    let t0 = null;
    const step = (ts) => {
      if (t0 === null) t0 = ts;
      const t = Math.min(1, (ts - t0) / duration);
      const v = a + (b - a) * ease(t);
      curRef.current = v; setCur(v);
      if (t < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [value, start, duration]);

  const s = Math.abs(cur).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return <span className="num">{(cur < -0.004 ? '−' : '') + prefix + s + sfx}</span>;
}

export function LogoMark({ size = 40 }) {
  return (
    <span className="gold logo-mark" style={{ width: size, height: size, borderRadius: size * 0.33 }}>
      <Icon d={I.wallet}><circle cx="16" cy="14" r="1.3" /></Icon>
    </span>
  );
}

export function Coin({ size = 44, spin = false, className = '', style, label = 'DT' }) {
  return <span className={`coin ${spin ? 'coinspin' : ''} ${className}`} aria-hidden="true" style={{ '--s': `${size}px`, ...style }}>{label}</span>;
}

/** The glossy 3D gold wallet from the landing and login screens. */
export function Wallet3D({ layers = 4 }) {
  const z = layers === 4 ? [-16, -12, -8, -4] : [-14, -9, -4];
  return (
    <div className="w3d">
      {z.map((v, i) => <span key={v} className="ly" style={{ transform: `translateZ(${v}px)`, background: i === z.length - 1 ? '#EDCF6E' : undefined }} />)}
      <span className="face" /><span className="stitch" /><span className="gloss" /><span className="flap" />
      <span className="clasp"><i /></span>
    </div>
  );
}

export function Seg({ options, value, onChange, label, role = 'tablist', style }) {
  const i = Math.max(0, options.findIndex((o) => o.value === value));
  const n = options.length;
  const itemRole = role === 'radiogroup' ? 'radio' : 'tab';
  return (
    <div className="seg" role={role} aria-label={label} style={style}>
      <span className="thumb" style={{ width: `calc(${100 / n}% - ${8 / n}px)`, transform: `translateX(${i * 100}%)` }} />
      {options.map((o) => (
        <button key={o.value} type="button" className={o.value === value ? 'on' : ''} role={itemRole}
          aria-selected={itemRole === 'tab' ? o.value === value : undefined}
          aria-checked={itemRole === 'radio' ? o.value === value : undefined}
          onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Switch({ on, onChange, label }) {
  return <button type="button" className={`sw ${on ? '' : 'off'}`} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />;
}

export function Modal({ open, onClose, title, children, width = 460 }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.activeElement;
    ref.current?.querySelector('input,select,button')?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    ref.current?.addEventListener('keydown', onKey);
    const node = ref.current;
    return () => { node?.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className="card modal toast" role="dialog" aria-modal="true" aria-label={title} style={{ maxWidth: width }}>
        <div className="modal-head">
          <span className="modal-title">{title}</span>
          <button type="button" className="x-btn" aria-label="Close" onClick={onClose}><Icon d={I.close} size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function BankCard({ source, children, className = '', style }) {
  return <div className={`bank ${source?.style || 'g1'} ${className}`} style={style}>{children}</div>;
}

export function SkeletonRows({ n = 4 }) {
  return (
    <div className="card skel-card" aria-busy="true" aria-label="Loading">
      {Array.from({ length: n }).map((_, k) => (
        <div key={k} className="skel-row">
          <span className="skel" style={{ width: 44, height: 44, borderRadius: 14 }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className="skel" style={{ height: 14, width: '55%' }} />
            <span className="skel" style={{ height: 11, width: '30%' }} />
          </div>
          <span className="skel" style={{ width: 80, height: 16 }} />
        </div>
      ))}
    </div>
  );
}

export function ErrorNote({ children }) {
  if (!children) return null;
  return <div className="err-note" role="alert"><Icon d={I.warn} size={18} />{children}</div>;
}

export function Mascot({ size = 72 }) {
  return (
    <div className="mascot" role="img" aria-label="Smiling coin mascot">
      <svg viewBox="0 0 80 80" width={size} height={size} aria-hidden="true">
        <defs><radialGradient id="mc" cx=".35" cy=".3" r=".8"><stop offset="0" stopColor="#FFF6D0" /><stop offset=".35" stopColor="#FDEEB2" /><stop offset=".7" stopColor="#FBE38E" /><stop offset="1" stopColor="#F2D06B" /></radialGradient></defs>
        <ellipse cx="40" cy="76" rx="20" ry="3" fill="#8A6406" opacity=".2" />
        <circle cx="40" cy="38" r="32" fill="url(#mc)" /><circle cx="40" cy="38" r="26" fill="none" stroke="#F2D06B" strokeWidth="3" opacity=".7" />
        <circle cx="31" cy="34" r="3.4" fill="#3B2F12" /><circle cx="49" cy="34" r="3.4" fill="#3B2F12" />
        <circle cx="32.2" cy="32.8" r="1.1" fill="#fff" /><circle cx="50.2" cy="32.8" r="1.1" fill="#fff" />
        <path d="M31 44c4 5 14 5 18 0" fill="none" stroke="#3B2F12" strokeWidth="3" strokeLinecap="round" />
        <circle cx="25" cy="42" r="3.5" fill="#F59E0B" opacity=".35" /><circle cx="55" cy="42" r="3.5" fill="#F59E0B" opacity=".35" />
      </svg>
    </div>
  );
}

/** Coin confetti burst used on the "Purchase saved" screen. */
const COLS = ['#FBE38E', '#FDEEB2', '#FFF0B3', '#F2D06B', '#8A6406', '#FDF3D2'];
const PIECES = Array.from({ length: 18 }, (_, i) => {
  const a = (i / 18) * Math.PI * 2, d = 90 + (i % 3) * 35;
  return { x: Math.round(Math.cos(a) * d), y: Math.round(Math.sin(a) * d * 0.8), r: (i * 47) % 360, bg: COLS[i % COLS.length], c: i % 4 === 0, d: (i % 5) * 0.03 };
});
export function Burst() {
  return (
    <div className="burst" style={{ top: 60, left: 60 }}>
      {PIECES.map((p, k) => <i key={k} className={p.c ? 'c' : ''} style={{ '--x': `${p.x}px`, '--y': `${p.y}px`, '--r': `${p.r}deg`, background: p.bg, animationDelay: `${p.d}s` }} />)}
    </div>
  );
}

export function Avatar({ initials, bg = '#FFF0B3', fg = '#57400A', size = 42, gold = false, style }) {
  return (
    <span className={gold ? 'gold avatar' : 'avatar'} style={{ width: size, height: size, fontSize: size * 0.32, ...(gold ? {} : { background: bg, color: fg }), ...style }}>
      {initials}
    </span>
  );
}
