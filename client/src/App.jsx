import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import AppLayout from './components/AppLayout.jsx';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Transactions from './pages/Transactions.jsx';
import AddPurchase from './pages/AddPurchase.jsx';
import PurchaseSaved from './pages/PurchaseSaved.jsx';
import Purchases from './pages/Purchases.jsx';
import Budgets from './pages/Budgets.jsx';
import Shared from './pages/Shared.jsx';
import Subscriptions from './pages/Subscriptions.jsx';
import Goals from './pages/Goals.jsx';
import Settings from './pages/Settings.jsx';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />
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
