import { Fragment, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorText } from '../../lib/api';
import { czDateTime, ROLE_LABEL } from '../../lib/format';
import { roundsText, shortTime } from '../../../../shared/startTime';
import { parseContactPaste } from '../../../../shared/contacts';
import { ClubInput } from '../../components/ClubInput';
import type { Contact, Request, RosterPlayer, RosterVersion, Team } from '../../lib/types';
import { useCompetition } from './CompetitionLayout';
import { IssueList, useRosterCheck } from './RosterCheck';
import { RosterEditor } from './RosterEditor';
import { FlagCells } from '../../components/FlagCells';
import { NewRequestForm, RequestTable, requestSummary } from './RequestItems';
import { REQUEST_STATUS_LABEL } from '../../lib/format';
import { checkTeamRoster, checkedAt, competitionIssues, prepareCheck } from '../../lib/rosterCheck';
import { strikeReason, toggleAccepted } from '../../../../shared/roster/verify';

type TeamResponse = {
  team: Team & { boards: number };
  contacts: Contact[];
  versions: RosterVersion[];
  roster: (RosterVersion & { players: RosterPlayer[] }) | null;
};

/** Shoes are stored as free text from rosters ("NE", "ano") — normalized to ano / ne / '' (not given). */
const shoesValue = (v: string) => (/^\s*a/i.test(v) ? 'ano' : /^\s*n/i.test(v) ? 'ne' : '');
const ROLES: Contact['role'][] = ['kapitan', 'zastupce', 'komunikace', 'rozhodci'];

/** Players that need a document: H (guest) → hosting permit, C (foreigner) → foreigner document. */
function needsDocument(flags: string): string {
  const f = flags.split(' ');
  return f.includes('H') ? 'povolení hostování' : f.includes('C') ? 'doklad cizince' : '';
}

