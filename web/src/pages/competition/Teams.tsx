import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, apiErrorText } from '../../lib/api';
import type { TeamWithSummary } from '../../lib/types';
import { bestTeamMatch, fold } from '../../../../shared/text';
import { useCompetition } from './CompetitionLayout';

type TableRow = { teamId: number; teamName: string };
const asArray = <T,>(d: T | T[] | null | undefined): T[] => (Array.isArray(d) ? d : d != null ? [d] : []);

export function Teams() {
  const { data, refresh } = useCompetition();
  const c = data.competition;
  const active = data.teams.filter((t) => t.status === 'active');
  const reserve = data.teams.filter((t) => t.status === 'reserve');
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  // chess.cz names of paired teams (cached by the proxy, 1 h)
  const table = useQuery({
    queryKey: ['chesscz', 'table', c.chesscz_comp_id],
    enabled: !!c.chesscz_comp_id,
    queryFn: () => api.get<{ data: TableRow | TableRow[] }>(`/chesscz/competitions/${c.chesscz_comp_id}/table`),
  });
  const chessczName = new Map(asArray(table.data?.data).map((r) => [r.teamId, r.teamName]));

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try { await fn(); await refresh(); } catch (e) { setError(apiErrorText(e)); }
  };
  const move = (i: number, d: -1 | 1) => run(() => {
    const order = active.map((t) => t.id);
    [order[i], order[i + d]] = [order[i + d], order[i]];
    return api.put(`/competitions/${c.id}/teams/order`, { order });
  });
  const setStatus = (t: TeamWithSummary, status: 'active' | 'reserve') => run(() => api.patch(`/teams/${t.id}`, { status }));
  const add = () => newName.trim() && run(async () => { await api.post(`/competitions/${c.id}/teams`, { name: newName.trim() }); setNewName(''); });

  const captain = (t: TeamWithSummary) => t.contacts.find((x) => x.role === 'kapitan');

  return (
    <>
      {error && <div className="alert">{error}</div>}
      <div className="card">
        <div className="card-strip">
          <h2>Družstva</h2>
          <span className="helper">Pořadí = pořadí v podkladech; losovací čísla se přidělí při losování.</span>
        </div>
        <div className="card-body table-scroll">
          {!active.length ? <p className="muted">Žádná družstva. Naimportujte rozdělení družstev nebo je přidejte ručně.</p> : (
            <table className="table">
              <thead><tr><th>#</th><th>Družstvo</th><th>Soupiska</th><th>Kapitán</th><th>Hrací místnost</th><th>Los. č.</th><th /></tr></thead>
              <tbody>
                {active.map((t, i) => (
                  <tr key={t.id}>
                    <td className="mono muted">{i + 1}.</td>
                    <td>
                      <Link to={`../t/${t.id}`} style={{ fontWeight: 600 }}>{t.name}</Link>
                      {t.chesscz_team_id && chessczName.get(t.chesscz_team_id) && fold(chessczName.get(t.chesscz_team_id)) !== fold(t.name) && (
                        <div className="muted" style={{ fontSize: 12.5 }}>chess.cz: {chessczName.get(t.chesscz_team_id)}</div>
                      )}
                      {t.club_name && <div className="muted" style={{ fontSize: 12.5 }}>{t.club_name}</div>}
                    </td>
                    <td>{t.roster ? <span className="tag ok">{t.roster.players} hráčů · v{t.roster.version}</span> : <span className="tag bad">chybí</span>}</td>
                    <td>{captain(t)?.name ?? <span className="muted">—</span>}</td>
                    <td style={{ maxWidth: 280 }}>{t.venue || <span className="muted">—</span>}</td>
                    <td className="mono">{t.draw_no ?? ''}</td>
                    <td className="actions">
                      <button className="icon-btn" title="Nahoru" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                      <button className="icon-btn" title="Dolů" disabled={i === active.length - 1} onClick={() => move(i, 1)}>↓</button>
                      <button className="btn btn-small" onClick={() => setStatus(t, 'reserve')}>Do zálohy</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <form className="row" style={{ marginTop: 16 }} onSubmit={(e) => { e.preventDefault(); add(); }}>
            <input className="input" style={{ flex: 1, minWidth: 220 }} placeholder="Název nového družstva" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <button className="btn" disabled={!newName.trim()}>+ Přidat družstvo</button>
          </form>
        </div>
      </div>

      {reserve.length > 0 && (
        <div className="card">
          <div className="card-strip"><h2>Záloha</h2><span className="helper">Odebraná družstva — lze je kdykoli vrátit.</span></div>
          <div className="card-body table-scroll">
            <table className="table">
              <tbody>
                {reserve.map((t) => (
                  <tr key={t.id} className="reserve">
                    <td><Link to={`../t/${t.id}`}>{t.name}</Link></td>
                    <td>{t.roster ? `${t.roster.players} hráčů` : ''}</td>
                    <td className="actions"><button className="btn btn-small" onClick={() => setStatus(t, 'active')}>Vrátit do soutěže</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ChessczPairing />
    </>
  );
}

type CompetitionsByRegion = Record<string, { regionCode: string; regionName: string; competitions: { compId: number; compName: string }[] }>;

function ChessczPairing() {
  const { data, refresh } = useCompetition();
  const c = data.competition;
  const active = data.teams.filter((t) => t.status === 'active');
  const [compId, setCompId] = useState(c.chesscz_comp_id ? String(c.chesscz_comp_id) : '');
  const [choices, setChoices] = useState<{ compId: number; compName: string }[] | null>(null);
  const [rows, setRows] = useState<TableRow[] | null>(null);
  const [pairs, setPairs] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const find = async () => {
    setMsg(null); setBusy(true);
    try {
      const year = c.season.slice(0, 4);
      const r = await api.get<{ data: CompetitionsByRegion }>(`/chesscz/competitions/${year}`);
      const region = Object.values(r.data).find((x) => fold(x.regionName) === fold(c.region))
        ?? Object.values(r.data).find((x) => fold(c.region).includes(fold(x.regionCode)));
      const list = region?.competitions ?? [];
      setChoices(list);
      const guess = bestTeamMatch(`${c.name}`, list, (x) => x.compName.replace(/['"]/g, ''), 0.3);
      if (guess) setCompId(String(guess.compId));
      if (!list.length) setMsg('Soutěže svazu na chess.cz nenalezeny — zadejte ID ručně (je v adrese chess.cz/soutez/<ID>/).');
    } catch (e) {
      setMsg(apiErrorText(e));
    } finally { setBusy(false); }
  };

  const loadTable = async () => {
    setMsg(null); setBusy(true);
    try {
      const r = await api.get<{ data: TableRow | TableRow[] }>(`/chesscz/competitions/${compId}/table`);
      const list = asArray(r.data);
      setRows(list);
      setPairs(Object.fromEntries(active.map((t) => {
        const m = t.chesscz_team_id ? list.find((x) => x.teamId === t.chesscz_team_id) : bestTeamMatch(t.name, list, (x) => x.teamName, 0.5);
        return [t.id, m ? String(m.teamId) : ''];
      })));
    } catch (e) {
      setMsg(apiErrorText(e));
    } finally { setBusy(false); }
  };

  const save = async () => {
    setBusy(true);
    try {
      await api.patch(`/competitions/${c.id}`, { chesscz_comp_id: Number(compId) });
      await Promise.all(active.map((t) => api.patch(`/teams/${t.id}`, { chesscz_team_id: pairs[t.id] ? Number(pairs[t.id]) : null })));
      await refresh();
      setMsg('Párování uloženo.');
    } catch (e) {
      setMsg(apiErrorText(e));
    } finally { setBusy(false); }
  };

  return (
    <div className="card">
      <div className="card-strip"><h2>Párování s chess.cz</h2>
        <span className="helper">Po importu soutěže do chess.cz — pravdou o názvech a ELO je pak chess.cz.</span></div>
      <div className="card-body">
        {msg && <div className="note">{msg}</div>}
        <div className="row">
          <div className="field" style={{ width: 160 }}>
            <label>ID soutěže</label>
            <input className="input mono" value={compId} onChange={(e) => setCompId(e.target.value.replace(/\D/g, ''))} />
          </div>
          {choices && choices.length > 0 && (
            <div className="field" style={{ flex: 1, minWidth: 260 }}>
              <label>Soutěže svazu {c.season}</label>
              <select className="input" value={compId} onChange={(e) => setCompId(e.target.value)}>
                <option value="">—</option>
                {choices.map((x) => <option key={x.compId} value={x.compId}>{x.compName} ({x.compId})</option>)}
              </select>
            </div>
          )}
          <div className="row" style={{ alignSelf: 'flex-end' }}>
            <button className="btn" disabled={busy} onClick={find}>Najít na chess.cz</button>
            <button className="btn btn-primary" disabled={busy || !compId} onClick={loadTable}>Načíst družstva</button>
          </div>
        </div>
        {rows && (
          <>
            <table className="table" style={{ marginTop: 16 }}>
              <thead><tr><th>Družstvo v aplikaci</th><th>Družstvo na chess.cz</th></tr></thead>
              <tbody>
                {active.map((t) => (
                  <tr key={t.id}>
                    <td>{t.name}</td>
                    <td>
                      <select className="input input-sm" value={pairs[t.id] ?? ''} onChange={(e) => setPairs({ ...pairs, [t.id]: e.target.value })}>
                        <option value="">— nespárováno —</option>
                        {rows.map((r) => <option key={r.teamId} value={r.teamId}>{r.teamName}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="row" style={{ marginTop: 14 }}><button className="btn btn-primary" disabled={busy} onClick={save}>Uložit párování</button></div>
          </>
        )}
      </div>
    </div>
  );
}
