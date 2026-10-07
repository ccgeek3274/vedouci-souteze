import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, apiErrorText } from '../../lib/api';
import { REQUEST_KIND_LABEL, REQUEST_STATUS_LABEL } from '../../lib/format';
import type { Request } from '../../lib/types';
import { useCompetition } from './CompetitionLayout';

// Draw-meeting requests (start times, draw numbers, date changes …) — the basis of the meeting report (M7).
export function Requests() {
  const { data, refresh } = useCompetition();
  const c = data.competition;
  const teamName = new Map(data.teams.map((t) => [t.id, t.name]));
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ team_id: '', kind: 'start_time', text: '' });

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try { await fn(); await refresh(); } catch (e) { setError(apiErrorText(e)); }
  };
  const patch = (r: Request, body: Partial<Request>) => run(() => api.patch(`/requests/${r.id}`, body));

  const byKind = Object.keys(REQUEST_KIND_LABEL).map((k) => [k, data.requests.filter((r) => r.kind === k)] as const).filter(([, l]) => l.length);

  return (
    <>
      {error && <div className="alert">{error}</div>}
      <div className="card">
        <div className="card-strip"><h2>Požadavky pro losovací schůzi</h2>
          <span className="helper">Z e-soupisek se přenesou automaticky; požadavky z e-mailů doplňte ručně.</span></div>
        <div className="card-body table-scroll">
          {!data.requests.length && <p className="muted">Zatím žádné požadavky.</p>}
          {byKind.map(([kind, list]) => (
            <div key={kind}>
              <div className="section-title">{REQUEST_KIND_LABEL[kind]}</div>
              <table className="table" style={{ tableLayout: 'fixed', minWidth: 900 }}>
                <tbody>
                  {list.map((r) => (
                    <tr key={r.id}>
                      <td style={{ width: 240 }}>{r.team_id ? <Link to={`../t/${r.team_id}`}>{teamName.get(r.team_id)}</Link> : <span className="muted">soutěž</span>}</td>
                      <td>{r.text}{r.source === 'roster' && <span className="tag" style={{ marginLeft: 8 }}>ze soupisky</span>}</td>
                      <td style={{ width: 180 }}>
                        <select className="input input-sm" value={r.kind} onChange={(e) => patch(r, { kind: e.target.value })}>
                          {Object.entries(REQUEST_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      </td>
                      <td style={{ width: 140 }}>
                        <select className="input input-sm" value={r.status} onChange={(e) => patch(r, { status: e.target.value as Request['status'] })}>
                          {Object.entries(REQUEST_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      </td>
                      <td style={{ width: 200 }}>
                        <input className="input input-sm" style={{ width: '100%' }} placeholder="Rozhodnutí / poznámka" defaultValue={r.decision}
                          onBlur={(e) => e.target.value !== r.decision && patch(r, { decision: e.target.value })} />
                      </td>
                      <td className="actions" style={{ width: 40 }}><button className="icon-btn" title="Smazat" onClick={() => window.confirm('Smazat požadavek?') && run(() => api.delete(`/requests/${r.id}`))}>✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-strip"><h2>Nový požadavek</h2></div>
        <form className="card-body" onSubmit={(e) => {
          e.preventDefault();
          run(async () => { await api.post(`/competitions/${c.id}/requests`, { ...form, team_id: form.team_id || undefined }); setForm({ ...form, text: '' }); });
        }}>
          <div className="grid-4">
            <div className="field"><label>Družstvo</label>
              <select className="input" value={form.team_id} onChange={(e) => setForm({ ...form, team_id: e.target.value })}>
                <option value="">— celá soutěž —</option>
                {data.teams.filter((t) => t.status === 'active').map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select></div>
            <div className="field"><label>Typ</label>
              <select className="input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                {Object.entries(REQUEST_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></div>
            <div className="field" style={{ gridColumn: 'span 2' }}><label>Text</label>
              <input className="input" value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} placeholder="např. domácí utkání v 10:00" /></div>
          </div>
          <div className="row" style={{ marginTop: 16 }}><button className="btn btn-primary" disabled={!form.text.trim()}>Přidat požadavek</button></div>
        </form>
      </div>
    </>
  );
}
