// Personal API tokens: "vs_" + 40 random base32-ish chars. Only the SHA-256 hex digest is stored.
export const API_TOKEN_PREFIX = 'vs_';

export function generateApiToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(30));
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  return API_TOKEN_PREFIX + Array.from(bytes, (b) => alphabet[b % 32]).join('');
}

export async function hashApiToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
