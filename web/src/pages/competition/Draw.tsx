import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, apiErrorText } from '../../lib/api';
import { czDate, REQUEST_KIND_LABEL, REQUEST_STATUS_LABEL } from '../../lib/format';
import type { TeamWithSummary } from '../../lib/types';
import {
  CONSTRAINT_LABEL, defaultDeadline, emptyNumbers, fixtures, numberProblems, sameClubGroups, suggestNumbers, table, tableSize, violations,
  type ConstraintKind, type DrawConstraint, type DrawInput,
} from '../../../../shared/draw/check';
import { matchStart, shortTime } from '../../../../shared/startTime';
import { useCompetition } from './CompetitionLayout';

// Draw meeting (M7): documents for the meeting, conditions of the controlled draw, draw numbers entered by the
// manager (the application never draws), the Berger draw and its rule checks. Printable (Tisk).
export function Draw() {
  const { data, refresh } = useCompetition();
  const c = data.competition;
  const active = data.teams.filter((t) => t.status === 'active');
  const size = tableSize(active.length);
  const deadline = c.mutual_deadline || defaultDeadline(c.season);
  const [error, setError] = useState<string | null>(null);
  // Numbers being tried (not saved yet); initialised from the teams.
  const saved = Object.fromEntries(active.map((t) => [t.id, t.draw_no ? String(t.draw_no) : '']));
  const [nums, setNums] = useState<Record<string, string>>(saved);
  const dirty = active.some((t) => (nums[t.id] ?? '') !== saved[t.id]);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try { await fn(); await refresh(); } catch (e) { setError(apiErrorText(e)); }
  };

  const teams = active.map((t) => ({ ...t, draw_no: Number(nums[t.id]) || null }));
  const input: DrawInput = {
    teams, constraints: data.constraints, deadline,
    roundDates: Array.from({ length: size - 1 }, (_, i) => data.rounds.find((r) => r.round === i + 1)?.date),
  };
  const assign = new Map(teams.filter((t) => t.draw_no).map((t) => [t.id, t.draw_no!]));
  const problems = numberProblems(teams);
  const viol = problems.length ? [] : violations(input, assign, emptyNumbers(teams));
  const key = JSON.stringify([nums, data.constraints, deadline]);
  const suggestion = useMemo(() => (problems.length ? null : suggestNumbers(input, 100_000)), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const complete = teams.every((t) => t.draw_no) && !problems.length;

  return (
    <>
      {error && <div className="alert">{error}</div>}
      <div className="row no-print" style={{ marginBottom: 12 }}>
        <span className="spacer" style={{ flex: 1 }} />
        <button className="btn" style={{ background: 'var(--paper)' }} onClick={() => window.print()}>Tisk / PDF</button>
      </div>
      <h2 className="print-only">{c.name} {c.season} — podklady pro losovací schůzi</h2>

      <Documents teams={active} deadline={deadline} />
      <Conditions teams={active} constraints={data.constraints} size={size} run={run} competitionId={c.id} />

      <div className="card">
        <div className="card-strip"><h2>Losovací čísla</h2>
          <span className="helper">Čísla 1–{size}{active.length % 2 ? ` (jedno číslo zůstane prázdné = volno)` : ''}. Aplikace nelosuje — zadejte vylosovaná čísla.</span></div>
        <div className="card-body table-scroll">
          <table className="table" style={{ maxWidth: 900 }}>
            <thead><tr><th>Družstvo</th><th>Číslo</th><th className="no-print">Řízené losování — čísla podle podmínek</th></tr></thead>
            <tbody>
              {active.map((t) => {
                const cost = suggestion?.cost.get(t.id);
                const ranked = cost ? [...cost.entries()].sort((a, b) => a[1] - b[1] || a[0] - b[0]) : [];
                return (
                  <tr key={t.id}>
                    <td>{t.name}</td>
                    <td style={{ width: 90 }}>
                      <input className="input input-sm mono no-print" style={{ width: 60 }} value={nums[t.id] ?? ''}
                        onChange={(e) => setNums({ ...nums, [t.id]: e.target.value.replace(/\D/g, '') })} />
                      <span className="print-only mono">{nums[t.id]}</span>
                    </td>
                    <td className="no-print">
                      {ranked.map(([no, v]) => (
                        <button key={no} type="button" className={`chip num-chip${v === suggestion!.best ? ' ok' : ''}`}
                          title={v === suggestion!.best ? 'nejlepší možné' : `horší o ${v - suggestion!.best}`}
                          onClick={() => setNums({ ...nums, [t.id]: String(no) })}>
                          {no}{v > suggestion!.best && <span className="muted">&nbsp;+{v - suggestion!.best}</span>}
                        </button>
                      ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="helper-text no-print">
            U družstev s podmínkou (nebo se stejným oddílem) a bez čísla jsou čísla seřazena od nejlepšího; zelená = splní podmínky co nejlépe,
            „+n“ = počet bodů porušení navíc. Kliknutím číslo zkusíte (uloží se až tlačítkem).
            {suggestion?.partial && ' Příliš mnoho družstev s podmínkami — hodnocení je jen přibližné.'}
          </p>
          {problems.map((p) => <div key={p} className="note warn">{p}</div>)}
          {viol.length > 0 && (
            <div className="note warn"><b>Porušená pravidla a podmínky</b>
              <ul className="list-plain">{viol.map((v, i) => <li key={i}>{v.text}</li>)}</ul></div>
          )}
          {!problems.length && !viol.length && assign.size > 0 && <div className="note">{complete ? 'Čísla splňují všechna pravidla a podmínky.' : 'Zatím zadaná čísla splňují pravidla a podmínky (hodnotí se jen družstva s číslem).'}</div>}
          <div className="row no-print" style={{ marginTop: 12 }}>
            <button className="btn btn-primary" disabled={!dirty || problems.length > 0}
              onClick={() => run(() => api.put(`/competitions/${c.id}/draw-numbers`, { numbers: Object.fromEntries(active.map((t) => [t.id, nums[t.id] || null])) }))}>
              Uložit čísla</button>
            <button className="btn" disabled={!dirty} onClick={() => setNums(saved)}>Vrátit uložená</button>
            <button className="btn" disabled={!Object.values(nums).some(Boolean)} onClick={() => setNums(Object.fromEntries(active.map((t) => [t.id, ''])))}>Vymazat vše</button>
            {dirty && <span className="tag warn">neuloženo</span>}
          </div>
        </div>
      </div>

      {complete ? <Schedule teams={teams} /> : (
        <div className="card"><div className="card-strip"><h2>Rozlosování</h2></div>
          <div className="card-body muted">Rozlosování se zobrazí, až budou mít všechna družstva platné losovací číslo.</div></div>
      )}
    </>
  );
}

function Documents({ teams, deadline }: { teams: TeamWithSummary[]; deadline: string }) {
  const { data } = useCompetition();
  const c = data.competition;
  const groups = sameClubGroups(teams);
  const reqs = (id: string) => data.requests.filter((r) => r.team_id === id);
  const general = data.requests.filter((r) => !r.team_id);
  return (
    <div className="card">
      <div className="card-strip"><h2>Podklady pro losovací schůzi</h2>
        <span className="helper">Výchozí začátek {shortTime(c.default_start)} · v posledním kole bez výjimek</span></div>
      <div className="card-body table-scroll">
        <table className="table">
          <thead><tr><th>#</th><th>Družstvo</th><th>Soupiska</th><th>Kapitán</th><th>Hrací místnost</th><th>Rozhodčí</th><th>Začátek</th><th>Požadavky</th></tr></thead>
          <tbody>
            {teams.map((t, i) => {
              const cap = t.contacts.find((x) => x.role === 'kapitan');
              const refs = t.contacts.filter((x) => x.role === 'rozhodci' && x.name);
              return (
                <tr key={t.id} style={{ verticalAlign: 'top' }}>
                  <td className="mono muted">{i + 1}.</td>
                  <td><Link to={`../t/${t.id}`} style={{ fontWeight: 600 }}>{t.name}</Link></td>
                  <td>{t.roster ? <span className="tag ok">{t.roster.players} hr.</span> : <span className="tag bad">chybí</span>}</td>
                  <td>{cap?.name ? <>{cap.name}<div className="muted mono" style={{ fontSize: 12 }}>{cap.phone}</div></> : <span className="tag bad">chybí</span>}</td>
                  <td style={{ maxWidth: 220 }}>{t.venue || <span className="tag warn">neuvedena</span>}</td>
                  <td>{refs.length ? refs.map((r) => r.name).join(', ') : <span className="muted">—</span>}</td>
                  <td className="mono" style={{ whiteSpace: 'nowrap' }}>
                    {t.start_home && <div>doma {shortTime(t.start_home)}</div>}
                    {t.start_away && <div>venku {shortTime(t.start_away)}</div>}
                  </td>
                  <td style={{ fontSize: 13 }}>
                    {reqs(t.id).map((r) => (
                      <div key={r.id}>
                        <span className={`tag${r.status === 'accepted' ? ' ok' : r.status === 'rejected' ? ' bad' : ''}`}>{REQUEST_STATUS_LABEL[r.status]}</span>{' '}
                        <span className="muted">{REQUEST_KIND_LABEL[r.kind]}:</span> {r.text}{r.decision && <span className="muted"> → {r.decision}</span>}
                      </div>
                    ))}
                  </td>
                </tr>
              );
            })}
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

const EMPTY_FORM = { team_id: '', kind: 'alternate' as ConstraintKind, round: '', value: '', other_team_id: '', ext_name: '', ext_no: '', ext_teams: '', note: '' };

function describe(c: DrawConstraint, name: (id: string | null) => string): string {
  switch (c.kind) {
    case 'draw_no': return `losovací číslo ${c.value}`;
    case 'home': return `doma v ${c.round}. kole`;
    case 'away': return `nehrát doma v ${c.round}. kole`;
    case 'meet': return `vzájemný zápas s ${name(c.other_team_id)} v ${c.round}. kole`;
    case 'alternate':
    case 'same': {
      const other = c.other_team_id ? name(c.other_team_id) : `${c.ext_name || 'družstvo jiné soutěže'} (č. ${c.ext_no} z ${c.ext_teams})`;
      return c.kind === 'alternate' ? `protičíslo k ${other}` : `souběžně s ${other}`;
    }
  }
}

function Conditions({ teams, constraints, size, run, competitionId }: {
  teams: TeamWithSummary[]; constraints: DrawConstraint[]; size: number; competitionId: string; run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const { data } = useCompetition();
  const [form, setForm] = useState(EMPTY_FORM);
  const name = (id: string | null) => data.teams.find((t) => t.id === id)?.name ?? '?';
  const k = form.kind;
  const needsRound = k === 'home' || k === 'away' || k === 'meet';
  const pattern = k === 'alternate' || k === 'same';
  const ext = pattern && !form.other_team_id;
  const ready = form.team_id && (k !== 'draw_no' || form.value) && (!needsRound || form.round) && (k !== 'meet' || form.other_team_id)
    && (!ext || (form.ext_no && form.ext_teams));
  const open = data.requests.filter((r) => r.kind !== 'start_time' && r.status !== 'rejected');

  return (
    <div className="card">
      <div className="card-strip"><h2>Podmínky řízeného losování</h2>
        <span className="helper">Strukturovaně zapsané požadavky; kontrolují se proti rozlosování.</span></div>
      <div className="card-body">
        {constraints.length ? (
          <table className="table" style={{ marginBottom: 12 }}>
            <tbody>
              {constraints.map((x) => (
                <tr key={x.id}>
                  <td style={{ width: 260, fontWeight: 600 }}>{name(x.team_id)}</td>
                  <td>{describe(x, name)}{x.note && <span className="muted"> — {x.note}</span>}</td>
                  <td className="actions no-print" style={{ width: 40 }}>
                    <button className="icon-btn" title="Smazat" onClick={() => run(() => api.delete(`/constraints/${x.id}`))}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="muted" style={{ marginTop: 0 }}>Žádné podmínky. Pravidlo o vzájemných zápasech stejného oddílu se kontroluje vždy.</p>}

        {open.length > 0 && (
          <div className="note no-print"><b>Požadavky k převedení na podmínky</b>
            <ul className="list-plain">{open.map((r) => (
              <li key={r.id}>{r.team_id ? name(r.team_id) : 'soutěž'}: „{r.text}“ <span className="muted">({REQUEST_STATUS_LABEL[r.status]})</span></li>
            ))}</ul></div>
        )}

        <form className="no-print" onSubmit={(e) => {
          e.preventDefault();
          run(async () => { await api.post(`/competitions/${competitionId}/constraints`, form); setForm({ ...EMPTY_FORM, kind: form.kind }); });
        }}>
          <div className="grid-4">
            <div className="field"><label>Družstvo</label>
              <select className="input" value={form.team_id} onChange={(e) => setForm({ ...form, team_id: e.target.value })}>
                <option value="">— vyberte —</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select></div>
            <div className="field"><label>Podmínka</label>
              <select className="input" value={k} onChange={(e) => setForm({ ...form, kind: e.target.value as ConstraintKind })}>
                {Object.entries(CONSTRAINT_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select></div>
            {k === 'draw_no' && (
              <div className="field"><label>Číslo (1–{size})</label>
                <input className="input mono" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value.replace(/\D/g, '') })} /></div>
            )}
            {needsRound && (
              <div className="field"><label>Kolo (1–{size - 1})</label>
                <input className="input mono" value={form.round} onChange={(e) => setForm({ ...form, round: e.target.value.replace(/\D/g, '') })} /></div>
            )}
            {(k === 'meet' || pattern) && (
              <div className="field"><label>{k === 'meet' ? 'Soupeř' : 'Druhé družstvo'}</label>
                <select className="input" value={form.other_team_id} onChange={(e) => setForm({ ...form, other_team_id: e.target.value })}>
                  <option value="">{pattern ? '— z jiné soutěže —' : '— vyberte —'}</option>
                  {teams.filter((t) => t.id !== form.team_id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select></div>
            )}
          </div>
          {ext && (
            <div className="grid-4" style={{ marginTop: 14 }}>
              <div className="field" style={{ gridColumn: 'span 2' }}><label>Družstvo jiné soutěže</label>
                <input className="input" value={form.ext_name} placeholder="např. Kralupy A (KP)" onChange={(e) => setForm({ ...form, ext_name: e.target.value })} /></div>
              <div className="field"><label>Jeho losovací číslo</label>
                <input className="input mono" value={form.ext_no} onChange={(e) => setForm({ ...form, ext_no: e.target.value.replace(/\D/g, '') })} /></div>
              <div className="field"><label>Počet družstev té soutěže</label>
                <input className="input mono" value={form.ext_teams} onChange={(e) => setForm({ ...form, ext_teams: e.target.value.replace(/\D/g, '') })} /></div>
            </div>
          )}
          <div className="row" style={{ marginTop: 14 }}>
            <input className="input" style={{ flex: 1, minWidth: 240 }} placeholder="Poznámka (nepovinné)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            <button className="btn btn-primary" disabled={!ready}>Přidat podmínku</button>
          </div>
          {ext && <p className="helper-text">Kola druhé soutěže se porovnávají podle čísla kola (předpokládá se stejný kalendář, např. KP a RP).</p>}
        </form>
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
