import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, apiErrorText } from '../../lib/api';
import { REQUEST_KIND_LABEL, REQUEST_STATUS_LABEL } from '../../lib/format';
import type { Request } from '../../lib/types';
import { normTime, shortTime } from '../../../../shared/startTime';
import { CONSTRAINT_LABEL, tableSize, type ConditionState, type ConstraintKind } from '../../../../shared/draw/check';
import { useCompetition } from './CompetitionLayout';

// Request editing shared by the Požadavky tab, the team page and the Losování tab.
// Draw requests (kind draw_no) carry a structured condition; every part is optional and can be completed
// during the draw meeting — an incomplete one is shown as "nevyřešeno".

const SIDE_LABEL = { home: 'domácí utkání', away: 'utkání venku' } as const;
export const STATE_CLASS: Record<ConditionState['state'], string> = { ok: 'ok', violated: 'bad', unresolved: 'warn', waiting: '' };

type DrawSpecValue = Pick<Request, 'draw_kind' | 'round' | 'value' | 'other_team_id' | 'ext_name' | 'ext_no' | 'ext_teams'>;
const EMPTY_SPEC: DrawSpecValue = { draw_kind: null, round: null, value: null, other_team_id: null, ext_name: '', ext_no: null, ext_teams: null };

/** Number input committing on blur (null when empty). */
function NumInput({ value, onCommit, width = 56, placeholder }: { value: number | null; onCommit: (v: number | null) => void; width?: number; placeholder?: string }) {
  const [v, setV] = useState(value == null ? '' : String(value));
  useEffect(() => setV(value == null ? '' : String(value)), [value]);
  return (
    <input className="input input-sm mono" style={{ width }} value={v} placeholder={placeholder}
      onChange={(e) => setV(e.target.value.replace(/\D/g, ''))}
      onBlur={() => (v ? Number(v) : null) !== value && onCommit(v ? Number(v) : null)} />
  );
}

