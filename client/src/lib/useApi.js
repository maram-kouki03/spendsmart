import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';

/** Fetch `path` on mount and whenever it changes. Keeps old data while reloading. */
export function useApi(path, { minDelay = 0 } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const live = useRef(0);

  const load = useCallback(async () => {
    if (!path) return;
    const n = ++live.current;
    setLoading(true);
    const t0 = Date.now();
    try {
      const d = await api.get(path);
      const wait = minDelay - (Date.now() - t0);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      if (n === live.current) { setData(d); setError(''); }
    } catch (e) {
      if (n === live.current) setError(e.message);
    } finally {
      if (n === live.current) setLoading(false);
    }
  }, [path, minDelay]);

  useEffect(() => { load(); }, [load]);
  return { data, setData, error, loading, reload: load };
}
