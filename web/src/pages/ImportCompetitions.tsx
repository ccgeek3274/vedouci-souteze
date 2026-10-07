import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api, apiErrorText } from '../lib/api';
import { czDate } from '../lib/format';
import { FileDrop } from '../components/FileDrop';
import type { CompetitionPlan } from '../../../shared/import/competition';

type Preview = {
  season: string;
  source: { document?: string; kind?: string; date?: string } | null;
  plans: (CompetitionPlan & { noop: boolean })[];
};

const FIELD_LABEL: Record<string, string> = {
  name: 'Název', level: 'Úroveň', group_code: 'Skupina', region: 'Svaz', boards: 'Šachovnic', default_start: 'Začátek',
  time_control: 'Tempo', manager_name: 'Vedoucí', manager_email: 'E-mail vedoucího', manager_phone: 'Telefon vedoucího',
  mutual_deadline: 'Vzájemné zápasy oddílu do',
};

export function ImportCompetitions() {
  const queryClient = useQueryClient();
  const [doc, setDoc] = useState<{ name: string; json: unknown } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async (files: File[]) => {
    setError(null); setDone(null); setPreview(null);
    const file = files[0];
    try {
      const json = JSON.parse(await file.text());
      const p = await api.post<Preview>('/import/competitions', json);
      setDoc({ name: file.name, json });
      setPreview(p);
      setSelected(new Set(p.plans.filter((x) => x.action === 'update' && !x.noop).map((x) => x.short)));
    } catch (e) {
      setError(e instanceof SyntaxError ? 'Soubor není platný JSON.' : apiErrorText(e));
    }
  };

  const apply = async () => {
    if (!doc || !selected.size) return;
    setBusy(true); setError(null);
    try {
      const r = await api.post<{ applied: string[] }>(`/import/competitions?apply=true&only=${[...selected].join(',')}&filename=${encodeURIComponent(doc.name)}`, doc.json);
      setDone(r.applied);
      setPreview(null);
      queryClient.invalidateQueries({ queryKey: ['competitions'] });
    } catch (e) {
      setError(apiErrorText(e));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (s: string) => setSelected((prev) => {
    const n = new Set(prev);
    n.has(s) ? n.delete(s) : n.add(s);
    return n;
  });

  return (
    <>
      <div className="crumbs"><Link to="/">Soutěže</Link> / Import</div>
      <div className="card">
        <div className="card-strip"><span className="badge">1</span><h2>Soubor importu</h2>
          <span className="helper">JSON z rozpisu / rozdělení družstev (skill <span className="mono">import-rozpis</span>, formát v doc/import-format.md).</span></div>
        <div className="card-body">
          {error && <div className="alert" style={{ whiteSpace: 'pre-line' }}>{error}</div>}
          {done && <div className="note">Import proveden: {done.length ? done.join(', ') : 'žádné změny'}. <Link to="/">Zpět na soutěže</Link></div>}
          <FileDrop accept=".json" label="Přetáhněte sem JSON soubor, nebo klikněte pro výběr" onFiles={load} />
        </div>
      </div>

      {preview && (
        <div className="card">
          <div className="card-strip"><span className="badge">2</span><h2>Náhled změn</h2>
            <span className="helper">{preview.source?.document} · sezóna {preview.season}{preview.source?.date ? ` · ${czDate(preview.source.date)}` : ''}</span></div>
          <div className="card-body">
            <p className="helper-text" style={{ marginTop: 0 }}>Zaškrtněte soutěže, které vedete. Rozpis obsahuje všechny skupiny kraje.</p>
            {preview.plans.map((p) => (
              <div key={p.short} style={{ borderTop: '1px solid var(--divider)', padding: '12px 0' }}>
                <label className="row" style={{ cursor: 'pointer' }}>
                  <input type="checkbox" checked={selected.has(p.short)} disabled={p.noop} onChange={() => toggle(p.short)} />
                  <strong>{p.name}</strong> <span className="mono muted">{p.short}</span>
                  {p.noop ? <span className="tag">beze změn</span> : p.action === 'create' ? <span className="tag ink">nová</span> : <span className="tag warn">změny</span>}
                </label>
                {selected.has(p.short) && !p.noop && <PlanDetail plan={p} />}
              </div>
            ))}
            <div className="row" style={{ marginTop: 16 }}>
              <button className="btn btn-primary" disabled={!selected.size || busy} onClick={apply}>
                Provést import ({selected.size})
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function PlanDetail({ plan }: { plan: CompetitionPlan }) {
  const teams = plan.teams ?? [];
  return (
    <div style={{ margin: '8px 0 0 26px', fontSize: 13.5 }}>
      {plan.action === 'create' && (
        <div className="muted">Vedoucí {plan.fields.manager_name || '—'} · {plan.fields.boards} šachovnic · začátek {plan.fields.default_start}</div>
      )}
      {plan.fieldChanges.length > 0 && (
        <ul className="list-plain">
          {plan.fieldChanges.map((f) => <li key={f.field}>{FIELD_LABEL[f.field] ?? f.field}: <span className="diff-del">{String(f.from ?? '—')}</span> → <span className="diff-add">{String(f.to)}</span></li>)}
        </ul>
      )}
      {(plan.action === 'create' || plan.rounds.replace) && plan.rounds.target.length > 0 && (
        <div className="muted" style={{ marginTop: 4 }}>
          Termíny ({plan.rounds.target.length} kol): {plan.rounds.target.map((r) => czDate(r.date)).join(', ')}
        </div>
      )}
      {teams.length > 0 && (
        <ul className="list-plain">
          {teams.map((t) => (
            <li key={t.action === 'add' ? `a${t.position}` : t.id}>
              {t.action === 'add' && <><span className="diff-add">+ {t.name}</span> <span className="muted">(nové družstvo, pozice {t.position})</span></>}
              {t.action === 'keep' && <>{t.name}{t.importName !== t.name && <span className="muted"> (v dokumentu „{t.importName}“)</span>}
                {t.reactivate && <span className="tag warn" style={{ marginLeft: 6 }}>ze zálohy</span>}
                {t.moved && <span className="muted"> → pozice {t.position}</span>}</>}
              {t.action === 'reserve' && <><span className="diff-del">− {t.name}</span> <span className="muted">(přesun do zálohy)</span></>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