/** Editor of the structured draw condition. */
export function DrawSpec({ value, teamId, onChange }: { value: DrawSpecValue; teamId: string | null; onChange: (patch: Partial<DrawSpecValue>) => void }) {
  const { data } = useCompetition();
  const active = data.teams.filter((t) => t.status === 'active');
  const size = tableSize(active.length);
  const k = value.draw_kind as ConstraintKind | null;
  const pattern = k === 'alternate' || k === 'same';
  const [extName, setExtName] = useState(value.ext_name);
  useEffect(() => setExtName(value.ext_name), [value.ext_name]);
  return (
    <div className="row" style={{ gap: 6 }}>
      <select className="input input-sm" value={k ?? ''} onChange={(e) => onChange({ draw_kind: e.target.value || null })}>
        <option value="">— druh neurčen —</option>
        {Object.entries(CONSTRAINT_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      {k === 'draw_no' && <>číslo <NumInput value={value.value} placeholder={`1–${size}`} onCommit={(v) => onChange({ value: v })} /></>}
      {(k === 'home' || k === 'away' || k === 'meet') && <>kolo <NumInput value={value.round} onCommit={(v) => onChange({ round: v })} /></>}
      {(k === 'meet' || pattern) && (
        <select className="input input-sm" value={value.other_team_id ?? ''} onChange={(e) => onChange({ other_team_id: e.target.value || null })}>
          <option value="">{pattern ? '— družstvo jiné soutěže —' : '— soupeř —'}</option>
          {active.filter((t) => t.id !== teamId).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      )}
      {pattern && !value.other_team_id && (
        <>
          <input className="input input-sm" style={{ width: 170 }} placeholder="např. Kralupy A (KP)" value={extName}
            onChange={(e) => setExtName(e.target.value)} onBlur={() => extName !== value.ext_name && onChange({ ext_name: extName })} />
          jeho č. <NumInput value={value.ext_no} placeholder="?" onCommit={(v) => onChange({ ext_no: v })} />
          z <NumInput value={value.ext_teams} placeholder="?" onCommit={(v) => onChange({ ext_teams: v })} /> družstev
        </>
      )}
    </div>
  );
}

/** Requests as an editable table. `states` = evaluation of draw conditions (Losování tab). */
export function RequestTable({ requests, showTeam = true, states }: { requests: Request[]; showTeam?: boolean; states?: Map<number, ConditionState> }) {
  const { data, refresh } = useCompetition();
  const [error, setError] = useState<string | null>(null);
  const teamName = new Map(data.teams.map((t) => [t.id, t.name]));
  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try { await fn(); await refresh(); } catch (e) { setError(apiErrorText(e)); }
  };
  const patch = (r: Request, body: Partial<Request>) => run(() => api.patch(`/requests/${r.id}`, body));

  return (
    <>
      {error && <div className="alert">{error}</div>}
      <table className="table" style={{ tableLayout: 'fixed', minWidth: 980 }}>
        <tbody>
          {requests.map((r) => {
            const st = states?.get(r.id);
            return (
              <tr key={r.id} style={{ verticalAlign: 'top' }}>
                {showTeam && <td style={{ width: 210 }}>{r.team_id ? <Link to={`../t/${r.team_id}`}>{teamName.get(r.team_id)}</Link> : <span className="muted">soutěž</span>}</td>}
                <td>
                  {r.kind === 'start_time' && (
                    <div className="row" style={{ gap: 6 }}>
                      <select className="input input-sm" value={r.side ?? 'home'} onChange={(e) => patch(r, { side: e.target.value as Request['side'] })}>
                        <option value="home">doma</option>
                        <option value="away">venku</option>
                      </select>
                      <input type="time" className="input input-sm mono" style={{ width: 110 }} defaultValue={r.time ?? ''} key={r.time ?? ''}
                        onBlur={(e) => normTime(e.target.value) !== (r.time ?? '') && patch(r, { time: e.target.value || null })} />
                      {!r.time && <span className="tag warn">doplňte čas</span>}
                    </div>
                  )}
                  {r.kind === 'draw_no' && <DrawSpec value={r} teamId={r.team_id} onChange={(p) => patch(r, p)} />}
                  {(r.text || r.source === 'roster') && (
                    <div className={r.kind === 'start_time' || r.kind === 'draw_no' ? 'muted' : undefined} style={{ fontSize: 12.5, marginTop: 4 }}>
                      {(r.kind === 'start_time' || r.kind === 'draw_no') && 'Původní text: '}„{r.text}“
                      {r.source === 'roster' && <span className="tag" style={{ marginLeft: 8 }}>ze soupisky</span>}
                    </div>
                  )}
                  {st && <div style={{ marginTop: 4 }}><span className={`tag ${STATE_CLASS[st.state]}`}>{st.text}</span></div>}
                </td>
                <td style={{ width: 130 }}>
                  <select className="input input-sm" value={r.kind} onChange={(e) => patch(r, { kind: e.target.value })}>
                    {Object.entries(REQUEST_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </td>
                <td style={{ width: 120 }}>
                  <select className="input input-sm" value={r.status} onChange={(e) => patch(r, { status: e.target.value as Request['status'] })}>
                    {Object.entries(REQUEST_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </td>
                <td style={{ width: 180 }}>
                  <input className="input input-sm" style={{ width: '100%' }} placeholder="Rozhodnutí / poznámka" defaultValue={r.decision} key={r.decision}
                    onBlur={(e) => e.target.value !== r.decision && patch(r, { decision: e.target.value })} />
                </td>
                <td className="actions" style={{ width: 36 }}>
                  <button className="icon-btn" title="Smazat" onClick={() => window.confirm('Smazat požadavek?') && run(() => api.delete(`/requests/${r.id}`))}>✕</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

/** Form for a new request; `teamId` fixes the team (team page). */
export function NewRequestForm({ teamId }: { teamId?: string }) {
  const { data, refresh } = useCompetition();
  const active = data.teams.filter((t) => t.status === 'active');
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ team_id: teamId ?? '', kind: 'draw_no', text: '', time: '10:00', side: 'home' });
  const [spec, setSpec] = useState<DrawSpecValue>(EMPTY_SPEC);
  const team = teamId ?? form.team_id;
  const needsTeam = form.kind === 'start_time' || form.kind === 'draw_no';
  const ready = (!needsTeam || team) && (form.kind === 'start_time' ? !!normTime(form.time) : form.kind === 'draw_no' ? !!(spec.draw_kind || form.text.trim()) : !!form.text.trim());

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.post(`/competitions/${data.competition.id}/requests`, { ...form, team_id: team || undefined, ...(form.kind === 'draw_no' ? spec : {}) });
      setForm({ ...form, text: '' });
      setSpec(EMPTY_SPEC);
      await refresh();
    } catch (err) {
      setError(apiErrorText(err));
    }
  };

  return (
    <form onSubmit={submit}>
      {error && <div className="alert">{error}</div>}
      <div className="grid-4">
        {!teamId && (
          <div className="field"><label>Družstvo</label>
            <select className="input" value={form.team_id} onChange={(e) => setForm({ ...form, team_id: e.target.value })}>
              <option value="">{needsTeam ? '— vyberte družstvo —' : '— celá soutěž —'}</option>
              {active.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select></div>
        )}
        <div className="field"><label>Typ</label>
          <select className="input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            {Object.entries(REQUEST_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></div>
        {form.kind === 'start_time' && (
          <>
            <div className="field"><label>Utkání</label>
              <select className="input" value={form.side} onChange={(e) => setForm({ ...form, side: e.target.value })}>
                <option value="home">{SIDE_LABEL.home}</option>
                <option value="away">{SIDE_LABEL.away}</option>
              </select></div>
            <div className="field"><label>Začátek</label>
              <input type="time" className="input mono" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /></div>
          </>
        )}
        {form.kind !== 'start_time' && form.kind !== 'draw_no' && (
          <div className="field" style={{ gridColumn: 'span 2' }}><label>Text</label>
            <input className="input" value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} placeholder="např. přeložení 3. kola" /></div>
        )}
      </div>
      {form.kind === 'draw_no' && (
        <div className="field" style={{ marginTop: 14 }}><label>Podmínka losování (lze doplnit později)</label>
          <DrawSpec value={spec} teamId={team || null} onChange={(p) => setSpec({ ...spec, ...p })} /></div>
      )}
      {(form.kind === 'start_time' || form.kind === 'draw_no') && (
        <div className="field" style={{ marginTop: 14 }}><label>Původní text / poznámka (nepovinné)</label>
          <input className="input" value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })}
            placeholder={form.kind === 'start_time' ? `${SIDE_LABEL[form.side as 'home' | 'away']} v ${shortTime(form.time) || '…'}` : 'např. protičíslo ke Kralupy A (KP)'} /></div>
      )}
      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn btn-primary" disabled={!ready}>Přidat požadavek</button>
      </div>
    </form>
  );
}
