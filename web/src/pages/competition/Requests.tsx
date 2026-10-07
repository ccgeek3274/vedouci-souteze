import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, apiErrorText } from '../../lib/api';
import { REQUEST_KIND_LABEL, REQUEST_STATUS_LABEL } from '../../lib/format';
import type { Request } from '../../lib/types';
import { normTime, shortTime } from '../../../../shared/startTime';
import { useCompetition } from './CompetitionLayout';

const SIDE_LABEL = { home: 'domácí utkání', away: 'utkání venku' } as const;

// Draw-meeting requests (start times, draw numbers, date changes …) — the basis of the meeting report (M7).
// An accepted start-time request becomes the team's start exception (as in uvodni-zpravodaj).
export function Requests() {
  const { data, refresh } = useCompetition();
  const c = data.competition;
  const active = data.teams.filter((t) => t.status === 'active');
  const teamName = new Map(data.teams.map((t) => [t.id, t.name]));
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ team_id: '', kind: 'start_time', text: '', time: '10:00', side: 'home' });

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try { await fn(); await refresh(); } catch (e) { setError(apiErrorText(e)); }
  };
  const patch = (r: Request, body: Partial<Request>) => run(() => api.patch(`/requests/${r.id}`, body));

  const byKind = Object.keys(REQUEST_KIND_LABEL).map((k) => [k, data.requests.filter((r) => r.kind === k)] as const).filter(([, l]) => l.length);
  const exceptions = active.flatMap((t) => [
    ...(t.start_home ? [`${t.name} — domácí utkání v ${shortTime(t.start_home)} hodin`] : []),
    ...(t.start_away ? [`${t.name} — utkání venku v ${shortTime(t.start_away)} hodin`] : []),
  ]);

  return (
    <>
      {error && <div className="alert">{error}</div>}
      <div className="card">
        <div className="card-strip"><h2>Jiné začátky utkání</h2>
          <span className="helper">Výchozí začátek {shortTime(c.default_start)} · v posledním kole se výjimky neuplatní.</span></div>
        <div className="card-body">
          {exceptions.length
            ? <ul className="list-plain" style={{ marginTop: 0 }}>{exceptions.map((x) => <li key={x}>{x}</li>)}</ul>
            : <p className="muted" style={{ margin: 0 }}>Žádné výjimky. Vznikají schválením požadavku na začátek utkání (nebo v detailu družstva).</p>}
        </div>
      </div>

      <div className="card">
        <div className="card-strip"><h2>Požadavky pro losovací schůzi</h2>
          <span className="helper">Z e-soupisek se přenesou automaticky; požadavky z e-mailů doplňte ručně.</span></div>
        <div className="card-body table-scroll">
          {!data.requests.length && <p className="muted">Zatím žádné požadavky.</p>}
          {byKind.map(([kind, list]) => (
            <div key={kind}>
              <div className="section-title">{REQUEST_KIND_LABEL[kind]}</div>
              <table className="table" style={{ tableLayout: 'fixed', minWidth: 980 }}>
                <tbody>
                  {list.map((r) => (
                    <tr key={r.id}>
                      <td style={{ width: 230 }}>{r.team_id ? <Link to={`../t/${r.team_id}`}>{teamName.get(r.team_id)}</Link> : <span className="muted">soutěž</span>}</td>
                      <td>
                        {r.kind === 'start_time' ? (
                          <div className="row" style={{ gap: 6 }}>
                            <select className="input input-sm" value={r.side ?? 'home'} onChange={(e) => patch(r, { side: e.target.value as Request['side'] })}>
                              <option value="home">doma</option>
                              <option value="away">venku</option>
                            </select>
                            <input type="time" className="input input-sm mono" style={{ width: 110 }} defaultValue={r.time ?? ''} key={r.time ?? ''}
                              onBlur={(e) => normTime(e.target.value) !== (r.time ?? '') && patch(r, { time: e.target.value || null })} />
                            {!r.time && <span className="tag warn">doplňte čas</span>}
                          </div>
                        ) : null}
                        <div className={r.kind === 'start_time' ? 'muted' : undefined} style={{ fontSize: r.kind === 'start_time' ? 12.5 : undefined, marginTop: r.kind === 'start_time' ? 4 : 0 }}>
                          {r.kind === 'start_time' && 'Původní text: '}„{r.text}“
                          {r.source === 'roster' && <span className="tag" style={{ marginLeft: 8 }}>ze soupisky</span>}
                        </div>
                      </td>
                      <td style={{ width: 170 }}>
                        <select className="input input-sm" value={r.kind} onChange={(e) => patch(r, { kind: e.target.value })}>
                          {Object.entries(REQUEST_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      </td>
                      <td style={{ width: 130 }}>
                        <select className="input input-sm" value={r.status} onChange={(e) => patch(r, { status: e.target.value as Request['status'] })}>
                          {Object.entries(REQUEST_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      </td>
                      <td style={{ width: 190 }}>
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
          run(async () => {
            await api.post(`/competitions/${c.id}/requests`, { ...form, team_id: form.team_id || undefined });
            setForm({ ...form, text: '' });
          });
        }}>
          <div className="grid-4">
            <div className="field"><label>Družstvo</label>
              <select className="input" value={form.team_id} onChange={(e) => setForm({ ...form, team_id: e.target.value })}>
                <option value="">{form.kind === 'start_time' ? '— vyberte družstvo —' : '— celá soutěž —'}</option>
                {active.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select></div>
            <div className="field"><label>Typ</label>
              <select className="input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                {Object.entries(REQUEST_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></div>
            {form.kind === 'start_time' ? (
              <>
                <div className="field"><label>Utkání</label>
                  <select className="input" value={form.side} onChange={(e) => setForm({ ...form, side: e.target.value })}>
                    <option value="home">{SIDE_LABEL.home}</option>
                    <option value="away">{SIDE_LABEL.away}</option>
                  </select></div>
                <div className="field"><label>Začátek</label>
                  <input type="time" className="input mono" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /></div>
              </>
            ) : (
              <div className="field" style={{ gridColumn: 'span 2' }}><label>Text</label>
                <input className="input" value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} placeholder="např. vzájemný zápas s B v 1. kole" /></div>
            )}
          </div>
          {form.kind === 'start_time' && (
            <div className="field" style={{ marginTop: 18 }}><label>Poznámka (nepovinné)</label>
              <input className="input" value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })}
                placeholder={`${SIDE_LABEL[form.side as 'home' | 'away']} v ${shortTime(form.time) || '…'}`} /></div>
          )}
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn btn-primary" disabled={form.kind === 'start_time' ? !form.team_id || !normTime(form.time) : !form.text.trim()}>Přidat požadavek</button>
          </div>
        </form>
      </div>
    </>
  );
}
