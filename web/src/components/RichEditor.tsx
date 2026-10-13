import { useEffect, useRef } from 'react';
import Quill from 'quill';
import 'quill/dist/quill.snow.css';
import type { DeltaOp } from '../../../shared/bulletin/rich';

const TOOLBAR = [['bold', 'italic', 'underline'], [{ list: 'bullet' }, { list: 'ordered' }], ['link'], ['clean']];

/**
 * Quill editor of one bulletin text (Delta ops in, Delta ops out). Uncontrolled: the initial value is read once —
 * remount it (change `key`) to load a different value (default text, restored save point).
 */
export function RichEditor({ value, onChange, placeholder }: { value: DeltaOp[]; onChange: (ops: DeltaOp[]) => void; placeholder?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;

  useEffect(() => {
    const el = host.current!;
    const box = document.createElement('div');
    el.appendChild(box);
    const q = new Quill(box, { theme: 'snow', modules: { toolbar: TOOLBAR }, placeholder, formats: ['bold', 'italic', 'underline', 'list', 'link'] });
    q.setContents(value as any, 'silent');
    q.on('text-change', (_d, _o, source) => {
      if (source === 'user') changeRef.current(q.getContents().ops as DeltaOp[]);
    });
    return () => { el.innerHTML = ''; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div className="rich-editor" ref={host} />;
}
