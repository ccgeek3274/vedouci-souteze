import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, apiErrorText } from '../../lib/api';
import { useCompetition } from './CompetitionLayout';
import { TeamName } from '../../components/TeamName';
import { SM_DEFAULT_OPTIONS, SM_INFO_LIMIT, type SmFile, type SmIssue, type SmOptions, type SmTeamView } from '../../../../shared/export/swissManager';

type Preview = { file: SmFile; issues: SmIssue[]; teams: SmTeamView[]; filename: string };

const LEVEL_TAG: Record<SmIssue['level'], [string, string]> = { error: ['bad', 'chyba'], warn: ['warn', 'pozor'], info: ['ink', 'info'] };
const OPTIONS_KEY = 'vs-sm-options';

// The options are a per-viewer convenience (remembered in the browser), the export endpoint takes them as query params.
function loadOptions(): SmOptions {
  try {
    return { ...SM_DEFAULT_OPTIONS, ...JSON.parse(localStorage.getItem(OPTIONS_KEY) ?? '{}') };
  } catch {
    return SM_DEFAULT_OPTIONS;
  }
}

function Choice({ label, value, options, onChange }: { label: string; value: boolean; options: [string, string]; onChange: (v: boolean) => void }) {
  return (
    <div className="field"><label>{label}</label>
      <div className="segmented">
        <button type="button" className={value ? 'active' : ''} onClick={() => onChange(true)}>{options[0]}</button>
        <button type="button" className={value ? '' : 'active'} onClick={() => onChange(false)}>{options[1]}</button>
      </div>
    </div>
  );
}

