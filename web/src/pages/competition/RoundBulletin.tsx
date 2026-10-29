import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, apiErrorText } from '../../lib/api';
import { czDateTime, ROLE_LABEL } from '../../lib/format';
import type { Contact } from '../../lib/types';
import { useCompetition } from './CompetitionLayout';
import { RichEditor } from '../../components/RichEditor';
import { downloadBlob, SAVE_TEXT, saveTagClass, SavepointsCard, useBulletinDraft } from '../../bulletin/draft';
import { loadRoundCz, refreshRoundCz, roundInput } from '../../bulletin/roundLoad';
import { buildRoundDocxBlob } from '../../bulletin/roundDocx';
import { buildRoundPdfBlob } from '../../bulletin/roundPdf';
import { todayIso } from '../../../../shared/bulletin/initial';
import {
  buildRoundModel, FONT_PTS, normalizeRoundConfig, parseRoundSnapshot, PROFILE_KEYS, PROFILES, REF_LABEL, STAND_HDRS,
  type RoundConfig, type RoundSnapshot,
} from '../../../../shared/bulletin/round';
import { asArray } from '../../../../shared/roster/verify';
import { sameName } from '../../../../shared/schedule';
import {
  HDR_DIST, MARGIN_B, MARGIN_T, MARGIN_X, matchCols, matchLayout, standingsLayout, sum, type Measure,
} from '../../../../shared/bulletin/roundLayout';

// Look of a new round draft = the last one chosen (per browser, like sscr-zpravodaj); each draft stores its own.
const PREFS_KEY = 'vs_round_bulletin';
const readPrefs = (): Partial<RoundConfig> => {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') ?? {}; } catch { return {}; }
};
const writePrefs = (c: RoundConfig) => {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify({ profile: c.profile, fontPt: c.fontPt, withRef: c.withRef })); } catch { /* private mode */ }
};

// Column widths are measured in the document font (Calibri, else the metrically identical Carlito from /fonts).
let canvas: HTMLCanvasElement | null = null;
const measure: Measure = (text, bold, fpt) => {
  const ctx = (canvas ??= document.createElement('canvas')).getContext('2d')!;
  ctx.font = `${bold ? 'bold ' : ''}${fpt}pt DocFont, Calibri, Carlito, sans-serif`;
  return ctx.measureText(text).width;
};
function useDocFont() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    Promise.all(['10pt DocFont', 'bold 10pt DocFont'].map((f) => document.fonts.load(f))).catch(() => null).then(() => alive && setReady(true));
    return () => { alive = false; };
  }, []);
  return ready;
}

const px = (dxa: number) => `${(dxa / 15).toFixed(2)}px`; // 1 px = 15 DXA (preview 1:1 with the DOCX)
const ptPx = (v: number) => `${(v * 4 / 3).toFixed(2)}px`;
const css = (c?: string) => (c ? `#${c}` : '#000');
const ruleCss = (c: string | undefined, w = 1): CSSProperties => (c ? { borderBottom: `${w}px solid ${css(c)}`, paddingBottom: 1 } : {});
const Cols = ({ ws }: { ws: number[] }) => <colgroup>{ws.map((w, i) => <col key={i} style={{ width: px(w) }} />)}</colgroup>;

// Referee suggestions: the team's referees, captain and deputy (in this order, each name once).
type RefOption = { name: string; role: Contact['role'] };
const REF_ROLES: Contact['role'][] = ['rozhodci', 'kapitan', 'zastupce'];
function refOptions(contacts: Contact[] | undefined): RefOption[] {
  const out: RefOption[] = [];
  for (const role of REF_ROLES) {
    for (const ct of contacts ?? []) {
      const name = ct.name.trim();
      if (ct.role === role && name && !out.some((o) => sameName(o.name, name))) out.push({ name, role });
    }
  }
  return out;
}

