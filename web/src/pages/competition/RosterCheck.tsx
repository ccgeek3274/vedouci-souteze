import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorText } from '../../lib/api';
import { czDateTime, ROLE_LABEL } from '../../lib/format';
import { checkTeamRoster, checkedAt, chessczGet, competitionIssues, prepareCheck, runVCheck } from '../../lib/rosterCheck';
import type { Contact, RosterCheckData, RosterPlayer } from '../../lib/types';
import { contactNameFindings, fixContactNames, type ContactNameFinding } from '../../../../shared/roster/contactNames';
import { sameName } from '../../../../shared/schedule';
import { asArray, deficiencyReport, strikeReason, toggleAccepted, type Issue } from '../../../../shared/roster/verify';
import { sameCompetition, type RosterCheckSection } from '../../../../shared/registry';
import { fold } from '../../../../shared/text';
import { flagParts } from '../../../../shared/roster/draft';
import type { Competition } from '../../lib/types';
import { useCompetition } from './CompetitionLayout';
import { TeamName } from '../../components/TeamName';

type Team = RosterCheckData['teams'][number];

export function useRosterCheck(competitionId: string) {
  return useQuery({ queryKey: ['roster-check', competitionId], queryFn: () => api.get<RosterCheckData>(`/competitions/${competitionId}/roster-check`) });
}

