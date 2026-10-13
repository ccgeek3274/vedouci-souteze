import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, apiErrorText } from '../../lib/api';
import { REQUEST_KIND_LABEL, REQUEST_STATUS_LABEL } from '../../lib/format';
import type { Request } from '../../lib/types';
import { normRounds, normTime, roundsText, shortTime } from '../../../../shared/startTime';
import { CONSTRAINT_LABEL, describeDraw, drawConstraints, manualResolution, tableSize, type ConditionState, type ConstraintKind } from '../../../../shared/draw/check';
import { useCompetition } from './CompetitionLayout';

// Requests shared by the Požadavky tab, the team page and the Losování tab: read-only rows with an "Upravit"
// button opening one form (the same fields as a new request). Draw requests (kind draw_no) carry a structured
// condition; every part is optional and can be completed at the meeting — incomplete = "nevyřešeno".

export const STATE_CLASS: Record<ConditionState['state'], string> = { ok: 'ok', violated: 'bad', unresolved: 'warn', waiting: '' };
const STATUS_CLASS: Record<string, string> = { new: '', accepted: 'ok', rejected: 'bad' };

/** Editable fields of a request (form state: numbers as strings). */
type Draft = {
  team_id: string; kind: string; status: string; text: string; decision: string; time: string; side: string; skip_rounds: string;
  draw_kind: string; value: string; round: string; other_team_id: string; ext_name: string; ext_no: string; ext_teams: string;
  resolved: boolean;
};
const str = (v: number | null | undefined) => (v == null ? '' : String(v));
const num = (v: string) => (v ? Number(v) : null);

function toDraft(r: Request): Draft {
  return {
    team_id: r.team_id ?? '', kind: r.kind, status: r.status, text: r.text, decision: r.decision, time: r.time ?? '', side: r.side ?? 'home', skip_rounds: r.skip_rounds ?? '',
    draw_kind: r.draw_kind ?? '', value: str(r.value), round: str(r.round), other_team_id: r.other_team_id ?? '',
    ext_name: r.ext_name ?? '', ext_no: str(r.ext_no), ext_teams: str(r.ext_teams), resolved: !!r.resolved,
  };
}
const EMPTY: Draft = {
  team_id: '', kind: 'draw_no', status: 'new', text: '', decision: '', time: '10:00', side: 'home', skip_rounds: '',
  draw_kind: '', value: '', round: '', other_team_id: '', ext_name: '', ext_no: '', ext_teams: '', resolved: false,
};

/** API body from the form. */
function toBody(d: Draft) {
  return {
    team_id: d.team_id || undefined, kind: d.kind, status: d.status, text: d.text.trim(), decision: d.decision.trim(), resolved: d.resolved ? 1 : 0,
    ...(d.kind === 'start_time' ? { time: d.time || null, side: d.side, skip_rounds: d.skip_rounds } : {}),
    ...(d.kind === 'draw_no' ? {
      draw_kind: d.draw_kind || null, value: num(d.value), round: num(d.round), other_team_id: d.other_team_id || null,
      ext_name: d.ext_name.trim(), ext_no: num(d.ext_no), ext_teams: num(d.ext_teams),
    } : {}),
  };
}

/** State of a request that cannot be checked automatically (null = checked automatically or rejected). */
export function manualState(r: Request): ConditionState | null {
  if (!manualResolution(r) || r.status === 'rejected') return null;
  return r.resolved ? { state: 'ok', text: 'vyřešeno' } : { state: 'unresolved', text: 'nevyřešeno' };
}

