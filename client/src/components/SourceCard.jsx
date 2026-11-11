import { I } from '../lib/icons.js';
import { Icon, Num } from './ui.jsx';

const KIND = { debit: 'Debit', credit: 'Credit', cash: '', other: '' };

/** A bank-card style tile for a card or wallet with its live balance. */
export default function SourceCard({ source, value, from, label = 'Remaining', duration, compact = false, tail }) {
  const cash = source.kind === 'cash';
  const subColor = source.style === 'g2' ? '#FFF0B3' : source.style === 'g3' ? '#6B5A33' : '#57400A';
  const title = KIND[source.kind] ? `${source.name} · ${KIND[source.kind]}` : source.name;
  return (
    <div className={`bank ${source.style || 'g1'}`} style={compact ? { minHeight: 118, padding: '14px 16px', borderRadius: 18, gap: 6 } : undefined}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        {cash ? <Icon d={I.wallet} style={{ color: '#8A6406' }}><circle cx="16" cy="14" r="1.3" /></Icon> : <span className="emv" style={compact ? { width: 32, height: 24 } : undefined} />}
        <span style={{ fontWeight: 600, fontSize: compact ? 13 : 15, textAlign: 'right' }}>{compact ? source.name : title}</span>
      </div>
      <div>
        {!compact && <div style={{ fontSize: 12, color: subColor }}>{label}</div>}
        <div style={{ fontSize: compact ? 22 : 30, fontWeight: 700, letterSpacing: -0.5 }}><Num value={value ?? source.balance} from={from ?? 0} duration={duration} /></div>
      </div>
      {tail ?? (cash || !source.last4
        ? <span style={{ fontSize: compact ? 12 : 13, color: subColor, opacity: compact ? 0.85 : 1 }}>{cash ? 'Cash on hand' : source.kind === 'credit' ? 'Credit card' : 'Card'}</span>
        : <span className="digits" style={compact ? { fontSize: 12, letterSpacing: 2 } : undefined}>{compact ? `•••• ${source.last4}` : `•••• •••• •••• ${source.last4}`}</span>)}
    </div>
  );
}
