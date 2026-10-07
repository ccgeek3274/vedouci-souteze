import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';

export type User = {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  role: 'user' | 'admin';
  status: 'pending' | 'active' | 'blocked';
};

export function useAuth() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      try {
        // /auth/me also slides the session cookie forward.
        return await api.get<{ user: User }>('/auth/me');
      } catch (err) {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) return null;
        throw err;
      }
    },
    retry: false,
    staleTime: 60_000,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });

  return {
    user: data?.user ?? null,
    isLoading,
    isAuthenticated: !!data?.user,
    googleLogin: () => { window.location.href = '/api/v1/auth/google'; },
    devLogin: async () => { await api.post('/auth/dev-login'); await refresh(); },
    passwordLogin: async (email: string, password: string) => {
      await api.post('/auth/login', { email, password });
      await refresh();
    },
    logout: async () => {
      try { await api.post('/auth/logout'); } catch { /* ignore */ }
      // clear() would detach the live auth observer and leave the UI logged in;
      // null the auth query in place and drop only the user's data queries.
      queryClient.setQueryData(['auth', 'me'], null);
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'auth' });
    },
  };
}
