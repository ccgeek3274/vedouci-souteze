import type { JwtPayload } from './lib/jwt';

export type Bindings = {
  DB: D1Database;
  ASSETS: Fetcher;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  JWT_SECRET: string;
  /** 'development' enables dev-only features; anything else (or missing) = production. */
  ENVIRONMENT?: string;
  /** Comma-separated emails that get role=admin + status=active on first login. */
  ADMIN_EMAILS?: string;
  /** ntfy.sh topic for admin push notifications (new pending user). Unset = disabled. */
  NTFY_TOPIC?: string;
};

export type User = {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  role: 'user' | 'admin';
  status: 'pending' | 'active' | 'blocked';
  created_at: number;
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: {
    user: User;
    jwtPayload: JwtPayload;
  };
};
