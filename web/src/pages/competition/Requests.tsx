import { REQUEST_KIND_LABEL } from '../../lib/format';
import { shortTime } from '../../../../shared/startTime';
import { useCompetition } from './CompetitionLayout';
import { NewRequestForm, RequestTable } from './RequestItems';

// Draw-meeting requests (start times, draw conditions, date changes …) — the basis of the meeting (M7).
// An accepted start-time request becomes the team's start exception (as in uvodni-zpravodaj);
// a draw request carries a structured condition checked on the Losování tab.
export function Requests() {
  const { data } = useCompetition();
  const c = data.competition;
  const active = data.teams.filter((t) => t.status === 'active');
  const byKind = Object.keys(REQUEST_KIND_LABEL).map((k) => [k, data.requests.filter((r) => r.kind === k)] as const).filter(([, l]) => l.length);
  const exceptions = active.flatMap((t) => [
    ...(t.start_home ? [`${t.name} — domácí utkání v ${shortTime(t.start_home)} hodin`] : []),
    ...(t.start_away ? [`${t.name} — utkání venku v ${shortTime(t.start_away)} hodin`] : []),
  ]);

  return (
    <>
      <div className="card">
        <div className="card-strip"><h2>Jiné začátky utkání</h2>
          <span className="helper">Výchozí začátek {shortTime(c.default_start)} · v posledním kole se výjimky neuplatní.</span></div>
        <div className="card-body">
          {exceptions.length
            ? <ul className="list-plain" style={{ marginTop: 0 }}>{exceptions.map((x) => <li key={x}>{x}</li>)}</ul>
            : <p className="muted" style={{ margin: 0 }}>Žádné výjimky. Vznikají schválením požadavku na začátek utkání (nebo v detailu družstva).</p>}
        </div>
      </div>

      <div className="card">
        <div className="card-strip"><h2>Požadavky pro losovací schůzi</h2>
          <span className="helper">Z e-soupisek se přenesou automaticky; požadavky z e-mailů doplňte ručně.</span></div>
        <div className="card-body table-scroll">
          {!data.requests.length && <p className="muted">Zatím žádné požadavky.</p>}
          {byKind.map(([kind, list]) => (
            <div key={kind}>
              <div className="section-title">{REQUEST_KIND_LABEL[kind]}</div>
              <RequestTable requests={list} showKind={false} />
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-strip"><h2>Nový požadavek</h2></div>
        <div className="card-body"><NewRequestForm /></div>
      </div>
    </>
  );
}
