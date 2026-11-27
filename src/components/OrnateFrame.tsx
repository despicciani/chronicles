import React, { useEffect, useState } from 'react';

interface OrnateFrameProps {
  children: React.ReactNode;
  className?: string;
  accentColor?: string;
  cornerSize?: number;
  showBorderRing?: boolean;
}

/**
 * Precision-crafted minimalist brass corner brackets (BG3 / Diablo IV restraint).
 * Thin 1.25px structural brackets with subtle inner hairline — zero gaudy filigree clutter.
 */
export const OrnateFrame: React.FC<OrnateFrameProps> = ({
  children,
  className = '',
  accentColor = 'var(--border-ornate)',
  cornerSize = 14,
  showBorderRing = true,
}) => {
  const sizeStyle = { width: cornerSize, height: cornerSize };
  return (
    <div className={`relative ${className}`}>
      {showBorderRing && (
        <div
          className="absolute inset-[3px] rounded-[inherit] pointer-events-none z-0 opacity-20 border"
          style={{ borderColor: accentColor }}
        />
      )}
      {/* 4 Precision Brass Corner Brackets */}
      <svg
        viewBox="0 0 20 20"
        style={sizeStyle}
        className="absolute top-[2px] left-[2px] pointer-events-none z-10 opacity-75"
      >
        <path
          d="M1,14 L1,1 L14,1"
          fill="none"
          stroke={accentColor}
          strokeWidth="1.4"
          strokeLinecap="square"
        />
        <rect x="3" y="3" width="2" height="2" fill={accentColor} fillOpacity="0.65" />
      </svg>
      <svg
        viewBox="0 0 20 20"
        style={sizeStyle}
        className="absolute top-[2px] right-[2px] pointer-events-none z-10 opacity-75 scale-x-[-1]"
      >
        <path
          d="M1,14 L1,1 L14,1"
          fill="none"
          stroke={accentColor}
          strokeWidth="1.4"
          strokeLinecap="square"
        />
        <rect x="3" y="3" width="2" height="2" fill={accentColor} fillOpacity="0.65" />
      </svg>
      <svg
        viewBox="0 0 20 20"
        style={sizeStyle}
        className="absolute bottom-[2px] left-[2px] pointer-events-none z-10 opacity-75 scale-y-[-1]"
      >
        <path
          d="M1,14 L1,1 L14,1"
          fill="none"
          stroke={accentColor}
          strokeWidth="1.4"
          strokeLinecap="square"
        />
        <rect x="3" y="3" width="2" height="2" fill={accentColor} fillOpacity="0.65" />
      </svg>
      <svg
        viewBox="0 0 20 20"
        style={sizeStyle}
        className="absolute bottom-[2px] right-[2px] pointer-events-none z-10 opacity-75 scale-[-1]"
      >
        <path
          d="M1,14 L1,1 L14,1"
          fill="none"
          stroke={accentColor}
          strokeWidth="1.4"
          strokeLinecap="square"
        />
        <rect x="3" y="3" width="2" height="2" fill={accentColor} fillOpacity="0.65" />
      </svg>

      {children}
    </div>
  );
};

export const OrnateDivider: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`flex items-center justify-center gap-2.5 w-full ${className}`}>
    <div
      className="h-px flex-1 opacity-55"
      style={{
        background: 'linear-gradient(90deg, transparent, var(--border-ornate))',
      }}
    />
    <svg viewBox="0 0 16 16" className="w-2.5 h-2.5 shrink-0 opacity-80" style={{ color: 'var(--accent-primary)' }}>
      <polygon points="8,1 15,8 8,15 1,8" fill="currentColor" />
    </svg>
    <div
      className="h-px flex-1 opacity-55"
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
  <div className="flex items-center gap-2.5 min-w-0">
    {icon && (
      <div className="w-8 h-8 rounded rpg-socket flex items-center justify-center shrink-0">
        {icon}
      </div>
    )}
    <div className="min-w-0">
      {subtitle && (
        <div
          className="text-[10px] uppercase tracking-[0.18em] font-display font-semibold truncate"
          style={{ color: 'var(--text-secondary)' }}
        >
          {subtitle}
        </div>
      )}
      <h3 className="font-display font-bold text-base sm:text-lg leading-tight truncate chronicle-gold-text">
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
  heightClass = 'h-2',
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
      ? 'linear-gradient(90deg, #1d4e89, #2b6cb0, #4a90d9)'
      : variant === 'boss'
      ? 'linear-gradient(90deg, #681013, #a81c20, #cf4c1c)'
      : variant === 'crimson'
      ? 'linear-gradient(90deg, #74181b, #b32428)'
      : pct > 50
      ? 'linear-gradient(90deg, #1e603c, #2f8556)'
      : pct > 25
      ? 'linear-gradient(90deg, #9a6518, #c89128)'
      : 'linear-gradient(90deg, #74181b, #c52a2e)';

  return (
    <div
      className={`relative w-full ${heightClass} rounded-[2px] bg-[#06070b] border border-[#b89146]/35 overflow-hidden shadow-[inset_0_1px_4px_rgba(0,0,0,0.95)]`}
    >
      {variant !== 'mana' && (
        <div
          className="absolute inset-y-0 left-0 hp-ghost-bar opacity-85"
          style={{ width: `${ghostPct}%` }}
        />
      )}
      <div
        className="absolute inset-y-0 left-0 transition-[width] duration-200 ease-out"
        style={{
          width: `${pct}%`,
          background: fillGradient,
        }}
      >
        <div className="absolute inset-0 liquid-bar-shine" />
      </div>
      {/* Subtle etched 25% quarter-ticks */}
      <div className="absolute inset-0 pointer-events-none flex justify-evenly opacity-25">
        <div className="w-px h-full bg-black" />
        <div className="w-px h-full bg-black" />
        <div className="w-px h-full bg-black" />
      </div>
      {label && (
        <span className="relative z-10 flex items-center justify-center h-full text-[9px] font-mono-dice font-bold text-[#f4ede0] drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)] leading-none">
          {label}
        </span>
      )}
    </div>
  );
};
