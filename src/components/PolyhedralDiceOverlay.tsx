import React, { useEffect, useState } from 'react';
import { CheckCircle2, Dices, Flame, ShieldAlert, Sparkles, X } from 'lucide-react';
import { useCampaign } from '../context/CampaignContext';
import { buildPreviewDiceForFormula, RollAdvantageMode } from '../shared/rulesEngine';
import { DiceSkin, RolledDieVisual } from '../shared/types';
import { OrnateDivider, OrnateFrame } from './OrnateFrame';

const SKIN_STYLES: Record<
  DiceSkin,
  { fill: string; stroke: string; text: string; glow: string }
> = {
  gold: {
    fill: 'url(#grad-gold)',
    stroke: '#fde68a',
    text: '#fffbeb',
    glow: 'rgba(245, 158, 11, 0.7)',
  },
  fire: {
    fill: 'url(#grad-fire)',
    stroke: '#fdba74',
    text: '#fff7ed',
    glow: 'rgba(239, 68, 68, 0.75)',
  },
  ice: {
    fill: 'url(#grad-ice)',
    stroke: '#bae6fd',
    text: '#f0f9ff',
    glow: 'rgba(56, 189, 248, 0.75)',
  },
  emerald: {
    fill: 'url(#grad-emerald)',
    stroke: '#a7f3d0',
    text: '#ecfdf5',
    glow: 'rgba(16, 185, 129, 0.75)',
  },
  amethyst: {
    fill: 'url(#grad-amethyst)',
    stroke: '#e9d5ff',
    text: '#faf5ff',
    glow: 'rgba(168, 85, 247, 0.75)',
  },
  blood: {
    fill: 'url(#grad-blood)',
    stroke: '#fecaca',
    text: '#fef2f2',
    glow: 'rgba(185, 28, 28, 0.8)',
  },
};

