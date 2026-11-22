import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { AppProvider } from '../context/AppContext.jsx';
import Sidebar from './Sidebar.jsx';

export default function AppLayout() {
  const { user, ready } = useAuth();
  const loc = useLocation();
  if (!ready) return <div className="ss boot"><span className="spin" aria-label="Loading" /></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search + loc.hash }} />;
  return (
    <AppProvider>
      <div className="ss ss-layout">
        <div className="ss-sidewrap"><Sidebar /></div>
        <main className="ss-main" key={loc.pathname}>
          <Outlet />
        </main>
      </div>
    </AppProvider>
  );
}
