// Round-robin schedule from the FIDE Berger tables (as Swiss-Manager / chess.cz use them).
// Verified against the real RPB 2026/27 draw (10 teams): round 1 = 1–N, 2–(N−1) …; round 2 = N–(N/2+1), …, 1–2.
// An odd number of teams is padded with a dummy number N = n+1: its opponent has a bye ("volno").

/** One pairing by draw numbers; `away === null` = bye of `home`. */
export type Pairing = { board: number; home: number; away: number | null };

const wrap = (x: number, m: number) => ((((x - 1) % m) + m) % m) + 1;

/** Berger rounds for `n` teams (draw numbers 1..n); `rounds[r][k]` = table k+1 of round r+1. */
export function bergerRounds(n: number): Pairing[][] {
  if (n < 2) return [];
  const N = n + (n % 2);
  const m = N - 1;
  const out: Pairing[][] = [];
  for (let r = 0; r < m; r++) {
    // Opponent of the fixed number N; N plays away in odd rounds (1, 3, …) and at home in even ones.
    const x = ((r * N) / 2) % m + 1;
    const ms: Pairing[] = [r % 2 === 0 ? { board: 1, home: x, away: N } : { board: 1, home: N, away: x }];
    for (let k = 1; k < N / 2; k++) ms.push({ board: k + 1, home: wrap(x + k, m), away: wrap(x - k, m) });
    out.push(ms.map((p) => {
      if (N === n) return p;
      // dummy number = bye of the other team
      if (p.home === N) return { board: p.board, home: p.away!, away: null };
      if (p.away === N) return { board: p.board, home: p.home, away: null };
      return p;
    }));
  }
  return out;
}

/** Round (1-based) in which draw numbers a and b meet, with `aHome`. */
export function meeting(rounds: Pairing[][], a: number, b: number): { round: number; aHome: boolean } | null {
  for (let r = 0; r < rounds.length; r++) {
    for (const p of rounds[r]) {
      if (p.home === a && p.away === b) return { round: r + 1, aHome: true };
      if (p.home === b && p.away === a) return { round: r + 1, aHome: false };
    }
  }
  return null;
}

/** Whether draw number `no` plays at home in each round (null = bye). */
export function homePattern(rounds: Pairing[][], no: number): (boolean | null)[] {
  return rounds.map((ms) => {
    const p = ms.find((x) => x.home === no || x.away === no);
    return !p || p.away === null ? null : p.home === no;
  });
}
