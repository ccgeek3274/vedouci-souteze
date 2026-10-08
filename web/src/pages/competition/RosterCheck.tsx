import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorText } from '../../lib/api';
import { czDateTime } from '../../lib/format';
import { checkTeamRoster, checkedAt, competitionIssues } from '../../lib/rosterCheck';
import type { RosterCheckData, RosterPlayer } from '../../lib/types';
import { deficiencyReport, strikeReason, type Issue } from '../../../../shared/roster/verify';
import { useCompetition } from './CompetitionLayout';

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
  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: ['roster-check', c.id] }), queryClient.invalidateQueries({ queryKey: ['team'] })]);

  if (isLoading || !data) return <p style={{ color: 'var(--cream)' }}>Načítání…</p>;
  const issues = competitionIssues(data);
  const withRoster = data.teams.filter((t) => t.players?.length);

  const run = async (list: Team[]) => {
    setError(null);
    try {
      for (const t of list) {
        setProgress(`${t.name}: 0/${t.players!.length}`);
        const r = await checkTeamRoster(t, t.players!, (d, n) => setProgress(`${t.name}: ${d}/${n}`));
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
  const bad = all.filter((p) => !p.struck && (issues.get(p.id) ?? []).some((i) => i.level === 'bad')).length;
  const toStrike = all.filter((p) => !p.struck && strikeReason(issues.get(p.id) ?? [])).length;
  const report = deficiencyReport(withRoster.map((t) => ({ name: t.name, players: t.players!.map((p) => ({ ...p, issues: issues.get(p.id) ?? [] })) })));

  return (
    <>
      {error && <div className="alert">{error}</div>}
      <div className="card">
        <div className="card-strip"><h2>Kontrola soupisek</h2>
          <span className="helper">Registrace, příspěvek {data.feeYear}, oddíl a hostování, údaje hráčů, duplicity.</span></div>
        <div className="card-body">
          <p style={{ marginTop: 0 }}>
            {withRoster.length} soupisek · {all.length} hráčů
            {unchecked > 0 && <> · <span className="tag warn">{unchecked} neověřeno</span></>}
            {' · '}{bad ? <span className="tag bad">{bad} s nedostatky</span> : <span className="tag ok">bez nedostatků</span>}
            {toStrike > 0 && <> · <span className="tag bad">{toStrike} navrženo k vyškrtnutí</span></>}
          </p>
          <p className="helper-text">
            Před definitivním úvodním zpravodajem se vyškrtnou hráči bez registrace, bez zaplaceného příspěvku a hosté bez povolení hostování (rozpis).
            Kontrola volá chess.cz postupně (~3 dotazy/s), u celé skupiny trvá zhruba minutu.
          </p>
          <div className="row">
            <button className="btn btn-primary" disabled={!!progress || !withRoster.length} onClick={() => run(withRoster)}>Ověřit všechny soupisky na chess.cz</button>
            {unchecked > 0 && unchecked < all.length && (
              <button className="btn" disabled={!!progress} onClick={() => run(withRoster.filter((t) => t.players!.some((p) => !p.cz)))}>Jen neověřené</button>
            )}
            {toStrike > 0 && <button className="btn" disabled={!!progress} onClick={strikeAll}>Vyškrtnout navržené ({toStrike})</button>}
            {progress && <span className="muted mono">{progress}</span>}
          </div>
        </div>
      </div>

      {data.teams.map((t) => <TeamCheck key={t.id} team={t} issues={issues} busy={!!progress} onCheck={() => run([t])} onChanged={refresh} />)}

      <div className="card">
        <div className="card-strip"><h2>Nedostatky pro předběžný zpravodaj</h2>
          <span className="helper">Jen závažné nedostatky nevyškrtnutých hráčů.</span></div>
        <div className="card-body">
          {report
            ? <textarea className="input mono" readOnly rows={Math.min(20, report.split('\n').length + 1)} style={{ width: '100%', fontSize: 12.5 }} value={report} />
            : <p className="muted" style={{ margin: 0 }}>Žádné nedostatky{unchecked ? ' (zatím ne všechny soupisky jsou ověřené)' : ''}.</p>}
        </div>
      </div>
    </>
  );
}

function TeamCheck({ team, issues, busy, onCheck, onChanged }: {
  team: Team; issues: Map<number, Issue[]>; busy: boolean; onCheck: () => void; onChanged: () => Promise<unknown>;
}) {
  const players = team.players ?? [];
  const at = checkedAt(players);
  const shown = players.filter((p) => p.struck || (issues.get(p.id) ?? []).length);
  return (
    <div className="card">
      <div className="card-strip">
        <h2 style={{ textTransform: 'none' }}><Link to={`../t/${team.id}`}>{team.name}</Link></h2>
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
      </div>
    </div>
  );
}

export function IssueList({ issues }: { issues: Issue[] }) {
  return (
    <div className="issues">
      {issues.map((i) => <div key={i.text} className={i.level}>{i.level === 'bad' ? '✕' : '!'} {i.text}</div>)}
    </div>
  );
}

function IssueRow({ player: p, issues, onChanged }: { player: RosterPlayer; issues: Issue[]; onChanged: () => Promise<unknown> }) {
  const reason = strikeReason(issues);
  const candidate = p.cz?.status === 'no_id' && p.cz.candidates?.length === 1 ? p.cz.candidates[0] : null;
  const patch = async (body: Partial<RosterPlayer>) => { await api.patch(`/roster-players/${p.id}`, body); await onChanged(); };
  return (
    <tr className={p.struck ? 'struck' : undefined}>
      <td className="mono muted" style={{ width: 36 }}>{p.position}.</td>
      <td style={{ width: 220, fontWeight: 600 }}>{p.name}<div className="muted mono" style={{ fontSize: 12, fontWeight: 400 }}>{p.lok ? `LOK ${p.lok}` : 'bez LOK'}{p.flags && ` · ${p.flags}`}</div></td>
      <td>
        {p.struck ? <div className="issues"><div className="bad">vyškrtnut{p.struck_reason && `: ${p.struck_reason}`}</div></div> : <IssueList issues={issues} />}
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
