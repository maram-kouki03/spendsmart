import { useState } from 'react';
import { I } from '../lib/icons.js';
import { Icon } from './ui.jsx';

/**
 * Live password feedback for every "choose a password" form: a strength bar (4 segments + label)
 * and the rules from lib/passwordRules.js, each with ✓ or ○ and real text (not just colour).
 * `result` is checkPassword(pw, ctx).
 */
export function PasswordChecklist({ result, id }) {
  const { score, label } = result.strength;
  return (
    <div className="pw-help" id={id}>
      <div className="pw-strength" data-score={score}>
        <div className="pw-bar" aria-hidden="true">
          {[1, 2, 3, 4].map((i) => <span key={i} className={i <= score ? 'on' : ''} />)}
        </div>
        <span className="pw-strength-lbl" aria-live="polite">{label ? `Strength: ${label}` : 'Strength: —'}</span>
      </div>
      <ul className="pw-rules" aria-label="Password requirements">
        {result.rules.map((r) => (
          <li key={r.id} className={r.ok ? 'ok' : ''}>
            <span className="pw-mark" aria-hidden="true">{r.ok ? '✓' : '○'}</span>
            {r.label}
            <span className="sr-only">{r.ok ? ' — done' : ' — not yet'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** "Passwords match ✓" / "Passwords don't match", once something has been typed in the confirm field. */
export function MatchNote({ pw, confirm, id }) {
  if (!confirm) return null;
  const same = pw === confirm;
  return (
    <div id={id} className={`pw-match ${same ? 'ok' : 'bad'}`} aria-live="polite">
      {same ? 'Passwords match ✓' : "Passwords don't match"}
    </div>
  );
}

/** The login-page style password input (lock icon + show/hide eye), with its own visibility toggle. */
export function PasswordInput({ id, value, onChange, autoComplete = 'new-password', placeholder, describedBy, tabIndex, disabled, showLabel = 'password' }) {
  const [show, setShow] = useState(false);
  return (
    <div className="inp inpw">
      <Icon d={I.lock}><rect x="4" y="10" width="16" height="11" rx="3" /></Icon>
      <input id={id} type={show ? 'text' : 'password'} autoComplete={autoComplete} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} aria-describedby={describedBy} tabIndex={tabIndex} disabled={disabled} />
      <button type="button" aria-label={show ? `Hide ${showLabel}` : `Show ${showLabel}`} className="pw-eye" onClick={() => setShow(!show)} tabIndex={tabIndex} disabled={disabled}>
        {show ? <Icon d={I.eyeOff} /> : <Icon d={I.eye}><circle cx="12" cy="12" r="3" /></Icon>}
      </button>
    </div>
  );
}
