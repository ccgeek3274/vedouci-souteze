import { describe, it, expect } from 'vitest';
import { routeTtl } from '../chesscz';

describe('chess.cz route whitelist', () => {
  it('allows known paths only', () => {
    expect(routeTtl('/competitions/3468/table')).toBe(3600 * 1000);
    expect(routeTtl('/competitions/3468/team/12/roster')).not.toBeNull();
    expect(routeTtl('/members/13470/cze')).not.toBeNull();
    expect(routeTtl('/members/name?search=Nov%C3%A1k')).not.toBeNull();
    expect(routeTtl('/members/name?search=No')).toBeNull();
    expect(routeTtl('/events')).toBeNull();
    expect(routeTtl('/competitions/3468/../../x')).toBeNull();
  });
});
