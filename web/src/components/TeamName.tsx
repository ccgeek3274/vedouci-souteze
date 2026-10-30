import { Link, useParams } from 'react-router-dom';

/**
 * Team name followed by an icon linking to the team's roster page (/c/:id/t/:teamId). Absolute path, so it works
 * from any tab of the competition. Only the icon is a link, never the name. Without a team id (a chess.cz team not
 * in the app) only the name is shown. Match listings (two teams side by side) use plain names without the icon.
 */
export function TeamName({ id, name, bold = false }: { id: string | null | undefined; name: string; bold?: boolean }) {
  const { id: competitionId } = useParams();
  if (!id || !competitionId) return <span style={bold ? { fontWeight: 600 } : undefined}>{name}</span>;
  const to = `/c/${competitionId}/t/${id}`;
  return (
    <span className="team-name">
      <span style={bold ? { fontWeight: 600 } : undefined}>{name}</span>
      <Link className="team-link no-print" to={to} title={`Soupiska družstva ${name}`} aria-label={`Soupiska družstva ${name}`}>
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <rect x="3" y="2.5" width="10" height="12" rx="1.5" />
          <path d="M6 2.5V1.5h4v1M5.5 7h5M5.5 9.5h5M5.5 12h3" />
        </svg>
      </Link>
    </span>
  );
}