/** Referee field of the preview: free text, ▾ opens the home team's people and, under a line, the away team's. */
function RefPicker({ idx, value, changed, placeholder, title, home, away, onChange, onUndo }: {
  idx: number; value: string; changed: boolean; placeholder?: string; title: string;
  home: RefOption[]; away: RefOption[]; onChange: (v: string) => void; onUndo: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLSpanElement>(null);
  const [at, setAt] = useState<DOMRect | null>(null); // open menu: under the input (fixed — the cell clips overflow)
  useEffect(() => {
    if (!at) return;
    const follow = () => input.current && setAt(input.current.getBoundingClientRect()); // the menu follows the field
    const outside = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setAt(null); };
    window.addEventListener('scroll', follow, true);
    window.addEventListener('resize', follow);
    document.addEventListener('mousedown', outside);
    return () => {
      window.removeEventListener('scroll', follow, true);
      window.removeEventListener('resize', follow);
      document.removeEventListener('mousedown', outside);
    };
  }, [!!at]);
  const open = () => setAt(input.current!.getBoundingClientRect());
  const pick = (name: string) => { onChange(name); setAt(null); input.current?.focus(); };
  const group = (label: string, opts: RefOption[]) => (
    <>
      <li className="ref-menu-h">{label}</li>
      {opts.length
        ? opts.map((o) => (
          <li key={`${label}${o.name}`}>
            <button type="button" className={sameName(o.name, value) ? 'on' : undefined} onClick={() => pick(o.name)}>
              {o.name}<span>{ROLE_LABEL[o.role]}</span>
            </button>
          </li>
        ))
        : <li className="ref-menu-none">bez kontaktů</li>}
    </>
  );
  return (
    <span className="rdoc-pick" ref={box}>
      <input ref={input} className={`rdoc-ref${changed ? ' changed' : ''}`} data-ref={idx} value={value} spellCheck={false}
        placeholder={placeholder} title={title}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || (e.key === 'Escape' && at)) { e.preventDefault(); if (at) setAt(null); else open(); return; }
          if (e.key !== 'Enter') return;
          e.preventDefault();
          setAt(null);
          const next = document.querySelector<HTMLInputElement>(`.rdoc-ref[data-ref="${idx + 1}"]`);
          if (next) next.focus(); else e.currentTarget.blur();
        }} />
      <button type="button" className="rdoc-drop no-print" tabIndex={-1} title="Vybrat z rozhodčích, kapitánů a zástupců družstev"
        onClick={() => (at ? setAt(null) : open())}>▾</button>
      {changed && <button type="button" className="rdoc-undo no-print" title="Vrátit nominovaného" onClick={onUndo}>↺</button>}
      {at && (
        <ul className="ref-menu" style={{ left: at.left, top: at.bottom + 2, minWidth: Math.max(at.width, 220) }}>
          {group('domácí', home)}
          <li className="ref-menu-sep" role="separator" />
          {group('hosté', away)}
        </ul>
      )}
    </span>
  );
}

