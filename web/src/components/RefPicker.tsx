// Referee picker shared by Nominace rozhodčích (editing) and the zpravodaj z kola preview.
import { useEffect, useRef, useState } from 'react';
import { ROLE_LABEL } from '../lib/format';
import type { Contact } from '../lib/types';
import { sameName } from '../../../shared/schedule';

// Referee suggestions: the team's referees, captain and deputy (in this order, each name once).
export type RefOption = { name: string; role: Contact['role'] };
const REF_ROLES: Contact['role'][] = ['rozhodci', 'kapitan', 'zastupce'];
export function refOptions(contacts: Contact[] | undefined): RefOption[] {
  const out: RefOption[] = [];
  for (const role of REF_ROLES) {
    for (const ct of contacts ?? []) {
      const name = ct.name.trim();
      if (ct.role === role && name && !out.some((o) => sameName(o.name, name))) out.push({ name, role });
    }
  }
  return out;
}

/**
 * Referee field: free text, ▾ (or arrow down) opens the home team's people and, under a line, the away team's; Enter
 * moves to the next field (data-ref = idx). `inputClass` = look of the field (bulletin preview / form input),
 * `onUndo` shows ↺ while `changed`.
 */
export function RefPicker({ idx, value, changed = false, placeholder, title, home, away, onChange, onUndo, inputClass = 'rdoc-ref' }: {
  idx: number; value: string; changed?: boolean; placeholder?: string; title?: string;
  home: RefOption[]; away: RefOption[]; onChange: (v: string) => void; onUndo?: () => void; inputClass?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLSpanElement>(null);
  const [at, setAt] = useState<DOMRect | null>(null); // open menu: under the input (fixed — the cell clips overflow)
  useEffect(() => {
    if (!at) return;
    const follow = () => input.current && setAt(input.current.getBoundingClientRect()); // the menu follows the field
    const outside = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setAt(null); };
    window.addEventListener('scroll', follow, true);
    window.addEventListener('resize', follow);
    document.addEventListener('mousedown', outside);
    return () => {
      window.removeEventListener('scroll', follow, true);
      window.removeEventListener('resize', follow);
      document.removeEventListener('mousedown', outside);
    };
  }, [!!at]);
  const open = () => setAt(input.current!.getBoundingClientRect());
  const pick = (name: string) => { onChange(name); setAt(null); input.current?.focus(); };
  const group = (label: string, opts: RefOption[]) => (
    <>
      <li className="ref-menu-h">{label}</li>
      {opts.length
        ? opts.map((o) => (
          <li key={`${label}${o.name}`}>
            <button type="button" className={sameName(o.name, value) ? 'on' : undefined} onClick={() => pick(o.name)}>
              {o.name}<span>{ROLE_LABEL[o.role]}</span>
            </button>
          </li>
        ))
        : <li className="ref-menu-none">bez kontaktů</li>}
    </>
  );
  return (
    <span className="rdoc-pick" ref={box}>
      <input ref={input} className={`${inputClass}${changed ? ' changed' : ''}`} data-ref={idx} value={value} spellCheck={false}
        placeholder={placeholder} title={title}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || (e.key === 'Escape' && at)) { e.preventDefault(); if (at) setAt(null); else open(); return; }
          if (e.key !== 'Enter') return;
          e.preventDefault();
          setAt(null);
          const next = document.querySelector<HTMLInputElement>(`input[data-ref="${idx + 1}"]`);
          if (next) next.focus(); else e.currentTarget.blur();
        }} />
      <button type="button" className="rdoc-drop no-print" tabIndex={-1} title="Vybrat z rozhodčích, kapitánů a zástupců družstev"
        onClick={() => (at ? setAt(null) : open())}>▾</button>
      {changed && onUndo && <button type="button" className="rdoc-undo no-print" title="Vrátit nominovaného" onClick={onUndo}>↺</button>}
      {at && (
        <ul className="ref-menu" style={{ left: at.left, top: at.bottom + 2, minWidth: Math.max(at.width, 220) }}>
          {group('domácí', home)}
          <li className="ref-menu-sep" role="separator" />
          {group('hosté', away)}
        </ul>
      )}
    </span>
  );
}

