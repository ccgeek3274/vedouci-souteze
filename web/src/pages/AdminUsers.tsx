import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorText } from '../lib/api';
import { useAuth, type User } from '../hooks/useAuth';

type AdminUser = User & { created_at: number; has_password: number };

const STATUS_LABEL: Record<AdminUser['status'], string> = {
  pending: 'Čeká na schválení',
  active: 'Aktivní',
  blocked: 'Zablokován',
};

export function AdminUsers() {
  const { user: me } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ email: '', name: '', password: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => api.get<{ users: AdminUser[] }>('/admin/users'),
  });

  const run = (fn: () => Promise<unknown>) => async () => {
    setError(null);
    try {
      await fn();
      await queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    } catch (err) {
      setError(apiErrorText(err) ?? 'Akce selhala');
    }
  };

  const create = useMutation({
    mutationFn: () => api.post('/admin/users', form),
    onSuccess: () => {
      setForm({ email: '', name: '', password: '' });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (err) => setError(apiErrorText(err) ?? 'Vytvoření selhalo'),
  });

  const setStatus = (u: AdminUser, status: AdminUser['status']) => run(() => api.patch(`/admin/users/${u.id}`, { status }));

  const resetPassword = (u: AdminUser) => run(async () => {
    const password = window.prompt(`Nové heslo pro ${u.email} (min. 8 znaků):`);
    if (password) await api.post(`/admin/users/${u.id}/password`, { password });
  });

  const remove = (u: AdminUser) => run(async () => {
    if (window.confirm(`Opravdu smazat uživatele ${u.email} včetně všech jeho soutěží?`)) {
      await api.delete(`/admin/users/${u.id}`);
    }
  });

  return (
    <>
      {error && <div className="alert">{error}</div>}
      <div className="card">
        <div className="card-strip">
          <h2>Uživatelé</h2>
          <span className="helper">Noví uživatelé z Google čekají na schválení.</span>
        </div>
        <div className="card-body table-scroll">
          {isLoading ? <p className="muted">Načítání…</p> : (
            <table className="table">
              <thead>
                <tr><th>Jméno</th><th>E-mail</th><th>Role</th><th>Stav</th><th>Přihlášení</th><th></th></tr>
              </thead>
              <tbody>
                {data?.users.map((u) => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 600 }}>{u.name}</td>
                    <td>{u.email}</td>
                    <td className="mono">{u.role}</td>
                    <td><span className={`chip${u.status === 'active' ? ' active' : ''}`}>{STATUS_LABEL[u.status]}</span></td>
                    <td className="muted">{u.id.startsWith('google-') ? 'Google' : u.has_password ? 'Heslo' : '—'}</td>
                    <td>
                      {u.id !== me?.id && (
                        <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                          {u.status !== 'active' && <button className="btn btn-small" onClick={setStatus(u, 'active')}>Schválit</button>}
                          {u.status !== 'blocked' && <button className="btn btn-small" onClick={setStatus(u, 'blocked')}>Zablokovat</button>}
                          {!u.id.startsWith('google-') && <button className="btn btn-small" onClick={resetPassword(u)}>Nastavit heslo</button>}
                          <button className="btn btn-small btn-danger" onClick={remove(u)}>Smazat</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-strip">
          <h2>Nový účet s heslem</h2>
          <span className="helper">Pro uživatele bez Google účtu. Heslo předejte osobně.</span>
        </div>
        <form className="card-body" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
          <div className="grid-3">
            <div className="field">
              <label>E-mail</label>
              <input className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="field">
              <label>Jméno</label>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="field">
              <label>Heslo</label>
              <input className="input" type="password" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
          </div>
          <div className="row" style={{ marginTop: 18 }}>
            <button className="btn btn-primary" type="submit" disabled={create.isPending}>Vytvořit účet</button>
          </div>
        </form>
      </div>
    </>
  );
}
