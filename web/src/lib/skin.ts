// Visual skin (per browser, a viewer convenience — not stored on the server). The app and the public schedule
// remember their skin separately: the app defaults to the Paper & Ink look, the public schedule to chess.cz.
export const SKINS = [
  { id: 'paper', label: 'Výchozí' },
  { id: 'chess', label: 'chess.cz' },
] as const;
export type SkinId = (typeof SKINS)[number]['id'];
export type SkinScope = 'app' | 'public';

const KEY: Record<SkinScope, string> = { app: 'vs-skin', public: 'vs-skin-public' };
const DEFAULT: Record<SkinScope, SkinId> = { app: 'paper', public: 'chess' };

/** Scope of the current page: the public schedule (/rozpis/…) or the app. */
export const skinScope = (path = location.pathname): SkinScope => (path.startsWith('/rozpis/') ? 'public' : 'app');

export function getSkin(scope: SkinScope = skinScope()): SkinId {
  try {
    const v = localStorage.getItem(KEY[scope]);
    if (SKINS.some((s) => s.id === v)) return v as SkinId;
  } catch { /* storage blocked */ }
  return DEFAULT[scope];
}

export function applySkin(id: SkinId = getSkin()) {
  document.documentElement.dataset.skin = id;
}

export function setSkin(id: SkinId, scope: SkinScope = skinScope()) {
  try { localStorage.setItem(KEY[scope], id); } catch { /* storage blocked */ }
  applySkin(id);
}
