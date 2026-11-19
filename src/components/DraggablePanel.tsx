import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GripHorizontal } from 'lucide-react';

interface DraggablePanelProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  storageKey?: string;
}

export const DraggablePanel: React.FC<DraggablePanelProps> = ({
  children,
  className = '',
  style,
  storageKey,
}) => {
  const [offset, setOffset] = useState<{ x: number; y: number }>(() => {
    if (!storageKey) return { x: 0, y: 0 };
    try {
      const saved = sessionStorage.getItem(`drag_${storageKey}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') {
          return parsed;
        }
      }
    } catch {
      // ignore
    }
    return { x: 0, y: 0 };
  });

  const draggingRef = useRef(false);
  const startMouseRef = useRef({ x: 0, y: 0 });
  const startOffsetRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!storageKey) return;
    try {
      sessionStorage.setItem(`drag_${storageKey}`, JSON.stringify(offset));
    } catch {
      // ignore
    }
  }, [offset, storageKey]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (
        target.closest(
          'button, input, select, textarea, a, label, [data-no-drag="true"]'
        ) &&
        !target.closest('[data-drag-handle="true"]')
      ) {
        return;
      }

      draggingRef.current = true;
      startMouseRef.current = { x: e.clientX, y: e.clientY };
      startOffsetRef.current = { x: offset.x, y: offset.y };

      const onMouseMove = (ev: MouseEvent) => {
        if (!draggingRef.current) return;
        const dx = ev.clientX - startMouseRef.current.x;
        const dy = ev.clientY - startMouseRef.current.y;
        setOffset({
          x: startOffsetRef.current.x + dx,
          y: startOffsetRef.current.y + dy,
        });
      };

      const onMouseUp = () => {
        draggingRef.current = false;
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [offset.x, offset.y]
  );

  return (
    <div
      onMouseDown={handleMouseDown}
      className={className}
      style={{
        ...style,
        transform: `${style?.transform ? `${style.transform} ` : ''}translate3d(${offset.x}px, ${offset.y}px, 0)`,
      }}
    >
      {children}
    </div>
  );
};

export const DragGripBadge: React.FC<{ label?: string }> = ({ label }) => (
  <span
    data-drag-handle="true"
    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/45 border border-amber-500/25 text-amber-300/75 hover:text-amber-200 hover:border-amber-400/60 cursor-move select-none text-[9px] font-display uppercase tracking-wider shrink-0"
    title="Arraste para mover esta janela pela tela"
  >
    <GripHorizontal className="w-3 h-3" />
    {label && <span>{label}</span>}
  </span>
);
