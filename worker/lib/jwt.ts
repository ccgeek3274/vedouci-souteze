export type JwtPayload = {
  sub: string;
  email: string;
  name: string;
  role: string;
  iat: number;
  exp: number;
};

function base64url(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function getKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

/** Token lifetime. Long-ish on purpose: small trusted club app, and `/auth/me`
 *  slides it forward on activity (see auth route), so an active user never expires. */
export const TOKEN_TTL_DAYS = 30;

export async function signJwt(payload: Omit<JwtPayload, 'iat' | 'exp'>, secret: string, expiresInDays = TOKEN_TTL_DAYS): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JwtPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInDays * 86400,
  };

  const enc = new TextEncoder();
  const header = base64url(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = base64url(enc.encode(JSON.stringify(fullPayload)));
  const data = enc.encode(`${header}.${body}`);

  const key = await getKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, data);

  return `${header}.${body}.${base64url(sig)}`;
}

export async function verifyJwt(token: string, secret: string): Promise<JwtPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [header, body, sig] = parts;
  const enc = new TextEncoder();
  const data = enc.encode(`${header}.${body}`);

  const key = await getKey(secret);
  const sigBytes = base64urlDecode(sig);
  const valid = await crypto.subtle.verify('HMAC', key, sigBytes, data);
  if (!valid) return null;

  const payload: JwtPayload = JSON.parse(new TextDecoder().decode(base64urlDecode(body)));

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) return null;

  return payload;
}
