import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { OrnateFrame } from './OrnateFrame';

export type GrimoireModalSize = 'md' | 'lg' | 'xl' | '2xl' | 'full';

const SIZE_CLASSES: Record<GrimoireModalSize, string> = {
  md: 'max-w-lg max-h-[84vh]',
  lg: 'max-w-3xl max-h-[86vh]',
  xl: 'max-w-5xl h-[86vh]',
  '2xl': 'max-w-6xl h-[88vh]',
  full: 'max-w-[94vw] w-[1240px] h-[90vh]',
};

interface GrimoireModalProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  onClose: () => void;
  size?: GrimoireModalSize;
  zIndexClass?: string;
  accentColor?: string;
  headerActions?: React.ReactNode;
  sidebar?: React.ReactNode;
  footer?: React.ReactNode;
  bodyClassName?: string;
  children: React.ReactNode;
}

/**
 * Unified AAA Grimoire Modal Shell for CHRONICLES.
 * Consistent matte obsidian chamber, 1px burnished brass brackets,
 * Escape-to-close, click-outside-to-close, and optional split-pane navigation rail.
 */
export const GrimoireModal: React.FC<GrimoireModalProps> = ({
  title,
  subtitle,
  icon,
  onClose,
  size = 'xl',
  zIndexClass = 'z-50',
  accentColor = '#b89146',
  headerActions,
  sidebar,
  footer,
  bodyClassName = '',
  children,
}) => {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (document.querySelector('[data-prompt-dialog="true"], [data-inspect-modal="true"]')) {
          return;
        }
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      data-modal-overlay="true"
      className={`fixed inset-0 ${zIndexClass} bg-[#040508]/80 backdrop-blur-[3px] flex items-center justify-center p-3 sm:p-5`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <OrnateFrame
        accentColor={accentColor}
        cornerSize={16}
        className={`rpg-panel rpg-grain rounded-lg w-full ${SIZE_CLASSES[size]} flex flex-col overflow-hidden animate-modal-unfurl`}
      >
        {/* Sculpted 54px Grimoire Header */}
        <header
          className="h-[54px] px-4 sm:px-5 border-b flex items-center justify-between gap-3 shrink-0 bg-[#0d0f16]"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex items-center gap-3 min-w-0">
            {icon && (
              <div className="w-8 h-8 rounded rpg-socket flex items-center justify-center shrink-0 text-[#d4ad5c]">
                {icon}
              </div>
            )}
            <div className="min-w-0 leading-tight">
              <h2 className="font-display font-bold text-base sm:text-lg tracking-wide chronicle-gold-text truncate">
                {title}
              </h2>
              {subtitle && (
                <p
                  className="text-[11px] truncate mt-0.5"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {headerActions}
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded rpg-card flex items-center justify-center text-[#a69b88] hover:text-[#ece4d5] hover:border-[#d4ad5c]/60 cursor-pointer transition"
              title="Fechar (Esc)"
              aria-label="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Body (Optional Left Rail + Recessed Main Well) */}
        <div className="flex-1 min-h-0 flex overflow-hidden">
          {sidebar && (
            <aside
              className="w-48 sm:w-52 border-r bg-[#0b0d13] shrink-0 overflow-y-auto p-2.5 flex flex-col gap-1"
              style={{ borderColor: 'var(--border-hairline)' }}
            >
              {sidebar}
            </aside>
          )}
          <div
            className={`flex-1 min-w-0 min-h-0 overflow-y-auto bg-[#090b10] ${bodyClassName}`}
          >
            {children}
          </div>
        </div>

        {/* Optional Footer Bar */}
        {footer && (
          <footer
            className="px-4 sm:px-5 py-2.5 border-t bg-[#0d0f16] shrink-0 flex items-center justify-between gap-2"
            style={{ borderColor: 'var(--border-hairline)' }}
          >
            {footer}
          </footer>
        )}
      </OrnateFrame>
    </div>
  );
};
