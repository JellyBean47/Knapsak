import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { roleLabel } from '../domain/roles';

const nav = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/pos', label: 'POS' },
  { to: '/inventory', label: 'Inventory' },
  { to: '/customers', label: 'Customers' },
  { to: '/receivables', label: 'Receivables' },
  { to: '/suppliers', label: 'Suppliers' },
  { to: '/purchasing', label: 'Purchasing' },
  { to: '/bills', label: 'Bills' },
  { to: '/banking', label: 'Banking' },
  { to: '/accounts', label: 'Accounts' },
  { to: '/journals', label: 'Journals' },
  { to: '/exports', label: 'Exports' },
  { to: '/periods', label: 'Periods' },
];

export function Layout() {
  const { user, posRole, logout } = useAuth();

  return (
    <div className="app-shell">
      <header className="topbar">
        <NavLink to="/" className="brand" end>
          Knapsak <span>POS</span>
        </NavLink>
        <nav className="nav">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="topbar-right">
          {posRole && <span className="role-chip">{roleLabel(posRole)}</span>}
          <span className="user-email">{user?.email}</span>
          <button type="button" className="btn btn-ghost" onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </header>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
