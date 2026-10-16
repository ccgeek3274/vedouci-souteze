import { Link, NavLink, Outlet, useMatch } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { SKINS, getSkin, setSkin, type SkinId } from '../lib/skin';

function SkinSelect() {
  const [skin, set] = useState(getSkin);
  return (
    <select className="skin-select" title="Vzhled aplikace" aria-label="Vzhled aplikace" value={skin}
      onChange={(e) => { const v = e.target.value as SkinId; setSkin(v); set(v); }}>
      {SKINS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
    </select>
  );
}

/** App navigation — in the full header, or compact next to the competition title (CompetitionLayout). */
export function AppNav({ compact = false }: { compact?: boolean }) {
  const { user, logout } = useAuth();
  return (
    <nav className={`app-nav no-print${compact ? ' compact' : ''}`}>
      {compact ? <Link to="/">← Soutěže</Link> : <NavLink to="/" end>Soutěže</NavLink>}
      {!compact && <NavLink to="/tokeny">API tokeny</NavLink>}
      {!compact && user?.role === 'admin' && <NavLink to="/admin">Uživatelé</NavLink>}
      <SkinSelect />
      <span className="user">{user?.name}</span>
      <button className="btn btn-small" onClick={logout}>Odhlásit</button>
    </nav>
  );
}

export function Layout() {
  // Inside a competition the big header gives way to the competition title (CompetitionLayout renders AppNav).
  const inCompetition = !!useMatch('/c/:id/*');
  return (
    <div className={`page${inCompetition ? ' compact' : ''}`}>
      {!inCompetition && (
        <header className="app-header">
          <div>
            <div className="checker" />
            <h1 className="app-title"><Link to="/">Vedoucí soutěže</Link></h1>
            <p className="app-subtitle">Soutěže družstev — podklady, losování, zpravodaje</p>
          </div>
          <AppNav />
        </header>
      )}
      <Outlet />
    </div>
  );
}
