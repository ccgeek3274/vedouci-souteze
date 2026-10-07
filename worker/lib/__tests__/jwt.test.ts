import { describe, it, expect } from 'vitest';
import { signJwt, verifyJwt } from '../jwt';
import { hashPassword, verifyPassword } from '../password';

describe('jwt', () => {
  it('round-trips a payload', async () => {
    const token = await signJwt({ sub: 'u1', email: 'a@b.cz', name: 'A', role: 'user' }, 'secret');
    const payload = await verifyJwt(token, 'secret');
    expect(payload?.sub).toBe('u1');
    expect(payload!.exp - payload!.iat).toBe(30 * 86400);
  });

  it('rejects a wrong secret and an expired token', async () => {
    const token = await signJwt({ sub: 'u1', email: 'a@b.cz', name: 'A', role: 'user' }, 'secret');
    expect(await verifyJwt(token, 'other')).toBeNull();
    const expired = await signJwt({ sub: 'u1', email: 'a@b.cz', name: 'A', role: 'user' }, 'secret', -1);
    expect(await verifyJwt(expired, 'secret')).toBeNull();
  });
});

describe('password', () => {
  it('verifies the right password only', async () => {
    const stored = await hashPassword('tajneheslo');
    expect(await verifyPassword('tajneheslo', stored)).toBe(true);
    expect(await verifyPassword('jineheslo', stored)).toBe(false);
    expect(await verifyPassword('tajneheslo', 'garbage')).toBe(false);
  });
});
