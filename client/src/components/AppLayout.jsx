import { useCallback, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { AppProvider } from '../context/AppContext.jsx';
import Sidebar from './Sidebar.jsx';

const SIDE_KEY = 'ss-side-collapsed';

export default function AppLayout() {
  const { user, ready } = useAuth();
  const loc = useLocation();
  // The sidebar's expanded / icon-rail state is remembered between visits.
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem(SIDE_KEY) === '1'; } catch { return false; } });
  const toggleSide = useCallback(() => setCollapsed((c) => {
    try { localStorage.setItem(SIDE_KEY, c ? '0' : '1'); } catch { /* private mode: just don't remember */ }
    return !c;
  }), []);
  if (!ready) return <div className="ss boot"><span className="spin" aria-label="Loading" /></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search + loc.hash }} />;
  return (
    <AppProvider>
      <div className="ss ss-layout">
        <div className={`ss-sidewrap ${collapsed ? 'collapsed' : ''}`}><Sidebar collapsed={collapsed} onToggle={toggleSide} /></div>
        <main className="ss-main" key={loc.pathname}>
          <Outlet />
        </main>
      </div>
    </AppProvider>
  );
}
