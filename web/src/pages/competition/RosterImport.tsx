import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, apiErrorText } from '../../lib/api';
import { readRosterFile } from '../../lib/rosterFile';
import { ROLE_LABEL, REQUEST_KIND_LABEL } from '../../lib/format';
import { FileDrop } from '../../components/FileDrop';
import type { RosterDraft } from '../../../../shared/roster/draft';
import type { RosterImportPreview } from '../../../../shared/roster/importPreview';
import { useCompetition } from './CompetitionLayout';

type Candidate = { id: string; name: string; status: string; score: number };
type Item = {
  key: string;
  filename: string;
  source: 'xlsx' | 'json';
  parseWarnings: string[];
  draft?: RosterDraft;
  teamId?: string;
  candidates?: Candidate[];
  preview?: RosterImportPreview;
  error?: string;
  state: 'loading' | 'needsTeam' | 'ready' | 'saving' | 'done' | 'error';
  version?: number;
  unchanged?: boolean;
};

const TEAM_FIELD_LABEL: Record<string, string> = {
  venue: 'Hrací místnost', shoes: 'Přezůvky', start_pref: 'Preference začátku', draw_requests: 'Požadavky na losování', club_name: 'Oddíl',
};

export function RosterImport() {
  const { data, refresh } = useCompetition();
  const compId = data.competition.id;
  const [items, setItems] = useState<Item[]>([]);
  const update = (key: string, patch: Partial<Item>) => setItems((list) => list.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  const requestPreview = async (key: string, draft: RosterDraft, teamId?: string) => {
    update(key, { state: 'loading', error: undefined });
    try {
      const r = await api.post<{ needsTeam?: boolean; preview?: RosterImportPreview; candidates: Candidate[] }>(
        `/competitions/${compId}/rosters/import`, { draft, team_id: teamId });
      if (r.needsTeam) update(key, { state: 'needsTeam', candidates: r.candidates });
      else update(key, { state: 'ready', preview: r.preview, teamId: r.preview!.team.id, candidates: r.candidates });
    } catch (e) {
      update(key, { state: 'error', error: apiErrorText(e) ?? 'Chyba' });
    }
  };

  const onFiles = async (files: File[]) => {
    for (const file of files) {
      const key = `${file.name}-${Date.now()}-${Math.random()}`;
      setItems((list) => [...list, { key, filename: file.name, source: 'xlsx', parseWarnings: [], state: 'loading' }]);
      const parsed = await readRosterFile(file);
      if (!parsed.ok) {
        update(key, { state: 'error', error: parsed.error });
        continue;
      }
      update(key, { source: parsed.source, draft: parsed.draft, parseWarnings: parsed.warnings });
      await requestPreview(key, parsed.draft);
    }
  };

  const confirm = async (it: Item) => {
    update(it.key, { state: 'saving' });
    try {
      const r = await api.post<{ version: number; unchanged: boolean }>(`/competitions/${compId}/rosters/import`, {
        draft: it.draft, team_id: it.teamId, filename: it.filename, source: it.source, apply: true,
      });
      update(it.key, { state: 'done', version: r.version, unchanged: r.unchanged });
      await refresh();
    } catch (e) {
      update(it.key, { state: 'error', error: apiErrorText(e) ?? 'Chyba' });
    }
  };

  return (
    <>
      <div className="card">
        <div className="card-strip"><h2>Import soupisek</h2>
          <span className="helper">E-soupisky .xlsx od kapitánů nebo rozpracované soupisky .json ze sscr-soupiska.</span></div>
        <div className="card-body">
          <FileDrop accept=".xlsx,.xls,.json" multiple label="Přetáhněte sem soubory soupisek (lze více najednou), nebo klikněte pro výběr" onFiles={onFiles} />
          <p className="helper-text" style={{ marginBottom: 0 }}>
            Každý soubor se nejdřív jen načte a porovná se současnou soupiskou družstva. Uloží se až po vašem potvrzení — jako nová verze soupisky.
          </p>
        </div>
      </div>
      {items.map((it) => (
        <ImportCard key={it.key} it={it} teams={data.teams} onTeam={(teamId) => it.draft && requestPreview(it.key, it.draft, teamId)}
          onConfirm={() => confirm(it)} onDismiss={() => setItems((l) => l.filter((x) => x.key !== it.key))} />
      ))}
    </>
  );
}

function ImportCard({ it, teams, onTeam, onConfirm, onDismiss }: {
  it: Item;
  teams: { id: string; name: string; status: string }[];
  onTeam: (teamId: string) => void;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  const p = it.preview;
  const d = it.draft;
  const warnings = [...it.parseWarnings, ...(p?.warnings ?? [])];
  return (
    <div className="card">
      <div className="card-strip">
        <h2 style={{ textTransform: 'none' }}>{it.filename}</h2>
        {it.state === 'done' && <span className="tag ok">{it.unchanged ? `beze změn (verze ${it.version})` : `uloženo jako verze ${it.version}`}</span>}
        {it.state === 'error' && <span className="tag bad">nelze importovat</span>}
        <span className="spacer" />
        <button className="icon-btn" title="Zavřít" onClick={onDismiss}>✕</button>
      </div>
      <div className="card-body">
        {it.state === 'loading' && <p className="muted">Načítání…</p>}
        {it.error && <div className="alert" style={{ marginBottom: 0 }}>{it.error}</div>}
        {d && it.state !== 'error' && (
          <>
            <div className="row" style={{ marginBottom: 14 }}>
              <div className="field" style={{ minWidth: 300 }}>
                <label>Družstvo v soutěži</label>
                <select className="input" value={it.teamId ?? ''} disabled={it.state === 'done' || it.state === 'saving'} onChange={(e) => onTeam(e.target.value)}>
                  <option value="">— vyberte družstvo —</option>
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.name}{t.status === 'reserve' ? ' (záloha)' : ''}</option>)}
                </select>
              </div>
              <div className="muted" style={{ alignSelf: 'flex-end', paddingBottom: 12 }}>
                V souboru: <strong>{d.header.druzstvo || '—'}</strong> · {d.header.oddil} · {d.header.soutez}
              </div>
            </div>
            {it.state === 'needsTeam' && <div className="note warn">Družstvo „{d.header.druzstvo}“ se nepodařilo automaticky přiřadit — vyberte ho.</div>}
            {warnings.length > 0 && (
              <div className="note warn"><strong>Upozornění</strong>
                <ul className="list-plain">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></div>
            )}
            {p && (
              <>
                {p.previousVersion ? (
                  <div className="note">
                    Oproti verzi {p.previousVersion}: <span className="diff-add">+{p.diff.added.length}</span> · <span className="diff-del">−{p.diff.removed.length}</span> · změněno {p.diff.changed.length} · beze změny {p.diff.unchanged}
                    <ul className="list-plain">
                      {p.diff.added.map((x) => <li key={`a${x.jmeno}`} className="diff-add">+ {x.jmeno}</li>)}
                      {p.diff.removed.map((x) => <li key={`r${x.jmeno}`} className="diff-del">− {x.jmeno}</li>)}
                      {p.diff.changed.map((x) => <li key={`c${x.jmeno}`}>{x.jmeno}: {x.changes.map((ch) => `${ch.field} ${String(ch.from || '—')} → ${String(ch.to || '—')}`).join(', ')}</li>)}
                    </ul>
                  </div>
                ) : <div className="note">První soupiska tohoto družstva.</div>}
                <PlayersTable draft={d} />
                {(p.teamChanges.length > 0 || p.contacts.replace || p.newRequests.length > 0) && (
                  <>
                    <div className="section-title">Údaje družstva, které se uloží</div>
                    <dl className="dl">
                      {p.teamChanges.map((ch) => (
                        <FieldChange key={ch.field} label={TEAM_FIELD_LABEL[ch.field]} from={ch.from} to={ch.to} />
                      ))}
                      {p.contacts.replace && p.contacts.to.map((ct, i) => (
                        <FieldChange key={`c${i}`} label={ROLE_LABEL[ct.role]} to={[ct.name, ct.phone, ct.email].filter(Boolean).join(' · ')} />
                      ))}
                      {p.newRequests.map((r, i) => <FieldChange key={`r${i}`} label={`Požadavek: ${REQUEST_KIND_LABEL[r.kind]}`} to={r.text} />)}
                    </dl>
                  </>
                )}
                <div className="row" style={{ marginTop: 18 }}>
                  {it.state === 'done'
                    ? <Link className="btn" to={`../t/${p.team.id}`}>Zobrazit družstvo</Link>
                    : <button className="btn btn-primary" disabled={it.state === 'saving'} onClick={onConfirm}>Potvrdit a uložit soupisku</button>}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function FieldChange({ label, from, to }: { label: string; from?: string; to: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{from ? <><span className="diff-del">{from}</span> → </> : null}<span>{to}</span></dd>
    </>
  );
}

function PlayersTable({ draft }: { draft: RosterDraft }) {
  return (
    <div className="table-scroll">
      <table className="table">
        <thead><tr><th>#</th><th>Příjmení jméno</th><th className="num">Rok</th><th className="num">LOK</th><th className="num">FIDE</th><th>Označení</th><th>Z</th></tr></thead>
        <tbody>
          {draft.players.map((pl, i) => (
            <tr key={i}>
              <td className="mono muted">{i + 1}.</td>
              <td style={{ fontWeight: 600 }}>{pl.jmeno}</td>
              <td className="num">{pl.rok}</td>
              <td className="num">{pl.lok || <span className="tag bad">chybí</span>}</td>
              <td className="num">{pl.fide}</td>
              <td>{pl.ozn.split(' ').filter(Boolean).map((f) => <span key={f} className="chip active" style={{ marginRight: 4 }}>{f}</span>)}</td>
              <td>{pl.z && <span className="chip active">Z</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
