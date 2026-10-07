// Same-origin API: the session lives in an httpOnly cookie, so no token handling here.
const BASE_URL = '/api/v1';

export class ApiError extends Error {
  constructor(public status: number, public statusText: string, public body?: unknown) {
    super(`${status} ${statusText}`);
    this.name = 'ApiError';
  }
}

/** The server's own (Czech) explanation of a failed request, for user-facing messages. */
export function apiErrorText(err: unknown): string | null {
  if (err instanceof ApiError) {
    const body = err.body as { error?: unknown } | undefined;
    if (typeof body?.error === 'string' && body.error.trim()) return body.error;
  }
  return err instanceof Error && err.message ? err.message : null;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { ...(options?.headers as Record<string, string>) };
  if (options?.body) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE_URL}${path}`, { credentials: 'same-origin', ...options, headers });
  if (!res.ok) {
    let body: unknown;
    try { body = await res.json(); } catch { /* no json body */ }
    throw new ApiError(res.status, res.statusText, body);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'POST', body: data === undefined ? undefined : JSON.stringify(data) }),
  patch: <T>(path: string, data: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(data) }),
  put: <T>(path: string, data: unknown) => request<T>(path, { method: 'PUT', body: JSON.stringify(data) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
