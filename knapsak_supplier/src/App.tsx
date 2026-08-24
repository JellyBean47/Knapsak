import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { Layout } from './components/Layout';
import { OrdersProvider } from './orders/OrdersContext';
import { LoginPage } from './pages/LoginPage';
import { OrderDetailPage } from './pages/OrderDetailPage';
import { OrdersPage } from './pages/OrdersPage';

function RequireSupplier({ children }: { children: React.ReactNode }) {
  const { user, isSupplier, loading } = useAuth();

  if (loading) {
    return (
      <div className="login-page">
        <p className="muted">Checking access…</p>
      </div>
    );
  }

  if (!user || !isSupplier) {
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
          <RequireSupplier>
            <OrdersProvider>
              <Layout />
            </OrdersProvider>
          </RequireSupplier>
        }
      >
        <Route index element={<OrdersPage />} />
        <Route path="orders/:orderId" element={<OrderDetailPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