// M6: roster check against chess.cz — deficiencies for the preliminary bulletin, strikes for the definitive one.
export function RosterCheck() {
  const { data: comp, refresh: refreshCompetition } = useCompetition();
  const c = comp.competition;
  const queryClient = useQueryClient();
  const { data, isLoading } = useRosterCheck(c.id);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: ['roster-check', c.id] }), queryClient.invalidateQueries({ queryKey: ['team'] })]);

  if (isLoading || !data) return <p style={{ color: 'var(--cream)' }}>Načítání…</p>;
  const issues = competitionIssues(data, c);
  const withRoster = data.teams.filter((t) => t.players?.length);
  // contact names against the rosters (light, no chess.cz); a player's name as on chess.cz is the preferred form
  const preferred = (p: RosterPlayer) => { const cz = p.cz?.member?.fullName?.trim(); return cz && sameName(p.name, cz) ? cz : p.name; };
  const rosterNames = (t: Team) => (t.players ?? []).filter((p) => !p.struck).map(preferred);
  const contactsOf = (t: Team) => comp.teams.find((x) => x.id === t.id)?.contacts ?? [];
  const nameFindings = new Map(data.teams.map((t) => [
    t.id, contactNameFindings(contactsOf(t), rosterNames(t), data.teams.filter((o) => o.id !== t.id).flatMap(rosterNames)),
  ]));
  const nameCount = [...nameFindings.values()].reduce((n, f) => n + f.length, 0);
  const swappedTeams = data.teams.filter((t) => nameFindings.get(t.id)!.some((f) => f.kind === 'swapped'));
  const swappedCount = swappedTeams.reduce((n, t) => n + nameFindings.get(t.id)!.filter((f) => f.kind === 'swapped').length, 0);
  const fixAllContacts = async () => {
    if (!window.confirm(`Opravit přehozená jména v kontaktech podle soupisek (${swappedCount})?`)) return;
    setError(null);
    try {
      for (const t of swappedTeams) {
        await api.put(`/teams/${t.id}/contacts`, { contacts: fixContactNames(contactsOf(t), nameFindings.get(t.id)!.filter((f) => f.kind === 'swapped')) });
      }
    } catch (e) {
      setError(apiErrorText(e));
    }
    await refreshCompetition();
  };
  // players written otherwise than on chess.cz (same person) → take over the chess.cz form
  const respell = withRoster.flatMap((t) => t.players!.flatMap((p) => {
    const i = !p.struck && (issues.get(p.id) ?? []).find((x) => x.level === 'warn' && x.czName && !x.accepted);
    return i ? [{ p, name: i.czName! }] : [];
  }));
  const respellAll = async () => {
    if (!window.confirm(`Přepsat jména hráčů na soupiskách v aplikaci na zápis z chess.cz (${respell.length}) — pořadí, diakritika, ml./st.?`)) return;
    setError(null);
    try {
      for (const x of respell) await api.patch(`/roster-players/${x.p.id}`, { name: x.name });
    } catch (e) {
      setError(apiErrorText(e));
    }
    await refresh();
  };

  const run = async (list: Team[]) => {
    setError(null);
    try {
      const ctx = await prepareCheck(c, (x) => setProgress(x));
      setWarnings(ctx.warnings);
      for (const t of list) {
        setProgress(`${t.name}: 0/${t.players!.length}`);
        const r = await checkTeamRoster(t, t.players!, ctx, (d, n) => setProgress(`${t.name}: ${d}/${n}`));
        if (r.error) throw new Error(`${t.name}: ${r.error} — ověřeno jen částečně, zkuste to později znovu.`);
      }
    } catch (e) {
      setError(apiErrorText(e));
    } finally {
      setProgress(null);
      await refresh();
      await refreshCompetition();
    }
  };

  const strikeAll = async () => {
    const list = withRoster.flatMap((t) => t.players!.filter((p) => !p.struck && strikeReason(issues.get(p.id) ?? [])));
    if (!window.confirm(`Vyškrtnout ${list.length} hráčů navržených k vyškrtnutí?`)) return;
    for (const p of list) await api.patch(`/roster-players/${p.id}`, { struck: 1, struck_reason: strikeReason(issues.get(p.id) ?? []) });
    await refresh();
  };

  const all = withRoster.flatMap((t) => t.players!);
  const unchecked = all.filter((p) => !p.cz).length;
  const bad = all.filter((p) => !p.struck && (issues.get(p.id) ?? []).some((i) => i.level === 'bad' && !i.accepted)).length;
  const accepted = all.filter((p) => !p.struck && (issues.get(p.id) ?? []).some((i) => i.accepted)).length;
  const toStrike = all.filter((p) => !p.struck && strikeReason(issues.get(p.id) ?? [])).length;
  const report = deficiencyReport(withRoster.map((t) => ({ name: t.name, players: t.players!.map((p) => ({ ...p, issues: issues.get(p.id) ?? [] })) })));

  return (
    <>
      {error && <div className="alert">{error}</div>}
      <div className="card">
        <div className="card-strip"><h2>Kontrola soupisek</h2>
          <span className="helper">Registrace, označení Z / H / V / C, potvrzená hostování a registrace cizinců.</span></div>
        <div className="card-body">
          <p style={{ marginTop: 0 }}>
            {withRoster.length} soupisek · {all.length} hráčů
            {unchecked > 0 && <> · <span className="tag warn">{unchecked} neověřeno</span></>}
            {' · '}{bad ? <span className="tag bad">{bad} s nedostatky</span> : <span className="tag ok">bez nedostatků</span>}
            {toStrike > 0 && <> · <span className="tag bad">{toStrike} navrženo k vyškrtnutí</span></>}
            {accepted > 0 && <> · <span className="tag">{accepted} s odsouhlaseným nedostatkem</span></>}
            {nameCount > 0 && <> · <span className="tag warn">{nameCount} {nameCount === 1 ? 'jméno' : nameCount < 5 ? 'jména' : 'jmen'} v kontaktech k ověření</span></>}
          </p>
          <p className="helper-text">
            Před definitivním úvodním zpravodajem se vyškrtnou hráči bez registrace a hosté bez povolení hostování (rozpis).
            Z se kontroluje podle pravidla e-soupisky ({c.boards} hráčů, nejvýše {Math.max(0, Math.ceil(c.boards / 2) - 1)} písmenkoví H/V/C),
            hostování a cizinci podle registrů ŠSČR (hostovani / registracecizincu.appchess.cz). Označení V má samostatnou kontrolu níže.
            Každý nález lze <b>odsouhlasit</b> (✓) — pak se nepočítá jako nedostatek, nenavrhuje vyškrtnutí a nejde do zpravodaje.
            Kontrola volá chess.cz postupně (~3 dotazy/s), u celé skupiny trvá asi minutu.
            Preferovaný zápis jména hráče je ten z chess.cz (SM ho při vložení podle ID načte z Elo listiny) — jiný zápis
            stejného hráče se nabídne k převzetí. Jména v kontaktech (kapitán, zástupce, komunikace, rozhodčí) se hned porovnají
            se soupiskami bez chess.cz — upozorní na přehozené jméno a příjmení (soupisky i zpravodaj mají Příjmení Jméno).
          </p>
          <div className="row">
            <button className="btn btn-primary" disabled={!!progress || !withRoster.length} onClick={() => run(withRoster)}>Ověřit všechny soupisky na chess.cz</button>
            {unchecked > 0 && unchecked < all.length && (
              <button className="btn" disabled={!!progress} onClick={() => run(withRoster.filter((t) => t.players!.some((p) => !p.cz)))}>Jen neověřené</button>
            )}
            {toStrike > 0 && <button className="btn" disabled={!!progress} onClick={strikeAll}>Vyškrtnout navržené ({toStrike})</button>}
            {respell.length > 0 && <button className="btn" disabled={!!progress} onClick={respellAll} title="Stejný hráč, jiný zápis jména (pořadí, diakritika) — převezme se zápis z chess.cz">Jména hráčů podle chess.cz ({respell.length})</button>}
            {swappedCount > 0 && <button className="btn" disabled={!!progress} onClick={fixAllContacts} title="Kontakty se jménem v opačném pořadí než na soupisce">Opravit přehozená jména v kontaktech ({swappedCount})</button>}
            {progress && <span className="muted mono">{progress}</span>}
          </div>
        </div>
      </div>

      {warnings.map((w) => <div key={w} className="note warn">{w}</div>)}
      <VCheckCard competition={c} data={data} busy={!!progress} onDone={refresh} />
      <ChessczRosterCheck competition={c} teams={data.teams.map((t) => t.name)} />

      {data.teams.map((t) => (
        <TeamCheck key={t.id} team={t} issues={issues} busy={!!progress} onCheck={() => run([t])} onChanged={refresh}
          contacts={contactsOf(t)} nameFindings={nameFindings.get(t.id) ?? []} onContactsChanged={refreshCompetition} />
      ))}

      <div className="card">
        <div className="card-strip"><h2>Nedostatky pro předběžný zpravodaj</h2>
          <span className="helper">Nedostatky a chybějící potvrzení nevyškrtnutých hráčů.</span></div>
        <div className="card-body">
          {report
            ? <textarea className="input mono" readOnly rows={Math.min(20, report.split('\n').length + 1)} style={{ width: '100%', fontSize: 12.5 }} value={report} />
            : <p className="muted" style={{ margin: 0 }}>Žádné nedostatky{unchecked ? ' (zatím ne všechny soupisky jsou ověřené)' : ''}.</p>}
        </div>
      </div>
    </>
  );
}

