// Response of the public schedule API (GET /api/v1/public/competitions/:id), shared by the Worker and the page.
import type { SchedRound, SchedMatch } from './schedule';

export type PublicSchedule = {
  competition: {
    name: string; region: string; season: string; defaultStart: string;
    chessczUrl: string | null; chessResultsUrl: string | null;
  };
  teams: { key: string; stc: number | null; name: string; venue: string; captain: { name: string; phone: string; email: string } | null }[];
  rounds: (Omit<SchedRound, 'matches'> & { matches: (SchedMatch & { ref: string })[] })[];
};