/** Input saved on blur / Enter when the value changed; Escape reverts. */
function SavedInput({ value, title, placeholder, maxLength, width, onSave }: {
  value: string; title?: string; placeholder?: string; maxLength?: number; width: number; onSave: (v: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const commit = async () => {
    if (draft == null || draft.trim() === value) return setDraft(null);
    setBusy(true);
    try {
      await onSave(draft.trim());
    } finally {
      setBusy(false);
      setDraft(null);
    }
  };
  return (
    <input className="input input-sm" style={{ width }} value={draft ?? value} title={title} placeholder={placeholder} maxLength={maxLength} disabled={busy}
      onChange={(e) => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') setDraft(null);
      }} />
  );
}

// Export of all rosters for Swiss-Manager Automat (doc/feat-export-sm.md). The file is built by the Worker,
// this page shows what will be in it, lets the manager fix the short names and Info, and what Automat will complain about.
export function SwissManager() {
  const { data: detail, refresh } = useCompetition();
  const c = detail.competition;
  const [options, setOptionsState] = useState<SmOptions>(loadOptions);
  const [error, setError] = useState<string | null>(null);
  const setOptions = (patch: Partial<SmOptions>) => {
    const next = { ...options, ...patch };
    setOptionsState(next);
    try { localStorage.setItem(OPTIONS_KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
  };
  const query = `kapitan=${+options.captain}&zastupce=${+options.deputy}&kontakty=${+options.contacts}`;
  // Not cached: the export must reflect the rosters as they are now.
  const q = useQuery({
    queryKey: ['export-sm', c.id, query],
    queryFn: () => api.get<Preview>(`/competitions/${c.id}/export/swiss-manager?${query}`),
    staleTime: 0,
    gcTime: 0,
    placeholderData: keepPreviousData,
  });

  const saveTeam = async (teamId: string, patch: { short_name?: string | null; sm_info?: string | null }) => {
    setError(null);
    try {
      await api.patch(`/teams/${teamId}`, patch);
      await Promise.all([q.refetch(), refresh()]);
    } catch (e) {
      setError(apiErrorText(e));
    }
  };

  if (q.isLoading) return <div className="muted">Načítám…</div>;
  if (q.error || !q.data) return <div className="alert">{apiErrorText(q.error) ?? 'Export se nepodařilo připravit.'}</div>;
  const { file, issues, teams, filename } = q.data;
  const errors = issues.filter((i) => i.level === 'error').length;
  const players = file.druzstva.reduce((n, t) => n + t.hraci.length, 0);
  const teamId = new Map(teams.map((t) => [t.name, t.id]));

  const download = () => {
    const blob = new Blob([JSON.stringify({ ...file, savedAt: new Date().toISOString() }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };

  return (
    <>
      <div className="card">
        <div className="card-strip"><h2>Export pro Swiss-Manager</h2>
          <span className="helper">Soubor pro Swiss-Manager Automat — tabulka družstev a soupisky v jednom JSON.</span></div>
        <div className="card-body">
          <p style={{ marginTop: 0 }}>
            {file.druzstva.length} družstev · {players} hráčů · základ {file.turnaj.zaklad}
            {' · '}{errors ? <span className="tag bad">{errors} chyb</span> : <span className="tag ok">bez chyb</span>}
          </p>
          <p className="helper-text">
            Družstva jsou seřazená podle losovacího čísla (= startovní číslo v SM). Vyškrtnutí hráči se neexportují.
            Do SM jde jen LOK / FIDE ID a písmena do sloupce Typ; jméno, rok a Elo z ověření na chess.cz slouží Automatu ke kontrole.
            V Automatu: <span className="mono">sm_vloz.py druzstva {filename} --vloz</span>, pak soupisky jednotlivých družstev.
          </p>
          <div className="row" style={{ gap: 24, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 14 }}>
            <Choice label="Kapitán" value={options.captain} options={['Ano', 'Ne']} onChange={(v) => setOptions({ captain: v })} />
            <Choice label="Zástupce" value={options.deputy} options={['Ano', 'Ne']} onChange={(v) => setOptions({ deputy: v })} />
            <Choice label="Údaje" value={!options.contacts} options={['Pouze jméno', 'Kontakty']} onChange={(v) => setOptions({ contacts: !v })} />
          </div>
          <p className="helper-text" style={{ marginTop: 0 }}>Volby určují obsah políčka „Kapitán týmu“ v SM; telefony a e-maily jdou do souboru jen s volbou Kontakty.</p>
          <div className="row">
            <button className="btn btn-primary" disabled={!file.druzstva.length || q.isFetching} onClick={download}>Stáhnout {filename}</button>
            <button className="btn" disabled={q.isFetching} onClick={() => q.refetch()}>Obnovit</button>
          </div>
        </div>
      </div>

      {issues.length > 0 && (
        <div className="card">
          <div className="card-strip"><h2>Upozornění</h2><span className="helper">Chyby Automat odmítne, ostatní stojí za kontrolu.</span></div>
          <div className="card-body table-scroll">
            <table className="table">
              <tbody>
                {issues.map((i, n) => (
                  <tr key={n}>
                    <td style={{ width: 60 }}><span className={`tag ${LEVEL_TAG[i.level][0]}`}>{LEVEL_TAG[i.level][1]}</span></td>
                    <td style={{ width: 240 }}>{i.team ? <TeamName id={teamId.get(i.team)} name={i.team} /> : <span className="muted">soutěž</span>}</td>
                    <td>{i.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-strip"><h2>Družstva v pořadí SM</h2>
          <span className="helper">Zkratku a Info lze upravit (uloží se po opuštění políčka). Prázdné Info = zpět na automatické.</span></div>
        <div className="card-body table-scroll">
          {error && <div className="alert">{error}</div>}
          <table className="table">
            <thead><tr><th>Los</th><th>Družstvo</th><th>Zkratka</th><th>Č.kl.</th><th>Kapitán týmu</th><th>Info (hrací místnost, začátek)</th><th>Hráčů</th><th>Soupiska</th></tr></thead>
            <tbody>
              {file.druzstva.map((t, i) => {
                const v = teams[i];
                const truncated = v.infoSaved == null && v.infoAuto.length > SM_INFO_LIMIT;
                return (
                  <tr key={t.nazev}>
                    <td className="mono">{t.los ?? '—'}</td>
                    <td><TeamName id={v.id} name={t.nazev} /></td>
                    <td>{v.id ? <SavedInput width={130} value={v.shortName} placeholder="vygeneruje se"
                      onSave={(x) => saveTeam(v.id!, { short_name: x || null })} /> : v.shortName}</td>
                    <td className="mono">{t.cislo_klubu ?? '—'}</td>
                    <td>{t.extra.kapJmeno || <span className="muted">—</span>}</td>
                    <td style={{ minWidth: 320 }}>
                      {v.id ? (
                        <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                          <SavedInput width={420} value={t.extra.hraciMistnost} maxLength={SM_INFO_LIMIT} placeholder="bez hrací místnosti"
                            title={v.infoAuto ? `Automaticky: ${v.infoAuto}` : undefined} onSave={(x) => saveTeam(v.id!, { sm_info: x || null })} />
                          {truncated && <span className="tag warn" title={v.infoAuto}>ořezáno</span>}
                          {v.infoSaved != null && (
                            <button className="icon-btn" title={`Zpět na automatické: ${v.infoAuto || '(prázdné)'}`} onClick={() => saveTeam(v.id!, { sm_info: null })}>↺</button>
                          )}
                        </div>
                      ) : <span title={v.infoAuto}>{t.extra.hraciMistnost || <span className="muted">—</span>}</span>}
                    </td>
                    <td className="mono">{t.hraci.length}</td>
                    <td className="mono">{t.soupiska_verze != null ? `v${t.soupiska_verze}` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
