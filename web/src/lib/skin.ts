// Visual skin of the app (per browser, a viewer convenience — not stored on the server).
export const SKINS = [
  { id: 'paper', label: 'Výchozí' },
  { id: 'chess', label: 'chess.cz' },
] as const;
export type SkinId = (typeof SKINS)[number]['id'];

const KEY = 'vs-skin';

export function getSkin(): SkinId {
  try {
    const v = localStorage.getItem(KEY);
    if (SKINS.some((s) => s.id === v)) return v as SkinId;
  } catch { /* storage blocked */ }
  return 'paper';
}

export function applySkin(id: SkinId = getSkin()) {
  document.documentElement.dataset.skin = id;
}

export function setSkin(id: SkinId) {
  try { localStorage.setItem(KEY, id); } catch { /* storage blocked */ }
  applySkin(id);
}
