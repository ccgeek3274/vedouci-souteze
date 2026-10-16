import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, apiErrorText, ApiError } from '../lib/api';
import { CONFLICT, roundDate } from '../../../shared/bulletin/initial';
import type { PublicSchedule as Data } from '../../../shared/publicSchedule';

// Public schedule (no login), modelled on chess.cz: /rozpis/:id = all rounds with starts and referees,
// /rozpis/:id/druzstvo/:teamKey = one team's matches, captain and venue (no roster).
export function PublicSchedule() {
  const { id = '', teamKey } = useParams();
  const q = useQuery({ queryKey: ['public', id], queryFn: () => api.get<Data>(`/public/competitions/${id}`), retry: false });
  const d = q.data;
  const team = d && teamKey ? d.teams.find((t) => t.key === teamKey) : undefined;

  useEffect(() => {
    if (d) document.title = `${team ? `${team.name} – ` : ''}${d.competition.name} – rozpis`;
  }, [d, team]);

  if (q.isLoading) return <div className="page public"><p className="muted">Načítám rozpis…</p></div>;
  if (q.error || !d) {
    const notPublished = q.error instanceof ApiError && q.error.status === 404;
    return <div className="page public"><div className="alert">{notPublished ? 'Rozlosování této soutěže není zveřejněno.' : apiErrorText(q.error) ?? 'Rozpis se nepodařilo načíst.'}</div></div>;
  }

  const c = d.competition;
  const name = new Map(d.teams.map((t) => [t.key, t.name]));
  const base = `/rozpis/${id}`;
  const teamLink = (key: string) => <Link to={`${base}/druzstvo/${encodeURIComponent(key)}`}>{name.get(key) ?? '?'}</Link>;
  const start = (m: { time: string; conflict: boolean }) => (m.conflict ? CONFLICT : m.time);

  return (
    <div className="page public">
      <header className="comp-header">
        <div>
          <h1 className="page-title">{c.name}</h1>
          <p className="page-sub">{[c.region, `ročník ${c.season}`].filter(Boolean).join(' · ')}</p>
        </div>
        <nav className="public-links">
          {c.chessczUrl && <a href={c.chessczUrl} target="_blank" rel="noreferrer">Soutěž na chess.cz</a>}
          {c.chessResultsUrl && <a href={c.chessResultsUrl} target="_blank" rel="noreferrer">chess-results</a>}
        </nav>
      </header>

      {teamKey && !team ? (
        <div className="alert">Družstvo nenalezeno. <Link to={base}>Kompletní rozpis</Link></div>
      ) : team ? (
        <>
          <div className="card">
            <div className="card-strip"><h2>Družstvo – {team.name}</h2></div>
            <table className="table pub-table">
              <thead><tr><th>Kolo</th><th>Datum</th><th>Začátek</th><th>Zápas</th><th>Rozhodčí</th></tr></thead>
              <tbody>
                {d.rounds.flatMap((r) => r.matches.filter((m) => m.home === team.key || m.away === team.key).map((m) => (
                  <tr key={r.nr}>
                    <td>{r.nr}.</td>
                    <td>{roundDate(r.date)}</td>
                    <td className={m.exception ? 'pub-exc' : ''}>{start(m)}</td>
                    <td>
                      {m.home === team.key ? <b>{team.name}</b> : teamLink(m.home)}
                      {' : '}
                      {m.away === team.key ? <b>{team.name}</b> : teamLink(m.away)}
                    </td>
                    <td>{m.ref}</td>
                  </tr>
                )))}
              </tbody>
            </table>
            <table className="table pub-table pub-contacts">
              <thead><tr><th colSpan={2}>Kontakty</th></tr></thead>
              <tbody>
                <tr>
                  <td className="pub-label">Kapitán družstva</td>
                  <td>
                    {team.captain?.name}
                    {team.captain?.phone && <> · {team.captain.phone}</>}
                    {team.captain?.email && <> · <a href={`mailto:${team.captain.email}`}>{team.captain.email}</a></>}
                  </td>
                </tr>
                <tr><td className="pub-label">Hrací místnost</td><td>{team.venue}</td></tr>
              </tbody>
            </table>
            <div className="card-body"><Link to={base}>← Kompletní rozpis</Link></div>
          </div>
        </>
      ) : (
        <div className="card">
          <div className="card-strip"><h2>Rozpis – kompletní rozpis</h2></div>
          {!d.rounds.length && <div className="card-body muted">Rozlosování zatím není k dispozici.</div>}
          {d.rounds.map((r) => (
              <table key={r.nr} className="table pub-table pub-round">
                <colgroup><col className="pub-c-time" /><col /><col className="pub-c-dash" /><col /><col className="pub-c-ref" /></colgroup>
                <thead>
                  <tr><th>Začátek</th><th colSpan={3}>{r.nr}. kolo – {roundDate(r.date)}{r.last ? ' (poslední kolo)' : ''}</th><th>Rozhodčí</th></tr>
                </thead>
                <tbody>
                  {r.matches.map((m) => (
                    <tr key={m.board}>
                      <td className={m.exception ? 'pub-exc' : ''}>{start(m)}</td>
                      <td>{teamLink(m.home)}</td>
                      <td className="pub-dash">-</td>
                      <td>{teamLink(m.away)}</td>
                      <td>{m.ref}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
          ))}
        </div>
      )}

      <div className="card">
        <div className="card-strip"><h2>Družstva</h2></div>
        <div className="card-body public-teams">
          {d.teams.map((t) => <Link key={t.key} className={`chip${t.key === teamKey ? ' active' : ''}`} to={`${base}/druzstvo/${encodeURIComponent(t.key)}`}>{t.stc ? `${t.stc}. ` : ''}{t.name}</Link>)}
        </div>
      </div>
    </div>
  );
}
