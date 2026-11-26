import { Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import AppLayout from './components/AppLayout.jsx';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import {
  AddPurchase,
  Budgets,
  Dashboard,
  Goals,
  PurchaseSaved,
  Purchases,
  ResetPassword,
  Settings,
  Shared,
  Subscriptions,
  Transactions,
} from './pages/lazy.js';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route
          path="/reset-password"
          element={
            <Suspense
              fallback={
                <div className="ss boot">
                  <span className="spin" aria-label="Loading" />
                </div>
              }
            >
              <ResetPassword />
            </Suspense>
          }
        />
        {/* AppLayout wraps its pages in <Suspense>, so the sidebar stays while a page downloads. */}
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/add" element={<AddPurchase />} />
          <Route path="/add/saved" element={<PurchaseSaved />} />
          <Route path="/purchases" element={<Purchases />} />
          <Route path="/budgets" element={<Budgets />} />
          <Route path="/shared" element={<Shared />} />
          <Route path="/subscriptions" element={<Subscriptions />} />
          <Route path="/goals" element={<Goals />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
