import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, apiErrorText } from '../../lib/api';
import type { RosterCheckData } from '../../lib/types';
import { useCompetition } from './CompetitionLayout';
import { RichEditor } from '../../components/RichEditor';
import { assemble, loadChesscz } from '../../bulletin/load';
import { buildDocxBlob } from '../../bulletin/docx';
import { buildPdfBlob, pdfPageMap } from '../../bulletin/pdf';
import { paginate, type PageMap } from '../../bulletin/paginate';
import {
  buildModel, CONFLICT, CZ_DAYS, normalizeConfig, type InitialConfig, type Section, type TextKey,
} from '../../../../shared/bulletin/initial';
import {
  CAL_COL, CAL_GAP, CONTACT_COLS, GAP_PARA_H, HDR_DIST, ROSTER_TITLE_H, INTRO_ID, MARGIN_X, MARGIN_Y, ROSTER_COLS, ROSTER_GAP, ROSTER_PAIR_GAP, ROSTER_W,
  VENUE_COLS, pairs, schedCols, sectionId,
} from '../../bulletin/layout';
import { downloadBlob, SAVE_TEXT, saveTagClass, SavepointsCard, useBulletinDraft } from '../../bulletin/draft';

// Úvodní zpravodaj (M8): rosters and the schedule from chess.cz, venues / contacts / start-time exceptions from
// the app, referees from the referee assignment page (read-only here). Only the draft config is stored (autosave +
// named save points); DOCX / PDF are generated in the browser on download.
export function InitialBulletin() {
  const { data: detail } = useCompetition();
  const c = detail.competition;
  const qc = useQueryClient();
  const [progress, setProgress] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const draft = useBulletinDraft(c.id, 'initial', normalizeConfig);
  const { stored, cfg, update, error, setError } = draft;
  const editorVersion = draft.version;
  const check = useQuery({ queryKey: ['roster-check', c.id], queryFn: () => api.get<RosterCheckData>(`/competitions/${c.id}/roster-check`) });
  const refsQ = useQuery({ queryKey: ['referees', c.id], queryFn: () => api.get<{ assignments: Record<string, string> }>(`/competitions/${c.id}/referees`) });
  const cz = useQuery({
    queryKey: ['bulletin-cz', c.id, c.chesscz_comp_id],
    queryFn: () => loadChesscz(c.chesscz_comp_id, setProgress),
    staleTime: 10 * 60_000,
  });

  const assembled = useMemo(
    () => (cfg && cz.data && refsQ.data ? assemble(detail, check.data, cz.data, cfg, refsQ.data.assignments) : null),
    [cfg, cz.data, detail, check.data, refsQ.data],
  );
  const model = useMemo(() => (assembled && cfg ? buildModel(assembled.data, cfg) : null), [assembled, cfg]);

  // Page breaks of the preview: estimate at once, then the real ones from the PDF laid out in the background.
  const docRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const cssRef = useRef<HTMLStyleElement>(null);
  const [pageMap, setPageMap] = useState<PageMap | null>(null);
  const structure = model ? JSON.stringify(model.chapters.map((ch) => [ch.title, ch.sections.map((x) => x.type)])) : '';
  useEffect(() => setPageMap(null), [structure]); // other blocks → the old map does not apply
  useEffect(() => {
    if (!model) return;
    let alive = true;
    const t = window.setTimeout(() => {
      pdfPageMap(model).then((m) => alive && setPageMap(m)).catch(() => { /* the estimate stays */ });
    }, 300);
    return () => { alive = false; window.clearTimeout(t); };
  }, [model]);
  useLayoutEffect(() => {
    if (docRef.current && layerRef.current && cssRef.current) paginate(docRef.current, layerRef.current, cssRef.current, pageMap, MARGIN_Y);
  });

  if (stored.isLoading || !cfg) return <div className="muted">Načítám…</div>;
  if (stored.error) return <div className="alert">{apiErrorText(stored.error)}</div>;

  const download = async (kind: 'docx' | 'pdf') => {
    if (!model) return;
    setBusy(kind);
    setError(null);
    try {
      const blob = kind === 'docx' ? await buildDocxBlob(model) : await buildPdfBlob(model);
      downloadBlob(blob, `${model.fileName}.${kind}`);
    } catch (e) {
      setError(`${kind.toUpperCase()} se nepodařilo vytvořit: ${apiErrorText(e) ?? e}`);
    } finally {
      setBusy(null);
    }
  };

  const reloadCz = async () => {
    // refresh=true bypasses the proxy cache for the competition's chess.cz data
    if (c.chesscz_comp_id) {
      const id = c.chesscz_comp_id;
      setProgress('obnovuji');
      for (const p of ['details', 'table', 'schedule']) await api.get(`/chesscz/competitions/${id}/${p}?refresh=true`).catch(() => null);
      for (const t of cz.data?.teams ?? []) await api.get(`/chesscz/competitions/${id}/team/${t.id}/roster?refresh=true`).catch(() => null);
    }
    await qc.invalidateQueries({ queryKey: ['bulletin-cz', c.id] });
  };

  const av = assembled?.availability;

  return (
    <>
      <div className="card">
        <div className="card-strip">
          <h2>Úvodní zpravodaj</h2>
          <span className={saveTagClass(draft.saveState)}>{SAVE_TEXT[draft.saveState]}</span>
        </div>
        <div className="card-body">
          <div className="bulletin-bar">
            <div className="segmented">
              <button className={cfg.kind === 'preliminary' ? 'active' : ''} onClick={() => update((x) => ({ ...x, kind: 'preliminary' }))}>Předběžný</button>
              <button className={cfg.kind === 'definitive' ? 'active' : ''} onClick={() => update((x) => ({ ...x, kind: 'definitive' }))}>Definitivní</button>
            </div>
            <label className="field-inline">Datum vydání
              <input className="input input-sm" type="date" value={cfg.date ?? new Date().toISOString().slice(0, 10)}
                onChange={(e) => update((x) => ({ ...x, date: e.target.value || null }))} />
            </label>
            <label className="field-inline"><input type="checkbox" checked={cfg.withRef} onChange={(e) => update((x) => ({ ...x, withRef: e.target.checked }))} /> rozhodčí v rozlosování</label>
            <label className="field-inline"><input type="checkbox" checked={cfg.calendar} onChange={(e) => update((x) => ({ ...x, calendar: e.target.checked }))} /> kalendář</label>
            <span className="spacer" />
            <button className="btn btn-primary" disabled={!model || !!busy} onClick={() => download('docx')}>{busy === 'docx' ? 'Vytvářím…' : 'Stáhnout DOCX'}</button>
            <button className="btn" disabled={!model || !!busy} onClick={() => download('pdf')}>{busy === 'pdf' ? 'Vytvářím…' : 'Stáhnout PDF'}</button>
          </div>
          <p className="helper-text">
            {cfg.kind === 'preliminary'
              ? 'Předběžný zpravodaj obsahuje kapitolu Nedostatky soupisek (z kontroly soupisek) a všechny hráče soupisek.'
              : 'Definitivní zpravodaj vynechá vyškrtnuté hráče a kapitolu Nedostatky soupisek.'}
            {' '}Soubor: <span className="mono">{model?.fileName ?? '…'}</span>
          </p>
          {error && <div className="alert">{error}</div>}
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-strip"><h2>Zdroj dat</h2>
            <button className="btn btn-small" disabled={cz.isFetching} onClick={reloadCz}>{cz.isFetching ? `Načítám ${progress}…` : 'Načíst znovu z chess.cz'}</button>
          </div>
          <div className="card-body">
            {cz.error && <div className="alert">chess.cz: {apiErrorText(cz.error)}</div>}
            {!c.chesscz_comp_id && <p className="muted">Soutěž není spárovaná se soutěží na chess.cz (Přehled → chess.cz ID).</p>}
            {av && (
              <ul className="list-plain source-list">
                <li><span className={`tag ${av.czTeams ? 'ok' : ''}`}>{av.czTeams ? 'chess.cz' : 'aplikace'}</span> Družstva a startovní čísla</li>
                <li>
                  <span className={`tag ${av.czSchedule ? 'ok' : cfg.appData.schedule ? '' : 'bad'}`}>{av.czSchedule ? 'chess.cz' : cfg.appData.schedule ? 'aplikace' : 'chybí'}</span> Rozlosování
                  {!av.czSchedule && (av.appSchedule
                    ? <label className="confirm"><input type="checkbox" checked={cfg.appData.schedule} onChange={(e) => update((x) => ({ ...x, appData: { ...x.appData, schedule: e.target.checked } }))} /> Na chess.cz zatím není — použít rozlosování z aplikace (losovací čísla → Berger)</label>
                    : <div className="muted">Na chess.cz zatím není a v aplikaci nejsou zadána všechna losovací čísla.</div>)}
                </li>
                <li>
                  <span className={`tag ${!av.missingCzRosters.length ? 'ok' : cfg.appData.rosters ? '' : 'bad'}`}>
                    {!av.missingCzRosters.length ? 'chess.cz' : av.czRosters ? `chess.cz ${av.czRosters}/${av.czRosters + av.missingCzRosters.length}` : cfg.appData.rosters ? 'aplikace' : 'chybí'}
                  </span> Soupisky
                  {av.missingCzRosters.length > 0 && (
                    <>
                      <div className="muted">Na chess.cz chybí: {av.missingCzRosters.join(', ')}</div>
                      {av.appRosters > 0 && <label className="confirm"><input type="checkbox" checked={cfg.appData.rosters} onChange={(e) => update((x) => ({ ...x, appData: { ...x.appData, rosters: e.target.checked } }))} /> Použít pro ně soupisky z aplikace (Elo z poslední kontroly soupisek)</label>}
                    </>
                  )}
                </li>
                <li><span className="tag">aplikace</span> Hrací místnosti, kontakty, schválené začátky utkání; rozhodčí z karty <Link to="../rozhodci">Nominace rozhodčích</Link></li>
              </ul>
            )}
            {model && model.warnings.length > 0 && (
              <div className="issues">{model.warnings.map((w) => <div key={w} className="warn">! {w}</div>)}</div>
            )}
          </div>
        </div>

        <SavepointsCard draft={draft} hint="Ukládá se jen koncept: texty, datum a volby. Rozhodčí jsou z karty Nominace rozhodčích. Soupisky a rozlosování se vždy načtou aktuální z chess.cz, místnosti a kontakty z družstev." />
      </div>

      {!model ? (
        <div className="card"><div className="card-body muted">{cz.isLoading ? `Načítám data z chess.cz (${progress})…` : 'Načítám…'}</div></div>
      ) : (
        <div className="doc-wrap">
          <style ref={cssRef} />
          <div className="doc pgdoc" ref={docRef} style={{ padding: `${px(HDR_DIST)} ${px(MARGIN_X)} ${px(MARGIN_Y)}` }}>
            <div className="doc-top" data-pg-skip="" style={{ height: px(MARGIN_Y - HDR_DIST) }}>
              <div className="doc-hdr" data-pg-hdr="">{model.header}</div>
            </div>
            <div className="d-title" data-pg="t0">{model.title}</div>
            {model.subtitles.map((s, i) => <div key={s} className="d-sub" data-pg={`t${i + 1}`}>{s}</div>)}
            <div className="d-gap" />
            <SectionView s={model.intro} id={INTRO_ID} cfg={cfg} update={update} version={editorVersion} />
            {model.chapters.map((ch, i) => (
              <Fragment key={ch.title}>
                <div className={`d-h${ch.pageBreak ? ' pb' : ''}`} data-pg={`h${i}`} data-pg-keep="" data-pg-break={ch.pageBreak ? '' : undefined}>{i + 1}. {ch.title}</div>
                {ch.sections.map((s, j) => <SectionView key={j} s={s} id={sectionId(i, j)} cfg={cfg} update={update} version={editorVersion} />)}
              </Fragment>
            ))}
            <div className="pg-layer" ref={layerRef} />
          </div>
        </div>
      )}
    </>
  );
}

