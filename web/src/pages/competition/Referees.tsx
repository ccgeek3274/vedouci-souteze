import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorText } from '../../lib/api';
import { czDate } from '../../lib/format';
import { useCompetition } from './CompetitionLayout';
import { loadChesscz } from '../../bulletin/load';
import { competitionSchedule, refKey, rotatedReferees, sameName, scheduleRounds, teamReferees } from '../../../../shared/schedule';
import { CONFLICT } from '../../../../shared/bulletin/initial';
import { TeamName } from '../../components/TeamName';

type Assignments = Record<string, string>;

// Nasazení rozhodčích: one referee per match (automatic rotation of the home team's referees, then manual edits —
// the opponent's referee or any name). The bulletins take the referees from here; the public schedule shows them.
export function Referees() {
  const { data: detail, refresh } = useCompetition();
  const c = detail.competition;
  const qc = useQueryClient();
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);

  const stored = useQuery({ queryKey: ['referees', c.id], queryFn: () => api.get<{ assignments: Assignments }>(`/competitions/${c.id}/referees`) });
  const cz = useQuery({
    queryKey: ['schedule-cz', c.id, c.chesscz_comp_id],
    queryFn: () => loadChesscz(c.chesscz_comp_id, setProgress, false),
    staleTime: 10 * 60_000,
  });

  // Assignments: local state, saved 800 ms after the last change (as the bulletin draft).
  const [refs, setRefs] = useState<Assignments | null>(null);
  const [saveState, setSaveState] = useState<'saved' | 'dirty' | 'saving' | 'error'>('saved');
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef<Assignments | null>(null);
  useEffect(() => {
    if (stored.data && !refs) setRefs(stored.data.assignments);
  }, [stored.data, refs]);

  const save = async () => {
    window.clearTimeout(timer.current);
    const body = pending.current;
    if (!body) return;
    pending.current = null;
    setSaveState('saving');
    try {
      await api.put(`/competitions/${c.id}/referees`, { assignments: body });
      setSaveState(pending.current ? 'dirty' : 'saved');
      qc.setQueryData(['referees', c.id], { assignments: body });
    } catch (e) {
      setSaveState('error');
      setError(apiErrorText(e) ?? 'Uložení se nepodařilo');
    }
  };
  const update = (fn: (a: Assignments) => Assignments) => {
    setRefs((prev) => {
      const next = fn(prev ?? {});
      pending.current = next;
      return next;
    });
    setSaveState('dirty');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(save, 800);
  };
  useEffect(() => () => { if (pending.current) void save(); }, []);

  const active = useMemo(() => detail.teams.filter((t) => t.status === 'active'), [detail.teams]);
  const sched = useMemo(
    () => (cz.data ? competitionSchedule(active, cz.data, new Map(detail.rounds.map((r) => [r.round, r.date])), true) : null),
    [cz.data, active, detail.rounds],
  );
  const rounds = useMemo(() => (sched ? scheduleRounds(sched, c.default_start, c.last_start) : []), [sched, c.default_start, c.last_start]);
  const team = useMemo(() => new Map((sched?.teams ?? []).map((t) => [t.key, t])), [sched]);
  const refsOf = (key: string) => teamReferees(team.get(key)?.app?.contacts ?? []);

  if (stored.isLoading || !refs) return <div className="muted">Načítám…</div>;
  if (stored.error) return <div className="alert">{apiErrorText(stored.error)}</div>;

  const autoAssign = () => {
    if (!sched) return;
    const filled = rounds.some((r) => r.matches.some((m) => refs[refKey(r.nr, m.home)]?.trim()));
    if (filled && !window.confirm('Automatické nasazení přepíše všechny nasazené rozhodčí (i ruční úpravy). Pokračovat?')) return;
    const rot = rotatedReferees({ teams: sched.teams.map((t) => ({ key: t.key, contacts: t.app?.contacts ?? [] })), rounds: sched.rounds });
    update(() => Object.fromEntries(rot));
  };
  const clearAll = () => {
    if (window.confirm('Smazat všechny nasazené rozhodčí?')) update(() => ({}));
  };
  const setPublished = async (on: boolean) => {
    setError(null);
    try {
      await api.patch(`/competitions/${c.id}`, { published: on ? 1 : 0 });
      await refresh();
    } catch (e) {
      setError(apiErrorText(e));
    }
  };

  const total = rounds.reduce((n, r) => n + r.matches.length, 0);
  const assigned = rounds.reduce((n, r) => n + r.matches.filter((m) => refs[refKey(r.nr, m.home)]?.trim()).length, 0);
  const foreign = rounds.reduce((n, r) => n + r.matches.filter((m) => {
    const v = refs[refKey(r.nr, m.home)]?.trim();
    return v && !refsOf(m.home).some((x) => sameName(x, v));
  }).length, 0);
  const noRefTeams = (sched?.teams ?? []).filter((t) => !refsOf(t.key).length).map((t) => t.name);
  const saveText = { saved: 'uloženo', dirty: 'neuloženo…', saving: 'ukládám…', error: 'chyba ukládání' }[saveState];
  const publicUrl = `${location.origin}/rozpis/${c.id}`;

  return (
    <>
      <div className="grid-2">
        <div className="card">
          <div className="card-strip">
            <h2>Nasazení rozhodčích</h2>
            <span className={`tag${saveState === 'error' ? ' bad' : saveState === 'saved' ? ' ok' : ''}`}>{saveText}</span>
          </div>
          <div className="card-body">
            <div className="bulletin-bar">
              <button className="btn btn-primary" disabled={!rounds.length} onClick={autoAssign}>Nasadit automaticky</button>
              <button className="btn" disabled={!assigned} onClick={clearAll}>Smazat nasazení</button>
            </div>
            <p className="helper-text">
              Automaticky se domácím utkáním každého družstva střídají jeho rozhodčí ze soupisky (v pořadí kontaktů).
              Rozhodčího lze přepsat ručně — vybrat rozhodčího domácích nebo hostů, nebo napsat libovolné jméno.
              <span className="ref-foreign"> Červeně</span> je rozhodčí, který není rozhodčím domácího družstva.
              Zpravodaje přebírají rozhodčí odsud.
            </p>
            {rounds.length > 0 && (
              <p className="helper-text">
                Rozlosování: {sched?.source === 'chesscz' ? 'chess.cz' : 'z aplikace (losovací čísla → Berger), na chess.cz zatím není'}.
                {' '}Nasazeno {assigned} z {total} utkání{foreign ? `, z toho ${foreign} mimo domácí rozhodčí` : ''}.
                {noRefTeams.length > 0 && <> Bez rozhodčího na soupisce: {noRefTeams.join(', ')}.</>}
              </p>
            )}
            {error && <div className="alert">{error}</div>}
          </div>
        </div>

        <div className="card">
          <div className="card-strip"><h2>Zveřejnění rozlosování</h2></div>
          <div className="card-body">
            <div className="bulletin-bar">
              <div className="segmented">
                <button className={c.published ? 'active ok' : ''} onClick={() => setPublished(true)}>Ano</button>
                <button className={!c.published ? 'active' : ''} onClick={() => setPublished(false)}>Ne</button>
              </div>
              {!!c.published && <a href={publicUrl} target="_blank" rel="noreferrer">{publicUrl}</a>}
            </div>
            <p className="helper-text">
              Veřejná stránka bez přihlášení: rozpis všech kol se začátky utkání a rozhodčími, odkazy na chess.cz a chess-results,
              u každého družstva jeho rozpis, kapitán a hrací místnost. Ostatní kontakty ani soupisky se nezveřejňují.
            </p>
          </div>
        </div>
      </div>

      {cz.error && <div className="alert">chess.cz: {apiErrorText(cz.error)}</div>}
      {sched && sched.warnings.length > 0 && (
        <div className="issues">{sched.warnings.map((w) => <div key={w} className="warn">! {w}</div>)}</div>
      )}
      {!sched ? (
        <div className="card"><div className="card-body muted">{cz.isLoading ? `Načítám rozlosování z chess.cz (${progress})…` : 'Načítám…'}</div></div>
      ) : !rounds.length ? (
        <div className="card"><div className="card-body muted">
          Rozlosování zatím není — na chess.cz chybí a v aplikaci nejsou zadána všechna losovací čísla (karta Losování).
        </div></div>
      ) : (
        <>
          <div className="ref-rounds">
            {rounds.map((r) => (
              <div key={r.nr} className="card">
                <div className="card-strip"><h2>{r.nr}. kolo</h2><span className="helper">{czDate(r.date)} · {r.start} hodin{r.last ? ' · poslední kolo' : ''}</span></div>
                <table className="table ref-table">
                  <tbody>
                    {r.matches.map((m) => {
                      const key = refKey(r.nr, m.home);
                      const v = refs[key] ?? '';
                      const home = refsOf(m.home), away = refsOf(m.away);
                      const isForeign = !!v.trim() && !home.some((x) => sameName(x, v));
                      return (
                        <tr key={key}>
                          <td className="num">{m.board}</td>
                          <td>
                            <TeamName id={team.get(m.home)?.app?.id} name={team.get(m.home)?.name ?? '?'} />
                            {m.exception && <span className="ref-time"> {m.conflict ? CONFLICT : `${m.time} h`}</span>}
                            <span className="muted"> – </span><TeamName id={team.get(m.away)?.app?.id} name={team.get(m.away)?.name ?? '?'} />
                          </td>
                          <td className="ref-cell">
                            <input className={`input input-sm${isForeign ? ' ref-foreign' : ''}`} list={`ref-${key}`} value={v} placeholder="nenasazen"
                              title={isForeign ? 'Není rozhodčím domácího družstva' : undefined}
                              onChange={(e) => { const val = e.target.value; update((a) => ({ ...a, [key]: val })); }} />
                            <datalist id={`ref-${key}`}>
                              {home.map((o) => <option key={`h${o}`} value={o}>domácí</option>)}
                              {away.filter((o) => !home.includes(o)).map((o) => <option key={`a${o}`} value={o}>hosté</option>)}
                            </datalist>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
