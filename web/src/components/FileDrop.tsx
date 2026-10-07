import { useRef, useState } from 'react';

export function FileDrop({ accept, multiple, label, onFiles }: {
  accept: string;
  multiple?: boolean;
  label: string;
  onFiles: (files: File[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      className={`dropzone${over ? ' over' : ''}`}
      onClick={() => input.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const files = [...e.dataTransfer.files];
        if (files.length) onFiles(files);
      }}
    >
      <span className="muted">{label}</span>
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple={multiple}
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          if (files.length) onFiles(files);
        }}
      />
    </div>
  );
}
