import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useOrdersContext } from '../orders/OrdersContext';
import { NewOrderBanner } from './NewOrderBanner';

export function Layout() {
  const { user, logout } = useAuth();
  const {
    newOrderCount,
    soundEnabled,
    setSoundEnabled,
    acknowledgeNewOrders,
    dismissNewOrderBanner,
  } = useOrdersContext();

  async function enableDesktopAlerts() {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'granted') return;
    if (Notification.permission !== 'denied') {
      await Notification.requestPermission();
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar no-print">
        <Link
          to="/"
          className="brand"
          onClick={() => {
            acknowledgeNewOrders();
            dismissNewOrderBanner();
          }}
        >
          Knapsak <span>Supplier</span>
          {newOrderCount > 0 && (
            <span className="badge-count" aria-label={`${newOrderCount} new orders`}>
              {newOrderCount > 99 ? '99+' : newOrderCount}
            </span>
          )}
        </Link>
        <div className="topbar-right">
          <button
            type="button"
            className={`btn btn-ghost ${soundEnabled ? '' : 'btn-muted'}`}
            title={soundEnabled ? 'Mute new-order sound' : 'Unmute new-order sound'}
            onClick={() => setSoundEnabled(!soundEnabled)}
          >
            {soundEnabled ? 'Sound on' : 'Sound off'}
          </button>
          {typeof Notification !== 'undefined' && Notification.permission !== 'granted' && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => void enableDesktopAlerts()}
            >
              Desktop alerts
            </button>
          )}
          <span className="user-email">{user?.email}</span>
          <button type="button" className="btn btn-ghost" onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </header>
      <div className="no-print">
        <NewOrderBanner />
      </div>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
