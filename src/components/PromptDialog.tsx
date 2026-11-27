import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Info, X } from 'lucide-react';
import { OrnateFrame } from './OrnateFrame';

export type DialogMode = 'prompt' | 'alert' | 'confirm';

export interface DialogRequest {
  mode: DialogMode;
  title: string;
  description?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  resolve: (value: string | boolean | null) => void;
}

let activeDialogListener: ((req: DialogRequest | null) => void) | null = null;

/**
 * Electron-safe replacement for window.prompt().
 * Avoids native Windows dialogs that steal Chromium keyboard focus.
 */
export function openTextPrompt(
  title: string,
  defaultValue = '',
  options?: { description?: string; placeholder?: string; confirmLabel?: string }
): Promise<string | null> {
  return new Promise((resolve) => {
    if (!activeDialogListener) {
      resolve(defaultValue || null);
      return;
    }
    activeDialogListener({
      mode: 'prompt',
      title,
      defaultValue,
      description: options?.description,
      placeholder: options?.placeholder,
      confirmLabel: options?.confirmLabel,
      resolve: (val) => resolve(typeof val === 'string' ? val : null),
    });
  });
}

/**
 * Electron-safe replacement for window.alert().
 */
export function openAlertDialog(
  message: string,
  title = 'Aviso'
): Promise<void> {
  return new Promise((resolve) => {
    if (!activeDialogListener) {
      resolve();
      return;
    }
    activeDialogListener({
      mode: 'alert',
      title,
      description: message,
      confirmLabel: 'OK',
      resolve: () => resolve(),
    });
  });
}

/**
 * Electron-safe replacement for window.confirm().
 */
export function openConfirmDialog(
  message: string,
  title = 'Confirmar Ação',
  options?: { confirmLabel?: string; cancelLabel?: string }
): Promise<boolean> {
  return new Promise((resolve) => {
    if (!activeDialogListener) {
      resolve(true);
      return;
    }
    activeDialogListener({
      mode: 'confirm',
      title,
      description: message,
      confirmLabel: options?.confirmLabel || 'Confirmar',
      cancelLabel: options?.cancelLabel || 'Cancelar',
      resolve: (val) => resolve(Boolean(val)),
    });
  });
}

export const PromptDialogHost: React.FC = () => {
  const [req, setReq] = useState<DialogRequest | null>(null);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    activeDialogListener = (nextReq) => {
      setReq(nextReq);
      setValue(nextReq?.defaultValue ?? '');
    };
    return () => {
      activeDialogListener = null;
    };
  }, []);

  useEffect(() => {
    if (!req) return;
    const t = window.setTimeout(() => {
      if (req.mode === 'prompt') {
        inputRef.current?.focus();
        inputRef.current?.select();
      } else {
        confirmBtnRef.current?.focus();
      }
    }, 25);
    return () => window.clearTimeout(t);
  }, [req]);

  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        const resolver = req.resolve;
        setReq(null);
        resolver(req.mode === 'confirm' ? false : null);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [req]);

  if (!req) return null;

  const handleClose = (result: string | boolean | null) => {
    const resolver = req.resolve;
    setReq(null);
    resolver(result);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (req.mode === 'prompt') {
      const trimmed = value.trim();
      handleClose(trimmed || null);
    } else {
      handleClose(true);
    }
  };

  return (
    <div
      data-modal-overlay="true"
      data-prompt-dialog="true"
      className="fixed inset-0 z-[130] bg-[#040508]/80 backdrop-blur-[3px] flex items-center justify-center p-4"
      onClick={() => handleClose(req.mode === 'confirm' ? false : null)}
    >
      <div className="w-full max-w-md animate-modal-unfurl" onClick={(e) => e.stopPropagation()}>
        <OrnateFrame className="rpg-glass-panel rounded-lg p-5 space-y-4 shadow-2xl">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0">
              {req.mode === 'confirm' ? (
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              ) : req.mode === 'alert' ? (
                <Info className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
              ) : null}
              <div className="min-w-0">
                <h3 className="font-display font-bold text-base text-amber-100">{req.title}</h3>
                {req.description && (
                  <p
                    className="text-xs mt-1 whitespace-pre-line leading-relaxed"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {req.description}
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleClose(req.mode === 'confirm' ? false : null)}
              className="rpg-card p-1.5 rounded cursor-pointer hover:border-amber-400/60 shrink-0"
              aria-label="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {req.mode === 'prompt' && (
              <input
                ref={inputRef}
                value={value}
                maxLength={40}
                onChange={(e) => setValue(e.target.value)}
                placeholder={req.placeholder || 'Digite aqui...'}
                className="rpg-input w-full text-sm"
              />
            )}

            <div className="flex items-center justify-end gap-2">
              {req.mode !== 'alert' && (
                <button
                  type="button"
                  onClick={() => handleClose(req.mode === 'confirm' ? false : null)}
                  className="rpg-card px-3.5 py-1.5 rounded-md text-xs font-display font-semibold cursor-pointer"
                >
                  {req.cancelLabel || 'Cancelar'}
                </button>
              )}
              <button
                ref={confirmBtnRef}
                type="submit"
                className="rpg-btn-primary px-4 py-1.5 rounded-md text-xs font-display font-bold cursor-pointer"
              >
                {req.confirmLabel || 'Confirmar'}
              </button>
            </div>
          </form>
        </OrnateFrame>
      </div>
    </div>
  );
};
