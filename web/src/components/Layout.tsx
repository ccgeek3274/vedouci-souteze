import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export function Layout() {
  const { user, logout } = useAuth();
  return (
    <div className="page">
      <header className="app-header">
        <div>
          <div className="checker" />
          <h1 className="app-title"><Link to="/">Vedoucí soutěže</Link></h1>
          <p className="app-subtitle">Soutěže družstev — podklady, losování, zpravodaje</p>
        </div>
        <nav className="app-nav">
          <NavLink to="/" end>Soutěže</NavLink>
          <NavLink to="/tokeny">API tokeny</NavLink>
          {user?.role === 'admin' && <NavLink to="/admin">Uživatelé</NavLink>}
          <span className="user">{user?.name}</span>
          <button className="btn btn-small" onClick={logout}>Odhlásit</button>
        </nav>
      </header>
      <Outlet />
    </div>
  );
}
