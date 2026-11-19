import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  CloudRain,
  Crosshair,
  Eye,
  EyeOff,
  Flame,
  Heart,
  Layers,
  MapPin,
  MousePointer,
  Navigation,
  Play,
  Plus,
  RotateCcw,
  RotateCw,
  Ruler,
  Shield,
  Sparkles,
  Swords,
  Trash2,
  Users,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useCampaign } from '../context/CampaignContext';
import {
  calculateMovementCostMeters,
  computeCharacterStats,
  DAMAGE_TYPE_OPTIONS,
  doesTokenCollideAt,
  doSquaresOverlap,
  evaluateLineOfSightAndCover,
  evaluateTacticalAttackModifiers,
  findNearestFreeGridCell,
  formatFormulaForDisplay,
  getGridSpanDistance,
  getMonsterWoundStatus,
  parseAttackRangeMeters,
  parseAttackRangeSquares,
  resolveDragTargetCell,
} from '../shared/rulesEngine';
import {
  AoETemplate,
  GmMapMarker,
  GmMarkerKind,
  MapToken,
  PendingAttackChoice,
  TacticalMap,
  TerrainCellKind,
} from '../shared/types';
import { FileUploadButton } from './FileUploadButton';
import { SculptedHealthBar } from './OrnateFrame';
import { TokenPortrait } from './TokenPortrait';

type StageTool =
  | 'select'
  | 'pointer'
  | 'ruler'
  | 'ping'
  | 'fog-reveal'
  | 'fog-hide'
  | 'terrain-wall'
  | 'terrain-cover'
  | 'terrain-difficult'
  | 'terrain-erase';

const PRESET_GRADIENTS: Record<TacticalMap['themePreset'], string> = {
  crypt: 'radial-gradient(circle at 50% 45%, #23273a 0%, #141621 55%, #090b10 100%)',
  tavern: 'radial-gradient(circle at 30% 35%, #5c3317 0%, #3a1f0e 55%, #1c0f07 100%)',
  forest: 'radial-gradient(circle at 50% 45%, #1d3b28 0%, #102418 55%, #07120b 100%)',
  desert: 'radial-gradient(circle at 60% 30%, #8c6239 0%, #593b1f 55%, #2e1d0d 100%)',
  castle: 'radial-gradient(circle at 50% 30%, #3b4252 0%, #242933 60%, #151820 100%)',
  void: 'radial-gradient(circle at 50% 50%, #2e1065 0%, #170a36 55%, #090418 100%)',
};

