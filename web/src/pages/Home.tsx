import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, apiErrorText } from '../lib/api';
import { LEVEL_LABEL, PHASE_LABEL } from '../lib/format';
import type { CompetitionListItem } from '../lib/types';

const DEFAULTS: Record<string, { boards: number; start: string }> = {
  KP: { boards: 8, start: '10:00' }, KS: { boards: 8, start: '10:00' }, RP: { boards: 8, start: '09:00' }, RS: { boards: 5, start: '09:00' }, other: { boards: 8, start: '10:00' },
};

function currentSeason(): string {
  const d = new Date();
  const y = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}/${y + 1}`;
}

export function Home() {
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ season: currentSeason(), level: 'RP', group_code: '', name: '', short: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['competitions'],
    queryFn: () => api.get<{ competitions: CompetitionListItem[] }>('/competitions'),
  });

  const create = useMutation({
    mutationFn: () => {
      const d = DEFAULTS[form.level];
      return api.post<{ id: string }>('/competitions', {
        ...form,
        short: form.short || `${form.level === 'other' ? '' : form.level}${form.group_code}`,
        name: form.name || `${LEVEL_LABEL[form.level]}${form.group_code ? ` ${form.group_code}` : ''}`,
        boards: d.boards,
        default_start: d.start,
      });
    },
    onSuccess: (r) => navigate(`/c/${r.id}`),
    onError: (e) => setError(apiErrorText(e)),
  });

  const list = data?.competitions ?? [];
  return (
    <>
      <div className="card">
        <div className="card-strip">
          <h2>Moje soutěže</h2>
          <span className="spacer" />
          <Link className="btn btn-small" to="/import">Import z rozpisu (JSON)</Link>
          <button className="btn btn-small btn-primary" onClick={() => setShowForm((v) => !v)}>+ Nová soutěž</button>
        </div>
        <div className="card-body table-scroll">
          {isLoading ? <p className="muted">Načítání…</p> : !list.length ? (
            <p className="muted">Zatím nemáte žádnou soutěž. Založte ji ručně, nebo naimportujte rozpis soutěží.</p>
          ) : (
            <table className="table">
              <thead><tr><th>Sezóna</th><th>Soutěž</th><th>Úroveň</th><th className="num">Družstva</th><th className="num">Soupisky</th><th>chess.cz</th><th>Fáze</th></tr></thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/c/${c.id}`)}>
                    <td className="mono">{c.season}</td>
                    <td><Link to={`/c/${c.id}`} style={{ fontWeight: 600 }}>{c.name}</Link> <span className="muted mono">{c.short}</span></td>
                    <td className="muted">{LEVEL_LABEL[c.level] ?? c.level}</td>
                    <td className="num">{c.team_count}</td>
                    <td className="num">{c.roster_count}/{c.team_count}</td>
                    <td>{c.chesscz_comp_id ? <span className="tag ok">spárováno</span> : <span className="tag">ne</span>}</td>
                    <td><span className="tag">{PHASE_LABEL[c.phase] ?? c.phase}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showForm && (
        <div className="card">
          <div className="card-strip"><h2>Nová soutěž</h2><span className="helper">Další údaje doplníte v detailu soutěže.</span></div>
          <form className="card-body" onSubmit={(e) => { e.preventDefault(); setError(null); create.mutate(); }}>
            {error && <div className="alert">{error}</div>}
            <div className="grid-4">
              <div className="field"><label>Sezóna</label>
                <input className="input mono" value={form.season} onChange={(e) => setForm({ ...form, season: e.target.value })} /></div>
              <div className="field"><label>Úroveň</label>
                <select className="input" value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })}>
                  {Object.entries(LEVEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select></div>
              <div className="field"><label>Skupina</label>
                <input className="input" placeholder="A, B, …" value={form.group_code} onChange={(e) => setForm({ ...form, group_code: e.target.value.toUpperCase() })} /></div>
              <div className="field"><label>Zkratka</label>
                <input className="input mono" placeholder={`${form.level}${form.group_code}`} value={form.short} onChange={(e) => setForm({ ...form, short: e.target.value.toUpperCase() })} /></div>
            </div>
            <div className="field" style={{ marginTop: 18 }}><label>Název</label>
              <input className="input" placeholder={`${LEVEL_LABEL[form.level]}${form.group_code ? ` ${form.group_code}` : ''}`} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="row" style={{ marginTop: 18 }}>
              <button className="btn btn-primary" disabled={create.isPending}>Založit soutěž</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
