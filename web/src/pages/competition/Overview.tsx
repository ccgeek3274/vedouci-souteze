import { useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { api, apiErrorText } from '../../lib/api';
import { czDate, czDateTime, LEVEL_LABEL, PHASE_LABEL, roundCount } from '../../lib/format';
import type { BulletinSummary, Competition, Round } from '../../lib/types';
import { chessczGet } from '../../lib/rosterCheck';
import { chessczUrl } from '../../../../shared/bulletin/initial';
import { useCompetition } from './CompetitionLayout';

/** State of a bulletin for Přehled: last save point (what was sent out), else whether a draft exists. */
function BulletinState({ b, initial = false }: { b: BulletinSummary | undefined; initial?: boolean }) {
  if (!b) return <span className="muted">nezahájen</span>;
  const kind = initial && b.kind ? (b.kind === 'definitive' ? 'definitivní' : 'předběžný') : null;
  return (
    <span className="bstate">
      {kind && <span className="tag">{kind}</span>}
      {b.savepoints
        ? <span className="tag ok" title={`Save pointů: ${b.savepoints}`}>save point{b.last_label ? ` „${b.last_label}“` : ''} · {czDateTime(b.last_at!)}</span>
        : <span className="tag warn">bez save pointu</span>}
      {b.updated_at != null && <span className="muted">koncept {czDateTime(b.updated_at)}</span>}
    </span>
  );
}

const ExtLink = ({ url }: { url: string }) => <a href={url} target="_blank" rel="noreferrer">{url}</a>;

const FIELDS: { key: keyof Competition; label: string; mono?: boolean; wide?: boolean }[] = [
  { key: 'name', label: 'Název' },
  { key: 'short', label: 'Zkratka', mono: true },
  { key: 'season', label: 'Sezóna', mono: true },
  { key: 'group_code', label: 'Skupina' },
  { key: 'region', label: 'Svaz', wide: true },
  { key: 'boards', label: 'Počet šachovnic', mono: true },
  { key: 'default_start', label: 'Výchozí začátek', mono: true },
  { key: 'last_start', label: 'Začátek posledního kola', mono: true },
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
  const bulletins = useQuery({ queryKey: ['bulletins', c.id], queryFn: () => api.get<{ bulletins: BulletinSummary[] }>(`/competitions/${c.id}/bulletins`) });
  const byKey = new Map((bulletins.data?.bulletins ?? []).map((b) => [b.key, b]));
  // chess-results link of the competition: from chess.cz details (proxy cache), as in the bulletins
  const details = useQuery({
    queryKey: ['chesscz-details', c.chesscz_comp_id],
    queryFn: () => chessczGet(`/competitions/${c.chesscz_comp_id}/details`) as Promise<{ compWww?: string } | null>,
    enabled: !!c.chesscz_comp_id,
    staleTime: 60 * 60_000,
  });
  const publicUrl = `${location.origin}/rozpis/${c.id}`;
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
                    <input className={`input${f.mono ? ' mono' : ''}`} placeholder={f.key === 'last_start' ? `prázdné = výchozí (${form.default_start || c.default_start})` : undefined} value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
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
                <FragmentRow key={f.key} label={f.label} value={f.key === 'mutual_deadline' ? czDate(c.mutual_deadline) : f.key === 'last_start' && !c.last_start ? `výchozí (${c.default_start})` : String(c[f.key] ?? '')} mono={f.mono} />
              ))}
              {c.notes && <FragmentRow label="Poznámky" value={c.notes} />}
              {/* links of the competition as in the bulletins + the published schedule + state of the úvodní zpravodaj */}
              <FragmentRow label="Soutěž na chess.cz" value={c.chesscz_comp_id ? <ExtLink url={chessczUrl(c.chesscz_comp_id)} /> : ''} />
              <FragmentRow label="Chess-results" value={details.data?.compWww ? <ExtLink url={details.data.compWww} />
                : details.isLoading && c.chesscz_comp_id ? <span className="muted">načítám…</span> : ''} />
              <FragmentRow label="Zveřejněné rozlosování" value={c.published ? <ExtLink url={publicUrl} />
                : <span className="muted">nezveřejněno — zapíná se na kartě <Link to="rozhodci">Nominace rozhodčích</Link></span>} />
              <FragmentRow label="Úvodní zpravodaj" value={<><Link to="zpravodaj/uvodni">otevřít</Link> <BulletinState b={byKey.get('initial')} initial /></>} />
            </dl>
          )}
        </div>
      </div>
      <Rounds rounds={data.rounds} competitionId={c.id} teams={teams} onSaved={refresh} bulletins={byKey} />
    </>
  );
}

function FragmentRow({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <>
      <dt>{label}</dt>
      <dd className={mono ? 'mono' : undefined} style={{ whiteSpace: 'pre-line' }}>{value || <span className="muted">—</span>}</dd>
    </>
  );
}

function Rounds({ rounds, competitionId, teams, onSaved, bulletins }: {
  rounds: Round[]; competitionId: string; teams: number; onSaved: () => Promise<void>; bulletins: Map<string, BulletinSummary>;
}) {
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
            <thead><tr><th>Kolo</th><th>Datum</th><th>Poznámka</th>{edit ? <th /> : <th>Zpravodaj z kola</th>}</tr></thead>
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
                  {edit
                    ? <td className="actions"><button className="icon-btn" title="Odebrat" onClick={() => setRows(rows.filter((_, j) => j !== i))}>✕</button></td>
                    : <td>{(!needed || r.round <= needed) && <><Link to={`zpravodaj/kolo-${i + 1}`}>{i + 1}. kolo</Link> <BulletinState b={bulletins.get(`round-${i + 1}`)} /></>}</td>}
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
