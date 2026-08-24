import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { Layout } from './components/Layout';
import { canAccessPos } from './domain/roles';
import { BankingPage } from './pages/BankingPage';
import { BillsPage } from './pages/BillsPage';
import { ChartOfAccountsPage } from './pages/ChartOfAccountsPage';
import { CustomersPage } from './pages/CustomersPage';
import { DashboardPage } from './pages/DashboardPage';
import { ExportsPage } from './pages/ExportsPage';
import { InventoryPage } from './pages/InventoryPage';
import { JournalsPage } from './pages/JournalsPage';
import { LoginPage } from './pages/LoginPage';
import { PeriodsPage } from './pages/PeriodsPage';
import { PosPage } from './pages/PosPage';
import { PurchasingPage } from './pages/PurchasingPage';
import { ReceivablesPage } from './pages/ReceivablesPage';
import { SuppliersPage } from './pages/SuppliersPage';

function RequirePos({ children }: { children: ReactNode }) {
  const { user, posRole, loading } = useAuth();

  if (loading) {
    return (
      <div className="login-page">
        <p className="muted">Checking access…</p>
      </div>
    );
  }

  if (!user || !canAccessPos(posRole)) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <RequirePos>
            <Layout />
          </RequirePos>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="accounts" element={<ChartOfAccountsPage />} />
        <Route path="periods" element={<PeriodsPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="journals" element={<JournalsPage />} />
        <Route path="exports" element={<ExportsPage />} />
        <Route path="pos" element={<PosPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="receivables" element={<ReceivablesPage />} />
        <Route path="suppliers" element={<SuppliersPage />} />
        <Route path="purchasing" element={<PurchasingPage />} />
        <Route path="bills" element={<BillsPage />} />
        <Route path="banking" element={<BankingPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
