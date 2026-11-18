import React, { useMemo, useRef, useState } from 'react';
import { ComputedCharacterStats, formatSigned } from '../shared/rulesEngine';
import { Character } from '../shared/types';

interface FormulaBuilderInputProps {
  value: string;
  onChange: (next: string) => void;
  stats?: ComputedCharacterStats | null;
  character?: Character;
  placeholder?: string;
  className?: string;
  showQuickPills?: boolean;
  dropdownPosition?: 'top' | 'bottom';
}

interface ModifierOption {
  token: string;
  label: string;
  bonus?: number;
  kind: 'stat' | 'dice' | 'flat';
}

export const FormulaBuilderInput: React.FC<FormulaBuilderInputProps> = ({
  value,
  onChange,
  stats,
  character,
  placeholder = 'Ex: 1d20 + FOR + PROF',
  className = '',
  showQuickPills = true,
  dropdownPosition = 'bottom',
}) => {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const statOptions: ModifierOption[] = useMemo(() => {
    const attrs = [
      { id: 'for', label: 'FOR' },
      { id: 'des', label: 'DES' },
      { id: 'con', label: 'CON' },
      { id: 'int', label: 'INT' },
      { id: 'sab', label: 'SAB' },
      { id: 'car', label: 'CAR' },
    ];
    const items: ModifierOption[] = attrs.map((a) => ({
      token: a.label,
      label: a.label,
      bonus: stats?.attributes?.[a.id]?.mod,
      kind: 'stat',
    }));

    items.push({
      token: 'PROF',
      label: 'PROF',
      bonus: stats ? stats.proficiencyBonus + stats.halfLevelBonus : undefined,
      kind: 'stat',
    });

    if (character) {
      items.push({
        token: 'NIVEL',
        label: 'NÍVEL',
        bonus: character.level,
        kind: 'stat',
      });
    }

    return items;
  }, [stats, character]);

  const extraOptions: ModifierOption[] = [
    { token: '1d4', label: '1d4', kind: 'dice' },
    { token: '1d6', label: '1d6', kind: 'dice' },
    { token: '1d8', label: '1d8', kind: 'dice' },
    { token: '1', label: '1', kind: 'flat' },
    { token: '2', label: '2', kind: 'flat' },
    { token: '5', label: '5', kind: 'flat' },
  ];

  // Detect if user just typed "+" (or "+ partial") so the modifier picker opens automatically!
  const plusMatch = value.match(/\+\s*([a-zA-Z0-9_]*)$/);
  const partialQuery = plusMatch ? plusMatch[1].toLowerCase() : '';
  const showAutocomplete = focused && Boolean(plusMatch);

  const filteredOptions = useMemo(() => {
    const all = [...statOptions, ...extraOptions];
    if (!partialQuery) return all;
    return all.filter(
      (o) =>
        o.token.toLowerCase().startsWith(partialQuery) ||
        o.label.toLowerCase().startsWith(partialQuery)
    );
  }, [statOptions, partialQuery]);

  const insertAfterPlus = (token: string) => {
    if (/\+\s*[a-zA-Z0-9_]*$/.test(value)) {
      const next = value.replace(/\+\s*[a-zA-Z0-9_]*$/, `+ ${token}`);
      onChange(next);
    } else if (!value.trim()) {
      onChange(`1d20 + ${token}`);
    } else {
      onChange(`${value.trim()} + ${token}`);
    }
    inputRef.current?.focus();
  };

  const toggleTokenChip = (token: string) => {
    const tokenRegex = new RegExp(
      `(^|\\s*\\+\\s*)@?${token}(?=$|\\s|\\+|-)`,
      'i'
    );
    if (tokenRegex.test(value)) {
      const removed = value
        .replace(tokenRegex, '')
        .replace(/^\s*\+\s*/, '')
        .replace(/\s*\+\s*$/, '')
        .replace(/\+\s*\+/g, '+')
        .trim();
      onChange(removed || '1d20');
    } else {
      const base = value.trim();
      if (!base) {
        onChange(`1d20 + ${token}`);
      } else if (base.endsWith('+')) {
        onChange(`${base} ${token}`);
      } else {
        onChange(`${base} + ${token}`);
      }
    }
  };

  const isTokenActive = (token: string) => {
    return new RegExp(`(^|[^a-zA-Z0-9_])@?${token}(?![a-zA-Z0-9_])`, 'i').test(value);
  };

  return (
    <div className="relative space-y-1.5">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          // Slight delay allows clicking autocomplete buttons before closing
          window.setTimeout(() => setFocused(false), 160);
        }}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`rpg-input w-full text-xs font-mono-dice ${className}`}
      />

      {/* Autocomplete Popup Triggered Automatically on Typing "+" */}
      {showAutocomplete && filteredOptions.length > 0 && (
        <div
          className={`absolute left-0 right-0 z-50 rpg-glass-panel rounded-xl p-2 shadow-2xl border border-amber-400/60 ${
            dropdownPosition === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          }`}
        >
          <div className="text-[10px] uppercase tracking-wider mb-1.5 px-1" style={{ color: 'var(--accent-primary)' }}>
            Adicionar modificador à rolagem:
          </div>
          <div className="flex flex-wrap gap-1">
            {filteredOptions.map((opt) => (
              <button
                key={opt.token}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertAfterPlus(opt.token);
                }}
                className="px-2 py-1 rounded-md text-[11px] font-mono-dice font-semibold rpg-card hover:border-amber-400 cursor-pointer flex items-center gap-1"
              >
                <span className="text-amber-300">+ {opt.label}</span>
                {opt.bonus !== undefined && (
                  <span className="opacity-75 text-[10px]">({formatSigned(opt.bonus)})</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* One-Click Modifier Chips (Zero @ syntax needed!) */}
      {showQuickPills && (
        <div className="flex flex-wrap gap-1">
          {statOptions.map((opt) => {
            const active = isTokenActive(opt.token);
            return (
              <button
                key={opt.token}
                type="button"
                onClick={() => toggleTokenChip(opt.token)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono-dice font-semibold cursor-pointer border transition ${
                  active
                    ? 'bg-amber-500/25 border-amber-400 text-amber-200'
                    : 'rpg-card opacity-80 hover:opacity-100'
                }`}
                title={`Adicionar ou remover + ${opt.label}`}
              >
                {active ? '✓ ' : '+ '}
                {opt.label}
                {opt.bonus !== undefined ? ` (${formatSigned(opt.bonus)})` : ''}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