export const PolyhedronShape: React.FC<{
  die: RolledDieVisual;
  displayValue: number | string;
  skin: DiceSkin;
  rolling: boolean;
  isCritDie?: boolean;
  isFumbleDie?: boolean;
  onClick?: () => void;
}> = ({ die, displayValue, skin, rolling, isCritDie, isFumbleDie, onClick }) => {
  const palette = SKIN_STYLES[skin] || SKIN_STYLES.gold;
  const strokeColor = isCritDie
    ? '#facc15'
    : isFumbleDie
    ? '#ef4444'
    : palette.stroke;

  const renderShape = () => {
    switch (die.sides) {
      case 4:
        // Tetrahedral crystal pyramid (d4)
        return (
          <g>
            <polygon
              points="50,8 92,84 8,84"
              fill={palette.fill}
              stroke={strokeColor}
              strokeWidth="3.5"
              strokeLinejoin="round"
            />
            <line x1="50" y1="8" x2="50" y2="84" stroke={strokeColor} strokeOpacity="0.45" strokeWidth="1.5" />
            <line x1="29" y1="46" x2="71" y2="46" stroke={strokeColor} strokeOpacity="0.3" strokeWidth="1" />
          </g>
        );
      case 6:
        // Beveled runic cube (d6)
        return (
          <g>
            <rect
              x="14"
              y="14"
              width="72"
              height="72"
              rx="14"
              fill={palette.fill}
              stroke={strokeColor}
              strokeWidth="3.5"
            />
            <rect
              x="22"
              y="22"
              width="56"
              height="56"
              rx="8"
              fill="none"
              stroke={strokeColor}
              strokeOpacity="0.35"
              strokeWidth="1.5"
            />
          </g>
        );
      case 8:
        // Faceted diamond octahedron (d8)
        return (
          <g>
            <polygon
              points="50,6 90,50 50,94 10,50"
              fill={palette.fill}
              stroke={strokeColor}
              strokeWidth="3.5"
              strokeLinejoin="round"
            />
            <polygon
              points="50,6 68,50 50,94 32,50"
              fill="rgba(255,255,255,0.08)"
              stroke={strokeColor}
              strokeOpacity="0.45"
              strokeWidth="1.5"
            />
            <line x1="10" y1="50" x2="90" y2="50" stroke={strokeColor} strokeOpacity="0.35" strokeWidth="1.2" />
          </g>
        );
      case 10:
      case 100:
        // Decahedron kite shape (d10 / d100)
        return (
          <g>
            <polygon
              points="50,6 90,42 74,88 26,88 10,42"
              fill={palette.fill}
              stroke={strokeColor}
              strokeWidth="3.5"
              strokeLinejoin="round"
            />
            <polyline
              points="50,6 50,58 10,42"
              fill="none"
              stroke={strokeColor}
              strokeOpacity="0.4"
              strokeWidth="1.5"
            />
            <line x1="50" y1="58" x2="90" y2="42" stroke={strokeColor} strokeOpacity="0.4" strokeWidth="1.5" />
          </g>
        );
      case 12:
        // Dodecahedron pentagon (d12)
        return (
          <g>
            <polygon
              points="50,6 88,28 88,72 50,94 12,72 12,28"
              fill={palette.fill}
              stroke={strokeColor}
              strokeWidth="3.5"
              strokeLinejoin="round"
            />
            <polygon
              points="50,24 72,40 64,66 36,66 28,40"
              fill="rgba(255,255,255,0.08)"
              stroke={strokeColor}
              strokeOpacity="0.45"
              strokeWidth="1.5"
            />
          </g>
        );
      case 20:
      default:
        // Full faceted Icosahedron (d20)
        return (
          <g>
            <polygon
              points="50,5 91,27 91,73 50,95 9,73 9,27"
              fill={palette.fill}
              stroke={strokeColor}
              strokeWidth="3.5"
              strokeLinejoin="round"
            />
            {/* Top specular facets & lower shadow facet for carved 3D gem depth */}
            <polygon points="50,5 91,27 50,22 9,27" fill="rgba(255,255,255,0.18)" />
            <polygon points="9,73 24,65 76,65 91,73 50,95" fill="rgba(0,0,0,0.28)" />
            <polygon
              points="50,22 76,65 24,65"
              fill="rgba(255,255,255,0.09)"
              stroke={strokeColor}
              strokeOpacity="0.55"
              strokeWidth="1.5"
            />
            <line x1="50" y1="5" x2="50" y2="22" stroke={strokeColor} strokeOpacity="0.5" strokeWidth="1.5" />
            <line x1="9" y1="27" x2="24" y2="65" stroke={strokeColor} strokeOpacity="0.45" strokeWidth="1.5" />
            <line x1="91" y1="27" x2="76" y2="65" stroke={strokeColor} strokeOpacity="0.45" strokeWidth="1.5" />
            <line x1="9" y1="73" x2="24" y2="65" stroke={strokeColor} strokeOpacity="0.45" strokeWidth="1.5" />
            <line x1="91" y1="73" x2="76" y2="65" stroke={strokeColor} strokeOpacity="0.45" strokeWidth="1.5" />
            <line x1="50" y1="95" x2="24" y2="65" stroke={strokeColor} strokeOpacity="0.45" strokeWidth="1.5" />
            <line x1="50" y1="95" x2="76" y2="65" stroke={strokeColor} strokeOpacity="0.45" strokeWidth="1.5" />
          </g>
        );
    }
  };

  const isDiscarded = !rolling && Boolean(die.discarded);

  return (
    <div
      onClick={onClick}
      className={`flex flex-col items-center gap-1 transition-all duration-300 ${
        isDiscarded ? 'opacity-45 scale-90 grayscale' : ''
      } ${onClick ? 'cursor-pointer hover:scale-108 active:scale-95' : ''}`}
      title={onClick ? 'Clique no dado para rolar!' : undefined}
    >
      <div
        className={`relative w-24 h-24 flex items-center justify-center ${
          rolling ? 'animate-dice-rolling' : 'animate-dice-tumble'
        }`}
        style={{
          filter: isDiscarded
            ? 'none'
            : `drop-shadow(0 0 ${isCritDie ? '22px' : '12px'} ${
                isCritDie ? 'rgba(250,204,21,0.95)' : palette.glow
              })`,
        }}
      >
        <svg viewBox="0 0 100 100" className="w-full h-full">
          <defs>
            <linearGradient id="grad-gold" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#92400e" />
              <stop offset="50%" stopColor="#d97706" />
              <stop offset="100%" stopColor="#451a03" />
            </linearGradient>
            <linearGradient id="grad-fire" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#b91c1c" />
              <stop offset="55%" stopColor="#ea580c" />
              <stop offset="100%" stopColor="#431407" />
            </linearGradient>
            <linearGradient id="grad-ice" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#0284c7" />
              <stop offset="55%" stopColor="#0e7490" />
              <stop offset="100%" stopColor="#082f49" />
            </linearGradient>
            <linearGradient id="grad-emerald" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#059669" />
              <stop offset="55%" stopColor="#047857" />
              <stop offset="100%" stopColor="#022c22" />
            </linearGradient>
            <linearGradient id="grad-amethyst" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#7e22ce" />
              <stop offset="55%" stopColor="#6b21a8" />
              <stop offset="100%" stopColor="#2e1065" />
            </linearGradient>
            <linearGradient id="grad-blood" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#991b1b" />
              <stop offset="55%" stopColor="#7f1d1d" />
              <stop offset="100%" stopColor="#1f0707" />
            </linearGradient>
          </defs>
          {renderShape()}
        </svg>
        <span
          className={`absolute font-display font-extrabold text-2xl drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] ${
            die.sides === 4 ? 'mt-4' : ''
          } ${isDiscarded ? 'line-through' : ''}`}
          style={{ color: isCritDie ? '#fef08a' : isFumbleDie ? '#fca5a5' : palette.text }}
        >
          {displayValue}
        </span>
      </div>
      <span
        className={`text-[11px] font-mono-dice font-bold px-2 py-0.5 rounded border ${
          isDiscarded
            ? 'bg-black/50 text-gray-400 border-gray-600/40'
            : die.label && !rolling
            ? 'bg-emerald-950/80 text-emerald-300 border-emerald-400/50'
            : 'bg-black/60 text-amber-200 border-amber-500/30'
        }`}
      >
        d{die.sides}
        {!rolling && die.label ? ` • ${die.label}` : ''}
      </span>
    </div>
  );
};