export function TeamDetail() {
  const { teamId = '' } = useParams();
  const { data: comp, refresh: refreshCompetition } = useCompetition();
  const check = useRosterCheck(comp.competition.id);
  const [progress, setProgress] = useState<string | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const [version, setVersion] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const key = ['team', teamId, version];
  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => api.get<TeamResponse>(`/teams/${teamId}${version ? `?version=${version}` : ''}`),
  });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['team', teamId] });
    await queryClient.invalidateQueries({ queryKey: ['roster-check', comp.competition.id] });
    await refreshCompetition();
  };

  if (isLoading || !data) return <p style={{ color: 'var(--cream)' }}>Načítání…</p>;
  const t = data.team;
  const latest = !!data.roster && data.roster.version === data.versions[0]?.version;
  const issues = latest && check.data ? competitionIssues(check.data, comp.competition) : null;
  const at = data.roster ? checkedAt(data.roster.players) : null;
  const verify = async () => {
    setCheckError(null);
    try {
      const ctx = await prepareCheck(comp.competition, setProgress);
      const r = await checkTeamRoster(t, data.roster!.players, ctx, (d, n) => setProgress(`${d}/${n}`));
      const problems = [...ctx.warnings, ...(r.error ? [`${r.error} — ověřeno jen částečně.`] : [])];
      if (problems.length) setCheckError(problems.join(' '));
    } catch (e) {
      setCheckError(apiErrorText(e));
    } finally {
      setProgress(null);
      await refresh();
    }
  };
  const patchPlayer = async (id: number, body: object) => { await api.patch(`/roster-players/${id}`, body); await refresh(); };
  return (
    <>
      <div className="crumbs"><Link to="../druzstva">← Družstva</Link></div>
      <TeamFields team={t} requests={comp.requests.filter((r) => r.team_id === t.id)} defaultStart={comp.competition.default_start} onSaved={refresh} />
      <div className="card">
        <div className="card-strip">
          <h2>Soupiska</h2>
          {data.roster && <span className="helper">{data.roster.players.length} hráčů · {data.roster.players.filter((p) => p.base).length} v základní sestavě
            {latest && (at ? ` · chess.cz ověřeno ${czDateTime(at)}` : ' · neověřeno na chess.cz')}</span>}
          <span className="spacer" />
          {progress && <span className="muted mono">{progress}</span>}
          {latest && !editing && <button className="btn btn-small" style={{ whiteSpace: 'nowrap' }} onClick={() => setEditing(true)}>Upravit soupisku</button>}
          {latest && !editing && <button className="btn btn-small" style={{ whiteSpace: 'nowrap' }} disabled={!!progress} onClick={verify}>Ověřit na chess.cz</button>}
          {data.versions.length > 0 && !editing && (
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
          ) : editing ? (
            <RosterEditor competitionId={comp.competition.id} team={t} players={data.roster.players} boards={comp.competition.boards}
              onDone={async (saved) => { setEditing(false); if (saved) { setVersion(null); await refresh(); } }} />
          ) : (
            <>
              {checkError && <div className="alert">{checkError}</div>}
              {data.roster.filename && <p className="helper-text" style={{ marginTop: 0 }}>Zdroj: {data.roster.filename}</p>}
              <table className="table">
                <thead><tr><th>#</th><th>Příjmení jméno</th><th className="num">Rok</th><th className="num">LOK</th><th className="num">FIDE</th><th className="flag">Z</th><th colSpan={2}>Označení</th><th title="Ruční potvrzení dokladu (např. papírové povolení předložené na losovací schůzi). Potvrzená hostování a registrace cizinců z registrů ŠSČR se kontrolují automaticky.">Doloženo ručně</th>{issues && <><th>Kontrola chess.cz</th><th /></>}</tr></thead>
                <tbody>
                  {data.roster.players.map((p) => (
                    <tr key={p.id} className={p.struck ? 'struck' : undefined}>
                      <td className="mono muted">{p.position}.</td>
                      <td style={{ fontWeight: 600 }}>{p.name}</td>
                      <td className="num">{p.birth_year ?? ''}</td>
                      <td className="num">{p.lok ?? <span className="tag bad">chybí</span>}</td>
                      <td className="num">{p.fide ?? ''}</td>
                      <FlagCells flags={p.flags} z={!!p.base} />
                      <td>{needsDocument(p.flags) && (
                        <label className="row" style={{ gap: 6 }} title={needsDocument(p.flags)}>
                          <input type="checkbox" checked={!!p.guest_permit}
                            onChange={async (e) => { await api.patch(`/roster-players/${p.id}`, { guest_permit: e.target.checked ? 1 : 0 }); refresh(); }} />
                          {p.guest_permit ? <span>doloženo</span> : null}
                        </label>
                      )}</td>
                      {issues && (
                        <>
                          <td style={{ minWidth: 220 }}>
                            {p.struck ? <div className="issues"><div className="bad">vyškrtnut{p.struck_reason && `: ${p.struck_reason}`}</div></div>
                              : !p.cz ? <span className="muted" style={{ fontSize: 12.5 }}>neověřeno</span>
                              : issues.get(p.id)?.length ? <IssueList issues={issues.get(p.id)!} onToggle={(text) => patchPlayer(p.id, { accepted_issues: toggleAccepted(issues.get(p.id)!, text) })} />
                              : <span className="tag ok">OK</span>}
                          </td>
                          <td className="actions">
                            {p.struck
                              ? <button className="btn btn-small" onClick={() => patchPlayer(p.id, { struck: 0, struck_reason: '' })}>Vrátit</button>
                              : <button className={strikeReason(issues.get(p.id) ?? []) ? 'btn btn-small' : 'icon-btn'} title="Vyškrtnout ze soupisky (definitivní zpravodaj)" onClick={() => {
                                  const reason = window.prompt('Důvod vyškrtnutí', strikeReason(issues.get(p.id) ?? []));
                                  if (reason !== null) patchPlayer(p.id, { struck: 1, struck_reason: reason });
                                }}>{strikeReason(issues.get(p.id) ?? []) ? 'Vyškrtnout' : '✕'}</button>}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
      <Contacts teamId={t.id} contacts={data.contacts} onSaved={refresh} />
      <div className="card" id="pozadavky-druzstva">
        <div className="card-strip"><h2>Požadavky</h2><span className="helper">začátky utkání, losování, termíny</span></div>
        <div className="card-body table-scroll">
          {comp.requests.some((r) => r.team_id === t.id)
            ? <RequestTable requests={comp.requests.filter((r) => r.team_id === t.id)} showTeam={false} />
            : <p className="muted" style={{ marginTop: 0 }}>Žádné požadavky.</p>}
          <div className="section-title">Nový požadavek</div>
          <NewRequestForm teamId={t.id} />
        </div>
      </div>
    </>
  );
}

const FIELDS = ['name', 'short_name', 'club_name', 'club_code', 'venue', 'shoes', 'draw_no', 'notes'] as const;
type Field = (typeof FIELDS)[number];

/**
 * The team's own data. Start-time exceptions and draw preferences are not edited here: they come from the requests
 * (an accepted start-time request sets start_home / start_away) — this block only summarizes them.
 * Rows without information or with the default value are hidden unless "Zobrazit vše" is on.
 */
function TeamFields({ team, requests, defaultStart, onSaved }: { team: Team; requests: Request[]; defaultStart: string; onSaved: () => Promise<void> }) {
  const { data: comp } = useCompetition();
  const [edit, setEdit] = useState(false);
  const [all, setAll] = useState(false);
  const [form, setForm] = useState<Record<Field, string>>({} as Record<Field, string>);
  const [error, setError] = useState<string | null>(null);
  const reset = () => setForm({
    name: team.name, short_name: team.short_name ?? '', club_name: team.club_name ?? '', club_code: team.club_code ?? '', venue: team.venue ?? '',
    shoes: shoesValue(team.shoes ?? ''), draw_no: team.draw_no == null ? '' : String(team.draw_no), notes: team.notes ?? '',
  });
  useEffect(reset, [team]);

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

  const teamName = (id: string | null) => comp.teams.find((x) => x.id === id)?.name ?? '?';
  const shoes = shoesValue(team.shoes ?? '');
  const club = [team.club_name, team.club_code && `č. ${team.club_code}`].filter(Boolean).join(' · ');
  const skip = (s: string) => (roundsText(s) ? ` (neplatí v ${roundsText(s)})` : '');
  const starts = [
    team.start_home && `domácí utkání ${shortTime(team.start_home)}${skip(team.start_home_skip)}`,
    team.start_away && `utkání venku ${shortTime(team.start_away)}${skip(team.start_away_skip)}`,
  ].filter(Boolean);
  const none = <span className="muted">—</span>;
  const rows: { label: string; value: React.ReactNode; filled: boolean }[] = [
    { label: 'Zkrácený název', value: team.short_name || <span className="muted">vygeneruje se na záložce Swiss-Manager</span>, filled: !!team.short_name },
    { label: 'Oddíl', value: club || none, filled: !!club },
    { label: 'Hrací místnost', value: team.venue || none, filled: !!team.venue },
    { label: 'Přezůvky', value: shoes || <span className="muted">nezadáno</span>, filled: shoes === 'ano' },
    { label: 'Losovací číslo', value: team.draw_no ?? none, filled: team.draw_no != null },
    {
      label: 'Začátek utkání',
      value: starts.length ? <>{starts.map((x) => <div key={x}>{x}</div>)}</> : <span className="muted">výchozí {shortTime(defaultStart)}</span>,
      filled: starts.length > 0,
    },
    {
      label: 'Požadavky',
      value: requests.length ? (
        <div>
          {requests.map((r) => (
            <div key={r.id}>
              {requestSummary(r, teamName)}{r.kind === 'draw_no' && r.text ? <span className="muted"> ({r.text})</span> : null}{' '}
              <span className={`tag ${r.status === 'accepted' ? 'ok' : r.status === 'rejected' ? 'bad' : ''}`}>{REQUEST_STATUS_LABEL[r.status] ?? r.status}</span>
            </div>
          ))}
        </div>
      ) : none,
      filled: requests.length > 0,
    },
    { label: 'Poznámky', value: team.notes || none, filled: !!team.notes },
  ];
  const shown = all ? rows : rows.filter((r) => r.filled);
  const hidden = rows.length - rows.filter((r) => r.filled).length;

  return (
    <div className="card">
      <div className="card-strip">
        <h2 style={{ textTransform: 'none' }}>{team.name}</h2>
        {team.status === 'reserve' && <span className="tag warn">záloha</span>}
        {team.chesscz_team_id && <span className="tag ok">chess.cz #{team.chesscz_team_id}</span>}
        <span className="spacer" />
        {!edit && hidden > 0 && (
          <label className="row" style={{ gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Zobrazit vše
          </label>
        )}
        {edit ? (
          <>
            <button className="btn btn-small" onClick={() => { reset(); setEdit(false); }}>Zrušit</button>
            <button className="btn btn-small btn-primary" onClick={save}>Uložit</button>
          </>
        ) : <button className="btn btn-small" onClick={() => setEdit(true)}>Upravit</button>}
      </div>
      <div className="card-body">
        {error && <div className="alert">{error}</div>}
        {edit ? (
          <>
            <div className="grid-2">
              <div className="field"><label>Název družstva</label>
                <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="field"><label>Zkrácený název</label>
                <input className="input" value={form.short_name} placeholder="vygeneruje se na záložce Swiss-Manager" onChange={(e) => setForm({ ...form, short_name: e.target.value })} /></div>
              <div className="field"><label>Oddíl</label>
                <ClubInput name={form.club_name} code={form.club_code} onChange={(p) => setForm((x) => ({ ...x, ...p }))} /></div>
              <div className="field" style={{ gridColumn: 'span 2' }}><label>Hrací místnost</label>
                <input className="input" value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} /></div>
              <div className="field"><label>Přezůvky</label>
                <div className="segmented">
                  {(['ano', 'ne'] as const).map((v) => (
                    <button key={v} type="button" className={form.shoes === v ? 'active' : ''} onClick={() => setForm({ ...form, shoes: form.shoes === v ? '' : v })}>{v === 'ano' ? 'Ano' : 'Ne'}</button>
                  ))}
                </div></div>
              <div className="field"><label>Losovací číslo</label>
                <input className="input mono" value={form.draw_no} onChange={(e) => setForm({ ...form, draw_no: e.target.value.replace(/\D/g, '') })} /></div>
              <div className="field" style={{ gridColumn: 'span 2' }}><label>Poznámky</label>
                <input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            </div>
            <p className="helper-text">Začátky utkání a požadavky na losování se zadávají v <a href="#pozadavky-druzstva">požadavcích</a> — přijatý požadavek na začátek utkání se promítne sem.</p>
          </>
        ) : shown.length ? (
          <dl className="dl">
            {shown.map((r) => <Fragment key={r.label}><dt>{r.label}</dt><dd>{r.value}</dd></Fragment>)}
          </dl>
        ) : <p className="muted" style={{ margin: 0 }}>Žádné doplňující údaje.</p>}
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

  // Pasting cells copied from Excel (name | phone | e-mail, any order, one contact per line) fills the row;
  // further lines become new contacts with the same role.
  const onPaste = (i: number) => (e: React.ClipboardEvent<HTMLInputElement>) => {
    const parsed = parseContactPaste(e.clipboardData.getData('text'));
    if (!parsed) return;
    e.preventDefault();
    const role = rows[i].role;
    const [first, ...more] = parsed;
    setRows([
      ...rows.slice(0, i),
      { ...rows[i], ...first },
      ...more.map((p) => ({ role, ...p })),
      ...rows.slice(i + 1),
    ]);
  };

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
                  <td><input className="input input-sm" value={r.name} onPaste={onPaste(i)} onChange={(e) => set(i, { name: e.target.value })} /></td>
                  <td><input className="input input-sm" value={r.phone} onPaste={onPaste(i)} onChange={(e) => set(i, { phone: e.target.value })} /></td>
                  <td><input className="input input-sm" value={r.email} onPaste={onPaste(i)} onChange={(e) => set(i, { email: e.target.value })} /></td>
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
        {edit && (
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn btn-small" onClick={() => setRows([...rows, { role: 'komunikace', name: '', phone: '', email: '' }])}>+ Přidat kontakt</button>
            <span className="helper-text">Tip: do libovolného pole lze vložit (Ctrl+V) buňky zkopírované z Excelu — jméno, telefon a e-mail v libovolném pořadí, i více řádků najednou.</span>
          </div>
        )}
      </div>
    </div>
  );
}