const BiomeFloorOverlay: React.FC<{
  preset: TacticalMap['themePreset'];
  cellPx: number;
}> = ({ preset, cellPx }) => {
  const torches =
    preset === 'crypt' || preset === 'castle'
      ? [
          { x: '16%', y: '18%', color: 'rgba(245, 158, 11, 0.24)' },
          { x: '84%', y: '18%', color: 'rgba(245, 158, 11, 0.24)' },
          { x: '16%', y: '82%', color: 'rgba(234, 88, 12, 0.2)' },
          { x: '84%', y: '82%', color: 'rgba(234, 88, 12, 0.2)' },
        ]
      : preset === 'tavern'
      ? [
          { x: '22%', y: '25%', color: 'rgba(251, 146, 60, 0.3)' },
          { x: '78%', y: '72%', color: 'rgba(245, 158, 11, 0.22)' },
        ]
      : [];

  return (
    <>
      <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-35">
        <defs>
          <pattern
            id={`floor-pat-${preset}`}
            width={cellPx * 2}
            height={cellPx * 2}
            patternUnits="userSpaceOnUse"
          >
            {(preset === 'crypt' || preset === 'castle') && (
              <>
                <rect
                  x="1"
                  y="1"
                  width={cellPx - 2}
                  height={cellPx - 2}
                  fill="rgba(255,255,255,0.03)"
                  stroke="rgba(0,0,0,0.45)"
                  strokeWidth="1.5"
                />
                <rect
                  x={cellPx + 1}
                  y={cellPx + 1}
                  width={cellPx - 2}
                  height={cellPx - 2}
                  fill="rgba(0,0,0,0.14)"
                  stroke="rgba(255,230,170,0.05)"
                  strokeWidth="1"
                />
                <path
                  d={`M 6 ${cellPx * 0.4} L ${cellPx * 0.45} ${cellPx * 0.55}`}
                  stroke="rgba(0,0,0,0.35)"
                  strokeWidth="1"
                />
              </>
            )}
            {preset === 'tavern' && (
              <>
                <rect x="0" y="0" width={cellPx * 2} height={cellPx * 0.5} fill="rgba(0,0,0,0.12)" stroke="rgba(25,12,4,0.65)" strokeWidth="1" />
                <rect x="0" y={cellPx * 0.5} width={cellPx * 2} height={cellPx * 0.5} fill="rgba(255,190,120,0.04)" stroke="rgba(25,12,4,0.65)" strokeWidth="1" />
                <rect x="0" y={cellPx} width={cellPx * 2} height={cellPx * 0.5} fill="rgba(0,0,0,0.08)" stroke="rgba(25,12,4,0.65)" strokeWidth="1" />
                <rect x="0" y={cellPx * 1.5} width={cellPx * 2} height={cellPx * 0.5} fill="rgba(255,190,120,0.03)" stroke="rgba(25,12,4,0.65)" strokeWidth="1" />
                <line x1={cellPx * 0.7} y1="0" x2={cellPx * 0.7} y2={cellPx * 0.5} stroke="rgba(20,8,2,0.75)" strokeWidth="1.2" />
                <line x1={cellPx * 1.4} y1={cellPx * 0.5} x2={cellPx * 1.4} y2={cellPx} stroke="rgba(20,8,2,0.75)" strokeWidth="1.2" />
              </>
            )}
            {preset === 'forest' && (
              <>
                <circle cx={cellPx * 0.6} cy={cellPx * 0.5} r={cellPx * 0.35} fill="rgba(34,197,94,0.06)" />
                <circle cx={cellPx * 1.5} cy={cellPx * 1.4} r={cellPx * 0.45} fill="rgba(0,0,0,0.18)" />
              </>
            )}
            {preset === 'desert' && (
              <path
                d={`M 0 ${cellPx * 0.5} Q ${cellPx * 0.5} ${cellPx * 0.25}, ${cellPx} ${cellPx * 0.5} T ${cellPx * 2} ${cellPx * 0.5}`}
                fill="none"
                stroke="rgba(253,224,171,0.12)"
                strokeWidth="1.4"
              />
            )}
            {preset === 'void' && (
              <>
                <circle cx={cellPx} cy={cellPx} r={cellPx * 0.7} fill="none" stroke="rgba(167,139,250,0.15)" strokeWidth="1" />
                <circle cx={cellPx * 0.3} cy={cellPx * 0.4} r="1.5" fill="rgba(196,181,253,0.45)" />
              </>
            )}
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#floor-pat-${preset})`} />

        {/* Engraved Central Sanctuary Astrolabe Circle */}
        <g stroke="rgba(228,186,82,0.12)" fill="none">
          <circle cx="50%" cy="50%" r={cellPx * 2.6} strokeWidth="1.5" />
          <circle cx="50%" cy="50%" r={cellPx * 2.25} strokeWidth="0.8" strokeDasharray="5 5" />
        </g>
      </svg>

      {/* Animated Torchlight Ambient Glows */}
      {torches.map((t, i) => (
        <div
          key={i}
          className="absolute w-64 h-64 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none animate-torch-flicker"
          style={{
            left: t.x,
            top: t.y,
            background: `radial-gradient(circle, ${t.color} 0%, transparent 70%)`,
          }}
        />
      ))}

      {/* Deep Dungeon Corner Vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ boxShadow: 'inset 0 0 90px rgba(0, 0, 0, 0.88)' }}
      />
    </>
  );
};

export const StageCanvas: React.FC = () => {
  const {
    campaign,
    role,
    myCharacter,
    activeCharacterId,
    setActiveCharacterId,
    targetTokenId,
    setTargetTokenId,
    updateCampaign,
    rollCharacterAction,
    sendPing,
    pings,
    activePointers,
    emitPointerMove,
    emitPointerHide,
    floatingVfx,
    slashVfx,
    pendingAttackChoice,
    setPendingAttackChoice,
    startCombatDuel,
    applyDamage,
    deleteCharacter,
    assistDeathSave,
    gmResolveDeathSave,
    claimTreasureMarker,
    resolveAssetUrl,
    showTacticalAlert,
    opportunityPrompt,
    triggerOpportunityPrompt,
    activeDuel,
    advantageMode,
    setCharacterNextAttackOverride,
    triggerTrapOnToken,
    triggerAoESavePrompt,
    startCombatFromMap,
  } = useCampaign();

  const activeMap =
    campaign.maps.find((m) => m.id === campaign.activeMapId) || campaign.maps[0];

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
  const [cameraPan, setCameraPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
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
  } | null>(null);
  const [dragPath, setDragPath] = useState<Array<{ x: number; y: number }>>([]);
  const [hoveredTokenId, setHoveredTokenId] = useState<string | null>(null);
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
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
  const [showMapConfig, setShowMapConfig] = useState(false);
  const [spawnMonsterId, setSpawnMonsterId] = useState(
    campaign.compendium.monsters[0]?.id || ''
  );
  const [spawnHidden, setSpawnHidden] = useState(false);
  const [secretMarkerKind, setSecretMarkerKind] = useState<GmMarkerKind | null>(null);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
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

  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        if (pendingAttackChoice) setPendingAttackChoice(null);
        if (secretMarkerKind) setSecretMarkerKind(null);
        setSelectedTokenId(null);
        setSelectedMarkerId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pendingAttackChoice, setPendingAttackChoice, secretMarkerKind]);

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

  const gridRef = useRef<HTMLDivElement | null>(null);
  const lastPointerEmitRef = useRef<number>(0);
  const didDragTokenRef = useRef<boolean>(false);

  const sqMeters = campaign.settings.gridSquareMeters || 1.5;

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
        return mon.attacks
          .filter((atk) => parseAttackRangeMeters(atk.range, atk.name) <= 3.1)
          .map((atk) => ({
            attackerTokenId: reactor.id,
            attackerName: reactor.name,
            attackerColor: reactor.color,
            attackerImageUrl: reactor.imageUrl,
            attackerFrame: reactor.frameStyle || 'crimson',
            diceSkin: 'blood',
            actionTitle: `${atk.name} (Oportunidade)`,
            attackFormula: `1d20 + ${atk.attackBonus}`,
            damageFormula: atk.damageFormula,
            damageType: atk.damageType,
            range: atk.range || 'Corpo a Corpo (1,5m)',
            actionCost: 'Reação',
          }));
      }
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
    setDraggingTokenId(null);
    setDragOrigin(null);
    setDragPath([]);
    if (!origin || !activeMap) return;

    const currentTok = activeMap.tokens.find((t) => t.id === origin.tokenId);
    if (!currentTok) return;

    // Guarantee final position never collides with another token or wall cell
    let finalTok = currentTok;
    if (
      doesTokenCollideAt(
        activeMap.tokens,
        currentTok.x,
        currentTok.y,
        currentTok.size,
        currentTok.id,
        role === 'gm',
        activeMap.terrainCells
      )
    ) {
      const snapped = findNearestFreeGridCell(
        activeMap,
        currentTok.x,
        currentTok.y,
        currentTok.size,
        currentTok.id,
        role === 'gm'
      );
      finalTok = { ...currentTok, x: snapped.x, y: snapped.y };
      updateActiveMap((m) => ({
        ...m,
        tokens: m.tokens.map((t) =>
          t.id === finalTok.id ? { ...t, x: snapped.x, y: snapped.y } : t
        ),
      }));
    }

    // Automatic Trap Trigger when a token steps onto an untriggered trap marker!
    const movedAny = finalTok.x !== origin.x || finalTok.y !== origin.y;
    if (movedAny && !origin.shiftFree) {
      const steppedTrap = (activeMap.gmMarkers || []).find(
        (gm) =>
          gm.kind === 'trap' &&
          !gm.trapTriggered &&
          doSquaresOverlap(finalTok.x, finalTok.y, finalTok.size || 1, gm.x, gm.y, 1)
      );
      if (steppedTrap) {
        triggerTrapOnToken(steppedTrap.id, finalTok);
      }
    }

    if (!campaign.combat.active || origin.shiftFree) return;

    const { squares } = getGridSpanDistance(
      origin.x,
      origin.y,
      finalTok.size,
      finalTok.x,
      finalTok.y,
      finalTok.size,
      sqMeters
    );
    if (squares <= 0) return;

    const { meters: movementCostMeters } = calculateMovementCostMeters(
      origin,
      finalTok,
      activeMap.terrainCells,
      sqMeters,
      pathSnapshot
    );
    const meters = Math.max(squares * sqMeters, movementCostMeters);

    const cb = findTokenCombatant(finalTok);
    if (!cb) return;

    const nextRemaining = Math.max(
      0,
      Math.round(((cb.remainingMoveMeters ?? cb.speedMeters ?? 9) - meters) * 10) / 10
    );

    updateCampaign((prev) => ({
      ...prev,
      combat: {
        ...prev.combat,
        combatants: prev.combat.combatants.map((item) =>
          item.id === cb.id ? { ...item, remainingMoveMeters: nextRemaining } : item
        ),
      },
    }));

    // Check D&D Opportunity Attacks: left 1-square adjacency of an active hostile enemy with Reaction available
    if (!cb.disengaged) {
      for (const other of activeMap.tokens) {
        if (other.id === finalTok.id || other.hp <= 0 || other.isHidden) continue;
        const isHostile =
          (finalTok.type === 'character' && other.type === 'monster') ||
          (finalTok.type === 'monster' && other.type === 'character');
        if (!isHostile) continue;

        const reactorCb = findTokenCombatant(other);
        if (reactorCb && reactorCb.reactionAvailable === false) continue;

        const wasAdj =
          getGridSpanDistance(origin.x, origin.y, finalTok.size, other.x, other.y, other.size, sqMeters)
            .squares <= 1;
        const nowDist = getGridSpanDistance(
          finalTok.x,
          finalTok.y,
          finalTok.size,
          other.x,
          other.y,
          other.size,
          sqMeters
        ).squares;

        if (wasAdj && nowDist > 1) {
          const meleeAttacks = buildMeleeOpportunityAttacks(other);
          if (meleeAttacks.length > 0) {
            triggerOpportunityPrompt({
              id: `opp-${Date.now()}`,
              reactorTokenId: other.id,
              reactorName: other.name,
              reactorColor: other.color,
              reactorType: other.type === 'character' ? 'character' : 'monster',
              reactorReferenceId: other.referenceId,
              targetTokenId: finalTok.id,
              targetName: finalTok.name,
              attacks: meleeAttacks,
            });
            break;
          }
        }
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
    if (e.button === 2) {
      if (pendingAttackChoice) setPendingAttackChoice(null);
      if (secretMarkerKind) setSecretMarkerKind(null);
      return;
    }
    const { gx, gy, xPct, yPct } = getCellFromEvent(e);

    if (role === 'gm' && secretMarkerKind) {
      const defaultTitles: Record<GmMarkerKind, string> = {
        chest: 'Baú Escondido',
        item: 'Item Secreto',
        trap: 'Armadilha Oculta',
        secret: 'Passagem Secreta',
      };
      const newMarker: GmMapMarker = {
        id: `gmm-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        x: gx,
        y: gy,
        kind: secretMarkerKind,
        title: defaultTitles[secretMarkerKind],
        revealed: false,
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

    if (tool === 'ping') {
      sendPing(activeMap.id, gx, gy, role === 'gm' ? '#ef4444' : '#38bdf8');
      return;
    }

    if (role === 'gm' && (tool === 'fog-reveal' || tool === 'fog-hide')) {
      const key = `${gx},${gy}`;
      updateActiveMap((m) => {
        const set = new Set(m.revealedCells);
        if (tool === 'fog-reveal') set.add(key);
        else set.delete(key);
        return { ...m, revealedCells: Array.from(set) };
      });
    }

    if (role === 'gm' && tool.startsWith('terrain-')) {
      const key = `${gx},${gy}`;
      updateActiveMap((m) => {
        const nextTerrain: Record<string, TerrainCellKind> = { ...(m.terrainCells || {}) };
        if (tool === 'terrain-erase') {
          delete nextTerrain[key];
        } else {
          const kind: TerrainCellKind =
            tool === 'terrain-wall'
              ? 'wall'
              : tool === 'terrain-cover'
                ? 'cover'
                : 'difficult';
          nextTerrain[key] = kind;
        }
        return { ...m, terrainCells: nextTerrain };
      });
    }
  };

  const handleGridMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!activeMap) return;
    const { gx, gy, rawX, rawY, xPct, yPct } = getCellFromEvent(e);

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
      let movedCoord: { x: number; y: number } | null = null;
      const setMoved = (x: number, y: number) => {
        movedCoord = { x, y };
      };
      updateActiveMap((m) => ({
        ...m,
        tokens: m.tokens.map((t) => {
          if (t.id !== draggingTokenId) return t;
          let targetX = Math.max(0, Math.min(activeMap.gridWidth - t.size, gx));
          let targetY = Math.max(0, Math.min(activeMap.gridHeight - t.size, gy));
          if (campaign.combat.active && dragOrigin && !dragOrigin.shiftFree) {
            const cb = findTokenCombatant(t);
            const remMeters = cb ? cb.remainingMoveMeters ?? cb.speedMeters ?? 9 : 9;
            const maxSq = Math.max(0, Math.floor(remMeters / sqMeters));
            targetX = Math.max(dragOrigin.x - maxSq, Math.min(dragOrigin.x + maxSq, targetX));
            targetY = Math.max(dragOrigin.y - maxSq, Math.min(dragOrigin.y + maxSq, targetY));
            targetX = Math.max(0, Math.min(activeMap.gridWidth - t.size, targetX));
            targetY = Math.max(0, Math.min(activeMap.gridHeight - t.size, targetY));
          }
          const freePos = resolveDragTargetCell(m, t, targetX, targetY, role === 'gm');
          targetX = freePos.x;
          targetY = freePos.y;
          if (t.x !== targetX || t.y !== targetY) {
            didDragTokenRef.current = true;
            setMoved(targetX, targetY);
          }
          return { ...t, x: targetX, y: targetY };
        }),
      }));
      if (movedCoord !== null) {
        const pt: { x: number; y: number } = movedCoord;
        setDragPath((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.x === pt.x && last.y === pt.y) return prev;
          return [...prev.slice(-14), pt];
        });
      }
      return;
    }

    if (tool === 'ruler' && rulerStart && e.buttons === 1) {
      setRulerEnd({ x: gx, y: gy });
      return;
    }

    if (role === 'gm' && e.buttons === 1 && (tool === 'fog-reveal' || tool === 'fog-hide')) {
      const key = `${gx},${gy}`;
      updateActiveMap((m) => {
        const set = new Set(m.revealedCells);
        if (tool === 'fog-reveal') set.add(key);
        else set.delete(key);
        return { ...m, revealedCells: Array.from(set) };
      });
      return;
    }

    if (role === 'gm' && e.buttons === 1 && tool.startsWith('terrain-')) {
      const key = `${gx},${gy}`;
      const desiredKind: TerrainCellKind | null =
        tool === 'terrain-erase'
          ? null
          : tool === 'terrain-wall'
            ? 'wall'
            : tool === 'terrain-cover'
              ? 'cover'
              : 'difficult';
      const currentVal = activeMap.terrainCells?.[key] || null;
      if (currentVal !== desiredKind) {
        updateActiveMap((m) => {
          const nextTerrain: Record<string, TerrainCellKind> = { ...(m.terrainCells || {}) };
          if (!desiredKind) delete nextTerrain[key];
          else nextTerrain[key] = desiredKind;
          return { ...m, terrainCells: nextTerrain };
        });
      }
    }
  };

  const handleGridMouseUp = () => {
    finalizeTokenDrag();
    setDraggingTemplateId(null);
  };

  const handleGridMouseLeave = () => {
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
    const size = mon.size === 'Grande' || mon.size === 'Enorme' ? 2 : 1;
    const spawnPos = findNearestFreeGridCell(
      activeMap,
      Math.floor(activeMap.gridWidth / 2),
      Math.floor(activeMap.gridHeight / 2),
      size
    );
    const newToken: MapToken = {
      id: `tok-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      name: `${mon.name} #${existingCount + 1}`,
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
      color: mon.tokenColor,
      frameStyle: 'crimson',
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
    if (!activeMap) return;
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

  const createNewMap = () => {
    const name = window.prompt('Nome do novo Mapa ou Cena:', 'Nova Masmorra');
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

  if (!activeMap) return null;

  const cellPx = activeMap.gridSizePx * zoom;
  const totalW = activeMap.gridWidth * cellPx;
  const totalH = activeMap.gridHeight * cellPx;
  const targetToken = activeMap.tokens.find((t) => t.id === targetTokenId);
  const resolvedMapBg = resolveAssetUrl(activeMap.backgroundUrl);

  const activeTurnCombatant = campaign.combat.active
    ? campaign.combat.combatants[campaign.combat.currentTurnIndex]
    : null;

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

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0 relative overflow-hidden z-10">
      {/* Flow-Anchored Tactical Stage Toolbar (Row 1: Lean Core + Inline Start Combat; Row 2: Collapsible GM Drawer) */}
      <div
        className="flex-none px-3 py-1.5 border-b z-25 flex flex-col items-center gap-1.5"
        style={{
          borderColor: 'var(--border-subtle)',
          background: 'rgba(10, 12, 18, 0.92)',
          backdropFilter: 'blur(10px)',
        }}
      >
        {/* ROW 1: Compact Always-Visible Core Bar (Zero Overlap!) */}
        <div className="w-full max-w-[99%] flex items-center justify-between gap-2 flex-wrap">
          {/* Left: Inline Start Combat (GM) + Map Selector */}
          <div className="flex items-center gap-2 min-w-0">
            {role === 'gm' && !campaign.combat.active && (
              <button
                onClick={startCombatFromMap}
                className="rpg-btn-crimson px-3 py-1.5 rounded-md text-xs font-display font-bold flex items-center gap-1.5 cursor-pointer shadow-lg shrink-0"
                title="Puxar tokens do mapa e iniciar ordem de turnos"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Iniciar Combate</span>
              </button>
            )}

            {role === 'gm' ? (
              <select
                value={activeMap.id}
                onChange={(e) =>
                  updateCampaign((prev) => ({ ...prev, activeMapId: e.target.value }))
                }
                className="rpg-input text-xs py-1 rounded-md font-display font-semibold max-w-[220px] truncate"
              >
                {campaign.maps.map((m) => (
                  <option key={m.id} value={m.id}>
                    🗺️ {m.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-xs font-display font-bold px-2 truncate max-w-[220px]">
                🗺️ {activeMap.name}
              </span>
            )}
          </div>

          {/* Center: Core Interaction Tools + GM Contextual Drawer Tabs */}
          <div className="flex items-center gap-1 flex-wrap justify-center">
            <button
              onClick={() => {
                setTool('select');
                setSecretMarkerKind(null);
                emitPointerHide();
              }}
              className={`px-2.5 py-1 rounded-md text-xs flex items-center gap-1 cursor-pointer ${
                tool === 'select' && !secretMarkerKind ? 'rpg-btn-primary' : 'rpg-card'
              }`}
              title="Mover Tokens e Áreas"
            >
              <MousePointer className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Mover</span>
            </button>

            <button
              onClick={() => {
                setSecretMarkerKind(null);
                setTool(tool === 'pointer' ? 'select' : 'pointer');
              }}
              className={`px-2.5 py-1 rounded-md text-xs flex items-center gap-1 cursor-pointer ${
                tool === 'pointer' ? 'rpg-btn-primary' : 'rpg-card'
              }`}
              title="Apontar no Mapa com sua Bolinha Colorida"
            >
              <Navigation className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Bolinha</span>
            </button>

            <button
              onClick={() => {
                setSecretMarkerKind(null);
                setTool('ruler');
                setRulerStart(null);
                setRulerEnd(null);
                emitPointerHide();
              }}
              className={`px-2.5 py-1 rounded-md text-xs flex items-center gap-1 cursor-pointer ${
                tool === 'ruler' ? 'rpg-btn-primary' : 'rpg-card'
              }`}
              title="Medir Distância"
            >
              <Ruler className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Medir</span>
            </button>

            <button
              onClick={() => {
                setSecretMarkerKind(null);
                setTool('ping');
              }}
              className={`px-2 py-1 rounded-md text-xs flex items-center gap-1 cursor-pointer ${
                tool === 'ping' ? 'rpg-btn-primary' : 'rpg-card'
              }`}
              title="Ping Visual no mapa"
            >
              <MapPin className="w-3.5 h-3.5" />
            </button>

            {/* Player Quick AoE Buttons */}
            {role !== 'gm' && (
              <div className="flex items-center gap-1 pl-1.5 ml-0.5 border-l" style={{ borderColor: 'var(--border-subtle)' }}>
                <button
                  onClick={() => addAoETemplate('sphere')}
                  className="rpg-card px-2 py-1 rounded-md text-[11px] cursor-pointer hover:border-amber-400/60"
                  title="Adicionar Esfera de Magia"
                >
                  <Flame className="w-3.5 h-3.5 inline mr-1 text-orange-400" />
                  Esfera
                </button>
                <button
                  onClick={() => addAoETemplate('cone')}
                  className="rpg-card px-2 py-1 rounded-md text-[11px] cursor-pointer hover:border-amber-400/60"
                  title="Adicionar Cone de Magia"
                >
                  Cone
                </button>
              </div>
            )}

            {/* GM Contextual Drawer Tabs (Click to expand Row 2, click again to collapse) */}
            {role === 'gm' && (() => {
              const isTerrainActive =
                tool === 'terrain-wall' ||
                tool === 'terrain-cover' ||
                tool === 'terrain-difficult' ||
                tool === 'terrain-erase' ||
                tool === 'fog-reveal' ||
                tool === 'fog-hide';
              const isSecretsActive = Boolean(secretMarkerKind);
              const tabs: Array<{
                id: 'aoe' | 'terrain' | 'secrets' | 'monsters-map';
                label: string;
                icon: React.ReactNode;
                hasActiveTool?: boolean;
              }> = [
                {
                  id: 'aoe',
                  label: 'Áreas',
                  icon: <Flame className="w-3.5 h-3.5 text-orange-400" />,
                  hasActiveTool: activeMap.templates.length > 0,
                },
                {
                  id: 'terrain',
                  label: 'Terreno & Névoa',
                  icon: <Layers className="w-3.5 h-3.5 text-amber-300" />,
                  hasActiveTool: isTerrainActive || activeMap.fogEnabled,
                },
                {
                  id: 'secrets',
                  label: 'Segredos',
                  icon: <EyeOff className="w-3.5 h-3.5 text-purple-300" />,
                  hasActiveTool: isSecretsActive,
                },
                {
                  id: 'monsters-map',
                  label: 'Monstros & Mapa',
                  icon: <Swords className="w-3.5 h-3.5 text-red-400" />,
                  hasActiveTool: showMapConfig,
                },
              ];

              return (
                <div
                  className="flex items-center gap-1 pl-2 ml-1 border-l"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  {tabs.map((t) => {
                    const isOpen = gmDrawerTab === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => setGmDrawerTab((curr) => (curr === t.id ? null : t.id))}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-display font-bold flex items-center gap-1.5 cursor-pointer transition ${
                          isOpen
                            ? 'rpg-btn-primary shadow-sm'
                            : t.hasActiveTool
                              ? 'rpg-card border-amber-400/75 text-amber-200'
                              : 'rpg-card hover:border-amber-400/50'
                        }`}
                        title={
                          isOpen
                            ? `Recolher aba ${t.label}`
                            : `Abrir ferramentas de ${t.label}`
                        }
                      >
                        {t.icon}
                        <span>{t.label}</span>
                        {t.hasActiveTool && !isOpen && (
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                        )}
                        {isOpen ? (
                          <ChevronUp className="w-3 h-3 opacity-80" />
                        ) : (
                          <ChevronDown className="w-3 h-3 opacity-60" />
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          {/* Right: Compact Zoom + Recenter Camera */}
          <div className="flex items-center gap-1 shrink-0">
            {(cameraPan.x !== 0 || cameraPan.y !== 0) && (
              <button
                onClick={() => setCameraPan({ x: 0, y: 0 })}
                className="rpg-card px-2 py-1 rounded-md text-[10px] font-display font-bold flex items-center gap-1 cursor-pointer hover:border-amber-400/60"
                title="Centralizar câmera no mapa"
              >
                <RotateCcw className="w-3 h-3 text-amber-300" />
                <span className="hidden sm:inline">Centralizar</span>
              </button>
            )}
            <div className="flex items-center gap-0.5 rpg-socket rounded-md px-1.5 py-0.5">
              <button
                onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.15).toFixed(2))))}
                className="p-0.5 cursor-pointer hover:opacity-75"
                title="Diminuir Zoom"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-[11px] px-1 font-mono-dice">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => setZoom((z) => Math.min(1.8, Number((z + 0.15).toFixed(2))))}
                className="p-0.5 cursor-pointer hover:opacity-75"
                title="Aumentar Zoom"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* ROW 2: Collapsible Contextual Sub-Bar (Only visible when GM opens a category tab) */}
        {role === 'gm' && gmDrawerTab && (
          <div
            className="w-full max-w-[99%] pt-1.5 border-t flex items-center justify-center gap-2 flex-wrap animate-modal-unfurl"
            style={{ borderColor: 'rgba(212, 170, 72, 0.22)' }}
          >
            {gmDrawerTab === 'aoe' && (
              <>
                <span className="text-[10px] font-display uppercase tracking-wider text-amber-300/80 font-bold">
                  Moldes de Área (AoE):
                </span>
                <button
                  onClick={() => addAoETemplate('sphere')}
                  className="rpg-card px-2.5 py-1 rounded-md text-[11px] cursor-pointer hover:border-amber-400/60"
                >
                  <Flame className="w-3.5 h-3.5 inline mr-1 text-orange-400" />
                  Esfera
                </button>
                <button
                  onClick={() => addAoETemplate('cone')}
                  className="rpg-card px-2.5 py-1 rounded-md text-[11px] cursor-pointer hover:border-amber-400/60"
                >
                  Cone
                </button>
                <button
                  onClick={() => addAoETemplate('line')}
                  className="rpg-card px-2.5 py-1 rounded-md text-[11px] cursor-pointer hover:border-amber-400/60"
                >
                  Linha
                </button>
                <button
                  onClick={() => addAoETemplate('cube')}
                  className="rpg-card px-2.5 py-1 rounded-md text-[11px] cursor-pointer hover:border-amber-400/60"
                >
                  Cubo
                </button>
                {activeMap.templates.length > 0 && (
                  <button
                    onClick={() => updateActiveMap((m) => ({ ...m, templates: [] }))}
                    className="rpg-card px-2 py-1 rounded-md text-[11px] text-red-400 hover:border-red-400/60 flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    Limpar Áreas ({activeMap.templates.length})
                  </button>
                )}
              </>
            )}

            {gmDrawerTab === 'terrain' && (
              <>
                <span className="text-[10px] font-display uppercase tracking-wider text-amber-300/80 font-bold">
                  Pincel de Terreno:
                </span>
                {(
                  [
                    {
                      id: 'terrain-wall' as const,
                      label: 'Parede',
                      title: 'Pintar Parede/Pilar (bloqueia movimento e linha de visão)',
                    },
                    {
                      id: 'terrain-cover' as const,
                      label: 'Cobertura (+2/+5 CA)',
                      title: 'Pintar Cobertura (+2 CA automático na linha de tiro; 2+ dá +5 CA)',
                    },
                    {
                      id: 'terrain-difficult' as const,
                      label: 'Terreno Difícil (2x)',
                      title: 'Pintar Terreno Difícil (custa 3m por quadrado)',
                    },
                    {
                      id: 'terrain-erase' as const,
                      label: 'Apagar Terreno',
                      title: 'Apagar Parede/Cobertura/Terreno Difícil',
                    },
                  ] as const
                ).map((tb) => {
                  const active = tool === tb.id;
                  return (
                    <button
                      key={tb.id}
                      onClick={() => {
                        setSecretMarkerKind(null);
                        setTool(active ? 'select' : tb.id);
                      }}
                      className={`px-2.5 py-1 rounded-md text-[11px] cursor-pointer transition ${
                        active ? 'rpg-btn-primary font-bold' : 'rpg-card hover:border-amber-400/60'
                      }`}
                      title={tb.title}
                    >
                      {tb.label}
                    </button>
                  );
                })}

                <span className="h-4 w-px bg-white/15 mx-1" />

                <span className="text-[10px] font-display uppercase tracking-wider text-amber-300/80 font-bold">
                  Névoa:
                </span>
                <button
                  onClick={() =>
                    updateActiveMap((m) => ({ ...m, fogEnabled: !m.fogEnabled }))
                  }
                  className={`px-2.5 py-1 rounded-md text-[11px] flex items-center gap-1 cursor-pointer ${
                    activeMap.fogEnabled ? 'rpg-btn-crimson' : 'rpg-card'
                  }`}
                >
                  {activeMap.fogEnabled ? (
                    <EyeOff className="w-3.5 h-3.5" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                  <span>{activeMap.fogEnabled ? 'Névoa Ligada' : 'Ligar Névoa'}</span>
                </button>
                {activeMap.fogEnabled && (
                  <>
                    <button
                      onClick={() => setTool(tool === 'fog-reveal' ? 'select' : 'fog-reveal')}
                      className={`px-2.5 py-1 rounded-md text-[11px] cursor-pointer ${
                        tool === 'fog-reveal' ? 'rpg-btn-primary' : 'rpg-card'
                      }`}
                    >
                      Revelar
                    </button>
                    <button
                      onClick={() => setTool(tool === 'fog-hide' ? 'select' : 'fog-hide')}
                      className={`px-2.5 py-1 rounded-md text-[11px] cursor-pointer ${
                        tool === 'fog-hide' ? 'rpg-btn-primary' : 'rpg-card'
                      }`}
                    >
                      Ocultar
                    </button>
                  </>
                )}
              </>
            )}

            {gmDrawerTab === 'secrets' && (
              <>
                <span className="text-[10px] font-display uppercase tracking-wider text-purple-300 font-bold">
                  Esconder no Mapa (Só o Mestre vê):
                </span>
                {(
                  [
                    { kind: 'chest' as const, label: 'Baú', title: 'Colocar Baú Escondido (Só o Mestre vê)' },
                    { kind: 'item' as const, label: 'Item', title: 'Colocar Item Escondido (Só o Mestre vê)' },
                    { kind: 'trap' as const, label: 'Armadilha', title: 'Colocar Armadilha Automática Oculta (Só o Mestre vê)' },
                    { kind: 'secret' as const, label: 'Passagem Secreta', title: 'Colocar Passagem Secreta (Só o Mestre vê)' },
                  ] as const
                ).map((btn) => {
                  const active = secretMarkerKind === btn.kind;
                  return (
                    <button
                      key={btn.kind}
                      onClick={() => {
                        setTool('select');
                        setSecretMarkerKind((curr) => (curr === btn.kind ? null : btn.kind));
                      }}
                      className={`px-2.5 py-1 rounded-md text-[11px] flex items-center gap-1 cursor-pointer ${
                        active
                          ? 'ring-2 ring-amber-400 bg-amber-500/25 text-amber-200 font-bold'
                          : 'rpg-card hover:border-amber-400/60'
                      }`}
                      title={
                        active
                          ? `Clique em qualquer célula do mapa para esconder ${btn.label}`
                          : btn.title
                      }
                    >
                      <EyeOff className="w-3 h-3 text-amber-400 shrink-0" />
                      <span>+{btn.label}</span>
                    </button>
                  );
                })}
                {secretMarkerKind && (
                  <button
                    onClick={() => setSecretMarkerKind(null)}
                    className="rpg-card px-2 py-1 rounded-md text-[11px] text-red-300 cursor-pointer"
                  >
                    Cancelar
                  </button>
                )}
              </>
            )}

            {gmDrawerTab === 'monsters-map' && (
              <>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <select
                    value={spawnMonsterId}
                    onChange={(e) => setSpawnMonsterId(e.target.value)}
                    className="rpg-input text-xs py-1 rounded-md max-w-[155px]"
                  >
                    {campaign.compendium.monsters.map((mon) => (
                      <option key={mon.id} value={mon.id}>
                        {mon.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => setSpawnHidden((v) => !v)}
                    className={`px-2 py-1 rounded-md text-[11px] flex items-center gap-1 cursor-pointer ${
                      spawnHidden
                        ? 'ring-2 ring-amber-400 bg-amber-500/25 text-amber-200 font-bold'
                        : 'rpg-card opacity-85 hover:opacity-100'
                    }`}
                    title={
                      spawnHidden
                        ? 'Modo Emboscada: monstros nascem invisíveis para jogadores'
                        : 'Alternar: colocar monstros escondidos'
                    }
                  >
                    {spawnHidden ? (
                      <EyeOff className="w-3.5 h-3.5 text-amber-300" />
                    ) : (
                      <Eye className="w-3.5 h-3.5 opacity-70" />
                    )}
                    <span>{spawnHidden ? 'Escondido' : 'Visível'}</span>
                  </button>
                  <button
                    onClick={handleSpawnMonster}
                    className="rpg-btn-crimson px-2.5 py-1 rounded-md text-xs cursor-pointer"
                  >
                    + Monstro
                  </button>
                  <button
                    onClick={handleSyncPartyTokens}
                    className="rpg-card px-2.5 py-1 rounded-md text-[11px] flex items-center gap-1 cursor-pointer hover:border-amber-400/60"
                    title="Puxar heróis para o mapa"
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>Puxar Heróis</span>
                  </button>
                  <button
                    onClick={() =>
                      updateCampaign((prev) => ({
                        ...prev,
                        settings: {
                          ...prev.settings,
                          showEnemyAcToPlayers: !prev.settings.showEnemyAcToPlayers,
                        },
                      }))
                    }
                    className={`px-2.5 py-1 rounded-md text-[11px] flex items-center gap-1 cursor-pointer ${
                      campaign.settings.showEnemyAcToPlayers
                        ? 'rpg-btn-primary'
                        : 'rpg-card text-amber-200/85'
                    }`}
                    title="Controla se jogadores veem CA e PV exatos de monstros"
                  >
                    <Shield className="w-3.5 h-3.5" />
                    <span>
                      {campaign.settings.showEnemyAcToPlayers ? 'CA Inimigos: Visível' : 'CA Inimigos: Oculta'}
                    </span>
                  </button>
                </div>

                <span className="h-4 w-px bg-white/15 mx-1 hidden md:inline-block" />

                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    onClick={createNewMap}
                    className="rpg-card px-2.5 py-1 rounded-md text-[11px] flex items-center gap-1 cursor-pointer hover:border-amber-400/60"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Novo Mapa</span>
                  </button>
                  <FileUploadButton
                    accept="image/*"
                    label="Subir Mapa"
                    onUploaded={(url) => updateActiveMap((m) => ({ ...m, backgroundUrl: url }))}
                    className="rounded-md"
                  />
                  <button
                    onClick={() => setShowMapConfig((v) => !v)}
                    className={`px-2.5 py-1 rounded-md text-[11px] flex items-center gap-1 cursor-pointer ${
                      showMapConfig ? 'rpg-btn-primary' : 'rpg-card hover:border-amber-400/60'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Clima &amp; Bioma</span>
                  </button>
                </div>
              </>
            )}

            <button
              onClick={() => setGmDrawerTab(null)}
              className="rpg-card p-1 rounded-md opacity-70 hover:opacity-100 cursor-pointer ml-1"
              title="Recolher sub-barra"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* GM Map / Scene Settings Floating Drawer */}
        {showMapConfig && role === 'gm' && (
          <div className="rpg-glass-panel rounded-xl px-4 py-2.5 flex flex-wrap items-center gap-3 text-xs pointer-events-auto shadow-2xl">
            <div className="flex items-center gap-1.5">
              <span>Tema:</span>
              <select
                value={activeMap.themePreset}
                onChange={(e) =>
                  updateActiveMap((m) => ({
                    ...m,
                    themePreset: e.target.value as TacticalMap['themePreset'],
                  }))
                }
                className="rpg-input py-1 text-xs"
              >
                <option value="crypt">Cripta / Masmorra</option>
                <option value="tavern">Taverna</option>
                <option value="forest">Floresta</option>
                <option value="desert">Deserto / Ruínas</option>
                <option value="castle">Castelo / Salão</option>
                <option value="void">Plano Astral</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <CloudRain className="w-3.5 h-3.5" />
              <span>Clima:</span>
              <select
                value={activeMap.weather}
                onChange={(e) =>
                  updateActiveMap((m) => ({
                    ...m,
                    weather: e.target.value as TacticalMap['weather'],
                  }))
                }
                className="rpg-input py-1 text-xs"
              >
                <option value="none">Limpo</option>
                <option value="rain">Chuva</option>
                <option value="embers">Brasas</option>
                <option value="snow">Neve</option>
                <option value="mist">Névoa</option>
              </select>
            </div>

            {activeMap.backgroundUrl && (
              <button
                onClick={() => updateActiveMap((m) => ({ ...m, backgroundUrl: '' }))}
                className="rpg-card px-2 py-1 rounded text-red-400 cursor-pointer"
              >
                Remover Imagem do Mapa
              </button>
            )}
          </div>
        )}
      </div>

      {/* Pending Attack Targeting Banner */}
      {pendingAttackChoice && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-40 rpg-glass-panel rounded-lg px-5 py-2 flex items-center gap-3 text-xs border-amber-400/70 shadow-[0_12px_32px_rgba(0,0,0,0.85)]">
          <Crosshair className="w-4 h-4 text-red-400 shrink-0" />
          <span>
            Selecione no mapa quem receberá{' '}
            <strong style={{ color: 'var(--accent-primary)' }}>{pendingAttackChoice.actionTitle}</strong>{' '}
            <span className="opacity-75 font-mono-dice">
              (Alcance máx: {parseAttackRangeMeters(pendingAttackChoice.range, pendingAttackChoice.actionTitle)}m)
            </span>
          </span>
          <button
            onClick={() => setPendingAttackChoice(null)}
            className="px-2.5 py-0.5 rounded bg-red-900/75 hover:bg-red-800 text-white cursor-pointer"
          >
            Cancelar
          </button>
        </div>
      )}

      {/* Selected Target Banner */}
      {targetToken && (() => {
        const hideAc =
          role !== 'gm' &&
          targetToken.type === 'monster' &&
          !campaign.settings.showEnemyAcToPlayers;
        return (
          <div className="absolute bottom-24 left-4 z-20 rpg-glass-panel rounded-md px-3.5 py-1.5 flex items-center gap-3 text-xs shadow-xl">
            <div className="flex items-center gap-1.5">
              <Crosshair className="w-4 h-4 text-red-400" />
              <span>
                Alvo Selecionado: <strong>{targetToken.name}</strong> (CA{' '}
                {hideAc ? '??' : targetToken.defense}
                {role === 'gm' ? ` • PV ${targetToken.hp}/${targetToken.maxHp}` : ''})
              </span>
            </div>
            <button
              onClick={() => setTargetTokenId(null)}
              className="text-[11px] underline opacity-75 hover:opacity-100 cursor-pointer"
            >
              Limpar
            </button>
          </div>
        );
      })()}

      {/* Ruler Distance Indicator */}
      {tool === 'ruler' && rulerMetrics && (
        <div className="absolute top-14 left-3 z-20 rpg-glass-panel rounded-lg px-3 py-1.5 text-xs font-mono-dice">
          📏 Distância: <strong>{rulerMetrics.meters}m</strong> •{' '}
          <strong className="text-amber-300">{rulerMetrics.feet} ft</strong> ({rulerMetrics.squares} quadrados)
        </div>
      )}

      {/* Pointer Hint */}
      {tool === 'pointer' && (
        <div className="absolute top-14 left-3 z-20 rpg-glass-panel rounded-lg px-3 py-1.5 text-xs">
          🔴 Mova o mouse sobre o mapa para mostrar sua bolinha colorida a todos!
        </div>
      )}

      {/* MAIN VIEWPORT: Pan the World by dragging outside the map, Middle-Click, or Space+Drag */}
      <div
        onMouseDown={(e) => {
          // Pan world when clicking outside the map grid, or middle-click anywhere, or holding Space
          const isMiddle = e.button === 1;
          const isOutsideMap = e.button === 0 && e.target === e.currentTarget;
          const isSpaceDrag = e.button === 0 && spacePressedRef.current;
          if (isMiddle || isOutsideMap || isSpaceDrag) {
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
        title="Segure o mouse fora do mapa (ou botão do meio / Espaço) para mover a câmera • Duplo clique fora para centralizar"
      >
          {/* Sculpted Brass & Obsidian Coordinate Tabletop Rim */}
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
            className="rpg-panel rounded-lg p-2.5 sm:p-3 shadow-[0_30px_85px_rgba(0,0,0,0.95)] shrink-0 relative cursor-default"
            style={{
              transform: `translate3d(${cameraPan.x}px, ${cameraPan.y}px, 0)`,
              willChange: isPanningWorld ? 'transform' : 'auto',
            }}
          >
            {/* Column Coordinates (A, B, C...) */}
            <div className="flex pl-5 mb-1 select-none pointer-events-none">
              {Array.from({ length: activeMap.gridWidth }).map((_, idx) => (
                <div
                  key={idx}
                  style={{ width: cellPx }}
                  className="text-center text-[9px] font-display font-bold opacity-45 text-amber-200"
                >
                  {String.fromCharCode(65 + (idx % 26))}
                </div>
              ))}
            </div>

            <div className="flex items-start">
              {/* Row Coordinates (1, 2, 3...) */}
              <div className="flex flex-col pr-1.5 select-none pointer-events-none">
                {Array.from({ length: activeMap.gridHeight }).map((_, idx) => (
                  <div
                    key={idx}
                    style={{ height: cellPx }}
                    className="w-4 flex items-center justify-end text-[9px] font-display font-bold opacity-45 text-amber-200"
                  >
                    {idx + 1}
                  </div>
                ))}
              </div>

              <div
                ref={gridRef}
                onMouseDown={handleGridMouseDown}
                onMouseMove={handleGridMouseMove}
                onMouseUp={handleGridMouseUp}
                onMouseLeave={handleGridMouseLeave}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (pendingAttackChoice) setPendingAttackChoice(null);
                  if (secretMarkerKind) setSecretMarkerKind(null);
                }}
                className="relative shadow-2xl select-none shrink-0 rounded border-2 overflow-hidden"
                style={{
                  width: totalW,
                  height: totalH,
                  borderColor: 'var(--border-ornate)',
                  background: resolvedMapBg
                    ? `url(${resolvedMapBg}) center/cover no-repeat`
                    : PRESET_GRADIENTS[activeMap.themePreset],
                  cursor:
                    secretMarkerKind || tool === 'ruler' || tool === 'ping' || tool === 'pointer'
                      ? 'crosshair'
                      : tool.startsWith('fog') || tool.startsWith('terrain-')
                      ? 'cell'
                      : 'default',
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

                {/* Tactical Terrain Cells: Walls, Cover (+2/+5 CA), Difficult Terrain (2x) */}
                {activeMap.terrainCells &&
                  Object.entries(activeMap.terrainCells).map(([key, kind]) => {
                    const [cxStr, cyStr] = key.split(',');
                    const cx = Number(cxStr);
                    const cy = Number(cyStr);
                    if (Number.isNaN(cx) || Number.isNaN(cy)) return null;
                    if (kind === 'wall') {
                      return (
                        <div
                          key={`ter-${key}`}
                          className="absolute pointer-events-none z-[5] border border-slate-500/70"
                          style={{
                            left: cx * cellPx,
                            top: cy * cellPx,
                            width: cellPx,
                            height: cellPx,
                            background:
                              'repeating-linear-gradient(135deg, rgba(15,23,42,0.96) 0px, rgba(15,23,42,0.96) 6px, rgba(51,65,85,0.92) 6px, rgba(51,65,85,0.92) 10px)',
                            boxShadow:
                              'inset 0 2px 6px rgba(255,255,255,0.14), inset 0 -3px 8px rgba(0,0,0,0.95)',
                          }}
                        />
                      );
                    }
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

                {/* Choreographed Movement Path Trail SVG while dragging */}
                {draggingTokenId && dragOrigin && dragPath.length > 0 && (() => {
                  const dragTok = activeMap.tokens.find((t) => t.id === draggingTokenId);
                  if (!dragTok) return null;
                  const half = (dragTok.size * cellPx) / 2;
                  const pts = [
                    { x: dragOrigin.x * cellPx + half, y: dragOrigin.y * cellPx + half },
                    ...dragPath.map((p) => ({ x: p.x * cellPx + half, y: p.y * cellPx + half })),
                  ];
                  const pointsAttr = pts.map((p) => `${p.x},${p.y}`).join(' ');
                  return (
                    <svg
                      className="absolute inset-0 pointer-events-none z-20"
                      width={totalW}
                      height={totalH}
                    >
                      <polyline
                        points={pointsAttr}
                        fill="none"
                        stroke="#fbbf24"
                        strokeWidth="2.5"
                        strokeDasharray="6 5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity="0.85"
                      />
                      {pts.map((p, idx) => (
                        <circle
                          key={idx}
                          cx={p.x}
                          cy={p.y}
                          r={idx === 0 || idx === pts.length - 1 ? 5 : 3}
                          fill={idx === 0 ? '#34d399' : '#fbbf24'}
                          stroke="#06070c"
                          strokeWidth="1.5"
                        />
                      ))}
                    </svg>
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
                  const { meters: distM } = getGridSpanDistance(
                    atkTok.x,
                    atkTok.y,
                    atkTok.size,
                    hovTok.x,
                    hovTok.y,
                    hovTok.size,
                    sqMeters
                  );
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
                    range: pendingAttackChoice.range,
                    actionTitle: pendingAttackChoice.actionTitle,
                    sqMeters,
                    enableFlanking: campaign.settings.enableFlanking ?? true,
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
                            : `${distM}m • ${inRange ? 'NO ALCANCE' : `FORA (Máx ${maxM}m)`}`}
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
              if (!dragTok) return null;
              const cb = findTokenCombatant(dragTok);
              const remMeters = cb ? cb.remainingMoveMeters ?? cb.speedMeters ?? 9 : 9;
              const maxSq = Math.max(0, Math.floor(remMeters / sqMeters));
              const used = getGridSpanDistance(
                dragOrigin.x,
                dragOrigin.y,
                dragTok.size,
                dragTok.x,
                dragTok.y,
                dragTok.size,
                sqMeters
              );
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

            {/* Attack Range Zone Perimeter while choosing a Target */}
            {pendingAttackChoice && (() => {
              const atkTok =
                (pendingAttackChoice.attackerTokenId &&
                  activeMap.tokens.find((t) => t.id === pendingAttackChoice.attackerTokenId)) ||
                (pendingAttackChoice.attackerCharacterId &&
                  activeMap.tokens.find(
                    (t) => t.type === 'character' && t.referenceId === pendingAttackChoice.attackerCharacterId
                  ));
              if (!atkTok) return null;
              const maxSq = parseAttackRangeSquares(
                pendingAttackChoice.range,
                pendingAttackChoice.actionTitle,
                sqMeters
              );
              const minX = Math.max(0, atkTok.x - maxSq);
              const minY = Math.max(0, atkTok.y - maxSq);
              const maxX = Math.min(activeMap.gridWidth - atkTok.size, atkTok.x + maxSq) + atkTok.size;
              const maxY = Math.min(activeMap.gridHeight - atkTok.size, atkTok.y + maxSq) + atkTok.size;
              return (
                <div
                  className="absolute pointer-events-none z-5 border-2 border-amber-400/75 bg-amber-500/8 rounded"
                  style={{
                    left: minX * cellPx,
                    top: minY * cellPx,
                    width: (maxX - minX) * cellPx,
                    height: (maxY - minY) * cellPx,
                  }}
                />
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
                e.stopPropagation();
                if (e.button === 0) {
                  setSelectedTemplateId(tmpl.id);
                  setDraggingTemplateId(tmpl.id);
                }
              };
              const handleTemplateWheel = (e: React.WheelEvent) => {
                if (!isRotatable) return;
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
                e.preventDefault();
                e.stopPropagation();
                updateActiveMap((m) => ({
                  ...m,
                  templates: m.templates.filter((t) => t.id !== tmpl.id),
                }));
              };

              // Line beam thickness in viewBox (200x200) matching ~1 grid square width
              const lineHalfThickVb = Math.max(5, Math.min(22, 50 / Math.max(1, extentSquares)));

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
                        className="pointer-events-auto cursor-grab active:cursor-grabbing"
                        onMouseDown={handleTemplateDown}
                        onContextMenu={handleTemplateContext}
                      >
                        <title>Cone: Arraste (centros, bordas ou vértices) • Roda do mouse para girar • Botão direito remove</title>
                      </path>
                      <circle
                        cx="100"
                        cy="100"
                        r="7"
                        fill="#fbbf24"
                        stroke="#090b10"
                        strokeWidth="2"
                        className="pointer-events-auto cursor-grab active:cursor-grabbing"
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
                        className="pointer-events-auto cursor-grab active:cursor-grabbing"
                        onMouseDown={handleTemplateDown}
                        onContextMenu={handleTemplateContext}
                      >
                        <title>Linha: Arraste (centros, bordas ou vértices) • Roda do mouse para girar • Botão direito remove</title>
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
                        className="pointer-events-auto cursor-grab active:cursor-grabbing"
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
                        className="pointer-events-auto cursor-grab active:cursor-grabbing"
                        onMouseDown={handleTemplateDown}
                        onContextMenu={handleTemplateContext}
                      >
                        <title>Cubo: Arraste para mover • Clique para redimensionar ou disparar salvaguarda • Botão direito remove</title>
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
                        className="pointer-events-auto cursor-grab active:cursor-grabbing"
                        onMouseDown={handleTemplateDown}
                        onContextMenu={handleTemplateContext}
                      >
                        <title>Esfera: Arraste para mover • Clique para redimensionar ou disparar salvaguarda • Botão direito remove</title>
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
                            <option value="reflexos">Reflexos (DES)</option>
                            <option value="fortitude">Fortitude (CON)</option>
                            <option value="vontade">Vontade (SAB)</option>
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
                            reflexos: 'Reflexos (DES)',
                            fortitude: 'Fortitude (CON)',
                            vontade: 'Vontade (SAB)',
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

            {/* Tokens with Token Stamp (#7), Turn Aura, Click Menu, Slash VFX & Floating Damage */}
            {activeMap.tokens.map((tok) => {
              if (tok.isHidden && role !== 'gm') return null;
              const isTarget = tok.id === targetTokenId;
              const isMenuOpen = tok.id === selectedTokenId;
              const isCurrentTurn =
                activeTurnCombatant &&
                (activeTurnCombatant.tokenId === tok.id ||
                  (tok.referenceId && activeTurnCombatant.referenceId === tok.referenceId));
              const linkedChar =
                tok.type === 'character' && tok.referenceId
                  ? campaign.characters.find((c) => c.id === tok.referenceId)
                  : null;
              const linkedMonster =
                tok.type === 'monster' && tok.referenceId
                  ? campaign.compendium.monsters.find((m) => m.id === tok.referenceId)
                  : null;
              const tokenColor = linkedChar?.playerColor || tok.color;
              const frameStyle =
                linkedChar?.tokenFrameStyle ||
                tok.frameStyle ||
                (tok.type === 'character' ? 'gold' : 'crimson');
              const portraitImg = linkedChar?.portraitUrl || tok.imageUrl;

              const tokPx = tok.size * cellPx;
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
                  ? getGridSpanDistance(
                      pendingAtkToken.x,
                      pendingAtkToken.y,
                      pendingAtkToken.size,
                      tok.x,
                      tok.y,
                      tok.size,
                      sqMeters
                    ).meters
                  : 0;
              const isOutOfPendingRange =
                Boolean(pendingAttackChoice && pendingAtkToken && pendingAtkToken.id !== tok.id) &&
                pendingDist > pendingMaxMeters + 0.05;

              const isSelfPendingTarget = Boolean(
                pendingAttackChoice &&
                  pendingAttackChoice.damageType !== 'Cura' &&
                  ((pendingAttackChoice.attackerTokenId &&
                    pendingAttackChoice.attackerTokenId === tok.id) ||
                    (pendingAttackChoice.attackerCharacterId &&
                      tok.type === 'character' &&
                      tok.referenceId === pendingAttackChoice.attackerCharacterId))
              );

              const removeTokenFromMapAndCombat = () => {
                updateCampaign((prev) => ({
                  ...prev,
                  maps: prev.maps.map((m) =>
                    m.id === activeMap.id
                      ? { ...m, tokens: m.tokens.filter((t) => t.id !== tok.id) }
                      : m
                  ),
                  combat: {
                    ...prev.combat,
                    combatants: prev.combat.combatants.filter(
                      (cb) => cb.tokenId !== tok.id
                    ),
                  },
                }));
                if (targetTokenId === tok.id) setTargetTokenId(null);
                setSelectedTokenId(null);
              };

              return (
                <div
                  key={tok.id}
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
                      startCombatDuel(pendingAttackChoice, tok);
                      return;
                    }
                    if (e.button === 2) {
                      setTargetTokenId(isTarget ? null : tok.id);
                      return;
                    }
                    if (tool === 'select') {
                      if (hasActiveOpportunityPrompt && opportunityPrompt) {
                        didDragTokenRef.current = false;
                        showTacticalAlert(
                          `Ataque de Oportunidade em aberto (${opportunityPrompt.reactorName} → ${opportunityPrompt.targetName})! Resolva ou passe a reação antes de mover.`
                        );
                        return;
                      }
                      if (activeDuel) {
                        didDragTokenRef.current = false;
                        return;
                      }
                      if (role === 'player') {
                        const isOwnTok = Boolean(
                          tok.type === 'character' &&
                            myCharacter &&
                            tok.referenceId === myCharacter.id
                        );
                        if (!isOwnTok) {
                          // Players can click other tokens to open context actions/attacks, but never drag them
                          return;
                        }
                        if (tok.hp <= 0) {
                          showTacticalAlert('Seu personagem está caído (0 PV) e não pode se mover!');
                          return;
                        }
                        if (campaign.combat.active) {
                          const cb = findTokenCombatant(tok);
                          if (activeTurnCombatant && cb && activeTurnCombatant.id !== cb.id) {
                            showTacticalAlert(`Aguarde seu turno na iniciativa (${activeTurnCombatant.name} está agindo).`);
                            return;
                          }
                          if (cb && (cb.remainingMoveMeters ?? cb.speedMeters ?? 9) < sqMeters) {
                            showTacticalAlert('Deslocamento esgotado neste turno! Use Disparada (Dash) ou encerre o turno.');
                            return;
                          }
                        }
                      }
                      didDragTokenRef.current = false;
                      setDraggingTokenId(tok.id);
                      setDragOrigin({
                        tokenId: tok.id,
                        x: tok.x,
                        y: tok.y,
                        shiftFree: role === 'gm' && e.shiftKey,
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
                      !pendingAttackChoice
                    ) {
                      setTargetTokenId(tok.id);
                      if (
                        tok.type === 'character' &&
                        tok.referenceId &&
                        (role === 'gm' || tok.referenceId === myCharacter?.id)
                      ) {
                        setActiveCharacterId(tok.referenceId);
                      }
                      setSelectedTokenId(isMenuOpen ? null : tok.id);
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
                  title={`${tok.name} | CA ${
                    role !== 'gm' &&
                    tok.type === 'monster' &&
                    !campaign.settings.showEnemyAcToPlayers
                      ? '??'
                      : tok.defense
                  } | Clique para abrir ações${
                    role === 'gm' ||
                    (tok.type === 'character' &&
                      myCharacter &&
                      tok.referenceId === myCharacter.id)
                      ? ' • Arraste para mover'
                      : ''
                  }`}
                  className={`absolute flex flex-col items-center justify-center ${
                    pendingAttackChoice
                      ? isOutOfPendingRange || isSelfPendingTarget
                        ? 'cursor-not-allowed opacity-60'
                        : 'cursor-crosshair hover:scale-108'
                      : role === 'gm' ||
                          (tok.type === 'character' &&
                            myCharacter &&
                            tok.referenceId === myCharacter.id)
                        ? 'cursor-grab active:cursor-grabbing'
                        : 'cursor-pointer'
                  } ${tok.isHidden ? 'opacity-60 ring-1 ring-amber-400/50 rounded-full' : ''} ${hasHitSlash ? 'animate-crit-shake' : ''}`}
                  style={{
                    left: tok.x * cellPx,
                    top: tok.y * cellPx,
                    width: tokPx,
                    height: tokPx,
                    zIndex: isMenuOpen ? 40 : isTarget || isCurrentTurn ? 15 : 10,
                    transition:
                      draggingTokenId === tok.id
                        ? 'left 0.05s linear, top 0.05s linear'
                        : 'left 0.2s cubic-bezier(0.16, 1, 0.3, 1), top 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                  }}
                >
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

                  {/* Token Stamp Miniature Coin */}
                  <div className="relative flex items-center justify-center">
                    <TokenPortrait
                      name={tok.name}
                      imageUrl={portraitImg}
                      playerColor={tokenColor}
                      frameStyle={frameStyle}
                      sizePx={Math.max(24, Math.round(tokPx * 0.86))}
                      isDead={tok.hp <= 0}
                      iconHint={linkedMonster?.type || linkedChar?.classId}
                    />
                    {/* Engraved Mini CA Shield Pill on Coin Rim (Hidden for Monsters when GM hides enemy AC) */}
                    {(role === 'gm' ||
                      tok.type !== 'monster' ||
                      campaign.settings.showEnemyAcToPlayers) && (
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
                        <div className="w-full h-full rounded-full border-4 border-sky-400 animate-ping opacity-75" />
                      )}
                      {s.kind === 'heal' && (
                        <div className="w-full h-full rounded-full border-4 border-emerald-400 animate-ping opacity-75" />
                      )}
                    </div>
                  ))}

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
                    {tok.isHidden && role === 'gm' && (
                      <span className="text-[8px] px-1 rounded bg-amber-500/30 text-amber-200 border border-amber-400/60">
                        OCULTO
                      </span>
                    )}
                    <span>{tok.name}</span>
                  </div>

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

                  {/* Token Floating Context Action Menu */}
                  {isMenuOpen && (
                    <div
                      onMouseDown={(e) => e.stopPropagation()}
                      onMouseUp={(e) => e.stopPropagation()}
                      className="absolute bottom-[112%] left-1/2 -translate-x-1/2 w-60 rpg-glass-panel rounded-xl p-3 space-y-2 text-xs shadow-2xl z-50 cursor-default animate-dice-tumble"
                    >
                      <div className="flex items-center justify-between border-b pb-1.5" style={{ borderColor: 'var(--border-subtle)' }}>
                        <div>
                          <div className="font-display font-bold text-sm">{tok.name}</div>
                          <div className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                            CA{' '}
                            {role !== 'gm' &&
                            tok.type === 'monster' &&
                            !campaign.settings.showEnemyAcToPlayers
                              ? '??'
                              : tok.defense}
                            {role === 'gm' || tok.type === 'character' ? (
                              ` • PV ${tok.hp}/${tok.maxHp}`
                            ) : (
                              <>
                                {' • '}
                                <span className={getMonsterWoundStatus(tok.hp, tok.maxHp).colorClass}>
                                  {getMonsterWoundStatus(tok.hp, tok.maxHp).label}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => setSelectedTokenId(null)}
                          className="text-xs opacity-60 hover:opacity-100 cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>

                      {/* Own Character / GM Controlled Character Attacks (Click to aim on map) */}
                      {linkedChar &&
                        linkedChar.hp > 0 &&
                        (role === 'gm' || linkedChar.id === myCharacter?.id) &&
                        (() => {
                          const charStats = computeCharacterStats(linkedChar, campaign);
                          const eqWeapons = (linkedChar.inventory || [])
                            .filter((inv) => inv.equipped)
                            .flatMap((inv) => {
                              const def = campaign.compendium.items.find(
                                (i) => i.id === inv.itemId
                              );
                              return def && def.attackFormula ? [def] : [];
                            });
                          const knownAbs = (linkedChar.knownAbilityIds || [])
                            .map((id) => campaign.compendium.abilities.find((a) => a.id === id))
                            .filter((a): a is NonNullable<typeof a> => Boolean(a))
                            .filter((a) => a.actionType !== 'Passiva');

                          if (
                            linkedChar.customAttacks.length === 0 &&
                            eqWeapons.length === 0 &&
                            linkedChar.customAbilities.length === 0 &&
                            knownAbs.length === 0
                          ) {
                            return null;
                          }

                          return (
                            <div className="space-y-1">
                              <div className="text-[10px] uppercase tracking-wider text-amber-300 font-display font-bold">
                                Ataques de {linkedChar.name}:
                              </div>
                              <div className="space-y-1 max-h-32 overflow-y-auto">
                                {linkedChar.customAttacks.map((atk) => (
                                  <button
                                    key={atk.id}
                                    onClick={() => {
                                      setSelectedTokenId(null);
                                      rollCharacterAction({
                                        characterId: linkedChar.id,
                                        title: atk.name,
                                        attackFormula: atk.attackBonusFormula,
                                        damageFormula: atk.damageFormula,
                                        damageType: atk.damageType,
                                        range: atk.range,
                                        actionCost: 'Padrão',
                                      });
                                    }}
                                    className="w-full rpg-btn-crimson px-2.5 py-1.5 rounded-lg text-[11px] flex items-center justify-between gap-1 cursor-pointer"
                                  >
                                    <span className="truncate flex items-center gap-1">
                                      <Swords className="w-3 h-3 shrink-0" />
                                      {atk.name}
                                    </span>
                                    <span className="font-mono-dice text-[10px] opacity-90 shrink-0">
                                      {formatFormulaForDisplay(
                                        atk.damageFormula,
                                        charStats,
                                        linkedChar
                                      )}
                                    </span>
                                  </button>
                                ))}
                                {eqWeapons.map((wp) => (
                                  <button
                                    key={wp.id}
                                    onClick={() => {
                                      setSelectedTokenId(null);
                                      rollCharacterAction({
                                        characterId: linkedChar.id,
                                        title: wp.name,
                                        attackFormula: wp.attackFormula,
                                        damageFormula: wp.damageFormula,
                                        damageType: wp.damageType,
                                        range: wp.range,
                                        actionCost: 'Padrão',
                                      });
                                    }}
                                    className="w-full rpg-card hover:border-amber-400 px-2.5 py-1.5 rounded-lg text-[11px] flex items-center justify-between gap-1 cursor-pointer"
                                  >
                                    <span className="truncate flex items-center gap-1">
                                      <Swords className="w-3 h-3 text-amber-300 shrink-0" />
                                      {wp.name}
                                    </span>
                                    <span className="font-mono-dice text-[10px] text-amber-200 shrink-0">
                                      {wp.range || '1,5m'}
                                    </span>
                                  </button>
                                ))}
                                {knownAbs.slice(0, 3).map((ab) => (
                                  <button
                                    key={ab.id}
                                    onClick={() => {
                                      setSelectedTokenId(null);
                                      rollCharacterAction({
                                        characterId: linkedChar.id,
                                        title: ab.name,
                                        attackFormula: ab.attackFormula,
                                        damageFormula: ab.damageFormula,
                                        damageType: ab.damageType,
                                        range: ab.range,
                                        actionCost:
                                          ab.actionType === 'Bônus'
                                            ? 'Bônus'
                                            : ab.actionType === 'Reação'
                                              ? 'Reação'
                                              : ab.actionType === 'Livre'
                                                ? 'Livre'
                                                : 'Padrão',
                                        saveSkillId: ab.saveSkillId,
                                        saveDcFormula: ab.saveDcFormula,
                                        costMp: ab.costMp,
                                        applyConditionId: ab.applyConditionId,
                                        conditionDurationRounds: ab.conditionDurationRounds,
                                      });
                                    }}
                                    className="w-full rpg-card hover:border-amber-400 px-2.5 py-1.5 rounded-lg text-[11px] flex items-center justify-between gap-1 cursor-pointer"
                                  >
                                    <span className="truncate flex items-center gap-1 text-amber-200">
                                      <Sparkles className="w-3 h-3 text-amber-300 shrink-0" />
                                      {ab.name}
                                    </span>
                                    <span className="font-mono-dice text-[10px] text-sky-300 shrink-0">
                                      {ab.costMp > 0
                                        ? `${ab.costMp} ${campaign.settings.resourceShort}`
                                        : ab.actionType}
                                    </span>
                                  </button>
                                ))}
                              </div>
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
                                  ? getGridSpanDistance(
                                      activeHeroTok.x,
                                      activeHeroTok.y,
                                      activeHeroTok.size,
                                      tok.x,
                                      tok.y,
                                      tok.size,
                                      sqMeters
                                    ).meters
                                  : 0;
                              const outOfRange =
                                Boolean(activeHeroTok && activeHeroTok.id !== tok.id) &&
                                distInfo > maxM + 0.05;
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
                                      : `Atacar ${tok.name} (${distInfo}m / máx ${maxM}m)`
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

                      {/* GM Controls: Next-Attack Adv/Disadv, Monster Attacks, Death Save Rescue, Quick HP, Hide, Delete */}
                      {role === 'gm' && (
                        <div className="space-y-2 pt-1.5 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
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
                                    setPendingAttackChoice({
                                      attackerTokenId: tok.id,
                                      attackerName: tok.name,
                                      attackerColor: tok.color,
                                      attackerImageUrl: tok.imageUrl,
                                      attackerFrame: tok.frameStyle || 'crimson',
                                      diceSkin: 'blood',
                                      actionTitle: matk.name,
                                      attackFormula: `1d20 + ${matk.attackBonus}`,
                                      damageFormula: matk.damageFormula,
                                      damageType: matk.damageType,
                                      range: matk.range,
                                      actionCost: 'Padrão',
                                    });
                                  }}
                                  className="w-full rpg-card px-2 py-1 rounded text-[11px] flex items-center justify-between hover:border-amber-400 cursor-pointer"
                                >
                                  <span className="truncate">{matk.name}</span>
                                  <span className="font-mono-dice text-[10px] text-amber-300">
                                    +{matk.attackBonus} | {matk.damageFormula}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}

                          <div className="flex items-center justify-between gap-1">
                            <button
                              onClick={() => applyDamage(tok.id, 5, false)}
                              className="flex-1 py-1 rounded bg-red-900/60 hover:bg-red-800 text-white text-[11px] cursor-pointer"
                            >
                              -5
                            </button>
                            <button
                              onClick={() => applyDamage(tok.id, 1, false)}
                              className="flex-1 py-1 rounded bg-red-900/40 hover:bg-red-800 text-white text-[11px] cursor-pointer"
                            >
                              -1
                            </button>
                            <button
                              onClick={() => applyDamage(tok.id, 1, true)}
                              className="flex-1 py-1 rounded bg-emerald-900/40 hover:bg-emerald-800 text-white text-[11px] cursor-pointer"
                            >
                              +1
                            </button>
                            <button
                              onClick={() => applyDamage(tok.id, 5, true)}
                              className="flex-1 py-1 rounded bg-emerald-900/60 hover:bg-emerald-800 text-white text-[11px] cursor-pointer"
                            >
                              +5
                            </button>
                          </div>

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

                          {tok.type === 'character' && tok.referenceId && (
                            <button
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `Excluir permanentemente o personagem "${tok.name}" de toda a campanha?`
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
                  )}
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
              if (!marker.revealed && role !== 'gm') return null;
              const isSelected = selectedMarkerId === marker.id;
              const hasLoot =
                (marker.lootItems && marker.lootItems.length > 0) ||
                (marker.lootGold ?? 0) > 0;
              const canPlayerClick =
                marker.revealed && (marker.kind === 'chest' || marker.kind === 'item' || hasLoot);
              const markerAccent =
                marker.kind === 'chest'
                  ? '#f59e0b'
                  : marker.kind === 'item'
                    ? '#38bdf8'
                    : marker.kind === 'trap'
                      ? '#ef4444'
                      : '#a855f7';
              return (
                <div
                  key={marker.id}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    if (role === 'gm' || canPlayerClick) {
                      setSelectedMarkerId((curr) => (curr === marker.id ? null : marker.id));
                    }
                  }}
                  style={{
                    left: marker.x * cellPx,
                    top: marker.y * cellPx,
                    width: cellPx,
                    height: cellPx,
                  }}
                  className={`absolute flex flex-col items-center justify-center z-20 ${
                    role === 'gm' || canPlayerClick ? 'cursor-pointer' : 'pointer-events-none'
                  } ${!marker.revealed ? 'opacity-85' : ''}`}
                  title={
                    role === 'gm'
                      ? `${marker.title} (${marker.revealed ? 'Visível para Jogadores' : 'Escondido — Só o Mestre vê'})`
                      : `${marker.title} — Clique para abrir/pegar`
                  }
                >
                  {/* Ornate Medallion Icon for Secret Marker */}
                  <div
                    className="w-[74%] h-[74%] rounded-md bg-[#0a0c14]/95 border-2 flex items-center justify-center relative shadow-[0_6px_16px_rgba(0,0,0,0.9)] transition-transform hover:scale-110"
                    style={{
                      borderColor: markerAccent,
                      boxShadow: `0 0 12px ${markerAccent}55, inset 0 0 8px ${markerAccent}33`,
                    }}
                  >
                    <svg viewBox="0 0 24 24" className="w-4/6 h-4/6" fill="none">
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
                    </svg>
                  </div>

                  {/* Marker Nameplate + Secret/Loot Badge */}
                  <div
                    className="absolute -top-3.5 px-1.5 py-0.2 rounded-xs bg-[#090b12]/95 border text-[8px] font-display font-bold whitespace-nowrap flex items-center gap-1 pointer-events-none shadow"
                    style={{ borderColor: markerAccent, color: '#fef3c7' }}
                  >
                    {!marker.revealed && role === 'gm' && (
                      <span className="text-amber-300">[SECRETO]</span>
                    )}
                    <span>{marker.title}</span>
                    {hasLoot && (
                      <span className="text-emerald-300">
                        •{(marker.lootItems?.length || 0) + ((marker.lootGold || 0) > 0 ? 1 : 0)}
                      </span>
                    )}
                  </div>

                  {/* Player Treasure Claim Popover */}
                  {role !== 'gm' && isSelected && marker.revealed && (
                    <div
                      onMouseDown={(e) => e.stopPropagation()}
                      className="absolute bottom-[110%] left-1/2 -translate-x-1/2 w-60 rpg-glass-panel rounded-lg p-3 space-y-2 text-xs shadow-2xl z-50 cursor-default"
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

                      {hasLoot ? (
                        <div className="space-y-1 text-[11px]">
                          {(marker.lootGold ?? 0) > 0 && (
                            <div className="text-amber-300 font-mono-dice font-bold">
                              🪙 {marker.lootGold} PO
                            </div>
                          )}
                          {(marker.lootItems || []).map((li) => {
                            const itemDef = campaign.compendium.items.find(
                              (it) => it.id === li.itemId
                            );
                            return (
                              <div key={li.itemId} className="flex items-center justify-between">
                                <span className="truncate">{itemDef?.name || 'Item'}</span>
                                <span className="font-mono-dice text-emerald-300">x{li.quantity}</span>
                              </div>
                            );
                          })}
                          <button
                            onClick={() => {
                              claimTreasureMarker(marker.id);
                              setSelectedMarkerId(null);
                            }}
                            className="w-full rpg-btn-primary px-3 py-1.5 rounded-md font-display font-bold text-xs cursor-pointer mt-1"
                          >
                            ✨ Pegar Tesouro
                          </button>
                        </div>
                      ) : (
                        <div className="text-[11px] font-lore italic opacity-75">
                          Baú vazio no momento.
                        </div>
                      )}
                    </div>
                  )}

                  {/* GM Interactive Popover to Rename, Add Loot/Gold, Reveal/Hide, or Remove */}
                  {role === 'gm' && isSelected && (
                    <div
                      onMouseDown={(e) => e.stopPropagation()}
                      className="absolute bottom-[110%] left-1/2 -translate-x-1/2 w-64 rpg-glass-panel rounded-lg p-2.5 space-y-2 text-xs shadow-2xl z-50 cursor-default"
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
                                <option value="reflexos">Reflexos</option>
                                <option value="fortitude">Fortitude</option>
                                <option value="vontade">Vontade</option>
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

            {/* Fog of War Grid Cells */}
            {activeMap.fogEnabled && (
              <div className="absolute inset-0 pointer-events-none z-15">
                {Array.from({ length: activeMap.gridHeight }).map((_, gy) =>
                  Array.from({ length: activeMap.gridWidth }).map((__, gx) => {
                    const revealed = activeMap.revealedCells.includes(`${gx},${gy}`);
                    if (revealed) return null;
                    return (
                      <div
                        key={`fog-${gx}-${gy}`}
                        className="absolute"
                        style={{
                          left: gx * cellPx,
                          top: gy * cellPx,
                          width: cellPx,
                          height: cellPx,
                          backgroundColor:
                            role === 'gm' ? 'rgba(5, 7, 12, 0.58)' : 'rgba(5, 7, 12, 0.96)',
                        }}
                      />
                    );
                  })
                )}
              </div>
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

            {/* Map Pings */}
            {pings
              .filter((p) => p.mapId === activeMap.id)
              .map((p) => (
                <div
                  key={p.id}
                  className="absolute pointer-events-none z-30 map-ping-ring rounded-full border-4"
                  style={{
                    left: (p.x + 0.5) * cellPx,
                    top: (p.y + 0.5) * cellPx,
                    width: cellPx * 1.4,
                    height: cellPx * 1.4,
                    borderColor: p.color,
                  }}
                />
              ))}

            {/* Weather Layer */}
            {weatherClass && (
              <div className={`absolute inset-0 pointer-events-none z-25 ${weatherClass}`} />
            )}
          </div>
          </div>
          </div>
        </div>
    </div>
  );
};
