import { Fragment, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorText } from '../../lib/api';
import { czDateTime, ROLE_LABEL } from '../../lib/format';
import type { Contact, RosterPlayer, RosterVersion, Team } from '../../lib/types';
import { useCompetition } from './CompetitionLayout';

type TeamResponse = {
  team: Team & { boards: number };
  contacts: Contact[];
  versions: RosterVersion[];
  roster: (RosterVersion & { players: RosterPlayer[] }) | null;
};

const TEXT_FIELDS: { key: keyof Team; label: string; wide?: boolean }[] = [
  { key: 'name', label: 'Název družstva' },
  { key: 'club_name', label: 'Oddíl' },
  { key: 'venue', label: 'Hrací místnost', wide: true },
  { key: 'shoes', label: 'Přezůvky' },
  { key: 'start_pref', label: 'Preference začátku domácích utkání' },
  { key: 'draw_requests', label: 'Požadavky na losování', wide: true },
  { key: 'notes', label: 'Poznámky', wide: true },
];
const ROLES: Contact['role'][] = ['kapitan', 'zastupce', 'komunikace', 'rozhodci'];

export function TeamDetail() {
  const { teamId = '' } = useParams();
  const { refresh: refreshCompetition } = useCompetition();
  const queryClient = useQueryClient();
  const [version, setVersion] = useState<number | null>(null);
  const key = ['team', teamId, version];
  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => api.get<TeamResponse>(`/teams/${teamId}${version ? `?version=${version}` : ''}`),
  });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['team', teamId] });
    await refreshCompetition();
  };

  if (isLoading || !data) return <p style={{ color: 'var(--cream)' }}>Načítání…</p>;
  const t = data.team;
  return (
    <>
      <div className="crumbs"><Link to="../druzstva">← Družstva</Link></div>
      <TeamFields team={t} onSaved={refresh} />
      <Contacts teamId={t.id} contacts={data.contacts} onSaved={refresh} />
      <div className="card">
        <div className="card-strip">
          <h2>Soupiska</h2>
          {data.roster && <span className="helper">{data.roster.players.length} hráčů · {data.roster.players.filter((p) => p.base).length} v základní sestavě</span>}
          <span className="spacer" />
          {data.versions.length > 0 && (
            <select className="input input-sm" value={data.roster?.version ?? ''} onChange={(e) => setVersion(Number(e.target.value))}>
              {data.versions.map((v) => (
                <option key={v.id} value={v.version}>verze {v.version} · {czDateTime(v.created_at)} · {v.source}</option>
              ))}
            </select>
          )}
        </div>
        <div className="card-body table-scroll">
          {!data.roster ? (
            <p className="muted">Soupiska zatím nebyla importována. <Link to="../soupisky">Importovat soupisku</Link></p>
          ) : (
            <>
              {data.roster.filename && <p className="helper-text" style={{ marginTop: 0 }}>Zdroj: {data.roster.filename}</p>}
              <table className="table">
                <thead><tr><th>#</th><th>Příjmení jméno</th><th className="num">Rok</th><th className="num">LOK</th><th className="num">FIDE</th><th>Označení</th><th>Z</th><th>Povolení host.</th></tr></thead>
                <tbody>
                  {data.roster.players.map((p) => (
                    <tr key={p.id} className={p.struck ? 'struck' : undefined}>
                      <td className="mono muted">{p.position}.</td>
                      <td style={{ fontWeight: 600 }}>{p.name}</td>
                      <td className="num">{p.birth_year ?? ''}</td>
                      <td className="num">{p.lok ?? <span className="tag bad">chybí</span>}</td>
                      <td className="num">{p.fide ?? ''}</td>
                      <td>{p.flags.split(' ').filter(Boolean).map((f) => <span key={f} className="chip active" style={{ marginRight: 4 }}>{f}</span>)}</td>
                      <td>{p.base ? <span className="chip active">Z</span> : null}</td>
                      <td>{/\bH\b/.test(p.flags) && (
                        <label className="row" style={{ gap: 6 }}>
                          <input type="checkbox" checked={!!p.guest_permit}
                            onChange={async (e) => { await api.patch(`/roster-players/${p.id}`, { guest_permit: e.target.checked ? 1 : 0 }); refresh(); }} />
                          <span className="muted">doloženo</span>
                        </label>
                      )}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function TeamFields({ team, onSaved }: { team: Team; onSaved: () => Promise<void> }) {
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setForm(Object.fromEntries([...TEXT_FIELDS.map((f) => [f.key, String(team[f.key] ?? '')]), ['draw_no', String(team.draw_no ?? '')]])), [team]);

  const save = async () => {
    setError(null);
    try {
      await api.patch(`/teams/${team.id}`, form);
      await onSaved();
      setEdit(false);
    } catch (e) {
      setError(apiErrorText(e));
    }
  };

  return (
    <div className="card">
      <div className="card-strip">
        <h2 style={{ textTransform: 'none' }}>{team.name}</h2>
        {team.status === 'reserve' && <span className="tag warn">záloha</span>}
        {team.chesscz_team_id && <span className="tag ok">chess.cz #{team.chesscz_team_id}</span>}
        <span className="spacer" />
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
          <div className="grid-2">
            {TEXT_FIELDS.map((f) => (
              <div className="field" key={f.key} style={f.wide ? { gridColumn: 'span 2' } : undefined}>
                <label>{f.label}</label>
                <input className="input" value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
              </div>
            ))}
            <div className="field"><label>Losovací číslo</label>
              <input className="input mono" value={form.draw_no ?? ''} onChange={(e) => setForm({ ...form, draw_no: e.target.value.replace(/\D/g, '') })} /></div>
          </div>
        ) : (
          <dl className="dl">
            {TEXT_FIELDS.slice(1).map((f) => (
              <Fragment key={f.key}><dt>{f.label}</dt><dd>{String(team[f.key] ?? '') || <span className="muted">—</span>}</dd></Fragment>
            ))}
            <dt>Losovací číslo</dt><dd className="mono">{team.draw_no ?? <span className="muted">—</span>}</dd>
          </dl>
        )}
      </div>
    </div>
  );
}

function Contacts({ teamId, contacts, onSaved }: { teamId: string; contacts: Contact[]; onSaved: () => Promise<void> }) {
  const [edit, setEdit] = useState(false);
  const [rows, setRows] = useState<Contact[]>(contacts);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setRows(contacts), [contacts]);

  const save = async () => {
    setError(null);
    try {
      await api.put(`/teams/${teamId}/contacts`, { contacts: rows });
      await onSaved();
      setEdit(false);
    } catch (e) {
      setError(apiErrorText(e));
    }
  };
  const set = (i: number, patch: Partial<Contact>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div className="card">
      <div className="card-strip">
        <h2>Kontakty</h2><span className="spacer" />
        {edit ? (
          <>
            <button className="btn btn-small" onClick={() => { setRows(contacts); setEdit(false); }}>Zrušit</button>
            <button className="btn btn-small btn-primary" onClick={save}>Uložit</button>
          </>
        ) : <button className="btn btn-small" onClick={() => setEdit(true)}>Upravit</button>}
      </div>
      <div className="card-body table-scroll">
        {error && <div className="alert">{error}</div>}
        {!rows.length && !edit ? <p className="muted">Žádné kontakty.</p> : (
          <table className="table">
            <thead><tr><th>Role</th><th>Jméno</th><th>Telefon</th><th>E-mail</th>{edit && <th />}</tr></thead>
            <tbody>
              {rows.map((r, i) => edit ? (
                <tr key={i}>
                  <td><select className="input input-sm" value={r.role} onChange={(e) => set(i, { role: e.target.value as Contact['role'] })}>
                    {ROLES.map((x) => <option key={x} value={x}>{ROLE_LABEL[x]}</option>)}</select></td>
                  <td><input className="input input-sm" value={r.name} onChange={(e) => set(i, { name: e.target.value })} /></td>
                  <td><input className="input input-sm" value={r.phone} onChange={(e) => set(i, { phone: e.target.value })} /></td>
                  <td><input className="input input-sm" value={r.email} onChange={(e) => set(i, { email: e.target.value })} /></td>
                  <td className="actions"><button className="icon-btn" onClick={() => setRows(rows.filter((_, j) => j !== i))}>✕</button></td>
                </tr>
              ) : (
                <tr key={i}>
                  <td className="muted">{ROLE_LABEL[r.role]}</td><td style={{ fontWeight: 600 }}>{r.name}</td>
                  <td className="mono">{r.phone}</td><td>{r.email && <a href={`mailto:${r.email}`}>{r.email}</a>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {edit && <button className="btn btn-small" style={{ marginTop: 12 }} onClick={() => setRows([...rows, { role: 'komunikace', name: '', phone: '', email: '' }])}>+ Přidat kontakt</button>}
      </div>
    </div>
  );
}