function TeamCheck({ team, issues, busy, onCheck, onChanged, contacts, nameFindings, onContactsChanged }: {
  team: Team; issues: Map<number, Issue[]>; busy: boolean; onCheck: () => void; onChanged: () => Promise<unknown>;
  contacts: Contact[]; nameFindings: ContactNameFinding[]; onContactsChanged: () => Promise<unknown>;
}) {
  const players = team.players ?? [];
  const at = checkedAt(players);
  const shown = players.filter((p) => p.struck || (issues.get(p.id) ?? []).length);
  return (
    <div className="card">
      <div className="card-strip">
        <h2 style={{ textTransform: 'none' }}><TeamName id={team.id} name={team.name} link /></h2>
        <span className="helper">
          {team.club_code ? `oddíl ${team.club_code}${team.club_name ? ` · ${team.club_name}` : ''}` : 'oddíl neurčen'}
          {players.length > 0 && (at ? ` · ověřeno ${czDateTime(at)}` : ' · neověřeno')}
        </span>
        <span className="spacer" />
        {players.length > 0 && <button className="btn btn-small" disabled={busy} onClick={onCheck}>Ověřit</button>}
      </div>
      <div className="card-body table-scroll">
        {!team.players ? <p className="muted" style={{ margin: 0 }}>Chybí soupiska.</p>
          : !shown.length ? <p className="muted" style={{ margin: 0 }}>{at ? 'Bez nedostatků.' : 'Soupiska zatím nebyla ověřena na chess.cz.'}</p>
          : (
            <table className="table">
              <tbody>
                {shown.map((p) => <IssueRow key={p.id} player={p} issues={issues.get(p.id) ?? []} onChanged={onChanged} />)}
              </tbody>
            </table>
          )}
        <ContactNames teamId={team.id} contacts={contacts} findings={nameFindings} onChanged={onContactsChanged} />
      </div>
    </div>
  );
}

