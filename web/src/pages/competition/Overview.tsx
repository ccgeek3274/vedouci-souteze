import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, apiErrorText } from '../../lib/api';
import { czDate, LEVEL_LABEL, PHASE_LABEL, roundCount } from '../../lib/format';
import type { Competition, Round } from '../../lib/types';
import { useCompetition } from './CompetitionLayout';

const FIELDS: { key: keyof Competition; label: string; mono?: boolean; wide?: boolean }[] = [
  { key: 'name', label: 'Název' },
  { key: 'short', label: 'Zkratka', mono: true },
  { key: 'season', label: 'Sezóna', mono: true },
  { key: 'group_code', label: 'Skupina' },
  { key: 'region', label: 'Svaz', wide: true },
  { key: 'boards', label: 'Počet šachovnic', mono: true },
  { key: 'default_start', label: 'Výchozí začátek', mono: true },
  { key: 'mutual_deadline', label: 'Vzájemné zápasy oddílu do', mono: true },
  { key: 'chesscz_comp_id', label: 'ID soutěže na chess.cz', mono: true },
  { key: 'time_control', label: 'Tempo hry', wide: true },
  { key: 'manager_name', label: 'Vedoucí soutěže' },
  { key: 'manager_email', label: 'E-mail vedoucího' },
  { key: 'manager_phone', label: 'Telefon vedoucího' },
];

export function Overview() {
  const { data, refresh } = useCompetition();
  const navigate = useNavigate();
  const c = data.competition;
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm(Object.fromEntries([...FIELDS.map((f) => [f.key, String(c[f.key] ?? '')]), ['level', c.level], ['phase', c.phase], ['notes', c.notes]]));
  }, [c]);

  const save = async () => {
    setError(null);
    try {
      await api.patch(`/competitions/${c.id}`, form);
      await refresh();
      setEdit(false);
    } catch (e) {
      setError(apiErrorText(e));
    }
  };

  const remove = async () => {
    if (!window.confirm(`Opravdu smazat soutěž ${c.name} včetně družstev, soupisek a požadavků?`)) return;
    await api.delete(`/competitions/${c.id}`);
    navigate('/');
  };

  const teams = data.teams.filter((t) => t.status === 'active').length;
  return (
    <>
      <div className="card">
        <div className="card-strip">
          <h2>Údaje soutěže</h2><span className="spacer" />
          {edit ? (
            <>
              <button className="btn btn-small" onClick={() => setEdit(false)}>Zrušit</button>
              <button className="btn btn-small btn-primary" onClick={save}>Uložit</button>
            </>
          ) : <button className="btn btn-small" onClick={() => setEdit(true)}>Upravit</button>}
        </div>
        <div className="card-body">
          {error && <div className="alert">{error}</div>}
          {edit ? (
            <>
              <div className="grid-4">
                {FIELDS.map((f) => (
                  <div className="field" key={f.key} style={f.wide ? { gridColumn: 'span 2' } : undefined}>
                    <label>{f.label}</label>
                    <input className={`input${f.mono ? ' mono' : ''}`} value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                  </div>
                ))}
                <div className="field"><label>Úroveň</label>
                  <select className="input" value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })}>
                    {Object.entries(LEVEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select></div>
                <div className="field"><label>Fáze</label>
                  <select className="input" value={form.phase} onChange={(e) => setForm({ ...form, phase: e.target.value })}>
                    {Object.entries(PHASE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select></div>
              </div>
              <div className="field" style={{ marginTop: 18 }}><label>Poznámky</label>
                <textarea className="input" value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              <div className="row" style={{ marginTop: 18 }}><button className="btn btn-danger btn-small" onClick={remove}>Smazat soutěž</button></div>
            </>
          ) : (
            <dl className="dl">
              {FIELDS.map((f) => (
                <FragmentRow key={f.key} label={f.label} value={f.key === 'mutual_deadline' ? czDate(c.mutual_deadline) : String(c[f.key] ?? '')} mono={f.mono} />
              ))}
              {c.notes && <FragmentRow label="Poznámky" value={c.notes} />}
            </dl>
          )}
        </div>
      </div>
      <Rounds rounds={data.rounds} competitionId={c.id} teams={teams} onSaved={refresh} />
    </>
  );
}

function FragmentRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <dt>{label}</dt>
      <dd className={mono ? 'mono' : undefined} style={{ whiteSpace: 'pre-line' }}>{value || <span className="muted">—</span>}</dd>
    </>
  );
}

function Rounds({ rounds, competitionId, teams, onSaved }: { rounds: Round[]; competitionId: string; teams: number; onSaved: () => Promise<void> }) {
  const [edit, setEdit] = useState(false);
  const [rows, setRows] = useState<Round[]>(rounds);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setRows(rounds), [rounds]);
  const needed = roundCount(teams);

  const save = async () => {
    setError(null);
    try {
      await api.put(`/competitions/${competitionId}/rounds`, { rounds: rows.filter((r) => r.date).map((r, i) => ({ ...r, round: i + 1 })) });
      await onSaved();
      setEdit(false);
    } catch (e) {
      setError(apiErrorText(e));
    }
  };

  return (
    <div className="card">
      <div className="card-strip">
        <h2>Termíny kol</h2>
        <span className="helper">
          {teams ? `${teams} družstev → ${needed} kol${teams % 2 ? ' (lichý počet, každé kolo jedno družstvo volno)' : ''}` : 'Zatím bez družstev'}
        </span>
        <span className="spacer" />
        {edit ? (
          <>
            <button className="btn btn-small" onClick={() => { setRows(rounds); setEdit(false); }}>Zrušit</button>
            <button className="btn btn-small btn-primary" onClick={save}>Uložit</button>
          </>
        ) : <button className="btn btn-small" onClick={() => setEdit(true)}>Upravit</button>}
      </div>
      <div className="card-body table-scroll">
        {error && <div className="alert">{error}</div>}
        {!rows.length && !edit && <p className="muted">Termíny zatím nejsou zadané — naimportujte rozpis nebo je doplňte ručně.</p>}
        {(rows.length > 0 || edit) && (
          <table className="table">
            <thead><tr><th>Kolo</th><th>Datum</th><th>Poznámka</th>{edit && <th />}</tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={!edit && needed && r.round > needed ? 'reserve' : undefined}>
                  <td className="mono">{i + 1}.</td>
                  <td>{edit
                    ? <input type="date" className="input input-sm" value={r.date} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))} />
                    : czDate(r.date, true)}</td>
                  <td>{edit
                    ? <input className="input input-sm" style={{ width: '100%' }} value={r.note} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))} />
                    : r.note || (needed && r.round > needed ? <span className="muted">nevyužito (méně družstev)</span> : '')}</td>
                  {edit && <td className="actions"><button className="icon-btn" title="Odebrat" onClick={() => setRows(rows.filter((_, j) => j !== i))}>✕</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {edit && <button className="btn btn-small" style={{ marginTop: 12 }} onClick={() => setRows([...rows, { round: rows.length + 1, date: '', note: '' }])}>+ Přidat kolo</button>}
      </div>
    </div>
  );
}
