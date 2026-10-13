import { flagParts } from '../../../shared/roster/draft';

/** Roster designation as three columns in a fixed order: Z | K/ZK | H/V/C (under one "Označení" header, colSpan 3). */
export function FlagCells({ flags, z }: { flags: string; z: boolean }) {
  const { cap, letter } = flagParts(flags);
  return (
    <>
      <td className="flag">{z && <span className="chip active">Z</span>}</td>
      <td className="flag">{cap && <span className="chip active">{cap}</span>}</td>
      <td className="flag">{letter && <span className="chip active">{letter}</span>}</td>
    </>
  );
}
