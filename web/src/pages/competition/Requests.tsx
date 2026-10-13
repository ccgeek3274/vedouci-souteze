import { REQUEST_KIND_LABEL } from '../../lib/format';
import { shortTime } from '../../../../shared/startTime';
import { useCompetition } from './CompetitionLayout';
import { NewRequestForm, RequestTable } from './RequestItems';

// Draw-meeting requests (start times, draw conditions, date changes …) — the basis of the meeting (M7).
// An accepted start-time request becomes the team's start exception (as in uvodni-zpravodaj);
// a draw request carries a structured condition checked on the Losování tab.
const KIND_TITLE: Record<string, string> = {
  start_time: 'Požadavky na začátek utkání', draw_no: 'Požadavky na losování', date_change: 'Změny termínů', other: 'Jiné požadavky',
};

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

      {!data.requests.length && (
        <div className="card"><div className="card-strip"><h2>Požadavky pro losovací schůzi</h2></div>
          <div className="card-body muted">Zatím žádné požadavky. Z e-soupisek se přenesou automaticky; požadavky z e-mailů doplňte ručně.</div></div>
      )}
      {byKind.map(([kind, list]) => (
        <div className="card" key={kind}>
          <div className="card-strip"><h2>{KIND_TITLE[kind] ?? REQUEST_KIND_LABEL[kind]}</h2>
            <span className="badge" title="počet">{list.length}</span>
            {list.some((r) => r.status === 'new') && <span className="helper">{list.filter((r) => r.status === 'new').length} nových</span>}</div>
          <div className="card-body table-scroll" style={{ paddingTop: 8, paddingBottom: 8 }}>
            <RequestTable requests={list} showKind={false} />
          </div>
        </div>
      ))}

      <div className="card">
        <div className="card-strip"><h2>Nový požadavek</h2></div>
        <div className="card-body"><NewRequestForm /></div>
      </div>
    </>
  );
}