export const PolyhedralDiceOverlay: React.FC = () => {
  const {
    latestRollForOverlay,
    dismissRollOverlay,
    pendingManualRoll,
    cancelManualRoll,
    executeManualRoll,
  } = useCampaign();
  const [rolling, setRolling] = useState(true);
  const [tickValues, setTickValues] = useState<number[]>([]);
  const [chosenManualMode, setChosenManualMode] = useState<RollAdvantageMode>('normal');

  useEffect(() => {
    if (pendingManualRoll) {
      setChosenManualMode(pendingManualRoll.advantageMode);
    }
  }, [pendingManualRoll]);

  useEffect(() => {
    if (!pendingManualRoll) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cancelManualRoll();
      } else if (e.key === 'Enter' || e.key === ' ') {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        e.preventDefault();
        executeManualRoll(chosenManualMode);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pendingManualRoll, chosenManualMode, cancelManualRoll, executeManualRoll]);

  useEffect(() => {
    if (!latestRollForOverlay) return;
    const dice = latestRollForOverlay.rolledDice || [];
    if (dice.length === 0) return;

    setRolling(true);
    const interval = window.setInterval(() => {
      setTickValues(dice.map((d) => Math.floor(Math.random() * d.sides) + 1));
    }, 65);

    const stopTimer = window.setTimeout(() => {
      window.clearInterval(interval);
      setRolling(false);
    }, 620);

    const autoClose = window.setTimeout(() => {
      dismissRollOverlay();
    }, 3900);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(stopTimer);
      window.clearTimeout(autoClose);
    };
  }, [latestRollForOverlay, dismissRollOverlay]);

  // MANUAL CLICK-TO-ROLL TRAY (Local to roller until they click to roll!)
  if (pendingManualRoll) {
    const previewDice = pendingManualRoll.allowAdvantageToggle
      ? buildPreviewDiceForFormula(pendingManualRoll.formula, chosenManualMode)
      : pendingManualRoll.previewDice;
    const auraColor = pendingManualRoll.rollerColor || '#e0b84c';
    const skin = pendingManualRoll.diceSkin || 'gold';

    return (
      <div
        onClick={cancelManualRoll}
        className="fixed inset-0 z-[74] pointer-events-auto flex items-center justify-center bg-black/65 backdrop-blur-[3px] p-4"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="max-w-xl w-full"
        >
          <OrnateFrame
            accentColor={auraColor}
            className="rpg-glass-panel rounded-lg px-7 py-6 w-full flex flex-col items-center gap-4 relative animate-modal-unfurl shadow-[0_24px_70px_rgba(0,0,0,0.95)]"
          >
            <button
              onClick={cancelManualRoll}
              className="absolute top-3 right-3 rpg-card p-1.5 rounded-md hover:border-amber-400 cursor-pointer"
              title="Cancelar rolagem (Esc)"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="text-center w-full pr-6">
              <div
                className="flex items-center justify-center gap-2 text-[11px] font-display uppercase tracking-[0.22em] font-bold"
                style={{ color: auraColor }}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{pendingManualRoll.rollerName}</span>
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <h3 className="font-chronicle font-bold text-xl mt-1 chronicle-gold-text">
                {pendingManualRoll.title}
              </h3>
              <div className="text-xs font-mono-dice text-amber-200/85 mt-1">
                {pendingManualRoll.displayFormula || pendingManualRoll.formula}
              </div>
              {pendingManualRoll.subtitle && (
                <p className="text-[11px] font-lore italic mt-1" style={{ color: 'var(--text-secondary)' }}>
                  {pendingManualRoll.subtitle}
                </p>
              )}
              <OrnateDivider className="mt-2.5 max-w-sm mx-auto" />
            </div>

            {/* Optional d20 Advantage / Disadvantage Selector before rolling */}
            {pendingManualRoll.allowAdvantageToggle && (
              <div
                className="flex rounded-md overflow-hidden border text-[11px]"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <button
                  type="button"
                  onClick={() => setChosenManualMode('normal')}
                  className={`px-3 py-1 font-display font-bold cursor-pointer ${
                    chosenManualMode === 'normal' ? 'rpg-btn-primary' : 'rpg-card'
                  }`}
                >
                  Normal
                </button>
                <button
                  type="button"
                  onClick={() => setChosenManualMode('advantage')}
                  className={`px-3 py-1 font-display font-bold cursor-pointer ${
                    chosenManualMode === 'advantage'
                      ? 'bg-emerald-600 text-white'
                      : 'rpg-card'
                  }`}
                >
                  Vantagem (2d20)
                </button>
                <button
                  type="button"
                  onClick={() => setChosenManualMode('disadvantage')}
                  className={`px-3 py-1 font-display font-bold cursor-pointer ${
                    chosenManualMode === 'disadvantage'
                      ? 'bg-red-600 text-white'
                      : 'rpg-card'
                  }`}
                >
                  Desvantagem (2d20)
                </button>
              </div>
            )}

            {/* Clickable Ready Polyhedra */}
            <div className="flex flex-wrap items-center justify-center gap-5 py-2">
              {previewDice.map((die, idx) => (
                <PolyhedronShape
                  key={`${die.sides}-${idx}`}
                  die={die}
                  displayValue="?"
                  skin={skin}
                  rolling={false}
                  onClick={() => executeManualRoll(chosenManualMode)}
                />
              ))}
            </div>

            <div className="flex flex-col items-center gap-2 w-full">
              <button
                type="button"
                onClick={() => executeManualRoll(chosenManualMode)}
                className="rpg-btn-primary px-8 py-2.5 rounded-md text-sm font-display font-bold flex items-center gap-2 cursor-pointer shadow-[0_10px_28px_rgba(224,184,76,0.28)]"
              >
                <Dices className="w-4 h-4" />
                <span>Rolar Dado!</span>
              </button>
              <span className="text-[10px] font-lore italic" style={{ color: 'var(--text-muted)' }}>
                Clique no dado acima ou pressione Enter para girar
              </span>
            </div>
          </OrnateFrame>
        </div>
      </div>
    );
  }

  if (!latestRollForOverlay || !latestRollForOverlay.rolledDice?.length) return null;

  const dice = latestRollForOverlay.rolledDice;
  const skin: DiceSkin = latestRollForOverlay.diceSkin || 'gold';
  const auraColor = latestRollForOverlay.rollerColor || '#e0b84c';

  return (
    <div
      onClick={dismissRollOverlay}
      className="fixed inset-0 z-[70] pointer-events-auto flex items-center justify-center bg-black/55 backdrop-blur-[3px] p-4"
    >
      <OrnateFrame
        accentColor={auraColor}
        className={`rpg-glass-panel rounded-lg px-8 py-6 max-w-2xl w-full flex flex-col items-center gap-4 relative animate-modal-unfurl ${
          !rolling && latestRollForOverlay.isCrit ? 'animate-crit-shake animate-critical-nova' : ''
        }`}
      >
        {/* Header */}
        <div className="text-center w-full">
          <div className="flex items-center justify-center gap-2 text-[11px] font-display uppercase tracking-[0.22em] font-bold" style={{ color: auraColor }}>
            <Sparkles className="w-3.5 h-3.5" />
            <span>{latestRollForOverlay.rollerName}</span>
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <h3 className="font-chronicle font-bold text-xl mt-1 chronicle-gold-text">
            {latestRollForOverlay.title}
          </h3>
          <OrnateDivider className="mt-2.5 max-w-sm mx-auto" />
        </div>

        {/* Polyhedral Dice Row */}
        <div className="flex flex-wrap items-center justify-center gap-5 py-2">
          {dice.slice(0, 10).map((die, idx) => {
            const val = rolling ? tickValues[idx] || die.value : die.value;
            const isCritDie = !rolling && die.sides === 20 && die.value === 20;
            const isFumbleDie = !rolling && die.sides === 20 && die.value === 1;
            return (
              <PolyhedronShape
                key={idx}
                die={die}
                displayValue={val}
                skin={skin}
                rolling={rolling}
                isCritDie={isCritDie}
                isFumbleDie={isFumbleDie}
              />
            );
          })}
        </div>

        {/* Result Summary */}
        {!rolling && (
          <div className="flex flex-col items-center gap-1.5 text-center">
            {latestRollForOverlay.isCrit && (
              <div className="px-4 py-1 rounded-md bg-amber-950/75 border border-amber-400 text-amber-200 font-display font-extrabold text-xs tracking-widest flex items-center gap-1.5 shadow">
                <Flame className="w-4 h-4 text-amber-300" />
                ACERTO CRÍTICO NATURAL!
              </div>
            )}
            {latestRollForOverlay.isFumble && (
              <div className="px-4 py-1 rounded-md bg-red-950/80 border border-red-500 text-red-200 font-display font-extrabold text-xs tracking-widest">
                FALHA CRÍTICA (1 NATURAL)
              </div>
            )}

            <div className="flex items-baseline gap-3 mt-1">
              <span className="text-xs font-display uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                Resultado Total:
              </span>
              <span
                className="font-chronicle font-black text-4xl drop-shadow"
                style={{ color: auraColor }}
              >
                {latestRollForOverlay.total}
              </span>
              {latestRollForOverlay.damageTotal !== undefined && (
                <span className="text-xs font-display font-bold px-2.5 py-1 rounded-md bg-red-950/75 border border-red-500/40 text-red-200">
                  {latestRollForOverlay.damageType?.toLowerCase() === 'cura'
                    ? `+${latestRollForOverlay.damageTotal} Cura`
                    : `${latestRollForOverlay.damageTotal} ${latestRollForOverlay.damageType || 'Dano'}`}
                </span>
              )}
            </div>

            {latestRollForOverlay.targetName && latestRollForOverlay.hitStatus && (
              <div className="mt-1 flex items-center gap-2 text-xs">
                <span>Alvo: <strong>{latestRollForOverlay.targetName}</strong></span>
                {latestRollForOverlay.hitStatus === 'hit' ? (
                  <span className="text-emerald-400 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" /> ACERTOU!
                  </span>
                ) : (
                  <span className="text-red-400 font-bold flex items-center gap-1">
                    <ShieldAlert className="w-4 h-4" /> ERROU
                  </span>
                )}
              </div>
            )}

            <div className="text-[11px] font-lore italic" style={{ color: 'var(--text-muted)' }}>
              Clique em qualquer lugar para fechar
            </div>
          </div>
        )}
      </OrnateFrame>
    </div>
  );
};