/** Contact names that do not look like "Příjmení Jméno" of the rosters; "opravit" rewrites the contact. */
function ContactNames({ teamId, contacts, findings, onChanged }: {
  teamId: string; contacts: Contact[]; findings: ContactNameFinding[]; onChanged: () => Promise<unknown>;
}) {
  const [error, setError] = useState<string | null>(null);
  if (!findings.length) return null;
  const swapped = findings.filter((f) => f.kind === 'swapped');
  const fix = async (list: ContactNameFinding[]) => {
    setError(null);
    try {
      // the same person in more roles (captain and referee) — all at once
      await api.put(`/teams/${teamId}/contacts`, { contacts: fixContactNames(contacts, list) });
      await onChanged();
    } catch (e) {
      setError(apiErrorText(e));
    }
  };
  return (
    <div className="issues" style={{ marginTop: 10 }}>
      {findings.map((f) => (
        <div key={f.index} className="warn">
          ! {ROLE_LABEL[contacts[f.index].role]}: {f.text}
          {f.suggestion && <button className="issue-acc" title="Přepsat jméno v kontaktech družstva" onClick={() => fix([f])}>opravit na {f.suggestion}</button>}
        </div>
      ))}
      {swapped.length > 1 && (
        <div><button className="btn btn-small" onClick={() => fix(swapped)}>Opravit všechna přehozená jména v kontaktech ({swapped.length})</button></div>
      )}
      {error && <div className="bad">{error}</div>}
    </div>
  );
}

/**
 * Findings of a player; with `onToggle` each one can be accepted manually (and the acceptance taken back), with
 * `onTakeName` a different name can be replaced by the one on chess.cz.
 */
export function IssueList({ issues, onToggle, onTakeName }: { issues: Issue[]; onToggle?: (text: string) => void; onTakeName?: (i: Issue) => void }) {
  return (
    <div className="issues">
      {issues.map((i) => (
        <div key={i.text} className={i.accepted ? 'accepted' : i.level}>
          {i.accepted ? '✓' : i.level === 'bad' ? '✕' : '!'} {i.text}{i.accepted && <span className="muted"> — odsouhlaseno</span>}
          {onToggle && (
            <button className="issue-acc" title={i.accepted ? 'Zrušit odsouhlasení' : 'Odsouhlasit — nepočítat jako nedostatek, nedávat do zpravodaje'}
              onClick={() => onToggle(i.text)}>{i.accepted ? 'zrušit' : 'odsouhlasit'}</button>
          )}
          {onTakeName && i.czName && !i.accepted && (
            <button className="issue-acc" title="Přepsat jméno na soupisce v aplikaci na zápis z chess.cz" onClick={() => onTakeName(i)}>převzít z chess.cz</button>
          )}
        </div>
      ))}
    </div>
  );
}

