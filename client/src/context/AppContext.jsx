import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { money, moneyShort } from '../lib/format.js';

const Ctx = createContext(null);

/** App-wide data: the dashboard summary (profile, sources, alerts, unread count) and toasts. */
export function AppProvider({ children }) {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const [toasts, setToasts] = useState([]);
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    try { setSummary(await api.get('/summary')); setError(''); }
    catch (e) { setError(e.message); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const toast = useCallback((text, kind = 'ok') => {
    const id = ++seq.current;
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const currency = summary?.profile?.currency || 'TND';
  const value = {
    summary, error, refresh, toast, currency,
    profile: summary?.profile, sources: summary?.sources || [],
    fmt: (n, o) => money(n, currency, o), fmtShort: (n) => moneyShort(n, currency)
  };
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`} role={t.kind === 'err' ? 'alert' : 'status'}>{t.text}</div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useApp = () => useContext(Ctx);