const TEXT_HINT: Record<TextKey, string> = {
  intro: 'Úvod', requirements: 'Doplňující text', deficiencies: 'Nedostatky soupisek', referees: 'Rozhodčí', announcements: 'Další oznámení', results: 'Hlášení výsledků',
};

const px = (dxa: number) => `${(dxa / 15).toFixed(2)}px`; // 1 px = 15 DXA (preview 1:1 with the PDF)
const Cols = ({ ws }: { ws: number[] }) => <colgroup>{ws.map((w, i) => <col key={i} style={{ width: px(w) }} />)}</colgroup>;

/**
 * One section of the preview as direct children of the document (the units of its page breaks); `id` = prefix of the
 * PDF node ids (pdf.ts) → data-pg.
 */
function SectionView({ s, id, cfg, update, version }: {
  s: Section; id: string; cfg: InitialConfig; update: (fn: (c: InitialConfig) => InitialConfig) => void; version: number;
}) {
  const [resetN, setResetN] = useState(0);
  switch (s.type) {
    case 'rich':
      return (
        <div className="d-rich" data-pg={id}>
          <div className="d-rich-bar">
            <span>{TEXT_HINT[s.key]} · {s.custom ? 'upraveno' : 'výchozí text (sleduje data)'}</span>
            {s.custom && (
              <button className="btn btn-small" onClick={() => {
                update((x) => { const texts = { ...x.texts }; delete texts[s.key]; return { ...x, texts }; });
                setResetN((n) => n + 1);
              }}>Výchozí text</button>
            )}
          </div>
          <RichEditor key={`${version}-${resetN}-${JSON.stringify(s.defaults)}`} value={s.ops}
            onChange={(ops) => update((x) => ({ ...x, texts: { ...x.texts, [s.key]: ops } }))} />
        </div>
      );
    case 'lines':
      return <>{s.lines.map((l, i) => <div key={i} className="d-p" data-pg={`${id}${i}`}>{l}</div>)}</>;
    case 'venues':
      return (
        <>{s.rows.map((r, i) => (
          <table key={i} className="d-tbl d-row" data-pg={`${id}${i}`}><Cols ws={VENUE_COLS} /><tbody>
            <tr><td className="c">{r.stc}</td><td className="b">{r.name}</td><td>{r.venue || <span className="d-missing">chybí hrací místnost</span>}</td></tr>
          </tbody></table>
        ))}</>
      );
    case 'contacts': {
      let k = 0; // row index as in the PDF table (team row + its contacts)
      const row = (key: string | undefined, cells: React.ReactNode) => (
        <table key={key ?? `x${k}`} className="d-tbl d-row" data-pg={key} data-pg-ghost={key ? undefined : ''}><Cols ws={CONTACT_COLS} /><tbody><tr>{cells}</tr></tbody></table>
      );
      return (
        <>{s.teams.map((t) => (
          <Fragment key={t.name}>
            {row(`${id}${k++}`, <td colSpan={4} className="b sub">{t.name}</td>)}
            {t.rows.length ? t.rows.map((r) => row(`${id}${k++}`, <><td>{r.label}</td><td>{r.name}</td><td>{r.phone}</td><td>{r.email}</td></>))
              : row(undefined, <td colSpan={4}><span className="d-missing">chybí kontakty</span></td>)}
          </Fragment>
        ))}</>
      );
    }
    case 'rosters':
      return (
        <>{pairs(s.teams).map((p, i) => (
          <div key={i} className="d-pair" data-pg={`${id}${i}`} style={{ gap: px(ROSTER_GAP), marginBottom: px(ROSTER_PAIR_GAP + GAP_PARA_H) }}>
            {p.map((t) => (
              <div key={t.name} style={{ width: px(ROSTER_W) }}>
                <div className="d-tn d-rn" style={{ height: px(ROSTER_TITLE_H) }}>{t.stc ?? ''}&nbsp;&nbsp;{t.name}</div>
                <table className="d-tbl d-roster"><Cols ws={ROSTER_COLS} /><tbody>
                  <tr className="sub b"><td></td><td>Jméno</td><td className="c">NRtg</td><td className="c">IRtg</td><td className="c">Z</td><td className="c">P</td><td className="c">K</td></tr>
                  {t.players.length ? t.players.map((pl) => (
                    <tr key={pl.pos} className={pl.struck ? 'struck' : ''} title={pl.struck ? 'vyškrtnut — v definitivním zpravodaji vynechán' : undefined}>
                      <td className="c">{pl.pos}</td><td>{pl.display}</td><td className="c">{pl.nrtg || ''}</td><td className="c">{pl.irtg || ''}</td><td className="c">{pl.z ? 'Z' : ''}</td><td className="c">{pl.letter}</td><td className="c">{pl.cap}</td>
                    </tr>
                  )) : <tr><td colSpan={7}><span className="d-missing">soupiska chybí</span></td></tr>}
                </tbody></table>
              </div>
            ))}
          </div>
        ))}</>
      );
    case 'rounds':
      return (
        <>
          {s.rounds.map((r, i) => (
            <table key={r.nr} className="d-tbl d-round" data-pg={`${id}${i}`}><Cols ws={schedCols(s.withRef)} /><tbody>
              <tr className="rh"><td colSpan={s.withRef ? 7 : 6}>{r.header}</td></tr>
              <tr className="sub b"><td className="c">Č.</td><td className="c">St.</td><td>Družstvo</td><td className="c">-</td><td>Družstvo</td><td className="c">St.</td>{s.withRef && <td>Rozhodčí</td>}</tr>
              {r.rows.map((m) => (
                <tr key={m.board}>
                  <td className="c">{m.board}</td><td className="c">{m.homeStc}</td>
                  <td>{m.homeName}{m.time && <span className="tm"> {m.time}{m.time === CONFLICT ? '' : ' hodin'}</span>}</td>
                  <td className="c">-</td><td>{m.awayName}</td><td className="c">{m.awayStc}</td>
                  {s.withRef && <td title="Rozhodčí se mění na kartě Nominace rozhodčích">{m.ref || <span className="d-missing">nenominován</span>}</td>}
                </tr>
              ))}
            </tbody></table>
          ))}
        </>
      );
    case 'links':
      return <>{s.links.map((l, i) => <div key={l.url} className="d-link" data-pg={`${id}${i}`}>{l.label}: <a href={l.url} target="_blank" rel="noreferrer">{l.url}</a></div>)}</>;
    case 'signature':
      return s.name ? <div className="d-sign" data-pg={`${id}0`}>{s.name}{s.email && <><br />{s.email}</>}{s.phone && <><br />tel: {s.phone}</>}</div> : null;
    case 'calendar':
      return (
        <>{pairs(s.months).map((p, i) => {
          const weeks = Math.max(...p.map((m) => m.weeks.length));
          return (
            <div key={i} className="d-pair d-cal-pair" data-pg={`${id}${i}`} style={{ gap: px(CAL_GAP / 2) }}>
              {[...p, ...(p.length < 2 ? [null] : [])].map((mo, j) => (
                <div key={j} style={{ width: px(7 * CAL_COL) }}>
                  {mo && (
                    <>
                      <div className="d-tn">{mo.name}</div>
                      <table className="d-tbl d-cal"><Cols ws={Array(7).fill(CAL_COL)} /><tbody>
                        <tr className="sub b">{CZ_DAYS.map((d) => <td key={d} className="c">{d}</td>)}</tr>
                        {[...mo.weeks, ...Array(weeks - mo.weeks.length).fill(Array(7).fill(null))].map((wk, wi) => (
                          <tr key={wi} className="wk" style={{ height: px(CAL_COL) }}>{wk.map((d: typeof mo.weeks[0][0], di: number) => (
                            <td key={di} className={d?.rounds.length ? 'hit' : di >= 5 ? 'we' : undefined} title={d?.rounds.length ? `${d.rounds.join('., ')}. kolo` : undefined}>{d?.d ?? ''}</td>
                          ))}</tr>
                        ))}
                      </tbody></table>
                    </>
                  )}
                </div>
              ))}
            </div>
          );
        })}</>
      );
  }
}