/** Confirms taking over the chess.cz name; a name of another person usually means a typo in the id. */
export function takeName(p: RosterPlayer, i: Issue): boolean {
  return i.level === 'warn' || window.confirm(
    `Jméno „${p.name}“ nesouhlasí s ID — obvykle je chyba v čísle LOK / FIDE ID, ne ve jméně.\n\nOpravdu přepsat jméno na „${i.czName}“ (hráč s tímto ID na chess.cz)?`,
  );
}

/** Z, H/V/C, K/ZK — always in this order. */
const flagText = (p: RosterPlayer) => { const f = flagParts(p.flags); return [p.base ? 'Z' : '', f.letter, f.cap].filter(Boolean).join(' '); };

function IssueRow({ player: p, issues, onChanged }: { player: RosterPlayer; issues: Issue[]; onChanged: () => Promise<unknown> }) {
  const reason = strikeReason(issues);
  const candidate = p.cz?.status === 'no_id' && p.cz.candidates?.length === 1 ? p.cz.candidates[0] : null;
  const patch = async (body: Partial<RosterPlayer> | { accepted_issues: string[] }) => { await api.patch(`/roster-players/${p.id}`, body); await onChanged(); };
  return (
    <tr className={p.struck ? 'struck' : undefined}>
      <td className="mono muted" style={{ width: 36 }}>{p.position}.</td>
      <td style={{ width: 220, fontWeight: 600 }}>{p.name}<div className="muted mono" style={{ fontSize: 12, fontWeight: 400 }}>{p.lok ? `LOK ${p.lok}` : 'bez LOK'}{flagText(p) && ` · ${flagText(p)}`}</div></td>
      <td>
        {p.struck ? <div className="issues"><div className="bad">vyškrtnut{p.struck_reason && `: ${p.struck_reason}`}</div></div>
          : <IssueList issues={issues} onToggle={(text) => patch({ accepted_issues: toggleAccepted(issues, text) })}
              onTakeName={(i) => takeName(p, i) && patch({ name: i.czName! })} />}
      </td>
      <td className="actions" style={{ width: 170 }}>
        {candidate?.czeId && !p.struck && (
          <button className="btn btn-small" title={`${candidate.fullName}, ${candidate.birthYear ?? ''}, ${candidate.clubName}`}
            onClick={() => patch({ lok: candidate.czeId, ...(p.birth_year ? {} : { birth_year: candidate.birthYear }), ...(p.fide ? {} : { fide: candidate.fideId }) })}>
            Doplnit LOK {candidate.czeId}
          </button>
        )}
        {p.struck
          ? <button className="btn btn-small" onClick={() => patch({ struck: 0, struck_reason: '' })}>Vrátit</button>
          : reason && <button className="btn btn-small" onClick={() => patch({ struck: 1, struck_reason: reason })}>Vyškrtnout</button>}
      </td>
    </tr>
  );
}

type Regions = Record<string, { regionCode: string; regionName: string }>;

