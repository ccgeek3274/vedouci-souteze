import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Navigate, NavLink, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import type { BulletinSummary } from '../../lib/types';
import { useCompetition } from './CompetitionLayout';
import { loadChesscz } from '../../bulletin/load';
import { todayIso } from '../../../../shared/bulletin/initial';
import { pickRound } from '../../../../shared/bulletin/round';
import { InitialBulletin } from './Bulletin';
import { RoundBulletin } from './RoundBulletin';

const shortDate = (iso: string) => {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${+m[2]}. ${+m[1]}.` : '';
};

// Záložka Zpravodaj: úvodní zpravodaj + zpravodaje z kol, switched in the header (/zpravodaj/uvodni, /zpravodaj/kolo-N).
// Without a key the bulletin is picked by today's date: the last round played so far, before the first round the úvodní.
export function Bulletins() {
  const { key } = useParams();
  const { data: detail } = useCompetition();
  const c = detail.competition;
  const base = `/c/${c.id}/zpravodaj`;

  const list = useQuery({ queryKey: ['bulletins', c.id], queryFn: () => api.get<{ bulletins: BulletinSummary[] }>(`/competitions/${c.id}/bulletins`) });
  // Round dates come with the competition; only when it has none (no rozpis imported) from the chess.cz schedule.
  const needCz = !detail.rounds.length && !!c.chesscz_comp_id;
  const czSched = useQuery({
    queryKey: ['schedule-cz', c.id, c.chesscz_comp_id],
    queryFn: () => loadChesscz(c.chesscz_comp_id, () => {}, false),
    enabled: needCz,
    staleTime: 10 * 60_000,
  });
  const rounds = useMemo(
    () => (detail.rounds.length ? detail.rounds.map((r) => ({ nr: r.round, date: r.date })) : czSched.data?.rounds.map((r) => ({ nr: r.nr, date: r.date })) ?? [])
      .sort((a, b) => a.nr - b.nr),
    [detail.rounds, czSched.data],
  );
  const auto = pickRound(rounds, todayIso());
  const autoKey = auto ? `kolo-${auto}` : 'uvodni';

  if (!key) {
    if (needCz && czSched.isLoading) return <div className="muted">Načítám…</div>;
    return <Navigate to={`${base}/${autoKey}`} replace />;
  }
  const nr = /^kolo-(\d{1,2})$/.exec(key)?.[1];
  if (key !== 'uvodni' && !nr) return <Navigate to={base} replace />;

  const saved = new Set((list.data?.bulletins ?? []).filter((b) => b.updated_at != null).map((b) => b.key));
  const mark = (k: string) => (saved.has(k) ? <span className="bsw-saved" title="Koncept uložen">•</span> : null);
  const cls = (k: string) => `chip${k === autoKey ? ' bsw-auto' : ''}`;

  return (
    <>
      <nav className="bsw no-print" aria-label="Zpravodaje">
        <NavLink to={`${base}/uvodni`} className={cls('uvodni')} title={autoKey === 'uvodni' ? 'Podle dnešního data (soutěž ještě nezačala)' : undefined}>Úvodní{mark('initial')}</NavLink>
        {rounds.map((r) => (
          <NavLink key={r.nr} to={`${base}/kolo-${r.nr}`} className={cls(`kolo-${r.nr}`)}
            title={`${r.nr}. kolo${r.date ? ` · ${shortDate(r.date)}` : ''}${autoKey === `kolo-${r.nr}` ? ' — poslední odehrané kolo podle dnešního data' : ''}`}>
            {r.nr}. kolo{r.date && <span className="bsw-date">{shortDate(r.date)}</span>}{mark(`round-${r.nr}`)}
          </NavLink>
        ))}
      </nav>
      {nr ? <RoundBulletin key={nr} nr={Number(nr)} /> : <InitialBulletin key="initial" />}
    </>
  );
}