// Zpravodaj z kola (M9): port of sscr-zpravodaj. Results, standings and the round's schedule from chess.cz,
// referees from Nominace rozhodčích. The draft stores only the options and Různé; the referees as edited in the
// preview and the standings (whole chess.cz rows) are frozen only in save points (RoundSnapshot).
export function RoundBulletin({ nr }: { nr: number }) {
  const { data: detail } = useCompetition();
  const c = detail.competition;
  const qc = useQueryClient();
  const [progress, setProgress] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [resetN, setResetN] = useState(0);
  const fontReady = useDocFont();

  // Referees edited in the preview (home team key → name) and standings of a restored save point: page state only.
  const [refEdits, setRefEdits] = useState<Record<string, string>>({});
  const [refsDirty, setRefsDirty] = useState(false); // edits not in any save point yet
  const [frozen, setFrozen] = useState<{ standings: unknown[]; label: string; at: number } | null>(null);
  useEffect(() => {
    if (!refsDirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [refsDirty]);

  const draft = useBulletinDraft(c.id, `round-${nr}`, (raw) => normalizeRoundConfig(raw, readPrefs()), {
    snapshot: (): RoundSnapshot | null => (model && cz.data
      ? { standings: frozen?.standings ?? asArray(cz.data.table as unknown[]), refs: Object.fromEntries(model.matches.map((m) => [m.key, m.ref])) }
      : null),
    onSavepoint: () => setRefsDirty(false),
    onRestore: (raw, sp) => {
      const snap = parseRoundSnapshot(raw);
      setRefEdits(snap?.refs ?? {});
      setFrozen(snap ? { standings: snap.standings, label: sp.label, at: sp.created_at } : null);
      setRefsDirty(false);
    },
  });
  const { stored, cfg, error, setError } = draft;
  const update = (fn: (x: RoundConfig) => RoundConfig) => draft.update(fn);
  const refsQ = useQuery({ queryKey: ['referees', c.id], queryFn: () => api.get<{ assignments: Record<string, string> }>(`/competitions/${c.id}/referees`) });
  const cz = useQuery({
    queryKey: ['round-cz', c.id, c.chesscz_comp_id, nr],
    queryFn: () => loadRoundCz(c.chesscz_comp_id!, nr, setProgress),
    enabled: !!c.chesscz_comp_id,
    staleTime: 5 * 60_000,
  });

  const model = useMemo(
    () => (cfg && cz.data && refsQ.data
      ? buildRoundModel(roundInput(detail, cz.data, nr, refsQ.data.assignments, todayIso()), cfg, { refs: refEdits, standings: frozen?.standings })
      : null),
    [cfg, cz.data, refsQ.data, detail, nr, refEdits, frozen],
  );
  const contactsOf = useMemo(() => new Map(detail.teams.map((t) => [t.id, refOptions(t.contacts)])), [detail.teams]);
  const lay = useMemo(() => (model ? matchLayout(model.matches, model.fontPt, measure) : null), [model, fontReady]);
  const sl = useMemo(() => (model ? standingsLayout(model.standings, model.fontPt, measure) : null), [model, fontReady]);

  if (stored.isLoading || !cfg) return <div className="muted">Načítám…</div>;
  if (stored.error) return <div className="alert">{apiErrorText(stored.error)}</div>;

  const setLook = (patch: Partial<RoundConfig>) => update((x) => { const next = { ...x, ...patch }; writePrefs(next); return next; });
  const setRef = (key: string, value: string | null) => {
    setRefEdits((x) => {
      const next = { ...x };
      if (value === null) delete next[key]; else next[key] = value;
      return next;
    });
    setRefsDirty(true);
  };
  const download = async (kind: 'docx' | 'pdf') => {
    if (!model || !lay || !sl) return;
    setBusy(kind);
    setError(null);
    try {
      // the first download of a round freezes what was sent out
      if (!stored.data?.savepoints.length) await draft.savepoint(`automaticky při stažení ${kind.toUpperCase()}`);
      const blob = kind === 'docx' ? await buildRoundDocxBlob(model, lay, sl.cols) : await buildRoundPdfBlob(model, lay, sl.cols);
      downloadBlob(blob, `${model.fileName}.${kind}`);
    } catch (e) {
      setError(`${kind.toUpperCase()} se nepodařilo vytvořit: ${apiErrorText(e) ?? e}`);
    } finally {
      setBusy(null);
    }
  };
  const reloadCz = async () => {
    if (!c.chesscz_comp_id) return;
    setProgress('obnovuji');
    await refreshRoundCz(c.chesscz_comp_id, nr, cz.data);
    await qc.invalidateQueries({ queryKey: ['round-cz', c.id] });
  };

  const entered = model ? model.matches.filter((m) => m.score).length : 0;
  const isEdited = (m: { key: string; ref: string; assigned: string }) => refEdits[m.key] !== undefined && m.ref.trim() !== m.assigned;
  const overridden = model ? model.matches.filter(isEdited).length : 0;

  return (
    <>
      <div className="card">
        <div className="card-strip">
          <h2>Zpravodaj z {nr}. kola</h2>
          <span className={saveTagClass(draft.saveState)}>{SAVE_TEXT[draft.saveState]}</span>
        </div>
        <div className="card-body">
          <div className="bulletin-bar">
            <label className="field-inline">Datum vydání
              <input className="input input-sm" type="date" value={cfg.date ?? todayIso()}
                onChange={(e) => update((x) => ({ ...x, date: e.target.value || null }))} />
            </label>
            <div className="segmented" title="Vzhled: záhlaví stránky, hlavička a nadpisy kapitol">
              {PROFILE_KEYS.map((k) => <button key={k} className={cfg.profile === k ? 'active' : ''} onClick={() => setLook({ profile: k })}>{PROFILES[k].name}</button>)}
            </div>
            <div className="segmented" title="Písmo tabulek, řádku Rozhodčí a textu Různé (pt)">
              {FONT_PTS.map((f) => <button key={f} className={cfg.fontPt === f ? 'active' : ''} onClick={() => setLook({ fontPt: f })}>{f} pt</button>)}
            </div>
            <label className="field-inline"><input type="checkbox" checked={cfg.withRef} onChange={(e) => setLook({ withRef: e.target.checked })} /> rozhodčí</label>
            <span className="spacer" />
            <button className="btn btn-primary" disabled={!model || !!busy} onClick={() => download('docx')}>{busy === 'docx' ? 'Vytvářím…' : 'Stáhnout DOCX'}</button>
            <button className="btn" disabled={!model || !!busy} onClick={() => download('pdf')}>{busy === 'pdf' ? 'Vytvářím…' : 'Stáhnout PDF'}</button>
          </div>
          <p className="helper-text">
            Výsledky, pořadí a rozpis kola z chess.cz; rozhodčí z karty <Link to="../rozhodci">Nominace rozhodčích</Link> — ve zpravodaji
            je lze přepsat nebo vybrat z kontaktů družstev (▾). Přepsaní rozhodčí a pořadí se uloží jen v save pointu; první stažení
            DOCX/PDF kola ho vytvoří automaticky. Soubor: <span className="mono">{model?.fileName ?? '…'}</span>
          </p>
          {error && <div className="alert">{error}</div>}
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-strip"><h2>Zdroj dat</h2>
            <button className="btn btn-small" disabled={cz.isFetching || !c.chesscz_comp_id} onClick={reloadCz}>{cz.isFetching ? `Načítám ${progress}…` : 'Načíst znovu z chess.cz'}</button>
          </div>
          <div className="card-body">
            {!c.chesscz_comp_id && <p className="muted">Soutěž není spárovaná se soutěží na chess.cz (Přehled → chess.cz ID) — zpravodaj z kola potřebuje výsledky z chess.cz.</p>}
            {cz.error && <div className="alert">chess.cz: {apiErrorText(cz.error)}</div>}
            {model && (
              <ul className="list-plain source-list">
                <li><span className={`tag ${entered === model.matches.length && entered ? 'ok' : entered ? 'warn' : 'bad'}`}>{entered}/{model.matches.length}</span> Zápasy s výsledkem</li>
                <li><span className={`tag ${model.standings.length ? 'ok' : 'bad'}`}>{!model.standings.length ? 'chybí' : frozen ? 'save point' : 'chess.cz'}</span> Pořadí družstev</li>
                <li><span className={`tag${refsDirty ? ' warn' : ''}`}>{overridden ? `${overridden} přepsáno` : 'nominace'}</span> Rozhodčí
                  {refsDirty && <span className="muted"> — změny nejsou v žádném save pointu</span>}</li>
              </ul>
            )}
            {frozen && (
              <div className="bulletin-bar">
                <span className="helper-text">Pořadí ze save pointu „{frozen.label || 'bez názvu'}“ ({czDateTime(frozen.at)}).</span>
                <button className="btn btn-small" onClick={() => setFrozen(null)}>Použít aktuální z chess.cz</button>
              </div>
            )}
            {model && (model.noResults || model.warnings.length > 0 || (lay && !lay.fits) || (sl && !sl.fits)) && (
              <div className="issues">
                {model.noResults && <div className="warn">! {model.noResults}</div>}
                {model.warnings.map((w) => <div key={w} className="warn">! {w}</div>)}
                {((lay && !lay.fits) || (sl && !sl.fits)) && (
                  <div className="warn">! Při písmu {cfg.fontPt} pt se nejdelší {lay && !lay.fits ? 'jméno nebo název družstva ve výsledcích' : 'název družstva v pořadí'} nevejde na jeden řádek — v DOCX/PDF se zalomí. Zkuste menší písmo.</div>
                )}
              </div>
            )}
          </div>
        </div>
        <SavepointsCard draft={draft} hint="Koncept (ukládá se průběžně): datum, vzhled, písmo a text Různé. Save point navíc zmrazí pořadí družstev (celé řádky z chess.cz) a všechny rozhodčí kola; obnovení je vrátí. Výsledky se načtou vždy aktuální." />
      </div>

      {!model || !lay || !sl ? (
        <div className="card"><div className="card-body muted">{cz.isLoading ? `Načítám data z chess.cz (${progress})…` : c.chesscz_comp_id ? 'Načítám…' : 'Bez chess.cz nelze zpravodaj z kola sestavit.'}</div></div>
      ) : (
        <div className="doc-wrap">
          <div className="rdoc" style={{ padding: `${px(HDR_DIST)} ${px(MARGIN_X)} ${px(MARGIN_B)}`, fontSize: ptPx(cfg.fontPt) }}>
            <div className="rdoc-top" style={{ height: px(MARGIN_T - HDR_DIST) }}>
              <div className="rdoc-hdr" style={{ fontSize: ptPx(model.hdr.size), color: css(model.hdr.color), ...ruleCss(model.hdr.rule) }}>
                {model.hdr.c != null ? <span className="c">{model.hdr.c}</span> : <><span>{model.hdr.l ?? ''}</span><span>{model.hdr.r ?? ''}</span></>}
              </div>
            </div>
            {model.titles.map((t, i) => (
              <div key={i} style={{
                fontSize: ptPx(t.size), fontWeight: t.bold ? 700 : 400, color: css(t.color), textAlign: t.align, marginBottom: ptPx(t.after),
                ...(model.profile.titleRule && i === model.titles.length - 1 ? { borderBottom: `1.5px solid ${css(model.profile.titleRule)}`, paddingBottom: ptPx(3) } : {}),
              }}>{t.text}</div>
            ))}
            {[0, 1, 2].map((ci) => (
              <Fragment key={ci}>
                <div className={`rdoc-h${ci === 0 ? ' first' : ''}`} style={{ fontSize: ptPx(model.chap.size), color: css(model.chap.color), ...ruleCss(model.chap.rule) }}>{model.chap.labels[ci]}</div>
                {ci === 0 && model.matches.map((m, mi) => (
                  <table key={m.nr} className="rdoc-res" style={{ width: px(sum(matchCols(lay))) }}>
                    <Cols ws={matchCols(lay)} />
                    <tbody>
                      <tr className="mh"><td className="c">{m.nr}</td><td colSpan={2}>{m.home}</td><td className="c">{m.score}</td><td className="r" colSpan={2}>{m.away}</td></tr>
                      {m.games.map((g, gi) => (
                        <tr key={gi}><td className="c">{gi + 1}</td><td>{g.home}</td><td className="r">{g.homeElo}</td><td className="c">{g.result}</td><td>{g.awayElo}</td><td>{g.away}</td></tr>
                      ))}
                      {cfg.withRef && (
                        <tr><td colSpan={6}>{REF_LABEL}
                          <RefPicker idx={mi} value={m.ref} changed={isEdited(m)} placeholder={m.assigned ? undefined : 'nenominován'}
                            title={isEdited(m) ? `Přepsáno v tomto zpravodaji (Nominace rozhodčích: ${m.assigned || 'nikdo'})` : 'Z karty Nominace rozhodčích; přepsání platí jen pro tento zpravodaj'}
                            home={contactsOf.get(m.key) ?? []} away={contactsOf.get(m.awayKey) ?? []}
                            onChange={(v) => setRef(m.key, v)} onUndo={() => setRef(m.key, null)} />
                        </td></tr>
                      )}
                    </tbody>
                  </table>
                ))}
                {ci === 1 && (
                  <table className="rdoc-stand" style={{ width: px(sum(sl.cols)) }}>
                    <Cols ws={sl.cols} />
                    <thead><tr>{STAND_HDRS.map((h, i) => <th key={h} className={i === 1 ? 'l' : 'c'}>{h}</th>)}</tr></thead>
                    <tbody>{model.standings.map((r, ri) => <tr key={ri}>{r.map((v, i) => <td key={i} className={i === 1 ? 'l' : 'c'}>{v}</td>)}</tr>)}</tbody>
                  </table>
                )}
                {ci === 2 && (
                  <div className="d-rich">
                    <div className="d-rich-bar">
                      <span>Různé · {model.rozne.custom ? 'upraveno' : 'výchozí text (sleduje vedoucího a datum vydání)'}</span>
                      {model.rozne.custom && (
                        <button className="btn btn-small" onClick={() => {
                          if (!window.confirm('Vrátit sekci Různé na výchozí text? Úpravy se ztratí.')) return;
                          update((x) => ({ ...x, rozne: null }));
                          setResetN((n) => n + 1);
                        }}>Výchozí text</button>
                      )}
                    </div>
                    <RichEditor key={`${draft.version}-${resetN}-${JSON.stringify(model.rozne.defaults)}`} value={model.rozne.ops}
                      placeholder="Poznámky, pozvánky, kontakt…" onChange={(ops) => update((x) => ({ ...x, rozne: ops }))} />
                  </div>
                )}
              </Fragment>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
