import React, { useEffect, useState } from 'react';

interface OrnateFrameProps {
  children: React.ReactNode;
  className?: string;
  accentColor?: string;
  cornerSize?: number;
  showBorderRing?: boolean;
}

export const OrnateFrame: React.FC<OrnateFrameProps> = ({
  children,
  className = '',
  accentColor = 'var(--border-ornate)',
  cornerSize = 24,
  showBorderRing = true,
}) => {
  const sizeStyle = { width: cornerSize, height: cornerSize };
  return (
    <div className={`relative ${className}`}>
      {showBorderRing && (
        <div
          className="absolute inset-[5px] rounded-[inherit] pointer-events-none z-0 opacity-30 border"
          style={{ borderColor: accentColor }}
        />
      )}
      {/* 4 Sculpted SVG Filigree Corners */}
      <svg
        viewBox="0 0 32 32"
        style={sizeStyle}
        className="absolute top-1 left-1 pointer-events-none z-10 opacity-85"
      >
        <path
          d="M2,28 L2,6 Q2,2 6,2 L28,2 M7,18 L7,9 Q7,7 9,7 L18,7"
          fill="none"
          stroke={accentColor}
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <circle cx="5" cy="5" r="2" fill={accentColor} />
      </svg>
      <svg
        viewBox="0 0 32 32"
        style={sizeStyle}
        className="absolute top-1 right-1 pointer-events-none z-10 opacity-85 scale-x-[-1]"
      >
        <path
          d="M2,28 L2,6 Q2,2 6,2 L28,2 M7,18 L7,9 Q7,7 9,7 L18,7"
          fill="none"
          stroke={accentColor}
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <circle cx="5" cy="5" r="2" fill={accentColor} />
      </svg>
      <svg
        viewBox="0 0 32 32"
        style={sizeStyle}
        className="absolute bottom-1 left-1 pointer-events-none z-10 opacity-85 scale-y-[-1]"
      >
        <path
          d="M2,28 L2,6 Q2,2 6,2 L28,2 M7,18 L7,9 Q7,7 9,7 L18,7"
          fill="none"
          stroke={accentColor}
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <circle cx="5" cy="5" r="2" fill={accentColor} />
      </svg>
      <svg
        viewBox="0 0 32 32"
        style={sizeStyle}
        className="absolute bottom-1 right-1 pointer-events-none z-10 opacity-85 scale-[-1]"
      >
        <path
          d="M2,28 L2,6 Q2,2 6,2 L28,2 M7,18 L7,9 Q7,7 9,7 L18,7"
          fill="none"
          stroke={accentColor}
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <circle cx="5" cy="5" r="2" fill={accentColor} />
      </svg>

      {children}
    </div>
  );
};

export const OrnateDivider: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`flex items-center justify-center gap-3 w-full ${className}`}>
    <div
      className="h-px flex-1"
      style={{
        background: 'linear-gradient(90deg, transparent, var(--border-ornate))',
      }}
    />
    <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" style={{ color: 'var(--accent-primary)' }}>
      <polygon points="12,2 22,12 12,22 2,12" fill="currentColor" fillOpacity="0.85" />
      <polygon points="12,6 18,12 12,18 6,12" fill="#090b10" fillOpacity="0.45" />
    </svg>
    <div
      className="h-px flex-1"
      style={{
        background: 'linear-gradient(90deg, var(--border-ornate), transparent)',
      }}
    />
  </div>
);

export const OrnateHeaderBanner: React.FC<{
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
}> = ({ title, subtitle, icon }) => (
  <div className="flex items-center gap-2.5">
    {icon && (
      <div className="w-9 h-9 rounded-md rpg-socket flex items-center justify-center shrink-0">
        {icon}
      </div>
    )}
    <div className="min-w-0">
      {subtitle && (
        <div
          className="text-[10px] uppercase tracking-[0.22em] font-display font-bold truncate"
          style={{ color: 'var(--text-secondary)' }}
        >
          {subtitle}
        </div>
      )}
      <h3 className="font-chronicle font-bold text-lg sm:text-xl leading-tight truncate chronicle-gold-text">
        {title}
      </h3>
    </div>
  </div>
);

export const SculptedHealthBar: React.FC<{
  hp: number;
  maxHp: number;
  ghostOverride?: number;
  variant?: 'vital' | 'crimson' | 'boss' | 'mana';
  heightClass?: string;
  label?: string;
}> = ({
  hp,
  maxHp,
  ghostOverride,
  variant = 'vital',
  heightClass = 'h-2.5',
  label,
}) => {
  const safeMax = Math.max(1, maxHp);
  const clampedHp = Math.max(0, Math.min(safeMax, hp));
  const [ghostHp, setGhostHp] = useState<number>(ghostOverride ?? clampedHp);
  const prevHpRef = React.useRef<number>(ghostOverride ?? clampedHp);

  useEffect(() => {
    const prev = prevHpRef.current;
    prevHpRef.current = clampedHp;
    if (clampedHp < prev) {
      setGhostHp(Math.max(prev, clampedHp));
      const t = window.setTimeout(() => setGhostHp(clampedHp), 240);
      return () => window.clearTimeout(t);
    }
    setGhostHp(clampedHp);
  }, [clampedHp]);

  useEffect(() => {
    if (ghostOverride !== undefined && ghostOverride > clampedHp) {
      setGhostHp(ghostOverride);
      const t = window.setTimeout(() => setGhostHp(clampedHp), 240);
      return () => window.clearTimeout(t);
    }
  }, [ghostOverride, clampedHp]);

  const pct = Math.max(0, Math.min(100, (clampedHp / safeMax) * 100));
  const ghostPct = Math.max(pct, Math.min(100, (ghostHp / safeMax) * 100));

  const fillGradient =
    variant === 'mana'
      ? 'linear-gradient(90deg, #0369a1, #2563eb, #38bdf8)'
      : variant === 'boss'
      ? 'linear-gradient(90deg, #6b0f12, #b91c1c, #ea580c)'
      : variant === 'crimson'
      ? 'linear-gradient(90deg, #7f1d1d, #dc2626)'
      : pct > 50
      ? 'linear-gradient(90deg, #15803d, #22c55e)'
      : pct > 25
      ? 'linear-gradient(90deg, #b45309, #eab308)'
      : 'linear-gradient(90deg, #7f1d1d, #ef4444)';

  return (
    <div
      className={`relative w-full ${heightClass} rounded-xs bg-[#06070c] border border-amber-500/45 overflow-hidden shadow-[inset_0_2px_6px_rgba(0,0,0,0.95)]`}
    >
      {variant !== 'mana' && (
        <div
          className="absolute inset-y-0 left-0 hp-ghost-bar opacity-85"
          style={{ width: `${ghostPct}%` }}
        />
      )}
      <div
        className="relative h-full transition-all duration-200 ease-out overflow-hidden"
        style={{ width: `${pct}%`, background: fillGradient }}
      >
        <div className="absolute inset-0 liquid-bar-shine" />
      </div>
      {label && (
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-mono-dice font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)] pointer-events-none">
          {label}
        </span>
      )}
    </div>
  );
};
