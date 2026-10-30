import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorText } from '../../lib/api';
import { czDate, czDateTime } from '../../lib/format';
import { useCompetition } from './CompetitionLayout';
import { loadChesscz } from '../../bulletin/load';
import { competitionSchedule, refKey, rotatedReferees, sameName, scheduleRounds, teamReferees } from '../../../../shared/schedule';
import { CONFLICT } from '../../../../shared/bulletin/initial';

type Assignments = Record<string, string>;
type Source = 'manual' | 'auto' | 'clear' | 'restore';
type Version = { version: number; source: Source; created_at: number; count: number };
type RefsResponse = {
  assignments: Assignments; version: number; versions: Version[];
  initialSavepoints: { count: number; last: { label: string; created_at: number } | null };
};
const SOURCE_LABEL: Record<Source, string> = { manual: 'ruční úprava', auto: 'automatická nominace', clear: 'smazání', restore: 'obnovení verze' };

// Nominace rozhodčích: one referee per match. Read-only by default; Upravit → edit (automatic rotation of the home
// team's referees, manual edits) → Uložit creates a new version (history as with the rosters). The bulletins take
// the referees from here; the public schedule shows them.
export function Referees() {
  const { data: detail, refresh } = useCompetition();
  const c = detail.competition;
  const qc = useQueryClient();
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);

  const stored = useQuery({ queryKey: ['referees', c.id], queryFn: () => api.get<RefsResponse>(`/competitions/${c.id}/referees`) });
  const cz = useQuery({
    queryKey: ['schedule-cz', c.id, c.chesscz_comp_id],
    queryFn: () => loadChesscz(c.chesscz_comp_id, setProgress, false),
    staleTime: 10 * 60_000,
  });

  // Viewing an older version (null = the current one); editing works on a local copy until Uložit.
  const [viewVersion, setViewVersion] = useState<number | null>(null);
  const old = useQuery({
    queryKey: ['referees', c.id, 'version', viewVersion],
    queryFn: () => api.get<{ assignments: Assignments }>(`/competitions/${c.id}/referees/versions/${viewVersion}`),
    enabled: viewVersion != null,
  });
  const [draft, setDraft] = useState<{ refs: Assignments; source: Source; base: number; dirty: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!draft?.dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [draft?.dirty]);

  const active = useMemo(() => detail.teams.filter((t) => t.status === 'active'), [detail.teams]);
  const sched = useMemo(
    () => (cz.data ? competitionSchedule(active, cz.data, new Map(detail.rounds.map((r) => [r.round, r.date])), true) : null),
    [cz.data, active, detail.rounds],
  );
  const rounds = useMemo(() => (sched ? scheduleRounds(sched, c.default_start, c.last_start) : []), [sched, c.default_start, c.last_start]);
  const team = useMemo(() => new Map((sched?.teams ?? []).map((t) => [t.key, t])), [sched]);
  const refsOf = (key: string) => teamReferees(team.get(key)?.app?.contacts ?? []);

  if (stored.isLoading) return <div className="muted">Načítám…</div>;
  if (stored.error || !stored.data) return <div className="alert">{apiErrorText(stored.error)}</div>;
  const st = stored.data;
  const editing = !!draft;
  const viewingOld = !editing && viewVersion != null && viewVersion !== st.version;
  const refs: Assignments = draft?.refs ?? (viewingOld ? old.data?.assignments ?? {} : st.assignments);

  // The úvodní zpravodaj reads the referees from here: once it has a save point, every change asks first.
  const sp = st.initialSavepoints;
  const spWarning = sp.count
    ? `Úvodní zpravodaj už má save point${sp.last ? ` (${sp.last.label ? `„${sp.last.label}“, ` : ''}${czDateTime(sp.last.created_at)})` : ''}. `
      + 'Rozhodčí se do zpravodaje berou odsud — změna nominací se v něm projeví.'
    : '';
  const ask = (text: string) => window.confirm(spWarning ? `${text}\n\n${spWarning}` : text);

  const startEdit = () => {
    if (spWarning && !window.confirm(`${spWarning}\n\nUpravit nominace?`)) return;
    setError(null);
    setViewVersion(null);
    setDraft({ refs: { ...st.assignments }, source: 'manual', base: st.version, dirty: false });
  };
  const cancelEdit = () => {
    if (draft?.dirty && !window.confirm('Zahodit neuložené změny nominací?')) return;
    setDraft(null);
  };
  const setRefs = (refs: Assignments, source: Source) => setDraft((d) => (d ? { ...d, refs, source, dirty: true } : d));
  const put = async (assignments: Assignments, source: Source, base: number) => {
    setSaving(true);
    setError(null);
    try {
      await api.put(`/competitions/${c.id}/referees`, { assignments, source, base });
      await qc.invalidateQueries({ queryKey: ['referees', c.id] });
      return true;
    } catch (e) {
      setError(apiErrorText(e) ?? 'Uložení se nepodařilo');
      return false;
    } finally {
      setSaving(false);
    }
  };
  const save = async () => {
    if (draft && (await put(draft.refs, draft.source, draft.base))) setDraft(null);
  };
  const restore = async () => {
    if (viewVersion == null || !old.data) return;
    if (!ask(`Obnovit verzi ${viewVersion}? Vznikne z ní nová verze nominací, dosavadní zůstane v historii.`)) return;
    if (await put(old.data.assignments, 'restore', st.version)) setViewVersion(null);
  };

  const autoAssign = () => {
    if (!sched || !draft) return;
    if (!ask('Automatická nominace přepíše všechny nominované rozhodčí (i ruční úpravy). Pokračovat?')) return;
    const rot = rotatedReferees({ teams: sched.teams.map((t) => ({ key: t.key, contacts: t.app?.contacts ?? [] })), rounds: sched.rounds });
    setRefs(Object.fromEntries(rot), 'auto');
  };
  const clearAll = () => {
    if (ask('Smazat všechny nominované rozhodčí?')) setRefs({}, 'clear');
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
  const publicUrl = `${location.origin}/rozpis/${c.id}`;
  const cur = st.versions[0];
  const shown = viewingOld ? st.versions.find((v) => v.version === viewVersion) : cur;

  return (
    <>
      <div className="grid-2">
        <div className="card">
          <div className="card-strip">
            <h2>Nominace rozhodčích</h2>
            {editing
              ? <span className={`tag${draft.dirty ? '' : ' ok'}`}>{draft.dirty ? 'neuloženo' : 'beze změn'}</span>
              : shown && <span className="helper">verze {shown.version} · {czDateTime(shown.created_at)} · {SOURCE_LABEL[shown.source] ?? shown.source}</span>}
          </div>
          <div className="card-body">
            <div className="bulletin-bar">
              {editing ? (
                <>
                  <button className="btn btn-primary" disabled={saving || !draft.dirty} onClick={save}>{saving ? 'Ukládám…' : 'Uložit'}</button>
                  <button className="btn" disabled={saving} onClick={cancelEdit}>Zrušit</button>
                  <button className="btn" disabled={!rounds.length} onClick={autoAssign}>Nominovat automaticky</button>
                  <button className="btn" disabled={!assigned} onClick={clearAll}>Smazat nominace</button>
                </>
              ) : (
                <>
                  {viewingOld
                    ? <button className="btn btn-primary" disabled={saving || !old.data} onClick={restore}>Obnovit tuto verzi</button>
                    : <button className="btn btn-primary" disabled={!rounds.length} onClick={startEdit}>Upravit</button>}
                  {st.versions.length > 0 && (
                    <select className="input input-sm" style={{ width: 'auto', minWidth: 0 }} value={viewVersion ?? st.version} aria-label="Verze nominací"
                      onChange={(e) => { const v = Number(e.target.value); setViewVersion(v === st.version ? null : v); }}>
                      {st.versions.map((v) => (
                        <option key={v.version} value={v.version}>
                          verze {v.version} · {czDateTime(v.created_at)} · {SOURCE_LABEL[v.source] ?? v.source} · {v.count} utk.{v.version === st.version ? ' (aktuální)' : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </>
              )}
            </div>
            {spWarning && (editing || viewingOld) && <div className="warn">! {spWarning}</div>}
            {viewingOld && <div className="warn">! Zobrazena starší verze {viewVersion} — jen ke čtení. Aktuální je verze {st.version}.</div>}
            <p className="helper-text">
              {editing ? <>
                Automaticky se domácím utkáním každého družstva střídají jeho rozhodčí ze soupisky (v pořadí kontaktů).
                Rozhodčího lze přepsat ručně — vybrat rozhodčího domácích nebo hostů, nebo napsat libovolné jméno.
                Uložení vytvoří novou verzi, předchozí zůstávají v historii.
              </> : <>Nominace se mění tlačítkem Upravit; každé uložení je nová verze (historie v rozbalovacím seznamu).</>}
              <span className="ref-foreign"> Červeně</span> je rozhodčí, který není rozhodčím domácího družstva.
              Zpravodaje přebírají rozhodčí odsud.
            </p>
            {rounds.length > 0 && (
              <p className="helper-text">
                Rozlosování: {sched?.source === 'chesscz' ? 'chess.cz' : 'z aplikace (losovací čísla → Berger), na chess.cz zatím není'}.
                {' '}Nominováno {assigned} z {total} utkání{foreign ? `, z toho ${foreign} mimo domácí rozhodčí` : ''}.
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
                          <td className="ref-match">
                            {/* each team on one line; a long pair breaks only after the dash */}
                            <span className="ref-team">{team.get(m.home)?.name ?? '?'}
                              {m.exception && <span className="ref-time"> {m.conflict ? CONFLICT : `${m.time} h`}</span>}
                              <span className="muted"> –</span></span>{' '}
                            <span className="ref-team">{team.get(m.away)?.name ?? '?'}</span>
                          </td>
                          <td className="ref-cell">
                            {editing ? (
                              <>
                                <input className={`input input-sm${isForeign ? ' ref-foreign' : ''}`} list={`ref-${key}`} value={v} placeholder="nenominován"
                                  title={isForeign ? 'Není rozhodčím domácího družstva' : undefined}
                                  onChange={(e) => { const val = e.target.value; setRefs({ ...draft.refs, [key]: val }, 'manual'); }} />
                                <datalist id={`ref-${key}`}>
                                  {home.map((o) => <option key={`h${o}`} value={o}>domácí</option>)}
                                  {away.filter((o) => !home.includes(o)).map((o) => <option key={`a${o}`} value={o}>hosté</option>)}
                                </datalist>
                              </>
                            ) : v.trim()
                              ? <span className={isForeign ? 'ref-foreign' : undefined} title={isForeign ? 'Není rozhodčím domácího družstva' : undefined}>{v}</span>
                              : <span className="muted">nenominován</span>}
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
