import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, apiErrorText } from '../../lib/api';
import { czDate, REQUEST_KIND_LABEL, REQUEST_STATUS_LABEL } from '../../lib/format';
import type { TeamWithSummary } from '../../lib/types';
import {
  conditionStates, defaultDeadline, drawConstraints, emptyNumbers, fixtures, numberProblems, sameClubGroups, suggestNumbers,
  table, tableSize, violations, type DrawInput,
} from '../../../../shared/draw/check';
import { matchStart, shortTime } from '../../../../shared/startTime';
import { useCompetition } from './CompetitionLayout';
import { requestSummary, RequestTable } from './RequestItems';

// Draw meeting (M7). Workflow: numbers start empty; requests (start times, draw conditions) are decided and
// completed during the meeting, numbers are filled in one by one as teams are drawn (each saved at once).
// The application never draws — it evaluates the conditions and ranks free numbers for a controlled draw.
export function Draw() {
  const { data, refresh } = useCompetition();
  const c = data.competition;
  const active = data.teams.filter((t) => t.status === 'active');
  const size = tableSize(active.length);
  const deadline = c.mutual_deadline || defaultDeadline(c.season);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState<Record<string, string>>({});

  const teams = active;
  const input: DrawInput = {
    teams, constraints: drawConstraints(data.requests), deadline,
    roundDates: Array.from({ length: size - 1 }, (_, i) => data.rounds.find((r) => r.round === i + 1)?.date),
  };
  const assign = new Map(teams.filter((t) => t.draw_no).map((t) => [t.id, t.draw_no!]));
  const problems = numberProblems(teams);
  const empty = emptyNumbers(teams);
  const viol = problems.length ? [] : violations(input, assign, empty);
  const states = conditionStates(input, assign, empty);
  const memoKey = JSON.stringify([teams.map((t) => t.draw_no), input.constraints, deadline]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const suggestion = useMemo(() => (problems.length ? null : suggestNumbers(input, 100_000)), [memoKey]);
  const complete = teams.every((t) => t.draw_no) && !problems.length;
  const used = new Set(assign.values());
  const free = Array.from({ length: size }, (_, i) => i + 1).filter((x) => !used.has(x));

  const save = async (numbers: Record<string, number | null>) => {
    setError(null);
    try { await api.put(`/competitions/${c.id}/draw-numbers`, { numbers }); await refresh(); } catch (e) { setError(apiErrorText(e)); }
    setTyped({});
  };
  const startReqs = data.requests.filter((r) => r.kind === 'start_time');
  const drawReqs = data.requests.filter((r) => r.kind === 'draw_no');
  const otherReqs = data.requests.filter((r) => r.kind !== 'start_time' && r.kind !== 'draw_no');
  const pairs = sameClubGroups(teams).flatMap((g) => g.flatMap((x, i) => g.slice(i + 1).map((y) => [x, y] as const)));
  const unresolved = [...states.values()].filter((x) => x.state === 'unresolved').length;

  return (
    <>
      {error && <div className="alert">{error}</div>}
      <div className="row no-print" style={{ marginBottom: 12 }}>
        <span className="spacer" style={{ flex: 1 }} />
        <button className="btn" style={{ background: 'var(--paper)' }} onClick={() => window.print()}>Tisk / PDF</button>
      </div>
      <h2 className="print-only">{c.name} {c.season} — podklady pro losovací schůzi</h2>

      <Documents teams={active} deadline={deadline} />

      <div className="card no-print">
        <div className="card-strip"><h2>Začátky utkání</h2>
          <span className="helper">Schvaluje se na losovací schůzi; schválený požadavek = výjimka v rozlosování (kromě posledního kola).</span></div>
        <div className="card-body table-scroll">
          {startReqs.length ? <RequestTable requests={startReqs} showKind={false} /> : <p className="muted" style={{ margin: 0 }}>Žádné požadavky na začátek utkání.</p>}
        </div>
      </div>

      <div className="card no-print">
        <div className="card-strip"><h2>Požadavky na losování</h2>
          <span className="helper">Upřesněte během schůze; neúplné = nevyřešeno{unresolved ? ` (${unresolved})` : ''}. Zamítnuté se nekontrolují.</span></div>
        <div className="card-body table-scroll">
          {drawReqs.length ? <RequestTable requests={drawReqs} states={states} showKind={false} /> : <p className="muted" style={{ marginTop: 0 }}>Žádné požadavky na losování (přidávají se na záložce Požadavky nebo u družstva).</p>}
          <div className="section-title">Pravidlo: družstva stejného oddílu se utkají do {czDate(deadline)}</div>
          {pairs.length ? (
            <ul className="list-plain">
              {pairs.map(([x, y]) => {
                const v = viol.find((q) => q.constraintId == null && q.teams.includes(x.id) && q.teams.includes(y.id));
                const done = assign.has(x.id) && assign.has(y.id);
                const r = done ? table(size).meeting(x.draw_no!, y.draw_no!).round : null;
                return (
                  <li key={x.id + y.id}>{x.name} – {y.name}{' '}
                    {v ? <span className="tag bad">{v.text}</span> : done ? <span className="tag ok">{r}. kolo — splněno</span> : <span className="tag">čeká na losovací čísla</span>}
                  </li>
                );
              })}
            </ul>
          ) : <p className="muted" style={{ margin: 0 }}>Ve skupině nejsou družstva stejného oddílu.</p>}
        </div>
      </div>

      {otherReqs.length > 0 && (
        <div className="card no-print">
          <div className="card-strip"><h2>Ostatní požadavky</h2></div>
          <div className="card-body table-scroll"><RequestTable requests={otherReqs} /></div>
        </div>
      )}

      <div className="card">
        <div className="card-strip"><h2>Losovací čísla</h2>
          <span className="helper">Čísla 1–{size}{active.length % 2 ? ' (jedno zůstane prázdné = volno)' : ''}. Zadávejte postupně, jak se losuje — každé se hned uloží.</span></div>
        <div className="card-body table-scroll">
          <table className="table" style={{ maxWidth: 960 }}>
            <thead><tr><th>Družstvo</th><th>Číslo</th><th className="no-print">Řízené losování — čísla podle požadavků</th></tr></thead>
            <tbody>
              {teams.map((t) => {
                const cost = suggestion?.cost.get(t.id);
                const ranked = cost ? [...cost.entries()].sort((a, b) => a[1] - b[1] || a[0] - b[0]) : [];
                const cur = typed[t.id] ?? (t.draw_no ? String(t.draw_no) : '');
                return (
                  <tr key={t.id}>
                    <td>{t.name}</td>
                    <td style={{ width: 90 }}>
                      <input className="input input-sm mono no-print" style={{ width: 60 }} value={cur}
                        onChange={(e) => setTyped({ ...typed, [t.id]: e.target.value.replace(/\D/g, '') })}
                        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                        onBlur={() => (Number(cur) || null) !== t.draw_no && save({ [t.id]: Number(cur) || null })} />
                      <span className="print-only mono">{t.draw_no ?? ''}</span>
                    </td>
                    <td className="no-print">
                      {ranked.map(([no, v]) => (
                        <button key={no} type="button" className={`chip num-chip${v === suggestion!.best ? ' ok' : ''}`}
                          title={v === suggestion!.best ? 'nejlepší možné' : `horší o ${v - suggestion!.best}`}
                          onClick={() => window.confirm(`Přidělit družstvu ${t.name} číslo ${no}?`) && save({ [t.id]: no })}>
                          {no}{v > suggestion!.best && <span className="muted">&nbsp;+{v - suggestion!.best}</span>}
                        </button>
                      ))}
                      {!t.draw_no && !cost && <span className="muted" style={{ fontSize: 12.5 }}>bez požadavků — volná: {free.join(', ')}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="helper-text no-print">
            U družstev s požadavkem na losování (nebo se stejným oddílem) bez čísla jsou volná čísla seřazena od nejlepšího:
            zelená = požadavky splněny co nejlépe, „+n“ = body porušení navíc. Nevyřešené požadavky se nezapočítávají.
            {suggestion?.partial && ' Příliš mnoho družstev s požadavky — hodnocení je jen přibližné.'}
          </p>
          {problems.map((p) => <div key={p} className="note warn">{p}</div>)}
          {viol.length > 0 && (
            <div className="note warn"><b>Porušená pravidla a požadavky</b>
              <ul className="list-plain">{viol.map((v, i) => <li key={i}>{v.text}</li>)}</ul></div>
          )}
          <div className="row no-print" style={{ marginTop: 12 }}>
            <button className="btn" disabled={!assign.size}
              onClick={() => window.confirm('Vymazat všechna losovací čísla?') && save(Object.fromEntries(teams.map((t) => [t.id, null])))}>Vymazat všechna čísla</button>
          </div>
        </div>
      </div>

      {complete ? <Schedule teams={teams} /> : (
        <div className="card"><div className="card-strip"><h2>Rozlosování</h2></div>
          <div className="card-body muted">Rozlosování se zobrazí, až budou mít všechna družstva losovací číslo.</div></div>
      )}
    </>
  );
}

function Documents({ teams, deadline }: { teams: TeamWithSummary[]; deadline: string }) {
  const { data } = useCompetition();
  const c = data.competition;
  const groups = sameClubGroups(teams);
  const name = (id: string | null) => data.teams.find((t) => t.id === id)?.name ?? '?';
  const reqs = (id: string) => data.requests.filter((r) => r.team_id === id);
  const general = data.requests.filter((r) => !r.team_id);
  return (
    <div className="card">
      <div className="card-strip"><h2>Podklady pro losovací schůzi</h2>
        <span className="helper">Výchozí začátek {shortTime(c.default_start)} · v posledním kole bez výjimek</span></div>
      <div className="card-body table-scroll">
        <table className="table">
          <thead><tr><th style={{ width: 40 }}>#</th><th style={{ width: 280 }}>Družstvo</th><th>Požadavky</th></tr></thead>
          <tbody>
            {teams.map((t, i) => (
              <tr key={t.id} style={{ verticalAlign: 'top' }}>
                <td className="mono muted">{i + 1}.</td>
                <td><Link to={`../t/${t.id}`} style={{ fontWeight: 600 }}>{t.name}</Link></td>
                <td style={{ fontSize: 13.5 }}>
                  {reqs(t.id).map((r) => (
                    <div key={r.id} style={{ marginBottom: 3 }}>
                      <span className="req-kind">{REQUEST_KIND_LABEL[r.kind]}</span>{requestSummary(r, name)}{' '}
                      {r.text && r.text !== requestSummary(r, name) && <span className="muted">(„{r.text}“)</span>}{' '}
                      <span className={`tag${r.status === 'accepted' ? ' ok' : r.status === 'rejected' ? ' bad' : ''}`}>{REQUEST_STATUS_LABEL[r.status]}</span>
                      {r.decision && <span className="muted"> → {r.decision}</span>}
                    </div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {general.length > 0 && (
          <><div className="section-title">Požadavky k celé soutěži</div>
            <ul className="list-plain">{general.map((r) => <li key={r.id}>{REQUEST_KIND_LABEL[r.kind]}: {r.text} ({REQUEST_STATUS_LABEL[r.status]})</li>)}</ul></>
        )}
        <div className="section-title">Družstva stejného oddílu</div>
        {groups.length
          ? <ul className="list-plain">{groups.map((g) => <li key={g[0].id}>{g.map((t) => t.name).join(', ')} — vzájemné zápasy do {czDate(deadline)}</li>)}</ul>
          : <p className="muted" style={{ margin: 0 }}>Žádná.</p>}
        {teams.some((t) => !t.club_code && !t.club_name) && (
          <p className="helper-text">Některá družstva nemají spárovaný oddíl — mohou chybět ve skupinách stejného oddílu.</p>
        )}
      </div>
    </div>
  );
}

function Schedule({ teams }: { teams: (TeamWithSummary & { draw_no: number | null })[] }) {
  const { data } = useCompetition();
  const c = data.competition;
  const byId = new Map(teams.map((t) => [t.id, t]));
  const rounds = fixtures(teams);
  const empty = emptyNumbers(teams);
  const T = table(tableSize(teams.length));
  const dateOf = (r: number) => data.rounds.find((x) => x.round === r)?.date;
  const sorted = [...teams].sort((a, b) => a.draw_no! - b.draw_no!);
  const missingDates = rounds.length > data.rounds.length;

  return (
    <div className="card">
      <div className="card-strip"><h2>Rozlosování</h2><span className="helper">Bergerovy tabulky, {rounds.length} kol</span></div>
      <div className="card-body table-scroll">
        {missingDates && <div className="note warn">Kalendář má jen {data.rounds.length} termínů, rozlosování {rounds.length} kol.</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '6px 28px' }}>
          {rounds.map((ms, r) => {
            const last = r === rounds.length - 1;
            return (
              <div key={r} style={{ breakInside: 'avoid' }}>
                <div className="section-title" style={{ marginTop: 14 }}>{r + 1}. kolo {dateOf(r + 1) && <span className="muted">— {czDate(dateOf(r + 1), true)}</span>}</div>
                <table className="table" style={{ fontSize: 13.5 }}>
                  <tbody>
                    {ms.map((m) => {
                      const h = m.home ? byId.get(m.home)! : null;
                      const a = m.away ? byId.get(m.away)! : null;
                      if (!h || !a) {
                        const t = h ?? a;
                        return t ? <tr key={m.board}><td colSpan={3} className="muted">{t.name} — volno</td></tr> : null;
                      }
                      const st = matchStart(h, a, c.default_start, last);
                      return (
                        <tr key={m.board}>
                          <td><span className="mono muted">{h.draw_no}</span> {h.name}</td>
                          <td><span className="mono muted">{a.draw_no}</span> {a.name}</td>
                          <td className="mono" style={{ whiteSpace: 'nowrap', width: 60 }}>
                            {st.conflict ? <span className="tag bad" title="Domácí a hosté mají různé výjimky">???</span>
                              : st.exception ? <b>{shortTime(st.time)}</b> : <span className="muted">{shortTime(st.time)}</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>

        <div className="section-title">Doma / venku po kolech</div>
        <table className="table pattern" style={{ width: 'auto' }}>
          <thead><tr><th style={{ textAlign: 'left' }}>Družstvo</th>{rounds.map((_, r) => <th key={r}>{r + 1}</th>)}</tr></thead>
          <tbody>
            {sorted.map((t) => (
              <tr key={t.id}>
                <td style={{ textAlign: 'left', fontFamily: 'var(--sans)', fontWeight: 500 }}><span className="mono muted">{t.draw_no}</span> {t.name}</td>
                {T.homes(t.draw_no!, empty).map((h, r) => <td key={r} className={h ? 'h' : ''}>{h === null ? '–' : h ? 'D' : 'V'}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="helper-text">D = doma, V = venku, – = volno. Tučný čas = výjimka ze začátku; ??? = domácí i hosté mají různou výjimku (rozhodnout na schůzi).</p>
      </div>
    </div>
  );
}
