import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Clapperboard,
  CloudRain,
  Crosshair,
  Crown,
  Dices,
  DoorOpen,
  Droplets,
  Eraser,
  Eye,
  EyeOff,
  Flame,
  FlaskConical,
  Footprints,
  Heart,
  HelpCircle,
  Layers,
  Lightbulb,
  Lock,
  Map as MapIcon,
  MapPin,
  MessageSquare,
  Moon,
  MoreHorizontal,
  MousePointer,
  Navigation,
  Package,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  RotateCw,
  Ruler,
  Shield,
  Skull,
  Snowflake,
  Sparkles,
  Square,
  Swords,
  Trash2,
  Users,
  Video,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useCampaign } from '../context/CampaignContext';
import { ProjectileVfxCanvas } from './ProjectileVfxCanvas';
import {
  buildPendingAttackFromMonsterAttack,
  calculateMovementCostMeters,
  computeAdaptiveMapGrid,
  computeCharacterStats,
  consumeCombatantEconomy,
  DAMAGE_TYPE_OPTIONS,
  doesObserverDetectStealthedToken,
  doesTokenCollideAt,
  doSquaresOverlap,
  ensureSurfaceCondition,
  evaluateFormula,
  formatMonsterAttackSummary,
  isTokenNameHiddenFromPlayers,
  maskHiddenNameForRole,
  evaluateLineOfSightAndCover,
  evaluateTacticalAttackModifiers,
  findNearestFreeGridCell,
  formatFormulaForDisplay,
  getConditionGrantedAbilities,
  getConditionVisualTransform,
  getEffectiveFlankingMode,
  getEffectiveTerrainCells,
  getEffectiveWallMeta,
  getGridSpanDistance,
  getMonsterWoundStatus,
  getToken3DDistance,
  getTokenFaction,
  getTokenPassivePerception,
  getCombatantActionsRemaining,
  getCombatantBonusActionsRemaining,
  hasContinuousWallLineOfSight,
  isTokenHostileTo,
  isTokenIncapacitated,
  normalizeActionEconomyCost,
  parseAbilityDuration,
  parseAttackRangeMeters,
  parseAttackRangeSquares,
  resolveDragTargetCell,
  traceGridLine,
  validateTeleportDestination,
} from '../shared/rulesEngine';
import {
  AoETemplate,
  CampaignState,
  Character,
  ElementalSurfaceKind,
  GmMapMarker,
  GmMarkerKind,
  LightEmissionMode,
  MapDrawingStroke,
  MapToken,
  PendingAttackChoice,
  TacticalMap,
  TerrainCellKind,
  TokenSpeechEvent,
  WallCellMeta,
  WallCellShape,
} from '../shared/types';
import { FileUploadButton } from './FileUploadButton';
import { openEntitySheet } from './EntitySheetModal';
import { openInspectEntity } from './InspectEntityModal';
import { SculptedHealthBar } from './OrnateFrame';
import { openConfirmDialog, openTextPrompt } from './PromptDialog';
import { MapWeatherCanvas } from './MapWeatherCanvas';
import {
  DynamicDarknessCanvas,
  DynamicLightCircle,
  FogOfWarCanvas,
} from './DynamicDarknessCanvas';
import { TokenPortrait } from './TokenPortrait';

function getAtmosphericTintStyle(
  timeOfDay: TacticalMap['timeOfDay']
): { background: string; mixBlendMode: React.CSSProperties['mixBlendMode'] } | null {
  switch (timeOfDay) {
    case 'dawn':
      return {
        background:
          'linear-gradient(180deg, rgba(244, 143, 177, 0.16) 0%, rgba(245, 158, 11, 0.2) 58%, rgba(58, 32, 68, 0.24) 100%)',
        mixBlendMode: 'soft-light',
      };
    case 'dusk':
      return {
        background:
          'linear-gradient(180deg, rgba(217, 119, 6, 0.24) 0%, rgba(124, 45, 18, 0.28) 100%)',
        mixBlendMode: 'multiply',
      };
    case 'night':
      return {
        background:
          'linear-gradient(180deg, rgba(12, 20, 56, 0.46) 0%, rgba(5, 10, 30, 0.56) 100%)',
        mixBlendMode: 'multiply',
      };
    case 'bloodmoon':
      return {
        background:
          'radial-gradient(circle at 50% 20%, rgba(220, 38, 38, 0.24) 0%, rgba(127, 29, 29, 0.42) 55%, rgba(28, 5, 10, 0.62) 100%)',
        mixBlendMode: 'multiply',
      };
    case 'toxic':
      return {
        background:
          'radial-gradient(circle at 50% 60%, rgba(16, 185, 129, 0.16) 0%, rgba(6, 78, 59, 0.36) 55%, rgba(6, 26, 20, 0.54) 100%)',
        mixBlendMode: 'multiply',
      };
    default:
      return null;
  }
}

type StageTool =
  | 'select'
  | 'pointer'
  | 'ruler'
  | 'ping'
  | 'draw'
  | 'fog-reveal'
  | 'fog-hide'
  | 'terrain-wall'
  | 'terrain-cover'
  | 'terrain-difficult'
  | 'terrain-erase'
  | 'surface-fire'
  | 'surface-ice'
  | 'surface-acid'
  | 'surface-water';

const PRESET_GRADIENTS: Record<TacticalMap['themePreset'], string> = {
  crypt: 'radial-gradient(circle at 50% 45%, #24283b 0%, #141724 55%, #090b11 100%)',
  tavern: 'radial-gradient(circle at 32% 35%, #653819 0%, #3d200d 55%, #1c0e06 100%)',
  forest: 'radial-gradient(circle at 48% 42%, #1f422b 0%, #112819 55%, #07130c 100%)',
  desert: 'radial-gradient(circle at 60% 30%, #9b6f3f 0%, #634321 55%, #301e0e 100%)',
  castle: 'radial-gradient(circle at 50% 30%, #41495c 0%, #262c38 60%, #141820 100%)',
  void: 'radial-gradient(circle at 50% 50%, #32126e 0%, #170a38 55%, #070314 100%)',
  volcano: 'radial-gradient(circle at 50% 48%, #3a1712 0%, #1d0c0a 56%, #0b0404 100%)',
  glacier: 'radial-gradient(circle at 45% 35%, #2b5876 0%, #17354b 56%, #0a1926 100%)',
  swamp: 'radial-gradient(circle at 52% 48%, #213626 0%, #132118 56%, #080f0b 100%)',
  arena: 'radial-gradient(circle at 50% 50%, #7d5b37 0%, #4f371f 58%, #24170c 100%)',
  abyss: 'radial-gradient(circle at 50% 46%, #3a0b15 0%, #1a060b 56%, #080204 100%)',
  city: 'radial-gradient(circle at 46% 38%, #373c48 0%, #22262f 58%, #101319 100%)',
  ocean: 'radial-gradient(circle at 50% 50%, #154d63 0%, #0d2f40 58%, #061824 100%)',
  sanctuary: 'radial-gradient(circle at 50% 32%, #4a4337 0%, #2c2721 56%, #141210 100%)',
};

const BiomeFloorOverlay: React.FC<{
  preset: TacticalMap['themePreset'];
  cellPx: number;
}> = ({ preset, cellPx }) => {
  const s = Math.max(24, cellPx);
  const ambientLights: Array<{ x: string; y: string; color: string; size?: string }> =
    preset === 'crypt' || preset === 'castle'
      ? [
          { x: '16%', y: '18%', color: 'rgba(245, 158, 11, 0.26)' },
          { x: '84%', y: '18%', color: 'rgba(245, 158, 11, 0.26)' },
          { x: '16%', y: '82%', color: 'rgba(234, 88, 12, 0.22)' },
          { x: '84%', y: '82%', color: 'rgba(234, 88, 12, 0.22)' },
        ]
      : preset === 'tavern'
        ? [
            { x: '22%', y: '25%', color: 'rgba(251, 146, 60, 0.34)', size: 'w-80 h-80' },
            { x: '78%', y: '72%', color: 'rgba(245, 158, 11, 0.26)', size: 'w-72 h-72' },
            { x: '50%', y: '14%', color: 'rgba(253, 186, 116, 0.18)' },
          ]
        : preset === 'forest'
          ? [
              { x: '32%', y: '28%', color: 'rgba(134, 239, 172, 0.14)', size: 'w-96 h-96' },
              { x: '70%', y: '64%', color: 'rgba(187, 247, 208, 0.1)', size: 'w-80 h-80' },
            ]
          : preset === 'volcano'
            ? [
                { x: '24%', y: '26%', color: 'rgba(249, 115, 22, 0.32)', size: 'w-80 h-80' },
                { x: '76%', y: '74%', color: 'rgba(239, 68, 68, 0.3)', size: 'w-80 h-80' },
                { x: '50%', y: '50%', color: 'rgba(251, 146, 60, 0.18)', size: 'w-96 h-96' },
              ]
            : preset === 'glacier'
              ? [
                  { x: '28%', y: '24%', color: 'rgba(125, 211, 252, 0.22)', size: 'w-96 h-96' },
                  { x: '74%', y: '76%', color: 'rgba(186, 230, 253, 0.18)', size: 'w-80 h-80' },
                ]
              : preset === 'swamp'
                ? [
                    { x: '20%', y: '34%', color: 'rgba(74, 222, 128, 0.18)' },
                    { x: '78%', y: '28%', color: 'rgba(45, 212, 191, 0.16)' },
                    { x: '62%', y: '78%', color: 'rgba(163, 230, 53, 0.15)' },
                  ]
                : preset === 'arena'
                  ? [
                      { x: '12%', y: '14%', color: 'rgba(251, 146, 60, 0.28)' },
                      { x: '88%', y: '14%', color: 'rgba(251, 146, 60, 0.28)' },
                      { x: '12%', y: '86%', color: 'rgba(245, 158, 11, 0.24)' },
                      { x: '88%', y: '86%', color: 'rgba(245, 158, 11, 0.24)' },
                    ]
                  : preset === 'abyss'
                    ? [
                        { x: '50%', y: '50%', color: 'rgba(220, 38, 38, 0.26)', size: 'w-96 h-96' },
                        { x: '18%', y: '80%', color: 'rgba(153, 27, 27, 0.28)' },
                        { x: '82%', y: '20%', color: 'rgba(185, 28, 28, 0.26)' },
                      ]
                    : preset === 'city'
                      ? [
                          { x: '20%', y: '22%', color: 'rgba(251, 191, 36, 0.22)' },
                          { x: '80%', y: '22%', color: 'rgba(251, 191, 36, 0.22)' },
                          { x: '20%', y: '78%', color: 'rgba(245, 158, 11, 0.2)' },
                          { x: '80%', y: '78%', color: 'rgba(245, 158, 11, 0.2)' },
                        ]
                      : preset === 'sanctuary'
                        ? [
                            { x: '50%', y: '22%', color: 'rgba(253, 224, 71, 0.24)', size: 'w-96 h-96' },
                            { x: '50%', y: '50%', color: 'rgba(254, 240, 138, 0.16)', size: 'w-80 h-80' },
                          ]
                        : preset === 'void'
                          ? [
                              { x: '35%', y: '35%', color: 'rgba(168, 85, 247, 0.22)', size: 'w-96 h-96' },
                              { x: '70%', y: '68%', color: 'rgba(56, 189, 248, 0.16)', size: 'w-80 h-80' },
                            ]
                          : [];

  return (
    <>
      <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-65">
        <defs>
          <pattern
            id={`floor-pat-${preset}`}
            width={s * 3}
            height={s * 3}
            patternUnits="userSpaceOnUse"
          >
            {/* 1. CRYPT: Weathered tomb flagstones, deep mortar cracks, moss & ancient scuffs */}
            {preset === 'crypt' && (
              <>
                <rect x="1" y="1" width={s * 1.48} height={s * 1.48} fill="rgba(255,255,255,0.035)" stroke="rgba(0,0,0,0.55)" strokeWidth="1.6" />
                <rect x={s * 1.52} y="1" width={s * 1.46} height={s * 0.98} fill="rgba(0,0,0,0.16)" stroke="rgba(0,0,0,0.55)" strokeWidth="1.6" />
                <rect x={s * 1.52} y={s * 1.02} width={s * 1.46} height={s * 1.96} fill="rgba(255,255,255,0.025)" stroke="rgba(0,0,0,0.55)" strokeWidth="1.6" />
                <rect x="1" y={s * 1.52} width={s * 1.48} height={s * 1.46} fill="rgba(0,0,0,0.12)" stroke="rgba(0,0,0,0.55)" strokeWidth="1.6" />
                <path d={`M ${s * 0.2} ${s * 0.4} L ${s * 0.65} ${s * 0.68} L ${s * 0.85} ${s * 1.15}`} fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth="1.2" />
                <path d={`M ${s * 2.1} ${s * 1.6} L ${s * 2.45} ${s * 2.1} L ${s * 2.8} ${s * 2.25}`} fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth="1" />
                <ellipse cx={s * 1.45} cy={s * 1.5} rx={s * 0.22} ry={s * 0.14} fill="rgba(34,197,94,0.09)" />
                <circle cx={s * 0.35} cy={s * 2.3} r={s * 0.08} fill="rgba(148,163,184,0.12)" />
              </>
            )}

            {/* 2. TAVERN: Staggered oak planks, wood grain ripples & hammered iron nails */}
            {preset === 'tavern' && (
              <>
                {[0, 0.5, 1, 1.5, 2, 2.5].map((row, idx) => (
                  <g key={row}>
                    <rect
                      x="0"
                      y={s * row}
                      width={s * 3}
                      height={s * 0.5}
                      fill={idx % 2 === 0 ? 'rgba(0,0,0,0.14)' : 'rgba(255,195,120,0.05)'}
                      stroke="rgba(18,8,2,0.72)"
                      strokeWidth="1.2"
                    />
                    <path
                      d={`M 0 ${s * (row + 0.24)} Q ${s * 0.9} ${s * (row + 0.14)}, ${s * 1.8} ${s * (row + 0.28)} T ${s * 3} ${s * (row + 0.22)}`}
                      fill="none"
                      stroke="rgba(255,210,150,0.07)"
                      strokeWidth="0.9"
                    />
                    <line
                      x1={s * ((idx * 1.15 + 0.65) % 2.8)}
                      y1={s * row}
                      x2={s * ((idx * 1.15 + 0.65) % 2.8)}
                      y2={s * (row + 0.5)}
                      stroke="rgba(16,6,1,0.82)"
                      strokeWidth="1.4"
                    />
                    <circle cx={s * ((idx * 1.15 + 0.56) % 2.8)} cy={s * (row + 0.15)} r="1.4" fill="rgba(12,6,2,0.8)" />
                    <circle cx={s * ((idx * 1.15 + 0.56) % 2.8)} cy={s * (row + 0.35)} r="1.4" fill="rgba(12,6,2,0.8)" />
                  </g>
                ))}
              </>
            )}

            {/* 3. FOREST: Layered mossy turf, grass blades, pebbles, fallen leaves & gnarled roots */}
            {preset === 'forest' && (
              <>
                <circle cx={s * 0.7} cy={s * 0.65} r={s * 0.52} fill="rgba(34,197,94,0.08)" />
                <circle cx={s * 2.2} cy={s * 1.85} r={s * 0.68} fill="rgba(0,0,0,0.18)" />
                <circle cx={s * 1.35} cy={s * 2.4} r={s * 0.44} fill="rgba(74,222,128,0.06)" />
                {/* Organic grass tufts */}
                <path d={`M ${s * 0.4} ${s * 0.9} L ${s * 0.34} ${s * 0.68} M ${s * 0.44} ${s * 0.9} L ${s * 0.46} ${s * 0.64} M ${s * 0.48} ${s * 0.9} L ${s * 0.56} ${s * 0.72}`} stroke="rgba(134,239,172,0.22)" strokeWidth="1.1" strokeLinecap="round" />
                <path d={`M ${s * 2.3} ${s * 0.75} L ${s * 2.24} ${s * 0.55} M ${s * 2.35} ${s * 0.75} L ${s * 2.38} ${s * 0.52} M ${s * 2.4} ${s * 0.75} L ${s * 2.48} ${s * 0.58}`} stroke="rgba(74,222,128,0.2)" strokeWidth="1.1" strokeLinecap="round" />
                <path d={`M ${s * 1.1} ${s * 2.15} L ${s * 1.04} ${s * 1.95} M ${s * 1.15} ${s * 2.15} L ${s * 1.18} ${s * 1.92}`} stroke="rgba(134,239,172,0.18)" strokeWidth="1" strokeLinecap="round" />
                {/* Fallen autumn/gold leaves & forest stones */}
                <ellipse cx={s * 1.65} cy={s * 0.95} rx="4" ry="2.2" transform={`rotate(28 ${s * 1.65} ${s * 0.95})`} fill="rgba(217,119,6,0.28)" />
                <ellipse cx={s * 0.85} cy={s * 1.72} rx="3.5" ry="2" transform={`rotate(-36 ${s * 0.85} ${s * 1.72})`} fill="rgba(180,83,9,0.25)" />
                <ellipse cx={s * 2.55} cy={s * 2.45} rx={s * 0.14} ry={s * 0.09} fill="rgba(148,163,184,0.16)" stroke="rgba(0,0,0,0.35)" strokeWidth="0.9" />
                <path d={`M 0 ${s * 1.4} Q ${s * 0.6} ${s * 1.25}, ${s * 1.15} ${s * 1.55}`} fill="none" stroke="rgba(69,39,18,0.45)" strokeWidth="2.2" strokeLinecap="round" />
              </>
            )}

            {/* 4. DESERT: Sculpted wind-carved sand dunes, sandstone pebbles & dry earth cracks */}
            {preset === 'desert' && (
              <>
                {[0.45, 1.2, 1.95, 2.7].map((ry, i) => (
                  <g key={ry}>
                    <path
                      d={`M 0 ${s * ry} Q ${s * 0.75} ${s * (ry - 0.24)}, ${s * 1.5} ${s * ry} T ${s * 3} ${s * ry}`}
                      fill="none"
                      stroke={i % 2 === 0 ? 'rgba(254,240,199,0.2)' : 'rgba(69,36,12,0.26)'}
                      strokeWidth={i % 2 === 0 ? '2' : '2.6'}
                    />
                  </g>
                ))}
                <circle cx={s * 0.62} cy={s * 0.82} r="2.2" fill="rgba(92,52,20,0.38)" />
                <circle cx={s * 2.15} cy={s * 1.62} r="3" fill="rgba(64,34,12,0.32)" />
                <circle cx={s * 1.38} cy={s * 2.45} r="1.8" fill="rgba(254,243,199,0.25)" />
                <path d={`M ${s * 2.1} ${s * 0.6} L ${s * 2.42} ${s * 0.72} L ${s * 2.3} ${s * 0.98}`} fill="none" stroke="rgba(54,28,10,0.32)" strokeWidth="1" />
              </>
            )}

            {/* 5. CASTLE: Honed royal stone checkerboard with beveled edges & gold filigree studs */}
            {preset === 'castle' && (
              <>
                {[0, 1, 2].map((gx) =>
                  [0, 1, 2].map((gy) => (
                    <rect
                      key={`${gx}-${gy}`}
                      x={gx * s + 1}
                      y={gy * s + 1}
                      width={s - 2}
                      height={s - 2}
                      fill={(gx + gy) % 2 === 0 ? 'rgba(255,255,255,0.055)' : 'rgba(0,0,0,0.18)'}
                      stroke="rgba(12,15,24,0.62)"
                      strokeWidth="1.4"
                    />
                  ))
                )}
                <polygon
                  points={`${s * 1.5},${s * 1.32} ${s * 1.68},${s * 1.5} ${s * 1.5},${s * 1.68} ${s * 1.32},${s * 1.5}`}
                  fill="rgba(212,173,92,0.16)"
                  stroke="rgba(212,173,92,0.28)"
                  strokeWidth="0.9"
                />
              </>
            )}

            {/* 6. VOID / ASTRAL: Connected starlight constellations, cosmic dust & orbital rings */}
            {preset === 'void' && (
              <>
                <circle cx={s * 1.5} cy={s * 1.5} r={s * 1.15} fill="none" stroke="rgba(167,139,250,0.18)" strokeWidth="1" strokeDasharray="6 6" />
                <polyline
                  points={`${s * 0.4},${s * 0.5} ${s * 1.25},${s * 0.85} ${s * 2.2},${s * 0.45} ${s * 2.55},${s * 1.6} ${s * 1.4},${s * 2.4}`}
                  fill="none"
                  stroke="rgba(196,181,253,0.2)"
                  strokeWidth="0.9"
                />
                {[
                  [0.4, 0.5, 2.2],
                  [1.25, 0.85, 1.8],
                  [2.2, 0.45, 2.5],
                  [2.55, 1.6, 1.6],
                  [1.4, 2.4, 2.1],
                  [0.65, 2.15, 1.3],
                  [2.1, 2.65, 1.4],
                ].map(([sx, sy, r], idx) => (
                  <circle key={idx} cx={s * sx} cy={s * sy} r={r} fill="rgba(233,213,255,0.65)" />
                ))}
              </>
            )}

            {/* 7. VOLCANO / MAGMA (NEW!): Fractured obsidian basalt plates + glowing lava fissures */}
            {preset === 'volcano' && (
              <>
                <polygon
                  points={`0,0 ${s * 1.4},${s * 0.2} ${s * 1.1},${s * 1.55} 0,${s * 1.3}`}
                  fill="rgba(12,10,12,0.52)"
                  stroke="rgba(249,115,22,0.55)"
                  strokeWidth="1.8"
                />
                <polygon
                  points={`${s * 1.4},${s * 0.2} ${s * 3},0 ${s * 3},${s * 1.4} ${s * 1.7},${s * 1.65} ${s * 1.1},${s * 1.55}`}
                  fill="rgba(20,12,12,0.42)"
                  stroke="rgba(239,68,68,0.52)"
                  strokeWidth="1.8"
                />
                <polygon
                  points={`0,${s * 1.3} ${s * 1.1},${s * 1.55} ${s * 1.5},${s * 3} 0,${s * 3}`}
                  fill="rgba(15,10,10,0.48)"
                  stroke="rgba(251,146,60,0.48)"
                  strokeWidth="1.6"
                />
                <polygon
                  points={`${s * 1.1},${s * 1.55} ${s * 1.7},${s * 1.65} ${s * 3},${s * 1.4} ${s * 3},${s * 3} ${s * 1.5},${s * 3}`}
                  fill="rgba(18,9,9,0.54)"
                  stroke="rgba(253,186,116,0.42)"
                  strokeWidth="1.6"
                />
                {/* Molten bright core crack highlight */}
                <polyline
                  points={`${s * 1.4},${s * 0.2} ${s * 1.1},${s * 1.55} ${s * 1.7},${s * 1.65}`}
                  fill="none"
                  stroke="rgba(254,240,138,0.58)"
                  strokeWidth="0.9"
                />
              </>
            )}

            {/* 8. GLACIER / ICE (NEW!): Faceted crystal ice sheets, sharp frost fractures & snow glints */}
            {preset === 'glacier' && (
              <>
                <polygon points={`0,0 ${s * 1.7},${s * 0.4} ${s * 1.1},${s * 1.9} 0,${s * 1.5}`} fill="rgba(186,230,253,0.12)" stroke="rgba(224,242,254,0.34)" strokeWidth="1.2" />
                <polygon points={`${s * 1.7},${s * 0.4} ${s * 3},0 ${s * 3},${s * 1.8} ${s * 1.9},${s * 2.2} ${s * 1.1},${s * 1.9}`} fill="rgba(56,189,248,0.09)" stroke="rgba(186,230,253,0.28)" strokeWidth="1.1" />
                <path d={`M ${s * 0.3} ${s * 2.4} L ${s * 1.1} ${s * 1.9} L ${s * 2.5} ${s * 2.7}`} fill="none" stroke="rgba(255,255,255,0.42)" strokeWidth="1.2" />
                <path d={`M ${s * 2.1} ${s * 0.8} L ${s * 2.35} ${s * 0.55} M ${s * 2.22} ${s * 0.67} L ${s * 2.42} ${s * 0.85}`} stroke="rgba(255,255,255,0.48)" strokeWidth="1" />
                <circle cx={s * 0.8} cy={s * 0.7} r="1.8" fill="rgba(255,255,255,0.55)" />
                <circle cx={s * 2.45} cy={s * 2.15} r="2.2" fill="rgba(224,242,254,0.45)" />
              </>
            )}

            {/* 9. SWAMP (NEW!): Murky peat puddles, mossy stepping stones, lily pads & reeds */}
            {preset === 'swamp' && (
              <>
                <ellipse cx={s * 1.15} cy={s * 1.15} rx={s * 0.85} ry={s * 0.58} fill="rgba(16,45,32,0.45)" stroke="rgba(74,222,128,0.14)" strokeWidth="1.1" />
                <ellipse cx={s * 1.15} cy={s * 1.15} rx={s * 0.58} ry={s * 0.36} fill="none" stroke="rgba(134,239,172,0.12)" strokeWidth="0.8" strokeDasharray="6 4" />
                {/* Lily pad with notch */}
                <path
                  d={`M ${s * 0.95} ${s * 1.05} L ${s * 1.16} ${s * 0.98} A ${s * 0.22} ${s * 0.22} 0 1 1 ${s * 1.12} ${s * 1.18} Z`}
                  fill="rgba(34,197,94,0.26)"
                  stroke="rgba(134,239,172,0.32)"
                  strokeWidth="0.9"
                />
                {/* Stepping stone & mud mound */}
                <ellipse cx={s * 2.4} cy={s * 0.72} rx={s * 0.32} ry={s * 0.22} fill="rgba(100,116,139,0.22)" stroke="rgba(0,0,0,0.45)" strokeWidth="1.2" />
                <ellipse cx={s * 2.25} cy={s * 2.35} rx={s * 0.44} ry={s * 0.28} fill="rgba(20,50,35,0.42)" stroke="rgba(163,230,53,0.16)" strokeWidth="1" />
                <circle cx={s * 0.45} cy={s * 2.45} r="2.2" fill="rgba(163,230,53,0.42)" />
              </>
            )}

            {/* 10. ARENA / COLISEUM (NEW!): Raked battle sand, boot scuffs & gladiatorial dust */}
            {preset === 'arena' && (
              <>
                <path d={`M 0 ${s * 0.55} Q ${s * 1.5} ${s * 0.35}, ${s * 3} ${s * 0.55}`} fill="none" stroke="rgba(253,224,171,0.16)" strokeWidth="1.8" />
                <path d={`M 0 ${s * 1.55} Q ${s * 1.5} ${s * 1.78}, ${s * 3} ${s * 1.55}`} fill="none" stroke="rgba(68,36,14,0.26)" strokeWidth="2.2" />
                <path d={`M 0 ${s * 2.55} Q ${s * 1.5} ${s * 2.38}, ${s * 3} ${s * 2.55}`} fill="none" stroke="rgba(253,224,171,0.14)" strokeWidth="1.6" />
                {/* Old combat drag & weapon scrape marks */}
                <line x1={s * 0.5} y1={s * 0.9} x2={s * 1.25} y2={s * 1.2} stroke="rgba(127,29,29,0.22)" strokeWidth="2.2" strokeLinecap="round" />
                <circle cx={s * 2.25} cy={s * 2.05} r="2.5" fill="rgba(68,36,14,0.34)" />
                <circle cx={s * 0.85} cy={s * 2.25} r="1.8" fill="rgba(254,240,199,0.22)" />
              </>
            )}

            {/* 11. ABYSS / DEMONIC (NEW!): Scorched crimson-obsidian slabs & hellish runic veins */}
            {preset === 'abyss' && (
              <>
                <rect x="2" y="2" width={s * 1.46} height={s * 1.46} fill="rgba(10,3,6,0.52)" stroke="rgba(220,38,38,0.38)" strokeWidth="1.4" />
                <rect x={s * 1.52} y={s * 1.52} width={s * 1.46} height={s * 1.46} fill="rgba(15,4,8,0.48)" stroke="rgba(220,38,38,0.34)" strokeWidth="1.4" />
                <path d={`M ${s * 1.5} 0 L ${s * 1.5} ${s * 3} M 0 ${s * 1.5} L ${s * 3} ${s * 1.5}`} stroke="rgba(239,68,68,0.26)" strokeWidth="1.2" />
                <polygon
                  points={`${s * 0.75},${s * 0.35} ${s * 1.12},${s * 0.75} ${s * 0.75},${s * 1.15} ${s * 0.38},${s * 0.75}`}
                  fill="none"
                  stroke="rgba(248,113,113,0.32)"
                  strokeWidth="1"
                />
                <path d={`M ${s * 1.8} ${s * 0.5} L ${s * 2.3} ${s * 0.9} L ${s * 2.75} ${s * 0.6}`} fill="none" stroke="rgba(239,68,68,0.42)" strokeWidth="1.3" />
              </>
            )}

            {/* 12. CITY / COBBLESTONE (NEW!): Detailed irregular medieval cobblestone pavers */}
            {preset === 'city' && (
              <>
                {[
                  [0.06, 0.08, 0.88, 0.62],
                  [1.0, 0.06, 0.94, 0.66],
                  [2.0, 0.08, 0.92, 0.62],
                  [0.06, 0.78, 0.62, 0.66],
                  [0.74, 0.78, 0.98, 0.66],
                  [1.78, 0.78, 1.14, 0.66],
                  [0.06, 1.52, 1.08, 0.64],
                  [1.2, 1.52, 0.86, 0.64],
                  [2.12, 1.52, 0.8, 0.64],
                  [0.06, 2.24, 0.76, 0.68],
                  [0.88, 2.24, 1.04, 0.68],
                  [1.98, 2.24, 0.94, 0.68],
                ].map(([rx, ry, rw, rh], idx) => (
                  <rect
                    key={idx}
                    x={s * rx}
                    y={s * ry}
                    width={s * rw}
                    height={s * rh}
                    rx="4"
                    fill={idx % 3 === 0 ? 'rgba(255,255,255,0.06)' : idx % 3 === 1 ? 'rgba(0,0,0,0.16)' : 'rgba(148,163,184,0.05)'}
                    stroke="rgba(8,10,16,0.72)"
                    strokeWidth="1.5"
                  />
                ))}
              </>
            )}

            {/* 13. OCEAN / SHIP DECK (NEW!): Rolling stylized ocean waves + sea-foam crests */}
            {preset === 'ocean' && (
              <>
                {[0.45, 1.45, 2.45].map((wy, i) => (
                  <g key={wy}>
                    <path
                      d={`M 0 ${s * wy} Q ${s * 0.75} ${s * (wy - 0.28)}, ${s * 1.5} ${s * wy} T ${s * 3} ${s * wy}`}
                      fill="none"
                      stroke={i % 2 === 0 ? 'rgba(125,211,252,0.28)' : 'rgba(56,189,248,0.22)'}
                      strokeWidth="2.2"
                    />
                    <path
                      d={`M ${s * 0.35} ${s * (wy + 0.25)} Q ${s * 0.9} ${s * (wy + 0.1)}, ${s * 1.45} ${s * (wy + 0.25)}`}
                      fill="none"
                      stroke="rgba(224,242,254,0.24)"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                    />
                  </g>
                ))}
              </>
            )}

            {/* 14. SANCTUARY / CELESTIAL TEMPLE (NEW!): Ivory & gold cathedral diamond mosaic */}
            {preset === 'sanctuary' && (
              <>
                <polygon
                  points={`${s * 1.5},0 ${s * 3},${s * 1.5} ${s * 1.5},${s * 3} 0,${s * 1.5}`}
                  fill="rgba(254,243,199,0.07)"
                  stroke="rgba(212,173,92,0.34)"
                  strokeWidth="1.4"
                />
                <polygon
                  points={`${s * 1.5},${s * 0.45} ${s * 2.55},${s * 1.5} ${s * 1.5},${s * 2.55} ${s * 0.45},${s * 1.5}`}
                  fill="rgba(253,224,71,0.04)"
                  stroke="rgba(232,198,131,0.24)"
                  strokeWidth="1"
                />
                <circle cx={s * 1.5} cy={s * 1.5} r={s * 0.16} fill="rgba(232,198,131,0.22)" />
              </>
            )}
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#floor-pat-${preset})`} />

        {/* Theme-Tailored Architectural Centerpiece Motif */}
        {(preset === 'crypt' || preset === 'castle' || preset === 'sanctuary') && (
          <g stroke={preset === 'sanctuary' ? 'rgba(253,224,71,0.22)' : 'rgba(228,186,82,0.15)'} fill="none">
            <circle cx="50%" cy="50%" r={s * 3.1} strokeWidth="1.8" />
            <circle cx="50%" cy="50%" r={s * 2.6} strokeWidth="1" strokeDasharray="8 6" />
            <circle cx="50%" cy="50%" r={s * 1.65} strokeWidth="1.2" />
          </g>
        )}
        {preset === 'arena' && (
          <g stroke="rgba(232,198,131,0.22)" fill="none">
            <circle cx="50%" cy="50%" r={s * 4.5} strokeWidth="3" />
            <circle cx="50%" cy="50%" r={s * 3.2} strokeWidth="1.2" strokeDasharray="12 8" />
            <circle cx="50%" cy="50%" r={s * 1.2} strokeWidth="1.6" stroke="rgba(220,38,38,0.28)" />
          </g>
        )}
        {preset === 'abyss' && (
          <g stroke="rgba(239,68,68,0.24)" fill="none">
            <circle cx="50%" cy="50%" r={s * 3.4} strokeWidth="2.2" />
            <circle cx="50%" cy="50%" r={s * 2.8} strokeWidth="1.2" strokeDasharray="14 8" />
          </g>
        )}
      </svg>

      {/* Animated Ambient Torchlight / Magma / Wisp / Sunbeam Pools */}
      {ambientLights.map((t, i) => (
        <div
          key={i}
          className={`absolute ${t.size || 'w-64 h-64'} -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none animate-torch-flicker`}
          style={{
            left: t.x,
            top: t.y,
            background: `radial-gradient(circle, ${t.color} 0%, transparent 70%)`,
          }}
        />
      ))}

      {/* Deep Atmospheric Corner Vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ boxShadow: 'inset 0 0 95px rgba(0, 0, 0, 0.82)' }}
      />
    </>
  );
};

/**
 * Persistent Battle Scars Layer (Black Flash Craters, Blood Slashes, Scorch Marks, Frost Shatters, Acid Pools)
 */
const BattleScarsLayer: React.FC<{
  scars: NonNullable<TacticalMap['battleScars']>;
  cellPx: number;
}> = ({ scars, cellPx }) => {
  if (!scars.length) return null;
  return (
    <div className="absolute inset-0 pointer-events-none z-[5]">
      {scars.map((scar) => {
        const pxSize = Math.max(1, scar.size) * cellPx * 1.35;
        const left = (scar.x + Math.max(1, scar.size) / 2) * cellPx - pxSize / 2;
        const top = (scar.y + Math.max(1, scar.size) / 2) * cellPx - pxSize / 2;
        return (
          <svg
            key={scar.id}
            viewBox="0 0 120 120"
            className="absolute pointer-events-none"
            style={{
              left,
              top,
              width: pxSize,
              height: pxSize,
              transform: `rotate(${scar.rotation}deg)`,
              opacity: 0.88,
            }}
          >
            {scar.kind === 'black-flash' && (
              <g>
                <circle cx="60" cy="60" r="34" fill="rgba(4,4,8,0.68)" />
                <circle cx="60" cy="60" r="24" fill="rgba(185,28,28,0.22)" />
                <g stroke="#dc2626" strokeWidth="3.5" fill="none" strokeLinecap="round">
                  <polyline points="60,60 44,40 24,28 10,14" />
                  <polyline points="60,60 80,44 96,26 112,18" />
                  <polyline points="60,60 42,78 22,94 12,108" />
                  <polyline points="60,60 78,80 98,96 110,108" />
                  <polyline points="60,60 58,30 66,8" />
                  <polyline points="60,60 64,92 54,112" />
                </g>
                <g stroke="#050507" strokeWidth="1.8" fill="none" strokeLinecap="round">
                  <polyline points="60,60 44,40 24,28 10,14" />
                  <polyline points="60,60 80,44 96,26 112,18" />
                  <polyline points="60,60 42,78 22,94 12,108" />
                  <polyline points="60,60 78,80 98,96 110,108" />
                </g>
              </g>
            )}
            {scar.kind === 'blood-slash' && (
              <g>
                <ellipse cx="60" cy="62" rx="34" ry="24" fill="rgba(127,29,29,0.52)" />
                <ellipse cx="44" cy="48" rx="16" ry="12" fill="rgba(153,27,27,0.46)" />
                <circle cx="88" cy="40" r="6" fill="rgba(153,27,27,0.58)" />
                <circle cx="28" cy="82" r="5" fill="rgba(127,29,29,0.54)" />
                <circle cx="96" cy="76" r="4" fill="rgba(185,28,28,0.52)" />
                <path d="M 18 96 Q 58 58, 102 22" stroke="rgba(15,4,6,0.88)" strokeWidth="5.5" strokeLinecap="round" fill="none" />
                <path d="M 20 94 Q 58 58, 100 24" stroke="rgba(220,38,38,0.65)" strokeWidth="1.6" strokeLinecap="round" fill="none" />
              </g>
            )}
            {scar.kind === 'crater' && (
              <g>
                <circle cx="60" cy="60" r="32" fill="rgba(10,10,14,0.58)" stroke="rgba(148,163,184,0.28)" strokeWidth="2" />
                <circle cx="60" cy="60" r="18" fill="rgba(5,5,8,0.5)" />
                <g stroke="rgba(15,15,20,0.85)" strokeWidth="2.5" fill="none">
                  <polyline points="60,60 36,36 16,28" />
                  <polyline points="60,60 88,38 106,24" />
                  <polyline points="60,60 34,86 18,104" />
                  <polyline points="60,60 86,84 104,100" />
                  <polyline points="60,60 60,22 68,10" />
                </g>
              </g>
            )}
            {scar.kind === 'scorch' && (
              <g>
                <circle cx="60" cy="60" r="38" fill="rgba(12,8,6,0.65)" />
                <circle cx="60" cy="60" r="24" fill="rgba(154,52,18,0.26)" />
                <g stroke="rgba(249,115,22,0.65)" strokeWidth="2" fill="none">
                  <polyline points="60,60 40,42 26,34" />
                  <polyline points="60,60 82,46 96,36" />
                  <polyline points="60,60 46,82 32,96" />
                  <polyline points="60,60 76,80 92,94" />
                </g>
              </g>
            )}
            {scar.kind === 'frost-shatter' && (
              <g>
                <polygon points="60,18 76,44 104,60 76,76 60,102 44,76 16,60 44,44" fill="rgba(125,211,252,0.24)" stroke="rgba(224,242,254,0.72)" strokeWidth="2" />
                <line x1="20" y1="60" x2="100" y2="60" stroke="rgba(255,255,255,0.65)" strokeWidth="1.5" />
                <line x1="60" y1="20" x2="60" y2="100" stroke="rgba(255,255,255,0.65)" strokeWidth="1.5" />
              </g>
            )}
            {scar.kind === 'acid-pool' && (
              <g>
                <ellipse cx="60" cy="60" rx="36" ry="26" fill="rgba(22,101,52,0.52)" stroke="rgba(74,222,128,0.52)" strokeWidth="1.8" />
                <circle cx="48" cy="54" r="6" fill="rgba(134,239,172,0.38)" />
                <circle cx="72" cy="66" r="4.5" fill="rgba(163,230,53,0.45)" />
                <circle cx="64" cy="48" r="3" fill="rgba(187,247,208,0.5)" />
              </g>
            )}
          </svg>
        );
      })}
    </div>
  );
};

const TOKEN_LIGHT_PRESETS: Array<{
  id: 'none' | 'torch' | 'lantern' | 'darkvision';
  label: string;
  short: string;
  mode: LightEmissionMode;
  radiusMeters: number;
}> = [
  { id: 'none', label: 'Apagada', short: 'Off', mode: 'none', radiusMeters: 0 },
  { id: 'torch', label: 'Tocha (6m • Todos veem)', short: '🔥 6m', mode: 'shared', radiusMeters: 6 },
  { id: 'lantern', label: 'Lanterna (9m • Todos veem)', short: '🏮 9m', mode: 'shared', radiusMeters: 9 },
  {
    id: 'darkvision',
    label: 'Visão no Escuro (18m • Só o dono vê)',
    short: '👁 18m',
    mode: 'personal-darkvision',
    radiusMeters: 18,
  },
];

interface ResolvedLightOption {
  id: string;
  label: string;
  short: string;
  mode: LightEmissionMode;
  radiusMeters: number;
}

function getItemLightMeta(item: {
  name: string;
  lightMode?: LightEmissionMode;
  lightRadiusMeters?: number;
}): { mode: LightEmissionMode; radiusMeters: number } | null {
  if (item.lightMode && item.lightMode !== 'none' && (item.lightRadiusMeters ?? 0) > 0) {
    return { mode: item.lightMode, radiusMeters: item.lightRadiusMeters! };
  }
  const low = item.name.toLowerCase();
  if (low.includes('tocha')) return { mode: 'shared', radiusMeters: 6 };
  if (low.includes('lanterna') || low.includes('lampião') || low.includes('lampiao')) {
    return { mode: 'shared', radiusMeters: 9 };
  }
  return null;
}

function getAbilityLightMeta(ab: {
  name: string;
  lightMode?: LightEmissionMode;
  lightRadiusMeters?: number;
}): { mode: LightEmissionMode; radiusMeters: number } | null {
  if (ab.lightMode && ab.lightMode !== 'none' && (ab.lightRadiusMeters ?? 0) > 0) {
    return { mode: ab.lightMode, radiusMeters: ab.lightRadiusMeters! };
  }
  const low = ab.name.toLowerCase();
  if (low.includes('visão no escuro') || low.includes('visao no escuro') || low.includes('darkvision')) {
    return { mode: 'personal-darkvision', radiusMeters: 18 };
  }
  return null;
}

function getCharacterAvailableLightOptions(
  char: Character,
  campaign: CampaignState
): { toggleOptions: ResolvedLightOption[]; passiveDarkvisionMeters: number } {
  const toggleOptions: ResolvedLightOption[] = [];
  const seen = new Set<string>();
  let passiveDarkvisionMeters = 0;

  for (const inv of char.inventory || []) {
    if (inv.quantity <= 0) continue;
    const def = campaign.compendium.items.find((i) => i.id === inv.itemId);
    if (!def) continue;
    const meta = getItemLightMeta(def);
    if (!meta) continue;
    const optId = `item:${def.id}`;
    if (seen.has(optId)) continue;
    seen.add(optId);
    toggleOptions.push({
      id: optId,
      label: `${def.name} (${meta.radiusMeters}m • ${meta.mode === 'personal-darkvision' ? 'Só você vê' : 'Todos veem'})`,
      short: `${meta.mode === 'personal-darkvision' ? '👁' : '🔥'} ${def.name.slice(0, 10)} (${meta.radiusMeters}m)`,
      mode: meta.mode,
      radiusMeters: meta.radiusMeters,
    });
  }

  for (const aid of char.knownAbilityIds || []) {
    const ab = campaign.compendium.abilities.find((a) => a.id === aid);
    if (!ab) continue;
    const meta = getAbilityLightMeta(ab);
    if (!meta) continue;
    if (ab.actionType === 'Passiva' && meta.mode === 'personal-darkvision') {
      passiveDarkvisionMeters = Math.max(passiveDarkvisionMeters, meta.radiusMeters);
      continue;
    }
    const optId = `ability:${ab.id}`;
    if (seen.has(optId)) continue;
    seen.add(optId);
    toggleOptions.push({
      id: optId,
      label: `${ab.name} (${meta.radiusMeters}m • ${meta.mode === 'personal-darkvision' ? 'Só você vê' : 'Todos veem'})`,
      short: `${meta.mode === 'personal-darkvision' ? '👁' : '✨'} ${ab.name.slice(0, 10)} (${meta.radiusMeters}m)`,
      mode: meta.mode,
      radiusMeters: meta.radiusMeters,
    });
  }

  for (const cid of char.activeConditionIds || []) {
    const cond = campaign.compendium.conditions.find((c) => c.id === cid);
    if (cond?.lightMode === 'personal-darkvision' && (cond.lightRadiusMeters ?? 0) > 0) {
      passiveDarkvisionMeters = Math.max(passiveDarkvisionMeters, cond.lightRadiusMeters!);
    }
  }

  return { toggleOptions, passiveDarkvisionMeters };
}

function resolveTokenLightForViewer(
  tok: MapToken,
  campaign: CampaignState,
  viewerRole: 'gm' | 'player',
  viewerCharacterId?: string
): { sharedRadiusM: number; personalRadiusM: number; immediateSenseM: number } {
  const linkedChar =
    tok.type === 'character' && tok.referenceId
      ? campaign.characters.find((c) => c.id === tok.referenceId)
      : undefined;
  const isViewerOwnHero = Boolean(
    viewerCharacterId &&
      ((tok.type === 'character' && tok.referenceId === viewerCharacterId) ||
        tok.controlledByCharacterId === viewerCharacterId)
  );
  const canSeePersonal = viewerRole === 'gm' || isViewerOwnHero;

  let sharedRadiusM = 0;
  let personalRadiusM = 0;

  // 1. Explicit active light toggled on the token
  const src = tok.lightSource || 'none';
  if (src && src !== 'none') {
    let valid = true;
    let mode: LightEmissionMode =
      tok.lightMode ||
      (src === 'darkvision' ? 'personal-darkvision' : 'shared');
    let rad = typeof tok.lightRadiusMeters === 'number' && tok.lightRadiusMeters > 0 ? tok.lightRadiusMeters : 0;

    if (src === 'torch') {
      mode = 'shared';
      rad = rad || 6;
    } else if (src === 'lantern') {
      mode = 'shared';
      rad = rad || 9;
    } else if (src === 'darkvision') {
      mode = 'personal-darkvision';
      rad = rad || 18;
    } else if (src.startsWith('item:')) {
      const itemId = src.slice(5);
      const itemDef = campaign.compendium.items.find((i) => i.id === itemId);
      const stillOwns =
        !linkedChar || (linkedChar.inventory || []).some((inv) => inv.itemId === itemId && inv.quantity > 0);
      if (!stillOwns) {
        valid = false;
      } else if (itemDef) {
        const meta = getItemLightMeta(itemDef);
        if (meta) {
          mode = meta.mode;
          rad = rad || meta.radiusMeters;
        }
      }
    } else if (src.startsWith('ability:')) {
      const abId = src.slice(8);
      const abDef = campaign.compendium.abilities.find((a) => a.id === abId);
      const stillKnows = !linkedChar || (linkedChar.knownAbilityIds || []).includes(abId);
      if (!stillKnows) {
        valid = false;
      } else if (abDef) {
        const meta = getAbilityLightMeta(abDef);
        if (meta) {
          mode = meta.mode;
          rad = rad || meta.radiusMeters;
        }
      }
    }

    if (valid && rad > 0) {
      if (mode === 'shared') {
        sharedRadiusM = Math.max(sharedRadiusM, rad);
      } else if (mode === 'personal-darkvision' && canSeePersonal) {
        personalRadiusM = Math.max(personalRadiusM, rad);
      }
    }
  }

  // 2. Active Conditions granting shared light or personal darkvision
  const condIds = new Set<string>([
    ...(tok.activeConditionIds || []),
    ...(linkedChar?.activeConditionIds || []),
  ]);
  for (const cid of condIds) {
    const cond = campaign.compendium.conditions.find((c) => c.id === cid);
    if (!cond?.lightMode || cond.lightMode === 'none' || !(cond.lightRadiusMeters ?? 0)) continue;
    if (cond.lightMode === 'shared') {
      sharedRadiusM = Math.max(sharedRadiusM, cond.lightRadiusMeters!);
    } else if (cond.lightMode === 'personal-darkvision' && canSeePersonal) {
      personalRadiusM = Math.max(personalRadiusM, cond.lightRadiusMeters!);
    }
  }

  // 3. Automatic Passive Personal Darkvision (only for owning player + GM!)
  if (linkedChar && canSeePersonal) {
    const { passiveDarkvisionMeters } = getCharacterAvailableLightOptions(linkedChar, campaign);
    if (passiveDarkvisionMeters > 0) {
      personalRadiusM = Math.max(personalRadiusM, passiveDarkvisionMeters);
    }
  }

  // 4. Tiny immediate personal sense (~1 square around own hero) so players are never 100% blind
  const immediateSenseM = isViewerOwnHero ? Math.max(1.5, campaign.settings.gridSquareMeters || 1.5) : 0;

  return { sharedRadiusM, personalRadiusM, immediateSenseM };
}

function getTokenSharedLightRadiusMeters(tok: MapToken, campaign?: CampaignState): number {
  if (campaign) {
    return resolveTokenLightForViewer(tok, campaign, 'gm').sharedRadiusM;
  }
  if (tok.lightMode === 'personal-darkvision' || tok.lightSource === 'darkvision') return 0;
  if (typeof tok.lightRadiusMeters === 'number' && tok.lightRadiusMeters > 0) {
    return tok.lightRadiusMeters;
  }
  if (tok.lightSource === 'torch') return 6;
  if (tok.lightSource === 'lantern') return 9;
  return 0;
}

function rotateWallShape(shape: WallCellShape): WallCellShape {
  switch (shape) {
    case 'half-top':
      return 'half-right';
    case 'half-right':
      return 'half-bottom';
    case 'half-bottom':
      return 'half-left';
    case 'half-left':
      return 'half-top';
    case 'edge-top':
      return 'edge-right';
    case 'edge-right':
      return 'edge-bottom';
    case 'edge-bottom':
      return 'edge-left';
    case 'edge-left':
      return 'edge-top';
    case 'bar-h':
      return 'bar-v';
    case 'bar-v':
      return 'bar-h';
    case 'diag-tl':
      return 'diag-tr';
    case 'diag-tr':
      return 'diag-br';
    case 'diag-br':
      return 'diag-bl';
    case 'diag-bl':
      return 'diag-tl';
    default:
      return shape;
  }
}

function getWallSvgGeometry(
  shape: WallCellShape,
  x: number,
  y: number,
  s: number
):
  | { kind: 'rect'; rx: number; ry: number; rw: number; rh: number }
  | { kind: 'polygon'; points: string } {
  switch (shape) {
    case 'half-top':
      return { kind: 'rect', rx: x, ry: y, rw: s, rh: s * 0.5 };
    case 'half-bottom':
      return { kind: 'rect', rx: x, ry: y + s * 0.5, rw: s, rh: s * 0.5 };
    case 'half-left':
      return { kind: 'rect', rx: x, ry: y, rw: s * 0.5, rh: s };
    case 'half-right':
      return { kind: 'rect', rx: x + s * 0.5, ry: y, rw: s * 0.5, rh: s };
    case 'edge-top':
      return { kind: 'rect', rx: x, ry: y, rw: s, rh: s * 0.28 };
    case 'edge-bottom':
      return { kind: 'rect', rx: x, ry: y + s * 0.72, rw: s, rh: s * 0.28 };
    case 'edge-left':
      return { kind: 'rect', rx: x, ry: y, rw: s * 0.28, rh: s };
    case 'edge-right':
      return { kind: 'rect', rx: x + s * 0.72, ry: y, rw: s * 0.28, rh: s };
    case 'bar-h':
      return { kind: 'rect', rx: x, ry: y + s * 0.36, rw: s, rh: s * 0.28 };
    case 'bar-v':
      return { kind: 'rect', rx: x + s * 0.36, ry: y, rw: s * 0.28, rh: s };
    case 'diag-tl':
      return { kind: 'polygon', points: `${x},${y} ${x + s},${y} ${x},${y + s}` };
    case 'diag-tr':
      return { kind: 'polygon', points: `${x},${y} ${x + s},${y} ${x + s},${y + s}` };
    case 'diag-bl':
      return { kind: 'polygon', points: `${x},${y} ${x + s},${y + s} ${x},${y + s}` };
    case 'diag-br':
      return { kind: 'polygon', points: `${x + s},${y} ${x + s},${y + s} ${x},${y + s}` };
    case 'pillar': {
      const m = s * 0.2;
      const c = s * 0.12;
      const x1 = x + m;
      const x2 = x + s - m;
      const y1 = y + m;
      const y2 = y + s - m;
      return {
        kind: 'polygon',
        points: `${x1 + c},${y1} ${x2 - c},${y1} ${x2},${y1 + c} ${x2},${y2 - c} ${x2 - c},${y2} ${x1 + c},${y2} ${x1},${y2 - c} ${x1},${y1 + c}`,
      };
    }
    case 'full':
    default:
      return { kind: 'rect', rx: x, ry: y, rw: s, rh: s };
  }
}

function revealFogCellsAroundToken(
  map: TacticalMap,
  tok: MapToken,
  sqMeters: number,
  campaign?: CampaignState
): string[] {
  // Hidden tokens NEVER reveal shared Fog of War for players!
  if (tok.isHidden) return map.revealedCells;
  // Only Shared Light reveals shared Fog of War for the party (Personal Darkvision is private!)
  let radiusM = getTokenSharedLightRadiusMeters(tok, campaign);
  if (map.weatherEffectsEnabled && map.weather === 'rain') radiusM *= 0.5;
  if (map.weatherEffectsEnabled && map.weather === 'mist') radiusM = Math.min(radiusM, 6);
  if (!map.fogEnabled || radiusM <= 0) return map.revealedCells;
  const effTerrain = getEffectiveTerrainCells(map);
  const effWallMeta = getEffectiveWallMeta(map);
  const radiusSq = radiusM / Math.max(0.5, sqMeters);
  const cx = tok.x + (tok.size || 1) / 2;
  const cy = tok.y + (tok.size || 1) / 2;
  const nextSet = new Set(map.revealedCells);
  let changed = false;
  const minX = Math.max(0, Math.floor(cx - radiusSq - 1));
  const maxX = Math.min(map.gridWidth - 1, Math.ceil(cx + radiusSq + 1));
  const minY = Math.max(0, Math.floor(cy - radiusSq - 1));
  const maxY = Math.min(map.gridHeight - 1, Math.ceil(cy + radiusSq + 1));
  for (let gx = minX; gx <= maxX; gx++) {
    for (let gy = minY; gy <= maxY; gy++) {
      const dist = Math.hypot(gx + 0.5 - cx, gy + 0.5 - cy);
      if (dist <= radiusSq + 0.35) {
        if (!hasContinuousWallLineOfSight(effTerrain, effWallMeta, cx, cy, gx + 0.5, gy + 0.5)) continue;
        const key = `${gx},${gy}`;
        if (!nextSet.has(key)) {
          nextSet.add(key);
          changed = true;
        }
      }
    }
  }
  return changed ? Array.from(nextSet) : map.revealedCells;
}

function computeDarknessLitCells(
  map: TacticalMap,
  sqMeters: number,
  campaign: CampaignState,
  viewerRole: 'gm' | 'player',
  viewerCharacterId?: string
): Set<string> {
  const lit = new Set<string>();
  const effTerrain = getEffectiveTerrainCells(map);
  const effWallMeta = getEffectiveWallMeta(map);
  const rainMul = map.weatherEffectsEnabled && map.weather === 'rain' ? 0.5 : 1;
  const fogRevealedSet =
    viewerRole !== 'gm' && map.fogEnabled ? new Set(map.revealedCells || []) : null;

  for (const tok of map.tokens) {
    if (tok.isHidden) continue;
    const isOwnTok = Boolean(
      viewerCharacterId &&
        ((tok.type === 'character' && tok.referenceId === viewerCharacterId) ||
          tok.controlledByCharacterId === viewerCharacterId)
    );
    const linkedCh =
      tok.type === 'character' && tok.referenceId
        ? campaign.characters.find((c) => c.id === tok.referenceId)
        : undefined;
    const tokEffSize =
      getConditionVisualTransform(linkedCh?.activeConditionIds || tok.activeConditionIds, campaign)
        .size ??
      tok.size ??
      1;
    if (fogRevealedSet && !isOwnTok) {
      let inFog = false;
      const szInt = Math.max(1, Math.round(tokEffSize));
      for (let dx = 0; dx < szInt && !inFog; dx++) {
        for (let dy = 0; dy < szInt && !inFog; dy++) {
          if (fogRevealedSet.has(`${Math.floor(tok.x) + dx},${Math.floor(tok.y) + dy}`)) {
            inFog = true;
          }
        }
      }
      if (!inFog) continue;
    }
    const { sharedRadiusM, personalRadiusM, immediateSenseM } = resolveTokenLightForViewer(
      tok,
      campaign,
      viewerRole,
      viewerCharacterId
    );
    let radiusM = Math.max(sharedRadiusM * rainMul, personalRadiusM, immediateSenseM);
    if (map.weatherEffectsEnabled && map.weather === 'mist' && viewerRole !== 'gm') {
      radiusM = Math.min(radiusM, 6);
    }
    if (radiusM <= 0) continue;
    const radiusSq = radiusM / Math.max(0.5, sqMeters);
    const cx = tok.x + tokEffSize / 2;
    const cy = tok.y + tokEffSize / 2;
    const minX = Math.max(0, Math.floor(cx - radiusSq - 1));
    const maxX = Math.min(map.gridWidth - 1, Math.ceil(cx + radiusSq + 1));
    const minY = Math.max(0, Math.floor(cy - radiusSq - 1));
    const maxY = Math.min(map.gridHeight - 1, Math.ceil(cy + radiusSq + 1));
    for (let gx = minX; gx <= maxX; gx++) {
      for (let gy = minY; gy <= maxY; gy++) {
        const dist = Math.hypot(gx + 0.5 - cx, gy + 0.5 - cy);
        if (dist <= radiusSq + 0.45) {
          if (hasContinuousWallLineOfSight(effTerrain, effWallMeta, cx, cy, gx + 0.5, gy + 0.5)) {
            lit.add(`${gx},${gy}`);
          }
        }
      }
    }
  }

  // Static GM Map Light Points (campfires, wall torches, arcane crystals) illuminate Darkness ONLY when revealed through Fog!
  for (const mk of map.gmMarkers || []) {
    if (mk.kind !== 'light' || mk.lightEnabled === false) continue;
    if (fogRevealedSet && !fogRevealedSet.has(`${mk.x},${mk.y}`)) continue;
    let radiusM = (mk.lightRadiusMeters ?? 6) * rainMul;
    if (map.weatherEffectsEnabled && map.weather === 'mist' && viewerRole !== 'gm') {
      radiusM = Math.min(radiusM, 6);
    }
    if (radiusM <= 0) continue;
    const radiusSq = radiusM / Math.max(0.5, sqMeters);
    const cx = mk.x + 0.5;
    const cy = mk.y + 0.5;
    const minX = Math.max(0, Math.floor(cx - radiusSq - 1));
    const maxX = Math.min(map.gridWidth - 1, Math.ceil(cx + radiusSq + 1));
    const minY = Math.max(0, Math.floor(cy - radiusSq - 1));
    const maxY = Math.min(map.gridHeight - 1, Math.ceil(cy + radiusSq + 1));
    for (let gx = minX; gx <= maxX; gx++) {
      for (let gy = minY; gy <= maxY; gy++) {
        const dist = Math.hypot(gx + 0.5 - cx, gy + 0.5 - cy);
        if (dist <= radiusSq + 0.45) {
          if (hasContinuousWallLineOfSight(effTerrain, effWallMeta, cx, cy, gx + 0.5, gy + 0.5)) {
            lit.add(`${gx},${gy}`);
          }
        }
      }
    }
  }
  return lit;
}

function resolveConditionAuraKind(
  condIds: string[],
  campaign: CampaignState
): { kind: Exclude<import('../shared/types').ConditionAuraVfx, 'auto' | 'none'>; color: string } | null {
  for (const cid of condIds) {
    const cond = campaign.compendium.conditions.find((c) => c.id === cid);
    if (!cond) continue;
    if (cond.auraVfx === 'none') continue;
    if (cond.auraVfx && cond.auraVfx !== 'auto') {
      return { kind: cond.auraVfx, color: cond.color || '#f59e0b' };
    }
    const low = cond.name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    if (/demon|furia|sangr|infernal|berserk/.test(low)) return { kind: 'blood', color: '#e11d48' };
    if (/chama|queim|fogo|incendi/.test(low)) return { kind: 'fire', color: '#f97316' };
    if (/abencoad|sagrad|velocid|inspirad|escudo|protegid|heroism/.test(low)) {
      return { kind: 'holy', color: '#facc15' };
    }
    if (/venen|envenen|acid|toxi/.test(low)) return { kind: 'poison', color: '#84cc16' };
    if (/congel|gelo|paralis|petrif|imobil/.test(low)) return { kind: 'frost', color: '#38bdf8' };
    if (/atordoad|eletr|choq/.test(low)) return { kind: 'lightning', color: '#60a5fa' };
    if (/invisiv|amaldic|assust|cego|sombra|trevas|medo/.test(low)) {
      return { kind: 'shadow', color: '#a855f7' };
    }
    if (/arcano|magic|concentr/.test(low)) return { kind: 'arcane', color: '#c084fc' };
  }
  return null;
}

export const StageCanvas: React.FC = () => {
  const {
    campaign,
    role,
    myCharacter,
    viewedMapId,
    myPlayerColor,
    myPlayerName,
    activeCharacterId,
    setActiveCharacterId,
    targetTokenId,
    setTargetTokenId,
    updateCampaign,
    rollCharacterAction,
    sendPing,
    pings,
    tokenSpeeches,
    emitTokenSpeech,
    tempDrawings,
    emitTempDrawing,
    clearMapDrawings,
    activePointers,
    emitPointerMove,
    emitPointerHide,
    floatingVfx,
    slashVfx,
    projectileVfx,
    screenShakeActive,
    pendingAttackChoice,
    setPendingAttackChoice,
    startCombatDuel,
    castAoEAbility,
    executeTeleportAbility,
    applyDamage,
    triggerSlashVfx,
    pushCombatLog,
    deleteCharacter,
    assistDeathSave,
    gmResolveDeathSave,
    claimTreasureMarker,
    resolveAssetUrl,
    showTacticalAlert,
    opportunityPrompt,
    triggerOpportunityPrompt,
    enqueueOpportunityPrompts,
    performCombatManeuver,
    activeDuel,
    advantageMode,
    setCharacterNextAttackOverride,
    triggerTrapOnToken,
    triggerSecretPassage,
    moveTokensToMap,
    triggerAoESavePrompt,
    startCombatFromMap,
    screenShakeIntensity,
    cinematicEnabled,
    setCinematicEnabled,
    autoCameraFocus,
    setAutoCameraFocus,
    shockwaves,
    cameraFocusSignal,
    broadcastCameraFocus,
    moveTokensLive,
    setLocallyDraggedTokenIds,
    connectedPlayers,
    setTokenElevation,
    triggerFallDamageCheck,
    requestSkillCheck,
    dismissDomainExpansion,
    triggerUltimateCutIn,
    switchCharacterForm,
    enterRpSpotlight,
    clearRpSpotlight,
    rpSpotlight,
  } = useCampaign();

  const activeMap =
    campaign.maps.find((m) => m.id === viewedMapId) ||
    campaign.maps.find((m) => m.id === campaign.activeMapId) ||
    campaign.maps[0];

  const hasActiveOpportunityPrompt = Boolean(
    opportunityPrompt &&
      activeMap?.tokens.some((t) => t.id === opportunityPrompt.targetTokenId) &&
      activeMap?.tokens.some((t) => t.id === opportunityPrompt.reactorTokenId)
  );

  const [tool, setTool] = useState<StageTool>('select');
  const [gmDrawerTab, setGmDrawerTab] = useState<
    'aoe' | 'terrain' | 'secrets' | 'monsters-map' | null
  >(null);
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef<number>(zoom);
  zoomRef.current = zoom;
  const trackedCellPx = (activeMap?.gridSizePx || 48) * zoom;
  const prevCellPxRef = useRef<number>(trackedCellPx);
  const isZoomFrame = prevCellPxRef.current !== trackedCellPx;
  useEffect(() => {
    prevCellPxRef.current = trackedCellPx;
  }, [trackedCellPx]);
  const [bossBarCollapsed, setBossBarCollapsed] = useState(false);
  const [showPlayerRadar, setShowPlayerRadar] = useState(false);
  const playerRadarRef = useRef<HTMLDivElement | null>(null);
  const [showQuickCheck, setShowQuickCheck] = useState(false);
  const quickCheckRef = useRef<HTMLDivElement | null>(null);
  const [quickCheckSkillId, setQuickCheckSkillId] = useState(
    campaign.compendium.skills[0]?.id || 'percepcao'
  );
  const [quickCheckDc, setQuickCheckDc] = useState(14);
  const [quickCheckTargetMode, setQuickCheckTargetMode] = useState<'all' | 'map' | 'custom'>('map');
  const [quickCheckHeroIds, setQuickCheckHeroIds] = useState<string[]>([]);
  const [quickCheckHideDc, setQuickCheckHideDc] = useState(false);
  const [quickCheckIsGroup, setQuickCheckIsGroup] = useState(false);
  const pendingRadarFocusRef = useRef<{ mapId: string; tokenId: string } | null>(null);
  const [cameraPan, setCameraPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const cameraPanRef = useRef<{ x: number; y: number }>(cameraPan);
  cameraPanRef.current = cameraPan;
  const [isPanningWorld, setIsPanningWorld] = useState(false);
  const panDragRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const spacePressedRef = useRef(false);
  const [draggingTokenId, setDraggingTokenId] = useState<string | null>(null);
  const [dragOrigin, setDragOrigin] = useState<{
    tokenId: string;
    x: number;
    y: number;
    shiftFree: boolean;
    grabDx?: number;
    grabDy?: number;
  } | null>(null);
  const [dragPath, setDragPath] = useState<Array<{ x: number; y: number }>>([]);
  const [dropHighlightCell, setDropHighlightCell] = useState<{ x: number; y: number } | null>(null);
  const [hoveredTokenId, setHoveredTokenId] = useState<string | null>(null);
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [selectedTokenIds, setSelectedTokenIds] = useState<string[]>([]);

  useEffect(() => {
    if (!draggingTokenId) {
      setLocallyDraggedTokenIds([]);
      return;
    }
    const isGroup =
      role === 'gm' && selectedTokenIds.length > 1 && selectedTokenIds.includes(draggingTokenId);
    setLocallyDraggedTokenIds(isGroup ? selectedTokenIds : [draggingTokenId]);
    return () => {
      setLocallyDraggedTokenIds([]);
    };
  }, [draggingTokenId, role, selectedTokenIds, setLocallyDraggedTokenIds]);
  const [marqueeBox, setMarqueeBox] = useState<{
    startGx: number;
    startGy: number;
    endGx: number;
    endGy: number;
    mode: 'select' | 'terrain' | 'fog';
  } | null>(null);
  const [draggingTemplateId, setDraggingTemplateId] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [showAoESaveForm, setShowAoESaveForm] = useState(false);
  const [aoeTitle, setAoeTitle] = useState('Bola de Fogo');
  const [aoeDc, setAoeDc] = useState(14);
  const [aoeSaveSkill, setAoeSaveSkill] = useState('reflexos');
  const [aoeDamageFormula, setAoeDamageFormula] = useState('6d6');
  const [aoeDamageType, setAoeDamageType] = useState('Fogo');
  const [aoeHalfOnSuccess, setAoeHalfOnSuccess] = useState(true);
  const [rulerStart, setRulerStart] = useState<{ x: number; y: number } | null>(null);
  const [rulerEnd, setRulerEnd] = useState<{ x: number; y: number } | null>(null);
  const [activeDrawPoints, setActiveDrawPoints] = useState<Array<{ x: number; y: number }>>([]);
  const [gmDrawPermanent, setGmDrawPermanent] = useState(false);
  const [gmDrawColor, setGmDrawColor] = useState('#f59e0b');
  const activeDrawPointsRef = useRef<Array<{ x: number; y: number }>>([]);
  activeDrawPointsRef.current = activeDrawPoints;
  const [spawnMonsterId, setSpawnMonsterId] = useState(
    campaign.compendium.monsters[0]?.id || ''
  );
  const [spawnHidden, setSpawnHidden] = useState(false);
  const [spawnHideName, setSpawnHideName] = useState(false);
  const [secretMarkerKind, setSecretMarkerKind] = useState<GmMarkerKind | null>(null);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [wallBrushShape, setWallBrushShape] = useState<WallCellShape>('full');
  const [wallBrushOpacity, setWallBrushOpacity] = useState<number>(1);
  const [wallHoverCell, setWallHoverCell] = useState<{ x: number; y: number } | null>(null);
  const [aoeAimPos, setAoeAimPos] = useState<{ x: number; y: number; angleDeg: number }>({
    x: 5,
    y: 5,
    angleDeg: 0,
  });
  const [teleportHoverCell, setTeleportHoverCell] = useState<{ x: number; y: number } | null>(null);
  const [treasureDraftItemId, setTreasureDraftItemId] = useState(
    campaign.compendium.items[0]?.id || ''
  );
  const [pointerTrails, setPointerTrails] = useState<
    Array<{
      id: string;
      playerId: string;
      mapId: string;
      xPct: number;
      yPct: number;
      color: string;
      ts: number;
    }>
  >([]);

  // Keep dropdown selections synced when compendium items/monsters/skills change
  useEffect(() => {
    const skills = campaign.compendium.skills;
    const attrs = campaign.compendium.attributes;
    if (
      quickCheckSkillId &&
      !skills.some((s) => s.id === quickCheckSkillId) &&
      !attrs.some((a) => a.id === quickCheckSkillId)
    ) {
      setQuickCheckSkillId(skills[0]?.id || attrs[0]?.id || 'percepcao');
    }
  }, [campaign.compendium.attributes, campaign.compendium.skills, quickCheckSkillId]);

  useEffect(() => {
    const mons = campaign.compendium.monsters;
    if (mons.length > 0 && !mons.some((m) => m.id === spawnMonsterId)) {
      setSpawnMonsterId(mons[0].id);
    }
  }, [campaign.compendium.monsters, spawnMonsterId]);

  useEffect(() => {
    const items = campaign.compendium.items;
    if (items.length > 0 && !items.some((i) => i.id === treasureDraftItemId)) {
      setTreasureDraftItemId(items[0].id);
    }
  }, [campaign.compendium.items, treasureDraftItemId]);

  const removeTokensFromMapAndCombat = (
    prev: CampaignState,
    mapId: string,
    idSet: Set<string>
  ): CampaignState => {
    let nextTurnIdx = prev.combat.currentTurnIndex;
    const nextCombatants: typeof prev.combat.combatants = [];
    prev.combat.combatants.forEach((cb, idx) => {
      if (cb.tokenId && idSet.has(cb.tokenId)) {
        if (idx < nextTurnIdx) nextTurnIdx = Math.max(0, nextTurnIdx - 1);
      } else {
        nextCombatants.push(cb);
      }
    });
    nextTurnIdx = Math.min(nextTurnIdx, Math.max(0, nextCombatants.length - 1));
    return {
      ...prev,
      maps: prev.maps.map((m) =>
        m.id === mapId ? { ...m, tokens: m.tokens.filter((t) => !idSet.has(t.id)) } : m
      ),
      combat: {
        ...prev.combat,
        combatants: nextCombatants,
        currentTurnIndex: nextTurnIdx,
      },
    };
  };

  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      // Never intercept keyboard shortcuts while any modal or prompt dialog is open!
      if (document.querySelector('[data-modal-overlay="true"], [data-prompt-dialog="true"]')) {
        return;
      }
      if ((ev.key === 'r' || ev.key === 'R') && pendingAttackChoice?.aoeShape) {
        const activeTag = (document.activeElement?.tagName || '').toLowerCase();
        if (activeTag !== 'input' && activeTag !== 'textarea' && activeTag !== 'select') {
          ev.preventDefault();
          setAoeAimPos((p) => ({ ...p, angleDeg: (p.angleDeg + 45) % 360 }));
          return;
        }
      }
      if ((ev.key === 'r' || ev.key === 'R') && role === 'gm' && tool === 'terrain-wall') {
        const activeTag = (document.activeElement?.tagName || '').toLowerCase();
        if (activeTag !== 'input' && activeTag !== 'textarea' && activeTag !== 'select') {
          ev.preventDefault();
          setWallBrushShape((prev) => rotateWallShape(prev));
          return;
        }
      }
      if ((ev.key === 'i' || ev.key === 'I') && (hoveredTokenId || selectedTokenId)) {
        const activeTag = (document.activeElement?.tagName || '').toLowerCase();
        if (activeTag !== 'input' && activeTag !== 'textarea' && activeTag !== 'select') {
          ev.preventDefault();
          openInspectEntity((hoveredTokenId || selectedTokenId)!);
          return;
        }
      }
      if (ev.key === 'Escape') {
        if (pendingAttackChoice) setPendingAttackChoice(null);
        if (secretMarkerKind) setSecretMarkerKind(null);
        setSelectedTokenId(null);
        setSelectedTokenIds([]);
        setSelectedMarkerId(null);
        return;
      }

      if (ev.key === 'Delete' || ev.key === 'Backspace') {
        const tag = (ev.target as HTMLElement | null)?.tagName;
        const isEditable =
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          Boolean((ev.target as HTMLElement | null)?.isContentEditable);
        if (isEditable || role !== 'gm' || !activeMap) return;

        const idsToDelete =
          selectedTokenIds.length > 0
            ? selectedTokenIds
            : selectedTokenId
              ? [selectedTokenId]
              : [];
        if (idsToDelete.length === 0) return;

        ev.preventDefault();
        const idSet = new Set(idsToDelete);
        updateCampaign((prev) => removeTokensFromMapAndCombat(prev, activeMap.id, idSet));
        setSelectedTokenId(null);
        setSelectedTokenIds([]);
        if (targetTokenId && idSet.has(targetTokenId)) {
          setTargetTokenId(null);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    pendingAttackChoice,
    setPendingAttackChoice,
    secretMarkerKind,
    role,
    tool,
    activeMap,
    hoveredTokenId,
    selectedTokenIds,
    selectedTokenId,
    updateCampaign,
    targetTokenId,
    setTargetTokenId,
  ]);

  useEffect(() => {
    const now = Date.now();
    const activeList = Object.values(activePointers).filter((p) => p.active);
    if (activeList.length === 0) return;
    setPointerTrails((prev) => {
      const next = prev.filter((pt) => now - pt.ts < 480);
      for (const ptr of activeList) {
        const lastForPlayer = [...next].reverse().find((pt) => pt.playerId === ptr.playerId);
        if (
          !lastForPlayer ||
          Math.hypot(lastForPlayer.xPct - ptr.xPct, lastForPlayer.yPct - ptr.yPct) > 0.3
        ) {
          next.push({
            id: `${ptr.playerId}-${now}-${Math.random().toString(36).slice(2, 5)}`,
            playerId: ptr.playerId,
            mapId: ptr.mapId,
            xPct: ptr.xPct,
            yPct: ptr.yPct,
            color: ptr.color,
            ts: now,
          });
        }
      }
      return next.slice(-64);
    });
  }, [activePointers]);

  useEffect(() => {
    if (pointerTrails.length === 0) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setPointerTrails((prev) => prev.filter((pt) => now - pt.ts < 480));
    }, 90);
    return () => window.clearInterval(timer);
  }, [pointerTrails.length]);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const lastPointerEmitRef = useRef<number>(0);
  const didDragTokenRef = useRef<boolean>(false);

  // Non-passive native wheel listener so e.preventDefault() never triggers passive-event console errors
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onNativeWheel = (e: WheelEvent) => {
      const targetEl = e.target as HTMLElement | null;
      if (targetEl?.closest('.overflow-y-auto')) return;
      e.preventDefault();
      const oldZoom = zoomRef.current;
      const step = oldZoom <= 0.35 ? 0.04 : 0.1;
      const delta = e.deltaY < 0 ? step : -step;
      const nextZoom = Math.max(0.1, Math.min(2.5, Math.round((oldZoom + delta) * 100) / 100));
      if (nextZoom === oldZoom) return;
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - (rect.left + rect.width / 2);
      const my = e.clientY - (rect.top + rect.height / 2);
      const scale = nextZoom / oldZoom;
      const oldPan = cameraPanRef.current;
      const nextPan = {
        x: Math.round(mx - (mx - oldPan.x) * scale),
        y: Math.round(my - (my - oldPan.y) * scale),
      };
      zoomRef.current = nextZoom;
      cameraPanRef.current = nextPan;
      setZoom(nextZoom);
      setCameraPan(nextPan);
    };
    el.addEventListener('wheel', onNativeWheel, { passive: false });
    return () => el.removeEventListener('wheel', onNativeWheel);
  }, []);

  // Ensure marquee selection box never gets stuck if mouse is released outside the viewport
  useEffect(() => {
    if (!marqueeBox) return;
    const onWindowUp = () => setMarqueeBox(null);
    window.addEventListener('mouseup', onWindowUp);
    return () => window.removeEventListener('mouseup', onWindowUp);
  }, [marqueeBox]);

  const sqMeters = campaign.settings.gridSquareMeters || 1.5;

  const revealedFogSet = useMemo(() => {
    if (!activeMap?.fogEnabled || role === 'gm') return null;
    return new Set(activeMap.revealedCells || []);
  }, [activeMap?.fogEnabled, activeMap?.revealedCells, role]);

  const revealFogAfterDoorOpen = (mapObj: TacticalMap): string[] => {
    if (!mapObj.fogEnabled) return mapObj.revealedCells;
    let nextMap = mapObj;
    for (const t of mapObj.tokens) {
      if (t.isHidden) continue;
      const { sharedRadiusM } = resolveTokenLightForViewer(t, campaign, 'gm');
      if (t.type === 'character' || sharedRadiusM > 0) {
        const updatedCells = revealFogCellsAroundToken(nextMap, t, sqMeters, campaign);
        nextMap = { ...nextMap, revealedCells: updatedCells };
      }
    }
    return nextMap.revealedCells;
  };

  const darknessLitCells = useMemo(() => {
    if (!activeMap?.darknessEnabled) return null;
    return computeDarknessLitCells(activeMap, sqMeters, campaign, role, myCharacter?.id);
  }, [activeMap, sqMeters, campaign, role, myCharacter?.id]);

  const effectiveTerrainForDarkness = useMemo(
    () => getEffectiveTerrainCells(activeMap),
    [activeMap]
  );

  const effectiveWallMetaForDarkness = useMemo(
    () => getEffectiveWallMeta(activeMap),
    [activeMap]
  );

  const dynamicLightCircles = useMemo<DynamicLightCircle[]>(() => {
    if (!activeMap?.darknessEnabled) return [];
    const circles: DynamicLightCircle[] = [];
    const rainMul = activeMap.weatherEffectsEnabled && activeMap.weather === 'rain' ? 0.5 : 1;

    for (const tok of activeMap.tokens) {
      if (tok.isHidden) continue;
      const isOwnTok = Boolean(
        myCharacter &&
          ((tok.type === 'character' && tok.referenceId === myCharacter.id) ||
            tok.controlledByCharacterId === myCharacter.id)
      );
      const linkedCh =
        tok.type === 'character' && tok.referenceId
          ? campaign.characters.find((c) => c.id === tok.referenceId)
          : undefined;
      const sz =
        getConditionVisualTransform(
          linkedCh?.activeConditionIds || tok.activeConditionIds,
          campaign
        ).size ??
        tok.size ??
        1;
      if (revealedFogSet && !isOwnTok) {
        let inFog = false;
        const szInt = Math.max(1, Math.round(sz));
        for (let dx = 0; dx < szInt && !inFog; dx++) {
          for (let dy = 0; dy < szInt && !inFog; dy++) {
            if (revealedFogSet.has(`${Math.floor(tok.x) + dx},${Math.floor(tok.y) + dy}`)) {
              inFog = true;
            }
          }
        }
        if (!inFog) continue;
      }
      const { sharedRadiusM, personalRadiusM, immediateSenseM } = resolveTokenLightForViewer(
        tok,
        campaign,
        role,
        myCharacter?.id
      );
      const effSharedM = sharedRadiusM * rainMul;
      let radiusM = Math.max(effSharedM, personalRadiusM, immediateSenseM);
      if (activeMap.weatherEffectsEnabled && activeMap.weather === 'mist' && role !== 'gm') {
        radiusM = Math.min(radiusM, 6);
      }
      if (radiusM <= 0) continue;
      const isImmediateOnly = effSharedM <= 0 && personalRadiusM <= 0 && immediateSenseM > 0;
      circles.push({
        cx: tok.x + sz / 2,
        cy: tok.y + sz / 2,
        // Slightly generous smooth radius so feathered edge fades cleanly beyond immediate cell
        radiusSq: radiusM / Math.max(0.5, sqMeters) + (isImmediateOnly ? 0.55 : 0.35),
        softEdge: isImmediateOnly,
      });
    }

    for (const mk of activeMap.gmMarkers || []) {
      if (mk.kind !== 'light' || mk.lightEnabled === false) continue;
      if (revealedFogSet && !revealedFogSet.has(`${mk.x},${mk.y}`)) continue;
      let radiusM = (mk.lightRadiusMeters ?? 6) * rainMul;
      if (activeMap.weatherEffectsEnabled && activeMap.weather === 'mist' && role !== 'gm') {
        radiusM = Math.min(radiusM, 6);
      }
      if (radiusM <= 0) continue;
      circles.push({
        cx: mk.x + 0.5,
        cy: mk.y + 0.5,
        radiusSq: radiusM / Math.max(0.5, sqMeters) + 0.35,
        color: mk.lightColor || '#f59e0b',
        softEdge: false,
      });
    }

    return circles;
  }, [activeMap, campaign, myCharacter, revealedFogSet, role, sqMeters]);

  const findTokenCombatant = (tok: MapToken) => {
    if (!campaign.combat.active) return undefined;
    return campaign.combat.combatants.find(
      (cb) =>
        cb.tokenId === tok.id ||
        (tok.type === 'character' && tok.referenceId && cb.referenceId === tok.referenceId)
    );
  };

  const buildMeleeOpportunityAttacks = (reactor: MapToken): PendingAttackChoice[] => {
    if (reactor.type === 'monster' && reactor.referenceId) {
      const mon = campaign.compendium.monsters.find((m) => m.id === reactor.referenceId);
      if (mon) {
        const melee = mon.attacks
          .filter((atk) => !atk.range || parseAttackRangeMeters(atk.range, atk.name) <= 3.1)
          .map((atk) => ({
            attackerTokenId: reactor.id,
            attackerName: reactor.name,
            attackerColor: reactor.color,
            attackerImageUrl: reactor.imageUrl,
            attackerFrame: reactor.frameStyle || 'crimson',
            diceSkin: 'blood' as const,
            actionTitle: `${atk.name} (Oportunidade)`,
            attackFormula: `1d20 + ${atk.attackBonus}`,
            damageFormula: atk.damageFormula,
            damageType: atk.damageType,
            range: atk.range || 'Corpo a Corpo (1,5m)',
            actionCost: 'Reação' as const,
            applyConditionId: atk.applyConditionId,
            conditionDurationRounds: atk.conditionDurationRounds,
          }));
        if (melee.length > 0) return melee;
        return [
          {
            attackerTokenId: reactor.id,
            attackerName: reactor.name,
            attackerColor: reactor.color,
            attackerImageUrl: reactor.imageUrl,
            attackerFrame: reactor.frameStyle || 'crimson',
            diceSkin: 'blood',
            actionTitle: 'Golpe de Oportunidade',
            attackFormula: '1d20 + 3',
            damageFormula: '1d6 + 1',
            damageType: 'Concussão',
            range: 'Corpo a Corpo (1,5m)',
            actionCost: 'Reação',
          },
        ];
      }
    }
    if (reactor.type === 'npc') {
      const npc = reactor.referenceId
        ? campaign.npcs.find((n) => n.id === reactor.referenceId)
        : undefined;
      const npcMelee = (npc?.attacks || [])
        .filter((atk) => !atk.range || parseAttackRangeMeters(atk.range, atk.name) <= 3.1)
        .map((atk) => ({
          attackerTokenId: reactor.id,
          attackerName: reactor.name,
          attackerColor: reactor.color,
          attackerImageUrl: reactor.imageUrl || npc?.imageUrl,
          attackerFrame: reactor.frameStyle || 'crimson',
          diceSkin: 'blood' as const,
          actionTitle: `${atk.name} (Oportunidade)`,
          attackFormula: `1d20 + ${atk.attackBonus}`,
          damageFormula: atk.damageFormula,
          damageType: atk.damageType,
          range: atk.range || 'Corpo a Corpo (1,5m)',
          actionCost: 'Reação' as const,
        }));
      if (npcMelee.length > 0) return npcMelee;
      const strMod = Math.floor(((npc?.attributes?.for ?? npc?.attributes?.FOR ?? 12) - 10) / 2);
      return [
        {
          attackerTokenId: reactor.id,
          attackerName: reactor.name,
          attackerColor: reactor.color,
          attackerImageUrl: reactor.imageUrl || npc?.imageUrl,
          attackerFrame: reactor.frameStyle || 'crimson',
          diceSkin: 'blood',
          actionTitle: 'Golpe de Oportunidade',
          attackFormula: `1d20 + ${strMod + 2}`,
          damageFormula: `1d6 ${strMod >= 0 ? `+ ${strMod}` : `- ${Math.abs(strMod)}`}`,
          damageType: 'Concussão',
          range: 'Corpo a Corpo (1,5m)',
          actionCost: 'Reação',
        },
      ];
    }
    if (reactor.type === 'character' && reactor.referenceId) {
      const ch = campaign.characters.find((c) => c.id === reactor.referenceId);
      if (ch) {
        const meleeCustom = (ch.customAttacks || [])
          .filter((a) => parseAttackRangeMeters(a.range, a.name) <= 3.1)
          .map((a) => ({
            attackerTokenId: reactor.id,
            attackerName: ch.name,
            attackerColor: ch.playerColor || ch.tokenColor,
            attackerImageUrl: ch.portraitUrl,
            attackerFrame: ch.tokenFrameStyle || 'gold',
            attackerCharacterId: ch.id,
            diceSkin: ch.diceSkin || 'gold',
            actionTitle: `${a.name} (Oportunidade)`,
            attackFormula: a.attackBonusFormula,
            damageFormula: a.damageFormula,
            damageType: a.damageType,
            range: a.range,
            actionCost: 'Reação' as const,
          }));
        const meleeWeapons = ch.inventory
          .filter((inv) => inv.equipped)
          .map((inv) => campaign.compendium.items.find((i) => i.id === inv.itemId))
          .filter(
            (it): it is NonNullable<typeof it> =>
              Boolean(it?.attackFormula && parseAttackRangeMeters(it.range, it.name) <= 3.1)
          )
          .map((it) => ({
            attackerTokenId: reactor.id,
            attackerName: ch.name,
            attackerColor: ch.playerColor || ch.tokenColor,
            attackerImageUrl: ch.portraitUrl,
            attackerFrame: ch.tokenFrameStyle || 'gold',
            attackerCharacterId: ch.id,
            diceSkin: ch.diceSkin || 'gold',
            actionTitle: `${it.name} (Oportunidade)`,
            attackFormula: it.attackFormula,
            damageFormula: it.damageFormula,
            damageType: it.damageType,
            range: it.range || 'Corpo a Corpo (1,5m)',
            actionCost: 'Reação' as const,
            critRange: it.critRange,
            critMultiplier: it.critMultiplier,
          }));
        if (meleeCustom.length > 0 || meleeWeapons.length > 0) {
          return [...meleeCustom, ...meleeWeapons];
        }
        return [
          {
            attackerTokenId: reactor.id,
            attackerName: ch.name,
            attackerColor: ch.playerColor || ch.tokenColor,
            attackerImageUrl: ch.portraitUrl,
            attackerFrame: ch.tokenFrameStyle || 'gold',
            attackerCharacterId: ch.id,
            diceSkin: ch.diceSkin || 'gold',
            actionTitle: 'Golpe de Oportunidade',
            attackFormula: '1d20 + @for + @prof',
            damageFormula: '1d4 + @for',
            damageType: 'Concussão',
            range: 'Corpo a Corpo (1,5m)',
            actionCost: 'Reação',
          },
        ];
      }
    }
    return [];
  };

  const finalizeTokenDrag = () => {
    const origin = dragOrigin;
    const pathSnapshot = dragPath;
    const prevDraggingId = draggingTokenId;
    const wasGroupDrag =
      Boolean(prevDraggingId) &&
      role === 'gm' &&
      selectedTokenIds.length > 1 &&
      selectedTokenIds.includes(prevDraggingId!);
    didDragTokenRef.current = false;
    setDraggingTokenId(null);
    setDragOrigin(null);
    setDragPath([]);
    setLocallyDraggedTokenIds([]);
    if (!origin || !activeMap) return;

    const currentTok = activeMap.tokens.find((t) => t.id === origin.tokenId);
    if (!currentTok) return;

    // Guarantee final position never collides with another token or solid wall cell (respects open doors, thin edge walls & GM Shift-free drag)
    let finalTok = currentTok;
    const enforceWallOnDrop = !(role === 'gm' && origin.shiftFree);
    if (
      !wasGroupDrag &&
      doesTokenCollideAt(
        activeMap.tokens,
        currentTok.x,
        currentTok.y,
        currentTok.size,
        currentTok.id,
        role === 'gm',
        enforceWallOnDrop ? effectiveTerrainForDarkness : undefined,
        enforceWallOnDrop ? effectiveWallMetaForDarkness : undefined
      )
    ) {
      const snapped = findNearestFreeGridCell(
        enforceWallOnDrop ? activeMap : { ...activeMap, terrainCells: undefined, wallMeta: undefined, gmMarkers: undefined },
        currentTok.x,
        currentTok.y,
        currentTok.size,
        currentTok.id,
        role === 'gm'
      );
      finalTok = { ...currentTok, x: snapped.x, y: snapped.y };
      moveTokensLive(activeMap.id, [{ id: finalTok.id, x: snapped.x, y: snapped.y }], true);
    } else if (wasGroupDrag) {
      const groupMoves = activeMap.tokens
        .filter((t) => selectedTokenIds.includes(t.id))
        .map((t) => ({ id: t.id, x: t.x, y: t.y }));
      if (groupMoves.length > 0) {
        moveTokensLive(activeMap.id, groupMoves, true);
      }
    } else if (finalTok.x !== origin.x || finalTok.y !== origin.y) {
      // Flush exact final coordinate immediately to server + peers (persisted via debounced disk write)
      moveTokensLive(activeMap.id, [{ id: finalTok.id, x: finalTok.x, y: finalTok.y }], true);
    }

    // Build DENSE cell-by-cell walked path BEFORE checking Traps, Passages, Elemental Surfaces, Difficult Terrain & OAs
    // so fast mouse drags NEVER skip hazards or threat squares!
    const movedAny = finalTok.x !== origin.x || finalTok.y !== origin.y;
    const walkedSteps: Array<{ x: number; y: number }> = movedAny
      ? pathSnapshot && pathSnapshot.length > 1
        ? pathSnapshot
        : traceGridLine(origin.x, origin.y, finalTok.x, finalTok.y)
      : [{ x: finalTok.x, y: finalTok.y }];

    const denseWalkedSteps: Array<{ x: number; y: number }> = [walkedSteps[0]];
    for (let i = 1; i < walkedSteps.length; i++) {
      const seg = traceGridLine(
        walkedSteps[i - 1].x,
        walkedSteps[i - 1].y,
        walkedSteps[i].x,
        walkedSteps[i].y
      );
      for (let j = 1; j < seg.length; j++) {
        const last = denseWalkedSteps[denseWalkedSteps.length - 1];
        if (!last || last.x !== seg[j].x || last.y !== seg[j].y) {
          denseWalkedSteps.push(seg[j]);
        }
      }
    }
    const lastDense = denseWalkedSteps[denseWalkedSteps.length - 1];
    if (lastDense && (lastDense.x !== finalTok.x || lastDense.y !== finalTok.y)) {
      const tail = traceGridLine(lastDense.x, lastDense.y, finalTok.x, finalTok.y);
      for (let j = 1; j < tail.length; j++) {
        denseWalkedSteps.push(tail[j]);
      }
    }

    // Dynamic Light Fog Reveal when non-hidden token(s) move!
    if (movedAny && activeMap.fogEnabled) {
      const movedList = wasGroupDrag
        ? activeMap.tokens.filter((t) => selectedTokenIds.includes(t.id) && !t.isHidden)
        : !finalTok.isHidden
          ? [finalTok]
          : [];
      const lightCarriers = movedList.filter(
        (t) => getTokenSharedLightRadiusMeters(t, campaign) > 0
      );
      if (lightCarriers.length > 0) {
        updateActiveMap((m) => {
          let nextRevealed = m.revealedCells;
          for (const lt of lightCarriers) {
            nextRevealed = revealFogCellsAroundToken(
              { ...m, revealedCells: nextRevealed },
              lt,
              sqMeters,
              campaign
            );
          }
          return { ...m, revealedCells: nextRevealed };
        });
      }
    }

    if (movedAny && !origin.shiftFree) {
      const isFlyingAboveGround = (finalTok.elevationMeters || 0) > 0;

      // 1. ALL Floor Traps along dense walked path (creatures flying above ground do NOT step on floor traps!)
      if (!isFlyingAboveGround) {
        const steppedTraps = (activeMap.gmMarkers || []).filter(
          (gm) =>
            gm.kind === 'trap' &&
            !gm.trapTriggered &&
            denseWalkedSteps.some(
              (step, idx) =>
                idx > 0 && doSquaresOverlap(step.x, step.y, finalTok.size || 1, gm.x, gm.y, 1)
            )
        );
        steppedTraps.forEach((tr) => triggerTrapOnToken(tr.id, finalTok));
      }

      // 2. Secret Passages along dense walked path (flying tokens fly over floor passages!)
      if (!isFlyingAboveGround) {
        const steppedPassage = (activeMap.gmMarkers || []).find(
          (gm) =>
            gm.kind === 'secret' &&
            denseWalkedSteps.some(
              (step, idx) =>
                idx > 0 && doSquaresOverlap(step.x, step.y, finalTok.size || 1, gm.x, gm.y, 1)
            )
        );
        if (steppedPassage) {
          triggerSecretPassage(steppedPassage.id, finalTok);
        }
      }

      // 3. Floor Elemental Surfaces along dense walked path (flying tokens fly OVER floor fire/acid/ice/water!)
      if (!isFlyingAboveGround && finalTok.hp > 0 && activeMap.elementalSurfaces) {
        const tokSz = Math.max(1, finalTok.size || 1);
        let encounteredSurface: ElementalSurfaceKind | undefined;
        // Prefer hazard priority along walked path (fire/acid > ice > water)
        if ((finalTok.elevationMeters || 0) <= 0) {
          for (let i = 1; i < denseWalkedSteps.length; i++) {
            const step = denseWalkedSteps[i];
            for (let dx = 0; dx < tokSz; dx++) {
              for (let dy = 0; dy < tokSz; dy++) {
                const sKind = activeMap.elementalSurfaces[`${step.x + dx},${step.y + dy}`];
                if (!sKind) continue;
                if (
                  !encounteredSurface ||
                  ((sKind === 'fire' || sKind === 'acid') &&
                    encounteredSurface !== 'fire' &&
                    encounteredSurface !== 'acid') ||
                  (sKind === 'ice' && encounteredSurface === 'water')
                ) {
                  encounteredSurface = sKind;
                }
              }
            }
          }
        }

        if (encounteredSurface) {
          const entityKind =
            finalTok.type === 'character' ? 'hero' : finalTok.type === 'npc' ? 'npc' : 'monster';
          const surfCfg = activeMap.surfaceConfig;
          if (encounteredSurface === 'fire' || encounteredSurface === 'acid') {
            const formula =
              encounteredSurface === 'fire'
                ? surfCfg?.fireDamageFormula || '1d6'
                : surfCfg?.acidDamageFormula || '1d4';
            const dmg = Math.max(1, evaluateFormula(formula).total);
            const dmgType = encounteredSurface === 'fire' ? 'Fogo' : 'Ácido';
            const acidCondId =
              encounteredSurface === 'acid'
                ? campaign.compendium.conditions.find(
                    (c) => /corro/i.test(c.name) || c.id === 'cond-corroido'
                  )?.id || 'cond-corroido'
                : undefined;
            if (
              acidCondId === 'cond-corroido' &&
              !campaign.compendium.conditions.some((c) => c.id === 'cond-corroido')
            ) {
              updateCampaign((prev) => ({
                ...prev,
                compendium: {
                  ...prev.compendium,
                  conditions: ensureSurfaceCondition(prev.compendium.conditions, 'cond-corroido'),
                },
              }));
            }
            window.setTimeout(() => {
              applyDamage(
                finalTok.id,
                dmg,
                false,
                undefined,
                dmgType,
                acidCondId,
                acidCondId ? 2 : undefined
              );
              triggerSlashVfx(finalTok.id, 'hit');
            }, 60);
            window.setTimeout(() => {
              pushCombatLog({
                category: 'damage',
                actorName: finalTok.name,
                actorKind: entityKind,
                actorColor: finalTok.color,
                summary: `atravessou superfície de ${dmgType} (${formula}) e sofreu -${dmg} de dano${acidCondId ? ' + Corroído (-2 CA)' : ''}!`,
              });
            }, 340);
          } else if (encounteredSurface === 'ice') {
            const iceDc = surfCfg?.iceSaveDc ?? 12;
            let saveBonus = 0;
            if (finalTok.type === 'character' && finalTok.referenceId) {
              const ch = campaign.characters.find((c) => c.id === finalTok.referenceId);
              if (ch) {
                const st = computeCharacterStats(ch, campaign);
                saveBonus =
                  st.skills['reflexos']?.total ??
                  st.skills['acrobacia']?.total ??
                  st.attributes['des']?.mod ??
                  0;
              }
            } else if (finalTok.type === 'monster' && finalTok.referenceId) {
              const mon = campaign.compendium.monsters.find((m) => m.id === finalTok.referenceId);
              if (mon) {
                saveBonus =
                  mon.saves?.ref ?? Math.floor(((mon.attributes?.['des'] ?? 10) - 10) / 2);
              }
            } else if (finalTok.type === 'npc' && finalTok.referenceId) {
              const npc = campaign.npcs.find((n) => n.id === finalTok.referenceId);
              if (npc) {
                saveBonus =
                  npc.saves?.ref ?? Math.floor(((npc.attributes?.['des'] ?? 10) - 10) / 2);
              }
            }
            const d20 = Math.floor(Math.random() * 20) + 1;
            const total = d20 + saveBonus;
            const passed = d20 === 20 || (d20 !== 1 && total >= iceDc);
            if (!passed) {
              updateCampaign((prev) => ({
                ...prev,
                characters: prev.characters.map((c) =>
                  finalTok.type === 'character' &&
                  finalTok.referenceId === c.id &&
                  !c.activeConditionIds.includes('cond-caido')
                    ? { ...c, activeConditionIds: [...c.activeConditionIds, 'cond-caido'] }
                    : c
                ),
                maps: prev.maps.map((m) =>
                  m.id !== activeMap.id
                    ? m
                    : {
                        ...m,
                        tokens: m.tokens.map((t) =>
                          t.id === finalTok.id && !(t.activeConditionIds || []).includes('cond-caido')
                            ? { ...t, activeConditionIds: [...(t.activeConditionIds || []), 'cond-caido'] }
                            : t
                        ),
                      }
                ),
                combat: prev.combat.active
                  ? {
                      ...prev.combat,
                      combatants: prev.combat.combatants.map((cb) =>
                        cb.tokenId === finalTok.id ||
                        (finalTok.type === 'character' &&
                          finalTok.referenceId &&
                          cb.referenceId === finalTok.referenceId)
                          ? { ...cb, remainingMoveMeters: 0 }
                          : cb
                      ),
                    }
                  : prev.combat,
              }));
            }
            const bTxt = saveBonus >= 0 ? `+${saveBonus}` : `${saveBonus}`;
            pushCombatLog({
              category: 'condition',
              actorName: finalTok.name,
              actorKind: entityKind,
              actorColor: finalTok.color,
              summary: passed
                ? `manteve o equilíbrio no Gelo (Reflexos ${d20}${bTxt}=${total} vs CD ${iceDc})`
                : `escorregou no Gelo (Reflexos ${d20}${bTxt}=${total} vs CD ${iceDc}) e ficou Caído!`,
            });
          } else if (encounteredSurface === 'water') {
            const wetCondId =
              campaign.compendium.conditions.find(
                (c) => /molhad/i.test(c.name) || c.id === 'cond-molhado'
              )?.id || 'cond-molhado';
            const isBurningCond = (cid: string, conds: CampaignState['compendium']['conditions']) => {
              if (/queim|fogo|chama|incendi/i.test(cid)) return true;
              const def = conds.find((cd) => cd.id === cid);
              return Boolean(def && /queim|fogo|chama|incendi/i.test(def.name));
            };
            updateCampaign((prev) => ({
              ...prev,
              compendium: {
                ...prev.compendium,
                conditions: ensureSurfaceCondition(prev.compendium.conditions, 'cond-molhado'),
              },
              characters: prev.characters.map((c) =>
                finalTok.type === 'character' && finalTok.referenceId === c.id
                  ? {
                      ...c,
                      activeConditionIds: Array.from(
                        new Set([
                          ...c.activeConditionIds.filter(
                            (cid) => !isBurningCond(cid, prev.compendium.conditions)
                          ),
                          wetCondId,
                        ])
                      ),
                    }
                  : c
              ),
              maps: prev.maps.map((m) =>
                m.id !== activeMap.id
                  ? m
                  : {
                      ...m,
                      tokens: m.tokens.map((t) =>
                        t.id === finalTok.id
                          ? {
                              ...t,
                              activeConditionIds: Array.from(
                                new Set([
                                  ...(t.activeConditionIds || []).filter(
                                    (cid) => !isBurningCond(cid, prev.compendium.conditions)
                                  ),
                                  wetCondId,
                                ])
                              ),
                            }
                          : t
                      ),
                    }
              ),
            }));
            pushCombatLog({
              category: 'condition',
              actorName: finalTok.name,
              actorKind: entityKind,
              actorColor: finalTok.color,
              summary: 'entrou em Água (Molhado — vulnerável a Elétrico/Gelo; apaga chamas)',
            });
          }
        }
      }
    }

    if (!campaign.combat.active || origin.shiftFree) return;

    // Exact Chebyshev displacement for the SAME token (fixes 2x2+ large tokens getting 0 distance when moving 1 cell!)
    const squares = Math.max(Math.abs(finalTok.x - origin.x), Math.abs(finalTok.y - origin.y));
    if (squares <= 0) return;

    const cb = findTokenCombatant(finalTok);

    // Deduct combat movement budget (GM dragging Heroes freely does not burn hero movement, but still checks Opportunity Attacks unless Shift-free!)
    if (cb && !(role === 'gm' && finalTok.type === 'character')) {
      const isFlyingToken = (finalTok.elevationMeters || 0) > 0;
      const { meters: movementCostMeters } = calculateMovementCostMeters(
        origin,
        finalTok,
        isFlyingToken ? undefined : activeMap.terrainCells,
        sqMeters,
        denseWalkedSteps,
        finalTok.size || 1
      );
      const meters = Math.max(squares * sqMeters, movementCostMeters);
      const nextRemaining = Math.max(
        0,
        Math.round(((cb.remainingMoveMeters ?? cb.speedMeters ?? 9) - meters) * 10) / 10
      );

      updateCampaign((prev) => ({
        ...prev,
        combat: {
          ...prev.combat,
          combatants: prev.combat.combatants.map((item) => {
            if (item.id !== cb.id) return item;
            const curRem = item.remainingMoveMeters ?? nextRemaining;
            return {
              ...item,
              remainingMoveMeters: Math.min(curRem, nextRemaining),
            };
          }),
        },
      }));
    }

    // Check D&D Opportunity Attacks: left 1-square (orthogonal OR diagonal) reach of ALL active, conscious, visible hostile enemies
    // with clear Line of Sight (not behind a wall/closed door) and Reaction available — including walking PAST them mid-drag!
    const movingChar =
      finalTok.type === 'character' && finalTok.referenceId
        ? campaign.characters.find((c) => c.id === finalTok.referenceId)
        : undefined;
    const movingCondIds = new Set<string>([
      ...(finalTok.activeConditionIds || []),
      ...(movingChar?.activeConditionIds || []),
    ]);
    const hasNaturalDisengageCondition = Array.from(movingCondIds).some((cid) => {
      const def = campaign.compendium.conditions.find((c) => c.id === cid);
      if (def?.preventsOpportunityAttacks !== undefined) {
        return Boolean(def.preventsOpportunityAttacks);
      }
      return cid === 'cond-invisivel' || /velocidade|haste/i.test(def?.name || cid);
    });

    if (!cb?.disengaged && !hasNaturalDisengageCondition) {
      const queuedPrompts: Array<{
        id: string;
        reactorTokenId: string;
        reactorName: string;
        reactorColor: string;
        reactorType: 'character' | 'monster';
        reactorReferenceId?: string;
        targetTokenId: string;
        targetName: string;
        attacks: PendingAttackChoice[];
      }> = [];
      for (const other of activeMap.tokens) {
        if (other.id === finalTok.id || other.hp <= 0 || other.isHidden) continue;
        if (!isTokenHostileTo(finalTok, other, campaign.npcs)) continue;

        const otherChar =
          other.type === 'character' && other.referenceId
            ? campaign.characters.find((c) => c.id === other.referenceId)
            : undefined;
        if (isTokenIncapacitated(other, otherChar, campaign.compendium.conditions)) continue;

        const reactorCb = findTokenCombatant(other);
        if (reactorCb && reactorCb.reactionAvailable === false) continue;
        // D&D 5e PHB p.195: Opportunity Attacks require SEEING the moving target (hidden/stealthed creatures don't provoke!)
        if (!doesObserverDetectStealthedToken(other, finalTok, campaign)) continue;

        // Check if moving token was within 1 square IN 3D (respecting Elevation!) at origin OR at any intermediate step
        const wasAdjAlongPath = denseWalkedSteps.slice(0, -1).some((step) => {
          const stepTok = { ...finalTok, x: step.x, y: step.y };
          const d = getToken3DDistance(stepTok, other, sqMeters).squares3D;
          if (d > 1) return false;
          return !evaluateLineOfSightAndCover(activeMap, stepTok, other, false).blockedByWall;
        });
        const nowDist = getToken3DDistance(finalTok, other, sqMeters).squares3D;

        if (wasAdjAlongPath && nowDist > 1) {
          const meleeAttacks = buildMeleeOpportunityAttacks(other);
          if (meleeAttacks.length > 0) {
            queuedPrompts.push({
              id: `opp-${Date.now()}-${other.id}`,
              reactorTokenId: other.id,
              reactorName: other.name,
              reactorColor: other.color,
              reactorType: other.type === 'character' ? 'character' : 'monster',
              reactorReferenceId: other.referenceId,
              targetTokenId: finalTok.id,
              targetName: finalTok.name,
              attacks: meleeAttacks,
            });
          }
        }
      }
      if (queuedPrompts.length === 1) {
        triggerOpportunityPrompt(queuedPrompts[0]);
      } else if (queuedPrompts.length > 1) {
        enqueueOpportunityPrompts(queuedPrompts);
      }
    }
  };

  const updateActiveMap = (updater: (m: TacticalMap) => TacticalMap) => {
    if (!activeMap) return;
    updateCampaign((prev) => ({
      ...prev,
      maps: prev.maps.map((m) => (m.id === activeMap.id ? updater(m) : m)),
    }));
  };

  const getCellFromEvent = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!gridRef.current || !activeMap) {
      return { gx: 0, gy: 0, rawX: 0, rawY: 0, xPct: 0, yPct: 0 };
    }
    const rect = gridRef.current.getBoundingClientRect();
    const cellPx = activeMap.gridSizePx * zoom;
    const rawX = (e.clientX - rect.left) / cellPx;
    const rawY = (e.clientY - rect.top) / cellPx;
    const gx = Math.max(0, Math.min(activeMap.gridWidth - 1, Math.floor(rawX)));
    const gy = Math.max(0, Math.min(activeMap.gridHeight - 1, Math.floor(rawY)));
    const xPct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const yPct = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    return { gx, gy, rawX, rawY, xPct, yPct };
  };

  const handleGridMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!activeMap) return;
    setSelectedTemplateId(null);
    setSelectedTokenId(null);
    setSelectedMarkerId(null);
    if (e.button === 0 && !pendingAttackChoice) {
      setTargetTokenId(null);
    }
    if (e.button === 2) {
      if (pendingAttackChoice) setPendingAttackChoice(null);
      if (secretMarkerKind) setSecretMarkerKind(null);
      return;
    }
    const { gx, gy, rawX, rawY, xPct, yPct } = getCellFromEvent(e);

    // Interactive Teleport Placement: click an unoccupied visible square within range!
    if (e.button === 0 && pendingAttackChoice?.isTeleport) {
      executeTeleportAbility(pendingAttackChoice, gx, gy);
      return;
    }

    // Interactive AoE Ability Placement: click anywhere on map to cast geometric shape!
    if (e.button === 0 && pendingAttackChoice?.aoeShape) {
      const snappedX = Math.max(0, Math.min(activeMap.gridWidth, Math.round(rawX * 2) / 2));
      const snappedY = Math.max(0, Math.min(activeMap.gridHeight, Math.round(rawY * 2) / 2));
      castAoEAbility(pendingAttackChoice, snappedX, snappedY, aoeAimPos.angleDeg);
      return;
    }

    if (role === 'gm' && secretMarkerKind) {
      const defaultTitles: Record<GmMarkerKind, string> = {
        chest: 'Baú Escondido',
        item: 'Item Secreto',
        trap: 'Armadilha Oculta',
        secret: 'Passagem Secreta',
        door: 'Porta',
        light: 'Ponto de Luz',
      };
      const newMarker: GmMapMarker = {
        id: `gmm-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        x: gx,
        y: gy,
        kind: secretMarkerKind,
        title: defaultTitles[secretMarkerKind],
        revealed: secretMarkerKind === 'door',
        ...(secretMarkerKind === 'light'
          ? {
              lightRadiusMeters: 6,
              lightColor: '#f59e0b',
              lightEnabled: true,
            }
          : {}),
        ...(secretMarkerKind === 'door'
          ? {
              doorState: 'closed' as const,
              lockDc: 13,
            }
          : {}),
        ...(secretMarkerKind === 'trap'
          ? {
              trapDc: 13,
              trapSaveSkillId: 'reflexos',
              trapDamageFormula: '2d6',
              trapDamageType: 'Perfuração',
              trapTriggered: false,
            }
          : {}),
      };
      updateActiveMap((m) => ({
        ...m,
        gmMarkers: [...(m.gmMarkers || []), newMarker],
      }));
      setSelectedMarkerId(newMarker.id);
      return;
    }

    if (tool === 'pointer') {
      emitPointerMove(activeMap.id, xPct, yPct);
      return;
    }

    if (tool === 'ruler') {
      setRulerStart({ x: gx, y: gy });
      setRulerEnd({ x: gx, y: gy });
      return;
    }

    if (tool === 'draw' && e.button === 0) {
      const clampedX = Math.max(0, Math.min(activeMap.gridWidth, Math.round(rawX * 100) / 100));
      const clampedY = Math.max(0, Math.min(activeMap.gridHeight, Math.round(rawY * 100) / 100));
      const startPts = [{ x: clampedX, y: clampedY }];
      activeDrawPointsRef.current = startPts;
      setActiveDrawPoints(startPts);
      return;
    }

    if (
      tool === 'ping' ||
      (e.button === 0 && e.shiftKey && tool === 'select' && !secretMarkerKind && !pendingAttackChoice)
    ) {
      const pingColor =
        role === 'player'
          ? myCharacter?.playerColor || myPlayerColor || '#38bdf8'
          : myPlayerColor || '#d4ad5c';
      sendPing(activeMap.id, gx, gy, pingColor);
      return;
    }

    if (role === 'gm' && (tool === 'fog-reveal' || tool === 'fog-hide')) {
      setMarqueeBox({ startGx: gx, startGy: gy, endGx: gx, endGy: gy, mode: 'fog' });
      return;
    }

    if (role === 'gm' && (tool.startsWith('terrain-') || tool.startsWith('surface-'))) {
      setMarqueeBox({ startGx: gx, startGy: gy, endGx: gx, endGy: gy, mode: 'terrain' });
      return;
    }

    if (tool === 'select' && role === 'gm' && e.button === 0 && !spacePressedRef.current) {
      setMarqueeBox({ startGx: gx, startGy: gy, endGx: gx, endGy: gy, mode: 'select' });
      return;
    }
  };

  const handleGridMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!activeMap) return;
    const { gx, gy, rawX, rawY, xPct, yPct } = getCellFromEvent(e);

    if (role === 'gm' && tool === 'terrain-wall') {
      setWallHoverCell((prev) => (prev && prev.x === gx && prev.y === gy ? prev : { x: gx, y: gy }));
    } else if (wallHoverCell) {
      setWallHoverCell(null);
    }

    if (pendingAttackChoice?.isTeleport) {
      setTeleportHoverCell((prev) => (prev && prev.x === gx && prev.y === gy ? prev : { x: gx, y: gy }));
    } else if (teleportHoverCell) {
      setTeleportHoverCell(null);
    }

    if (pendingAttackChoice?.aoeShape && !pendingAttackChoice?.isTeleport) {
      const snappedX = Math.max(0, Math.min(activeMap.gridWidth, Math.round(rawX * 2) / 2));
      const snappedY = Math.max(0, Math.min(activeMap.gridHeight, Math.round(rawY * 2) / 2));
      setAoeAimPos((p) =>
        p.x === snappedX && p.y === snappedY ? p : { ...p, x: snappedX, y: snappedY }
      );
    }

    // Live Colored Pointer ("Bolinha") when Pointer tool is active OR Alt key held
    if (tool === 'pointer' || e.altKey) {
      const now = Date.now();
      if (now - lastPointerEmitRef.current > 45) {
        lastPointerEmitRef.current = now;
        emitPointerMove(activeMap.id, xPct, yPct);
      }
      if (tool === 'pointer') return;
    }

    if (draggingTemplateId) {
      // Half-cell snap (0.5 increments) so Cones/Lines/Cubes/Spheres snap freely to cell centers, edges, OR vertices!
      const snappedX = Math.max(
        -0.5,
        Math.min(activeMap.gridWidth - 0.5, Math.round((rawX - 0.5) * 2) / 2)
      );
      const snappedY = Math.max(
        -0.5,
        Math.min(activeMap.gridHeight - 0.5, Math.round((rawY - 0.5) * 2) / 2)
      );
      updateActiveMap((m) => ({
        ...m,
        templates: m.templates.map((tmpl) =>
          tmpl.id === draggingTemplateId ? { ...tmpl, x: snappedX, y: snappedY } : tmpl
        ),
      }));
      return;
    }

    if (draggingTokenId && tool === 'select') {
      const isGroupDrag =
        role === 'gm' && selectedTokenIds.length > 1 && selectedTokenIds.includes(draggingTokenId);
      const leadTok = activeMap.tokens.find((t) => t.id === draggingTokenId);
      if (!leadTok) return;

      let targetX = Math.max(
        0,
        Math.min(activeMap.gridWidth - leadTok.size, gx - (dragOrigin?.grabDx || 0))
      );
      let targetY = Math.max(
        0,
        Math.min(activeMap.gridHeight - leadTok.size, gy - (dragOrigin?.grabDy || 0))
      );
      if (
        !isGroupDrag &&
        campaign.combat.active &&
        dragOrigin &&
        !dragOrigin.shiftFree &&
        !(role === 'gm' && leadTok.type === 'character')
      ) {
        const cb = findTokenCombatant(leadTok);
        const remMeters = cb ? cb.remainingMoveMeters ?? cb.speedMeters ?? 9 : 9;
        const maxSq = Math.max(0, Math.floor(remMeters / sqMeters));
        targetX = Math.max(dragOrigin.x - maxSq, Math.min(dragOrigin.x + maxSq, targetX));
        targetY = Math.max(dragOrigin.y - maxSq, Math.min(dragOrigin.y + maxSq, targetY));
        targetX = Math.max(0, Math.min(activeMap.gridWidth - leadTok.size, targetX));
        targetY = Math.max(0, Math.min(activeMap.gridHeight - leadTok.size, targetY));
      }
      if (!isGroupDrag) {
        const freePos = resolveDragTargetCell(
          activeMap,
          leadTok,
          targetX,
          targetY,
          role === 'gm',
          Boolean(role === 'gm' && dragOrigin?.shiftFree)
        );
        targetX = freePos.x;
        targetY = freePos.y;

        // Enforce Difficult Terrain (2x movement cost) live during combat drag so players can't double-speed through mud/rubble! (Flying tokens ignore ground difficult terrain)
        if (
          campaign.combat.active &&
          dragOrigin &&
          !dragOrigin.shiftFree &&
          !(role === 'gm' && leadTok.type === 'character') &&
          (leadTok.elevationMeters || 0) <= 0 &&
          activeMap.terrainCells
        ) {
          const cb = findTokenCombatant(leadTok);
          const remMeters = cb ? cb.remainingMoveMeters ?? cb.speedMeters ?? 9 : 9;
          const walkLine = traceGridLine(dragOrigin.x, dragOrigin.y, targetX, targetY);
          const effCost = calculateMovementCostMeters(
            dragOrigin,
            { x: targetX, y: targetY },
            activeMap.terrainCells,
            sqMeters,
            walkLine,
            leadTok.size || 1
          ).meters;
          if (effCost > remMeters + 0.01) {
            let bestX = dragOrigin.x;
            let bestY = dragOrigin.y;
            for (let i = 1; i < walkLine.length; i++) {
              const sub = walkLine.slice(0, i + 1);
              const c = calculateMovementCostMeters(
                dragOrigin,
                walkLine[i],
                activeMap.terrainCells,
                sqMeters,
                sub,
                leadTok.size || 1
              ).meters;
              if (c <= remMeters + 0.01) {
                if (
                  !doesTokenCollideAt(
                    activeMap.tokens,
                    walkLine[i].x,
                    walkLine[i].y,
                    leadTok.size,
                    leadTok.id,
                    role === 'gm',
                    effectiveTerrainForDarkness,
                    effectiveWallMetaForDarkness
                  )
                ) {
                  bestX = walkLine[i].x;
                  bestY = walkLine[i].y;
                }
              } else {
                break;
              }
            }
            targetX = bestX;
            targetY = bestY;
          }
        }
      }
      const dx = targetX - leadTok.x;
      const dy = targetY - leadTok.y;
      if (dx === 0 && dy === 0) return;
      didDragTokenRef.current = true;

      const liveMoves: Array<{ id: string; x: number; y: number }> = isGroupDrag
        ? activeMap.tokens
            .filter((t) => selectedTokenIds.includes(t.id))
            .map((t) => {
              const nx = Math.max(0, Math.min(activeMap.gridWidth - t.size, t.x + dx));
              const ny = Math.max(0, Math.min(activeMap.gridHeight - t.size, t.y + dy));
              if (role === 'gm' && dragOrigin?.shiftFree) {
                return { id: t.id, x: nx, y: ny };
              }
              const resolved = resolveDragTargetCell(
                { ...activeMap, tokens: activeMap.tokens.filter((o) => !selectedTokenIds.includes(o.id) || o.id === t.id) },
                t,
                nx,
                ny,
                true,
                false
              );
              return { id: t.id, x: resolved.x, y: resolved.y };
            })
        : [{ id: draggingTokenId, x: targetX, y: targetY }];

      moveTokensLive(activeMap.id, liveMoves);

      setDragPath((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.x === targetX && last.y === targetY) return prev;
        return [...prev.slice(-120), { x: targetX, y: targetY }];
      });
      return;
    }

    if (marqueeBox && e.buttons === 1) {
      if (marqueeBox.endGx !== gx || marqueeBox.endGy !== gy) {
        setMarqueeBox((prev) => (prev ? { ...prev, endGx: gx, endGy: gy } : null));
      }
      return;
    }

    if (tool === 'ruler' && rulerStart && e.buttons === 1) {
      setRulerEnd({ x: gx, y: gy });
      return;
    }

    if (tool === 'draw' && activeDrawPointsRef.current.length > 0 && e.buttons === 1) {
      const cx = Math.max(0, Math.min(activeMap.gridWidth, Math.round(rawX * 100) / 100));
      const cy = Math.max(0, Math.min(activeMap.gridHeight, Math.round(rawY * 100) / 100));
      const prevPts = activeDrawPointsRef.current;
      const last = prevPts[prevPts.length - 1];
      if (!last || Math.hypot(cx - last.x, cy - last.y) >= 0.1) {
        const nextPts = [...prevPts.slice(-140), { x: cx, y: cy }];
        activeDrawPointsRef.current = nextPts;
        setActiveDrawPoints(nextPts);
      }
      return;
    }
  };

  const finalizeActiveDrawing = () => {
    const pts = activeDrawPointsRef.current;
    if (pts.length === 0) return;
    activeDrawPointsRef.current = [];
    setActiveDrawPoints([]);
    if (!activeMap || pts.length < 2) return;

    const strokeColor =
      role === 'gm'
        ? gmDrawColor
        : myCharacter?.playerColor || myPlayerColor || '#38bdf8';
    const authorName =
      role === 'gm'
        ? campaign.gmName || 'Mestre'
        : myCharacter?.name || myPlayerName || 'Jogador';

    if (role === 'gm' && gmDrawPermanent) {
      const permanentStroke: MapDrawingStroke = {
        id: `drw-p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        mapId: activeMap.id,
        points: pts,
        color: strokeColor,
        width: 0.1,
        authorName,
        permanent: true,
        createdAt: Date.now(),
      };
      updateActiveMap((m) => ({
        ...m,
        drawings: [...(m.drawings || []).slice(-60), permanentStroke],
      }));
    } else {
      emitTempDrawing({
        mapId: activeMap.id,
        points: pts,
        color: strokeColor,
        width: 0.1,
        authorName,
        permanent: false,
      });
    }
  };

  const applyMarqueeSelection = () => {
    if (!marqueeBox || !activeMap) return;
    const minX = Math.min(marqueeBox.startGx, marqueeBox.endGx);
    const maxX = Math.max(marqueeBox.startGx, marqueeBox.endGx);
    const minY = Math.min(marqueeBox.startGy, marqueeBox.endGy);
    const maxY = Math.max(marqueeBox.startGy, marqueeBox.endGy);

    if (marqueeBox.mode === 'fog') {
      updateActiveMap((m) => {
        const set = new Set(m.revealedCells);
        for (let y = minY; y <= maxY; y++) {
          for (let x = minX; x <= maxX; x++) {
            const key = `${x},${y}`;
            if (tool === 'fog-reveal') set.add(key);
            else set.delete(key);
          }
        }
        return { ...m, revealedCells: Array.from(set) };
      });
    } else if (marqueeBox.mode === 'terrain') {
      if (tool.startsWith('surface-')) {
        const surfKind = tool.replace('surface-', '') as ElementalSurfaceKind;
        updateActiveMap((m) => {
          const nextSurf: Record<string, ElementalSurfaceKind> = { ...(m.elementalSurfaces || {}) };
          for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
              nextSurf[`${x},${y}`] = surfKind;
            }
          }
          return { ...m, elementalSurfaces: nextSurf };
        });
      } else {
        const desiredKind: TerrainCellKind | null =
          tool === 'terrain-erase'
            ? null
            : tool === 'terrain-wall'
              ? 'wall'
              : tool === 'terrain-cover'
                ? 'cover'
                : 'difficult';
        updateActiveMap((m) => {
          const nextTerrain: Record<string, TerrainCellKind> = { ...(m.terrainCells || {}) };
          const nextWallMeta: Record<string, WallCellMeta> = { ...(m.wallMeta || {}) };
          const nextSurf: Record<string, ElementalSurfaceKind> = { ...(m.elementalSurfaces || {}) };
          for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
              const key = `${x},${y}`;
              if (!desiredKind) {
                delete nextTerrain[key];
                delete nextWallMeta[key];
                delete nextSurf[key];
              } else {
                nextTerrain[key] = desiredKind;
                if (desiredKind === 'wall') {
                  nextWallMeta[key] = {
                    shape: wallBrushShape,
                    opacity: wallBrushOpacity,
                  };
                } else {
                  delete nextWallMeta[key];
                }
              }
            }
          }
          return {
            ...m,
            terrainCells: nextTerrain,
            wallMeta: nextWallMeta,
            elementalSurfaces: nextSurf,
          };
        });
      }
    } else if (marqueeBox.mode === 'select') {
      const isDrag = minX !== maxX || minY !== maxY;
      if (isDrag) {
        const inside = activeMap.tokens
          .filter((t) => {
            const tRight = t.x + (t.size || 1) - 1;
            const tBottom = t.y + (t.size || 1) - 1;
            return t.x <= maxX && tRight >= minX && t.y <= maxY && tBottom >= minY;
          })
          .map((t) => t.id);
        setSelectedTokenIds(inside);
        if (inside.length === 1) {
          setSelectedTokenId(inside[0]);
        } else {
          setSelectedTokenId(null);
        }
      } else {
        setSelectedTokenIds([]);
      }
    }
    setMarqueeBox(null);
  };

  const handleGridMouseUp = () => {
    finalizeActiveDrawing();
    if (marqueeBox) {
      applyMarqueeSelection();
    }
    finalizeTokenDrag();
    setDraggingTemplateId(null);
  };

  const handleGridDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (role !== 'gm' || !activeMap) return;
    const types = Array.from(e.dataTransfer.types || []);
    if (
      !types.includes('application/x-chronicle-hero') &&
      !types.includes('application/x-chronicle-npc')
    ) {
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (!gridRef.current) return;
    const rect = gridRef.current.getBoundingClientRect();
    const cellPxLocal = activeMap.gridSizePx * zoom;
    const gx = Math.max(
      0,
      Math.min(activeMap.gridWidth - 1, Math.floor((e.clientX - rect.left) / cellPxLocal))
    );
    const gy = Math.max(
      0,
      Math.min(activeMap.gridHeight - 1, Math.floor((e.clientY - rect.top) / cellPxLocal))
    );
    setDropHighlightCell({ x: gx, y: gy });
  };

  const handleGridDrop = (e: React.DragEvent<HTMLDivElement>) => {
    setDropHighlightCell(null);
    if (role !== 'gm' || !activeMap || !gridRef.current) return;
    const heroId = e.dataTransfer.getData('application/x-chronicle-hero');
    const npcId = e.dataTransfer.getData('application/x-chronicle-npc');
    if (!heroId && !npcId) return;
    e.preventDefault();

    const rect = gridRef.current.getBoundingClientRect();
    const cellPxLocal = activeMap.gridSizePx * zoom;
    const gx = Math.max(
      0,
      Math.min(activeMap.gridWidth - 1, Math.floor((e.clientX - rect.left) / cellPxLocal))
    );
    const gy = Math.max(
      0,
      Math.min(activeMap.gridHeight - 1, Math.floor((e.clientY - rect.top) / cellPxLocal))
    );

    if (heroId) {
      const ch = campaign.characters.find((c) => c.id === heroId);
      if (!ch) return;
      const stats = computeCharacterStats(ch, campaign);
      const existing = activeMap.tokens.find(
        (t) => t.type === 'character' && t.referenceId === ch.id
      );
      const mapWithoutSelf = existing
        ? { ...activeMap, tokens: activeMap.tokens.filter((t) => t.id !== existing.id) }
        : activeMap;
      const pos = findNearestFreeGridCell(mapWithoutSelf, gx, gy, 1);
      const targetId = existing ? existing.id : `tok-${ch.id}-${Date.now()}`;
      updateActiveMap((m) => {
        if (existing) {
          return {
            ...m,
            tokens: m.tokens.map((t) =>
              t.id === existing.id
                ? {
                    ...t,
                    x: pos.x,
                    y: pos.y,
                    hp: ch.hp,
                    maxHp: stats.maxHp,
                    defense: stats.defense,
                    color: ch.playerColor || ch.tokenColor,
                    frameStyle: ch.tokenFrameStyle || 'gold',
                    imageUrl: ch.portraitUrl,
                  }
                : t
            ),
          };
        }
        return {
          ...m,
          tokens: [
            ...m.tokens,
            {
              id: targetId,
              name: ch.name.split(' ')[0],
              type: 'character',
              referenceId: ch.id,
              x: pos.x,
              y: pos.y,
              size: 1,
              hp: ch.hp,
              maxHp: stats.maxHp,
              defense: stats.defense,
              activeConditionIds: ch.activeConditionIds,
              isHidden: false,
              color: ch.playerColor || ch.tokenColor,
              frameStyle: ch.tokenFrameStyle || 'gold',
              imageUrl: ch.portraitUrl,
            },
          ],
        };
      });
      setActiveCharacterId(ch.id);
      setTargetTokenId(targetId);
      return;
    }

    if (npcId) {
      const npc = campaign.npcs.find((n) => n.id === npcId);
      if (!npc) return;
      const npcColor =
        npc.tokenColor ||
        (npc.disposition === 'Hostil'
          ? '#ef4444'
          : npc.disposition === 'Aliado'
            ? '#22c55e'
            : '#e0b84c');
      const npcFrame =
        npc.disposition === 'Hostil'
          ? 'crimson'
          : npc.disposition === 'Aliado'
            ? 'emerald'
            : 'gold';
      const existing = activeMap.tokens.find(
        (t) => t.type === 'npc' && t.referenceId === npc.id
      );
      const mapWithoutSelf = existing
        ? { ...activeMap, tokens: activeMap.tokens.filter((t) => t.id !== existing.id) }
        : activeMap;
      const pos = findNearestFreeGridCell(mapWithoutSelf, gx, gy, 1);
      const targetId = existing ? existing.id : `tok-npc-${npc.id}-${Date.now()}`;
      updateActiveMap((m) => {
        if (existing) {
          return {
            ...m,
            tokens: m.tokens.map((t) =>
              t.id === existing.id
                ? {
                    ...t,
                    x: pos.x,
                    y: pos.y,
                    name: npc.name,
                    imageUrl: npc.imageUrl,
                    color: npcColor,
                    frameStyle: npcFrame,
                    maxHp: npc.maxHp || 15,
                    defense: npc.defense || 11,
                    hideNameFromPlayers: npc.hideNameFromPlayers,
                    hideAcFromPlayers: npc.hideAcFromPlayers,
                    hideHpFromPlayers: npc.hideHpFromPlayers,
                  }
                : t
            ),
          };
        }
        return {
          ...m,
          tokens: [
            ...m.tokens,
            {
              id: targetId,
              name: npc.name,
              type: 'npc',
              referenceId: npc.id,
              x: pos.x,
              y: pos.y,
              size: 1,
              hp: npc.maxHp || 15,
              maxHp: npc.maxHp || 15,
              defense: npc.defense || 11,
              activeConditionIds: [],
              isHidden: !npc.revealedToPlayers,
              hideNameFromPlayers: npc.hideNameFromPlayers,
              hideAcFromPlayers: npc.hideAcFromPlayers,
              hideHpFromPlayers: npc.hideHpFromPlayers,
              color: npcColor,
              frameStyle: npcFrame,
              imageUrl: npc.imageUrl,
            },
          ],
        };
      });
      setTargetTokenId(targetId);
    }
  };

  const handleGridMouseLeave = () => {
    finalizeActiveDrawing();
    if (marqueeBox) {
      applyMarqueeSelection();
    }
    finalizeTokenDrag();
    setDraggingTemplateId(null);
    if (tool === 'pointer') {
      emitPointerHide();
    }
  };

  const handleSpawnMonster = () => {
    const mon = campaign.compendium.monsters.find((m) => m.id === spawnMonsterId);
    if (!mon || !activeMap) return;
    const existingCount = activeMap.tokens.filter((t) => t.referenceId === mon.id).length;
    const size =
      mon.gridSize ||
      (mon.size === 'Colossal'
        ? 4
        : mon.size === 'Enorme'
          ? 3
          : mon.size === 'Grande'
            ? 2
            : 1);
    const spawnPos = findNearestFreeGridCell(
      activeMap,
      Math.floor(activeMap.gridWidth / 2),
      Math.floor(activeMap.gridHeight / 2),
      size
    );
    const newToken: MapToken = {
      id: `tok-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      name: mon.isBoss && existingCount === 0 ? mon.name : `${mon.name} #${existingCount + 1}`,
      type: 'monster',
      referenceId: mon.id,
      x: spawnPos.x,
      y: spawnPos.y,
      size,
      hp: mon.maxHp,
      maxHp: mon.maxHp,
      defense: mon.defense,
      activeConditionIds: [],
      isHidden: spawnHidden,
      hideNameFromPlayers: spawnHideName || mon.hideNameFromPlayers,
      hideAcFromPlayers: mon.hideAcFromPlayers,
      hideHpFromPlayers: mon.hideHpFromPlayers,
      color: mon.tokenColor,
      frameStyle: 'crimson',
      imageUrl: mon.imageUrl,
      ...(mon.isBoss
        ? {
            isBoss: true,
            bossTitle: mon.bossTitle,
            bossPhase: 1,
            bossPhase2HpPct: mon.bossPhase2HpPct,
            bossPhase2Title: mon.bossPhase2Title,
            bossPhases: mon.bossPhases?.map((p) => ({ ...p })),
            triggeredBossPhaseIds: [],
            legendaryActionsMax: mon.legendaryActionsMax ?? 3,
            legendaryActionsRemaining: mon.legendaryActionsMax ?? 3,
            legendaryResistancesMax: mon.legendaryResistancesMax ?? 3,
            legendaryResistancesRemaining: mon.legendaryResistancesMax ?? 3,
          }
        : {}),
    };
    updateActiveMap((m) => ({ ...m, tokens: [...m.tokens, newToken] }));
  };

  const handleSyncPartyTokens = () => {
    if (!activeMap) return;
    updateActiveMap((m) => {
      const existingCharIds = new Set(m.tokens.map((t) => t.referenceId));
      const newTokens: MapToken[] = [];
      const refreshed = m.tokens.map((tok) => {
        if (tok.type !== 'character' || !tok.referenceId) return tok;
        const ch = campaign.characters.find((c) => c.id === tok.referenceId);
        if (!ch) return tok;
        const stats = computeCharacterStats(ch, campaign);
        return {
          ...tok,
          hp: ch.hp,
          maxHp: stats.maxHp,
          defense: stats.defense,
          color: ch.playerColor || ch.tokenColor,
          frameStyle: ch.tokenFrameStyle || 'gold',
          imageUrl: ch.portraitUrl,
          activeConditionIds: ch.activeConditionIds,
        };
      });
      campaign.characters.forEach((ch, idx) => {
        const stats = computeCharacterStats(ch, campaign);
        if (!existingCharIds.has(ch.id)) {
          const spawnPos = findNearestFreeGridCell(
            {
              gridWidth: m.gridWidth,
              gridHeight: m.gridHeight,
              tokens: [...refreshed, ...newTokens],
            },
            2 + (idx % 2),
            4 + idx,
            1
          );
          newTokens.push({
            id: `tok-${ch.id}-${Date.now()}`,
            name: ch.name.split(' ')[0],
            type: 'character',
            referenceId: ch.id,
            x: spawnPos.x,
            y: spawnPos.y,
            size: 1,
            hp: ch.hp,
            maxHp: stats.maxHp,
            defense: stats.defense,
            activeConditionIds: ch.activeConditionIds,
            isHidden: false,
            color: ch.playerColor || ch.tokenColor,
            frameStyle: ch.tokenFrameStyle || 'gold',
            imageUrl: ch.portraitUrl,
          });
        }
      });
      return { ...m, tokens: [...refreshed, ...newTokens] };
    });
  };

  const addAoETemplate = (shape: AoETemplate['shape']) => {
    if (role !== 'gm' || !activeMap) return;
    const labels: Record<AoETemplate['shape'], string> = {
      sphere: 'Esfera (6m)',
      cone: 'Cone (4,5m)',
      line: 'Linha (9m)',
      cube: 'Cubo (4,5m)',
    };
    const colors: Record<AoETemplate['shape'], string> = {
      sphere: 'rgba(239, 68, 68, 0.28)',
      cone: 'rgba(249, 115, 22, 0.28)',
      line: 'rgba(56, 189, 248, 0.28)',
      cube: 'rgba(168, 85, 247, 0.28)',
    };
    const defaultRadius: Record<AoETemplate['shape'], number> = {
      sphere: 4,
      cone: 3,
      line: 3,
      cube: 1.5, // 3x3 squares (4,5m / 15 ft side)
    };
    const tmpl: AoETemplate = {
      id: `aoe-${Date.now()}`,
      shape,
      x: Math.floor(activeMap.gridWidth / 2),
      y: Math.floor(activeMap.gridHeight / 2),
      radiusSquares: defaultRadius[shape],
      angleDeg: 0,
      color: colors[shape],
      label: labels[shape],
    };
    updateActiveMap((m) => ({ ...m, templates: [...m.templates, tmpl] }));
    setSelectedTemplateId(tmpl.id);
  };

  const createNewMap = async () => {
    const name = await openTextPrompt('Nome do novo Mapa ou Cena:', 'Nova Masmorra');
    if (!name) return;
    const newMap: TacticalMap = {
      id: `map-${Date.now()}`,
      name,
      mode: 'tactical',
      backgroundUrl: '',
      themePreset: 'crypt',
      gridWidth: 22,
      gridHeight: 14,
      gridSizePx: 48,
      fogEnabled: false,
      revealedCells: [],
      weather: 'none',
      sceneNpcIds: [],
      tokens: [],
      templates: [],
    };
    updateCampaign((prev) => ({
      ...prev,
      maps: [...prev.maps, newMap],
      activeMapId: newMap.id,
    }));
  };

  const rulerMetrics = useMemo(() => {
    if (!rulerStart || !rulerEnd || !activeMap) return null;
    const dx = Math.abs(rulerEnd.x - rulerStart.x);
    const dy = Math.abs(rulerEnd.y - rulerStart.y);
    const squares = Math.max(dx, dy);
    const meters = Math.round(squares * campaign.settings.gridSquareMeters * 10) / 10;
    const feet = Math.round((meters / 1.5) * 5);
    return { squares, meters, feet };
  }, [rulerStart, rulerEnd, activeMap, campaign.settings.gridSquareMeters]);

  useEffect(() => {
    setCameraPan({ x: 0, y: 0 });
  }, [activeMap?.id]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.code === 'Space') {
        spacePressedRef.current = true;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spacePressedRef.current = false;
      }
    };
    const onWinMouseMove = (e: MouseEvent) => {
      if (!panDragRef.current) return;
      const dx = e.clientX - panDragRef.current.startX;
      const dy = e.clientY - panDragRef.current.startY;
      setCameraPan({
        x: panDragRef.current.origX + dx,
        y: panDragRef.current.origY + dy,
      });
    };
    const onWinMouseUp = () => {
      if (panDragRef.current) {
        panDragRef.current = null;
        setIsPanningWorld(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onWinMouseMove);
    window.addEventListener('mouseup', onWinMouseUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onWinMouseMove);
      window.removeEventListener('mouseup', onWinMouseUp);
    };
  }, []);

  const beginWorldPan = (e: React.MouseEvent) => {
    e.preventDefault();
    panDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: cameraPan.x,
      origY: cameraPan.y,
    };
    setIsPanningWorld(true);
  };

  const applyMapImageWithAdaptiveGrid = (url: string) => {
    const resolved = resolveAssetUrl(url);
    const img = new Image();
    img.onload = () => {
      const natW = img.naturalWidth || 1056;
      const natH = img.naturalHeight || 672;
      const { gridWidth, gridHeight } = computeAdaptiveMapGrid(natW, natH, 70);
      updateActiveMap((m) => ({
        ...m,
        backgroundUrl: url,
        backgroundNaturalWidth: natW,
        backgroundNaturalHeight: natH,
        gridWidth,
        gridHeight,
      }));
      const baseCell = activeMap?.gridSizePx || 48;
      const availW = Math.max(400, window.innerWidth - 120);
      const availH = Math.max(300, window.innerHeight - 220);
      const fitZoom = Math.min(1, availW / (gridWidth * baseCell), availH / (gridHeight * baseCell));
      setZoom(Math.max(0.1, Math.min(2.5, Number(fitZoom.toFixed(2)))));
      setCameraPan({ x: 0, y: 0 });
    };
    img.onerror = () => {
      updateActiveMap((m) => ({ ...m, backgroundUrl: url }));
    };
    img.src = resolved;
  };

  // Auto-detect natural image dimensions for maps uploaded before adaptive grid support
  useEffect(() => {
    if (
      !activeMap ||
      !activeMap.backgroundUrl ||
      (activeMap.backgroundNaturalWidth && activeMap.backgroundNaturalHeight)
    ) {
      return;
    }
    const resolved = resolveAssetUrl(activeMap.backgroundUrl);
    if (!resolved) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled || !img.naturalWidth || !img.naturalHeight) return;
      const natW = img.naturalWidth;
      const natH = img.naturalHeight;
      const { gridWidth, gridHeight } = computeAdaptiveMapGrid(natW, natH, 70);
      updateCampaign((prev) => ({
        ...prev,
        maps: prev.maps.map((m) =>
          m.id === activeMap.id
            ? {
                ...m,
                backgroundNaturalWidth: natW,
                backgroundNaturalHeight: natH,
                gridWidth,
                gridHeight,
              }
            : m
        ),
      }));
    };
    img.src = resolved;
    return () => {
      cancelled = true;
    };
  }, [activeMap, resolveAssetUrl, updateCampaign]);

  if (!activeMap) return null;

  const cellPx = activeMap.gridSizePx * zoom;
  const totalW = activeMap.gridWidth * cellPx;
  const totalH = activeMap.gridHeight * cellPx;
  const targetToken = activeMap.tokens.find((t) => t.id === targetTokenId);
  const resolvedMapBg = resolveAssetUrl(activeMap.backgroundUrl);

  const activeTurnCombatant = campaign.combat.active
    ? campaign.combat.combatants[campaign.combat.currentTurnIndex]
    : null;

  // Smooth Camera Auto-Focus on active combatant when turn changes (if user has Auto-Focus enabled)
  const lastAutoFocusedTurnRef = useRef<string>('');
  useEffect(() => {
    if (!autoCameraFocus || !campaign.combat.active || !activeTurnCombatant) return;
    const turnKey = `${campaign.combat.round}-${campaign.combat.currentTurnIndex}-${activeTurnCombatant.id}`;
    if (turnKey === lastAutoFocusedTurnRef.current) return;
    lastAutoFocusedTurnRef.current = turnKey;

    const tok = activeMap.tokens.find(
      (t) =>
        t.id === activeTurnCombatant.tokenId ||
        (activeTurnCombatant.referenceId &&
          t.type === 'character' &&
          t.referenceId === activeTurnCombatant.referenceId)
    );
    if (!tok) return;
    if (
      tok.isHidden &&
      role !== 'gm' &&
      !(myCharacter && (tok.visibleToCharacterIds || []).includes(myCharacter.id))
    ) {
      return;
    }
    const sz = Math.max(1, tok.size || 1);
    const targetPanX = Math.round(totalW / 2 - (tok.x + sz / 2) * cellPx);
    const targetPanY = Math.round(totalH / 2 - (tok.y + sz / 2) * cellPx);
    setCameraPan({ x: targetPanX, y: targetPanY });
  }, [
    activeMap.tokens,
    activeTurnCombatant,
    autoCameraFocus,
    campaign.combat.active,
    campaign.combat.currentTurnIndex,
    campaign.combat.round,
    cellPx,
    myCharacter,
    role,
    totalH,
    totalW,
  ]);

  // Smooth Camera Focus broadcast triggered by GM ("Focar Câmera da Mesa")
  // Respects player's Auto-Focus toggle ("quero opções p desativar isso tudo")!
  const lastFocusSignalIdRef = useRef<string>('');
  useEffect(() => {
    if (!cameraFocusSignal || cameraFocusSignal.mapId !== activeMap.id) return;
    if (role !== 'gm' && !autoCameraFocus) return;
    if (cameraFocusSignal.id === lastFocusSignalIdRef.current) return;
    lastFocusSignalIdRef.current = cameraFocusSignal.id;
    const targetPanX = Math.round(totalW / 2 - cameraFocusSignal.x * cellPx);
    const targetPanY = Math.round(totalH / 2 - cameraFocusSignal.y * cellPx);
    setCameraPan({ x: targetPanX, y: targetPanY });
  }, [activeMap.id, autoCameraFocus, cameraFocusSignal, cellPx, role, totalH, totalW]);

  // Close GM Player Radar & Quick Skill Check popovers on outside click or Escape
  useEffect(() => {
    if (!showPlayerRadar && !showQuickCheck) return;
    const onDown = (e: MouseEvent) => {
      if (playerRadarRef.current && !playerRadarRef.current.contains(e.target as Node)) {
        setShowPlayerRadar(false);
      }
      if (quickCheckRef.current && !quickCheckRef.current.contains(e.target as Node)) {
        setShowQuickCheck(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowPlayerRadar(false);
        setShowQuickCheck(false);
      }
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [showPlayerRadar, showQuickCheck]);

  // Fulfill pending GM Radar focus once the target map becomes active
  useEffect(() => {
    const pending = pendingRadarFocusRef.current;
    if (!pending || pending.mapId !== activeMap.id) return;
    const tok = activeMap.tokens.find((t) => t.id === pending.tokenId);
    if (!tok) return;
    const sz = Math.max(1, tok.size || 1);
    setCameraPan({
      x: Math.round(totalW / 2 - (tok.x + sz / 2) * cellPx),
      y: Math.round(totalH / 2 - (tok.y + sz / 2) * cellPx),
    });
    setTargetTokenId(tok.id);
    pendingRadarFocusRef.current = null;
  }, [activeMap.id, activeMap.tokens, cellPx, setTargetTokenId, totalH, totalW]);

  const focusHeroInRadar = (heroId: string, mapId: string, tokenId: string) => {
    setActiveCharacterId(heroId);
    if (mapId === activeMap.id) {
      const tok = activeMap.tokens.find((t) => t.id === tokenId);
      if (tok) {
        const sz = Math.max(1, tok.size || 1);
        setCameraPan({
          x: Math.round(totalW / 2 - (tok.x + sz / 2) * cellPx),
          y: Math.round(totalH / 2 - (tok.y + sz / 2) * cellPx),
        });
        setTargetTokenId(tok.id);
      }
      return;
    }
    pendingRadarFocusRef.current = { mapId, tokenId };
    updateCampaign((prev) => {
      const curMode = prev.settings.mapViewMode || 'follow-gm';
      return {
        ...prev,
        activeMapId: mapId,
        settings:
          curMode === 'follow-gm'
            ? { ...prev.settings, playerVisibleMapId: mapId }
            : {
                ...prev.settings,
                playerVisibleMapId: prev.settings.playerVisibleMapId || prev.activeMapId,
              },
      };
    });
  };

  const moveOrPlaceHeroOnMap = (heroId: string, destMapId: string) => {
    const ch = campaign.characters.find((c) => c.id === heroId);
    const destMap = campaign.maps.find((m) => m.id === destMapId);
    if (!ch || !destMap) return;

    let srcMapId: string | null = null;
    let srcTokenId: string | null = null;
    for (const m of campaign.maps) {
      const found = m.tokens.find((t) => t.type === 'character' && t.referenceId === ch.id);
      if (found) {
        srcMapId = m.id;
        srcTokenId = found.id;
        break;
      }
    }

    if (srcMapId && srcTokenId) {
      if (srcMapId === destMapId) {
        focusHeroInRadar(ch.id, destMapId, srcTokenId);
        return;
      }
      moveTokensToMap(srcMapId, destMapId, [srcTokenId]);
      if (destMapId === activeMap.id) {
        pendingRadarFocusRef.current = { mapId: destMapId, tokenId: srcTokenId };
      }
      return;
    }

    const chStats = computeCharacterStats(ch, campaign);
    const pos = findNearestFreeGridCell(
      destMap,
      Math.floor(destMap.gridWidth / 2),
      Math.floor(destMap.gridHeight / 2),
      1
    );
    const newId = `tok-${ch.id}-${Date.now()}`;
    updateCampaign((prev) => ({
      ...prev,
      maps: prev.maps.map((m) =>
        m.id !== destMapId
          ? m
          : {
              ...m,
              tokens: [
                ...m.tokens,
                {
                  id: newId,
                  name: ch.name.split(' ')[0],
                  type: 'character',
                  referenceId: ch.id,
                  x: pos.x,
                  y: pos.y,
                  size: 1,
                  hp: ch.hp,
                  maxHp: chStats.maxHp,
                  defense: chStats.defense,
                  activeConditionIds: ch.activeConditionIds,
                  isHidden: false,
                  color: ch.playerColor || ch.tokenColor,
                  frameStyle: ch.tokenFrameStyle || 'gold',
                  imageUrl: ch.portraitUrl,
                },
              ],
            }
      ),
    }));
    setActiveCharacterId(ch.id);
    if (destMapId === activeMap.id) {
      pendingRadarFocusRef.current = { mapId: destMapId, tokenId: newId };
    }
  };

  const weatherClass =
    activeMap.weather === 'rain'
      ? 'weather-rain'
      : activeMap.weather === 'embers'
      ? 'weather-embers'
      : activeMap.weather === 'snow'
      ? 'weather-snow'
      : activeMap.weather === 'mist'
      ? 'weather-mist'
      : '';

  const mapPointers = Object.values(activePointers).filter(
    (p) => p.active && p.mapId === activeMap.id
  );

  const atmosphericTintStyle = getAtmosphericTintStyle(activeMap.timeOfDay);
  const mapTempDrawings = tempDrawings.filter((d) => d.mapId === activeMap.id);
  const mapPermanentDrawings = activeMap.drawings || [];
  const totalDrawingsCount = mapTempDrawings.length + mapPermanentDrawings.length;

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0 relative overflow-hidden">
      {/* Subtle atmospheric tabletop edge vignette framing the full-bleed map */}
      <div
        className="fixed inset-0 pointer-events-none z-[5]"
        style={{
          boxShadow: 'inset 0 0 110px rgba(4, 5, 9, 0.56)',
        }}
      />
      {/* =====================================================================
          FOUNDRY-STYLE VERTICAL LEFT TOOL RAIL (Floating over Full-Bleed Map)
         ===================================================================== */}
      <aside className="fixed left-3 top-[58px] z-25 flex items-start gap-2 pointer-events-none select-none">
        {/* Vertical Icon Rail */}
        <div className="rpg-rail rounded-lg p-1.5 flex flex-col items-center gap-1 pointer-events-auto">
          {/* GM Start Combat Quick Trigger */}
          {role === 'gm' && !campaign.combat.active && (
            <>
              <button
                type="button"
                onClick={() => startCombatFromMap()}
                className="rpg-btn-crimson w-8 h-8 rounded flex items-center justify-center cursor-pointer"
                title="Iniciar Combate (puxar tokens do mapa para a Iniciativa)"
              >
                <Play className="w-3.5 h-3.5" />
              </button>
              <div className="w-5 h-px bg-[#b89146]/25 my-0.5" />
            </>
          )}

          {/* Core Interaction Tools (GM & Player) */}
          <button
            type="button"
            onClick={() => {
              setTool('select');
              setSecretMarkerKind(null);
              emitPointerHide();
            }}
            className={`w-8 h-8 rounded flex items-center justify-center cursor-pointer transition ${
              tool === 'select' && !secretMarkerKind
                ? 'rpg-btn-primary'
                : 'rpg-btn-ghost text-[#a69b88]'
            }`}
            title="Selecionar e Mover Tokens"
          >
            <MousePointer className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => {
              setSecretMarkerKind(null);
              setTool(tool === 'pointer' ? 'select' : 'pointer');
            }}
            className={`w-8 h-8 rounded flex items-center justify-center cursor-pointer transition ${
              tool === 'pointer' ? 'rpg-btn-primary' : 'rpg-btn-ghost text-[#a69b88]'
            }`}
            title="Apontar no Mapa (Cursor compartilhado)"
          >
            <Navigation className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => {
              setSecretMarkerKind(null);
              setTool('ruler');
              setRulerStart(null);
              setRulerEnd(null);
              emitPointerHide();
            }}
            className={`w-8 h-8 rounded flex items-center justify-center cursor-pointer transition ${
              tool === 'ruler' ? 'rpg-btn-primary' : 'rpg-btn-ghost text-[#a69b88]'
            }`}
            title="Régua — Medir Distância (m / ft)"
          >
            <Ruler className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => {
              setSecretMarkerKind(null);
              setTool('ping');
            }}
            className={`w-8 h-8 rounded flex items-center justify-center cursor-pointer transition ${
              tool === 'ping' ? 'rpg-btn-primary' : 'rpg-btn-ghost text-[#a69b88]'
            }`}
            title="Ping Visual no Mapa (Atalho: Shift + Clique no mapa)"
          >
            <MapPin className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => {
              setSecretMarkerKind(null);
              setTool(tool === 'draw' ? 'select' : 'draw');
              emitPointerHide();
            }}
            className={`w-8 h-8 rounded flex items-center justify-center cursor-pointer transition ${
              tool === 'draw' ? 'rpg-btn-primary' : 'rpg-btn-ghost text-[#a69b88]'
            }`}
            title={
              role === 'gm'
                ? 'Desenho Tático no Mapa (Tinta Mágica 8s ou Permanente)'
                : 'Tinta Mágica — Desenhar plano tático no mapa (some em 8s)'
            }
          >
            <Pencil className="w-4 h-4" />
          </button>

          {/* GM Tool Category Rail */}
          {role === 'gm' && (() => {
            const isTerrainActive =
              tool === 'terrain-wall' ||
              tool === 'terrain-cover' ||
              tool === 'terrain-difficult' ||
              tool === 'terrain-erase' ||
              tool === 'surface-fire' ||
              tool === 'surface-ice' ||
              tool === 'surface-acid' ||
              tool === 'surface-water' ||
              tool === 'fog-reveal' ||
              tool === 'fog-hide';
            const isSecretsActive = Boolean(secretMarkerKind);
            const gmRailTabs: Array<{
              id: 'aoe' | 'terrain' | 'secrets' | 'monsters-map';
              label: string;
              icon: React.ReactNode;
              hasActiveTool?: boolean;
            }> = [
              {
                id: 'terrain',
                label: 'Terreno, Névoa e Luz',
                icon: <Layers className="w-4 h-4" />,
                hasActiveTool: isTerrainActive || activeMap.fogEnabled || activeMap.darknessEnabled,
              },
              {
                id: 'secrets',
                label: 'Portas, Luzes e Segredos',
                icon: <DoorOpen className="w-4 h-4" />,
                hasActiveTool: isSecretsActive,
              },
              {
                id: 'aoe',
                label: 'Moldes de Área (AoE)',
                icon: <Flame className="w-4 h-4" />,
                hasActiveTool: activeMap.templates.length > 0,
              },
              {
                id: 'monsters-map',
                label: 'Monstros, Mapa e Clima',
                icon: <MapIcon className="w-4 h-4" />,
                hasActiveTool: activeMap.weather !== 'none',
              },
            ];

            return (
              <>
                <div className="w-5 h-px bg-[#b89146]/25 my-0.5" />
                {gmRailTabs.map((t) => {
                  const isOpen = gmDrawerTab === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setGmDrawerTab((curr) => (curr === t.id ? null : t.id))}
                      className={`relative w-8 h-8 rounded flex items-center justify-center cursor-pointer transition ${
                        isOpen
                          ? 'rpg-btn-primary'
                          : t.hasActiveTool
                            ? 'bg-[#221c12] border border-[#b89146]/60 text-[#e8c683]'
                            : 'rpg-btn-ghost text-[#a69b88]'
                      }`}
                      title={t.label}
                    >
                      {t.icon}
                      {t.hasActiveTool && !isOpen && (
                        <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[#d4ad5c]" />
                      )}
                    </button>
                  );
                })}
              </>
            );
          })()}
        </div>

        {/* Compact Tactical Drawing ("Tinta Mágica") Flyout */}
        {tool === 'draw' && !gmDrawerTab && (
          <div className="rpg-glass-panel rpg-grain rounded-lg p-2.5 w-[220px] pointer-events-auto animate-drawer-left space-y-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-display font-bold text-[11px] uppercase tracking-wider text-[#e8c683] flex items-center gap-1.5">
                <Pencil className="w-3.5 h-3.5" /> Tinta Mágica
              </span>
              <button
                type="button"
                onClick={() => setTool('select')}
                className="rpg-card p-0.5 rounded text-[#a69b88] hover:text-[#ece4d5] cursor-pointer"
                title="Voltar para Selecionar"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {role === 'gm' ? (
              <>
                <div className="grid grid-cols-2 gap-1 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setGmDrawPermanent(false)}
                    className={`py-1 rounded font-display font-semibold cursor-pointer transition ${
                      !gmDrawPermanent ? 'rpg-btn-primary' : 'rpg-card text-[#a69b88]'
                    }`}
                  >
                    Temp (8s)
                  </button>
                  <button
                    type="button"
                    onClick={() => setGmDrawPermanent(true)}
                    className={`py-1 rounded font-display font-semibold cursor-pointer transition ${
                      gmDrawPermanent ? 'rpg-btn-primary' : 'rpg-card text-[#a69b88]'
                    }`}
                  >
                    Permanente
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  {['#f59e0b', '#ef4444', '#38bdf8', '#22c55e', '#a855f7', '#f8fafc'].map((col) => (
                    <button
                      key={col}
                      type="button"
                      onClick={() => setGmDrawColor(col)}
                      className={`w-5 h-5 rounded border cursor-pointer transition ${
                        gmDrawColor === col
                          ? 'border-white scale-110 shadow'
                          : 'border-black/60 opacity-75 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: col }}
                      title={`Cor da tinta: ${col}`}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  disabled={totalDrawingsCount === 0}
                  onClick={() => clearMapDrawings(activeMap.id)}
                  className="w-full py-1.5 rounded bg-red-950/75 hover:bg-red-900/90 border border-red-500/40 text-red-200 text-[11px] font-display font-semibold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Limpar Desenhos ({totalDrawingsCount})
                </button>
              </>
            ) : (
              <div className="text-[11px] text-[#c7beae] leading-snug">
                Clique e arraste no mapa para marcar rotas ou alvos na sua cor. Os traços desaparecem sozinhos em <strong>8s</strong>.
              </div>
            )}
          </div>
        )}

        {/* Sleek Matte Obsidian Side Flyout Palette (Opens beside Left Rail) */}
        {role === 'gm' && gmDrawerTab && (
          <div className="rpg-glass-panel rpg-grain rounded-lg w-[284px] max-h-[calc(100vh-165px)] overflow-y-auto pointer-events-auto animate-drawer-left">
            {/* Flyout Header */}
            <div
              className="px-3 py-2 border-b flex items-center justify-between gap-2 bg-[#0d0f16] sticky top-0 z-10"
              style={{ borderColor: 'var(--border-hairline)' }}
            >
              <span className="font-display font-bold text-[11px] uppercase tracking-[0.14em] text-[#e8c683]">
                {gmDrawerTab === 'aoe' && 'Moldes de Área (AoE)'}
                {gmDrawerTab === 'terrain' && 'Terreno, Névoa & Luz'}
                {gmDrawerTab === 'secrets' && 'Portas, Luzes & Segredos'}
                {gmDrawerTab === 'monsters-map' && 'Monstros, Mapa & Clima'}
              </span>
              <button
                type="button"
                onClick={() => setGmDrawerTab(null)}
                className="text-[#a69b88] hover:text-[#ece4d5] p-0.5 rounded cursor-pointer"
                title="Fechar paleta"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="p-3 space-y-3 text-xs">
              {/* FLYOUT 1: AoE */}
              {gmDrawerTab === 'aoe' && (
                <div className="space-y-2.5">
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => addAoETemplate('sphere')}
                      className="rpg-card px-2.5 py-2 rounded text-[11px] font-display font-semibold flex items-center gap-2 cursor-pointer"
                    >
                      <Flame className="w-3.5 h-3.5 text-[#d4ad5c]" />
                      <span>Esfera</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => addAoETemplate('cone')}
                      className="rpg-card px-2.5 py-2 rounded text-[11px] font-display font-semibold flex items-center gap-2 cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-[#d4ad5c]" />
                      <span>Cone</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => addAoETemplate('line')}
                      className="rpg-card px-2.5 py-2 rounded text-[11px] font-display font-semibold flex items-center gap-2 cursor-pointer"
                    >
                      <Ruler className="w-3.5 h-3.5 text-[#d4ad5c]" />
                      <span>Linha</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => addAoETemplate('cube')}
                      className="rpg-card px-2.5 py-2 rounded text-[11px] font-display font-semibold flex items-center gap-2 cursor-pointer"
                    >
                      <Square className="w-3.5 h-3.5 text-[#d4ad5c]" />
                      <span>Cubo</span>
                    </button>
                  </div>
                  {activeMap.templates.length > 0 && (
                    <button
                      type="button"
                      onClick={() => updateActiveMap((m) => ({ ...m, templates: [] }))}
                      className="w-full rpg-card px-2.5 py-1.5 rounded text-[11px] text-[#e07a7d] hover:border-[#9e2427]/60 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Limpar Áreas ({activeMap.templates.length})</span>
                    </button>
                  )}
                </div>
              )}

              {/* FLYOUT 2: TERRAIN, SURFACES, FOG & DARKNESS */}
              {gmDrawerTab === 'terrain' && (
                <>
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-display font-semibold uppercase tracking-[0.14em] text-[#8c8374]">
                      Arquitetura &amp; Cobertura
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(
                        [
                          {
                            id: 'terrain-wall' as const,
                            label: 'Parede',
                            icon: <Square className="w-3.5 h-3.5" />,
                            title: 'Pintar Parede/Pilar (bloqueia movimento, visão e luz)',
                          },
                          {
                            id: 'terrain-cover' as const,
                            label: 'Cobertura',
                            icon: <Shield className="w-3.5 h-3.5" />,
                            title: 'Pintar Cobertura (+2/+5 CA na linha de tiro)',
                          },
                          {
                            id: 'terrain-difficult' as const,
                            label: 'Difícil (2×)',
                            icon: <Footprints className="w-3.5 h-3.5" />,
                            title: 'Pintar Terreno Difícil (custa 3m por quadrado)',
                          },
                          {
                            id: 'terrain-erase' as const,
                            label: 'Apagar',
                            icon: <Eraser className="w-3.5 h-3.5" />,
                            title: 'Apagar Terreno e Superfícies Elementais',
                          },
                        ] as const
                      ).map((tb) => {
                        const active = tool === tb.id;
                        return (
                          <button
                            key={tb.id}
                            type="button"
                            onClick={() => {
                              setSecretMarkerKind(null);
                              setTool(active ? 'select' : tb.id);
                            }}
                            className={`px-2.5 py-1.5 rounded text-[11px] flex items-center gap-1.5 cursor-pointer transition ${
                              active ? 'rpg-btn-primary' : 'rpg-card'
                            }`}
                            title={tb.title}
                          >
                            {tb.icon}
                            <span>{tb.label}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Wall Brush Flexibility: Full / Half / Thin Edge / Diagonal / Pillar + Direction + Transparency */}
                    {tool === 'terrain-wall' && (() => {
                      const shapeCategory = wallBrushShape.startsWith('half-')
                        ? 'half'
                        : wallBrushShape.startsWith('edge-') || wallBrushShape.startsWith('bar-')
                          ? 'edge'
                          : wallBrushShape.startsWith('diag-')
                            ? 'diag'
                            : wallBrushShape === 'pillar'
                              ? 'pillar'
                              : 'full';

                      return (
                        <div className="rpg-well rounded-md p-2.5 space-y-2.5 mt-1.5 border border-[#b89146]/25">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#e8c683]">
                              Formato da Parede
                            </span>
                            {shapeCategory !== 'full' && shapeCategory !== 'pillar' && (
                              <button
                                type="button"
                                onClick={() => setWallBrushShape((prev) => rotateWallShape(prev))}
                                className="px-1.5 py-0.5 rounded rpg-card text-[10px] text-[#e8c683] hover:border-[#d4ad5c]/65 cursor-pointer"
                                title="Girar direção (atalho: tecla R)"
                              >
                                Girar (R)
                              </button>
                            )}
                          </div>

                          {/* Category Pills */}
                          <div className="grid grid-cols-5 gap-1">
                            {(
                              [
                                { id: 'full', label: 'Cheia', def: 'full' as WallCellShape, title: 'Quadrado inteiro (100%)' },
                                { id: 'half', label: 'Meia', def: 'half-top' as WallCellShape, title: 'Meio quadrado (50%) em qualquer lado' },
                                { id: 'edge', label: 'Fina', def: 'edge-top' as WallCellShape, title: 'Borda fina (25%) — permite ficar no quadrado sem cruzar a parede' },
                                { id: 'diag', label: 'Diag.', def: 'diag-tl' as WallCellShape, title: 'Meio quadrado em diagonal (4 cantos)' },
                                { id: 'pillar', label: 'Pilar', def: 'pillar' as WallCellShape, title: 'Coluna de pedra central' },
                              ] as const
                            ).map((cat) => (
                              <button
                                key={cat.id}
                                type="button"
                                onClick={() => setWallBrushShape(cat.def)}
                                title={cat.title}
                                className={`py-1 px-1 rounded text-[10px] font-semibold cursor-pointer transition text-center ${
                                  shapeCategory === cat.id
                                    ? 'rpg-btn-primary'
                                    : 'rpg-card text-[#c5bba8] hover:border-[#d4ad5c]/50'
                                }`}
                              >
                                {cat.label}
                              </button>
                            ))}
                          </div>

                          {/* Direction / Side Controls */}
                          {shapeCategory === 'half' && (
                            <div className="grid grid-cols-4 gap-1">
                              {(
                                [
                                  { id: 'half-top', label: '↑ Cima' },
                                  { id: 'half-bottom', label: '↓ Baixo' },
                                  { id: 'half-left', label: '← Esq.' },
                                  { id: 'half-right', label: '→ Dir.' },
                                ] as const
                              ).map((d) => (
                                <button
                                  key={d.id}
                                  type="button"
                                  onClick={() => setWallBrushShape(d.id)}
                                  className={`py-1 rounded text-[10px] font-semibold cursor-pointer transition ${
                                    wallBrushShape === d.id
                                      ? 'bg-[#2a2112] border border-[#d4ad5c] text-[#f2dba4]'
                                      : 'rpg-card text-[#b8ae9b]'
                                  }`}
                                >
                                  {d.label}
                                </button>
                              ))}
                            </div>
                          )}

                          {shapeCategory === 'edge' && (
                            <div className="grid grid-cols-3 gap-1">
                              {(
                                [
                                  { id: 'edge-top', label: '↑ Topo' },
                                  { id: 'edge-bottom', label: '↓ Base' },
                                  { id: 'edge-left', label: '← Esq.' },
                                  { id: 'edge-right', label: '→ Dir.' },
                                  { id: 'bar-h', label: '━ Meio H' },
                                  { id: 'bar-v', label: '┃ Meio V' },
                                ] as const
                              ).map((d) => (
                                <button
                                  key={d.id}
                                  type="button"
                                  onClick={() => setWallBrushShape(d.id)}
                                  className={`py-1 rounded text-[10px] font-semibold cursor-pointer transition ${
                                    wallBrushShape === d.id
                                      ? 'bg-[#2a2112] border border-[#d4ad5c] text-[#f2dba4]'
                                      : 'rpg-card text-[#b8ae9b]'
                                  }`}
                                >
                                  {d.label}
                                </button>
                              ))}
                            </div>
                          )}

                          {shapeCategory === 'diag' && (
                            <div className="grid grid-cols-4 gap-1">
                              {(
                                [
                                  { id: 'diag-tl', label: '◤ S-E' },
                                  { id: 'diag-tr', label: '◥ S-D' },
                                  { id: 'diag-bl', label: '◣ I-E' },
                                  { id: 'diag-br', label: '◢ I-D' },
                                ] as const
                              ).map((d) => (
                                <button
                                  key={d.id}
                                  type="button"
                                  onClick={() => setWallBrushShape(d.id)}
                                  className={`py-1 rounded text-[10px] font-semibold cursor-pointer transition ${
                                    wallBrushShape === d.id
                                      ? 'bg-[#2a2112] border border-[#d4ad5c] text-[#f2dba4]'
                                      : 'rpg-card text-[#b8ae9b]'
                                  }`}
                                >
                                  {d.label}
                                </button>
                              ))}
                            </div>
                          )}

                          {/* Opacity / Transparency Controls */}
                          <div className="space-y-1.5 pt-1 border-t border-[#b89146]/18">
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="font-semibold text-[#c5bba8]">
                                Opacidade da Parede
                              </span>
                              <span className="font-mono-dice text-[#e8c683]">
                                {Math.round(wallBrushOpacity * 100)}%
                                {wallBrushOpacity === 0 ? ' (Invisível)' : ''}
                              </span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={100}
                              step={5}
                              value={Math.round(wallBrushOpacity * 100)}
                              onChange={(e) => setWallBrushOpacity(Number(e.target.value) / 100)}
                              className="w-full accent-[#d4ad5c] cursor-pointer"
                            />
                            <div className="grid grid-cols-4 gap-1">
                              {[
                                { val: 1, label: 'Sólida' },
                                { val: 0.55, label: 'Meio Tr.' },
                                { val: 0.25, label: 'Sutil' },
                                { val: 0, label: 'Invis.' },
                              ].map((preset) => (
                                <button
                                  key={preset.label}
                                  type="button"
                                  onClick={() => setWallBrushOpacity(preset.val)}
                                  className={`py-0.5 rounded text-[10px] cursor-pointer transition ${
                                    Math.abs(wallBrushOpacity - preset.val) < 0.03
                                      ? 'bg-[#2a2112] border border-[#d4ad5c] text-[#f2dba4] font-semibold'
                                      : 'rpg-card text-[#a69b88]'
                                  }`}
                                >
                                  {preset.label}
                                </button>
                              ))}
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                updateActiveMap((m) => {
                                  const nextMeta: Record<string, WallCellMeta> = {
                                    ...(m.wallMeta || {}),
                                  };
                                  for (const [k, kind] of Object.entries(m.terrainCells || {})) {
                                    if (kind === 'wall') {
                                      nextMeta[k] = {
                                        shape: nextMeta[k]?.shape || 'full',
                                        opacity: wallBrushOpacity,
                                      };
                                    }
                                  }
                                  return { ...m, wallMeta: nextMeta };
                                })
                              }
                              className="w-full py-1 px-2 rounded rpg-card hover:border-[#d4ad5c]/60 text-[10px] text-[#d6ccb8] cursor-pointer transition"
                              title="Atualiza a transparência de todas as paredes já desenhadas neste mapa"
                            >
                              Aplicar {Math.round(wallBrushOpacity * 100)}% em todas as paredes
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-[10px] font-display font-semibold uppercase tracking-[0.14em] text-[#8c8374]">
                      Superfícies Elementais
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(
                        [
                          {
                            id: 'surface-fire' as const,
                            label: 'Fogo',
                            icon: <Flame className="w-3.5 h-3.5 text-[#e07b42]" />,
                            title: 'Superfície de Fogo (dano ao entrar)',
                          },
                          {
                            id: 'surface-ice' as const,
                            label: 'Gelo',
                            icon: <Snowflake className="w-3.5 h-3.5 text-[#7ec4e8]" />,
                            title: 'Superfície de Gelo (Teste de Reflexos ou Caído)',
                          },
                          {
                            id: 'surface-acid' as const,
                            label: 'Ácido',
                            icon: <FlaskConical className="w-3.5 h-3.5 text-[#88cf65]" />,
                            title: 'Superfície de Ácido (dano + Corroído)',
                          },
                          {
                            id: 'surface-water' as const,
                            label: 'Água',
                            icon: <Droplets className="w-3.5 h-3.5 text-[#5ea1e0]" />,
                            title: 'Superfície de Água (aplica Molhado)',
                          },
                        ] as const
                      ).map((tb) => {
                        const active = tool === tb.id;
                        return (
                          <button
                            key={tb.id}
                            type="button"
                            onClick={() => {
                              setSecretMarkerKind(null);
                              setTool(active ? 'select' : tb.id);
                            }}
                            className={`px-2.5 py-1.5 rounded text-[11px] flex items-center gap-1.5 cursor-pointer transition ${
                              active ? 'rpg-btn-primary' : 'rpg-card'
                            }`}
                            title={tb.title}
                          >
                            {tb.icon}
                            <span>{tb.label}</span>
                          </button>
                        );
                      })}
                    </div>

                    {(tool === 'surface-fire' ||
                      tool === 'surface-ice' ||
                      tool === 'surface-acid' ||
                      tool === 'surface-water') && (
                      <div className="rpg-well rounded p-2 grid grid-cols-3 gap-1.5 text-[10px]">
                        <label className="space-y-0.5">
                          <span className="text-[#a69b88] block">Dano Fogo</span>
                          <input
                            value={activeMap.surfaceConfig?.fireDamageFormula ?? '1d6'}
                            onChange={(e) =>
                              updateActiveMap((m) => ({
                                ...m,
                                surfaceConfig: {
                                  ...(m.surfaceConfig || {}),
                                  fireDamageFormula: e.target.value,
                                },
                              }))
                            }
                            className="rpg-input w-full py-0.5 px-1 text-[10px] font-mono-dice text-center"
                          />
                        </label>
                        <label className="space-y-0.5">
                          <span className="text-[#a69b88] block">CD Gelo</span>
                          <input
                            type="number"
                            min={1}
                            max={35}
                            value={activeMap.surfaceConfig?.iceSaveDc ?? 12}
                            onChange={(e) =>
                              updateActiveMap((m) => ({
                                ...m,
                                surfaceConfig: {
                                  ...(m.surfaceConfig || {}),
                                  iceSaveDc: Math.max(1, Number(e.target.value) || 12),
                                },
                              }))
                            }
                            className="rpg-input w-full py-0.5 px-1 text-[10px] font-mono-dice text-center"
                          />
                        </label>
                        <label className="space-y-0.5">
                          <span className="text-[#a69b88] block">Dano Ácido</span>
                          <input
                            value={activeMap.surfaceConfig?.acidDamageFormula ?? '1d4'}
                            onChange={(e) =>
                              updateActiveMap((m) => ({
                                ...m,
                                surfaceConfig: {
                                  ...(m.surfaceConfig || {}),
                                  acidDamageFormula: e.target.value,
                                },
                              }))
                            }
                            className="rpg-input w-full py-0.5 px-1 text-[10px] font-mono-dice text-center"
                          />
                        </label>
                      </div>
                    )}
                  </div>

                  <div className="h-px bg-[#b89146]/18" />

                  <div className="space-y-1.5">
                    <div className="text-[10px] font-display font-semibold uppercase tracking-[0.14em] text-[#8c8374]">
                      Iluminação &amp; Névoa de Guerra
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        updateActiveMap((m) => ({ ...m, darknessEnabled: !m.darknessEnabled }))
                      }
                      className={`w-full px-2.5 py-2 rounded text-[11px] font-semibold flex items-center justify-between cursor-pointer transition border ${
                        activeMap.darknessEnabled
                          ? 'bg-[#171a2d] border-[#5f78c4]/70 text-[#cfd9f8]'
                          : 'rpg-card'
                      }`}
                      title="Escuridão Total com visão circular suave e sombras reais de parede"
                    >
                      <span className="flex items-center gap-2">
                        <Moon className="w-3.5 h-3.5 text-[#8ea4e6]" />
                        <span>Escuridão Dinâmica</span>
                      </span>
                      <span className="text-[10px] font-mono-dice opacity-80">
                        {activeMap.darknessEnabled ? 'ON' : 'OFF'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setTool('select');
                        setSecretMarkerKind((curr) => (curr === 'light' ? null : 'light'));
                      }}
                      className={`w-full px-2.5 py-2 rounded text-[11px] font-semibold flex items-center justify-between cursor-pointer transition ${
                        secretMarkerKind === 'light' ? 'rpg-btn-primary' : 'rpg-card'
                      }`}
                      title="Clique no mapa para posicionar um Ponto de Luz fixo"
                    >
                      <span className="flex items-center gap-2">
                        <Lightbulb className="w-3.5 h-3.5" />
                        <span>Posicionar Ponto de Luz</span>
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        updateActiveMap((m) => ({ ...m, fogEnabled: !m.fogEnabled }))
                      }
                      className={`w-full px-2.5 py-2 rounded text-[11px] font-semibold flex items-center justify-between cursor-pointer transition ${
                        activeMap.fogEnabled ? 'rpg-btn-crimson' : 'rpg-card'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        {activeMap.fogEnabled ? (
                          <EyeOff className="w-3.5 h-3.5" />
                        ) : (
                          <Eye className="w-3.5 h-3.5" />
                        )}
                        <span>Névoa de Guerra</span>
                      </span>
                      <span className="text-[10px] font-mono-dice opacity-85">
                        {activeMap.fogEnabled ? 'ON' : 'OFF'}
                      </span>
                    </button>

                    {activeMap.fogEnabled && (
                      <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                        <button
                          type="button"
                          onClick={() => setTool(tool === 'fog-reveal' ? 'select' : 'fog-reveal')}
                          className={`px-2 py-1.5 rounded text-[11px] cursor-pointer ${
                            tool === 'fog-reveal' ? 'rpg-btn-primary' : 'rpg-card'
                          }`}
                        >
                          Revelar Área
                        </button>
                        <button
                          type="button"
                          onClick={() => setTool(tool === 'fog-hide' ? 'select' : 'fog-hide')}
                          className={`px-2 py-1.5 rounded text-[11px] cursor-pointer ${
                            tool === 'fog-hide' ? 'rpg-btn-primary' : 'rpg-card'
                          }`}
                        >
                          Ocultar Área
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* FLYOUT 3: DOORS, LIGHTS & SECRETS */}
              {gmDrawerTab === 'secrets' && (
                <div className="space-y-2.5">
                  <p className="text-[11px] text-[#a69b88] leading-snug">
                    Escolha um elemento abaixo e clique em qualquer célula do mapa. Portas podem ser colocadas sobre paredes.
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(
                      [
                        {
                          kind: 'door' as const,
                          label: 'Porta',
                          icon: <DoorOpen className="w-3.5 h-3.5" />,
                          title: 'Colocar Porta (funciona inclusive sobre paredes)',
                        },
                        {
                          kind: 'light' as const,
                          label: 'Ponto de Luz',
                          icon: <Lightbulb className="w-3.5 h-3.5" />,
                          title: 'Colocar fonte de luz estática no mapa',
                        },
                        {
                          kind: 'chest' as const,
                          label: 'Baú',
                          icon: <Package className="w-3.5 h-3.5" />,
                          title: 'Esconder Baú de saque',
                        },
                        {
                          kind: 'trap' as const,
                          label: 'Armadilha',
                          icon: <AlertTriangle className="w-3.5 h-3.5" />,
                          title: 'Esconder Armadilha automática',
                        },
                        {
                          kind: 'item' as const,
                          label: 'Item',
                          icon: <Sparkles className="w-3.5 h-3.5" />,
                          title: 'Esconder Item solto',
                        },
                        {
                          kind: 'secret' as const,
                          label: 'Passagem',
                          icon: <EyeOff className="w-3.5 h-3.5" />,
                          title: 'Esconder Passagem Secreta entre mapas',
                        },
                      ] as const
                    ).map((btn) => {
                      const active = secretMarkerKind === btn.kind;
                      return (
                        <button
                          key={btn.kind}
                          type="button"
                          onClick={() => {
                            setTool('select');
                            setSecretMarkerKind((curr) => (curr === btn.kind ? null : btn.kind));
                          }}
                          className={`px-2.5 py-2 rounded text-[11px] flex items-center gap-2 cursor-pointer transition ${
                            active ? 'rpg-btn-primary' : 'rpg-card'
                          }`}
                          title={btn.title}
                        >
                          {btn.icon}
                          <span className="truncate">{btn.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  {secretMarkerKind && (
                    <button
                      type="button"
                      onClick={() => setSecretMarkerKind(null)}
                      className="w-full rpg-card px-2.5 py-1.5 rounded text-[11px] text-[#e07a7d] cursor-pointer"
                    >
                      Cancelar Posicionamento
                    </button>
                  )}
                </div>
              )}

              {/* FLYOUT 4: MONSTERS, MAPS, GRID & ATMOSPHERE */}
              {gmDrawerTab === 'monsters-map' && (
                <>
                  {/* Spawn Monsters & Party */}
                  <div className="space-y-2">
                    <div className="text-[10px] font-display font-semibold uppercase tracking-[0.14em] text-[#8c8374]">
                      Criaturas &amp; Grupo
                    </div>
                    <select
                      value={spawnMonsterId}
                      onChange={(e) => setSpawnMonsterId(e.target.value)}
                      className="rpg-input w-full text-xs py-1.5"
                    >
                      {campaign.compendium.monsters.map((mon) => (
                        <option key={mon.id} value={mon.id}>
                          {mon.name}
                        </option>
                      ))}
                    </select>
                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        type="button"
                        onClick={handleSpawnMonster}
                        className="rpg-btn-crimson px-2 py-1.5 rounded text-[11px] flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Adicionar</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSpawnHidden((v) => !v)}
                        className={`px-2 py-1.5 rounded text-[11px] flex items-center justify-center gap-1 cursor-pointer ${
                          spawnHidden ? 'rpg-btn-primary' : 'rpg-card'
                        }`}
                        title="Alternar modo Emboscada (token nasce invisível aos jogadores)"
                      >
                        {spawnHidden ? (
                          <EyeOff className="w-3.5 h-3.5" />
                        ) : (
                          <Eye className="w-3.5 h-3.5" />
                        )}
                        <span>{spawnHidden ? 'Oculto' : 'Visível'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSpawnHideName((v) => !v)}
                        className={`px-2 py-1.5 rounded text-[11px] flex items-center justify-center gap-1 cursor-pointer ${
                          spawnHideName
                            ? 'bg-purple-950/85 border border-purple-400/70 text-purple-200 font-bold'
                            : 'rpg-card'
                        }`}
                        title="Invocar criatura com o nome oculto ('???') para os jogadores"
                      >
                        <span>{spawnHideName ? 'Nome: ???' : 'Nome: OK'}</span>
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={handleSyncPartyTokens}
                        className="rpg-card px-2 py-1.5 rounded text-[11px] flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Users className="w-3.5 h-3.5 text-[#d4ad5c]" />
                        <span>Puxar Heróis</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updateCampaign((prev) => ({
                            ...prev,
                            settings: {
                              ...prev.settings,
                              showEnemyAcToPlayers: !prev.settings.showEnemyAcToPlayers,
                            },
                          }))
                        }
                        className={`px-2 py-1.5 rounded text-[11px] flex items-center justify-center gap-1.5 cursor-pointer ${
                          campaign.settings.showEnemyAcToPlayers ? 'rpg-btn-primary' : 'rpg-card'
                        }`}
                        title="Mostrar ou ocultar CA e PV exatos de inimigos para jogadores"
                      >
                        <Shield className="w-3.5 h-3.5" />
                        <span>CA: {campaign.settings.showEnemyAcToPlayers ? 'Visível' : 'Oculta'}</span>
                      </button>
                    </div>
                  </div>

                  <div className="h-px bg-[#b89146]/18" />

                  {/* Map Management */}
                  <div className="space-y-2">
                    <div className="text-[10px] font-display font-semibold uppercase tracking-[0.14em] text-[#8c8374]">
                      Mapa &amp; Grade
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={createNewMap}
                        className="rpg-card px-2 py-1.5 rounded text-[11px] flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5 text-[#d4ad5c]" />
                        <span>Novo Mapa</span>
                      </button>
                      <FileUploadButton
                        accept="image/*"
                        label="Imagem"
                        onUploaded={applyMapImageWithAdaptiveGrid}
                        className="rounded justify-center"
                      />
                    </div>

                    <div className="rpg-well rounded p-2.5 space-y-2">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-[#a69b88]">Colunas do Grid (até 300×300)</span>
                        <span className="font-mono-dice font-semibold text-[#e8c683]">
                          {activeMap.gridWidth} × {activeMap.gridHeight}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={8}
                          max={300}
                          value={activeMap.gridWidth}
                          onChange={(e) => {
                            const nextCols = Math.max(8, Math.min(300, Number(e.target.value) || 22));
                            updateActiveMap((m) => {
                              if (m.backgroundNaturalWidth && m.backgroundNaturalHeight) {
                                const nextRows = Math.max(
                                  6,
                                  Math.min(
                                    300,
                                    Math.round(
                                      nextCols * (m.backgroundNaturalHeight / m.backgroundNaturalWidth)
                                    )
                                  )
                                );
                                return { ...m, gridWidth: nextCols, gridHeight: nextRows };
                              }
                              return { ...m, gridWidth: nextCols };
                            });
                          }}
                          className="flex-1 accent-[#d4ad5c] cursor-pointer"
                        />
                        <input
                          type="number"
                          min={8}
                          max={300}
                          value={activeMap.gridWidth}
                          onChange={(e) => {
                            const nextCols = Math.max(8, Math.min(300, Number(e.target.value) || 22));
                            updateActiveMap((m) => {
                              if (m.backgroundNaturalWidth && m.backgroundNaturalHeight) {
                                const nextRows = Math.max(
                                  6,
                                  Math.min(
                                    300,
                                    Math.round(
                                      nextCols * (m.backgroundNaturalHeight / m.backgroundNaturalWidth)
                                    )
                                  )
                                );
                                return { ...m, gridWidth: nextCols, gridHeight: nextRows };
                              }
                              return { ...m, gridWidth: nextCols };
                            });
                          }}
                          className="rpg-input w-16 py-0.5 text-center font-mono-dice text-xs"
                          title="Número exato de colunas (8 a 300)"
                        />
                      </div>
                      {!activeMap.backgroundUrl && (
                        <div className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="text-[#a69b88]">Linhas (6 a 300)</span>
                          <input
                            type="number"
                            min={6}
                            max={300}
                            value={activeMap.gridHeight}
                            onChange={(e) => {
                              const nextRows = Math.max(6, Math.min(300, Number(e.target.value) || 14));
                              updateActiveMap((m) => ({ ...m, gridHeight: nextRows }));
                            }}
                            className="rpg-input w-16 py-0.5 text-center font-mono-dice text-xs"
                          />
                        </div>
                      )}
                      {activeMap.backgroundUrl && (
                        <button
                          type="button"
                          onClick={() =>
                            updateActiveMap((m) => ({
                              ...m,
                              backgroundUrl: '',
                              backgroundNaturalWidth: undefined,
                              backgroundNaturalHeight: undefined,
                            }))
                          }
                          className="w-full rpg-card px-2 py-1 rounded text-[11px] text-[#e07a7d] cursor-pointer"
                        >
                          Remover Imagem de Fundo
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="h-px bg-[#b89146]/18" />

                  {/* Atmosphere: Theme, Weather & Time of Day */}
                  <div className="space-y-2">
                    <div className="text-[10px] font-display font-semibold uppercase tracking-[0.14em] text-[#8c8374]">
                      Atmosfera &amp; Clima
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <label className="space-y-1">
                        <span className="text-[10px] text-[#a69b88] block">Cenário</span>
                        <select
                          value={activeMap.themePreset}
                          onChange={(e) =>
                            updateActiveMap((m) => ({
                              ...m,
                              themePreset: e.target.value as TacticalMap['themePreset'],
                            }))
                          }
                          className="rpg-input w-full py-1 text-[11px]"
                        >
                          <option value="crypt">Cripta Antiga</option>
                          <option value="tavern">Taverna</option>
                          <option value="forest">Floresta</option>
                          <option value="desert">Deserto</option>
                          <option value="castle">Castelo Real</option>
                          <option value="void">Astral / Vazio</option>
                          <option value="volcano">Vulcão / Magma</option>
                          <option value="glacier">Geleira / Neve</option>
                          <option value="swamp">Pântano Sombrio</option>
                          <option value="arena">Coliseu / Arena</option>
                          <option value="abyss">Abismo Demoníaco</option>
                          <option value="city">Rua Medieval / Cidade</option>
                          <option value="ocean">Oceano / Alto-Mar</option>
                          <option value="sanctuary">Santuário Celestial</option>
                        </select>
                      </label>
                      <label className="space-y-1">
                        <span className="text-[10px] text-[#a69b88] block">Ciclo Solar</span>
                        <select
                          value={activeMap.timeOfDay || 'none'}
                          onChange={(e) =>
                            updateActiveMap((m) => ({
                              ...m,
                              timeOfDay: e.target.value as TacticalMap['timeOfDay'],
                            }))
                          }
                          className="rpg-input w-full py-1 text-[11px]"
                        >
                          <option value="none">Interno</option>
                          <option value="dawn">Amanhecer</option>
                          <option value="day">Dia</option>
                          <option value="dusk">Crepúsculo</option>
                          <option value="night">Noite</option>
                          <option value="bloodmoon">Lua de Sangue</option>
                          <option value="toxic">Névoa Tóxica</option>
                        </select>
                      </label>
                    </div>

                    <div className="space-y-1.5">
                      <label className="space-y-1 block">
                        <span className="text-[10px] text-[#a69b88] flex items-center gap-1">
                          <CloudRain className="w-3 h-3" /> Clima
                        </span>
                        <select
                          value={activeMap.weather}
                          onChange={(e) =>
                            updateActiveMap((m) => ({
                              ...m,
                              weather: e.target.value as TacticalMap['weather'],
                            }))
                          }
                          className="rpg-input w-full py-1 text-[11px]"
                        >
                          <option value="none">Limpo</option>
                          <option value="rain">Chuva</option>
                          <option value="embers">Brasas</option>
                          <option value="snow">Neve</option>
                          <option value="mist">Névoa</option>
                        </select>
                      </label>
                      {activeMap.weather !== 'none' && (
                        <label
                          className="flex items-center gap-2 text-[11px] cursor-pointer px-2.5 py-1.5 rounded rpg-well text-[#c8daf0]"
                          title="Chuva aplica Molhado e reduz luz de tochas; Névoa limita visão a 6m"
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(activeMap.weatherEffectsEnabled)}
                            onChange={(e) =>
                              updateActiveMap((m) => ({
                                ...m,
                                weatherEffectsEnabled: e.target.checked,
                              }))
                            }
                            className="accent-[#d4ad5c]"
                          />
                          <span>Ativar Efeito Tático do Clima</span>
                        </label>
                      )}
                      {(activeMap.battleScars?.length || 0) > 0 && (
                        <button
                          type="button"
                          onClick={() => updateActiveMap((m) => ({ ...m, battleScars: [] }))}
                          className="w-full py-1.5 px-2.5 rounded rpg-card border-red-500/40 text-[11px] font-display font-bold text-red-200 hover:border-red-400 flex items-center justify-center gap-1.5 cursor-pointer"
                          title="Remover crateras, marcas de Black Flash e sangue do chão deste mapa"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Limpar Marcas de Batalha ({activeMap.battleScars?.length})</span>
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </aside>

      {/* Active Domain Expansion Status Bar (Top Center — Caster/GM can dismiss) */}
      {campaign.activeDomain && campaign.activeDomain.mapId === activeMap.id && (
        <div
          className="fixed top-14 left-1/2 -translate-x-1/2 z-30 pointer-events-auto animate-ui-enter"
        >
          <div
            className="rpg-glass-panel rounded-md px-3.5 py-1.5 flex items-center gap-2.5 shadow-2xl border"
            style={{
              borderColor: `${campaign.activeDomain.color}99`,
              boxShadow: `0 8px 28px rgba(0,0,0,0.85), 0 0 22px ${campaign.activeDomain.color}40`,
            }}
          >
            <Sparkles className="w-3.5 h-3.5 shrink-0" style={{ color: campaign.activeDomain.color }} />
            <div className="flex items-center gap-2 text-xs">
              <span
                className="text-[9px] font-display font-black uppercase tracking-[0.18em]"
                style={{ color: campaign.activeDomain.color }}
              >
                Domínio
              </span>
              <span className="font-display font-bold text-[#f4ead7]">
                {campaign.activeDomain.name}
              </span>
              <span className="text-[10px] text-[#a69b88] hidden sm:inline">
                por{' '}
                {maskHiddenNameForRole(
                  campaign.activeDomain.casterName,
                  role,
                  campaign,
                  campaign.activeDomain.casterTokenId
                )}
              </span>
            </div>
            {(role === 'gm' ||
              (myCharacter && campaign.activeDomain.casterCharacterId === myCharacter.id)) && (
              <button
                type="button"
                onClick={dismissDomainExpansion}
                className="px-2 py-0.5 rounded bg-black/55 hover:bg-red-950/75 border border-white/15 hover:border-red-400/55 text-[10px] font-display font-semibold text-[#d9d0c0] hover:text-red-200 cursor-pointer transition"
                title="Dissipar Expansão de Domínio"
              >
                Dissipar
              </button>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          BOTTOM-LEFT COMPACT MAP SWITCHER, VIEW MODE, CAMERA & ZOOM BAR
         ===================================================================== */}
      <div className="fixed bottom-3 left-3 z-25 flex flex-wrap items-center gap-1.5 pointer-events-auto select-none max-w-[calc(100vw-24px)]">
        <div className="rpg-rail rounded-md h-8 px-2 flex items-center gap-1.5">
          <MapIcon className="w-3.5 h-3.5 text-[#d4ad5c] shrink-0" />
          {role === 'gm' ? (
            <select
              value={activeMap.id}
              onChange={(e) => {
                const nextId = e.target.value;
                updateCampaign((prev) => {
                  const curMode = prev.settings.mapViewMode || 'follow-gm';
                  return {
                    ...prev,
                    activeMapId: nextId,
                    settings:
                      curMode === 'follow-gm'
                        ? { ...prev.settings, playerVisibleMapId: nextId }
                        : {
                            ...prev.settings,
                            playerVisibleMapId:
                              prev.settings.playerVisibleMapId || prev.activeMapId,
                          },
                  };
                });
              }}
              className="bg-transparent text-[11px] font-display font-semibold text-[#ece4d5] outline-none cursor-pointer max-w-[140px] truncate"
              title="Alternar mapa do Mestre"
            >
              {campaign.maps.map((m) => (
                <option key={m.id} value={m.id} className="bg-[#11131b] text-[#ece4d5]">
                  {m.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-[11px] font-display font-semibold text-[#ece4d5] truncate max-w-[140px]">
              {activeMap.name}
            </span>
          )}
        </div>

        {/* GM Map View Mode Controls (Seguir Mestre / Mapa do Token / Mestre Espiar + Puxar Todos) */}
        {role === 'gm' && (() => {
          const viewMode = campaign.settings.mapViewMode || 'follow-gm';
          const playerMapId = campaign.settings.playerVisibleMapId || campaign.activeMapId;
          const isGmPeekingOtherMap = viewMode === 'gm-peek' && playerMapId !== activeMap.id;
          const otherMapsWithHeroes = campaign.maps.filter(
            (m) => m.id !== activeMap.id && m.tokens.some((t) => t.type === 'character')
          );
          return (
            <div className="rpg-rail rounded-md h-8 px-1.5 flex items-center gap-1">
              <Eye
                className={`w-3.5 h-3.5 shrink-0 ${
                  viewMode === 'gm-peek'
                    ? 'text-amber-300'
                    : viewMode === 'token-map'
                      ? 'text-cyan-300'
                      : 'text-[#86d9a8]'
                }`}
              />
              <select
                value={viewMode}
                onChange={(e) => {
                  const nextMode = e.target.value as 'follow-gm' | 'token-map' | 'gm-peek';
                  updateCampaign((prev) => ({
                    ...prev,
                    settings: {
                      ...prev.settings,
                      mapViewMode: nextMode,
                      playerVisibleMapId:
                        nextMode === 'follow-gm'
                          ? prev.activeMapId
                          : prev.settings.playerVisibleMapId || prev.activeMapId,
                    },
                  }));
                }}
                className="bg-transparent text-[10px] font-display font-semibold text-[#ece4d5] outline-none cursor-pointer"
                title={
                  viewMode === 'follow-gm'
                    ? 'Seguir Mestre: todos os jogadores veem o mapa que o Mestre selecionou (mesmo com o token em outro mapa)'
                    : viewMode === 'token-map'
                      ? 'Mapa do Token: cada jogador vê automaticamente o mapa onde o seu token está (ideal para grupo separado!)'
                      : 'Mestre Espiar: o Mestre navega livremente por outros mapas sem puxar os jogadores do mapa atual deles'
                }
              >
                <option value="follow-gm" className="bg-[#11131b] text-[#ece4d5]">
                  Seguir Mestre
                </option>
                <option value="token-map" className="bg-[#11131b] text-[#ece4d5]">
                  Mapa do Token
                </option>
                <option value="gm-peek" className="bg-[#11131b] text-[#ece4d5]">
                  Mestre Espiar
                </option>
              </select>
              {(isGmPeekingOtherMap || viewMode !== 'follow-gm') && (
                <button
                  type="button"
                  onClick={() =>
                    updateCampaign((prev) => ({
                      ...prev,
                      settings: {
                        ...prev.settings,
                        mapViewMode: 'follow-gm',
                        playerVisibleMapId: activeMap.id,
                      },
                    }))
                  }
                  className="px-1.5 py-0.5 rounded bg-amber-950/80 border border-amber-400/55 text-[10px] font-display font-bold text-amber-200 hover:bg-amber-900/80 cursor-pointer whitespace-nowrap"
                  title="Mostrar este mapa para todos os jogadores agora (ativa Seguir Mestre)"
                >
                  Mostrar a Todos
                </button>
              )}
              {otherMapsWithHeroes.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    otherMapsWithHeroes.forEach((srcMap) => {
                      moveTokensToMap(srcMap.id, activeMap.id, 'all-heroes');
                    });
                  }}
                  className="px-1.5 py-0.5 rounded bg-cyan-950/80 border border-cyan-400/55 text-[10px] font-display font-bold text-cyan-200 hover:bg-cyan-900/80 cursor-pointer whitespace-nowrap"
                  title="Trazer todos os tokens de heróis que estão em outros mapas para este mapa"
                >
                  Trazer Tokens
                </button>
              )}
            </div>
          );
        })()}

        {/* GM Player Radar by Map (1-click Locate, Bring Individual Hero, or Send to Any Map) */}
        {role === 'gm' && (() => {
          const heroLocations = campaign.characters.map((ch) => {
            let heroMap: (typeof campaign.maps)[number] | undefined;
            let heroToken: (typeof activeMap.tokens)[number] | undefined;
            for (const m of campaign.maps) {
              const found = m.tokens.find(
                (t) => t.type === 'character' && t.referenceId === ch.id
              );
              if (found) {
                heroMap = m;
                heroToken = found;
                break;
              }
            }
            const isOnline = connectedPlayers.some(
              (p) =>
                p.role !== 'gm' &&
                (p.characterId === ch.id ||
                  (Boolean(ch.ownerPlayerId) && p.playerId === ch.ownerPlayerId))
            );
            return { ch, heroMap, heroToken, isOnline };
          });
          const heroesAwayCount = heroLocations.filter(
            (x) => x.heroMap && x.heroMap.id !== activeMap.id
          ).length;
          const onlineHeroCount = heroLocations.filter((x) => x.isOnline).length;
          return (
            <div ref={playerRadarRef} className="relative">
              <button
                type="button"
                onClick={() => setShowPlayerRadar((v) => !v)}
                className={`rpg-rail rounded-md h-8 px-2 flex items-center gap-1.5 text-[10px] font-display font-semibold cursor-pointer transition ${
                  showPlayerRadar
                    ? 'border-[#d4ad5c]/80 text-[#f3dfb7]'
                    : 'text-[#ece4d5] hover:border-[#d4ad5c]/50'
                }`}
                title="Radar de Jogadores: veja em qual mapa cada herói está, foque a câmera ou mova individualmente"
              >
                <Navigation
                  className={`w-3.5 h-3.5 shrink-0 ${
                    heroesAwayCount > 0 ? 'text-cyan-300' : 'text-[#d4ad5c]'
                  }`}
                />
                <span>Radar</span>
                {heroesAwayCount > 0 ? (
                  <span className="px-1.5 py-0.2 rounded-full bg-cyan-950/90 border border-cyan-400/55 text-cyan-200 text-[9px] font-mono-dice font-bold leading-4">
                    {heroesAwayCount} fora
                  </span>
                ) : (
                  <span className="text-[9px] font-mono-dice text-[#9d9382]">
                    {campaign.characters.length}
                  </span>
                )}
              </button>

              {showPlayerRadar && (
                <div className="absolute bottom-10 left-0 w-[350px] max-w-[calc(100vw-24px)] rpg-glass-panel rounded-lg p-2.5 z-50 shadow-2xl border border-[#d4ad5c]/40 space-y-2 animate-popover">
                  <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-white/10">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-[11px] font-display font-bold text-[#f0dcb4]">
                        <Navigation className="w-3.5 h-3.5 text-[#d4ad5c] shrink-0" />
                        <span>Radar de Jogadores</span>
                      </div>
                      <div className="text-[10px] text-[#9b9180] truncate">
                        {onlineHeroCount} online • Mapa atual: {activeMap.name}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowPlayerRadar(false)}
                      className="w-6 h-6 rounded flex items-center justify-center text-[#9b9180] hover:text-[#ece4d5] hover:bg-white/10 cursor-pointer"
                      title="Fechar Radar"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {heroLocations.length === 0 ? (
                    <div className="py-4 text-center text-[11px] text-[#8f8574]">
                      Nenhum herói cadastrado nesta campanha.
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-[50vh] overflow-y-auto pr-0.5">
                      {heroLocations.map(({ ch, heroMap, heroToken, isOnline }) => {
                        const isHere = heroMap?.id === activeMap.id;
                        return (
                          <div
                            key={ch.id}
                            className="rounded-md bg-black/35 border border-white/10 px-2 py-1.5 space-y-1.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span
                                  className={`w-2 h-2 rounded-full shrink-0 ${
                                    isOnline
                                      ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]'
                                      : 'bg-zinc-600'
                                  }`}
                                  title={isOnline ? 'Jogador online' : 'Offline'}
                                />
                                <span
                                  className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/30"
                                  style={{ backgroundColor: ch.playerColor || ch.tokenColor || '#d4ad5c' }}
                                />
                                <span className="text-[11px] font-semibold text-[#ece4d5] truncate">
                                  {ch.name}
                                </span>
                              </div>
                              <span
                                className={`text-[9px] font-display font-bold px-1.5 py-0.5 rounded border shrink-0 max-w-[130px] truncate ${
                                  isHere
                                    ? 'bg-emerald-950/75 border-emerald-400/45 text-emerald-200'
                                    : heroMap
                                      ? 'bg-cyan-950/75 border-cyan-400/45 text-cyan-200'
                                      : 'bg-amber-950/70 border-amber-400/40 text-amber-200'
                                }`}
                                title={heroMap ? `Mapa: ${heroMap.name}` : 'Sem token posicionado'}
                              >
                                {isHere ? 'Mapa Atual' : heroMap ? heroMap.name : 'Sem token'}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5">
                              {heroMap && heroToken && (
                                <button
                                  type="button"
                                  onClick={() => focusHeroInRadar(ch.id, heroMap.id, heroToken.id)}
                                  className="px-2 py-0.5 rounded bg-[#211b12] border border-[#d4ad5c]/45 text-[10px] font-display font-semibold text-[#ecd5a4] hover:bg-[#2f2517] flex items-center gap-1 cursor-pointer shrink-0"
                                  title={
                                    isHere
                                      ? `Centralizar câmera em ${ch.name}`
                                      : `Ir para o mapa "${heroMap.name}" e focar em ${ch.name}`
                                  }
                                >
                                  <Crosshair className="w-3 h-3" />
                                  <span>{isHere ? 'Focar' : 'Ir'}</span>
                                </button>
                              )}

                              {!isHere && (
                                <button
                                  type="button"
                                  onClick={() => moveOrPlaceHeroOnMap(ch.id, activeMap.id)}
                                  className="px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-400/50 text-[10px] font-display font-semibold text-cyan-200 hover:bg-cyan-900/80 flex items-center gap-1 cursor-pointer shrink-0"
                                  title={
                                    heroToken
                                      ? `Trazer apenas ${ch.name} para "${activeMap.name}"`
                                      : `Colocar token de ${ch.name} em "${activeMap.name}"`
                                  }
                                >
                                  <MapPin className="w-3 h-3" />
                                  <span>{heroToken ? 'Trazer' : 'Colocar'}</span>
                                </button>
                              )}

                              {campaign.maps.length > 1 && (
                                <select
                                  value={heroMap?.id || ''}
                                  onChange={(e) => {
                                    const destId = e.target.value;
                                    if (destId) moveOrPlaceHeroOnMap(ch.id, destId);
                                  }}
                                  className="ml-auto bg-black/55 border border-white/15 rounded px-1.5 py-0.5 text-[10px] text-[#d8cfbe] outline-none cursor-pointer max-w-[135px] truncate"
                                  title={`Enviar ${ch.name} para outro mapa`}
                                >
                                  {!heroMap && (
                                    <option value="" className="bg-[#11131b]">
                                      Enviar para...
                                    </option>
                                  )}
                                  {campaign.maps.map((m) => (
                                    <option key={m.id} value={m.id} className="bg-[#11131b] text-[#ece4d5]">
                                      {m.id === heroMap?.id ? `• ${m.name}` : `→ ${m.name}`}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* GM Quick Skill Check Prompt Button ("Pedir Teste" — Targeted, Hidden DC, Group Check) */}
        {role === 'gm' && (() => {
          const mapHeroIds = activeMap.tokens
            .filter((t) => t.type === 'character' && t.referenceId)
            .map((t) => t.referenceId!);
          const triggerQuickCheck = () => {
            const sk = campaign.compendium.skills.find((s) => s.id === quickCheckSkillId);
            const at = campaign.compendium.attributes.find((a) => a.id === quickCheckSkillId);
            const label = sk?.name || at?.name || quickCheckSkillId;
            let targetIds: string[] | undefined;
            let scopeLabel = 'Todos';
            if (quickCheckTargetMode === 'map') {
              targetIds = mapHeroIds.length > 0 ? mapHeroIds : undefined;
              scopeLabel = `Mapa Atual (${mapHeroIds.length || campaign.characters.length})`;
            } else if (quickCheckTargetMode === 'custom') {
              targetIds = quickCheckHeroIds.length > 0 ? quickCheckHeroIds : undefined;
              scopeLabel =
                quickCheckHeroIds.length > 0
                  ? `${quickCheckHeroIds.length} ${quickCheckHeroIds.length === 1 ? 'Herói' : 'Heróis'}`
                  : 'Todos';
            } else {
              targetIds = campaign.characters.map((c) => c.id);
              scopeLabel = `Todos (${campaign.characters.length})`;
            }
            requestSkillCheck(quickCheckSkillId, label, Math.max(1, quickCheckDc || 10), {
              targetCharacterIds: targetIds,
              targetScopeLabel: scopeLabel,
              hideDc: quickCheckHideDc,
              isGroupCheck: quickCheckIsGroup,
            });
            setShowQuickCheck(false);
          };

          return (
            <div ref={quickCheckRef} className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowPlayerRadar(false);
                  setShowQuickCheck((v) => !v);
                }}
                className={`rpg-rail rounded-md h-8 px-2 flex items-center gap-1.5 text-[10px] font-display font-semibold cursor-pointer transition ${
                  showQuickCheck
                    ? 'border-[#d4ad5c]/80 text-[#f3dfb7]'
                    : 'text-[#ece4d5] hover:border-[#d4ad5c]/50'
                }`}
                title="Pedir Teste de Perícia, Resistência ou Atributo direto na tela dos jogadores"
              >
                <Dices className="w-3.5 h-3.5 text-[#d4ad5c] shrink-0" />
                <span>Pedir Teste</span>
              </button>

              {showQuickCheck && (
                <div className="absolute bottom-10 left-0 w-[330px] max-w-[calc(100vw-24px)] rpg-glass-panel rounded-lg p-3 z-50 shadow-2xl border border-[#d4ad5c]/40 space-y-2.5 text-xs animate-popover">
                  <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-white/10">
                    <div className="flex items-center gap-1.5 text-[11px] font-display font-bold text-[#f0dcb4]">
                      <Dices className="w-3.5 h-3.5 text-[#d4ad5c]" />
                      <span>Pedir Teste aos Jogadores</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowQuickCheck(false)}
                      className="w-6 h-6 rounded flex items-center justify-center text-[#9b9180] hover:text-white hover:bg-white/10 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Skill / Save / Attribute + DC */}
                  <div className="space-y-1.5">
                    <select
                      value={quickCheckSkillId}
                      onChange={(e) => setQuickCheckSkillId(e.target.value)}
                      className="rpg-input w-full py-1.5 text-xs"
                    >
                      <optgroup label="Testes de Resistência (Salvaguardas)">
                        {campaign.compendium.skills
                          .filter((s) => s.isSavingThrow)
                          .map((s) => {
                            const attrShort =
                              campaign.compendium.attributes.find((a) => a.id === s.defaultAttributeId)
                                ?.shortName || s.defaultAttributeId.toUpperCase();
                            return (
                              <option key={s.id} value={s.id} className="bg-[#11131b]">
                                {attrShort} • {s.name}
                              </option>
                            );
                          })}
                      </optgroup>
                      <optgroup label="Perícias">
                        {campaign.compendium.skills
                          .filter((s) => !s.isSavingThrow)
                          .map((s) => (
                            <option key={s.id} value={s.id} className="bg-[#11131b]">
                              {s.name}
                            </option>
                          ))}
                      </optgroup>
                      <optgroup label="Atributos">
                        {campaign.compendium.attributes.map((a) => (
                          <option key={a.id} value={a.id} className="bg-[#11131b]">
                            {a.name} ({a.shortName})
                          </option>
                        ))}
                      </optgroup>
                    </select>

                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-[#b3a896]">CD:</span>
                      <div className="flex items-center gap-1">
                        {[10, 12, 15, 18].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setQuickCheckDc(preset)}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono-dice border cursor-pointer ${
                              quickCheckDc === preset
                                ? 'bg-amber-950/80 border-amber-400/70 text-amber-200 font-bold'
                                : 'bg-black/40 border-white/15 text-[#b3a896] hover:text-white'
                            }`}
                          >
                            {preset}
                          </button>
                        ))}
                        <input
                          type="number"
                          min={1}
                          max={40}
                          value={quickCheckDc}
                          onChange={(e) => setQuickCheckDc(Math.max(1, Number(e.target.value) || 10))}
                          className="rpg-input w-12 py-0.5 text-center font-mono-dice text-xs"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Target Scope */}
                  <div className="space-y-1.5">
                    <div className="text-[10px] uppercase tracking-wider font-display text-[#9b9180]">
                      Quem deve rolar?
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      {(
                        [
                          { id: 'map', label: 'Mapa Atual' },
                          { id: 'all', label: 'Todos' },
                          { id: 'custom', label: 'Escolher' },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setQuickCheckTargetMode(opt.id)}
                          className={`py-1 px-1.5 rounded text-[10px] font-display font-semibold border cursor-pointer transition ${
                            quickCheckTargetMode === opt.id
                              ? 'bg-[#241d11] border-[#d4ad5c]/70 text-[#f3dfb7]'
                              : 'bg-black/35 border-white/10 text-[#a69b88] hover:text-white'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>

                    {quickCheckTargetMode === 'custom' && (
                      <div className="flex flex-wrap gap-1 pt-0.5 max-h-24 overflow-y-auto">
                        {campaign.characters.map((ch) => {
                          const picked = quickCheckHeroIds.includes(ch.id);
                          return (
                            <button
                              key={ch.id}
                              type="button"
                              onClick={() =>
                                setQuickCheckHeroIds((prev) =>
                                  prev.includes(ch.id)
                                    ? prev.filter((id) => id !== ch.id)
                                    : [...prev, ch.id]
                                )
                              }
                              className={`px-2 py-0.5 rounded-full text-[10px] border flex items-center gap-1 cursor-pointer transition ${
                                picked
                                  ? 'bg-emerald-950/80 border-emerald-400/65 text-emerald-200 font-semibold'
                                  : 'bg-black/35 border-white/15 text-[#a69b88]'
                              }`}
                            >
                              <span
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: ch.playerColor || ch.tokenColor }}
                              />
                              <span className="truncate max-w-[95px]">{ch.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Hidden DC & Group Check Toggles */}
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setQuickCheckHideDc((v) => !v)}
                      className={`py-1.5 px-2 rounded text-[10px] font-display font-semibold border flex items-center justify-center gap-1 cursor-pointer transition ${
                        quickCheckHideDc
                          ? 'bg-purple-950/80 border-purple-400/65 text-purple-200'
                          : 'bg-black/35 border-white/15 text-[#a69b88]'
                      }`}
                      title="Quando ligado, só o Mestre vê a CD e quem passou/falhou"
                    >
                      <Lock className="w-3 h-3" />
                      <span>CD Oculta</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuickCheckIsGroup((v) => !v)}
                      className={`py-1.5 px-2 rounded text-[10px] font-display font-semibold border flex items-center justify-center gap-1 cursor-pointer transition ${
                        quickCheckIsGroup
                          ? 'bg-emerald-950/80 border-emerald-400/65 text-emerald-200'
                          : 'bg-black/35 border-white/15 text-[#a69b88]'
                      }`}
                      title="Regra D&D 5e: o grupo passa se pelo menos 50% obtiver sucesso"
                    >
                      <Users className="w-3 h-3" />
                      <span>Em Grupo (≥50%)</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={triggerQuickCheck}
                    className="rpg-btn-primary w-full py-2 rounded-md text-xs font-display font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Dices className="w-3.5 h-3.5" />
                    <span>Disparar Teste Agora</span>
                  </button>
                </div>
              )}
            </div>
          );
        })()}

        <div className="rpg-rail rounded-md h-8 px-1 flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.1, Number((z - (z <= 0.35 ? 0.05 : 0.15)).toFixed(2))))}
            className="w-6 h-6 rounded flex items-center justify-center text-[#a69b88] hover:text-[#ece4d5] cursor-pointer"
            title="Diminuir Zoom (até 10%)"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="text-[10px] px-1 font-mono-dice text-[#ece4d5] min-w-[36px] text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(2.5, Number((z + (z < 0.35 ? 0.05 : 0.15)).toFixed(2))))}
            className="w-6 h-6 rounded flex items-center justify-center text-[#a69b88] hover:text-[#ece4d5] cursor-pointer"
            title="Aumentar Zoom (até 250%)"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => {
              const baseCell = activeMap?.gridSizePx || 48;
              const availW = Math.max(400, window.innerWidth - 120);
              const availH = Math.max(300, window.innerHeight - 220);
              const fitZoom = Math.min(
                2.0,
                availW / Math.max(1, activeMap.gridWidth * baseCell),
                availH / Math.max(1, activeMap.gridHeight * baseCell)
              );
              setZoom(Math.max(0.1, Math.min(2.5, Number(fitZoom.toFixed(2)))));
              setCameraPan({ x: 0, y: 0 });
            }}
            className="px-1.5 h-6 rounded flex items-center justify-center text-[9px] font-display font-semibold text-[#d4ad5c] hover:bg-white/10 cursor-pointer whitespace-nowrap"
            title="Ajustar mapa inteiro à tela e centralizar câmera"
          >
            Ajustar
          </button>

          {(cameraPan.x !== 0 || cameraPan.y !== 0) && (
            <button
              type="button"
              onClick={() => setCameraPan({ x: 0, y: 0 })}
              className="w-6 h-6 rounded flex items-center justify-center text-[#d4ad5c] hover:bg-white/5 cursor-pointer"
              title="Centralizar Câmera"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="rpg-rail rounded-md h-8 px-1 flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setAutoCameraFocus(!autoCameraFocus)}
            className={`w-6 h-6 rounded flex items-center justify-center cursor-pointer transition ${
              autoCameraFocus
                ? 'bg-[#172536] text-[#8ec5f0]'
                : 'text-[#6c6457] hover:text-[#a69b88]'
            }`}
            title={
              autoCameraFocus
                ? 'Auto-Foco de Câmera LIGADO (clique para desativar)'
                : 'Auto-Foco de Câmera DESLIGADO (clique para ativar)'
            }
          >
            <Video className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setCinematicEnabled(!cinematicEnabled)}
            className={`w-6 h-6 rounded flex items-center justify-center cursor-pointer transition ${
              cinematicEnabled
                ? 'bg-[#261f12] text-[#e8c683]'
                : 'text-[#6c6457] hover:text-[#a69b88]'
            }`}
            title={
              cinematicEnabled
                ? 'Efeitos Cinemáticos LIGADOS (clique para desativar)'
                : 'Efeitos Cinemáticos DESLIGADOS (clique para ativar)'
            }
          >
            <Clapperboard className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Pending Attack / Teleport Targeting Banner (anchored cleanly above Bottom Dock — never blocked by InitiativeBar) */}
      {pendingAttackChoice && (() => {
        const parsedRng = parseAttackRangeMeters(
          pendingAttackChoice.range,
          pendingAttackChoice.actionTitle
        );
        const dispRange = pendingAttackChoice.isTeleport
          ? parsedRng > sqMeters
            ? parsedRng
            : 9
          : parsedRng;
        return (
          <div
            className={`fixed bottom-[98px] left-1/2 -translate-x-1/2 z-40 rpg-glass-panel rounded-md px-4 py-2 flex items-center gap-3 text-xs ${
              pendingAttackChoice.isTeleport ? 'border-cyan-400/75' : 'border-[#b89146]/70'
            }`}
          >
            {pendingAttackChoice.isTeleport ? (
              <Sparkles className="w-4 h-4 text-cyan-300 shrink-0" />
            ) : (
              <Crosshair className="w-4 h-4 text-[#d6575b] shrink-0" />
            )}
            <span>
              {pendingAttackChoice.isTeleport ? (
                <>
                  Teletransporte:{' '}
                  <strong className="text-cyan-200">{pendingAttackChoice.actionTitle}</strong>{' '}
                  <span className="text-[#c8bfb0]">
                    — clique em um espaço livre
                    {pendingAttackChoice.teleportRequiresSight !== false ? ' que você possa ver' : ''}
                  </span>{' '}
                  <span className="text-cyan-300/85 font-mono-dice">
                    (até {dispRange}m • sem Atq. Oportunidade)
                  </span>
                </>
              ) : (
                <>
                  Selecione no mapa quem receberá{' '}
                  <strong className="text-[#e8c683]">{pendingAttackChoice.actionTitle}</strong>{' '}
                  <span className="text-[#a69b88] font-mono-dice">
                    (Alcance máx: {dispRange}m)
                  </span>
                </>
              )}
            </span>
            <button
              type="button"
              onClick={() => setPendingAttackChoice(null)}
              className="rpg-btn-crimson px-2.5 py-0.5 rounded text-[11px] cursor-pointer"
            >
              Cancelar
            </button>
          </div>
        );
      })()}

      {/* Selected Target Indicator (cleanly above Bottom-Left Map Bar) */}
      {targetToken && (() => {
        const targetMon =
          targetToken.type === 'monster' && targetToken.referenceId
            ? campaign.compendium.monsters.find((m) => m.id === targetToken.referenceId)
            : undefined;
        const targetNpc =
          targetToken.type === 'npc' && targetToken.referenceId
            ? campaign.npcs.find((n) => n.id === targetToken.referenceId)
            : undefined;
        const hideAc =
          role !== 'gm' &&
          (targetToken.type === 'monster' || targetToken.type === 'npc') &&
          (targetToken.hideAcFromPlayers !== undefined
            ? targetToken.hideAcFromPlayers
            : targetNpc?.hideAcFromPlayers !== undefined
              ? targetNpc.hideAcFromPlayers
              : targetMon?.hideAcFromPlayers !== undefined
                ? targetMon.hideAcFromPlayers
                : targetToken.type === 'monster' || targetNpc?.disposition === 'Hostil'
                  ? !campaign.settings.showEnemyAcToPlayers
                  : false);
        const targetDispName =
          role !== 'gm' && isTokenNameHiddenFromPlayers(targetToken, campaign)
            ? '???'
            : targetToken.name;
        return (
          <div className="fixed bottom-14 left-3 z-20 rpg-rail rounded-md px-3 py-1.5 flex items-center gap-2.5 text-xs">
            <Crosshair className="w-3.5 h-3.5 text-[#d6575b] shrink-0" />
            <span className="text-[#d6cec0]">
              Alvo: <strong className="text-[#ece4d5]">{targetDispName}</strong>{' '}
              <span className="font-mono-dice text-[11px] text-[#a69b88]">
                (CA {hideAc ? '??' : targetToken.defense}
                {role === 'gm' ? ` • PV ${targetToken.hp}/${targetToken.maxHp}` : ''})
              </span>
            </span>
            <button
              type="button"
              onClick={() => setTargetTokenId(null)}
              className="text-[#a69b88] hover:text-[#ece4d5] cursor-pointer"
              title="Limpar alvo"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })()}

      {/* Ruler Distance Indicator */}
      {tool === 'ruler' && rulerMetrics && (
        <div className="fixed top-[58px] left-[64px] z-25 rpg-glass-panel rounded-md px-3 py-1.5 text-xs font-mono-dice flex items-center gap-2">
          <Ruler className="w-3.5 h-3.5 text-[#d4ad5c]" />
          <span>
            <strong className="text-[#ece4d5]">{rulerMetrics.meters}m</strong> •{' '}
            <strong className="text-[#e8c683]">{rulerMetrics.feet} ft</strong>{' '}
            <span className="text-[#a69b88]">({rulerMetrics.squares} quad.)</span>
          </span>
        </div>
      )}

      {/* Pointer Hint */}
      {tool === 'pointer' && (
        <div className="fixed top-[58px] left-[64px] z-25 rpg-glass-panel rounded-md px-3 py-1.5 text-xs flex items-center gap-2 text-[#d6cec0]">
          <Navigation className="w-3.5 h-3.5 text-[#d4ad5c]" />
          <span>Mova o cursor sobre o mapa para apontar para todos na mesa.</span>
        </div>
      )}

      {/* EPIC BOSS HEALTH BAR (Floating unobtrusively at top-center over Full-Bleed Map) */}
      {(() => {
        const activeBossTok = activeMap.tokens.find((t) => {
          if (!t.isBoss) return false;
          if (role === 'gm') return true;
          const spotted = Boolean(
            myCharacter && (t.visibleToCharacterIds || []).includes(myCharacter.id)
          );
          if (t.isHidden && !spotted) return false;
          const bSz = Math.max(1, t.size || 1);
          if (revealedFogSet) {
            let inFog = false;
            for (let dx = 0; dx < bSz && !inFog; dx++) {
              for (let dy = 0; dy < bSz && !inFog; dy++) {
                if (revealedFogSet.has(`${Math.floor(t.x) + dx},${Math.floor(t.y) + dy}`)) {
                  inFog = true;
                }
              }
            }
            if (!inFog) return false;
          }
          if (darknessLitCells) {
            let inLight = false;
            for (let dx = 0; dx < bSz && !inLight; dx++) {
              for (let dy = 0; dy < bSz && !inLight; dy++) {
                if (darknessLitCells.has(`${Math.floor(t.x) + dx},${Math.floor(t.y) + dy}`)) {
                  inLight = true;
                }
              }
            }
            if (!inLight) return false;
          }
          return true;
        });
        if (!activeBossTok) return null;
        const bossMonDef = activeBossTok.referenceId
          ? campaign.compendium.monsters.find((m) => m.id === activeBossTok.referenceId)
          : undefined;
        const bossHideHp = Boolean(
          activeBossTok.hideHpFromPlayers !== undefined
            ? activeBossTok.hideHpFromPlayers
            : bossMonDef?.hideHpFromPlayers
        );
        const bossNameHidden =
          role !== 'gm' && isTokenNameHiddenFromPlayers(activeBossTok, campaign);
        const bossIncapacitated =
          activeBossTok.hp <= 0 ||
          isTokenIncapacitated(activeBossTok, undefined, campaign.compendium.conditions);
        const hasActiveDomainBanner = Boolean(
          campaign.activeDomain && campaign.activeDomain.mapId === activeMap.id
        );
        const phase = activeBossTok.bossPhase || 1;
        const phase2Pct = activeBossTok.bossPhase2HpPct ?? 50;
        const legActMax = activeBossTok.legendaryActionsMax ?? 0;
        const legActRem = activeBossTok.legendaryActionsRemaining ?? legActMax;
        const legResMax = activeBossTok.legendaryResistancesMax ?? 0;
        const legResRem = activeBossTok.legendaryResistancesRemaining ?? legResMax;
        const wound = getMonsterWoundStatus(activeBossTok.hp, activeBossTok.maxHp);

        return (
          <div
            className={`fixed left-1/2 -translate-x-1/2 z-20 w-[min(600px,calc(100vw-240px))] pointer-events-auto transition-all ${
              campaign.combat.active
                ? hasActiveDomainBanner
                  ? 'top-[192px]'
                  : 'top-[146px]'
                : hasActiveDomainBanner
                  ? 'top-[98px]'
                  : 'top-[54px]'
            }`}
          >
            <div className="rpg-glass-panel rounded-lg px-3.5 py-2 border-[#9e2427]/65 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Crown className="w-4 h-4 text-[#d4ad5c] shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-chronicle font-black text-sm text-[#ece4d5] tracking-wide truncate">
                        {bossNameHidden ? '???' : activeBossTok.name}
                      </span>
                      <span
                        className={`text-[9px] font-display font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                          phase >= 2
                            ? 'bg-[#2e1012] border-[#9e2427]/70 text-[#f09a9d]'
                            : 'bg-[#221c12] border-[#b89146]/50 text-[#e8c683]'
                        }`}
                      >
                        {phase >= 2
                          ? `Fase ${phase}${activeBossTok.bossPhase2Title && !bossNameHidden ? ` • ${activeBossTok.bossPhase2Title}` : ''}`
                          : 'Fase 1'}
                      </span>
                    </div>
                    {!bossBarCollapsed && activeBossTok.bossTitle && !bossNameHidden && (
                      <div className="text-[11px] font-lore italic text-[#a69b88] truncate">
                        {activeBossTok.bossTitle}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right font-mono-dice text-xs">
                    {role === 'gm' ? (
                      <span className="font-bold text-[#e07a7d]">
                        PV {activeBossTok.hp}/{activeBossTok.maxHp}
                      </span>
                    ) : bossHideHp ? (
                      <span className="font-display font-bold text-slate-400">PV ??</span>
                    ) : (
                      <span className={`font-display font-bold ${wound.colorClass}`}>
                        {wound.label}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setBossBarCollapsed((v) => !v)}
                    className="rpg-card p-1 rounded cursor-pointer"
                    title={bossBarCollapsed ? 'Expandir barra do Boss' : 'Recolher barra do Boss'}
                  >
                    {bossBarCollapsed ? (
                      <ChevronDown className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronUp className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {!bossBarCollapsed && (
                <>
              {/* Boss HP Bar with Optional Multi-Phase threshold ticks (masked for players when bossHideHp or untriggered) */}
              <div className="relative">
                {role !== 'gm' && bossHideHp ? (
                  <div
                    className="h-2.5 w-full rounded-full overflow-hidden border border-slate-500/40 bg-slate-900/90"
                    style={{
                      backgroundImage:
                        'repeating-linear-gradient(45deg, rgba(148,163,184,0.16) 0px, rgba(148,163,184,0.16) 6px, rgba(30,41,59,0.5) 6px, rgba(30,41,59,0.5) 12px)',
                    }}
                    title="Vitalidade oculta pelo Mestre"
                  />
                ) : (
                  <SculptedHealthBar
                    hp={activeBossTok.hp}
                    maxHp={activeBossTok.maxHp}
                    variant="boss"
                    heightClass="h-2.5"
                  />
                )}
                {!(role !== 'gm' && bossHideHp) &&
                  (activeBossTok.bossPhases && activeBossTok.bossPhases.length > 0
                    ? [...activeBossTok.bossPhases]
                        .sort((a, b) => b.hpThresholdPct - a.hpThresholdPct)
                        .map((ph, idx) => {
                          const isTriggered = (activeBossTok.triggeredBossPhaseIds || []).includes(ph.id);
                          if (role !== 'gm' && !isTriggered) return null;
                          return (
                            <div
                              key={ph.id}
                              className="absolute top-0 bottom-0 w-[2px] bg-amber-300/90 pointer-events-none"
                              style={{ left: `${ph.hpThresholdPct}%` }}
                              title={
                                role === 'gm'
                                  ? `Fase ${idx + 2}: ${ph.title} (${ph.hpThresholdPct}% PV)`
                                  : `Fase ${idx + 2}`
                              }
                            />
                          );
                        })
                    : activeBossTok.bossPhase2Title &&
                      phase2Pct > 0 &&
                      phase2Pct < 100 &&
                      (role === 'gm' || phase >= 2) && (
                        <div
                          className="absolute top-0 bottom-0 w-[2px] bg-amber-300/90 pointer-events-none"
                          style={{ left: `${phase2Pct}%` }}
                          title={role === 'gm' ? `Limiar da Fase 2 (${phase2Pct}% PV)` : 'Fase 2'}
                        />
                      ))}
              </div>

              {/* Legendary Actions & Legendary Resistances Strip */}
              {(legActMax > 0 || legResMax > 0) && (
                <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-[10px]">
                  {legActMax > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-display font-bold uppercase tracking-wider text-amber-300/90">
                        Ações Lendárias:
                      </span>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: legActMax }).map((_, i) => (
                          <button
                            key={i}
                            type="button"
                            disabled={role !== 'gm'}
                            onClick={() => {
                              const nextRem = i + 1 === legActRem ? i : i + 1;
                              updateActiveMap((m) => ({
                                ...m,
                                tokens: m.tokens.map((t) =>
                                  t.id === activeBossTok.id
                                    ? { ...t, legendaryActionsRemaining: nextRem }
                                    : t
                                ),
                              }));
                            }}
                            title={role === 'gm' ? 'Clique para gastar ou recarregar Ação Lendária' : 'Ação Lendária'}
                            className={`w-3.5 h-3.5 rounded-xs border transition ${
                              role === 'gm' ? 'cursor-pointer' : 'cursor-default'
                            } ${
                              i < legActRem
                                ? 'bg-amber-400 border-amber-200 shadow-[0_0_6px_rgba(251,191,36,0.7)]'
                                : 'bg-black/50 border-amber-500/30'
                            }`}
                          />
                        ))}
                      </div>
                      {role === 'gm' && bossMonDef && bossMonDef.attacks.length > 0 && (
                        <div className="flex items-center gap-1 ml-1">
                          {bossMonDef.attacks.slice(0, 3).map((atk, aIdx) => (
                            <button
                              key={aIdx}
                              type="button"
                              disabled={legActRem <= 0 || bossIncapacitated}
                              onClick={() => {
                                const pending = buildPendingAttackFromMonsterAttack({
                                  token: activeBossTok,
                                  attack: atk,
                                  campaign,
                                  diceSkin: 'blood',
                                  frameFallback: 'crimson',
                                  titlePrefix: '⚡ Ação Lendária: ',
                                  actionCostOverride: 'Livre',
                                  isLegendaryAction: true,
                                });
                                setPendingAttackChoice(pending);
                                showTacticalAlert(
                                  pending.aoeShape
                                    ? `⚡ Ação Lendária em área pronta (${legActRem} disponível)! Clique no mapa para conjurar "${atk.name}".`
                                    : `⚡ Ação Lendária pronta (${legActRem} disponível)! Clique em um alvo no mapa para "${atk.name}" (gasta ao confirmar rolagem).`
                                );
                              }}
                              title={
                                bossIncapacitated
                                  ? 'Boss está caído ou incapacitado e não pode usar Ações Lendárias'
                                  : `Gasta 1 Ação Lendária ao confirmar "${atk.name}" fora do turno!`
                              }
                              className="px-1.5 py-0.5 rounded bg-amber-950/80 border border-amber-400/50 text-[9px] font-display font-bold text-amber-200 hover:border-amber-300 cursor-pointer disabled:opacity-35"
                            >
                              ⚡ {atk.name}
                            </button>
                          ))}
                          {legActRem < legActMax && (
                            <button
                              type="button"
                              onClick={() =>
                                updateActiveMap((m) => ({
                                  ...m,
                                  tokens: m.tokens.map((t) =>
                                    t.id === activeBossTok.id
                                      ? { ...t, legendaryActionsRemaining: legActMax }
                                      : t
                                  ),
                                }))
                              }
                              title="Recarregar todas as Ações Lendárias (início do turno do Boss)"
                              className="px-1.5 py-0.5 rounded rpg-card text-[9px] text-amber-300 hover:border-amber-400 cursor-pointer"
                            >
                              ↻
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {legResMax > 0 && (
                    <div className="flex items-center gap-1.5">
                      <span className="font-display font-bold uppercase tracking-wider text-sky-300/90">
                        Resist. Lendária:
                      </span>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: legResMax }).map((_, i) => (
                          <button
                            key={i}
                            type="button"
                            disabled={role !== 'gm'}
                            onClick={() => {
                              const nextRem = i + 1 === legResRem ? i : i + 1;
                              updateActiveMap((m) => ({
                                ...m,
                                tokens: m.tokens.map((t) =>
                                  t.id === activeBossTok.id
                                    ? { ...t, legendaryResistancesRemaining: nextRem }
                                    : t
                                ),
                              }));
                            }}
                            title={role === 'gm' ? 'Clique para gastar ou recarregar Resistência Lendária' : 'Resistência Lendária'}
                            className={`w-3.5 h-3.5 rounded-full border transition ${
                              role === 'gm' ? 'cursor-pointer' : 'cursor-default'
                            } ${
                              i < legResRem
                                ? 'bg-sky-400 border-sky-200 shadow-[0_0_6px_rgba(56,189,248,0.7)]'
                                : 'bg-black/50 border-sky-500/30'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* GM MULTI-SELECT FLOATING ACTION BAR */}
      {role === 'gm' && selectedTokenIds.length > 1 && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-30 rpg-glass-panel rounded-lg px-3 py-2 border border-amber-400/60 shadow-2xl flex flex-wrap items-center gap-1.5 text-xs animate-ui-enter">
          <span className="font-display font-bold text-amber-200 mr-1">
            {selectedTokenIds.length} selecionados
          </span>
          <button
            type="button"
            onClick={() =>
              updateActiveMap((m) => ({
                ...m,
                tokens: m.tokens.map((t) =>
                  selectedTokenIds.includes(t.id) ? { ...t, isHidden: true } : t
                ),
              }))
            }
            className="rpg-card px-2 py-1 rounded text-[11px] cursor-pointer hover:border-amber-400/60"
          >
            Ocultar
          </button>
          <button
            type="button"
            onClick={() =>
              updateActiveMap((m) => ({
                ...m,
                tokens: m.tokens.map((t) =>
                  selectedTokenIds.includes(t.id) ? { ...t, isHidden: false } : t
                ),
              }))
            }
            className="rpg-card px-2 py-1 rounded text-[11px] cursor-pointer hover:border-amber-400/60"
          >
            Revelar
          </button>
          <button
            type="button"
            onClick={() =>
              selectedTokenIds.forEach((id) =>
                applyDamage(id, 5, false, undefined, undefined, undefined, undefined, false, {
                  suppressExecution: true,
                })
              )
            }
            className="px-2 py-1 rounded bg-red-900/70 hover:bg-red-800 text-white text-[11px] cursor-pointer"
          >
            -5 PV
          </button>
          <button
            type="button"
            onClick={() =>
              selectedTokenIds.forEach((id) =>
                applyDamage(id, 5, true, undefined, undefined, undefined, undefined, false, {
                  skipRevivePenalty: true,
                })
              )
            }
            className="px-2 py-1 rounded bg-emerald-900/70 hover:bg-emerald-800 text-white text-[11px] cursor-pointer"
          >
            +5 PV
          </button>
          <button
            type="button"
            onClick={() => {
              const idSet = new Set(selectedTokenIds);
              updateCampaign((prev) => removeTokensFromMapAndCombat(prev, activeMap.id, idSet));
              setSelectedTokenIds([]);
            }}
            className="px-2 py-1 rounded bg-red-950/90 border border-red-500/50 text-red-200 hover:bg-red-900 text-[11px] font-bold cursor-pointer"
          >
            Remover Todos
          </button>
          <button
            type="button"
            onClick={() => setSelectedTokenIds([])}
            className="rpg-card px-2 py-1 rounded text-[11px] cursor-pointer"
            title="Limpar seleção múltipla"
          >
            ✕
          </button>
        </div>
      )}

      {/* MAIN VIEWPORT: Pan outside map / Middle-Click, Zoom to Cursor on Mouse Wheel, Click outside deselects everything */}
      <div
        ref={viewportRef}
        onMouseDown={(e) => {
          // Clicking outside the map deselects ALL selections, tools, drawers, and active targeting
          if (e.button === 0 && e.target === e.currentTarget) {
            setSelectedTokenId(null);
            setSelectedTokenIds([]);
            setSelectedTemplateId(null);
            setSelectedMarkerId(null);
            setTargetTokenId(null);
            setGmDrawerTab(null);
            setSecretMarkerKind(null);
            if (pendingAttackChoice) setPendingAttackChoice(null);
            setTool('select');
          }
          // Pan world when clicking outside the map grid or middle-click anywhere
          const isMiddle = e.button === 1;
          const isOutsideMap = e.button === 0 && e.target === e.currentTarget;
          if (isMiddle || isOutsideMap) {
            beginWorldPan(e);
          }
        }}
        onDoubleClick={(e) => {
          if (e.target === e.currentTarget) {
            setCameraPan({ x: 0, y: 0 });
          }
        }}
        className={`flex-1 overflow-hidden relative flex items-center justify-center p-6 select-none ${
          isPanningWorld ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        style={{ backgroundColor: 'var(--canvas-bg)' }}
      >
          {/* Sculpted Brass & Obsidian Tabletop Rim (Coordinate numbers removed for clean full-map framing) */}
          <div
            onMouseDown={(e) => {
              if (
                e.button === 1 ||
                (e.button === 0 && (spacePressedRef.current || e.target === e.currentTarget))
              ) {
                e.stopPropagation();
                beginWorldPan(e);
              }
            }}
            className="rpg-panel rounded-lg p-2 shadow-[0_30px_85px_rgba(0,0,0,0.95)] shrink-0 relative cursor-default"
            style={{
              transform: `translate3d(${cameraPan.x}px, ${cameraPan.y}px, 0)`,
              transition:
                isPanningWorld || isZoomFrame
                  ? 'none'
                  : 'transform 460ms cubic-bezier(0.22, 1, 0.36, 1)',
              willChange: isPanningWorld || isZoomFrame ? 'transform' : 'auto',
            }}
          >
              <div
                ref={gridRef}
                onMouseDown={handleGridMouseDown}
                onMouseMove={handleGridMouseMove}
                onMouseUp={handleGridMouseUp}
                onMouseLeave={handleGridMouseLeave}
                onDragOver={handleGridDragOver}
                onDragLeave={() => setDropHighlightCell(null)}
                onDrop={handleGridDrop}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (pendingAttackChoice) setPendingAttackChoice(null);
                  if (secretMarkerKind) setSecretMarkerKind(null);
                }}
                className={`relative shadow-2xl select-none shrink-0 rounded border-2 ${
                  cinematicEnabled && screenShakeIntensity === 'heavy'
                    ? 'animate-map-shake-heavy'
                    : cinematicEnabled && screenShakeIntensity === 'light'
                      ? 'animate-map-shake-light'
                      : ''
                }`}
                style={{
                  width: totalW,
                  height: totalH,
                  borderColor: 'var(--border-ornate)',
                  cursor:
                    secretMarkerKind ||
                    tool === 'ruler' ||
                    tool === 'ping' ||
                    tool === 'pointer' ||
                    tool === 'draw'
                      ? 'crosshair'
                      : tool.startsWith('fog') || tool.startsWith('terrain-')
                      ? 'cell'
                      : 'default',
                }}
              >
                {/* Clipped Background + Biome + Grid Layer (Keeps popovers & token menus 100% unclipped outside the map!) */}
                <div
                  className="absolute inset-0 rounded overflow-hidden pointer-events-none"
                  style={{
                    background: resolvedMapBg
                      ? `url(${resolvedMapBg}) 0 0 / 100% 100% no-repeat`
                      : PRESET_GRADIENTS[activeMap.themePreset],
                  }}
                >
                  {/* Architectural Biome Floor Texture & Torchlight when no custom map image is uploaded */}
                  {!resolvedMapBg && (
                    <BiomeFloorOverlay preset={activeMap.themePreset} cellPx={cellPx} />
                  )}

                  {/* Grid Lines */}
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      backgroundImage: `linear-gradient(to right, var(--grid-line) 1px, transparent 1px), linear-gradient(to bottom, var(--grid-line) 1px, transparent 1px)`,
                      backgroundSize: `${cellPx}px ${cellPx}px`,
                    }}
                  />

                  {/* Persistent Battle Scars (Black Flash Craters, Blood Slashes, Scorch, Frost, Acid) */}
                  {activeMap.battleScars && activeMap.battleScars.length > 0 && (
                    <BattleScarsLayer scars={activeMap.battleScars} cellPx={cellPx} />
                  )}

                  {/* Weather Layer (AAA HTML5 Canvas 2D for Rain, Embers, Snow, and Mist) */}
                  {activeMap.weather !== 'none' && (
                    <MapWeatherCanvas
                      weather={activeMap.weather}
                      width={totalW}
                      height={totalH}
                    />
                  )}

                  {/* Optional Atmospheric Time-of-Day Tint (Dawn / Dusk / Night / Bloodmoon / Toxic) */}
                  {atmosphericTintStyle && (
                    <div
                      className="absolute inset-0 pointer-events-none transition-all duration-700"
                      style={atmosphericTintStyle}
                    />
                  )}
                </div>

                {/* Live Drop Highlight Square when dragging a Hero or NPC from Left Panel */}
                {dropHighlightCell && (
                  <div
                    className="absolute pointer-events-none z-35 border-2 border-amber-400 bg-amber-400/25 rounded shadow-[0_0_18px_rgba(251,191,36,0.65)]"
                    style={{
                      left: dropHighlightCell.x * cellPx,
                      top: dropHighlightCell.y * cellPx,
                      width: cellPx,
                      height: cellPx,
                    }}
                  />
                )}

                {/* Elemental Surfaces (BG3-style Fire, Ice, Acid, Water tiles) */}
                {activeMap.elementalSurfaces &&
                  Object.entries(activeMap.elementalSurfaces).map(([key, surf]) => {
                    const [sx, sy] = key.split(',').map(Number);
                    if (isNaN(sx) || isNaN(sy)) return null;
                    const fireLbl = activeMap.surfaceConfig?.fireDamageFormula || '1d6';
                    const iceDcLbl = activeMap.surfaceConfig?.iceSaveDc ?? 12;
                    const acidLbl = activeMap.surfaceConfig?.acidDamageFormula || '1d4';
                    const cfg =
                      surf === 'fire'
                        ? {
                            bg: 'rgba(249, 115, 22, 0.34)',
                            border: 'rgba(251, 146, 60, 0.7)',
                            icon: '🔥',
                            label: `Fogo (${fireLbl} ao pisar / início do turno)`,
                          }
                        : surf === 'ice'
                          ? {
                              bg: 'rgba(56, 189, 248, 0.28)',
                              border: 'rgba(125, 211, 252, 0.7)',
                              icon: '❄️',
                              label: `Gelo (Reflexos CD ${iceDcLbl} ou Caído)`,
                            }
                          : surf === 'acid'
                            ? {
                                bg: 'rgba(34, 197, 94, 0.30)',
                                border: 'rgba(74, 222, 128, 0.7)',
                                icon: '🧪',
                                label: `Ácido (${acidLbl} + Corroído -2 CA)`,
                              }
                            : {
                                bg: 'rgba(37, 99, 235, 0.28)',
                                border: 'rgba(96, 165, 250, 0.65)',
                                icon: '💧',
                                label: 'Água (Molhado — 2× Raio/Gelo)',
                              };
                    return (
                      <div
                        key={`surf-${key}`}
                        className="absolute pointer-events-none z-5 flex items-center justify-center rounded-xs"
                        style={{
                          left: sx * cellPx,
                          top: sy * cellPx,
                          width: cellPx,
                          height: cellPx,
                          backgroundColor: cfg.bg,
                          border: `1px solid ${cfg.border}`,
                        }}
                        title={cfg.label}
                      >
                        <span className="text-xs opacity-80 select-none">{cfg.icon}</span>
                      </div>
                    );
                  })}

                {/* Sculpted Dark-Fantasy Masonry Walls SVG Layer (Full, Half, Thin Edge, Diagonal, Pillar + Opacity) */}
                {(() => {
                  const wallEntries = Object.entries(activeMap.terrainCells || {}).filter(
                    ([key, kind]) => {
                      if (kind !== 'wall') return false;
                      const [cxStr, cyStr] = key.split(',');
                      const cx = Number(cxStr);
                      const cy = Number(cyStr);
                      if (Number.isNaN(cx) || Number.isNaN(cy)) return false;
                      const hasOpenDoorHere = (activeMap.gmMarkers || []).some(
                        (mk) =>
                          mk.kind === 'door' &&
                          mk.doorState === 'open' &&
                          mk.x === cx &&
                          mk.y === cy
                      );
                      return !hasOpenDoorHere;
                    }
                  );

                  const showHoverGhost = role === 'gm' && tool === 'terrain-wall' && Boolean(wallHoverCell);
                  if (wallEntries.length === 0 && !showHoverGhost) return null;

                  const fullWallSet = new Set<string>();
                  for (const [key] of wallEntries) {
                    const meta = activeMap.wallMeta?.[key];
                    if (!meta || meta.shape === 'full') {
                      fullWallSet.add(key);
                    }
                  }

                  const ghostCells: Array<{ x: number; y: number }> = [];
                  if (showHoverGhost) {
                    if (marqueeBox && marqueeBox.mode === 'terrain') {
                      const minX = Math.min(marqueeBox.startGx, marqueeBox.endGx);
                      const maxX = Math.max(marqueeBox.startGx, marqueeBox.endGx);
                      const minY = Math.min(marqueeBox.startGy, marqueeBox.endGy);
                      const maxY = Math.max(marqueeBox.startGy, marqueeBox.endGy);
                      for (let gy = minY; gy <= maxY; gy++) {
                        for (let gx = minX; gx <= maxX; gx++) {
                          ghostCells.push({ x: gx, y: gy });
                        }
                      }
                    } else if (wallHoverCell) {
                      ghostCells.push(wallHoverCell);
                    }
                  }

                  const patSize = Math.max(24, cellPx);
                  const halfPat = patSize / 2;

                  return (
                    <svg
                      className="absolute inset-0 pointer-events-none z-[5]"
                      width={totalW}
                      height={totalH}
                    >
                      <defs>
                        {/* Procedural Dark-Fantasy Ashlar Stonework Masonry Pattern */}
                        <pattern
                          id="chronicle-wall-stone"
                          patternUnits="userSpaceOnUse"
                          width={patSize}
                          height={patSize}
                        >
                          <rect width={patSize} height={patSize} fill="#12151e" />
                          {/* Top row of carved obsidian-slate blocks */}
                          <rect
                            x={1}
                            y={1}
                            width={halfPat - 2}
                            height={halfPat - 2}
                            rx={1.2}
                            fill="#232837"
                          />
                          <rect
                            x={halfPat + 1}
                            y={1}
                            width={halfPat - 2}
                            height={halfPat - 2}
                            rx={1.2}
                            fill="#1d2230"
                          />
                          {/* Bottom staggered row of carved blocks */}
                          <rect
                            x={1}
                            y={halfPat + 1}
                            width={patSize * 0.24}
                            height={halfPat - 2}
                            rx={1.2}
                            fill="#1b202d"
                          />
                          <rect
                            x={patSize * 0.27}
                            y={halfPat + 1}
                            width={halfPat - 1}
                            height={halfPat - 2}
                            rx={1.2}
                            fill="#262c3d"
                          />
                          <rect
                            x={patSize * 0.78}
                            y={halfPat + 1}
                            width={patSize * 0.21}
                            height={halfPat - 2}
                            rx={1.2}
                            fill="#202534"
                          />
                          {/* Subtle top-edge warm torch/moonlight bevel on each stone course */}
                          <line
                            x1={2}
                            y1={1.8}
                            x2={patSize - 2}
                            y2={1.8}
                            stroke="rgba(228, 210, 172, 0.16)"
                            strokeWidth={1}
                          />
                          <line
                            x1={2}
                            y1={halfPat + 1.8}
                            x2={patSize - 2}
                            y2={halfPat + 1.8}
                            stroke="rgba(228, 210, 172, 0.13)"
                            strokeWidth={1}
                          />
                          {/* Subtle lower mortar shadow */}
                          <line
                            x1={0}
                            y1={halfPat}
                            x2={patSize}
                            y2={halfPat}
                            stroke="rgba(5, 6, 10, 0.88)"
                            strokeWidth={1.3}
                          />
                          <line
                            x1={0}
                            y1={patSize - 0.5}
                            x2={patSize}
                            y2={patSize - 0.5}
                            stroke="rgba(5, 6, 10, 0.9)"
                            strokeWidth={1.3}
                          />
                        </pattern>

                        {/* Soft Architectural Elevation Drop Shadow */}
                        <filter id="chronicle-wall-drop" x="-15%" y="-15%" width="140%" height="140%">
                          <feDropShadow
                            dx="1.5"
                            dy="2.5"
                            stdDeviation="2"
                            floodColor="#000000"
                            floodOpacity="0.62"
                          />
                        </filter>
                      </defs>

                      {/* Rendered Map Walls */}
                      {wallEntries.map(([key]) => {
                        const [cxStr, cyStr] = key.split(',');
                        const cx = Number(cxStr);
                        const cy = Number(cyStr);
                        const meta = activeMap.wallMeta?.[key];
                        const shape: WallCellShape = meta?.shape || 'full';
                        const rawOpacity =
                          typeof meta?.opacity === 'number'
                            ? Math.max(0, Math.min(1, meta.opacity))
                            : 1;

                        // Invisible wall (opacity 0): completely hidden from players, subtle brass guide for GM
                        if (rawOpacity <= 0.01 && role !== 'gm') return null;

                        const px = cx * cellPx;
                        const py = cy * cellPx;
                        const geom = getWallSvgGeometry(shape, px, py, cellPx);

                        if (rawOpacity <= 0.01) {
                          return (
                            <g key={`wall-invis-${key}`}>
                              {geom.kind === 'rect' ? (
                                <rect
                                  x={geom.rx + 1}
                                  y={geom.ry + 1}
                                  width={Math.max(2, geom.rw - 2)}
                                  height={Math.max(2, geom.rh - 2)}
                                  fill="rgba(212, 173, 92, 0.09)"
                                  stroke="rgba(212, 173, 92, 0.68)"
                                  strokeWidth={1.35}
                                  strokeDasharray="4 3"
                                  rx={1.5}
                                />
                              ) : (
                                <polygon
                                  points={geom.points}
                                  fill="rgba(212, 173, 92, 0.09)"
                                  stroke="rgba(212, 173, 92, 0.68)"
                                  strokeWidth={1.35}
                                  strokeDasharray="4 3"
                                />
                              )}
                            </g>
                          );
                        }

                        const isFull = shape === 'full';
                        const hasTop = isFull && fullWallSet.has(`${cx},${cy - 1}`);
                        const hasBottom = isFull && fullWallSet.has(`${cx},${cy + 1}`);
                        const hasLeft = isFull && fullWallSet.has(`${cx - 1},${cy}`);
                        const hasRight = isFull && fullWallSet.has(`${cx + 1},${cy}`);

                        return (
                          <g
                            key={`wall-${key}`}
                            opacity={rawOpacity}
                            filter={rawOpacity > 0.35 ? 'url(#chronicle-wall-drop)' : undefined}
                          >
                            {geom.kind === 'rect' ? (
                              <>
                                <rect
                                  x={geom.rx}
                                  y={geom.ry}
                                  width={geom.rw}
                                  height={geom.rh}
                                  fill="url(#chronicle-wall-stone)"
                                  stroke={isFull ? 'none' : 'rgba(186, 166, 128, 0.48)'}
                                  strokeWidth={isFull ? 0 : 1.25}
                                  rx={isFull ? 0 : 1.5}
                                />
                                {/* Subtle inner top-left carved stone sheen */}
                                <rect
                                  x={geom.rx + 1.2}
                                  y={geom.ry + 1.2}
                                  width={Math.max(1, geom.rw - 2.4)}
                                  height={Math.max(1, geom.rh - 2.4)}
                                  fill="none"
                                  stroke="rgba(244, 224, 176, 0.12)"
                                  strokeWidth={0.9}
                                  rx={isFull ? 0 : 1}
                                />
                                {/* Seamless architectural outer rims on exposed faces of full walls */}
                                {isFull && !hasTop && (
                                  <line
                                    x1={px}
                                    y1={py + 0.8}
                                    x2={px + cellPx}
                                    y2={py + 0.8}
                                    stroke="rgba(208, 186, 142, 0.48)"
                                    strokeWidth={1.6}
                                  />
                                )}
                                {isFull && !hasLeft && (
                                  <line
                                    x1={px + 0.8}
                                    y1={py}
                                    x2={px + 0.8}
                                    y2={py + cellPx}
                                    stroke="rgba(208, 186, 142, 0.4)"
                                    strokeWidth={1.6}
                                  />
                                )}
                                {isFull && !hasBottom && (
                                  <line
                                    x1={px}
                                    y1={py + cellPx - 0.8}
                                    x2={px + cellPx}
                                    y2={py + cellPx - 0.8}
                                    stroke="rgba(12, 14, 22, 0.92)"
                                    strokeWidth={2}
                                  />
                                )}
                                {isFull && !hasRight && (
                                  <line
                                    x1={px + cellPx - 0.8}
                                    y1={py}
                                    x2={px + cellPx - 0.8}
                                    y2={py + cellPx}
                                    stroke="rgba(12, 14, 22, 0.92)"
                                    strokeWidth={2}
                                  />
                                )}
                              </>
                            ) : (
                              <>
                                <polygon
                                  points={geom.points}
                                  fill="url(#chronicle-wall-stone)"
                                  stroke="rgba(196, 174, 132, 0.52)"
                                  strokeWidth={1.35}
                                  strokeLinejoin="round"
                                />
                                {shape === 'pillar' && (
                                  <circle
                                    cx={px + cellPx / 2}
                                    cy={py + cellPx / 2}
                                    r={cellPx * 0.14}
                                    fill="rgba(212, 173, 92, 0.12)"
                                    stroke="rgba(212, 173, 92, 0.32)"
                                    strokeWidth={0.9}
                                  />
                                )}
                              </>
                            )}
                          </g>
                        );
                      })}

                      {/* Live GM Wall Brush Ghost Preview */}
                      {ghostCells.map((gc) => {
                        const geom = getWallSvgGeometry(
                          wallBrushShape,
                          gc.x * cellPx,
                          gc.y * cellPx,
                          cellPx
                        );
                        return (
                          <g key={`wall-ghost-${gc.x}-${gc.y}`}>
                            {geom.kind === 'rect' ? (
                              <rect
                                x={geom.rx + 0.75}
                                y={geom.ry + 0.75}
                                width={Math.max(2, geom.rw - 1.5)}
                                height={Math.max(2, geom.rh - 1.5)}
                                fill="rgba(212, 173, 92, 0.24)"
                                stroke="#e8c683"
                                strokeWidth={1.5}
                                strokeDasharray="4 2"
                                rx={1.5}
                              />
                            ) : (
                              <polygon
                                points={geom.points}
                                fill="rgba(212, 173, 92, 0.24)"
                                stroke="#e8c683"
                                strokeWidth={1.5}
                                strokeDasharray="4 2"
                              />
                            )}
                          </g>
                        );
                      })}
                    </svg>
                  );
                })()}

                {/* Tactical Terrain Cells: Cover (+2/+5 CA), Difficult Terrain (2x) */}
                {activeMap.terrainCells &&
                  Object.entries(activeMap.terrainCells).map(([key, kind]) => {
                    if (kind === 'wall') return null;
                    const [cxStr, cyStr] = key.split(',');
                    const cx = Number(cxStr);
                    const cy = Number(cyStr);
                    if (Number.isNaN(cx) || Number.isNaN(cy)) return null;
                    if (kind === 'cover') {
                      return (
                        <div
                          key={`ter-${key}`}
                          className="absolute pointer-events-none z-[5] border border-amber-500/70 flex items-center justify-center"
                          style={{
                            left: cx * cellPx,
                            top: cy * cellPx,
                            width: cellPx,
                            height: cellPx,
                            background:
                              'repeating-linear-gradient(45deg, rgba(120,53,15,0.52) 0px, rgba(120,53,15,0.52) 5px, rgba(180,83,9,0.28) 5px, rgba(180,83,9,0.28) 10px)',
                          }}
                        >
                          <span className="text-[8px] font-display font-bold text-amber-200/90 bg-black/65 px-1 rounded">
                            +2
                          </span>
                        </div>
                      );
                    }
                    return (
                      <div
                        key={`ter-${key}`}
                        className="absolute pointer-events-none z-[5] border border-amber-700/45 flex items-end justify-end p-0.5"
                        style={{
                          left: cx * cellPx,
                          top: cy * cellPx,
                          width: cellPx,
                          height: cellPx,
                          background:
                            'radial-gradient(circle at 30% 35%, rgba(217,119,6,0.34), rgba(69,26,3,0.42))',
                        }}
                      >
                        <span className="text-[8px] font-mono-dice font-bold text-amber-300/85">
                          2x
                        </span>
                      </div>
                    );
                  })}

                {/* Choreographed Movement Path Trail SVG + Live Meter Pill (Xm / Ym) while dragging */}
                {draggingTokenId && dragOrigin && dragPath.length > 0 && (() => {
                  const dragTok = activeMap.tokens.find((t) => t.id === draggingTokenId);
                  if (!dragTok) return null;
                  const half = (dragTok.size * cellPx) / 2;
                  const startsAtOrigin =
                    dragPath[0]?.x === dragOrigin.x && dragPath[0]?.y === dragOrigin.y;
                  const rawPts = startsAtOrigin ? dragPath : [dragOrigin, ...dragPath];
                  const densePts: Array<{ x: number; y: number }> = [rawPts[0]];
                  for (let pi = 1; pi < rawPts.length; pi++) {
                    const seg = traceGridLine(
                      rawPts[pi - 1].x,
                      rawPts[pi - 1].y,
                      rawPts[pi].x,
                      rawPts[pi].y
                    );
                    for (let si = 1; si < seg.length; si++) {
                      const prevP = densePts[densePts.length - 1];
                      if (seg[si].x !== prevP.x || seg[si].y !== prevP.y) {
                        densePts.push(seg[si]);
                      }
                    }
                  }
                  const pts = densePts.map((p) => ({
                    x: p.x * cellPx + half,
                    y: p.y * cellPx + half,
                  }));
                  const pointsAttr = pts.map((p) => `${p.x},${p.y}`).join(' ');
                  const lastPt = pts[pts.length - 1];
                  const cb = findTokenCombatant(dragTok);
                  const maxMove = cb
                    ? cb.remainingMoveMeters ?? cb.speedMeters ?? 9
                    : (() => {
                        if (dragTok.type === 'character' && dragTok.referenceId) {
                          const ch = campaign.characters.find((c) => c.id === dragTok.referenceId);
                          if (ch) return computeCharacterStats(ch, campaign).speed;
                        }
                        if (dragTok.type === 'monster' && dragTok.referenceId) {
                          const mon = campaign.compendium.monsters.find((m) => m.id === dragTok.referenceId);
                          if (mon) return mon.speed || 9;
                        }
                        return 9;
                      })();
                  const movedMeters = calculateMovementCostMeters(
                    densePts[0],
                    densePts[densePts.length - 1],
                    activeMap.terrainCells,
                    sqMeters,
                    densePts,
                    dragTok.size
                  ).meters;
                  const overBudget = movedMeters > maxMove + 0.05;
                  const strokeCol = overBudget ? '#ef4444' : '#fbbf24';
                  return (
                    <>
                      <svg
                        className="absolute inset-0 pointer-events-none z-20"
                        width={totalW}
                        height={totalH}
                      >
                        <polyline
                          points={pointsAttr}
                          fill="none"
                          stroke={strokeCol}
                          strokeWidth="2.5"
                          strokeDasharray="6 5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          opacity="0.9"
                        />
                        {pts.map((p, idx) => (
                          <circle
                            key={idx}
                            cx={p.x}
                            cy={p.y}
                            r={idx === 0 || idx === pts.length - 1 ? 5 : 3}
                            fill={idx === 0 ? '#34d399' : strokeCol}
                            stroke="#06070c"
                            strokeWidth="1.5"
                          />
                        ))}
                      </svg>
                      <div
                        className={`absolute pointer-events-none z-35 px-2 py-0.5 rounded-full text-[11px] font-mono-dice font-bold border shadow-xl whitespace-nowrap -translate-x-1/2 ${
                          overBudget
                            ? 'bg-red-950/95 border-red-400 text-red-100'
                            : 'bg-black/90 border-amber-400/80 text-amber-200'
                        }`}
                        style={{ left: lastPt.x, top: Math.max(4, lastPt.y - half - 26) }}
                      >
                        {movedMeters}m / {maxMove}m
                      </div>
                    </>
                  );
                })()}

                {/* Live Tactical Targeting Sightline SVG when hovering enemy in pendingAttackChoice */}
                {pendingAttackChoice && hoveredTokenId && (() => {
                  const atkTok =
                    (pendingAttackChoice.attackerTokenId &&
                      activeMap.tokens.find((t) => t.id === pendingAttackChoice.attackerTokenId)) ||
                    (pendingAttackChoice.attackerCharacterId &&
                      activeMap.tokens.find(
                        (t) =>
                          t.type === 'character' &&
                          t.referenceId === pendingAttackChoice.attackerCharacterId
                      ));
                  const hovTok = activeMap.tokens.find((t) => t.id === hoveredTokenId);
                  if (!atkTok || !hovTok || atkTok.id === hovTok.id) return null;

                  const x1 = (atkTok.x + atkTok.size / 2) * cellPx;
                  const y1 = (atkTok.y + atkTok.size / 2) * cellPx;
                  const x2 = (hovTok.x + hovTok.size / 2) * cellPx;
                  const y2 = (hovTok.y + hovTok.size / 2) * cellPx;

                  const maxM = parseAttackRangeMeters(
                    pendingAttackChoice.range,
                    pendingAttackChoice.actionTitle
                  );
                  const dist3DInfo = getToken3DDistance(atkTok, hovTok, sqMeters);
                  const distM = dist3DInfo.meters3D;
                  const inRange = distM <= maxM + 0.05;
                  const isRangedSightline =
                    pendingAttackChoice.actionCost !== 'Reação' && maxM > sqMeters + 0.05;
                  const losSightline = evaluateLineOfSightAndCover(
                    activeMap,
                    atkTok,
                    hovTok,
                    isRangedSightline
                  );
                  const atkChar = pendingAttackChoice.attackerCharacterId
                    ? campaign.characters.find(
                        (c) => c.id === pendingAttackChoice.attackerCharacterId
                      )
                    : undefined;
                  const defChar =
                    hovTok.type === 'character' && hovTok.referenceId
                      ? campaign.characters.find((c) => c.id === hovTok.referenceId)
                      : undefined;
                  const defCb = campaign.combat.active
                    ? campaign.combat.combatants.find((cb) => cb.tokenId === hovTok.id)
                    : undefined;
                  const sightlineMods = evaluateTacticalAttackModifiers({
                    map: activeMap,
                    attackerToken: atkTok,
                    defenderToken: hovTok,
                    attackerChar: atkChar,
                    defenderChar: defChar,
                    characters: campaign.characters,
                    npcs: campaign.npcs,
                    campaign,
                    range: pendingAttackChoice.range,
                    actionTitle: pendingAttackChoice.actionTitle,
                    sqMeters,
                    flankingMode: getEffectiveFlankingMode(campaign.settings),
                    manualAdvantageMode: advantageMode,
                    defenderDodging: Boolean(defCb?.dodging),
                    isReaction: pendingAttackChoice.actionCost === 'Reação',
                  });
                  const combinedBadges = losSightline.coverLabel
                    ? [losSightline.coverLabel, ...sightlineMods.summaryBadges]
                    : sightlineMods.summaryBadges;
                  const strokeCol =
                    !inRange || losSightline.blockedByWall
                      ? '#ef4444'
                      : sightlineMods.effectiveAdvantageMode === 'disadvantage'
                        ? '#f97316'
                        : sightlineMods.effectiveAdvantageMode === 'advantage'
                          ? '#10b981'
                          : '#f59e0b';
                  const midX = (x1 + x2) / 2;
                  const midY = (y1 + y2) / 2;

                  return (
                    <>
                      <svg
                        className="absolute inset-0 pointer-events-none z-25"
                        width={totalW}
                        height={totalH}
                      >
                        <line
                          x1={x1}
                          y1={y1}
                          x2={x2}
                          y2={y2}
                          stroke={strokeCol}
                          strokeWidth="2.8"
                          strokeDasharray="7 5"
                          opacity="0.9"
                        />
                        <circle cx={x1} cy={y1} r="4.5" fill="#fbbf24" />
                        <circle
                          cx={x2}
                          cy={y2}
                          r={hovTok.size * cellPx * 0.46}
                          fill="none"
                          stroke={strokeCol}
                          strokeWidth="2"
                          strokeDasharray="5 4"
                        />
                      </svg>
                      <div
                        className="absolute pointer-events-none z-35 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1"
                        style={{ left: midX, top: midY }}
                      >
                        <div
                          className={`px-2 py-0.5 rounded border text-[10px] font-display font-bold whitespace-nowrap shadow-xl ${
                            inRange && !losSightline.blockedByWall
                              ? 'bg-[#121620]/95 border-amber-400 text-amber-200'
                              : 'bg-red-950/95 border-red-400 text-red-200'
                          }`}
                        >
                          {losSightline.blockedByWall
                            ? 'BLOQUEADO POR PAREDE'
                            : `${distM}m${dist3DInfo.verticalMeters > 0 ? ` (Δ↑${dist3DInfo.verticalMeters}m)` : ''} • ${inRange ? 'NO ALCANCE' : `FORA (Máx ${maxM}m)`}`}
                        </div>
                        {inRange && !losSightline.blockedByWall && combinedBadges.length > 0 && (
                          <div className="flex flex-col items-center gap-0.5">
                            {combinedBadges.slice(0, 4).map((b, i) => (
                              <span
                                key={i}
                                className={`px-2 py-0.5 rounded text-[9px] font-display font-bold whitespace-nowrap border shadow-lg ${
                                  b.startsWith('-Desv:')
                                    ? 'bg-red-950/95 border-red-400/80 text-red-200'
                                    : b.startsWith('+Vant:')
                                      ? 'bg-emerald-950/95 border-emerald-400/80 text-emerald-200'
                                      : 'bg-amber-950/95 border-amber-400/80 text-amber-200'
                                }`}
                              >
                                {b}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  );
                })()}

            {/* D&D Movement Budget Perimeter while dragging in Combat */}
            {draggingTokenId && dragOrigin && campaign.combat.active && !dragOrigin.shiftFree && (() => {
              const dragTok = activeMap.tokens.find((t) => t.id === draggingTokenId);
              if (!dragTok || (role === 'gm' && dragTok.type === 'character')) return null;
              const cb = findTokenCombatant(dragTok);
              const remMeters = cb ? cb.remainingMoveMeters ?? cb.speedMeters ?? 9 : 9;
              const maxSq = Math.max(0, Math.floor(remMeters / sqMeters));
              const usedSquares = Math.max(
                Math.abs(dragTok.x - dragOrigin.x),
                Math.abs(dragTok.y - dragOrigin.y)
              );
              const used = {
                squares: usedSquares,
                meters: Math.round(usedSquares * sqMeters * 10) / 10,
              };
              const minX = Math.max(0, dragOrigin.x - maxSq);
              const minY = Math.max(0, dragOrigin.y - maxSq);
              const maxX = Math.min(activeMap.gridWidth - dragTok.size, dragOrigin.x + maxSq) + dragTok.size;
              const maxY = Math.min(activeMap.gridHeight - dragTok.size, dragOrigin.y + maxSq) + dragTok.size;

              return (
                <>
                  <div
                    className="absolute pointer-events-none z-5 border-2 border-emerald-400/70 bg-emerald-500/10 rounded"
                    style={{
                      left: minX * cellPx,
                      top: minY * cellPx,
                      width: (maxX - minX) * cellPx,
                      height: (maxY - minY) * cellPx,
                    }}
                  />
                  <div
                    className="absolute pointer-events-none z-35 bg-black/90 border border-emerald-400/70 text-emerald-200 px-2 py-0.5 rounded text-[10px] font-mono-dice whitespace-nowrap shadow-xl"
                    style={{
                      left: (dragTok.x + dragTok.size / 2) * cellPx,
                      top: Math.max(4, dragTok.y * cellPx - 28),
                      transform: 'translateX(-50%)',
                    }}
                  >
                    {used.meters}m / {remMeters}m • {Math.round((used.meters / 1.5) * 5)} ft ({used.squares}q)
                  </div>
                </>
              );
            })()}

            {/* Attack / Teleport Range Zone Perimeter while choosing a Target */}
            {pendingAttackChoice && (() => {
              const atkTok =
                (pendingAttackChoice.attackerTokenId &&
                  activeMap.tokens.find((t) => t.id === pendingAttackChoice.attackerTokenId)) ||
                (pendingAttackChoice.attackerCharacterId &&
                  activeMap.tokens.find(
                    (t) => t.type === 'character' && t.referenceId === pendingAttackChoice.attackerCharacterId
                  ));
              if (!atkTok) return null;
              const rawMaxSq = parseAttackRangeSquares(
                pendingAttackChoice.range,
                pendingAttackChoice.actionTitle,
                sqMeters
              );
              const maxSq = pendingAttackChoice.isTeleport && rawMaxSq <= 1
                ? Math.max(1, Math.round(9 / sqMeters))
                : rawMaxSq;
              const minX = Math.max(0, atkTok.x - maxSq);
              const minY = Math.max(0, atkTok.y - maxSq);
              const maxX = Math.min(activeMap.gridWidth - atkTok.size, atkTok.x + maxSq) + atkTok.size;
              const maxY = Math.min(activeMap.gridHeight - atkTok.size, atkTok.y + maxSq) + atkTok.size;
              return (
                <div
                  className={`absolute pointer-events-none z-5 border-2 rounded ${
                    pendingAttackChoice.isTeleport
                      ? 'border-cyan-400/80 border-dashed bg-cyan-500/10 shadow-[inset_0_0_24px_rgba(56,189,248,0.16)]'
                      : 'border-amber-400/75 bg-amber-500/8'
                  }`}
                  style={{
                    left: minX * cellPx,
                    top: minY * cellPx,
                    width: (maxX - minX) * cellPx,
                    height: (maxY - minY) * cellPx,
                  }}
                />
              );
            })()}

            {/* Live Interactive Teleport Ghost Preview (Misty Step / Thunder Step / Dimension Door) */}
            {pendingAttackChoice?.isTeleport && teleportHoverCell && (() => {
              const casterTok =
                (pendingAttackChoice.attackerTokenId &&
                  activeMap.tokens.find((t) => t.id === pendingAttackChoice.attackerTokenId)) ||
                (pendingAttackChoice.attackerCharacterId &&
                  activeMap.tokens.find(
                    (t) => t.type === 'character' && t.referenceId === pendingAttackChoice.attackerCharacterId
                  ));
              if (!casterTok) return null;
              const casterChar =
                casterTok.type === 'character' && casterTok.referenceId
                  ? campaign.characters.find((c) => c.id === casterTok.referenceId)
                  : undefined;
              const parsedRng = parseAttackRangeMeters(
                pendingAttackChoice.range,
                pendingAttackChoice.actionTitle
              );
              const maxRangeMeters = parsedRng > sqMeters ? parsedRng : 9;
              const val = validateTeleportDestination({
                map: activeMap,
                casterToken: casterTok,
                casterChar,
                targetX: teleportHoverCell.x,
                targetY: teleportHoverCell.y,
                maxRangeMeters,
                sqMeters,
                requiresSight: pendingAttackChoice.teleportRequiresSight !== false,
                isGm: role === 'gm',
                compendiumConditions: campaign.compendium.conditions,
              });
              const tokSize = Math.max(1, Math.round(casterTok.size || 1));
              const ghostPx = tokSize * cellPx;
              const gxPx = teleportHoverCell.x * cellPx;
              const gyPx = teleportHoverCell.y * cellPx;
              const origCxPx = (casterTok.x + tokSize / 2) * cellPx;
              const origCyPx = (casterTok.y + tokSize / 2) * cellPx;
              const destCxPx = (teleportHoverCell.x + tokSize / 2) * cellPx;
              const destCyPx = (teleportHoverCell.y + tokSize / 2) * cellPx;
              const accent = val.valid ? '#22d3ee' : '#ef4444';
              const aoeOriginPx =
                pendingAttackChoice.teleportAoeOrigin === 'arrival'
                  ? { x: destCxPx, y: destCyPx }
                  : { x: origCxPx, y: origCyPx };
              const aoeRadPx = pendingAttackChoice.aoeShape
                ? ((pendingAttackChoice.aoeSizeMeters || 3) / sqMeters / 2) * cellPx
                : 0;

              return (
                <div className="absolute inset-0 pointer-events-none z-35">
                  {/* Ethereal Blink Trajectory Line */}
                  <svg className="absolute inset-0 overflow-visible" width={totalW} height={totalH}>
                    <line
                      x1={origCxPx}
                      y1={origCyPx}
                      x2={destCxPx}
                      y2={destCyPx}
                      stroke={accent}
                      strokeWidth={2}
                      strokeDasharray="5 4"
                      opacity={0.75}
                    />
                  </svg>
                  {/* Optional Combined AoE Blast Preview (e.g. Passo Trovejante on departure or arrival) */}
                  {pendingAttackChoice.aoeShape && aoeRadPx > 0 && (
                    <div
                      className={`absolute border-2 border-dashed ${
                        pendingAttackChoice.aoeShape === 'cube' ? 'rounded-xs' : 'rounded-full'
                      }`}
                      style={{
                        left: aoeOriginPx.x - aoeRadPx,
                        top: aoeOriginPx.y - aoeRadPx,
                        width: aoeRadPx * 2,
                        height: aoeRadPx * 2,
                        borderColor: pendingAttackChoice.aoeColor || '#38bdf8',
                        backgroundColor: `${pendingAttackChoice.aoeColor || '#38bdf8'}22`,
                      }}
                    />
                  )}
                  {/* Translucent Token Destination Ghost */}
                  <div
                    className={`absolute rounded-full border-2 border-dashed flex items-center justify-center transition-transform ${
                      val.valid ? 'animate-pulse' : ''
                    }`}
                    style={{
                      left: gxPx,
                      top: gyPx,
                      width: ghostPx,
                      height: ghostPx,
                      borderColor: accent,
                      backgroundColor: val.valid ? 'rgba(34,211,238,0.18)' : 'rgba(239,68,68,0.22)',
                      boxShadow: `0 0 18px ${accent}66`,
                    }}
                  >
                    <div className={val.valid ? 'opacity-70' : 'opacity-40 grayscale'}>
                      <TokenPortrait
                        name={casterTok.name}
                        imageUrl={casterChar?.portraitUrl || casterTok.imageUrl}
                        playerColor={casterChar?.playerColor || casterTok.color}
                        frameStyle={casterChar?.tokenFrameStyle || casterTok.frameStyle || 'gold'}
                        sizePx={Math.max(24, ghostPx - 6)}
                      />
                    </div>
                  </div>
                  {/* Floating Status Tooltip */}
                  <div
                    className={`absolute px-2 py-0.5 rounded bg-black/90 border text-[10px] font-display font-bold whitespace-nowrap shadow-xl ${
                      val.valid ? 'text-cyan-200 border-cyan-400/70' : 'text-red-200 border-red-500/75'
                    }`}
                    style={{
                      left: Math.min(totalW - 220, gxPx + ghostPx + 8),
                      top: Math.max(4, gyPx - 8),
                    }}
                  >
                    {val.valid
                      ? `Teletransportar (${val.distanceMeters}m)${
                          pendingAttackChoice.aoeShape
                            ? ` • AoE na ${
                                pendingAttackChoice.teleportAoeOrigin === 'arrival' ? 'Chegada' : 'Saída'
                              }`
                            : ''
                        }`
                      : val.reason}
                  </div>
                </div>
              );
            })()}

            {/* Live Interactive Geometric AoE Preview when casting an AoE Ability */}
            {pendingAttackChoice?.aoeShape && !pendingAttackChoice?.isTeleport && (() => {
              const shape = pendingAttackChoice.aoeShape;
              const sizeMeters = pendingAttackChoice.aoeSizeMeters || 6;
              // Diameter for sphere, full side for cube, full length for cone/line
              const totalSq = Math.max(1, sizeMeters / sqMeters);
              const radiusSq = shape === 'sphere' ? totalSq / 2 : totalSq;
              const rPx = radiusSq * cellPx;
              const cx = aoeAimPos.x * cellPx;
              const cy = aoeAimPos.y * cellPx;
              const col =
                pendingAttackChoice.aoeColor ||
                (pendingAttackChoice.damageType?.toLowerCase().includes('fogo')
                  ? '#f97316'
                  : pendingAttackChoice.damageType?.toLowerCase().includes('gelo') ||
                      pendingAttackChoice.damageType?.toLowerCase().includes('frio')
                    ? '#38bdf8'
                    : '#a855f7');
              return (
                <div className="absolute inset-0 pointer-events-none z-35">
                  {shape === 'sphere' && (
                    <div
                      className="absolute rounded-full border-2 border-dashed animate-pulse"
                      style={{
                        left: cx - rPx,
                        top: cy - rPx,
                        width: rPx * 2,
                        height: rPx * 2,
                        borderColor: col,
                        backgroundColor: `${col}1f`,
                        boxShadow: `0 0 18px ${col}44`,
                      }}
                    />
                  )}
                  {shape === 'cube' && (
                    <div
                      className="absolute rounded border-2 border-dashed"
                      style={{
                        left: cx - rPx / 2,
                        top: cy - rPx / 2,
                        width: rPx,
                        height: rPx,
                        borderColor: col,
                        backgroundColor: `${col}1f`,
                      }}
                    />
                  )}
                  {(shape === 'cone' || shape === 'line') && (
                    <svg
                      className="absolute inset-0 overflow-visible"
                      width={totalW}
                      height={totalH}
                    >
                      <g transform={`translate(${cx}, ${cy}) rotate(${aoeAimPos.angleDeg})`}>
                        {shape === 'cone' ? (
                          <path
                            d={`M 0 0 L ${rPx} ${-rPx * 0.52} A ${rPx} ${rPx} 0 0 1 ${rPx} ${rPx * 0.52} Z`}
                            fill={`${col}24`}
                            stroke={col}
                            strokeWidth={2}
                            strokeDasharray="6 4"
                          />
                        ) : (
                          <rect
                            x={0}
                            y={-cellPx * 0.5}
                            width={rPx}
                            height={cellPx}
                            rx={4}
                            fill={`${col}24`}
                            stroke={col}
                            strokeWidth={2}
                            strokeDasharray="6 4"
                          />
                        )}
                      </g>
                    </svg>
                  )}
                  <div
                    className="absolute px-2 py-0.5 rounded bg-black/85 border text-[10px] font-display font-bold text-amber-200 whitespace-nowrap shadow-xl"
                    style={{ left: cx + 10, top: Math.max(4, cy - 26), borderColor: col }}
                  >
                    {pendingAttackChoice.actionTitle} ({sizeMeters}m) • Clique para conjurar
                    {shape === 'cone' || shape === 'line' ? ' • [R] Girar' : ''}
                  </div>
                </div>
              );
            })()}

            {/* AoE Templates (Sphere, Cube, Cone, Line — Half-Cell Snap, Resizable & 360° Rotatable) */}
            {activeMap.templates.map((tmpl) => {
              const isLine = tmpl.shape === 'line';
              const isCube = tmpl.shape === 'cube';
              const isCone = tmpl.shape === 'cone';
              const isRotatable = isCone || isLine;
              const extentSquares = isLine ? tmpl.radiusSquares * 2 : tmpl.radiusSquares;
              const sizePx = extentSquares * 2 * cellPx;
              const isSelected = selectedTemplateId === tmpl.id;
              const originPxX = (tmpl.x + 0.5) * cellPx;
              const originPxY = (tmpl.y + 0.5) * cellPx;

              const metricSquares = isCube || isLine ? tmpl.radiusSquares * 2 : tmpl.radiusSquares;
              const meters =
                Math.round(metricSquares * campaign.settings.gridSquareMeters * 10) / 10;
              const feet = Math.round((meters / 1.5) * 5);
              const shapeLabel = isCone
                ? `Cone ${meters}m • ${feet} ft`
                : isLine
                  ? `Linha ${meters}m • ${feet} ft`
                  : isCube
                    ? `Cubo ${meters}m • ${feet} ft`
                    : `Esfera ${meters}m • ${feet} ft`;

              const handleTemplateDown = (e: React.MouseEvent) => {
                if (role !== 'gm') return;
                e.stopPropagation();
                if (e.button === 0) {
                  setSelectedTemplateId(tmpl.id);
                  setDraggingTemplateId(tmpl.id);
                }
              };
              const handleTemplateWheel = (e: React.WheelEvent) => {
                if (role !== 'gm' || !isRotatable) return;
                e.stopPropagation();
                const delta = e.deltaY > 0 ? 15 : -15;
                updateActiveMap((m) => ({
                  ...m,
                  templates: m.templates.map((t) =>
                    t.id === tmpl.id ? { ...t, angleDeg: (t.angleDeg + delta + 360) % 360 } : t
                  ),
                }));
              };
              const handleTemplateContext = (e: React.MouseEvent) => {
                if (role !== 'gm') return;
                e.preventDefault();
                e.stopPropagation();
                updateActiveMap((m) => ({
                  ...m,
                  templates: m.templates.filter((t) => t.id !== tmpl.id),
                }));
              };

              // Line beam thickness in viewBox (200x200) matching ~1 grid square width
              const lineHalfThickVb = Math.max(5, Math.min(22, 50 / Math.max(1, extentSquares)));
              const templateInteractiveClass =
                role === 'gm' && !pendingAttackChoice
                  ? 'pointer-events-auto cursor-grab active:cursor-grabbing'
                  : 'pointer-events-none';

              return (
                <div
                  key={tmpl.id}
                  onWheel={handleTemplateWheel}
                  className="absolute select-none pointer-events-none"
                  style={{
                    left: originPxX - sizePx / 2,
                    top: originPxY - sizePx / 2,
                    width: sizePx,
                    height: sizePx,
                    zIndex: isSelected ? 14 : 8,
                  }}
                >
                  {isCone ? (
                    <svg
                      viewBox="0 0 200 200"
                      className="w-full h-full pointer-events-none"
                      style={{
                        transform: `rotate(${tmpl.angleDeg}deg)`,
                        transition: 'transform 0.1s ease-out',
                      }}
                    >
                      {/* 60-degree directional cone originating at (100,100) pointing right */}
                      <path
                        d="M 100 100 L 186.6 50 A 100 100 0 0 1 186.6 150 Z"
                        fill={tmpl.color}
                        stroke="#fb923c"
                        strokeWidth="3"
                        strokeDasharray="6 4"
                        className={templateInteractiveClass}
                        onMouseDown={handleTemplateDown}
                        onContextMenu={handleTemplateContext}
                      >
                        {role === 'gm' && (
                          <title>Cone: Arraste (centros, bordas ou vértices) • Roda do mouse para girar • Botão direito remove</title>
                        )}
                      </path>
                      <circle
                        cx="100"
                        cy="100"
                        r="7"
                        fill="#fbbf24"
                        stroke="#090b10"
                        strokeWidth="2"
                        className={templateInteractiveClass}
                        onMouseDown={handleTemplateDown}
                        onContextMenu={handleTemplateContext}
                      />
                    </svg>
                  ) : isLine ? (
                    <svg
                      viewBox="0 0 200 200"
                      className="w-full h-full pointer-events-none"
                      style={{
                        transform: `rotate(${tmpl.angleDeg}deg)`,
                        transition: 'transform 0.1s ease-out',
                      }}
                    >
                      {/* Directional Line beam originating at (100,100) extending right */}
                      <rect
                        x="100"
                        y={100 - lineHalfThickVb}
                        width="98"
                        height={lineHalfThickVb * 2}
                        rx="3"
                        fill={tmpl.color}
                        stroke="#38bdf8"
                        strokeWidth="2.5"
                        strokeDasharray="6 4"
                        className={templateInteractiveClass}
                        onMouseDown={handleTemplateDown}
                        onContextMenu={handleTemplateContext}
                      >
                        {role === 'gm' && (
                          <title>Linha: Arraste (centros, bordas ou vértices) • Roda do mouse para girar • Botão direito remove</title>
                        )}
                      </rect>
                      <line
                        x1="100"
                        y1="100"
                        x2="196"
                        y2="100"
                        stroke="rgba(224,242,254,0.45)"
                        strokeWidth="1.2"
                        strokeDasharray="4 4"
                        className="pointer-events-none"
                      />
                      <circle
                        cx="100"
                        cy="100"
                        r="6.5"
                        fill="#38bdf8"
                        stroke="#090b10"
                        strokeWidth="2"
                        className={templateInteractiveClass}
                        onMouseDown={handleTemplateDown}
                        onContextMenu={handleTemplateContext}
                      />
                    </svg>
                  ) : isCube ? (
                    <svg viewBox="0 0 200 200" className="w-full h-full pointer-events-none">
                      <rect
                        x="4"
                        y="4"
                        width="192"
                        height="192"
                        rx="4"
                        fill={tmpl.color}
                        stroke="#c084fc"
                        strokeWidth="3.5"
                        strokeDasharray="8 5"
                        className={templateInteractiveClass}
                        onMouseDown={handleTemplateDown}
                        onContextMenu={handleTemplateContext}
                      >
                        {role === 'gm' && (
                          <title>Cubo: Arraste para mover • Clique para redimensionar ou disparar salvaguarda • Botão direito remove</title>
                        )}
                      </rect>
                      <rect
                        x="38"
                        y="38"
                        width="124"
                        height="124"
                        fill="none"
                        stroke="rgba(255,255,255,0.2)"
                        strokeWidth="1.5"
                        className="pointer-events-none"
                      />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 200 200" className="w-full h-full pointer-events-none">
                      <circle
                        cx="100"
                        cy="100"
                        r="96"
                        fill={tmpl.color}
                        stroke="#f87171"
                        strokeWidth="3"
                        strokeDasharray="8 5"
                        className={templateInteractiveClass}
                        onMouseDown={handleTemplateDown}
                        onContextMenu={handleTemplateContext}
                      >
                        {role === 'gm' && (
                          <title>Esfera: Arraste para mover • Clique para redimensionar ou disparar salvaguarda • Botão direito remove</title>
                        )}
                      </circle>
                      <circle
                        cx="100"
                        cy="100"
                        r="55"
                        fill="none"
                        stroke="rgba(255,255,255,0.25)"
                        strokeWidth="1.5"
                        className="pointer-events-none"
                      />
                    </svg>
                  )}

                  {/* Center label */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="bg-black/80 px-2 py-0.5 rounded-md text-[10px] font-mono-dice font-bold text-white border border-white/25 whitespace-nowrap">
                      {shapeLabel}
                    </span>
                  </div>

                  {/* Floating Controls on Click */}
                  {isSelected && (
                    <div
                      onMouseDown={(e) => e.stopPropagation()}
                      className="pointer-events-auto absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[calc(50%+34px)] rpg-glass-panel rounded-md px-2 py-1 flex items-center gap-1.5 text-[11px] whitespace-nowrap z-30 shadow-xl"
                    >
                      {isRotatable && (
                        <button
                          type="button"
                          onClick={() =>
                            updateActiveMap((m) => ({
                              ...m,
                              templates: m.templates.map((t) =>
                                t.id === tmpl.id
                                  ? { ...t, angleDeg: (t.angleDeg + 45) % 360 }
                                  : t
                              ),
                            }))
                          }
                          className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 flex items-center gap-0.5 cursor-pointer hover:bg-amber-500/35"
                          title="Girar 45° (ou use a roda do mouse)"
                        >
                          <RotateCw className="w-3 h-3" /> Girar
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          const step = isCube ? 0.5 : 1;
                          const minVal = isCube ? 0.5 : 1;
                          updateActiveMap((m) => ({
                            ...m,
                            templates: m.templates.map((t) =>
                              t.id === tmpl.id
                                ? { ...t, radiusSquares: Math.max(minVal, t.radiusSquares - step) }
                                : t
                            ),
                          }));
                        }}
                        className="px-1.5 py-0.5 rounded bg-black/40 cursor-pointer"
                        title="Diminuir tamanho"
                      >
                        -
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const step = isCube ? 0.5 : 1;
                          updateActiveMap((m) => ({
                            ...m,
                            templates: m.templates.map((t) =>
                              t.id === tmpl.id
                                ? { ...t, radiusSquares: Math.min(10, t.radiusSquares + step) }
                                : t
                            ),
                          }));
                        }}
                        className="px-1.5 py-0.5 rounded bg-black/40 cursor-pointer"
                        title="Aumentar tamanho"
                      >
                        +
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowAoESaveForm((v) => !v)}
                        className="px-2 py-0.5 rounded bg-red-950/90 border border-red-500/60 text-red-200 font-display font-bold text-[10px] flex items-center gap-1 cursor-pointer hover:bg-red-900"
                        title="Disparar Salvaguarda em todos os tokens dentro desta área"
                      >
                        <Flame className="w-3 h-3 text-amber-300" />
                        <span>Salvaguarda AoE</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          updateActiveMap((m) => ({
                            ...m,
                            templates: m.templates.filter((t) => t.id !== tmpl.id),
                          }));
                          setSelectedTemplateId(null);
                          setShowAoESaveForm(false);
                        }}
                        className="px-1.5 py-0.5 rounded text-red-400 hover:bg-red-500/20 cursor-pointer"
                        title="Remover área"
                      >
                        ✕
                      </button>
                    </div>
                  )}

                  {/* AoE Batch Saving Throw Config Popover */}
                  {isSelected && showAoESaveForm && (
                    <div
                      onMouseDown={(e) => e.stopPropagation()}
                      className="pointer-events-auto absolute top-1/2 left-1/2 -translate-x-1/2 translate-y-4 w-64 rpg-glass-panel rounded-lg p-3 space-y-2 text-[11px] z-40 shadow-2xl cursor-default"
                    >
                      <div className="flex items-center justify-between border-b pb-1" style={{ borderColor: 'var(--border-subtle)' }}>
                        <span className="font-display font-bold text-amber-300">
                          Disparar Magia em Área (AoE)
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowAoESaveForm(false)}
                          className="opacity-70 hover:opacity-100 cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>
                      <input
                        value={aoeTitle}
                        onChange={(e) => setAoeTitle(e.target.value)}
                        placeholder="Nome (ex: Bola de Fogo)"
                        className="rpg-input w-full py-1"
                      />
                      <div className="grid grid-cols-2 gap-1.5">
                        <div>
                          <label className="block text-[9px] opacity-75 mb-0.5">Salvaguarda</label>
                          <select
                            value={aoeSaveSkill}
                            onChange={(e) => setAoeSaveSkill(e.target.value)}
                            className="rpg-input w-full py-1 text-[10px]"
                          >
                            <option value="salv-forca">Vigor Físico (FOR)</option>
                            <option value="reflexos">Reflexos (DES)</option>
                            <option value="fortitude">Resiliência (CON)</option>
                            <option value="salv-inteligencia">Lucidez (INT)</option>
                            <option value="vontade">Vontade (SAB)</option>
                            <option value="salv-carisma">Presença (CAR)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[9px] opacity-75 mb-0.5">CD</label>
                          <input
                            type="number"
                            value={aoeDc}
                            onChange={(e) => setAoeDc(Number(e.target.value) || 10)}
                            className="rpg-input w-full py-1 text-center"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <div>
                          <label className="block text-[9px] opacity-75 mb-0.5">Dano</label>
                          <input
                            value={aoeDamageFormula}
                            onChange={(e) => setAoeDamageFormula(e.target.value)}
                            placeholder="6d6"
                            className="rpg-input w-full py-1 font-mono-dice"
                          />
                        </div>
                        <div>
                          <label className="block text-[9px] opacity-75 mb-0.5">Tipo</label>
                          <select
                            value={aoeDamageType}
                            onChange={(e) => setAoeDamageType(e.target.value)}
                            className="rpg-input w-full py-1 text-[10px]"
                          >
                            {DAMAGE_TYPE_OPTIONS.map((dt) => (
                              <option key={dt} value={dt}>
                                {dt}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <label className="flex items-center gap-1.5 text-[10px] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={aoeHalfOnSuccess}
                          onChange={(e) => setAoeHalfOnSuccess(e.target.checked)}
                        />
                        <span>Metade do dano se passar na salvaguarda</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          const labelMap: Record<string, string> = {
                            'salv-forca': 'Vigor Físico (FOR)',
                            reflexos: 'Reflexos (DES)',
                            fortitude: 'Resiliência (CON)',
                            'salv-inteligencia': 'Lucidez (INT)',
                            vontade: 'Vontade (SAB)',
                            'salv-carisma': 'Presença (CAR)',
                          };
                          triggerAoESavePrompt(tmpl.id, {
                            title: aoeTitle.trim() || tmpl.label,
                            saveSkillId: aoeSaveSkill,
                            saveLabel: labelMap[aoeSaveSkill] || 'Reflexos (DES)',
                            dc: aoeDc,
                            damageFormula: aoeDamageFormula,
                            damageType: aoeDamageType,
                            halfOnSuccess: aoeHalfOnSuccess,
                          });
                          setShowAoESaveForm(false);
                        }}
                        className="w-full rpg-btn-crimson py-1.5 rounded-md font-display font-bold text-xs cursor-pointer"
                      >
                        🔥 Disparar Salvaguarda nos Alvos
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Dynamic Token Light Auras (Shared Light for all; Personal Darkvision only for owner + GM!) */}
            <div className="absolute inset-0 pointer-events-none z-8 overflow-hidden">
              {/* Static GM Map Light Point Visual Halos */}
              {(activeMap.gmMarkers || []).map((mk) => {
                if (mk.kind !== 'light' || mk.lightEnabled === false) return null;
                if (revealedFogSet && !revealedFogSet.has(`${mk.x},${mk.y}`)) return null;
                const rainDampen =
                  activeMap.weatherEffectsEnabled && activeMap.weather === 'rain' ? 0.5 : 1;
                let rM = (mk.lightRadiusMeters ?? 6) * rainDampen;
                if (activeMap.weatherEffectsEnabled && activeMap.weather === 'mist') {
                  rM = Math.min(rM, 6);
                }
                if (rM <= 0) return null;
                const rPx = (rM / Math.max(0.5, sqMeters)) * cellPx;
                const lcx = (mk.x + 0.5) * cellPx;
                const lcy = (mk.y + 0.5) * cellPx;
                const col = mk.lightColor || '#f59e0b';
                return (
                  <div
                    key={`static-light-${mk.id}`}
                    className="absolute rounded-full pointer-events-none transition-opacity duration-200 animate-torch-flicker"
                    style={{
                      left: lcx - rPx,
                      top: lcy - rPx,
                      width: rPx * 2,
                      height: rPx * 2,
                      opacity: rainDampen < 1 ? 0.6 : 0.9,
                      background: `radial-gradient(circle, ${col}44 0%, ${col}22 48%, ${col}08 75%, transparent 100%)`,
                      mixBlendMode: 'screen',
                    }}
                  />
                );
              })}

              {activeMap.tokens.map((tok) => {
                const spottedLight = Boolean(
                  myCharacter && (tok.visibleToCharacterIds || []).includes(myCharacter.id)
                );
                if (tok.isHidden && role !== 'gm' && !spottedLight) return null;
                const isOwnLightTok = Boolean(
                  myCharacter &&
                    ((tok.type === 'character' && tok.referenceId === myCharacter.id) ||
                      tok.controlledByCharacterId === myCharacter.id)
                );
                const auraLinkedChar =
                  tok.type === 'character' && tok.referenceId
                    ? campaign.characters.find((c) => c.id === tok.referenceId)
                    : undefined;
                const auraConds = auraLinkedChar?.activeConditionIds || tok.activeConditionIds || [];
                const auraSz = getConditionVisualTransform(auraConds, campaign).size ?? tok.size ?? 1;
                if (revealedFogSet && !isOwnLightTok) {
                  let anyFogCell = false;
                  const sz = Math.max(1, auraSz);
                  for (let dx = 0; dx < sz && !anyFogCell; dx++) {
                    for (let dy = 0; dy < sz && !anyFogCell; dy++) {
                      if (revealedFogSet.has(`${Math.floor(tok.x) + dx},${Math.floor(tok.y) + dy}`)) {
                        anyFogCell = true;
                      }
                    }
                  }
                  if (!anyFogCell) return null;
                }
                const { sharedRadiusM, personalRadiusM } = resolveTokenLightForViewer(
                  tok,
                  campaign,
                  role,
                  myCharacter?.id
                );
                const rainDampen =
                  activeMap.weatherEffectsEnabled && activeMap.weather === 'rain' ? 0.5 : 1;
                const effSharedM = sharedRadiusM * rainDampen;
                let radiusM = Math.max(effSharedM, personalRadiusM);
                if (activeMap.weatherEffectsEnabled && activeMap.weather === 'mist') {
                  radiusM = Math.min(radiusM, 6);
                }
                if (radiusM <= 0) return null;
                const radiusPx = (radiusM / Math.max(0.5, sqMeters)) * cellPx;
                const cx = (tok.x + auraSz / 2) * cellPx;
                const cy = (tok.y + auraSz / 2) * cellPx;
                const isPersonalOnly = effSharedM <= 0 && personalRadiusM > 0;
                const isTorch = tok.lightSource === 'torch';
                const rainOpacity = rainDampen < 1 && !isPersonalOnly ? 0.65 : 1;
                const grad = isPersonalOnly
                  ? 'radial-gradient(circle, rgba(129,140,248,0.16) 0%, rgba(99,102,241,0.08) 55%, transparent 78%)'
                  : isTorch
                    ? 'radial-gradient(circle, rgba(251,146,60,0.28) 0%, rgba(245,158,11,0.14) 50%, rgba(217,119,6,0.04) 74%, transparent 100%)'
                    : 'radial-gradient(circle, rgba(253,224,71,0.24) 0%, rgba(250,204,21,0.12) 55%, transparent 82%)';
                return (
                  <div
                    key={`light-${tok.id}`}
                    className={`absolute rounded-full pointer-events-none transition-opacity duration-200 ${
                      isTorch ? 'animate-torch-flicker' : ''
                    }`}
                    style={{
                      left: cx - radiusPx,
                      top: cy - radiusPx,
                      width: radiusPx * 2,
                      height: radiusPx * 2,
                      opacity: rainOpacity,
                      background: grad,
                      mixBlendMode: 'screen',
                    }}
                  />
                );
              })}
            </div>

            {/* Visual Concentration Arcane Tethers (Caster -> Concentrating Spell Targets) */}
            {(() => {
              const tethers: Array<{
                key: string;
                x1: number;
                y1: number;
                x2: number;
                y2: number;
                label: string;
                color: string;
              }> = [];
              activeMap.tokens.forEach((casterTok) => {
                if (casterTok.type !== 'character' || !casterTok.referenceId) return;
                if (casterTok.isHidden && role !== 'gm') return;
                const casterChar = campaign.characters.find((c) => c.id === casterTok.referenceId);
                if (!casterChar?.concentratingSpell || !casterChar.activeTrackedEffects?.length) return;
                const x1 = (casterTok.x + (casterTok.size || 1) / 2) * cellPx;
                const y1 = (casterTok.y + (casterTok.size || 1) / 2) * cellPx;
                const color = casterChar.playerColor || '#e8c266';
                casterChar.activeTrackedEffects
                  .filter((e) => e.isConcentration)
                  .forEach((eff) => {
                    eff.targetTokenIds.forEach((tid) => {
                      if (tid === casterTok.id) return;
                      const targetTok = activeMap.tokens.find((t) => t.id === tid);
                      if (!targetTok || (targetTok.isHidden && role !== 'gm')) return;
                      if (role !== 'gm') {
                        const tSz = Math.max(1, targetTok.size || 1);
                        if (revealedFogSet) {
                          let inFog = false;
                          for (let dx = 0; dx < tSz && !inFog; dx++) {
                            for (let dy = 0; dy < tSz && !inFog; dy++) {
                              if (revealedFogSet.has(`${Math.floor(targetTok.x) + dx},${Math.floor(targetTok.y) + dy}`)) {
                                inFog = true;
                              }
                            }
                          }
                          if (!inFog) return;
                        }
                        if (darknessLitCells) {
                          let inLight = false;
                          for (let dx = 0; dx < tSz && !inLight; dx++) {
                            for (let dy = 0; dy < tSz && !inLight; dy++) {
                              if (darknessLitCells.has(`${Math.floor(targetTok.x) + dx},${Math.floor(targetTok.y) + dy}`)) {
                                inLight = true;
                              }
                            }
                          }
                          if (!inLight) return;
                        }
                      }
                      const x2 = (targetTok.x + (targetTok.size || 1) / 2) * cellPx;
                      const y2 = (targetTok.y + (targetTok.size || 1) / 2) * cellPx;
                      tethers.push({
                        key: `${casterTok.id}-${tid}-${eff.abilityKey}`,
                        x1,
                        y1,
                        x2,
                        y2,
                        label: eff.abilityName,
                        color,
                      });
                    });
                  });
              });
              if (tethers.length === 0) return null;
              return (
                <svg
                  className="absolute inset-0 pointer-events-none z-9"
                  width={activeMap.gridWidth * cellPx}
                  height={activeMap.gridHeight * cellPx}
                >
                  {tethers.map((t) => {
                    const mx = (t.x1 + t.x2) / 2;
                    const my = (t.y1 + t.y2) / 2 - 18;
                    return (
                      <g key={t.key}>
                        <path
                          d={`M ${t.x1} ${t.y1} Q ${mx} ${my} ${t.x2} ${t.y2}`}
                          fill="none"
                          stroke={t.color}
                          strokeWidth={3.5}
                          strokeOpacity={0.22}
                        />
                        <path
                          d={`M ${t.x1} ${t.y1} Q ${mx} ${my} ${t.x2} ${t.y2}`}
                          fill="none"
                          stroke="#fde68a"
                          strokeWidth={1.6}
                          strokeDasharray="6 5"
                          strokeOpacity={0.82}
                        />
                        <circle cx={t.x2} cy={t.y2} r={4} fill="#fde68a" fillOpacity={0.85} />
                      </g>
                    );
                  })}
                </svg>
              );
            })()}

            {/* Tokens with Token Stamp (#7), Turn Aura, Click Menu, Slash VFX & Floating Damage */}
            {activeMap.tokens.map((tok) => {
              const isSpottedByMe = Boolean(
                myCharacter && (tok.visibleToCharacterIds || []).includes(myCharacter.id)
              );
              if (tok.isHidden && role !== 'gm' && !isSpottedByMe) return null;
              const linkedChar =
                tok.type === 'character' && tok.referenceId
                  ? campaign.characters.find((c) => c.id === tok.referenceId)
                  : null;
              const linkedMonster =
                tok.type === 'monster' && tok.referenceId
                  ? campaign.compendium.monsters.find((m) => m.id === tok.referenceId)
                  : null;
              const effectiveCondIds = linkedChar?.activeConditionIds || tok.activeConditionIds || [];
              const condTransform = getConditionVisualTransform(effectiveCondIds, campaign);
              const effectiveTokSize = condTransform.size ?? tok.size;
              const isOwnControlledTok = Boolean(
                myCharacter &&
                  ((tok.type === 'character' && tok.referenceId === myCharacter.id) ||
                    tok.controlledByCharacterId === myCharacter.id)
              );
              if (revealedFogSet && role !== 'gm' && !isOwnControlledTok) {
                let anyCellRevealed = false;
                const sz = Math.max(1, effectiveTokSize || 1);
                for (let dx = 0; dx < sz && !anyCellRevealed; dx++) {
                  for (let dy = 0; dy < sz && !anyCellRevealed; dy++) {
                    if (revealedFogSet.has(`${Math.floor(tok.x) + dx},${Math.floor(tok.y) + dy}`)) {
                      anyCellRevealed = true;
                    }
                  }
                }
                if (!anyCellRevealed) return null;
              }
              if (darknessLitCells && role !== 'gm' && !isOwnControlledTok) {
                let anyCellLit = false;
                const sz = Math.max(1, effectiveTokSize || 1);
                for (let dx = 0; dx < sz && !anyCellLit; dx++) {
                  for (let dy = 0; dy < sz && !anyCellLit; dy++) {
                    if (darknessLitCells.has(`${Math.floor(tok.x) + dx},${Math.floor(tok.y) + dy}`)) {
                      anyCellLit = true;
                    }
                  }
                }
                if (!anyCellLit) return null;
              }
              const isTarget = tok.id === targetTokenId;
              const isMenuOpen = tok.id === selectedTokenId;
              const isCurrentTurn =
                activeTurnCombatant &&
                (activeTurnCombatant.tokenId === tok.id ||
                  (tok.type === 'character' &&
                    activeTurnCombatant.type === 'character' &&
                    tok.referenceId &&
                    activeTurnCombatant.referenceId === tok.referenceId));
              const tokenColor = linkedChar?.playerColor || tok.color;
              const frameStyle =
                linkedChar?.tokenFrameStyle ||
                tok.frameStyle ||
                (tok.type === 'character' ? 'gold' : 'crimson');
              const portraitImg = condTransform.imageUrl || linkedChar?.portraitUrl || tok.imageUrl;

              const tokPx = effectiveTokSize * cellPx;
              const hpPct = Math.max(0, Math.min(100, (tok.hp / Math.max(1, tok.maxHp)) * 100));
              const tokenVfx = floatingVfx.filter((v) => v.tokenId === tok.id);
              const tokenSlashes = slashVfx.filter((s) => s.tokenId === tok.id);
              const hasHitSlash = tokenSlashes.some((s) => s.kind === 'hit');

              // Active hero attacks for quick menu
              const activeHero =
                role === 'player'
                  ? myCharacter || campaign.characters[0]
                  : campaign.characters.find((c) => c.id === activeCharacterId) ||
                    campaign.characters[0];

              const heroAttacks: PendingAttackChoice[] = activeHero
                ? (() => {
                    const heroTok = activeMap.tokens.find(
                      (t) => t.type === 'character' && t.referenceId === activeHero.id
                    );
                    return [
                      ...(activeHero.customAttacks || []).map((a) => ({
                        attackerTokenId: heroTok?.id,
                        attackerName: activeHero.name,
                        attackerColor: activeHero.playerColor || activeHero.tokenColor,
                        attackerImageUrl: activeHero.portraitUrl,
                        attackerFrame: activeHero.tokenFrameStyle || 'gold',
                        attackerCharacterId: activeHero.id,
                        diceSkin: activeHero.diceSkin || 'gold',
                        actionTitle: a.name,
                        attackFormula: a.attackBonusFormula,
                        damageFormula: a.damageFormula,
                        damageType: a.damageType,
                        range: a.range,
                        actionCost: 'Padrão' as const,
                        isWeaponAttack: true,
                      })),
                      ...activeHero.inventory
                        .filter((inv) => inv.equipped)
                        .map((inv) => campaign.compendium.items.find((i) => i.id === inv.itemId))
                        .filter((it): it is NonNullable<typeof it> => Boolean(it?.attackFormula))
                        .map((it) => ({
                          attackerTokenId: heroTok?.id,
                          attackerName: activeHero.name,
                          attackerColor: activeHero.playerColor || activeHero.tokenColor,
                          attackerImageUrl: activeHero.portraitUrl,
                          attackerFrame: activeHero.tokenFrameStyle || 'gold',
                          attackerCharacterId: activeHero.id,
                          diceSkin: activeHero.diceSkin || 'gold',
                          actionTitle: it.name,
                          attackFormula: it.attackFormula,
                          damageFormula: it.damageFormula,
                          damageType: it.damageType,
                          range: it.range || 'Corpo a Corpo (1,5m)',
                          actionCost: 'Padrão' as const,
                          isWeaponAttack: true,
                          critRange: it.critRange,
                          critMultiplier: it.critMultiplier,
                        })),
                    ];
                  })()
                : [];

              const activeHeroTok = activeHero
                ? activeMap.tokens.find(
                    (t) => t.type === 'character' && t.referenceId === activeHero.id
                  )
                : undefined;

              const pendingAtkToken = pendingAttackChoice
                ? (pendingAttackChoice.attackerTokenId &&
                    activeMap.tokens.find((t) => t.id === pendingAttackChoice.attackerTokenId)) ||
                  (pendingAttackChoice.attackerCharacterId &&
                    activeMap.tokens.find(
                      (t) =>
                        t.type === 'character' &&
                        t.referenceId === pendingAttackChoice.attackerCharacterId
                    ))
                : undefined;

              const pendingMaxMeters = pendingAttackChoice
                ? parseAttackRangeMeters(pendingAttackChoice.range, pendingAttackChoice.actionTitle)
                : Infinity;
              const pendingDist =
                pendingAttackChoice && pendingAtkToken && pendingAtkToken.id !== tok.id
                  ? getToken3DDistance(pendingAtkToken, tok, sqMeters).meters3D
                  : 0;
              const isOutOfPendingRange =
                Boolean(pendingAttackChoice && pendingAtkToken && pendingAtkToken.id !== tok.id) &&
                pendingDist > pendingMaxMeters + 0.05;

              const removeTokenFromMapAndCombat = () => {
                updateCampaign((prev) =>
                  removeTokensFromMapAndCombat(prev, activeMap.id, new Set([tok.id]))
                );
                if (targetTokenId === tok.id) setTargetTokenId(null);
                setSelectedTokenId(null);
              };

              return (
                <div
                  key={tok.id}
                  draggable={false}
                  onDragStart={(e) => e.preventDefault()}
                  onMouseEnter={() => setHoveredTokenId(tok.id)}
                  onMouseLeave={() =>
                    setHoveredTokenId((curr) => (curr === tok.id ? null : curr))
                  }
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    if (e.button === 2 && pendingAttackChoice) {
                      setPendingAttackChoice(null);
                      return;
                    }
                    if (pendingAttackChoice) {
                      if (pendingAttackChoice.isTeleport) {
                        executeTeleportAbility(pendingAttackChoice, tok.x, tok.y);
                        return;
                      }
                      if (pendingAttackChoice.aoeShape) {
                        const { rawX, rawY } = getCellFromEvent(e);
                        const snappedX = Math.max(
                          0,
                          Math.min(activeMap.gridWidth, Math.round(rawX * 2) / 2)
                        );
                        const snappedY = Math.max(
                          0,
                          Math.min(activeMap.gridHeight, Math.round(rawY * 2) / 2)
                        );
                        castAoEAbility(
                          pendingAttackChoice,
                          snappedX,
                          snappedY,
                          aoeAimPos.angleDeg
                        );
                        return;
                      }
                      startCombatDuel(pendingAttackChoice, tok);
                      return;
                    }
                    if (e.button === 2) {
                      setTargetTokenId(isTarget ? null : tok.id);
                      return;
                    }
                    if (
                      tool === 'ping' ||
                      (role === 'player' &&
                        e.button === 0 &&
                        e.shiftKey &&
                        tool === 'select' &&
                        !pendingAttackChoice)
                    ) {
                      const pingColor =
                        role === 'player'
                          ? myCharacter?.playerColor || myPlayerColor || '#38bdf8'
                          : myPlayerColor || '#d4ad5c';
                      const centerGx = tok.x + Math.floor((tok.size || 1) / 2);
                      const centerGy = tok.y + Math.floor((tok.size || 1) / 2);
                      sendPing(activeMap.id, centerGx, centerGy, pingColor);
                      return;
                    }
                    if (tool === 'select') {
                      didDragTokenRef.current = false;
                      if (hasActiveOpportunityPrompt && opportunityPrompt) {
                        showTacticalAlert(
                          `Ataque de Oportunidade em aberto (${opportunityPrompt.reactorName} → ${opportunityPrompt.targetName})! Resolva ou passe a reação antes de mover.`
                        );
                        return;
                      }
                      if (activeDuel) {
                        return;
                      }
                      if (role === 'player') {
                        const isOwnTok = Boolean(
                          myCharacter &&
                            ((tok.type === 'character' && tok.referenceId === myCharacter.id) ||
                              tok.controlledByCharacterId === myCharacter.id)
                        );
                        if (!isOwnTok) {
                          // Players can click other tokens to open context actions/attacks, but never drag them
                          return;
                        }
                        if (tok.hp <= 0) {
                          showTacticalAlert('Seu personagem está caído (0 PV) e não pode se mover!');
                          return;
                        }
                        const immobCondIds = linkedChar?.activeConditionIds || tok.activeConditionIds || [];
                        const immobCond = immobCondIds
                          .map((cid) => campaign.compendium.conditions.find((c) => c.id === cid))
                          .find(
                            (c) =>
                              c &&
                              /paralisad|atordoad|petrificad|inconscient|agarrad|imobilizad|incapacitad/i.test(
                                c.name
                              )
                          );
                        if (immobCond) {
                          showTacticalAlert(
                            `${tok.name} está ${immobCond.icon} ${immobCond.name} e não pode se mover!`
                          );
                          return;
                        }
                        if (linkedChar) {
                          const charStats = computeCharacterStats(linkedChar, campaign);
                          if (charStats.speed <= 0) {
                            showTacticalAlert('Seu deslocamento atual é 0m — você não pode se mover!');
                            return;
                          }
                        }
                        if (campaign.combat.active) {
                          const cb = findTokenCombatant(tok);
                          if (activeTurnCombatant && (!cb || activeTurnCombatant.id !== cb.id)) {
                            const turnDispName = maskHiddenNameForRole(
                              activeTurnCombatant.name,
                              role,
                              campaign,
                              activeTurnCombatant.tokenId
                            );
                            showTacticalAlert(
                              `Aguarde seu turno na iniciativa (${turnDispName} está agindo).`
                            );
                            return;
                          }
                          if (cb && (cb.remainingMoveMeters ?? cb.speedMeters ?? 9) < sqMeters) {
                            showTacticalAlert('Deslocamento esgotado neste turno! Use Disparada (Dash) ou encerre o turno.');
                            return;
                          }
                        }
                      }
                      didDragTokenRef.current = false;
                      const { gx: grabGx, gy: grabGy } = getCellFromEvent(e);
                      const maxOff = Math.max(0, (tok.size || 1) - 1);
                      setDraggingTokenId(tok.id);
                      setDragOrigin({
                        tokenId: tok.id,
                        x: tok.x,
                        y: tok.y,
                        shiftFree: role === 'gm' && e.shiftKey,
                        grabDx: Math.max(0, Math.min(maxOff, grabGx - tok.x)),
                        grabDy: Math.max(0, Math.min(maxOff, grabGy - tok.y)),
                      });
                      setDragPath([{ x: tok.x, y: tok.y }]);
                    } else if (tool === 'ruler') {
                      setRulerStart({ x: tok.x, y: tok.y });
                      setRulerEnd({ x: tok.x, y: tok.y });
                    }
                  }}
                  onMouseUp={(e) => {
                    e.stopPropagation();
                    if (
                      e.button === 0 &&
                      tool === 'select' &&
                      !didDragTokenRef.current &&
                      !pendingAttackChoice &&
                      !(role === 'player' && e.shiftKey)
                    ) {
                      if (role === 'gm' && (e.ctrlKey || e.metaKey || e.shiftKey)) {
                        setSelectedTokenIds((prev) =>
                          prev.includes(tok.id)
                            ? prev.filter((id) => id !== tok.id)
                            : [...prev, tok.id]
                        );
                        setSelectedTokenId(null);
                      } else {
                        const wasAlreadySelected = targetTokenId === tok.id;
                        setSelectedTokenIds([tok.id]);
                        setTargetTokenId(tok.id);
                        if (
                          tok.type === 'character' &&
                          tok.referenceId &&
                          (role === 'gm' || tok.referenceId === myCharacter?.id)
                        ) {
                          setActiveCharacterId(tok.referenceId);
                        }
                        if (role === 'gm') {
                          // 1st click selects token for the bottom HUD only; 2nd click on the same token opens/toggles the popover above the token
                          setSelectedTokenId(wasAlreadySelected ? (isMenuOpen ? null : tok.id) : null);
                        } else {
                          setSelectedTokenId(isMenuOpen ? null : tok.id);
                        }
                      }
                    }
                    finalizeTokenDrag();
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (pendingAttackChoice) {
                      setPendingAttackChoice(null);
                      return;
                    }
                    setTargetTokenId(isTarget ? null : tok.id);
                  }}
                  title={`${
                    role !== 'gm' && isTokenNameHiddenFromPlayers(tok, campaign)
                      ? '???'
                      : linkedChar?.name || tok.name
                  } | CA ${
                    role !== 'gm' &&
                    (tok.type === 'monster' || tok.type === 'npc') &&
                    (tok.hideAcFromPlayers !== undefined
                      ? tok.hideAcFromPlayers
                      : tok.type === 'npc' &&
                          campaign.npcs.find((n) => n.id === tok.referenceId)?.hideAcFromPlayers !== undefined
                        ? campaign.npcs.find((n) => n.id === tok.referenceId)?.hideAcFromPlayers
                        : linkedMonster?.hideAcFromPlayers !== undefined
                          ? linkedMonster.hideAcFromPlayers
                          : tok.type === 'monster' ||
                              campaign.npcs.find((n) => n.id === tok.referenceId)?.disposition === 'Hostil'
                            ? !campaign.settings.showEnemyAcToPlayers
                            : false)
                      ? '??'
                      : tok.defense
                  } | ${
                    role === 'gm'
                      ? isTarget
                        ? 'Clique novamente para abrir painel do token'
                        : 'Clique para selecionar na barra inferior'
                      : 'Clique para abrir ações'
                  }${
                    role === 'gm' || isOwnControlledTok
                      ? ' • Arraste para mover'
                      : ''
                  }`}
                  className={`absolute flex flex-col items-center justify-center ${
                    tool === 'draw' ? 'pointer-events-none ' : ''
                  }${
                    pendingAttackChoice
                      ? isOutOfPendingRange
                        ? 'cursor-not-allowed opacity-60'
                        : 'cursor-crosshair hover:scale-108'
                      : role === 'gm' || isOwnControlledTok
                        ? 'cursor-grab active:cursor-grabbing'
                        : 'cursor-pointer'
                  } ${tok.isHidden ? 'opacity-60 ring-1 ring-amber-400/50 rounded-full' : ''} ${
                    isTarget
                      ? 'ring-[3px] ring-sky-400 ring-offset-2 ring-offset-black/80 rounded-full shadow-[0_0_24px_rgba(56,189,248,0.85)]'
                      : selectedTokenIds.length > 1 && selectedTokenIds.includes(tok.id)
                        ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-black/70 rounded-full'
                        : ''
                  } ${hasHitSlash ? 'animate-crit-shake' : ''}`}
                  style={{
                    left: tok.x * cellPx,
                    top: tok.y * cellPx,
                    width: tokPx,
                    height: tokPx,
                    zIndex: isMenuOpen
                      ? 40
                      : activeMap.darknessEnabled
                        ? isTarget || isCurrentTurn
                          ? 19
                          : 18
                        : isTarget || isCurrentTurn
                          ? 15
                          : 10,
                    transition: isZoomFrame
                      ? 'none'
                      : draggingTokenId === tok.id
                        ? 'left 0.05s linear, top 0.05s linear'
                        : 'left 0.2s cubic-bezier(0.16, 1, 0.3, 1), top 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                  }}
                >
                  {/* Floating RP Speech Bubble or Quick Reaction above Token */}
                  {(() => {
                    const speech = tokenSpeeches[tok.id];
                    if (!speech || speech.mapId !== activeMap.id) return null;
                    if (speech.reaction && !speech.text) {
                      const reactionVisual: Record<
                        NonNullable<TokenSpeechEvent['reaction']>,
                        { icon: React.ReactNode; bg: string; border: string }
                      > = {
                        alert: {
                          icon: <AlertTriangle className="w-4 h-4 text-amber-300" />,
                          bg: 'rgba(42, 27, 8, 0.94)',
                          border: '#f59e0b',
                        },
                        question: {
                          icon: <HelpCircle className="w-4 h-4 text-sky-300" />,
                          bg: 'rgba(12, 28, 46, 0.94)',
                          border: '#38bdf8',
                        },
                        thinking: {
                          icon: <MoreHorizontal className="w-4 h-4 text-slate-200" />,
                          bg: 'rgba(18, 22, 34, 0.94)',
                          border: '#94a3b8',
                        },
                        combat: {
                          icon: <Swords className="w-4 h-4 text-red-300" />,
                          bg: 'rgba(48, 12, 16, 0.94)',
                          border: '#ef4444',
                        },
                        skull: {
                          icon: <Skull className="w-4 h-4 text-purple-200" />,
                          bg: 'rgba(30, 14, 42, 0.94)',
                          border: '#a855f7',
                        },
                        heart: {
                          icon: <Heart className="w-4 h-4 text-emerald-300" />,
                          bg: 'rgba(10, 38, 26, 0.94)',
                          border: '#22c55e',
                        },
                      };
                      const rv = reactionVisual[speech.reaction];
                      return (
                        <div
                          key={speech.id}
                          className="absolute left-1/2 -top-10 z-45 pointer-events-none animate-speech-bubble"
                        >
                          <div
                            className="w-8 h-8 rounded-md flex items-center justify-center shadow-[0_8px_22px_rgba(0,0,0,0.88)] border"
                            style={{ backgroundColor: rv.bg, borderColor: rv.border }}
                          >
                            {rv.icon}
                          </div>
                        </div>
                      );
                    }
                    if (!speech.text) return null;
                    return (
                      <div
                        key={speech.id}
                        className="absolute left-1/2 bottom-full mb-5 z-45 pointer-events-none animate-speech-bubble w-max max-w-[215px]"
                      >
                        <div
                          className="relative rounded-md px-2.5 py-1.5 bg-[#0c0e16]/95 border shadow-[0_14px_34px_rgba(0,0,0,0.92)] text-center"
                          style={{
                            borderColor: speech.color || '#d4ad5c',
                            boxShadow: `0 12px 30px rgba(0,0,0,0.9), inset 0 0 0 1px rgba(255,226,150,0.12)`,
                          }}
                        >
                          <div
                            className="text-[9px] font-display font-bold uppercase tracking-wider truncate"
                            style={{ color: speech.color || '#e8c683' }}
                          >
                            {role !== 'gm' && isTokenNameHiddenFromPlayers(tok, campaign)
                              ? '???'
                              : maskHiddenNameForRole(speech.speakerName, role, campaign, tok.id)}
                          </div>
                          <div className="font-lore italic text-[12px] leading-snug text-[#f2eadb] break-words">
                            “{speech.text}”
                          </div>
                          <div
                            className="absolute left-1/2 -bottom-1.5 -translate-x-1/2 w-2.5 h-2.5 rotate-45 bg-[#0c0e16] border-r border-b"
                            style={{ borderColor: speech.color || '#d4ad5c' }}
                          />
                        </div>
                      </div>
                    );
                  })()}

                  {/* Elliptical Miniature Ground Shadow */}
                  <div
                    className="absolute bottom-[4%] w-[78%] h-[22%] rounded-full bg-black/75 blur-[3px] pointer-events-none"
                  />

                  {/* Active Turn Carved Tactical Corner Chevrons (No harsh neon rectangle!) */}
                  {isCurrentTurn && (
                    <svg
                      viewBox="0 0 100 100"
                      className="absolute inset-[-4px] w-[calc(100%+8px)] h-[calc(100%+8px)] pointer-events-none"
                      style={{
                        color: tokenColor,
                        filter: `drop-shadow(0 0 6px ${tokenColor})`,
                      }}
                    >
                      <path
                        d="M 8 24 L 8 8 L 24 8 M 76 8 L 92 8 L 92 24 M 92 76 L 92 92 L 76 92 M 24 92 L 8 92 L 8 76"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="4"
                        strokeLinecap="round"
                      />
                    </svg>
                  )}

                  {/* Active Opportunity Attack Pause Ring */}
                  {hasActiveOpportunityPrompt &&
                    opportunityPrompt &&
                    (opportunityPrompt.targetTokenId === tok.id ||
                      opportunityPrompt.reactorTokenId === tok.id) && (
                      <div
                        className="absolute rounded-full border-2 border-amber-400 pointer-events-none"
                        style={{
                          width: Math.max(30, Math.round(tokPx * 1.02)),
                          height: Math.max(30, Math.round(tokPx * 1.02)),
                          boxShadow: '0 0 18px rgba(245, 158, 11, 0.8)',
                        }}
                      />
                    )}

                  {/* Selected / Targeted Ring */}
                  {isTarget && (
                    <div
                      className="absolute rounded-full border-2 border-amber-400/90 pointer-events-none"
                      style={{
                        width: Math.max(26, Math.round(tokPx * 0.92)),
                        height: Math.max(26, Math.round(tokPx * 0.92)),
                        boxShadow: '0 0 14px rgba(245, 158, 11, 0.65)',
                      }}
                    />
                  )}

                  {/* Out-of-Range Indicator during targeting */}
                  {isOutOfPendingRange && (
                    <div className="absolute -bottom-6 px-1.5 py-0.2 rounded bg-red-950/90 border border-red-500/60 text-[9px] text-red-200 whitespace-nowrap pointer-events-none z-25">
                      Fora ({pendingDist}m)
                    </div>
                  )}

                  {/* Token Stamp Miniature Coin + Animated Condition Aura */}
                  <div className="relative flex items-center justify-center">
                    {tok.hp > 0 && (() => {
                      const aura = resolveConditionAuraKind(
                        Array.from(
                          new Set([
                            ...(tok.activeConditionIds || []),
                            ...(linkedChar?.activeConditionIds || []),
                          ])
                        ),
                        campaign
                      );
                      if (!aura) return null;
                      const auraSize = Math.max(32, Math.round(tokPx * 1.18));
                      const spinCls =
                        aura.kind === 'shadow' || aura.kind === 'blood'
                          ? 'animate-aura-spin-rev'
                          : aura.kind === 'holy' || aura.kind === 'arcane' || aura.kind === 'frost'
                            ? 'animate-aura-spin'
                            : 'animate-aura-pulse';
                      return (
                        <div
                          className="absolute pointer-events-none flex items-center justify-center"
                          style={{ width: auraSize, height: auraSize }}
                        >
                          {/* Soft atmospheric halo */}
                          <div
                            className="absolute inset-0 rounded-full animate-aura-pulse"
                            style={{
                              background: `radial-gradient(circle, ${aura.color}38 0%, ${aura.color}18 55%, transparent 76%)`,
                            }}
                          />
                          {/* Rotating/Pulsing runic SVG ring */}
                          <svg
                            viewBox="0 0 100 100"
                            className={`w-full h-full ${spinCls}`}
                            style={{ filter: `drop-shadow(0 0 5px ${aura.color})` }}
                          >
                            <circle
                              cx="50"
                              cy="50"
                              r="44"
                              fill="none"
                              stroke={aura.color}
                              strokeWidth={aura.kind === 'blood' || aura.kind === 'fire' ? '2.4' : '1.8'}
                              strokeDasharray={
                                aura.kind === 'frost'
                                  ? '14 8'
                                  : aura.kind === 'poison'
                                    ? '4 7'
                                    : aura.kind === 'lightning'
                                      ? '10 5 3 5'
                                      : '18 10'
                              }
                              strokeLinecap="round"
                              opacity="0.88"
                            />
                            {(aura.kind === 'holy' || aura.kind === 'blood' || aura.kind === 'arcane') && (
                              <g stroke={aura.color} strokeWidth="2" opacity="0.85">
                                <line x1="50" y1="2" x2="50" y2="10" />
                                <line x1="50" y1="90" x2="50" y2="98" />
                                <line x1="2" y1="50" x2="10" y2="50" />
                                <line x1="90" y1="50" x2="98" y2="50" />
                              </g>
                            )}
                          </svg>
                        </div>
                      );
                    })()}
                    {/* Custom Active Transformation Form Aura Ring (when transformed into an alternate form) */}
                    {(() => {
                      if (!linkedChar?.activeFormId || !linkedChar.forms?.length || tok.hp <= 0) {
                        return null;
                      }
                      const actForm = linkedChar.forms.find((f) => f.id === linkedChar.activeFormId);
                      if (!actForm || actForm.isDefault || !actForm.auraColor) return null;
                      const auraSize = Math.max(36, Math.round(tokPx * 1.24));
                      return (
                        <div
                          className="absolute pointer-events-none flex items-center justify-center"
                          style={{ width: auraSize, height: auraSize }}
                        >
                          <div
                            className="absolute inset-0 rounded-full animate-aura-pulse"
                            style={{
                              background: `radial-gradient(circle, ${actForm.auraColor}42 0%, ${actForm.auraColor}1a 56%, transparent 78%)`,
                            }}
                          />
                          <svg
                            viewBox="0 0 100 100"
                            className="w-full h-full animate-aura-spin"
                            style={{ filter: `drop-shadow(0 0 6px ${actForm.auraColor})` }}
                          >
                            <circle
                              cx="50"
                              cy="50"
                              r="46"
                              fill="none"
                              stroke={actForm.auraColor}
                              strokeWidth="2"
                              strokeDasharray="16 9"
                              opacity="0.9"
                            />
                          </svg>
                        </div>
                      );
                    })()}
                    <TokenPortrait
                      name={
                        role !== 'gm' && isTokenNameHiddenFromPlayers(tok, campaign)
                          ? '???'
                          : linkedChar?.name || tok.name
                      }
                      imageUrl={portraitImg}
                      playerColor={tokenColor}
                      frameStyle={frameStyle}
                      sizePx={Math.max(24, Math.round(tokPx * 0.86))}
                      isDead={tok.hp <= 0}
                      iconHint={linkedMonster?.type || linkedChar?.classId}
                    />
                    {/* Engraved Mini CA Shield Pill on Coin Rim (Respects per-token, per-NPC, and global hideAc settings!) */}
                    {(() => {
                      if (role === 'gm' || tok.type === 'character') return true;
                      const npcDef =
                        tok.type === 'npc' && tok.referenceId
                          ? campaign.npcs.find((n) => n.id === tok.referenceId)
                          : undefined;
                      const isAcHidden =
                        tok.hideAcFromPlayers !== undefined
                          ? tok.hideAcFromPlayers
                          : tok.type === 'npc' && npcDef?.hideAcFromPlayers !== undefined
                            ? npcDef.hideAcFromPlayers
                            : linkedMonster?.hideAcFromPlayers !== undefined
                              ? linkedMonster.hideAcFromPlayers
                              : tok.type === 'monster' || npcDef?.disposition === 'Hostil'
                                ? !campaign.settings.showEnemyAcToPlayers
                                : false;
                      return !isAcHidden;
                    })() && (
                      <span
                        className="absolute -bottom-0.5 -right-1 px-1 rounded bg-[#0c0e16]/95 border border-amber-400/60 text-[8px] font-display font-bold text-amber-200 leading-tight pointer-events-none shadow"
                        title={`Classe de Armadura: ${tok.defense}`}
                      >
                        {tok.defense}
                      </span>
                    )}
                  </div>

                  {/* Slash / Block / Heal VFX Overlay */}
                  {tokenSlashes.map((s) => (
                    <div
                      key={s.id}
                      className="absolute inset-[-12px] pointer-events-none flex items-center justify-center z-30"
                    >
                      {s.kind === 'hit' && (
                        <svg viewBox="0 0 100 100" className="w-full h-full">
                          <path
                            d="M15,85 L85,15"
                            stroke="#ef4444"
                            strokeWidth="6"
                            strokeLinecap="round"
                            className="animate-slash-vfx"
                          />
                          <path
                            d="M25,20 L80,80"
                            stroke="#fde047"
                            strokeWidth="4"
                            strokeLinecap="round"
                            className="animate-slash-vfx"
                          />
                        </svg>
                      )}
                      {s.kind === 'block' && (
                        <div className="w-full h-full rounded-full border-4 border-sky-400 animate-impact-ripple" />
                      )}
                      {s.kind === 'heal' && (
                        <div className="w-full h-full rounded-full border-4 border-emerald-400 animate-impact-ripple" />
                      )}
                    </div>
                  ))}

                  {/* 3D Elevation Ground Shadow when flying above ground */}
                  {(tok.elevationMeters || 0) > 0 && (
                    <div
                      className="absolute inset-[12%] rounded-full pointer-events-none"
                      style={{
                        background: 'radial-gradient(circle, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0) 72%)',
                        transform: `translate(${Math.min(18, Math.round((tok.elevationMeters || 0) * 1.4))}px, ${Math.min(22, Math.round((tok.elevationMeters || 0) * 1.8))}px) scale(0.88)`,
                      }}
                    />
                  )}

                  {/* Sculpted Metallic Mini HP Bar with Delayed Ghost Drain */}
                  {(role === 'gm' || tok.type === 'character') && (
                    <div className="absolute -bottom-1.5 w-[82%]">
                      <SculptedHealthBar hp={tok.hp} maxHp={tok.maxHp} heightClass="h-1.5" />
                    </div>
                  )}

                  {/* Carved Brass Nameplate */}
                  <div
                    className="absolute -top-4 px-1.5 py-0.2 rounded-xs bg-[#0b0d14]/95 text-amber-100 text-[9px] font-display font-bold tracking-wide whitespace-nowrap pointer-events-none border shadow-md flex items-center gap-1"
                    style={{ borderColor: `${tokenColor}88` }}
                  >
                    {(tok.elevationMeters || 0) > 0 && (
                      <span
                        className="text-[8px] px-1 rounded bg-sky-950/90 text-sky-200 border border-sky-400/65 font-mono-dice"
                        title={`Voando / Elevado a ${tok.elevationMeters}m de altura`}
                      >
                        ↑{tok.elevationMeters}m
                      </span>
                    )}
                    {tok.stealthTotal != null &&
                      (role === 'gm' ||
                        (myCharacter &&
                          (tok.referenceId === myCharacter.id ||
                            tok.type === 'character'))) && (
                        <span
                          className="text-[8px] px-1 rounded bg-purple-950/90 text-purple-200 border border-purple-400/65 font-mono-dice"
                          title={`Furtivo (Resultado: ${tok.stealthTotal})`}
                        >
                          Furtivo {tok.stealthTotal}
                        </span>
                      )}
                    {tok.isHidden && role === 'gm' && (
                      <span className="text-[8px] px-1 rounded bg-amber-500/30 text-amber-200 border border-amber-400/60">
                        OCULTO
                      </span>
                    )}
                    {isTokenNameHiddenFromPlayers(tok, campaign) && role === 'gm' && (
                      <span className="text-[8px] px-1 rounded bg-purple-500/30 text-purple-200 border border-purple-400/60">
                        ???
                      </span>
                    )}
                    <span>
                      {role !== 'gm' && isTokenNameHiddenFromPlayers(tok, campaign)
                        ? '???'
                        : linkedChar?.name || tok.name}
                    </span>
                  </div>

                  {/* Concentration Crest on Token Top-Left Rim */}
                  {(linkedChar?.concentratingSpell ||
                    campaign.combat.combatants.find((cb) => cb.tokenId === tok.id)
                      ?.concentratingSpell) && (
                    <div
                      className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-md flex items-center justify-center text-[10px] pointer-events-none z-20 shadow-[0_2px_8px_rgba(0,0,0,0.9)]"
                      style={{
                        background:
                          'linear-gradient(180deg, #e8c266 0%, #a87b22 100%)',
                        border: '1px solid #fef08a',
                        color: '#140e04',
                      }}
                      title={`Concentrando em: ${
                        linkedChar?.concentratingSpell ||
                        campaign.combat.combatants.find((cb) => cb.tokenId === tok.id)
                          ?.concentratingSpell
                      }`}
                    >
                      ✨
                    </div>
                  )}

                  {/* Floating Combat Damage/Heal Numbers */}
                  {tokenVfx.map((v) => (
                    <div
                      key={v.id}
                      className={`absolute -top-7 left-1/2 flex flex-col items-center pointer-events-none animate-floating-combat ${
                        v.isHeal ? 'text-emerald-400' : v.amount === 0 ? 'text-slate-300' : 'text-red-500'
                      }`}
                    >
                      <span className="font-chronicle font-black text-lg leading-none drop-shadow-[0_2px_6px_rgba(0,0,0,0.95)]">
                        {v.isHeal ? `+${v.amount}` : v.amount === 0 ? 'IMUNE' : `-${v.amount}`}
                      </span>
                      {v.note && (
                        <span className="px-1.5 py-0.2 mt-0.5 rounded bg-black/85 border border-amber-400/50 text-[8px] font-display font-bold text-amber-200 whitespace-nowrap">
                          {v.note}
                        </span>
                      )}
                    </div>
                  ))}

                  {/* Token Floating Context Action Menu (Unclipped + Auto-Flip Above/Below & Left/Right!) */}
                  {isMenuOpen && (() => {
                    const gRect = gridRef.current?.getBoundingClientRect();
                    const tokScreenY = gRect ? gRect.top + tok.y * cellPx : tok.y * cellPx;
                    const tokScreenX = gRect
                      ? gRect.left + (tok.x + tok.size / 2) * cellPx
                      : (tok.x + tok.size / 2) * cellPx;
                    const openBelow = tokScreenY < window.innerHeight * 0.48;
                    const horizClass =
                      tokScreenX < 180
                        ? 'left-0'
                        : tokScreenX > window.innerWidth - 180
                          ? 'right-0'
                          : 'left-1/2 -translate-x-1/2';
                    return (
                    <div
                      onMouseDown={(e) => e.stopPropagation()}
                      onMouseUp={(e) => e.stopPropagation()}
                      className={`absolute ${
                        openBelow ? 'top-[115%]' : 'bottom-[115%]'
                      } ${horizClass} w-64 max-h-[62vh] overflow-y-auto rpg-glass-panel rounded-xl p-3 space-y-2 text-xs shadow-2xl z-50 cursor-default animate-popover`}
                    >
                      <div className="flex items-center justify-between border-b pb-1.5" style={{ borderColor: 'var(--border-subtle)' }}>
                        <div>
                          <div className="font-display font-bold text-sm">
                            {role !== 'gm' && isTokenNameHiddenFromPlayers(tok, campaign)
                              ? '???'
                              : linkedChar?.name || tok.name}
                          </div>
                          <div className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                            {(() => {
                              const mDef = tok.referenceId
                                ? campaign.compendium.monsters.find((m) => m.id === tok.referenceId)
                                : undefined;
                              const nDef = tok.referenceId
                                ? campaign.npcs.find((n) => n.id === tok.referenceId)
                                : undefined;
                              const hideThisAc =
                                tok.hideAcFromPlayers !== undefined
                                  ? tok.hideAcFromPlayers
                                  : tok.type === 'npc' && nDef?.hideAcFromPlayers !== undefined
                                    ? nDef.hideAcFromPlayers
                                    : mDef?.hideAcFromPlayers !== undefined
                                      ? mDef.hideAcFromPlayers
                                      : tok.type === 'monster' || nDef?.disposition === 'Hostil'
                                        ? !campaign.settings.showEnemyAcToPlayers
                                        : false;
                              const hideThisHp =
                                role !== 'gm' &&
                                (tok.type === 'monster' || tok.type === 'npc') &&
                                Boolean(
                                  tok.hideHpFromPlayers !== undefined
                                    ? tok.hideHpFromPlayers
                                    : nDef?.hideHpFromPlayers !== undefined
                                      ? nDef.hideHpFromPlayers
                                      : mDef?.hideHpFromPlayers
                                );
                              const acText =
                                role !== 'gm' && (tok.type === 'monster' || tok.type === 'npc') && hideThisAc
                                  ? '??'
                                  : tok.defense;
                              return (
                                <>
                                  CA {acText}
                                  {role === 'gm' || tok.type === 'character' ? (
                                    ` • PV ${tok.hp}/${tok.maxHp}`
                                  ) : hideThisHp ? (
                                    ' • PV ??'
                                  ) : (
                                    <>
                                      {' • '}
                                      <span className={getMonsterWoundStatus(tok.hp, tok.maxHp).colorClass}>
                                        {getMonsterWoundStatus(tok.hp, tok.maxHp).label}
                                      </span>
                                    </>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        </div>
                        <button
                          onClick={() => setSelectedTokenId(null)}
                          className="text-xs opacity-60 hover:opacity-100 cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>

                      {/* Cinematic RP Spotlight ("Em Cena") + Quick Form Switch + GM Cut-In */}
                      {(() => {
                        const isOwnerOfTok = Boolean(
                          myCharacter && tok.type === 'character' && tok.referenceId === myCharacter.id
                        );
                        const canControlTokCinematic = role === 'gm' || isOwnerOfTok;
                        if (!canControlTokCinematic) return null;
                        const tokForms = linkedChar?.forms || [];
                        return (
                          <div className="rounded-lg bg-[#141724]/85 border border-[#d4ad5c]/30 px-2 py-1.5 space-y-1.5">
                            <div className="flex items-center gap-1 flex-wrap">
                              <button
                                type="button"
                                onClick={async () => {
                                  const speech = await openTextPrompt(
                                    `Fala em destaque de ${linkedChar?.name || tok.name} (deixe vazio para só exibir o retrato):`,
                                    ''
                                  );
                                  if (speech === null) return;
                                  const activeFormName = linkedChar?.forms?.find(
                                    (f) => f.id === linkedChar.activeFormId
                                  )?.name;
                                  enterRpSpotlight({
                                    slot: tok.type === 'character' ? 'left' : 'right',
                                    speakerName: linkedChar?.name || tok.name,
                                    subtitle:
                                      activeFormName ||
                                      (tok.isBoss ? tok.bossTitle || 'Chefe' : undefined),
                                    characterId: linkedChar?.id,
                                    tokenId: tok.id,
                                    portraitUrl: linkedChar?.portraitUrl || tok.imageUrl,
                                    color: linkedChar?.playerColor || tok.color || '#d4ad5c',
                                    frameStyle: linkedChar?.tokenFrameStyle || tok.frameStyle,
                                    dialogue: speech.trim(),
                                    tone: tok.isBoss ? 'epic' : 'normal',
                                  });
                                  setSelectedTokenId(null);
                                }}
                                className="flex-1 py-1 px-2 rounded bg-[#211b12] hover:bg-[#312617] border border-[#d4ad5c]/45 text-[10px] font-display font-semibold text-[#f0dab0] flex items-center justify-center gap-1 cursor-pointer"
                                title="Destacar retrato e fala deste personagem na tela de todos os jogadores"
                              >
                                <Clapperboard className="w-3 h-3 text-[#d4ad5c]" />
                                <span>Em Cena</span>
                              </button>

                              {role === 'gm' && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const techName = await openTextPrompt(
                                      `Nome da Técnica Suprema / Domínio de ${linkedChar?.name || tok.name}:`,
                                      tok.isBoss ? 'Expansão de Domínio' : 'Técnica Suprema'
                                    );
                                    if (!techName || !techName.trim()) return;
                                    const phrase =
                                      (await openTextPrompt(
                                        'Frase de impacto (opcional):',
                                        ''
                                      )) || '';
                                    const isDom = /dom[ií]nio|campo|santu[aá]rio|territ[oó]rio/i.test(
                                      techName
                                    );
                                    triggerUltimateCutIn({
                                      actorName: linkedChar?.name || tok.name,
                                      techniqueName: techName.trim(),
                                      catchphrase: phrase.trim() || undefined,
                                      color: linkedChar?.playerColor || tok.color || '#dc2626',
                                      portraitUrl: linkedChar?.portraitUrl || tok.imageUrl,
                                      activateDomain: isDom,
                                      domainTheme: tok.isBoss ? 'crimson' : 'void',
                                      domainMapId: activeMap.id,
                                      casterCharacterId: linkedChar?.id,
                                      casterTokenId: tok.id,
                                    });
                                    setSelectedTokenId(null);
                                  }}
                                  className="py-1 px-2 rounded bg-[#231433] hover:bg-[#321b4a] border border-purple-400/55 text-[10px] font-display font-semibold text-purple-200 flex items-center justify-center gap-1 cursor-pointer"
                                  title="Disparar Cut-In cinematográfico (use 'Domínio' no nome para expandir Domínio no mapa!)"
                                >
                                  <Sparkles className="w-3 h-3 text-purple-300" />
                                  <span>Cut-In</span>
                                </button>
                              )}
                            </div>

                            {linkedChar && tokForms.length > 1 && (
                              <div className="space-y-1 pt-0.5 border-t border-white/10">
                                <div className="text-[9px] uppercase tracking-wider font-display text-[#9b9180]">
                                  Formas ({tokForms.length})
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  {tokForms.map((fm) => {
                                    const isAct = linkedChar.activeFormId === fm.id;
                                    return (
                                      <button
                                        key={fm.id}
                                        type="button"
                                        onClick={() => switchCharacterForm(linkedChar.id, fm.id)}
                                        className={`px-1.5 py-0.5 rounded text-[9px] font-display font-semibold border cursor-pointer transition ${
                                          isAct
                                            ? 'bg-amber-950/85 border-amber-400/75 text-amber-200'
                                            : 'bg-black/40 border-white/15 text-[#c7bda9] hover:border-amber-400/45'
                                        }`}
                                      >
                                        {fm.name}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* 3D Elevation / Flight Controls (↑ / ↓ in 1.5m steps + Fall Damage Trigger) */}
                      {(() => {
                        const tokConds = linkedChar
                          ? linkedChar.activeConditionIds
                          : tok.activeConditionIds || [];
                        const isFlyingTok = tokConds.some((cid) => {
                          if (cid === 'cond-voando') return true;
                          const cdef = campaign.compendium.conditions.find((c) => c.id === cid);
                          return Boolean(cdef && /voando|voo|levit/i.test(cdef.name));
                        });
                        const curElev = tok.elevationMeters || 0;
                        const isOwnerOfTok = Boolean(
                          myCharacter &&
                            ((tok.type === 'character' && tok.referenceId === myCharacter.id) ||
                              tok.controlledByCharacterId === myCharacter.id)
                        );
                        const canRaise = role === 'gm' || (isOwnerOfTok && isFlyingTok);
                        const canLower = curElev > 0 && (role === 'gm' || isOwnerOfTok);
                        if (!canRaise && !canLower) return null;
                        return (
                          <div className="rounded-lg bg-sky-950/35 border border-sky-400/35 px-2 py-1.5 space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] font-display font-bold text-sky-200 uppercase tracking-wider">
                                Elevação / Voo
                              </span>
                              <span className="font-mono-dice text-[11px] font-bold text-sky-300">
                                {curElev > 0 ? `↑ ${curElev}m` : 'Solo (0m)'}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                disabled={!canLower}
                                onClick={() =>
                                  setTokenElevation(activeMap.id, tok.id, Math.max(0, curElev - 1.5))
                                }
                                className="flex-1 py-1 rounded bg-black/45 hover:bg-black/65 border border-sky-400/35 text-sky-200 text-[10px] font-mono-dice font-bold flex items-center justify-center gap-0.5 cursor-pointer disabled:opacity-35"
                                title="Descer 1,5m"
                              >
                                <ArrowDown className="w-3 h-3" /> 1,5m
                              </button>
                              <button
                                type="button"
                                disabled={!canRaise}
                                onClick={() => setTokenElevation(activeMap.id, tok.id, curElev + 1.5)}
                                className="flex-1 py-1 rounded bg-sky-900/60 hover:bg-sky-800/75 border border-sky-400/55 text-sky-100 text-[10px] font-mono-dice font-bold flex items-center justify-center gap-0.5 cursor-pointer disabled:opacity-35"
                                title="Subir 1,5m"
                              >
                                <ArrowUp className="w-3 h-3" /> 1,5m
                              </button>
                              {curElev > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setTokenElevation(activeMap.id, tok.id, 0)}
                                  className="px-2 py-1 rounded bg-black/45 hover:bg-black/65 border border-white/15 text-[10px] text-[#c7bda9] cursor-pointer"
                                  title="Pousar suavemente no solo (0m)"
                                >
                                  0m
                                </button>
                              )}
                              {role === 'gm' && curElev >= 3 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    triggerFallDamageCheck(tok.id, activeMap.id, 'Derrubado no ar pelo Mestre!')
                                  }
                                  className="px-2 py-1 rounded bg-red-950/80 hover:bg-red-900/80 border border-red-400/60 text-[10px] font-display font-bold text-red-200 cursor-pointer"
                                  title={`Derrubar de ${curElev}m (rola ${Math.min(20, Math.floor(curElev / 3))}d6 de dano de queda)`}
                                >
                                  Cair!
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Real Stealth Breakdown vs Passive Perception + 1-click Reveal */}
                      {tok.stealthTotal != null &&
                        (role === 'gm' ||
                          (myCharacter &&
                            tok.type === 'character' &&
                            tok.referenceId === myCharacter.id)) && (() => {
                          const hostiles = activeMap.tokens.filter(
                            (o) =>
                              o.id !== tok.id &&
                              o.hp > 0 &&
                              !o.isHidden &&
                              isTokenHostileTo(tok, o, campaign.npcs)
                          );
                          const undetected = hostiles.filter(
                            (o) => !doesObserverDetectStealthedToken(o, tok, campaign)
                          );
                          const detected = hostiles.filter((o) =>
                            doesObserverDetectStealthedToken(o, tok, campaign)
                          );
                          return (
                            <div className="rounded-lg bg-purple-950/40 border border-purple-400/40 px-2 py-1.5 space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] font-display font-bold text-purple-200">
                                  Furtividade: {tok.stealthTotal}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateActiveMap((m) => ({
                                      ...m,
                                      tokens: m.tokens.map((t) =>
                                        t.id === tok.id ? { ...t, stealthTotal: null } : t
                                      ),
                                    }))
                                  }
                                  className="px-1.5 py-0.5 rounded bg-black/50 border border-purple-400/45 text-[9px] font-display font-bold text-purple-200 hover:bg-purple-900/50 cursor-pointer"
                                >
                                  Revelar
                                </button>
                              </div>
                              {role === 'gm' && hostiles.length > 0 && (
                                <div className="text-[9px] space-y-0.5 text-[#cfc6b6]">
                                  {undetected.length > 0 && (
                                    <div className="text-emerald-300">
                                      Oculto de:{' '}
                                      {undetected
                                        .map((o) => `${o.name} (PP ${getTokenPassivePerception(o, campaign)})`)
                                        .join(', ')}
                                    </div>
                                  )}
                                  {detected.length > 0 && (
                                    <div className="text-red-300">
                                      Percebido por:{' '}
                                      {detected
                                        .map((o) => `${o.name} (PP ${getTokenPassivePerception(o, campaign)})`)
                                        .join(', ')}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })()}

                      {/* GM Faction Alignment Selector (Aliado / Neutro / Inimigo — controls Opportunity Attacks & Flanking!) */}
                      {role === 'gm' && (() => {
                        const curFaction = getTokenFaction(tok, campaign.npcs);
                        const setTokFaction = (nextFac: 'ally' | 'neutral' | 'enemy') => {
                          const dispMap = {
                            ally: 'Aliado' as const,
                            neutral: 'Neutro' as const,
                            enemy: 'Hostil' as const,
                          };
                          updateCampaign((prev) => ({
                            ...prev,
                            npcs:
                              tok.type === 'npc' && tok.referenceId
                                ? prev.npcs.map((n) =>
                                    n.id === tok.referenceId
                                      ? { ...n, disposition: dispMap[nextFac] }
                                      : n
                                  )
                                : prev.npcs,
                            maps: prev.maps.map((m) =>
                              m.id !== activeMap.id
                                ? m
                                : {
                                    ...m,
                                    tokens: m.tokens.map((t) =>
                                      t.id === tok.id ? { ...t, faction: nextFac } : t
                                    ),
                                  }
                            ),
                          }));
                        };
                        const tokCb = findTokenCombatant(tok);
                        return (
                          <div
                            className="space-y-1.5 border-b pb-2"
                            style={{ borderColor: 'var(--border-subtle)' }}
                          >
                            <div className="text-[10px] uppercase tracking-wider text-amber-300/90 font-display font-bold">
                              Facção (Oportunidade &amp; Alianças)
                            </div>
                            <div className="grid grid-cols-3 gap-1 text-[10px]">
                              <button
                                type="button"
                                onClick={() => setTokFaction('ally')}
                                className={`py-1 rounded font-display font-bold border cursor-pointer transition ${
                                  curFaction === 'ally'
                                    ? 'bg-emerald-900/70 border-emerald-400 text-emerald-100'
                                    : 'rpg-card text-[#a69b88] hover:text-emerald-200'
                                }`}
                              >
                                Aliado
                              </button>
                              <button
                                type="button"
                                onClick={() => setTokFaction('neutral')}
                                className={`py-1 rounded font-display font-bold border cursor-pointer transition ${
                                  curFaction === 'neutral'
                                    ? 'bg-amber-900/60 border-amber-400 text-amber-100'
                                    : 'rpg-card text-[#a69b88] hover:text-amber-200'
                                }`}
                              >
                                Neutro
                              </button>
                              <button
                                type="button"
                                onClick={() => setTokFaction('enemy')}
                                className={`py-1 rounded font-display font-bold border cursor-pointer transition ${
                                  curFaction === 'enemy'
                                    ? 'bg-red-950/85 border-red-400 text-red-100'
                                    : 'rpg-card text-[#a69b88] hover:text-red-200'
                                }`}
                              >
                                Inimigo
                              </button>
                            </div>
                            {campaign.combat.active && tokCb && (
                              <div className="pt-1 space-y-1">
                                <div className="text-[10px] uppercase tracking-wider text-sky-300/90 font-display font-bold">
                                  Conceder Economia (Mestre)
                                </div>
                                <div className="grid grid-cols-3 gap-1 text-[10px] font-mono-dice">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateCampaign((prev) => ({
                                        ...prev,
                                        combat: {
                                          ...prev.combat,
                                          combatants: prev.combat.combatants.map((c) => {
                                            if (c.id !== tokCb.id) return c;
                                            const n = Math.min(5, getCombatantActionsRemaining(c) + 1);
                                            return { ...c, actionsRemaining: n, actionAvailable: true };
                                          }),
                                        },
                                      }))
                                    }
                                    className="py-1 rounded bg-[#261f12] border border-[#b89146]/60 text-[#e8c683] hover:brightness-125 cursor-pointer font-bold"
                                    title="Conceder +1 Ação Padrão"
                                  >
                                    +1 Ação
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateCampaign((prev) => ({
                                        ...prev,
                                        combat: {
                                          ...prev.combat,
                                          combatants: prev.combat.combatants.map((c) => {
                                            if (c.id !== tokCb.id) return c;
                                            const n = Math.min(5, getCombatantBonusActionsRemaining(c) + 1);
                                            return {
                                              ...c,
                                              bonusActionsRemaining: n,
                                              bonusActionAvailable: true,
                                            };
                                          }),
                                        },
                                      }))
                                    }
                                    className="py-1 rounded bg-[#122230] border border-[#3b72a8]/60 text-[#9bc5eb] hover:brightness-125 cursor-pointer font-bold"
                                    title="Conceder +1 Ação Bônus"
                                  >
                                    +1 Bônus
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateCampaign((prev) => ({
                                        ...prev,
                                        combat: {
                                          ...prev.combat,
                                          combatants: prev.combat.combatants.map((c) =>
                                            c.id === tokCb.id ? { ...c, reactionAvailable: true } : c
                                          ),
                                        },
                                      }))
                                    }
                                    className="py-1 rounded bg-[#1f162d] border border-[#9561ce]/60 text-[#cfb3f2] hover:brightness-125 cursor-pointer font-bold"
                                    title="Restaurar Reação"
                                  >
                                    +Reação
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* Light Source / Torch Controls (GM free on any token; Player ONLY from owned light items/abilities!) */}
                      {(role === 'gm' ||
                        (linkedChar && linkedChar.id === myCharacter?.id) ||
                        (myCharacter && tok.controlledByCharacterId === myCharacter.id)) &&
                        (() => {
                          const charLight = linkedChar
                            ? getCharacterAvailableLightOptions(linkedChar, campaign)
                            : { toggleOptions: [], passiveDarkvisionMeters: 0 };
                          const lightMeta = resolveTokenLightForViewer(
                            tok,
                            campaign,
                            role,
                            myCharacter?.id
                          );
                          const effectiveRadius = Math.max(
                            lightMeta.sharedRadiusM,
                            lightMeta.personalRadiusM
                          );
                          const applyLightOption = (opt: ResolvedLightOption) => {
                            updateActiveMap((m) => {
                              const nextTok: MapToken = {
                                ...tok,
                                lightSource: opt.id,
                                lightMode: opt.mode,
                                lightRadiusMeters: opt.radiusMeters || undefined,
                                lightLabel: opt.id === 'none' ? undefined : opt.label,
                              };
                              return {
                                ...m,
                                tokens: m.tokens.map((t) => (t.id === tok.id ? nextTok : t)),
                                revealedCells:
                                  opt.mode === 'shared' &&
                                  opt.radiusMeters > 0 &&
                                  m.fogEnabled &&
                                  !nextTok.isHidden
                                    ? revealFogCellsAroundToken(m, nextTok, sqMeters, campaign)
                                    : m.revealedCells,
                              };
                            });
                          };
                          const optionsToRender: ResolvedLightOption[] =
                            role === 'gm'
                              ? [...TOKEN_LIGHT_PRESETS, ...charLight.toggleOptions]
                              : charLight.toggleOptions.length > 0
                                ? [TOKEN_LIGHT_PRESETS[0], ...charLight.toggleOptions]
                                : [];

                          return (
                            <div
                              className="space-y-1 border-b pb-2"
                              style={{ borderColor: 'var(--border-subtle)' }}
                            >
                              <div className="text-[10px] uppercase tracking-wider text-amber-300/90 font-display font-bold flex items-center justify-between">
                                <span>Iluminação / Visão</span>
                                {effectiveRadius > 0 && (
                                  <span className="font-mono-dice text-[9px] text-amber-200">
                                    {effectiveRadius}m
                                  </span>
                                )}
                              </div>
                              {charLight.passiveDarkvisionMeters > 0 && (
                                <div className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-950/70 border border-indigo-400/50 text-indigo-200">
                                  👁 Visão no Escuro Passiva ativa ({charLight.passiveDarkvisionMeters}m • só você vê)
                                </div>
                              )}
                              {optionsToRender.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {optionsToRender.map((opt) => {
                                    const activeLight = (tok.lightSource || 'none') === opt.id;
                                    return (
                                      <button
                                        key={opt.id}
                                        type="button"
                                        onClick={() => applyLightOption(opt)}
                                        title={opt.label}
                                        className={`px-1.5 py-1 rounded text-[10px] font-display font-bold border cursor-pointer transition text-center ${
                                          activeLight
                                            ? opt.mode === 'personal-darkvision'
                                              ? 'bg-indigo-600/35 border-indigo-400 text-indigo-100'
                                              : 'bg-amber-600/35 border-amber-400 text-amber-100'
                                            : 'rpg-card hover:border-amber-400/60 opacity-85'
                                        }`}
                                      >
                                        {opt.short}
                                      </button>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div className="text-[10px] italic opacity-70">
                                  Sem item ou magia de luz na mochila/grimório.
                                </div>
                              )}
                            </div>
                          );
                        })()}

                      {/* Quick Attack Buttons against this token (Never against self or when dead) */}
                      {heroAttacks.length > 0 &&
                        activeHero &&
                        activeHero.hp > 0 &&
                        !(tok.type === 'character' && tok.referenceId === activeHero.id) && (
                        <div className="space-y-1">
                          <div className="text-[10px] uppercase tracking-wider opacity-70">
                            Atacar este Alvo:
                          </div>
                          <div className="space-y-1 max-h-28 overflow-y-auto">
                            {heroAttacks.map((atk, idx) => {
                              const maxM = parseAttackRangeMeters(atk.range, atk.actionTitle);
                              const distInfo =
                                activeHeroTok && activeHeroTok.id !== tok.id
                                  ? getToken3DDistance(activeHeroTok, tok, sqMeters).meters3D
                                  : 0;
                              const outOfRange =
                                Boolean(activeHeroTok && activeHeroTok.id !== tok.id) &&
                                distInfo > maxM + 0.05;
                              const atkTargetDispName =
                                role !== 'gm' && isTokenNameHiddenFromPlayers(tok, campaign)
                                  ? '???'
                                  : tok.name;
                              return (
                                <button
                                  key={idx}
                                  disabled={outOfRange}
                                  onClick={() => {
                                    setSelectedTokenId(null);
                                    startCombatDuel(atk, tok);
                                  }}
                                  className="w-full rpg-btn-crimson px-2.5 py-1.5 rounded-lg text-[11px] flex items-center justify-between gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                  title={
                                    outOfRange
                                      ? `Fora de alcance: alvo a ${distInfo}m (máx ${maxM}m)`
                                      : `Atacar ${atkTargetDispName} (${distInfo}m / máx ${maxM}m)`
                                  }
                                >
                                  <span className="truncate flex items-center gap-1">
                                    <Swords className="w-3 h-3 shrink-0" />
                                    {atk.actionTitle}
                                  </span>
                                  <span className="font-mono-dice text-[10px] opacity-90 shrink-0">
                                    {outOfRange
                                      ? `${distInfo}m > ${maxM}m`
                                      : formatFormulaForDisplay(atk.damageFormula || '')}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Quick RP Speech Bubble & Token Reactions (GM on any token, Player on own hero token) */}
                      {(role === 'gm' ||
                        (tok.type === 'character' &&
                          myCharacter &&
                          tok.referenceId === myCharacter.id)) && (
                        <div
                          className="space-y-1.5 border-b pb-2"
                          style={{ borderColor: 'var(--border-subtle)' }}
                        >
                          <div className="text-[10px] uppercase tracking-wider text-amber-300/90 font-display font-bold">
                            Fala RP &amp; Reações no Token
                          </div>
                          <div className="flex items-center gap-1">
                            {(
                              [
                                { id: 'alert', label: 'Alerta (!)', icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-300" /> },
                                { id: 'question', label: 'Dúvida (?)', icon: <HelpCircle className="w-3.5 h-3.5 text-sky-300" /> },
                                { id: 'thinking', label: 'Pensando (...)', icon: <MoreHorizontal className="w-3.5 h-3.5 text-slate-200" /> },
                                { id: 'combat', label: 'Desafio / Combate', icon: <Swords className="w-3.5 h-3.5 text-red-300" /> },
                                { id: 'skull', label: 'Perigo / Caveira', icon: <Skull className="w-3.5 h-3.5 text-purple-200" /> },
                                { id: 'heart', label: 'Apoio / Vida', icon: <Heart className="w-3.5 h-3.5 text-emerald-300" /> },
                              ] as const
                            ).map((rx) => (
                              <button
                                key={rx.id}
                                type="button"
                                onClick={() => {
                                  emitTokenSpeech({
                                    mapId: activeMap.id,
                                    tokenId: tok.id,
                                    speakerName: linkedChar?.name || tok.name,
                                    color: tokenColor,
                                    reaction: rx.id,
                                  });
                                  setSelectedTokenId(null);
                                }}
                                className="rpg-card flex-1 py-1 rounded flex items-center justify-center hover:border-amber-400/65 cursor-pointer transition"
                                title={rx.label}
                              >
                                {rx.icon}
                              </button>
                            ))}
                          </div>
                          <button
                            type="button"
                            onClick={async () => {
                              setSelectedTokenId(null);
                              const spoken = await openTextPrompt(
                                'Falar no Mapa (Balão RP)',
                                '',
                                {
                                  description: `Digite a fala para aparecer em balão acima de ${linkedChar?.name || tok.name}:`,
                                  placeholder: 'Ex: Cuidado! Ouvi passos atrás da porta...',
                                  confirmLabel: 'Falar',
                                }
                              );
                              if (spoken && spoken.trim()) {
                                emitTokenSpeech({
                                  mapId: activeMap.id,
                                  tokenId: tok.id,
                                  speakerName: linkedChar?.name || tok.name,
                                  color: tokenColor,
                                  text: spoken.trim().slice(0, 140),
                                });
                              }
                            }}
                            className="w-full rpg-card px-2.5 py-1 rounded text-[11px] font-display font-semibold text-[#e8c683] hover:border-[#d4ad5c]/70 flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <MessageSquare className="w-3.5 h-3.5 text-[#d4ad5c]" />
                            <span>Falar com Balão no Token</span>
                          </button>
                        </div>
                      )}

                      {/* BG3-Style Inspect Button (also triggered by pressing 'I' while hovering/selecting a token) */}
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTokenId(null);
                          openInspectEntity(tok.id);
                        }}
                        className="w-full rpg-card px-2.5 py-1 rounded-lg text-[11px] font-display font-semibold text-sky-200 hover:border-sky-400/70 flex items-center justify-center gap-1.5 cursor-pointer"
                        title="Inspecionar criatura (Atalho: tecla I)"
                      >
                        <Eye className="w-3.5 h-3.5 text-sky-300" />
                        <span>Inspecionar (I)</span>
                      </button>

                      {/* Ally Help Action for Fallen Hero Token */}
                      {role === 'player' &&
                        linkedChar &&
                        linkedChar.hp <= 0 &&
                        myCharacter &&
                        myCharacter.id !== linkedChar.id &&
                        myCharacter.hp > 0 &&
                        !linkedChar.deathSaves?.dead &&
                        (linkedChar.deathSaves?.failures || 0) < 3 &&
                        !linkedChar.deathSaves?.stabilized && (
                          <button
                            onClick={() => {
                              setSelectedTokenId(null);
                              assistDeathSave(myCharacter.id, linkedChar.id);
                            }}
                            className="w-full rpg-btn-primary px-2.5 py-1.5 rounded-lg text-[11px] flex items-center justify-center gap-1.5 cursor-pointer"
                            title="Prestar socorro (Medicina CD 10) para estabilizar ou conceder Vantagem"
                          >
                            <Heart className="w-3.5 h-3.5 text-red-200" />
                            <span>Ajudar no Teste de Morte</span>
                          </button>
                        )}

                      {/* Player-Controlled Summon / Familiar Attacks */}
                      {role === 'player' &&
                        myCharacter &&
                        tok.controlledByCharacterId === myCharacter.id &&
                        tok.hp > 0 &&
                        (() => {
                          const linkedNpc =
                            tok.type === 'npc' && tok.referenceId
                              ? campaign.npcs.find((n) => n.id === tok.referenceId)
                              : undefined;
                          const summonAttacks =
                            linkedMonster?.attacks ||
                            (linkedNpc?.combatEnabled ? linkedNpc.attacks : []) ||
                            [];
                          const condGrants = getConditionGrantedAbilities(
                            tok.activeConditionIds,
                            campaign
                          );
                          if (summonAttacks.length === 0 && condGrants.length === 0) return null;
                          return (
                            <div
                              className="space-y-1 pt-1.5 border-t"
                              style={{ borderColor: 'var(--border-subtle)' }}
                            >
                              <div className="text-[10px] uppercase tracking-wider font-display font-bold text-emerald-300">
                                🐾 Ataques de {tok.name} (Sua Invocação):
                              </div>
                              {summonAttacks.map((satk, i) => (
                                <button
                                  key={`sum-atk-${i}`}
                                  type="button"
                                  onClick={() => {
                                    setSelectedTokenId(null);
                                    setPendingAttackChoice(
                                      buildPendingAttackFromMonsterAttack({
                                        token: tok,
                                        attack: satk,
                                        campaign,
                                        diceSkin: myCharacter.diceSkin || 'emerald',
                                        frameFallback: 'emerald',
                                      })
                                    );
                                  }}
                                  className="w-full rpg-card px-2 py-1 rounded text-[11px] flex items-center justify-between hover:border-emerald-400 cursor-pointer"
                                >
                                  <span className="truncate">{satk.name}</span>
                                  <span className="font-mono-dice text-[10px] text-emerald-300 shrink-0 ml-1">
                                    {formatMonsterAttackSummary(satk, campaign)}
                                  </span>
                                </button>
                              ))}
                              {condGrants.map(({ ability: ab, condition: cond }) => (
                                <button
                                  key={`sum-cond-${cond.id}-${ab.id}`}
                                  type="button"
                                  onClick={() => {
                                    setSelectedTokenId(null);
                                    const parsedCondDur = parseAbilityDuration(
                                      ab.duration,
                                      ab.conditionDurationRounds
                                    );
                                    setPendingAttackChoice({
                                      attackerTokenId: tok.id,
                                      attackerName: tok.name,
                                      attackerColor: tok.color,
                                      attackerImageUrl: tok.imageUrl,
                                      attackerFrame: tok.frameStyle || 'emerald',
                                      diceSkin: myCharacter.diceSkin || 'emerald',
                                      actionTitle: ab.name,
                                      attackFormula: ab.attackFormula,
                                      damageFormula: ab.damageFormula,
                                      damageType: ab.damageType,
                                      range: ab.range,
                                      actionCost: normalizeActionEconomyCost(ab.actionType),
                                      applyConditionId: ab.applyConditionId,
                                      conditionDurationRounds: parsedCondDur.isDiceFormula
                                        ? undefined
                                        : parsedCondDur.rounds,
                                      conditionDurationFormula: parsedCondDur.isDiceFormula
                                        ? parsedCondDur.formula
                                        : undefined,
                                      saveSkillId: ab.saveSkillId,
                                      saveDcFormula: ab.saveDcFormula,
                                      sfxPreset: ab.sfxPreset,
                                      vfxKind: ab.vfxKind,
                                      aoeShape: ab.aoeShape,
                                      aoeSizeMeters: ab.aoeSizeMeters,
                                      aoeColor: ab.aoeColor,
                                      aoePersistent: ab.aoePersistent,
                                      aoeTargetFilter: ab.aoeTargetFilter,
                                      createsSurface: ab.createsSurface,
                                    });
                                  }}
                                  className="w-full rpg-card px-2 py-1 rounded text-[11px] flex items-center justify-between border cursor-pointer"
                                  style={{ borderColor: cond.color || '#f59e0b' }}
                                >
                                  <span className="truncate">
                                    {cond.icon} {ab.name}
                                  </span>
                                  <span className="text-[10px] opacity-80">{ab.actionType}</span>
                                </button>
                              ))}
                            </div>
                          );
                        })()}

                      {/* GM Controls: Free Token Resize (1x1 to 8x8), Next-Attack Adv/Disadv, Monster Attacks, Death Save Rescue, Quick HP, Hide, Delete */}
                      {role === 'gm' && (
                        <div className="space-y-2 pt-1.5 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                          <button
                            type="button"
                            onClick={() => {
                              const sz = Math.max(1, tok.size || 1);
                              broadcastCameraFocus(tok.x + sz / 2, tok.y + sz / 2, tok.name);
                              showTacticalAlert(`🎯 Câmera da mesa focada em ${tok.name}!`);
                              setSelectedTokenId(null);
                            }}
                            className="w-full py-1 rounded bg-sky-950/75 hover:bg-sky-900 border border-sky-400/50 text-sky-200 text-[10px] font-display font-bold cursor-pointer"
                            title="Puxa suavemente a câmera de todos os jogadores conectados para este token!"
                          >
                            <Crosshair className="w-3.5 h-3.5 shrink-0" />
                        <span>Focar Câmera da Mesa Aqui</span>
                          </button>
                          <div className="flex items-center justify-between gap-1.5 text-[10px]">
                            <span className="font-display font-bold uppercase tracking-wider text-amber-300/90">
                              Tamanho: {tok.size}×{tok.size}
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                disabled={tok.size <= 1}
                                onClick={() =>
                                  updateActiveMap((m) => ({
                                    ...m,
                                    tokens: m.tokens.map((t) =>
                                      t.id === tok.id ? { ...t, size: Math.max(1, t.size - 1) } : t
                                    ),
                                  }))
                                }
                                className="rpg-card px-2 py-0.5 rounded font-bold cursor-pointer disabled:opacity-35"
                                title="Diminuir tamanho no grid"
                              >
                                -
                              </button>
                              <button
                                type="button"
                                disabled={tok.size >= 8}
                                onClick={() =>
                                  updateActiveMap((m) => ({
                                    ...m,
                                    tokens: m.tokens.map((t) =>
                                      t.id === tok.id ? { ...t, size: Math.min(8, t.size + 1) } : t
                                    ),
                                  }))
                                }
                                className="rpg-card px-2 py-0.5 rounded font-bold cursor-pointer disabled:opacity-35"
                                title="Aumentar tamanho no grid (até 8×8)"
                              >
                                +
                              </button>
                            </div>
                          </div>
                          {(tok.type === 'monster' || tok.type === 'npc') &&
                            tok.hp > 0 &&
                            (() => {
                              const condGrants = getConditionGrantedAbilities(
                                tok.activeConditionIds,
                                campaign
                              );
                              if (condGrants.length === 0) return null;
                              return (
                                <div className="space-y-1">
                                  <div className="text-[9px] uppercase tracking-wider font-display font-bold text-amber-300/90">
                                    Ataques por Condição:
                                  </div>
                                  {condGrants.map(({ ability: ab, condition: cond }) => (
                                    <button
                                      key={`gm-tok-cond-${cond.id}-${ab.id}`}
                                      type="button"
                                      onClick={() => {
                                        setSelectedTokenId(null);
                                        const parsedCondDur = parseAbilityDuration(
                                          ab.duration,
                                          ab.conditionDurationRounds
                                        );
                                        setPendingAttackChoice({
                                          attackerTokenId: tok.id,
                                          attackerName: tok.name,
                                          attackerColor: tok.color,
                                          attackerImageUrl: tok.imageUrl,
                                          attackerFrame: tok.frameStyle || 'crimson',
                                          diceSkin: 'blood',
                                          actionTitle: ab.name,
                                          attackFormula: ab.attackFormula,
                                          damageFormula: ab.damageFormula,
                                          damageType: ab.damageType,
                                          range: ab.range,
                                          actionCost: normalizeActionEconomyCost(ab.actionType),
                                          applyConditionId: ab.applyConditionId,
                                          conditionDurationRounds: parsedCondDur.isDiceFormula
                                            ? undefined
                                            : parsedCondDur.rounds,
                                          conditionDurationFormula: parsedCondDur.isDiceFormula
                                            ? parsedCondDur.formula
                                            : undefined,
                                          saveSkillId: ab.saveSkillId,
                                          saveDcFormula: ab.saveDcFormula,
                                          sfxPreset: ab.sfxPreset,
                                          vfxKind: ab.vfxKind,
                                          aoeShape: ab.aoeShape,
                                          aoeSizeMeters: ab.aoeSizeMeters,
                                          aoeColor: ab.aoeColor,
                                          aoePersistent: ab.aoePersistent,
                                          aoeTargetFilter: ab.aoeTargetFilter,
                                          createsSurface: ab.createsSurface,
                                        });
                                      }}
                                      style={{ borderColor: cond.color || '#f59e0b' }}
                                      className="w-full rpg-card px-2 py-1 rounded text-[10px] font-display font-bold flex items-center justify-between gap-1 border cursor-pointer"
                                    >
                                      <span className="truncate">
                                        {cond.icon} {ab.name}
                                      </span>
                                      <span className="font-mono-dice text-amber-300 shrink-0">
                                        {ab.damageFormula || cond.name}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              );
                            })()}
                          {linkedChar && (
                            <div className="space-y-1">
                              <div className="text-[9px] uppercase tracking-wider font-display font-bold text-amber-300/90">
                                Dado do Mestre (Próximo Ataque):
                              </div>
                              <div className="grid grid-cols-2 gap-1">
                                <button
                                  onClick={() =>
                                    setCharacterNextAttackOverride(linkedChar.id, 'advantage')
                                  }
                                  className={`px-2 py-1 rounded text-[10px] font-display font-bold border cursor-pointer transition ${
                                    linkedChar.nextAttackRollOverride === 'advantage'
                                      ? 'bg-emerald-900/90 border-emerald-400 text-emerald-100'
                                      : 'rpg-card hover:border-emerald-400/60 text-emerald-200'
                                  }`}
                                >
                                  + Vantagem
                                </button>
                                <button
                                  onClick={() =>
                                    setCharacterNextAttackOverride(linkedChar.id, 'disadvantage')
                                  }
                                  className={`px-2 py-1 rounded text-[10px] font-display font-bold border cursor-pointer transition ${
                                    linkedChar.nextAttackRollOverride === 'disadvantage'
                                      ? 'bg-red-900/90 border-red-400 text-red-100'
                                      : 'rpg-card hover:border-red-400/60 text-red-200'
                                  }`}
                                >
                                  + Desvant.
                                </button>
                              </div>
                            </div>
                          )}
                          {linkedChar && linkedChar.hp <= 0 && (() => {
                            const ds = linkedChar.deathSaves || { successes: 0, failures: 0 };
                            const isCharDead = Boolean(ds.dead || (ds.failures || 0) >= 3);
                            const isCharStab = !isCharDead && Boolean(ds.stabilized || (ds.successes || 0) >= 3);
                            return (
                              <div className="space-y-1">
                                <div className="text-[10px] uppercase tracking-wider text-red-300 font-bold">
                                  {isCharDead
                                    ? 'Herói Morto (3 Falhas)'
                                    : isCharStab
                                      ? 'Herói Estabilizado (0 PV)'
                                      : 'Portões da Morte (0 PV)'}
                                </div>
                                <div className="flex gap-1">
                                  {isCharDead ? (
                                    <>
                                      <button
                                        onClick={() => {
                                          setSelectedTokenId(null);
                                          gmResolveDeathSave(linkedChar.id, 'revive-1');
                                        }}
                                        className="flex-1 px-2 py-1 rounded bg-amber-900/80 hover:bg-amber-800 border border-amber-400/60 text-amber-100 text-[10px] font-bold cursor-pointer"
                                      >
                                        Reviver (1 PV)
                                      </button>
                                      <button
                                        onClick={() => {
                                          setSelectedTokenId(null);
                                          gmResolveDeathSave(linkedChar.id, 'revive-full');
                                        }}
                                        className="flex-1 rpg-btn-primary px-2 py-1 rounded text-[10px] font-bold cursor-pointer"
                                      >
                                        Reviver Total
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      {!isCharStab && (
                                        <button
                                          onClick={() => {
                                            setSelectedTokenId(null);
                                            gmResolveDeathSave(linkedChar.id, 'stabilize');
                                          }}
                                          className="flex-1 px-2 py-1 rounded bg-sky-900/80 hover:bg-sky-800 border border-sky-400/50 text-sky-100 text-[10px] font-bold cursor-pointer"
                                        >
                                          Estabilizar
                                        </button>
                                      )}
                                      <button
                                        onClick={() => {
                                          setSelectedTokenId(null);
                                          gmResolveDeathSave(linkedChar.id, 'save-full');
                                        }}
                                        className="flex-1 rpg-btn-primary px-2 py-1 rounded text-[10px] font-bold cursor-pointer"
                                      >
                                        Salvar Total
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            );
                          })()}
                          {linkedMonster && linkedMonster.attacks.length > 0 && (
                            <div className="space-y-1">
                              <div className="text-[10px] uppercase tracking-wider text-amber-300">
                                Atacar com {tok.name}:
                              </div>
                              {linkedMonster.attacks.map((matk, i) => (
                                <button
                                  key={i}
                                  onClick={() => {
                                    setSelectedTokenId(null);
                                    setPendingAttackChoice(
                                      buildPendingAttackFromMonsterAttack({
                                        token: tok,
                                        attack: matk,
                                        campaign,
                                        diceSkin: 'blood',
                                        frameFallback: 'crimson',
                                      })
                                    );
                                  }}
                                  className="w-full rpg-card px-2 py-1 rounded text-[11px] flex items-center justify-between hover:border-amber-400 cursor-pointer"
                                >
                                  <span className="truncate">{matk.name}</span>
                                  <span className="font-mono-dice text-[10px] text-amber-300 shrink-0 ml-1">
                                    {formatMonsterAttackSummary(matk, campaign)}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}

                          {tok.type === 'npc' &&
                            tok.referenceId &&
                            (() => {
                              const linkedNpc = campaign.npcs.find((n) => n.id === tok.referenceId);
                              if (!linkedNpc?.combatEnabled || !linkedNpc.attacks?.length) return null;
                              return (
                                <div className="space-y-1">
                                  <div className="text-[10px] uppercase tracking-wider text-amber-300">
                                    Ataques de {tok.name}:
                                  </div>
                                  {linkedNpc.attacks.map((natk, i) => (
                                    <button
                                      key={i}
                                      onClick={() => {
                                        setSelectedTokenId(null);
                                        setPendingAttackChoice(
                                          buildPendingAttackFromMonsterAttack({
                                            token: tok,
                                            attack: natk,
                                            campaign,
                                            diceSkin: 'gold',
                                            frameFallback: 'gold',
                                          })
                                        );
                                      }}
                                      className="w-full rpg-card px-2 py-1 rounded text-[11px] flex items-center justify-between hover:border-amber-400 cursor-pointer"
                                    >
                                      <span className="truncate">{natk.name}</span>
                                      <span className="font-mono-dice text-[10px] text-amber-300 shrink-0 ml-1">
                                        {formatMonsterAttackSummary(natk, campaign)}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              );
                            })()}

                          <div className="flex items-center justify-between gap-1">
                            <button
                              onClick={() =>
                                applyDamage(
                                  tok.id,
                                  5,
                                  false,
                                  undefined,
                                  undefined,
                                  undefined,
                                  undefined,
                                  false,
                                  { suppressExecution: true }
                                )
                              }
                              className="flex-1 py-1 rounded bg-red-900/60 hover:bg-red-800 text-white text-[11px] cursor-pointer"
                            >
                              -5
                            </button>
                            <button
                              onClick={() =>
                                applyDamage(
                                  tok.id,
                                  1,
                                  false,
                                  undefined,
                                  undefined,
                                  undefined,
                                  undefined,
                                  false,
                                  { suppressExecution: true }
                                )
                              }
                              className="flex-1 py-1 rounded bg-red-900/40 hover:bg-red-800 text-white text-[11px] cursor-pointer"
                            >
                              -1
                            </button>
                            <button
                              onClick={() =>
                                applyDamage(
                                  tok.id,
                                  1,
                                  true,
                                  undefined,
                                  undefined,
                                  undefined,
                                  undefined,
                                  false,
                                  { skipRevivePenalty: true }
                                )
                              }
                              className="flex-1 py-1 rounded bg-emerald-900/40 hover:bg-emerald-800 text-white text-[11px] cursor-pointer"
                            >
                              +1
                            </button>
                            <button
                              onClick={() =>
                                applyDamage(
                                  tok.id,
                                  5,
                                  true,
                                  undefined,
                                  undefined,
                                  undefined,
                                  undefined,
                                  false,
                                  { skipRevivePenalty: true }
                                )
                              }
                              className="flex-1 py-1 rounded bg-emerald-900/60 hover:bg-emerald-800 text-white text-[11px] cursor-pointer"
                            >
                              +5
                            </button>
                          </div>

                          {/* GM Tactical Maneuvers for Monsters, NPCs & Heroes during Combat */}
                          {campaign.combat.active && tok.hp > 0 && (
                            <div className="space-y-1 border-t pt-2" style={{ borderColor: 'var(--border-subtle)' }}>
                              <div className="text-[10px] uppercase tracking-wider text-amber-300/90 font-display font-bold">
                                Manobras Táticas (Mestre):
                              </div>
                              <div className="grid grid-cols-3 gap-1">
                                {(
                                  [
                                    { id: 'shove', label: 'Empurrar' },
                                    { id: 'hide', label: 'Esconder' },
                                    { id: 'jump', label: 'Saltar' },
                                    { id: 'dash', label: 'Disparada' },
                                    { id: 'disengage', label: 'Desengajar' },
                                    { id: 'dodge', label: 'Esquivar' },
                                    { id: 'help', label: 'Ajudar' },
                                  ] as const
                                ).map((m) => (
                                  <button
                                    key={m.id}
                                    type="button"
                                    onClick={() => {
                                      setSelectedTokenId(null);
                                      performCombatManeuver(m.id, tok.id);
                                    }}
                                    className="rpg-card px-1.5 py-1 rounded text-[10px] font-display font-semibold hover:border-amber-400/70 cursor-pointer text-center"
                                  >
                                    {m.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Open Full Sheet for Monster / NPC */}
                          {(tok.type === 'monster' || tok.type === 'npc') && tok.referenceId && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedTokenId(null);
                                openEntitySheet({
                                  kind: tok.type === 'monster' ? 'monster' : 'npc',
                                  id: tok.referenceId!,
                                });
                              }}
                              className="w-full rpg-card py-1.5 rounded text-[11px] font-display font-bold text-amber-200 hover:border-amber-400/70 cursor-pointer"
                            >
                              📜 Abrir Ficha Completa
                            </button>
                          )}

                          {/* Hide Name (???) Toggle for NPCs & Monsters (syncs to NPC record & map token) */}
                          {(tok.type === 'monster' || tok.type === 'npc') && (() => {
                            const isNameHidden = isTokenNameHiddenFromPlayers(tok, campaign);
                            return (
                              <button
                                type="button"
                                onClick={() => {
                                  const nextVal = !isNameHidden;
                                  updateCampaign((prev) => ({
                                    ...prev,
                                    npcs:
                                      tok.type === 'npc' && tok.referenceId
                                        ? prev.npcs.map((n) =>
                                            n.id === tok.referenceId
                                              ? { ...n, hideNameFromPlayers: nextVal }
                                              : n
                                          )
                                        : prev.npcs,
                                    maps: prev.maps.map((m) => ({
                                      ...m,
                                      tokens: m.tokens.map((t) =>
                                        t.id === tok.id ||
                                        (tok.type === 'npc' &&
                                          tok.referenceId &&
                                          t.type === 'npc' &&
                                          t.referenceId === tok.referenceId)
                                          ? { ...t, hideNameFromPlayers: nextVal }
                                          : t
                                      ),
                                    })),
                                  }));
                                }}
                                className={`w-full py-1 rounded text-[10px] font-display font-bold border cursor-pointer ${
                                  isNameHidden
                                    ? 'bg-purple-950/75 border-purple-400/60 text-purple-200'
                                    : 'bg-emerald-950/50 border-emerald-500/40 text-emerald-200'
                                }`}
                                title="Alternar se os jogadores veem o nome real ou '???'"
                              >
                                {isNameHidden
                                  ? 'Nome p/ Jogadores: ??? (Oculto)'
                                  : 'Nome p/ Jogadores: Visível'}
                              </button>
                            );
                          })()}

                          {/* Per-NPC & Per-Monster Hide CA / Hide Vitalidade (PV) Toggles */}
                          {(tok.type === 'monster' || tok.type === 'npc') && (() => {
                            const mDef =
                              tok.type === 'monster' && tok.referenceId
                                ? campaign.compendium.monsters.find((m) => m.id === tok.referenceId)
                                : undefined;
                            const nDef =
                              tok.type === 'npc' && tok.referenceId
                                ? campaign.npcs.find((n) => n.id === tok.referenceId)
                                : undefined;
                            const isAcHidden =
                              tok.hideAcFromPlayers !== undefined
                                ? tok.hideAcFromPlayers
                                : tok.type === 'npc' && nDef?.hideAcFromPlayers !== undefined
                                  ? nDef.hideAcFromPlayers
                                  : mDef?.hideAcFromPlayers !== undefined
                                    ? mDef.hideAcFromPlayers
                                    : tok.type === 'monster' || nDef?.disposition === 'Hostil'
                                      ? !campaign.settings.showEnemyAcToPlayers
                                      : false;
                            const isHpHidden = Boolean(
                              tok.hideHpFromPlayers !== undefined
                                ? tok.hideHpFromPlayers
                                : nDef?.hideHpFromPlayers !== undefined
                                  ? nDef.hideHpFromPlayers
                                  : mDef?.hideHpFromPlayers
                            );

                            const toggleTokenHideAc = () => {
                              const nextVal = !isAcHidden;
                              updateCampaign((prev) => ({
                                ...prev,
                                npcs:
                                  tok.type === 'npc' && tok.referenceId
                                    ? prev.npcs.map((n) =>
                                        n.id === tok.referenceId ? { ...n, hideAcFromPlayers: nextVal } : n
                                      )
                                    : prev.npcs,
                                maps: prev.maps.map((m) =>
                                  m.id !== activeMap.id
                                    ? m
                                    : {
                                        ...m,
                                        tokens: m.tokens.map((t) =>
                                          t.id === tok.id ? { ...t, hideAcFromPlayers: nextVal } : t
                                        ),
                                      }
                                ),
                              }));
                            };

                            const toggleTokenHideHp = () => {
                              const nextVal = !isHpHidden;
                              updateCampaign((prev) => ({
                                ...prev,
                                npcs:
                                  tok.type === 'npc' && tok.referenceId
                                    ? prev.npcs.map((n) =>
                                        n.id === tok.referenceId ? { ...n, hideHpFromPlayers: nextVal } : n
                                      )
                                    : prev.npcs,
                                maps: prev.maps.map((m) =>
                                  m.id !== activeMap.id
                                    ? m
                                    : {
                                        ...m,
                                        tokens: m.tokens.map((t) =>
                                          t.id === tok.id ? { ...t, hideHpFromPlayers: nextVal } : t
                                        ),
                                      }
                                ),
                              }));
                            };

                            return (
                              <div className="space-y-1">
                                <div className="grid grid-cols-2 gap-1.5">
                                  <button
                                    type="button"
                                    onClick={toggleTokenHideAc}
                                    className={`py-1 rounded text-[10px] font-display font-bold border cursor-pointer ${
                                      isAcHidden
                                        ? 'bg-slate-900/80 border-amber-500/50 text-amber-200'
                                        : 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200'
                                    }`}
                                    title="Alternar se jogadores veem a CA deste NPC/criatura"
                                  >
                                    {isAcHidden ? 'CA: Oculta (??)' : 'CA: Visível'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={toggleTokenHideHp}
                                    className={`py-1 rounded text-[10px] font-display font-bold border cursor-pointer ${
                                      isHpHidden
                                        ? 'bg-slate-900/80 border-amber-500/50 text-amber-200'
                                        : 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200'
                                    }`}
                                    title="Alternar se jogadores veem a Vitalidade (PV) deste NPC/criatura"
                                  >
                                    {isHpHidden ? 'PV: Oculto (??)' : 'PV: Visível'}
                                  </button>
                                </div>
                                {tok.type === 'monster' && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateActiveMap((m) => ({
                                        ...m,
                                        tokens: m.tokens.map((t) => {
                                          if (t.id !== tok.id) return t;
                                          const enabling = !t.isBoss;
                                          return {
                                            ...t,
                                            isBoss: enabling,
                                            bossTitle: enabling
                                              ? (t.bossTitle ?? linkedMonster?.bossTitle)
                                              : t.bossTitle,
                                          bossPhase: enabling ? 1 : undefined,
                                          bossPhase2HpPct: enabling
                                            ? (t.bossPhase2HpPct ?? linkedMonster?.bossPhase2HpPct)
                                            : t.bossPhase2HpPct,
                                          bossPhase2Title: enabling
                                            ? (t.bossPhase2Title ?? linkedMonster?.bossPhase2Title)
                                            : t.bossPhase2Title,
                                          bossPhases: enabling
                                            ? (t.bossPhases ??
                                              linkedMonster?.bossPhases?.map((p) => ({ ...p })))
                                            : t.bossPhases,
                                          triggeredBossPhaseIds: enabling ? [] : undefined,
                                          legendaryActionsMax: enabling
                                            ? (t.legendaryActionsMax ??
                                              linkedMonster?.legendaryActionsMax ??
                                              3)
                                            : undefined,
                                          legendaryActionsRemaining: enabling
                                            ? (t.legendaryActionsMax ??
                                              linkedMonster?.legendaryActionsMax ??
                                              3)
                                            : undefined,
                                          legendaryResistancesMax: enabling
                                            ? (t.legendaryResistancesMax ??
                                              linkedMonster?.legendaryResistancesMax ??
                                              3)
                                            : undefined,
                                          legendaryResistancesRemaining: enabling
                                            ? (t.legendaryResistancesMax ??
                                              linkedMonster?.legendaryResistancesMax ??
                                              3)
                                            : undefined,
                                        };
                                      }),
                                    }))
                                  }
                                  className={`w-full py-1 rounded text-[10px] font-display font-bold border cursor-pointer ${
                                    tok.isBoss
                                      ? 'bg-red-950/90 border-amber-400/80 text-amber-200'
                                      : 'rpg-card opacity-85 hover:opacity-100'
                                  }`}
                                  title="Ativar Barra de Chefe (Boss), Fases e Ações Lendárias"
                                >
                                  {tok.isBoss ? 'Chefe (Ativo)' : 'Tornar Chefe'}
                                </button>
                                )}
                              </div>
                            );
                          })()}

                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() =>
                                updateActiveMap((m) => ({
                                  ...m,
                                  tokens: m.tokens.map((t) =>
                                    t.id === tok.id ? { ...t, isHidden: !t.isHidden } : t
                                  ),
                                }))
                              }
                              className="flex-1 rpg-card py-1.5 rounded text-[11px] flex items-center justify-center gap-1 cursor-pointer"
                            >
                              {tok.isHidden ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                              <span>{tok.isHidden ? 'Revelar' : 'Ocultar'}</span>
                            </button>
                            <button
                              onClick={removeTokenFromMapAndCombat}
                              className="flex-1 py-1.5 rounded bg-red-950/80 border border-red-500/50 text-red-200 hover:bg-red-900 text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer"
                              title="Remover token do mapa e da iniciativa"
                            >
                              <Trash2 className="w-3 h-3" /> Remover Token
                            </button>
                          </div>

                          {/* Summon / Familiar Player Control + Manual Loot Drop for Monsters & NPCs */}
                          {(tok.type === 'monster' || tok.type === 'npc') && (
                            <div className="rpg-card p-2 rounded-lg space-y-1.5 text-[10px]">
                              <label className="block">
                                <span className="font-display font-bold text-emerald-300 block mb-0.5">
                                  🐾 Controlado por (Invocação / Familiar):
                                </span>
                                <select
                                  value={tok.controlledByCharacterId || ''}
                                  onChange={(e) => {
                                    const ownerId = e.target.value || undefined;
                                    updateCampaign((prev) => ({
                                      ...prev,
                                      maps: prev.maps.map((m) =>
                                        m.id !== activeMap.id
                                          ? m
                                          : {
                                              ...m,
                                              tokens: m.tokens.map((t) =>
                                                t.id === tok.id
                                                  ? { ...t, controlledByCharacterId: ownerId }
                                                  : t
                                              ),
                                            }
                                      ),
                                      combat: prev.combat.active
                                        ? {
                                            ...prev.combat,
                                            combatants: prev.combat.combatants.map((cb) =>
                                              cb.tokenId === tok.id
                                                ? { ...cb, controlledByCharacterId: ownerId }
                                                : cb
                                            ),
                                          }
                                        : prev.combat,
                                    }));
                                  }}
                                  className="rpg-input w-full py-0.5 text-[10px]"
                                >
                                  <option value="">Apenas Mestre</option>
                                  {campaign.characters.map((ch) => (
                                    <option key={ch.id} value={ch.id}>
                                      {ch.name} ({ch.playerName})
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <button
                                type="button"
                                onClick={() => {
                                  const goldVal = linkedMonster?.lootGoldFormula?.trim()
                                    ? Math.max(0, evaluateFormula(linkedMonster.lootGoldFormula.trim()).total)
                                    : 0;
                                  const lootDisplayName = isTokenNameHiddenFromPlayers(tok, campaign)
                                    ? 'Inimigo Desconhecido'
                                    : tok.name;
                                  const lootMarker: GmMapMarker = {
                                    id: `loot-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                                    x: tok.x,
                                    y: tok.y,
                                    kind: 'chest',
                                    title: `Espólio: ${lootDisplayName}`,
                                    description: `Itens e moedas deixados por ${lootDisplayName}.`,
                                    revealed: true,
                                    lootGold: goldVal > 0 ? goldVal : undefined,
                                    lootItems: linkedMonster?.lootItems?.map((li) => ({ ...li })),
                                  };
                                  updateActiveMap((m) => ({
                                    ...m,
                                    tokens: m.tokens.map((t) =>
                                      t.id === tok.id ? { ...t, lootDropped: true } : t
                                    ),
                                    gmMarkers: [...(m.gmMarkers || []), lootMarker],
                                  }));
                                  showTacticalAlert(`💰 Espólio de ${tok.name} solto no mapa!`);
                                  setSelectedTokenId(null);
                                }}
                                className="w-full py-1 rounded bg-amber-950/75 hover:bg-amber-900 border border-amber-400/50 text-amber-200 font-display font-bold cursor-pointer"
                                title="Soltar um baú/espólio saqueável na posição deste token"
                              >
                                💰 Soltar Espólio no Mapa
                              </button>
                            </div>
                          )}

                          {tok.isHidden && campaign.characters.length > 0 && (
                            <div className="rpg-card p-2 rounded-lg space-y-1">
                              <div className="text-[10px] font-display font-bold text-purple-300">
                                👁️ Oculto — Visível só para quem percebeu:
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {campaign.characters.map((ch) => {
                                  const canSee = (tok.visibleToCharacterIds || []).includes(ch.id);
                                  return (
                                    <button
                                      key={`tok-vis-${ch.id}`}
                                      type="button"
                                      onClick={() =>
                                        updateActiveMap((m) => ({
                                          ...m,
                                          tokens: m.tokens.map((t) => {
                                            if (t.id !== tok.id) return t;
                                            const cur = t.visibleToCharacterIds || [];
                                            return {
                                              ...t,
                                              visibleToCharacterIds: canSee
                                                ? cur.filter((id) => id !== ch.id)
                                                : [...cur, ch.id],
                                            };
                                          }),
                                        }))
                                      }
                                      className={`px-1.5 py-0.5 rounded text-[10px] border cursor-pointer ${
                                        canSee
                                          ? 'bg-purple-600/45 border-purple-400 text-purple-100 font-bold'
                                          : 'bg-black/30 border-white/15 opacity-70 hover:opacity-100'
                                      }`}
                                    >
                                      {canSee ? '👁️ ' : ''}{ch.name}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {tok.type === 'character' && tok.referenceId && (
                            <button
                              onClick={async () => {
                                if (
                                  await openConfirmDialog(
                                    `Excluir permanentemente o personagem "${tok.name}" de toda a campanha?`,
                                    'Excluir Personagem'
                                  )
                                ) {
                                  deleteCharacter(tok.referenceId!);
                                  setSelectedTokenId(null);
                                }
                              }}
                              className="w-full py-1.5 rounded bg-red-900/90 border border-red-400/60 text-white hover:bg-red-800 text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" /> Excluir Herói da Campanha
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    );
                  })()}
                </div>
              );
            })}

            {/* Ruler Line Overlay + Midpoint Metric Pill (m, ft, squares) */}
            {tool === 'ruler' && rulerStart && rulerEnd && (
              <>
                <svg
                  className="absolute inset-0 pointer-events-none z-20"
                  width={totalW}
                  height={totalH}
                >
                  <line
                    x1={(rulerStart.x + 0.5) * cellPx}
                    y1={(rulerStart.y + 0.5) * cellPx}
                    x2={(rulerEnd.x + 0.5) * cellPx}
                    y2={(rulerEnd.y + 0.5) * cellPx}
                    stroke="#fbbf24"
                    strokeWidth="3"
                    strokeDasharray="6 4"
                  />
                  <circle
                    cx={(rulerStart.x + 0.5) * cellPx}
                    cy={(rulerStart.y + 0.5) * cellPx}
                    r="5"
                    fill="#fbbf24"
                  />
                  <circle
                    cx={(rulerEnd.x + 0.5) * cellPx}
                    cy={(rulerEnd.y + 0.5) * cellPx}
                    r="5"
                    fill="#ef4444"
                  />
                </svg>
                {rulerMetrics && (
                  <div
                    className="absolute pointer-events-none z-25 bg-[#090b12]/92 border border-amber-400/75 text-amber-100 px-2 py-0.5 rounded-md text-[10px] font-mono-dice font-bold whitespace-nowrap shadow-xl"
                    style={{
                      left: ((rulerStart.x + rulerEnd.x + 1) / 2) * cellPx,
                      top: ((rulerStart.y + rulerEnd.y + 1) / 2) * cellPx - 14,
                      transform: 'translate(-50%, -100%)',
                    }}
                  >
                    {rulerMetrics.meters}m • {rulerMetrics.feet} ft ({rulerMetrics.squares}q)
                  </div>
                )}
              </>
            )}

            {/* GM Secret Map Markers & Interactive Treasures Layer */}
            {(activeMap.gmMarkers || []).map((marker) => {
              const isSpottedByMe = Boolean(
                myCharacter && (marker.visibleToCharacterIds || []).includes(myCharacter.id)
              );
              const isVisibleToPlayer = marker.revealed || isSpottedByMe;
              if (!isVisibleToPlayer && role !== 'gm') return null;
              if (revealedFogSet && !revealedFogSet.has(`${marker.x},${marker.y}`)) {
                return null;
              }
              if (darknessLitCells && role !== 'gm' && !darknessLitCells.has(`${marker.x},${marker.y}`)) {
                return null;
              }
              const isSelected = selectedMarkerId === marker.id;
              const hasLoot =
                (marker.lootItems && marker.lootItems.length > 0) ||
                (marker.lootGold ?? 0) > 0;
              const canPlayerClick = isVisibleToPlayer;
              const hasTokenOnMarker = activeMap.tokens.some((tok) => {
                if (
                  tok.isHidden &&
                  role !== 'gm' &&
                  !(myCharacter && (tok.visibleToCharacterIds || []).includes(myCharacter.id))
                ) {
                  return false;
                }
                const sz = Math.max(1, Math.round(tok.size || 1));
                return (
                  marker.x >= Math.floor(tok.x) &&
                  marker.x < Math.floor(tok.x) + sz &&
                  marker.y >= Math.floor(tok.y) &&
                  marker.y < Math.floor(tok.y) + sz
                );
              });
              const canInteractMarker =
                (role === 'gm' || canPlayerClick) && !pendingAttackChoice && !draggingTokenId;
              const markerAccent =
                marker.kind === 'light'
                  ? marker.lightEnabled === false
                    ? '#64748b'
                    : marker.lightColor || '#f59e0b'
                  : marker.kind === 'door'
                  ? marker.doorState === 'open'
                    ? '#22c55e'
                    : marker.doorState === 'locked'
                      ? '#f59e0b'
                      : '#d97706'
                  : marker.kind === 'chest'
                    ? '#f59e0b'
                    : marker.kind === 'item'
                      ? '#38bdf8'
                      : marker.kind === 'trap'
                        ? '#ef4444'
                        : '#a855f7';
              const markerTooltip =
                role === 'gm'
                  ? `${marker.title} (${marker.revealed ? 'Visível para Jogadores' : 'Escondido — Só o Mestre vê'})${hasTokenOnMarker ? ' • Clique no ícone para abrir' : ''}`
                  : `${marker.title} — Clique para abrir/interagir`;
              const handleMarkerMouseDown = (e: React.MouseEvent) => {
                if (!canInteractMarker) return;
                e.stopPropagation();
                setSelectedMarkerId((curr) => (curr === marker.id ? null : marker.id));
              };
              return (
                <div
                  key={marker.id}
                  onMouseDown={!hasTokenOnMarker ? handleMarkerMouseDown : undefined}
                  style={{
                    left: marker.x * cellPx,
                    top: marker.y * cellPx,
                    width: cellPx,
                    height: cellPx,
                    zIndex: isSelected ? 45 : hasTokenOnMarker ? 24 : 9,
                  }}
                  className={`absolute flex flex-col items-center justify-center ${
                    hasTokenOnMarker || !canInteractMarker
                      ? 'pointer-events-none'
                      : 'cursor-pointer'
                  } ${!marker.revealed ? 'opacity-85' : ''}`}
                  title={!hasTokenOnMarker ? markerTooltip : undefined}
                >
                  {/* Ornate Medallion Icon — shrinks into a clickable top-right corner handle whenever a token occupies this cell so the token can ALWAYS be clicked & dragged freely! */}
                  <div
                    onMouseDown={hasTokenOnMarker ? handleMarkerMouseDown : undefined}
                    title={hasTokenOnMarker ? markerTooltip : undefined}
                    className={
                      hasTokenOnMarker
                        ? `absolute -top-1.5 -right-1.5 w-[22px] h-[22px] rounded bg-[#0a0c14]/95 border-[1.5px] flex items-center justify-center shadow-[0_4px_12px_rgba(0,0,0,0.95)] transition-transform hover:scale-115 ${
                            canInteractMarker ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none'
                          }`
                        : 'w-[74%] h-[74%] rounded-md bg-[#0a0c14]/95 border-2 flex items-center justify-center relative shadow-[0_6px_16px_rgba(0,0,0,0.9)] transition-transform hover:scale-110'
                    }
                    style={{
                      borderColor: markerAccent,
                      boxShadow: `0 0 12px ${markerAccent}55, inset 0 0 8px ${markerAccent}33`,
                    }}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className={hasTokenOnMarker ? 'w-3.5 h-3.5' : 'w-4/6 h-4/6'}
                      fill="none"
                    >
                      {marker.kind === 'chest' && (
                        <>
                          <rect
                            x="3"
                            y="7"
                            width="18"
                            height="12"
                            rx="2"
                            fill="#451a03"
                            stroke="#fbbf24"
                            strokeWidth="1.8"
                          />
                          <path d="M3 11.5H21" stroke="#fbbf24" strokeWidth="1.6" />
                          <rect
                            x="10.5"
                            y="9.5"
                            width="3"
                            height="4"
                            rx="0.8"
                            fill="#fde047"
                          />
                        </>
                      )}
                      {marker.kind === 'item' && (
                        <polygon
                          points="12,2 20,9 12,22 4,9"
                          fill="#0284c7"
                          stroke="#bae6fd"
                          strokeWidth="1.8"
                        />
                      )}
                      {marker.kind === 'trap' && (
                        <>
                          <circle
                            cx="12"
                            cy="12"
                            r="6.5"
                            fill="#450a0a"
                            stroke="#f87171"
                            strokeWidth="1.8"
                          />
                          <path
                            d="M12 2V6M12 18V22M2 12H6M18 12H22M4.9 4.9L7.8 7.8M16.2 16.2L19.1 19.1M19.1 4.9L16.2 7.8M7.8 16.2L4.9 19.1"
                            stroke="#fca5a5"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                          />
                        </>
                      )}
                      {marker.kind === 'secret' && (
                        <>
                          <path
                            d="M6 21V7a6 6 0 0 1 12 0v14"
                            fill="#2e1065"
                            stroke="#d8b4fe"
                            strokeWidth="1.8"
                          />
                          <circle cx="15" cy="14" r="1.4" fill="#fde047" />
                        </>
                      )}
                      {marker.kind === 'light' && (
                        <>
                          <circle
                            cx="12"
                            cy="12"
                            r="6.5"
                            fill={marker.lightEnabled === false ? '#1e293b' : `${marker.lightColor || '#f59e0b'}44`}
                            stroke={marker.lightEnabled === false ? '#64748b' : marker.lightColor || '#fbbf24'}
                            strokeWidth="1.8"
                          />
                          <circle
                            cx="12"
                            cy="12"
                            r="2.8"
                            fill={marker.lightEnabled === false ? '#475569' : '#fef3c7'}
                          />
                        </>
                      )}
                      {marker.kind === 'door' && (
                        <>
                          <rect
                            x="5"
                            y="3"
                            width="14"
                            height="18"
                            rx="1.5"
                            fill={marker.doorState === 'open' ? 'rgba(34,197,94,0.2)' : '#451a03'}
                            stroke={marker.doorState === 'open' ? '#4ade80' : '#f59e0b'}
                            strokeWidth="1.8"
                            strokeDasharray={marker.doorState === 'open' ? '3 2' : undefined}
                          />
                          {marker.doorState === 'locked' ? (
                            <circle cx="12" cy="12" r="2.6" fill="#fbbf24" stroke="#78350f" strokeWidth="1" />
                          ) : marker.doorState !== 'open' ? (
                            <circle cx="15.5" cy="12" r="1.4" fill="#fde047" />
                          ) : null}
                        </>
                      )}
                    </svg>
                  </div>

                  {/* Marker Nameplate + Secret/Loot Badge (hidden when occupied so it doesn't clutter token) */}
                  {!hasTokenOnMarker && (
                    <div
                      className="absolute -top-3.5 px-1.5 py-0.2 rounded-xs bg-[#090b12]/95 border text-[8px] font-display font-bold whitespace-nowrap flex items-center gap-1 pointer-events-none shadow"
                      style={{ borderColor: markerAccent, color: '#fef3c7' }}
                    >
                      {!marker.revealed && role === 'gm' && (
                        <span className="text-amber-300">[SECRETO]</span>
                      )}
                      {!marker.revealed && role !== 'gm' && isSpottedByMe && (
                        <span className="text-purple-300" title="Percebido por você">👁️</span>
                      )}
                      <span>{marker.title}</span>
                      {hasLoot && (
                        <span className="text-emerald-300">
                          •{(marker.lootItems?.length || 0) + ((marker.lootGold || 0) > 0 ? 1 : 0)}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Player Treasure / Interactive Door Popover */}
                  {role !== 'gm' && isSelected && isVisibleToPlayer && (
                    <div
                      onMouseDown={(e) => e.stopPropagation()}
                      className="pointer-events-auto absolute bottom-[110%] left-1/2 -translate-x-1/2 w-60 rpg-glass-panel rounded-lg p-3 space-y-2 text-xs shadow-2xl z-50 cursor-default"
                    >
                      <div className="flex items-center justify-between border-b pb-1" style={{ borderColor: 'var(--border-subtle)' }}>
                        <span className="font-display font-bold text-amber-300 truncate">
                          {marker.title}
                        </span>
                        <button
                          onClick={() => setSelectedMarkerId(null)}
                          className="text-xs opacity-65 hover:opacity-100 cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>
                      {marker.kind === 'door' && (() => {
                        const myHeroTok = myCharacter
                          ? activeMap.tokens.find(
                              (t) => t.type === 'character' && t.referenceId === myCharacter.id
                            )
                          : undefined;
                        const distSq = myHeroTok
                          ? getGridSpanDistance(
                              myHeroTok.x,
                              myHeroTok.y,
                              myHeroTok.size || 1,
                              marker.x,
                              marker.y,
                              1,
                              sqMeters
                            ).squares
                          : 99;
                        const isAdjacent = distSq <= 1;
                        const dState = marker.doorState || 'closed';
                        const myHeroIncap = (myCharacter?.activeConditionIds || [])
                          .map((cid) => campaign.compendium.conditions.find((c) => c.id === cid))
                          .find(
                            (c) =>
                              c &&
                              /paralisad|atordoad|petrificad|inconscient|incapacitad/i.test(c.name)
                          );
                        const myDoorCb =
                          campaign.combat.active && myCharacter
                            ? campaign.combat.combatants.find((cb) => cb.referenceId === myCharacter.id)
                            : undefined;
                        const isNotMyCombatTurn = Boolean(
                          campaign.combat.active &&
                            activeTurnCombatant &&
                            (!myDoorCb || activeTurnCombatant.id !== myDoorCb.id)
                        );
                        const cannotInteractReason =
                          !myCharacter || myCharacter.hp <= 0
                            ? 'Você está caído (0 PV) e não pode interagir.'
                            : myHeroIncap
                              ? `Incapacitado (${myHeroIncap.name}) — não pode interagir.`
                              : isNotMyCombatTurn
                                ? `Aguarde seu turno (${maskHiddenNameForRole(
                                    activeTurnCombatant?.name || '',
                                    role,
                                    campaign,
                                    activeTurnCombatant?.tokenId
                                  )}) para interagir.`
                                : !isAdjacent
                                  ? 'Aproxime-se (adjacente) para interagir com esta porta.'
                                  : null;
                        return (
                          <div className="space-y-1.5">
                            <div className="text-[11px] opacity-80">
                              Estado:{' '}
                              <strong className="text-amber-200">
                                {dState === 'open'
                                  ? 'Aberta'
                                  : dState === 'locked'
                                    ? `Trancada (Ladinagem CD ${marker.lockDc ?? 13})`
                                    : 'Fechada'}
                              </strong>
                            </div>
                            {cannotInteractReason ? (
                              <div className="text-[10px] text-amber-300/80 italic">
                                {cannotInteractReason}
                              </div>
                            ) : dState === 'locked' ? (
                              <button
                                type="button"
                                onClick={() => {
                                  if (!myCharacter) return;
                                  if (
                                    campaign.combat.active &&
                                    myDoorCb &&
                                    myDoorCb.actionAvailable === false
                                  ) {
                                    showTacticalAlert(
                                      'Você já gastou sua Ação Padrão neste turno (Arrombar custa 1 Ação)!'
                                    );
                                    return;
                                  }
                                  const st = computeCharacterStats(myCharacter, campaign);
                                  const bonus =
                                    st.skills['ladinagem']?.total ??
                                    st.skills['prestidigitacao']?.total ??
                                    st.attributes['des']?.mod ??
                                    0;
                                  const dc = marker.lockDc ?? 13;
                                  const d20 = Math.floor(Math.random() * 20) + 1;
                                  const total = d20 + bonus;
                                  const ok = total >= dc;
                                  updateCampaign((prev) => ({
                                    ...prev,
                                    maps: ok
                                      ? prev.maps.map((m) => {
                                          if (m.id !== activeMap.id) return m;
                                          const withOpenDoor: TacticalMap = {
                                            ...m,
                                            gmMarkers: (m.gmMarkers || []).map((gm) =>
                                              gm.id === marker.id
                                                ? { ...gm, doorState: 'open', revealed: true }
                                                : gm
                                            ),
                                          };
                                          return withOpenDoor.fogEnabled
                                            ? {
                                                ...withOpenDoor,
                                                revealedCells: revealFogAfterDoorOpen(withOpenDoor),
                                              }
                                            : withOpenDoor;
                                        })
                                      : prev.maps,
                                    combat:
                                      prev.combat.active && myDoorCb
                                        ? {
                                            ...prev.combat,
                                            combatants: prev.combat.combatants.map((cb) =>
                                              cb.id === myDoorCb.id
                                                ? consumeCombatantEconomy(cb, 'Padrão')
                                                : cb
                                            ),
                                          }
                                        : prev.combat,
                                  }));
                                  pushCombatLog({
                                    category: 'system',
                                    actorName: myCharacter.name,
                                    actorKind: 'hero',
                                    actorColor: myCharacter.playerColor || myCharacter.tokenColor,
                                    summary: ok
                                      ? `destrancou e abriu ${marker.title} (Ladinagem ${total} vs CD ${dc})!`
                                      : `falhou ao tentar arrombar ${marker.title} (Ladinagem ${total} vs CD ${dc}).`,
                                  });
                                  showTacticalAlert(
                                    ok
                                      ? `🔓 ${myCharacter.name} destrancou ${marker.title} (${total} vs CD ${dc})!`
                                      : `🔒 Falhou ao arrombar ${marker.title} (${total} vs CD ${dc}).`
                                  );
                                  setSelectedMarkerId(null);
                                }}
                                className="w-full rpg-btn-primary py-1.5 rounded text-xs font-display font-bold cursor-pointer"
                              >
                                🔓 Tentar Arrombar (CD {marker.lockDc ?? 13}
                                {campaign.combat.active ? ' • Ação' : ''})
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  const nextState = dState === 'open' ? 'closed' : 'open';
                                  updateActiveMap((m) => {
                                    const nextMap: TacticalMap = {
                                      ...m,
                                      gmMarkers: (m.gmMarkers || []).map((gm) =>
                                        gm.id === marker.id
                                          ? {
                                              ...gm,
                                              doorState: nextState,
                                              ...(nextState === 'open' ? { revealed: true } : {}),
                                            }
                                          : gm
                                      ),
                                    };
                                    return nextState === 'open' && nextMap.fogEnabled
                                      ? {
                                          ...nextMap,
                                          revealedCells: revealFogAfterDoorOpen(nextMap),
                                        }
                                      : nextMap;
                                  });
                                  pushCombatLog({
                                    category: 'system',
                                    actorName: myCharacter?.name || 'Herói',
                                    actorKind: 'hero',
                                    summary: `${nextState === 'open' ? 'abriu' : 'fechou'} ${marker.title}.`,
                                  });
                                  setSelectedMarkerId(null);
                                }}
                                className="w-full rpg-btn-primary py-1.5 rounded text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer"
                              >
                                <DoorOpen className="w-3.5 h-3.5" />
                                <span>{dState === 'open' ? 'Fechar Porta' : 'Abrir Porta'}</span>
                              </button>
                            )}
                          </div>
                        );
                      })()}

                      {marker.kind !== 'door' &&
                        marker.kind !== 'light' &&
                        (hasLoot ? (
                          <div className="space-y-1 text-[11px]">
                            {(marker.lootGold ?? 0) > 0 && (
                              <div className="text-[#e8c683] font-mono-dice font-bold">
                                {marker.lootGold} PO
                              </div>
                            )}
                            {(marker.lootItems || []).map((li) => {
                              const itemDef = campaign.compendium.items.find(
                                (it) => it.id === li.itemId
                              );
                              return (
                                <div key={li.itemId} className="flex items-center justify-between">
                                  <span className="truncate">{itemDef?.name || 'Item'}</span>
                                  <span className="font-mono-dice text-[#74c997]">x{li.quantity}</span>
                                </div>
                              );
                            })}
                            <button
                              type="button"
                              onClick={() => {
                                claimTreasureMarker(marker.id);
                                setSelectedMarkerId(null);
                              }}
                              className="w-full rpg-btn-primary px-3 py-1.5 rounded text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer mt-1"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                              <span>Pegar Tesouro</span>
                            </button>
                          </div>
                        ) : marker.description ? (
                          <div className="text-[11px] font-lore leading-relaxed text-[#ece4d5]">
                            {marker.description}
                          </div>
                        ) : marker.kind === 'chest' || marker.kind === 'item' ? (
                          <div className="text-[11px] font-lore italic text-[#8c8374]">
                            Baú vazio no momento.
                          </div>
                        ) : (
                          <div className="text-[11px] font-lore italic text-[#cfb3f2] flex items-center gap-1.5">
                            <Eye className="w-3 h-3 shrink-0" />
                            <span>Você percebeu este detalhe oculto no ambiente.</span>
                          </div>
                        ))}
                    </div>
                  )}

                  {/* GM Interactive Popover to Rename, Add Loot/Gold, Reveal/Hide, or Remove */}
                  {role === 'gm' && isSelected && (
                    <div
                      onMouseDown={(e) => e.stopPropagation()}
                      className="pointer-events-auto absolute bottom-[110%] left-1/2 -translate-x-1/2 w-64 rpg-glass-panel rounded-lg p-2.5 space-y-2 text-xs shadow-2xl z-50 cursor-default"
                    >
                      <div className="flex items-center justify-between border-b pb-1" style={{ borderColor: 'var(--border-subtle)' }}>
                        <span className="text-[10px] font-display font-bold uppercase tracking-wider text-amber-300">
                          Segredo / Tesouro do Mestre
                        </span>
                        <button
                          onClick={() => setSelectedMarkerId(null)}
                          className="text-xs opacity-65 hover:opacity-100 cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>
                      <input
                        type="text"
                        value={marker.title}
                        onChange={(e) => {
                          const val = e.target.value;
                          updateActiveMap((m) => ({
                            ...m,
                            gmMarkers: (m.gmMarkers || []).map((gm) =>
                              gm.id === marker.id ? { ...gm, title: val } : gm
                            ),
                          }));
                        }}
                        className="rpg-input w-full text-xs px-2 py-1 rounded"
                        placeholder="Nome do segredo..."
                      />

                      {marker.kind === 'trap' && (
                        <div className="space-y-1.5 p-2 rounded bg-red-950/35 border border-red-500/35 text-[10px]">
                          <div className="flex items-center justify-between font-display font-bold text-red-300">
                            <span>Armadilha Automática</span>
                            <span>{marker.trapTriggered ? 'Disparada' : 'Armada'}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            <label className="block">
                              <span className="opacity-75">CD</span>
                              <input
                                type="number"
                                value={marker.trapDc ?? 13}
                                onChange={(e) => {
                                  const v = Math.max(5, Number(e.target.value) || 13);
                                  updateActiveMap((m) => ({
                                    ...m,
                                    gmMarkers: (m.gmMarkers || []).map((gm) =>
                                      gm.id === marker.id ? { ...gm, trapDc: v } : gm
                                    ),
                                  }));
                                }}
                                className="rpg-input w-full py-0.5 text-center"
                              />
                            </label>
                            <label className="block">
                              <span className="opacity-75">Salvaguarda</span>
                              <select
                                value={marker.trapSaveSkillId || 'reflexos'}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  updateActiveMap((m) => ({
                                    ...m,
                                    gmMarkers: (m.gmMarkers || []).map((gm) =>
                                      gm.id === marker.id ? { ...gm, trapSaveSkillId: v } : gm
                                    ),
                                  }));
                                }}
                                className="rpg-input w-full py-0.5 text-[10px]"
                              >
                                <option value="salv-forca">Vigor Físico (FOR)</option>
                                <option value="reflexos">Reflexos (DES)</option>
                                <option value="fortitude">Resiliência (CON)</option>
                                <option value="salv-inteligencia">Lucidez (INT)</option>
                                <option value="vontade">Vontade (SAB)</option>
                                <option value="salv-carisma">Presença (CAR)</option>
                              </select>
                            </label>
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            <label className="block">
                              <span className="opacity-75">Dano</span>
                              <input
                                value={marker.trapDamageFormula || '2d6'}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  updateActiveMap((m) => ({
                                    ...m,
                                    gmMarkers: (m.gmMarkers || []).map((gm) =>
                                      gm.id === marker.id ? { ...gm, trapDamageFormula: v } : gm
                                    ),
                                  }));
                                }}
                                className="rpg-input w-full py-0.5 font-mono-dice"
                              />
                            </label>
                            <label className="block">
                              <span className="opacity-75">Tipo</span>
                              <select
                                value={marker.trapDamageType || 'Perfuração'}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  updateActiveMap((m) => ({
                                    ...m,
                                    gmMarkers: (m.gmMarkers || []).map((gm) =>
                                      gm.id === marker.id ? { ...gm, trapDamageType: v } : gm
                                    ),
                                  }));
                                }}
                                className="rpg-input w-full py-0.5 text-[10px]"
                              >
                                {DAMAGE_TYPE_OPTIONS.map((dt) => (
                                  <option key={dt} value={dt}>
                                    {dt}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                          {marker.trapTriggered && (
                            <button
                              type="button"
                              onClick={() =>
                                updateActiveMap((m) => ({
                                  ...m,
                                  gmMarkers: (m.gmMarkers || []).map((gm) =>
                                    gm.id === marker.id
                                      ? { ...gm, trapTriggered: false, revealed: false }
                                      : gm
                                  ),
                                }))
                              }
                              className="w-full rpg-card py-1 rounded font-display font-bold text-amber-200 cursor-pointer hover:border-amber-400/60"
                            >
                              Rearmar &amp; Ocultar Armadilha
                            </button>
                          )}
                        </div>
                      )}

                      {/* Secret Passage Target Map Link & Connected Destination Passage */}
                      {marker.kind === 'secret' && (() => {
                        const dstMapObj = marker.targetMapId
                          ? campaign.maps.find((mp) => mp.id === marker.targetMapId)
                          : undefined;
                        const dstSecrets = (dstMapObj?.gmMarkers || []).filter(
                          (gm) => gm.kind === 'secret'
                        );
                        return (
                          <div className="space-y-1.5 p-2 rounded bg-purple-950/40 border border-purple-400/40 text-[10px]">
                            <div className="font-display font-bold text-purple-200">
                              Passagem Secreta — Conexão entre Mapas
                            </div>
                            <label className="block">
                              <span className="opacity-75 block mb-0.5">Mapa de Destino</span>
                              <select
                                value={marker.targetMapId || ''}
                                onChange={(e) => {
                                  const val = e.target.value || undefined;
                                  updateActiveMap((m) => ({
                                    ...m,
                                    gmMarkers: (m.gmMarkers || []).map((gm) =>
                                      gm.id === marker.id
                                        ? { ...gm, targetMapId: val, targetMarkerId: undefined }
                                        : gm
                                    ),
                                  }));
                                }}
                                className="rpg-input w-full py-1 text-[11px]"
                              >
                                <option value="">Apenas notificar (sem trocar mapa)</option>
                                {campaign.maps
                                  .filter((mp) => mp.id !== activeMap.id)
                                  .map((mp) => (
                                    <option key={mp.id} value={mp.id}>
                                      Ir para: {mp.name}
                                    </option>
                                  ))}
                              </select>
                            </label>
                            {dstMapObj && (
                              <label className="block">
                                <span className="opacity-75 block mb-0.5">
                                  Passagem Conectada em {dstMapObj.name}
                                </span>
                                <select
                                  value={marker.targetMarkerId || ''}
                                  onChange={(e) => {
                                    const val = e.target.value || undefined;
                                    updateActiveMap((m) => ({
                                      ...m,
                                      gmMarkers: (m.gmMarkers || []).map((gm) =>
                                        gm.id === marker.id ? { ...gm, targetMarkerId: val } : gm
                                      ),
                                    }));
                                  }}
                                  className="rpg-input w-full py-1 text-[11px]"
                                >
                                  <option value="">Entrada padrão do mapa</option>
                                  {dstSecrets.map((ds) => (
                                    <option key={ds.id} value={ds.id}>
                                      🌀 {ds.title} ({ds.x},{ds.y})
                                    </option>
                                  ))}
                                </select>
                              </label>
                            )}
                            {dstMapObj && marker.targetMarkerId && (
                              <button
                                type="button"
                                onClick={() => {
                                  updateCampaign((prev) => ({
                                    ...prev,
                                    maps: prev.maps.map((mp) =>
                                      mp.id !== dstMapObj.id
                                        ? mp
                                        : {
                                            ...mp,
                                            gmMarkers: (mp.gmMarkers || []).map((gm) =>
                                              gm.id === marker.targetMarkerId
                                                ? {
                                                    ...gm,
                                                    targetMapId: activeMap.id,
                                                    targetMarkerId: marker.id,
                                                  }
                                                : gm
                                            ),
                                          }
                                    ),
                                  }));
                                  showTacticalAlert(
                                    `Passagens conectadas em ida e volta entre "${activeMap.name}" e "${dstMapObj.name}"!`
                                  );
                                }}
                                className="w-full rpg-card py-1 rounded font-display font-bold text-emerald-300 hover:border-emerald-400 cursor-pointer"
                              >
                                🔗 Conectar Ida e Volta Automaticamente
                              </button>
                            )}
                            <div className="flex gap-1.5 pt-0.5">
                              <button
                                type="button"
                                onClick={() => triggerSecretPassage(marker.id)}
                                className="flex-1 rpg-card py-1 rounded font-display font-bold text-purple-200 cursor-pointer hover:border-purple-400/60"
                              >
                                Notificar
                              </button>
                              {marker.targetMapId && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    moveTokensToMap(
                                      activeMap.id,
                                      marker.targetMapId!,
                                      'all-heroes',
                                      marker.targetMarkerId
                                    )
                                  }
                                  className="flex-1 rpg-btn-primary py-1 rounded font-display font-bold cursor-pointer"
                                >
                                  Levar Grupo →
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })()}

                      {(marker.kind === 'chest' || marker.kind === 'item') && (
                        <div className="space-y-1.5 p-2 rounded bg-black/35 border border-amber-500/30">
                          <div className="flex items-center justify-between text-[10px] font-display font-bold text-amber-300">
                            <span>Conteúdo do Tesouro</span>
                            <label className="flex items-center gap-1 font-mono-dice">
                              <span>PO:</span>
                              <input
                                type="number"
                                min={0}
                                value={marker.lootGold ?? 0}
                                onChange={(e) => {
                                  const goldVal = Math.max(0, Number(e.target.value) || 0);
                                  updateActiveMap((m) => ({
                                    ...m,
                                    gmMarkers: (m.gmMarkers || []).map((gm) =>
                                      gm.id === marker.id ? { ...gm, lootGold: goldVal } : gm
                                    ),
                                  }));
                                }}
                                className="rpg-input w-14 text-[11px] px-1 py-0.5 text-center"
                              />
                            </label>
                          </div>

                          {(marker.lootItems || []).length > 0 && (
                            <div className="space-y-1 max-h-20 overflow-y-auto">
                              {(marker.lootItems || []).map((li) => {
                                const itDef = campaign.compendium.items.find(
                                  (it) => it.id === li.itemId
                                );
                                return (
                                  <div
                                    key={li.itemId}
                                    className="flex items-center justify-between gap-1 text-[10px] bg-black/30 px-1.5 py-0.5 rounded"
                                  >
                                    <span className="truncate">
                                      {li.quantity}x {itDef?.name || li.itemId}
                                    </span>
                                    <button
                                      onClick={() =>
                                        updateActiveMap((m) => ({
                                          ...m,
                                          gmMarkers: (m.gmMarkers || []).map((gm) =>
                                            gm.id === marker.id
                                              ? {
                                                  ...gm,
                                                  lootItems: (gm.lootItems || []).filter(
                                                    (x) => x.itemId !== li.itemId
                                                  ),
                                                }
                                              : gm
                                          ),
                                        }))
                                      }
                                      className="text-red-400 hover:text-red-200 cursor-pointer"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          <div className="flex items-center gap-1">
                            <select
                              value={treasureDraftItemId}
                              onChange={(e) => setTreasureDraftItemId(e.target.value)}
                              className="rpg-input flex-1 text-[10px] py-1"
                            >
                              {campaign.compendium.items.map((it) => (
                                <option key={it.id} value={it.id}>
                                  {it.name}
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={() => {
                                if (!treasureDraftItemId) return;
                                updateActiveMap((m) => ({
                                  ...m,
                                  gmMarkers: (m.gmMarkers || []).map((gm) => {
                                    if (gm.id !== marker.id) return gm;
                                    const list = [...(gm.lootItems || [])];
                                    const idx = list.findIndex(
                                      (x) => x.itemId === treasureDraftItemId
                                    );
                                    if (idx >= 0) {
                                      list[idx] = {
                                        ...list[idx],
                                        quantity: list[idx].quantity + 1,
                                      };
                                    } else {
                                      list.push({ itemId: treasureDraftItemId, quantity: 1 });
                                    }
                                    return { ...gm, lootItems: list };
                                  }),
                                }));
                              }}
                              className="rpg-btn-primary px-2 py-1 rounded text-[10px] font-bold cursor-pointer shrink-0"
                            >
                              + Item
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Map Light Point Controls (GM) */}
                      {marker.kind === 'light' && (
                        <div className="rpg-card p-2 rounded space-y-2 text-[10px]">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-display font-bold text-[#e8c683] flex items-center gap-1.5">
                              <Lightbulb className="w-3.5 h-3.5 text-[#d4ad5c]" />
                              <span>Ponto de Luz</span>
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                updateActiveMap((m) => ({
                                  ...m,
                                  gmMarkers: (m.gmMarkers || []).map((gm) =>
                                    gm.id === marker.id
                                      ? { ...gm, lightEnabled: gm.lightEnabled === false }
                                      : gm
                                  ),
                                }))
                              }
                              className={`px-2 py-0.5 rounded border font-display font-semibold cursor-pointer ${
                                marker.lightEnabled !== false
                                  ? 'bg-[#2a2112] border-[#d4ad5c] text-[#f0d89d]'
                                  : 'bg-[#090b10] border-white/15 text-[#8c8374]'
                              }`}
                            >
                              {marker.lightEnabled !== false ? 'Ligada' : 'Apagada'}
                            </button>
                          </div>
                          <label className="flex items-center justify-between gap-2">
                            <span className="text-[#a69b88]">Raio de Luz (metros)</span>
                            <input
                              type="number"
                              min={1.5}
                              max={30}
                              step={1.5}
                              value={marker.lightRadiusMeters ?? 6}
                              onChange={(e) => {
                                const r = Math.max(1.5, Math.min(30, Number(e.target.value) || 6));
                                updateActiveMap((m) => ({
                                  ...m,
                                  gmMarkers: (m.gmMarkers || []).map((gm) =>
                                    gm.id === marker.id ? { ...gm, lightRadiusMeters: r } : gm
                                  ),
                                }));
                              }}
                              className="rpg-input w-16 py-0.5 text-center font-mono-dice"
                            />
                          </label>
                          <div className="space-y-1">
                            <span className="text-[#a69b88] block">Cor da Luz</span>
                            <div className="flex flex-wrap gap-1">
                              {[
                                { label: 'Fogo', color: '#f59e0b' },
                                { label: 'Lua', color: '#60a5fa' },
                                { label: 'Arcano', color: '#a855f7' },
                                { label: 'Esmer.', color: '#34d399' },
                                { label: 'Sangue', color: '#ef4444' },
                                { label: 'Branco', color: '#fef3c7' },
                              ].map((preset) => (
                                <button
                                  key={preset.color}
                                  type="button"
                                  onClick={() =>
                                    updateActiveMap((m) => ({
                                      ...m,
                                      gmMarkers: (m.gmMarkers || []).map((gm) =>
                                        gm.id === marker.id ? { ...gm, lightColor: preset.color } : gm
                                      ),
                                    }))
                                  }
                                  className={`px-1.5 py-0.5 rounded border flex items-center gap-1 cursor-pointer ${
                                    (marker.lightColor || '#f59e0b') === preset.color
                                      ? 'border-[#d4ad5c] font-semibold bg-[#221c12] text-[#ece4d5]'
                                      : 'border-white/15 bg-[#090b10] text-[#a69b88] hover:text-[#ece4d5]'
                                  }`}
                                >
                                  <span
                                    className="w-2 h-2 rounded-full shrink-0"
                                    style={{ backgroundColor: preset.color }}
                                  />
                                  <span>{preset.label}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Interactive Door Controls (GM) */}
                      {marker.kind === 'door' && (
                        <div className="rpg-card p-2 rounded-lg space-y-1.5 text-[10px]">
                          <div className="font-display font-bold text-amber-300">
                            🚪 Estado da Porta (bloqueia visão, luz e movimento se fechada)
                          </div>
                          <div className="grid grid-cols-3 gap-1">
                            {(
                              [
                                { id: 'open', label: 'Aberta' },
                                { id: 'closed', label: 'Fechada' },
                                { id: 'locked', label: '🔒 Trancada' },
                              ] as const
                            ).map((st) => (
                              <button
                                key={st.id}
                                type="button"
                                onClick={() =>
                                  updateActiveMap((m) => {
                                    const nextMap: TacticalMap = {
                                      ...m,
                                      gmMarkers: (m.gmMarkers || []).map((gm) =>
                                        gm.id === marker.id
                                          ? {
                                              ...gm,
                                              doorState: st.id,
                                              ...(st.id === 'open' ? { revealed: true } : {}),
                                            }
                                          : gm
                                      ),
                                    };
                                    return st.id === 'open' && nextMap.fogEnabled
                                      ? {
                                          ...nextMap,
                                          revealedCells: revealFogAfterDoorOpen(nextMap),
                                        }
                                      : nextMap;
                                  })
                                }
                                className={`py-1 rounded border cursor-pointer font-display font-bold ${
                                  (marker.doorState || 'closed') === st.id
                                    ? 'bg-amber-600/40 border-amber-400 text-amber-100'
                                    : 'bg-black/35 border-white/15 opacity-75 hover:opacity-100'
                                }`}
                              >
                                {st.label}
                              </button>
                            ))}
                          </div>
                          {(marker.doorState || 'closed') === 'locked' && (
                            <label className="flex items-center justify-between gap-2">
                              <span className="opacity-80">CD para Arrombar (Ladinagem):</span>
                              <input
                                type="number"
                                min={1}
                                max={35}
                                value={marker.lockDc ?? 13}
                                onChange={(e) => {
                                  const dc = Math.max(1, Number(e.target.value) || 13);
                                  updateActiveMap((m) => ({
                                    ...m,
                                    gmMarkers: (m.gmMarkers || []).map((gm) =>
                                      gm.id === marker.id ? { ...gm, lockDc: dc } : gm
                                    ),
                                  }));
                                }}
                                className="rpg-input w-14 py-0.5 text-center font-mono-dice"
                              />
                            </label>
                          )}
                        </div>
                      )}

                      {/* Selective Per-Player Visibility & Perception DC */}
                      <div className="rpg-card p-2 rounded-lg space-y-1.5 text-[10px]">
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="font-display font-bold text-purple-300">
                            👁️ Percepção / Visível só para:
                          </span>
                          <label className="flex items-center gap-1">
                            <span className="opacity-75">CD</span>
                            <input
                              type="number"
                              min={0}
                              max={35}
                              placeholder="—"
                              value={marker.perceptionDc ?? ''}
                              onChange={(e) => {
                                const raw = Number(e.target.value);
                                const val = raw > 0 ? raw : undefined;
                                updateActiveMap((m) => ({
                                  ...m,
                                  gmMarkers: (m.gmMarkers || []).map((gm) =>
                                    gm.id === marker.id ? { ...gm, perceptionDc: val } : gm
                                  ),
                                }));
                              }}
                              className="rpg-input w-12 py-0.5 px-1 text-center font-mono-dice"
                              title="CD de Percepção (0 = sem teste automático). Quem rolar Percepção >= CD vê automaticamente!"
                            />
                          </label>
                        </div>
                        {campaign.characters.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {campaign.characters.map((ch) => {
                              const canSee = (marker.visibleToCharacterIds || []).includes(ch.id);
                              return (
                                <button
                                  key={`mk-vis-${ch.id}`}
                                  type="button"
                                  onClick={() =>
                                    updateActiveMap((m) => ({
                                      ...m,
                                      gmMarkers: (m.gmMarkers || []).map((gm) => {
                                        if (gm.id !== marker.id) return gm;
                                        const cur = gm.visibleToCharacterIds || [];
                                        return {
                                          ...gm,
                                          visibleToCharacterIds: canSee
                                            ? cur.filter((id) => id !== ch.id)
                                            : [...cur, ch.id],
                                        };
                                      }),
                                    }))
                                  }
                                  className={`px-1.5 py-0.5 rounded border cursor-pointer ${
                                    canSee
                                      ? 'bg-purple-600/45 border-purple-400 text-purple-100 font-bold'
                                      : 'bg-black/30 border-white/15 opacity-70 hover:opacity-100'
                                  }`}
                                >
                                  {canSee ? '👁️ ' : ''}{ch.name}
                                </button>
                              );
                            })}
                          </div>
                        )}
                        {(marker.perceptionDc ?? 0) > 0 && campaign.characters.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              const dc = marker.perceptionDc || 12;
                              const passedIds: string[] = [];
                              const passedNames: string[] = [];
                              campaign.characters.forEach((ch) => {
                                const st = computeCharacterStats(ch, campaign);
                                const percepBonus =
                                  st.skills['percepcao']?.total ??
                                  st.attributes['sab']?.mod ??
                                  0;
                                const d20 = Math.floor(Math.random() * 20) + 1;
                                const tot = d20 + percepBonus;
                                if (tot >= dc) {
                                  passedIds.push(ch.id);
                                  passedNames.push(`${ch.name} (${tot})`);
                                }
                              });
                              if (passedIds.length > 0) {
                                updateActiveMap((m) => ({
                                  ...m,
                                  gmMarkers: (m.gmMarkers || []).map((gm) =>
                                    gm.id === marker.id
                                      ? {
                                          ...gm,
                                          visibleToCharacterIds: Array.from(
                                            new Set([
                                              ...(gm.visibleToCharacterIds || []),
                                              ...passedIds,
                                            ])
                                          ),
                                        }
                                      : gm
                                  ),
                                }));
                                showTacticalAlert(
                                  `👁️ Percepção (CD ${dc}): ${passedNames.join(', ')} avistou "${marker.title}"!`
                                );
                              } else {
                                showTacticalAlert(
                                  `Ninguém passou na Percepção (CD ${dc}) para notar "${marker.title}".`
                                );
                              }
                            }}
                            className="w-full py-1 rounded bg-purple-950/75 hover:bg-purple-900 border border-purple-400/50 text-purple-200 font-display font-bold cursor-pointer"
                            title="Rola Percepção secreta para todos os heróis e libera este marcador apenas para quem passar!"
                          >
                            🎲 Testar Percepção do Grupo (CD {marker.perceptionDc})
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() =>
                            updateActiveMap((m) => ({
                              ...m,
                              gmMarkers: (m.gmMarkers || []).map((gm) =>
                                gm.id === marker.id ? { ...gm, revealed: !gm.revealed } : gm
                              ),
                            }))
                          }
                          className={`flex-1 px-2 py-1 rounded text-[11px] font-display font-bold cursor-pointer ${
                            marker.revealed ? 'rpg-card text-amber-200' : 'rpg-btn-primary'
                          }`}
                        >
                          {marker.revealed ? 'Ocultar dos Jogadores' : 'Revelar aos Jogadores'}
                        </button>
                        <button
                          onClick={() => {
                            updateActiveMap((m) => ({
                              ...m,
                              gmMarkers: (m.gmMarkers || []).filter((gm) => gm.id !== marker.id),
                            }));
                            setSelectedMarkerId(null);
                          }}
                          className="rpg-card px-2 py-1 rounded text-red-400 hover:bg-red-500/20 cursor-pointer"
                          title="Remover segredo do mapa"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Animated Spell / Arrow Projectiles & Critical Impact Bursts */}
            <ProjectileVfxCanvas
              projectiles={projectileVfx.filter((p) => p.mapId === activeMap.id)}
              cellPx={cellPx}
              gridWidth={activeMap.gridWidth}
              gridHeight={activeMap.gridHeight}
            />

            {/* Expanding Cinematic Impact Shockwave Rings (Crits, AoE Explosions) */}
            {cinematicEnabled &&
              shockwaves
                .filter((sw) => sw.mapId === activeMap.id)
                .map((sw) => (
                  <div
                    key={sw.id}
                    className="absolute pointer-events-none z-35 rounded-full animate-shockwave-ring"
                    style={{
                      left: sw.x * cellPx,
                      top: sw.y * cellPx,
                      width: sw.sizePx || 120,
                      height: sw.sizePx || 120,
                      border: `3px solid ${sw.color}`,
                      boxShadow: `0 0 24px ${sw.color}, inset 0 0 18px ${sw.color}`,
                    }}
                  />
                ))}

            {/* Smooth Circular Feathered 2D Canvas Dynamic Darkness + Raycasted Wall & Door Shadows */}
            {activeMap.darknessEnabled && (
              <DynamicDarknessCanvas
                width={totalW}
                height={totalH}
                cellPx={cellPx}
                gridWidth={activeMap.gridWidth}
                gridHeight={activeMap.gridHeight}
                terrain={effectiveTerrainForDarkness}
                wallMeta={effectiveWallMetaForDarkness}
                lights={dynamicLightCircles}
                isGm={role === 'gm'}
              />
            )}

            {/* Active Domain Expansion Atmospheric Veil on the Battlemap */}
            {campaign.activeDomain && campaign.activeDomain.mapId === activeMap.id && (() => {
              const dom = campaign.activeDomain;
              const accent = dom.color || '#38bdf8';
              const bgOverlay =
                dom.theme === 'crimson'
                  ? `radial-gradient(ellipse at 50% 45%, ${accent}18 0%, rgba(75,8,16,0.34) 68%, rgba(28,3,8,0.62) 100%)`
                  : dom.theme === 'void'
                    ? `radial-gradient(ellipse at 50% 50%, ${accent}1e 0%, rgba(22,8,48,0.42) 64%, rgba(6,3,18,0.68) 100%)`
                    : dom.theme === 'frost'
                      ? `radial-gradient(ellipse at 50% 50%, rgba(186,230,253,0.12) 0%, rgba(12,48,78,0.30) 68%, rgba(4,18,34,0.56) 100%)`
                      : dom.theme === 'solar'
                        ? `radial-gradient(ellipse at 50% 35%, rgba(254,240,138,0.18) 0%, rgba(120,76,12,0.22) 68%, rgba(28,16,4,0.48) 100%)`
                        : dom.theme === 'emerald'
                          ? `radial-gradient(ellipse at 50% 50%, rgba(52,211,153,0.15) 0%, rgba(6,52,38,0.34) 68%, rgba(3,20,16,0.58) 100%)`
                          : `radial-gradient(ellipse at 50% 50%, ${accent}22 0%, rgba(8,26,56,0.34) 66%, rgba(4,10,24,0.62) 100%)`;
              return (
                <div
                  className="absolute inset-0 pointer-events-none z-18 overflow-hidden animate-domain-unfurl"
                  style={{
                    background: bgOverlay,
                    boxShadow: `inset 0 0 90px ${accent}55`,
                  }}
                >
                  {/* Concentric Resonant / Arcane Domain Rings */}
                  <div
                    className="absolute left-1/2 top-1/2 rounded-full border-2 animate-domain-ring"
                    style={{
                      width: Math.min(totalW, totalH) * 0.72,
                      height: Math.min(totalW, totalH) * 0.72,
                      borderColor: `${accent}66`,
                      boxShadow: `0 0 42px ${accent}45, inset 0 0 36px ${accent}25`,
                    }}
                  />
                  <div
                    className="absolute left-1/2 top-1/2 rounded-full border animate-domain-ring"
                    style={{
                      width: Math.min(totalW, totalH) * 0.44,
                      height: Math.min(totalW, totalH) * 0.44,
                      borderColor: `${accent}88`,
                      animationDelay: '1.2s',
                    }}
                  />
                  {dom.theme === 'sonic' && (
                    <svg
                      viewBox="0 0 800 400"
                      preserveAspectRatio="none"
                      className="absolute inset-0 w-full h-full opacity-30"
                    >
                      <path
                        d="M0 200 Q 100 120, 200 200 T 400 200 T 600 200 T 800 200"
                        fill="none"
                        stroke={accent}
                        strokeWidth="2.5"
                      />
                      <path
                        d="M0 200 Q 100 280, 200 200 T 400 200 T 600 200 T 800 200"
                        fill="none"
                        stroke="#e0f2fe"
                        strokeWidth="1.5"
                        opacity="0.7"
                      />
                    </svg>
                  )}
                </div>
              );
            })()}

            {/* High-Performance Canvas Fog of War (supports gigantic 300x300 grids smoothly) */}
            {activeMap.fogEnabled && (
              <FogOfWarCanvas
                width={totalW}
                height={totalH}
                cellPx={cellPx}
                revealedCells={activeMap.revealedCells}
                isGm={role === 'gm'}
              />
            )}

            {/* Live Colored Player Pointers ("Bolinha" menor e mais delicada com rastro de cometa) */}
            {(() => {
              const now = Date.now();
              const activeMapTrails = pointerTrails.filter((pt) => pt.mapId === activeMap.id);
              const byPlayer = new Map<string, typeof activeMapTrails>();
              for (const pt of activeMapTrails) {
                const list = byPlayer.get(pt.playerId) || [];
                list.push(pt);
                byPlayer.set(pt.playerId, list);
              }
              return (
                <>
                  {/* Comet Trail SVG + Fading Spark Motes */}
                  {activeMapTrails.length > 0 && (
                    <svg
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                      className="absolute inset-0 w-full h-full pointer-events-none z-34"
                    >
                      {Array.from(byPlayer.entries()).map(([pId, pts]) => {
                        const livePtr = mapPointers.find((mp) => mp.playerId === pId);
                        const fullPts = livePtr
                          ? [...pts, { ...pts[pts.length - 1], xPct: livePtr.xPct, yPct: livePtr.yPct }]
                          : pts;
                        if (fullPts.length < 2) return null;
                        const color = fullPts[fullPts.length - 1].color;
                        return (
                          <g key={`trail-${pId}`}>
                            {fullPts.slice(1).map((curr, idx) => {
                              const prev = fullPts[idx];
                              const ratio = (idx + 1) / fullPts.length;
                              return (
                                <line
                                  key={`seg-${pId}-${idx}`}
                                  x1={prev.xPct}
                                  y1={prev.yPct}
                                  x2={curr.xPct}
                                  y2={curr.yPct}
                                  stroke={color}
                                  strokeWidth={ratio * 0.55}
                                  strokeLinecap="round"
                                  opacity={ratio * 0.65}
                                />
                              );
                            })}
                          </g>
                        );
                      })}
                    </svg>
                  )}

                  {activeMapTrails.map((pt, idx) => {
                    const age = Math.max(0, now - pt.ts);
                    const life = Math.max(0, 1 - age / 480);
                    const sizePx = Math.max(2.5, Math.round(8 * life));
                    return (
                      <div
                        key={`${pt.id}-${idx}`}
                        className="absolute pointer-events-none z-34 -translate-x-1/2 -translate-y-1/2 rounded-full"
                        style={{
                          left: `${pt.xPct}%`,
                          top: `${pt.yPct}%`,
                          width: `${sizePx}px`,
                          height: `${sizePx}px`,
                          backgroundColor: pt.color,
                          opacity: life * 0.65,
                          boxShadow: `0 0 ${Math.round(8 * life)}px ${pt.color}`,
                        }}
                      />
                    );
                  })}

                  {mapPointers.map((ptr) => (
                    <div
                      key={ptr.playerId}
                      className="absolute pointer-events-none z-35 -translate-x-1/2 -translate-y-1/2 transition-all duration-75 flex flex-col items-center"
                      style={{
                        left: `${ptr.xPct}%`,
                        top: `${ptr.yPct}%`,
                      }}
                    >
                      <div
                        className="w-3 h-3 rounded-full flex items-center justify-center relative"
                        style={{
                          backgroundColor: ptr.color,
                          boxShadow: `0 0 10px ${ptr.color}, 0 0 18px ${ptr.color}`,
                        }}
                      >
                        <div className="w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_6px_#fff]" />
                      </div>
                      <div
                        className="mt-1 px-1.5 py-0.2 rounded-xs bg-[#090b12]/90 text-amber-100 text-[9px] font-display font-bold whitespace-nowrap text-center border shadow-md"
                        style={{ borderColor: `${ptr.color}aa` }}
                      >
                        {ptr.playerName}
                      </div>
                    </div>
                  ))}
                </>
              );
            })()}

            {/* Live Marquee Box Preview (Multi-Select Tokens OR Block Terrain/Fog Painting) */}
            {marqueeBox && (() => {
              const minX = Math.min(marqueeBox.startGx, marqueeBox.endGx);
              const maxX = Math.max(marqueeBox.startGx, marqueeBox.endGx);
              const minY = Math.min(marqueeBox.startGy, marqueeBox.endGy);
              const maxY = Math.max(marqueeBox.startGy, marqueeBox.endGy);
              const wCells = maxX - minX + 1;
              const hCells = maxY - minY + 1;
              const borderCol =
                marqueeBox.mode === 'select'
                  ? '#f59e0b'
                  : marqueeBox.mode === 'fog'
                    ? '#38bdf8'
                    : tool === 'terrain-erase'
                      ? '#ef4444'
                      : '#a855f7';
              const bgCol =
                marqueeBox.mode === 'select'
                  ? 'rgba(245, 158, 11, 0.16)'
                  : marqueeBox.mode === 'fog'
                    ? 'rgba(56, 189, 248, 0.18)'
                    : tool === 'terrain-erase'
                      ? 'rgba(239, 68, 68, 0.18)'
                      : 'rgba(168, 85, 247, 0.22)';
              return (
                <div
                  className="absolute pointer-events-none z-40 rounded-xs"
                  style={{
                    left: minX * cellPx,
                    top: minY * cellPx,
                    width: wCells * cellPx,
                    height: hCells * cellPx,
                    border: `2px dashed ${borderCol}`,
                    backgroundColor: bgCol,
                  }}
                >
                  <div className="absolute -top-5 left-0 px-1.5 py-0.5 rounded bg-black/90 border border-white/20 text-[10px] font-mono-dice font-bold text-amber-200 whitespace-nowrap">
                    {wCells}×{hCells} ({wCells * hCells} qd)
                  </div>
                </div>
              );
            })()}

            {/* Tactical Drawings Layer ("Tinta Mágica" Temp 8s + GM Permanent Strokes + Live Stroke) */}
            {(mapPermanentDrawings.length > 0 ||
              mapTempDrawings.length > 0 ||
              activeDrawPoints.length > 1) && (
              <svg
                viewBox={`0 0 ${activeMap.gridWidth} ${activeMap.gridHeight}`}
                preserveAspectRatio="none"
                className="absolute inset-0 w-full h-full pointer-events-none z-[29]"
              >
                {[...mapPermanentDrawings, ...mapTempDrawings].map((stroke) => {
                  if (!stroke.points || stroke.points.length < 2) return null;
                  const ptsStr = stroke.points.map((pt) => `${pt.x},${pt.y}`).join(' ');
                  const first = stroke.points[0];
                  const last = stroke.points[stroke.points.length - 1];
                  const prev = stroke.points[Math.max(0, stroke.points.length - 3)];
                  const totalDist = Math.hypot(last.x - first.x, last.y - first.y);
                  const segDx = last.x - prev.x;
                  const segDy = last.y - prev.y;
                  const segLen = Math.hypot(segDx, segDy);
                  const showArrow = totalDist >= 0.7 && segLen > 0.04;
                  const angle = showArrow ? Math.atan2(segDy, segDx) : 0;
                  const headLen = 0.28;
                  const ax1 = last.x - headLen * Math.cos(angle - 0.5);
                  const ay1 = last.y - headLen * Math.sin(angle - 0.5);
                  const ax2 = last.x - headLen * Math.cos(angle + 0.5);
                  const ay2 = last.y - headLen * Math.sin(angle + 0.5);
                  return (
                    <g
                      key={stroke.id}
                      className={stroke.permanent ? '' : 'animate-magic-ink-fade'}
                      style={{
                        filter: `drop-shadow(0 0 3px ${stroke.color})`,
                      }}
                    >
                      <polyline
                        points={ptsStr}
                        fill="none"
                        stroke={stroke.color}
                        strokeWidth={stroke.width || 0.1}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity="0.92"
                      />
                      {showArrow && (
                        <polyline
                          points={`${ax1},${ay1} ${last.x},${last.y} ${ax2},${ay2}`}
                          fill="none"
                          stroke={stroke.color}
                          strokeWidth={stroke.width || 0.1}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      )}
                    </g>
                  );
                })}
                {activeDrawPoints.length > 1 && (
                  <polyline
                    points={activeDrawPoints.map((pt) => `${pt.x},${pt.y}`).join(' ')}
                    fill="none"
                    stroke={
                      role === 'gm'
                        ? gmDrawColor
                        : myCharacter?.playerColor || myPlayerColor || '#38bdf8'
                    }
                    strokeWidth={0.11}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray="0.18 0.1"
                    opacity="0.95"
                  />
                )}
              </svg>
            )}

            {/* Map Pings (Single crisp pulse + sender badge) */}
            {pings
              .filter((p) => p.mapId === activeMap.id)
              .map((p) => (
                <React.Fragment key={p.id}>
                  <div
                    className="absolute pointer-events-none z-30 map-ping-ring rounded-full border-4"
                    style={{
                      left: (p.x + 0.5) * cellPx,
                      top: (p.y + 0.5) * cellPx,
                      width: cellPx * 1.4,
                      height: cellPx * 1.4,
                      borderColor: p.color,
                      boxShadow: `0 0 18px ${p.color}99`,
                    }}
                  />
                  {p.sender && (
                    <div
                      className="absolute pointer-events-none z-30 map-ping-label px-2 py-0.5 rounded-full text-[10px] font-display font-bold whitespace-nowrap bg-[#0b0d14]/92 border shadow-lg"
                      style={{
                        left: (p.x + 0.5) * cellPx,
                        top: (p.y + 0.5) * cellPx,
                        borderColor: p.color,
                        color: p.color,
                      }}
                    >
                      {p.sender}
                    </div>
                  )}
                </React.Fragment>
              ))}
          </div>
          </div>
        </div>
    </div>
  );
};