/** chess.cz/kontrola-soupisek for our svaz, filtered to our competition (useful right before the definitive bulletin). */
function ChessczRosterCheck({ competition: c, teams }: { competition: Competition; teams: string[] }) {
  const q = useQuery({
    queryKey: ['chesscz-roster-check', c.season, c.region],
    queryFn: async () => {
      const regions = (await chessczGet(`/competitions/${parseInt(c.season, 10)}`)) as Regions | null;
      const org = Object.entries(regions ?? {}).find(([, r]) => fold(r.regionName) === fold(c.region) || fold(c.region).includes(fold(r.regionCode)))?.[0];
      if (!org) return null;
      return api.get<{ data: RosterCheckSection[]; fetchedAt: number }>(`/registry/roster-check?org=${org}`);
    },
  });
  const sections = asArray(q.data?.data).map((s) => ({
    ...s,
    rows: s.rows.filter((r) => (c.chesscz_comp_id ? r.compId === c.chesscz_comp_id : sameCompetition(r.comp, c.name)) || teams.some((t) => fold(t) === fold(r.team))),
  }));
  return (
    <div className="card">
      <div className="card-strip"><h2>Kontrola soupisek na chess.cz</h2>
        <span className="helper">Stránka chess.cz/kontrola-soupisek (registrace, hráči na více soupiskách) — má smysl až po nahrání soupisek do chess.cz.</span></div>
      <div className="card-body">
        {q.isLoading ? <p className="muted" style={{ margin: 0 }}>Načítání…</p>
          : q.error ? <p className="muted" style={{ margin: 0 }}>{apiErrorText(q.error)}</p>
          : !sections.length ? <p className="muted" style={{ margin: 0 }}>Na stránce nejsou žádné sekce.</p>
          : sections.map((s) => (
            <div key={s.title}>
              <div className="section-title">{s.title}</div>
              {s.rows.length
                ? <ul className="list-plain">{s.rows.map((r) => <li key={`${r.lok}-${r.team}`}>{r.name} {r.lok && <span className="muted mono">LOK {r.lok}</span>} — {r.team}</li>)}</ul>
                : <p className="muted" style={{ margin: 0 }}>V této soutěži nikdo.</p>}
            </div>
          ))}
        {q.data && <p className="helper-text">Načteno {czDateTime(Math.floor(q.data.fetchedAt / 1000))} (obnovuje se po hodině).</p>}
      </div>
    </div>
  );
}

/** Separate, competition-wide and approximate check of the V letter (club teams in higher competitions found by name). */
function VCheckCard({ competition: c, data, busy, onDone }: { competition: Competition; data: RosterCheckData; busy: boolean; onDone: () => Promise<unknown> }) {
  const [progress, setProgress] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const players = data.teams.flatMap((t) => t.players ?? []);
  const times = players.map((p) => p.v_checked_at).filter((x): x is number => !!x);
  const run = async () => {
    setMsg(null);
    try {
      const found = await runVCheck(c, data, setProgress);
      setMsg(found ? null : 'Ve vyšších soutěžích nebylo nalezeno žádné družstvo oddílů této soutěže.');
    } catch (e) {
      setMsg(apiErrorText(e));
    } finally {
      setProgress(null);
      await onDone();
    }
  };
  return (
    <div className="card">
      <div className="card-strip"><h2>Kontrola označení V</h2>
        <span className="helper">{times.length ? `naposledy ${czDateTime(Math.min(...times))}` : 'zatím neprovedena'}</span>
        <span className="spacer" />
        {progress && <span className="muted mono">{progress}</span>}
        <button className="btn btn-small" style={{ whiteSpace: 'nowrap' }} disabled={busy || !!progress || !players.length} onClick={run}>Ověřit V v celé soutěži</button>
      </div>
      <div className="card-body">
        <p className="helper-text" style={{ marginTop: 0 }}>
          V = hráč mateřského oddílu, který je v základní sestavě (Z) družstva oddílu ve vyšší soutěži. Družstva oddílu se ve vyšších
          soutěžích na chess.cz hledají podle názvu, takže kontrola <b>není dokonalá</b>: družstvo s jiným názvem se nenajde
          a před nahráním soupisek vyšších soutěží do chess.cz hlásí falešné chyby. Má smysl hlavně před definitivním zpravodajem.
        </p>
        {msg && <div className="note warn">{msg}</div>}
        {times.length > 0 && (
          <ul className="list-plain">
            {data.teams.filter((t) => t.players?.length).map((t) => {
              const found = t.players!.find((p) => p.v)?.v?.higherTeams ?? [];
              return <li key={t.id}><TeamName id={t.id} name={t.name} bold />: {found.length ? found.join(', ') : <span className="muted">žádné družstvo ve vyšší soutěži</span>}</li>;
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
