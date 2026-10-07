import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorText } from '../lib/api';
import { czDateTime } from '../lib/format';

type Token = { id: string; name: string; created_at: number; last_used_at: number | null };

// Personal API tokens for Claude Code skills (import-rozpis, import-soupiska) and scripts.
export function Tokens() {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ['tokens'], queryFn: () => api.get<{ tokens: Token[] }>('/tokens') });
  const [name, setName] = useState('Claude Code');
  const [created, setCreated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try { await fn(); await queryClient.invalidateQueries({ queryKey: ['tokens'] }); } catch (e) { setError(apiErrorText(e)); }
  };

  return (
    <div className="card">
      <div className="card-strip"><h2>API tokeny</h2>
        <span className="helper">Pro Claude Code skills a skripty: hlavička <span className="mono">Authorization: Bearer vs_…</span></span></div>
      <div className="card-body">
        {error && <div className="alert">{error}</div>}
        {created && (
          <div className="note">
            Nový token (zobrazí se jen teď — uložte si ho, např. do <span className="mono">~/.config/vedouci-souteze/token</span>):
            <div className="mono" style={{ marginTop: 6, fontWeight: 700, wordBreak: 'break-all' }}>{created}</div>
          </div>
        )}
        {!!data?.tokens.length && (
          <table className="table" style={{ marginBottom: 16 }}>
            <thead><tr><th>Název</th><th>Vytvořen</th><th>Naposledy použit</th><th /></tr></thead>
            <tbody>
              {data.tokens.map((t) => (
                <tr key={t.id}>
                  <td style={{ fontWeight: 600 }}>{t.name}</td>
                  <td>{czDateTime(t.created_at)}</td>
                  <td>{t.last_used_at ? czDateTime(t.last_used_at) : <span className="muted">nikdy</span>}</td>
                  <td className="actions"><button className="btn btn-small btn-danger" onClick={() => window.confirm('Zneplatnit token?') && run(() => api.delete(`/tokens/${t.id}`))}>Zneplatnit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <form className="row" onSubmit={(e) => { e.preventDefault(); run(async () => setCreated((await api.post<{ token: string }>('/tokens', { name })).token)); }}>
          <input className="input" style={{ flex: 1, minWidth: 220 }} value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn btn-primary">Vytvořit token</button>
        </form>
      </div>
    </div>
  );
}
