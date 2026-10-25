import { useQuery } from '@tanstack/react-query';
import { api, apiErrorText } from '../../lib/api';
import { useCompetition } from './CompetitionLayout';
import type { SmFile, SmIssue } from '../../../../shared/export/swissManager';

type Preview = { file: SmFile; issues: SmIssue[]; filename: string };

const LEVEL_TAG: Record<SmIssue['level'], [string, string]> = { error: ['bad', 'chyba'], warn: ['warn', 'pozor'], info: ['ink', 'info'] };

// Export of all rosters for Swiss-Manager Automat (doc/feat-export-sm.md). The file is built by the Worker,
// this page shows what will be in it and what Automat will complain about.
export function SwissManager() {
  const { data: detail } = useCompetition();
  const c = detail.competition;
  // Not cached: the export must reflect the rosters as they are now.
  const q = useQuery({
    queryKey: ['export-sm', c.id],
    queryFn: () => api.get<Preview>(`/competitions/${c.id}/export/swiss-manager`),
    staleTime: 0,
    gcTime: 0,
  });

  if (q.isLoading) return <div className="muted">Načítám…</div>;
  if (q.error || !q.data) return <div className="alert">{apiErrorText(q.error) ?? 'Export se nepodařilo připravit.'}</div>;
  const { file, issues, filename } = q.data;
  const errors = issues.filter((i) => i.level === 'error').length;
  const players = file.druzstva.reduce((n, t) => n + t.hraci.length, 0);

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
          <div className="row">
            <button className="btn btn-primary" disabled={!file.druzstva.length} onClick={download}>Stáhnout {filename}</button>
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
                    <td style={{ width: 240 }}>{i.team ?? <span className="muted">soutěž</span>}</td>
                    <td>{i.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-strip"><h2>Družstva v pořadí SM</h2></div>
        <div className="card-body table-scroll">
          <table className="table">
            <thead><tr><th>Los</th><th>Družstvo</th><th>Č.kl.</th><th>Kapitán</th><th>Info (hrací místnost)</th><th>Hráčů</th><th>Soupiska</th></tr></thead>
            <tbody>
              {file.druzstva.map((t) => (
                <tr key={t.nazev}>
                  <td className="mono">{t.los ?? '—'}</td>
                  <td>{t.nazev}</td>
                  <td className="mono">{t.cislo_klubu ?? '—'}</td>
                  <td>{t.extra.kapJmeno || <span className="muted">—</span>}</td>
                  <td>{t.extra.hraciMistnost || <span className="muted">—</span>}</td>
                  <td className="mono">{t.hraci.length}</td>
                  <td className="mono">{t.soupiska_verze != null ? `v${t.soupiska_verze}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