/** One-line description of a request. */
export function requestSummary(r: Request, name: (id: string | null) => string): string {
  if (r.kind === 'start_time') {
    if (!r.time) return 'Začátek utkání — chybí čas';
    const skip = roundsText(r.skip_rounds);
    return `${r.side === 'away' ? 'Utkání venku' : 'Domácí utkání'} v ${shortTime(r.time)}${skip ? ` (neplatí v ${skip})` : ''}`;
  }
  if (r.kind === 'draw_no') {
    const [c] = drawConstraints([{ ...r, status: 'new', team_id: r.team_id ?? '' }]);
    const s = c?.kind ? describeDraw(c, name) : 'druh neurčen';
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  return r.text;
}

function RequestFields({ d, set, withTeam, withStatus }: { d: Draft; set: (p: Partial<Draft>) => void; withTeam: boolean; withStatus: boolean }) {
  const { data } = useCompetition();
  const active = data.teams.filter((t) => t.status === 'active');
  const size = tableSize(active.length);
  const k = d.draw_kind as ConstraintKind | '';
  const pattern = k === 'alternate' || k === 'same';
  const digits = (key: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) => set({ [key]: e.target.value.replace(/\D/g, '') });
  const needsTeam = d.kind === 'start_time' || d.kind === 'draw_no';
  return (
    <div className="form-grid">
      {withTeam && (
        <div className="field span-2"><label>Družstvo</label>
          <select className="input input-sm" value={d.team_id} onChange={(e) => set({ team_id: e.target.value })}>
            <option value="">{needsTeam ? '— vyberte družstvo —' : '— celá soutěž —'}</option>
            {active.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select></div>
      )}
      <div className="field"><label>Typ</label>
        <select className="input input-sm" value={d.kind} onChange={(e) => set({ kind: e.target.value })}>
          {Object.entries(REQUEST_KIND_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select></div>
      {withStatus && d.kind !== 'start_time' && (
        <div className="field"><label>Stav</label>
          <select className="input input-sm" value={d.status} onChange={(e) => set({ status: e.target.value })}>
            {Object.entries(REQUEST_STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select></div>
      )}

      {d.kind === 'start_time' && (
        <>
          <div className="field"><label>Utkání</label>
            <select className="input input-sm" value={d.side} onChange={(e) => set({ side: e.target.value })}>
              <option value="home">domácí</option>
              <option value="away">venku</option>
            </select></div>
          <div className="field"><label>Začátek</label>
            <input type="time" className="input input-sm mono" value={d.time} onChange={(e) => set({ time: e.target.value })} /></div>
          <div className="field"><label>Neplatí v kolech</label>
            <input className="input input-sm mono" placeholder="např. 3, 7" value={d.skip_rounds} onChange={(e) => set({ skip_rounds: e.target.value })} />
            {normRounds(d.skip_rounds) === null && <span className="tag bad">jen čísla kol</span>}</div>
          {withStatus && (
            <div className="field"><label>Schválení</label>
              <label className="row" style={{ gap: 6, height: 32 }}>
                <input type="checkbox" checked={d.status === 'accepted'} onChange={(e) => set({ status: e.target.checked ? 'accepted' : 'new' })} />
                Výjimka schválena{d.status === 'rejected' && <span className="tag bad">zamítnuto</span>}
              </label></div>
          )}
          <div className="field full"><span className="helper-text" style={{ margin: 0 }}>
            Schválená výjimka platí ve všech kolech kromě uvedených. V posledním kole neplatí nikdy — všechna utkání začínají ve výchozí čas, případně v začátek posledního kola z údajů soutěže.
          </span></div>
        </>
      )}

      {d.kind === 'draw_no' && (
        <>
          <div className="field span-2"><label>Podmínka losování</label>
            <select className="input input-sm" value={k} onChange={(e) => set({ draw_kind: e.target.value })}>
              <option value="">— zatím neurčeno —</option>
              {Object.entries(CONSTRAINT_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select></div>
          {k === 'draw_no' && (
            <div className="field"><label>Číslo (1–{size})</label>
              <input className="input input-sm mono" value={d.value} onChange={digits('value')} /></div>
          )}
          {(k === 'home' || k === 'away' || k === 'meet') && (
            <div className="field"><label>Kolo (1–{size - 1})</label>
              <input className="input input-sm mono" value={d.round} onChange={digits('round')} /></div>
          )}
          {(k === 'meet' || pattern) && (
            <div className="field span-2"><label>{k === 'meet' ? 'Soupeř' : 'Druhé družstvo'}</label>
              <select className="input input-sm" value={d.other_team_id} onChange={(e) => set({ other_team_id: e.target.value })}>
                <option value="">{pattern ? '— družstvo jiné soutěže —' : '— zatím neurčen —'}</option>
                {active.filter((t) => t.id !== d.team_id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select></div>
          )}
          {pattern && !d.other_team_id && (
            <>
              <div className="field span-2"><label>Družstvo jiné soutěže</label>
                <input className="input input-sm" placeholder="např. Kralupy A (KP)" value={d.ext_name} onChange={(e) => set({ ext_name: e.target.value })} /></div>
              <div className="field"><label>Jeho los. číslo</label>
                <input className="input input-sm mono" placeholder="upřesní se" value={d.ext_no} onChange={digits('ext_no')} /></div>
              <div className="field"><label>Družstev v soutěži</label>
                <input className="input input-sm mono" value={d.ext_teams} onChange={digits('ext_teams')} /></div>
            </>
          )}
        </>
      )}

      <div className="field full"><label>{d.kind === 'start_time' || d.kind === 'draw_no' ? 'Původní text / poznámka' : 'Text požadavku'}</label>
        <input className="input input-sm" value={d.text} onChange={(e) => set({ text: e.target.value })}
          placeholder={d.kind === 'draw_no' ? 'např. protičíslo ke Kralupy A (KP)' : d.kind === 'start_time' ? 'nepovinné' : 'např. přeložení 3. kola'} /></div>
      {withStatus && manualResolution({ kind: d.kind, draw_kind: d.draw_kind || null }) && (
        <div className="field full"><label>Vyřešení (nelze ověřit automaticky)</label>
          <div className="segmented">
            <button type="button" className={!d.resolved ? 'active warn' : ''} onClick={() => set({ resolved: false })}>Nevyřešeno</button>
            <button type="button" className={d.resolved ? 'active ok' : ''} onClick={() => set({ resolved: true })}>Vyřešeno</button>
          </div></div>
      )}
      {withStatus && (
        <div className="field full"><label>Rozhodnutí / poznámka vedoucího</label>
          <input className="input input-sm" value={d.decision} onChange={(e) => set({ decision: e.target.value })} /></div>
      )}
    </div>
  );
}

function RequestEdit({ r, onClose }: { r: Request; onClose: () => void }) {
  const { refresh } = useCompetition();
  const [d, setD] = useState(() => toDraft(r));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setError(null);
    setBusy(true);
    try {
      const { team_id: _team, ...body } = toBody(d);
      await api.patch(`/requests/${r.id}`, body);
      await refresh();
      onClose();
    } catch (e) {
      setError(apiErrorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="req-edit">
      {error && <div className="alert">{error}</div>}
      <RequestFields d={d} set={(p) => setD({ ...d, ...p })} withTeam={false} withStatus />
      <div className="row" style={{ marginTop: 14, justifyContent: 'flex-end' }}>
        <button className="btn btn-small" onClick={onClose} disabled={busy}>Zrušit</button>
        <button className="btn btn-small btn-primary" onClick={save} disabled={busy || (d.kind === 'start_time' && (!normTime(d.time) || normRounds(d.skip_rounds) === null))}>Uložit</button>
      </div>
    </div>
  );
}

/** Requests as read-only rows; "Upravit" opens the form. `states` = evaluation of draw conditions (Losování tab). */
export function RequestTable({ requests, showTeam = true, showKind = true, states }: {
  requests: Request[]; showTeam?: boolean; showKind?: boolean; states?: Map<number, ConditionState>;
}) {
  const { data, refresh } = useCompetition();
  const [editing, setEditing] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const name = (id: string | null) => data.teams.find((t) => t.id === id)?.name ?? '?';
  const remove = async (r: Request) => {
    if (!window.confirm('Smazat požadavek?')) return;
    setError(null);
    try { await api.delete(`/requests/${r.id}`); await refresh(); } catch (e) { setError(apiErrorText(e)); }
  };

  return (
    <div className="req-list">
      {error && <div className="alert">{error}</div>}
      {requests.map((r) => {
        const st = states?.get(r.id) ?? manualState(r);
        const summary = requestSummary(r, name);
        return (
          <div key={r.id} className={`req-row${showTeam ? ' with-team' : ''}`}>
            {showTeam && (
              <div className="req-team">{r.team_id ? <Link to={`../t/${r.team_id}`}>{name(r.team_id)}</Link> : <span className="muted">celá soutěž</span>}</div>
            )}
            <div className="req-main">
              <div>{showKind && <span className="req-kind">{REQUEST_KIND_LABEL[r.kind]}</span>}{summary}</div>
              {r.text && r.text !== summary && (
                <div className="req-sub">„{r.text}“{r.source === 'roster' && <span className="muted"> · ze soupisky</span>}</div>
              )}
              {r.decision && <div className="req-sub">Rozhodnutí: {r.decision}</div>}
            </div>
            <div className="req-tags">
              <span className={`tag ${STATUS_CLASS[r.status] ?? ''}`}>{REQUEST_STATUS_LABEL[r.status]}</span>
              {st && <span className={`tag ${STATE_CLASS[st.state]}`} title={st.text}>{st.text}</span>}
            </div>
            <div className="req-actions no-print">
              {editing !== r.id && <button className="btn btn-small" onClick={() => setEditing(r.id)}>Upravit</button>}
              <button className="icon-btn" title="Smazat" onClick={() => remove(r)}>✕</button>
            </div>
            {editing === r.id && <RequestEdit r={r} onClose={() => setEditing(null)} />}
          </div>
        );
      })}
    </div>
  );
}

/** Form for a new request; `teamId` fixes the team (team page). */
export function NewRequestForm({ teamId }: { teamId?: string }) {
  const { data, refresh } = useCompetition();
  const [d, setD] = useState<Draft>({ ...EMPTY, team_id: teamId ?? '' });
  const [error, setError] = useState<string | null>(null);
  const needsTeam = d.kind === 'start_time' || d.kind === 'draw_no';
  const ready = (!needsTeam || d.team_id) && (d.kind === 'start_time' ? !!normTime(d.time) : d.kind === 'draw_no' ? !!(d.draw_kind || d.text.trim()) : !!d.text.trim());

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.post(`/competitions/${data.competition.id}/requests`, toBody(d));
      setD({ ...EMPTY, kind: d.kind, team_id: teamId ?? '' });
      await refresh();
    } catch (err) {
      setError(apiErrorText(err));
    }
  };

  return (
    <form onSubmit={submit}>
      {error && <div className="alert">{error}</div>}
      <RequestFields d={d} set={(p) => setD({ ...d, ...p })} withTeam={!teamId} withStatus={false} />
      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn btn-primary btn-small" disabled={!ready}>Přidat požadavek</button>
        {d.kind === 'draw_no' && <span className="helper-text">Podmínku lze upřesnit později, i během losovací schůze.</span>}
      </div>
    </form>
  );
}
