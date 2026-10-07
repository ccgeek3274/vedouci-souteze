import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { apiErrorText } from '../lib/api';

const ERROR_MESSAGES: Record<string, string> = {
  pending: 'Účet byl vytvořen a čeká na schválení správcem. Zkuste to později.',
  blocked: 'Účet byl zablokován.',
  invalid_state: 'Přihlášení selhalo (neplatný stav). Zkuste to znovu.',
  token_exchange_failed: 'Přihlášení přes Google selhalo. Zkuste to znovu.',
  profile_fetch_failed: 'Nepodařilo se načíst profil Google účtu. Zkuste to znovu.',
};

export function Login() {
  const { isAuthenticated, isLoading, googleLogin, devLogin, passwordLogin } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // OAuth callback reports failures as /login#error=<code>.
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith('#error=')) {
      const code = hash.slice(7);
      setError(ERROR_MESSAGES[code] ?? `Přihlášení selhalo (${code}).`);
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await passwordLogin(email, password);
    } catch (err) {
      setError(apiErrorText(err) ?? 'Přihlášení selhalo. Zkuste to znovu.');
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) return <div className="center-screen" style={{ color: 'var(--cream)' }}>Načítání…</div>;
  if (isAuthenticated) return <Navigate to="/" replace />;

  return (
    <div className="center-screen">
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div className="checker" />
        <h1 className="app-title">Vedoucí soutěže</h1>
        <p className="app-subtitle" style={{ marginBottom: 24 }}>Přihlaste se pro přístup ke svým soutěžím.</p>
        <div className="card">
          <div className="card-strip"><h2>Přihlášení</h2></div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {error && <div className="alert" style={{ marginBottom: 0 }}>{error}</div>}
            <button className="btn btn-primary" style={{ height: 44 }} onClick={googleLogin}>
              Přihlásit se přes Google
            </button>
            <div className="row" style={{ gap: 10 }}>
              <span style={{ flex: 1, borderTop: '1px solid var(--divider)' }} />
              <span className="eyebrow">nebo</span>
              <span style={{ flex: 1, borderTop: '1px solid var(--divider)' }} />
            </div>
            <form onSubmit={handlePasswordLogin} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="field">
                <label htmlFor="email">E-mail</label>
                <input id="email" className="input" type="email" value={email} required autoComplete="username"
                  onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="password">Heslo</label>
                <input id="password" className="input" type="password" value={password} required autoComplete="current-password"
                  onChange={(e) => setPassword(e.target.value)} />
              </div>
              <button className="btn" type="submit" disabled={submitting} style={{ height: 44 }}>
                {submitting ? 'Přihlašování…' : 'Přihlásit se heslem'}
              </button>
            </form>
            {import.meta.env.DEV && (
              <button className="btn" onClick={devLogin}>Dev login (testovací uživatel)</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
