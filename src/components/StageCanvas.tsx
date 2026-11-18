import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CloudRain,
  Crosshair,
  Eye,
  EyeOff,
  Flame,
  Heart,
  Image as ImageIcon,
  Layers,
  MapPin,
  MousePointer,
  Navigation,
  Plus,
  RotateCw,
  Ruler,
  Sparkles,
  Swords,
  Trash2,
  Users,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useCampaign } from '../context/CampaignContext';
import {
  computeCharacterStats,
  formatFormulaForDisplay,
  getGridSpanDistance,
  parseAttackRangeMeters,
  parseAttackRangeSquares,
} from '../shared/rulesEngine';
import {
  AoETemplate,
  GmMapMarker,
  GmMarkerKind,
  MapToken,
  PendingAttackChoice,
  TacticalMap,
} from '../shared/types';
import { FileUploadButton } from './FileUploadButton';
import { SculptedHealthBar } from './OrnateFrame';
import { TokenPortrait } from './TokenPortrait';

type StageTool = 'select' | 'pointer' | 'ruler' | 'ping' | 'fog-reveal' | 'fog-hide';

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
    targetTokenId,
    setTargetTokenId,
    updateCampaign,
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
    resolveAssetUrl,
    showTacticalAlert,
    triggerOpportunityPrompt,
  } = useCampaign();

  const activeMap =
    campaign.maps.find((m) => m.id === campaign.activeMapId) || campaign.maps[0];

  const [tool, setTool] = useState<StageTool>('select');
  const [zoom, setZoom] = useState(1);
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
  const [rulerStart, setRulerStart] = useState<{ x: number; y: number } | null>(null);
  const [rulerEnd, setRulerEnd] = useState<{ x: number; y: number } | null>(null);
  const [showMapConfig, setShowMapConfig] = useState(false);
  const [spawnMonsterId, setSpawnMonsterId] = useState(
    campaign.compendium.monsters[0]?.id || ''
  );
  const [spawnHidden, setSpawnHidden] = useState(false);
  const [secretMarkerKind, setSecretMarkerKind] = useState<GmMarkerKind | null>(null);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
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
    setDraggingTokenId(null);
    setDragOrigin(null);
    setDragPath([]);
    if (!origin || !activeMap || !campaign.combat.active || origin.shiftFree) return;

    const finalTok = activeMap.tokens.find((t) => t.id === origin.tokenId);
    if (!finalTok) return;
    const { squares, meters } = getGridSpanDistance(
      origin.x,
      origin.y,
      finalTok.size,
      finalTok.x,
      finalTok.y,
      finalTok.size,
      sqMeters
    );
    if (squares <= 0) return;

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
    if (!gridRef.current || !activeMap) return { gx: 0, gy: 0, xPct: 0, yPct: 0 };
    const rect = gridRef.current.getBoundingClientRect();
    const cellPx = activeMap.gridSizePx * zoom;
    const gx = Math.max(
      0,
      Math.min(activeMap.gridWidth - 1, Math.floor((e.clientX - rect.left) / cellPx))
    );
    const gy = Math.max(
      0,
      Math.min(activeMap.gridHeight - 1, Math.floor((e.clientY - rect.top) / cellPx))
    );
    const xPct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const yPct = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    return { gx, gy, xPct, yPct };
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
  };

  const handleGridMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!activeMap) return;
    const { gx, gy, xPct, yPct } = getCellFromEvent(e);

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
      updateActiveMap((m) => ({
        ...m,
        templates: m.templates.map((tmpl) =>
          tmpl.id === draggingTemplateId ? { ...tmpl, x: gx, y: gy } : tmpl
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
          let targetX = gx;
          let targetY = gy;
          if (campaign.combat.active && dragOrigin && !dragOrigin.shiftFree) {
            const cb = findTokenCombatant(t);
            const remMeters = cb ? cb.remainingMoveMeters ?? cb.speedMeters ?? 9 : 9;
            const maxSq = Math.max(0, Math.floor(remMeters / sqMeters));
            targetX = Math.max(dragOrigin.x - maxSq, Math.min(dragOrigin.x + maxSq, gx));
            targetY = Math.max(dragOrigin.y - maxSq, Math.min(dragOrigin.y + maxSq, gy));
            targetX = Math.max(0, Math.min(activeMap.gridWidth - t.size, targetX));
            targetY = Math.max(0, Math.min(activeMap.gridHeight - t.size, targetY));
          }
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
    const newToken: MapToken = {
      id: `tok-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      name: `${mon.name} #${existingCount + 1}`,
      type: 'monster',
      referenceId: mon.id,
      x: Math.floor(activeMap.gridWidth / 2),
      y: Math.floor(activeMap.gridHeight / 2),
      size: mon.size === 'Grande' || mon.size === 'Enorme' ? 2 : 1,
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
      campaign.characters.forEach((ch, idx) => {
        const stats = computeCharacterStats(ch, campaign);
        if (!existingCharIds.has(ch.id)) {
          newTokens.push({
            id: `tok-${ch.id}-${Date.now()}`,
            name: ch.name.split(' ')[0],
            type: 'character',
            referenceId: ch.id,
            x: 2 + (idx % 2),
            y: 4 + idx,
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
    const tmpl: AoETemplate = {
      id: `aoe-${Date.now()}`,
      shape,
      x: Math.floor(activeMap.gridWidth / 2),
      y: Math.floor(activeMap.gridHeight / 2),
      radiusSquares: shape === 'sphere' ? 4 : 3,
      angleDeg: 0,
      color: colors[shape],
      label: labels[shape],
    };
    updateActiveMap((m) => ({ ...m, templates: [...m.templates, tmpl] }));
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
    return { squares, meters };
  }, [rulerStart, rulerEnd, activeMap, campaign.settings.gridSquareMeters]);

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
      {/* Clean Floating Stage Toolbar */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-25 max-w-[96%] flex flex-col items-center gap-2 pointer-events-none">
        <div className="rpg-glass-panel rounded-xl px-3 py-1.5 flex items-center gap-2 flex-wrap justify-center pointer-events-auto shadow-2xl">
          <div className="flex items-center gap-1.5">
            {role === 'gm' ? (
              <select
                value={activeMap.id}
                onChange={(e) =>
                  updateCampaign((prev) => ({ ...prev, activeMapId: e.target.value }))
                }
                className="rpg-input text-xs py-1 rounded-md font-display font-semibold"
              >
                {campaign.maps.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.mode === 'tactical' ? '🗺️' : '🎭'} {m.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-xs font-display font-bold px-2">
                {activeMap.mode === 'tactical' ? '🗺️' : '🎭'} {activeMap.name}
              </span>
            )}

            {role === 'gm' && (
              <>
                <button
                  onClick={createNewMap}
                  className="rpg-card px-2 py-1 rounded-md text-xs flex items-center gap-1 cursor-pointer hover:border-amber-400/60"
                  title="Criar novo Mapa ou Cena"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>

                <FileUploadButton
                  accept="image/*"
                  label="Subir Mapa"
                  onUploaded={(url) => updateActiveMap((m) => ({ ...m, backgroundUrl: url }))}
                  className="rounded-md"
                />

                <button
                  onClick={() =>
                    updateActiveMap((m) => ({
                      ...m,
                      mode: m.mode === 'tactical' ? 'scene' : 'tactical',
                    }))
                  }
                  className="rpg-card px-2.5 py-1 rounded-md text-xs flex items-center gap-1 cursor-pointer hover:border-amber-400/60"
                  title="Alternar entre Mapa Tático e Cena"
                >
                  {activeMap.mode === 'tactical' ? (
                    <>
                      <ImageIcon className="w-3.5 h-3.5" />
                      <span className="hidden xl:inline">Cena</span>
                    </>
                  ) : (
                    <>
                      <Layers className="w-3.5 h-3.5" />
                      <span className="hidden xl:inline">Grid</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => setShowMapConfig((v) => !v)}
                  className={`px-2 py-1 rounded-md text-xs flex items-center gap-1 cursor-pointer ${
                    showMapConfig ? 'rpg-btn-primary' : 'rpg-card'
                  }`}
                  title="Clima e Aparência"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>

          {/* Tactical Tools */}
          {activeMap.mode === 'tactical' && (
            <div className="flex items-center gap-1 pl-2 border-l" style={{ borderColor: 'var(--border-subtle)' }}>
              <button
                onClick={() => {
                  setTool('select');
                  emitPointerHide();
                }}
                className={`px-2.5 py-1 rounded-md text-xs flex items-center gap-1 cursor-pointer ${
                  tool === 'select' ? 'rpg-btn-primary' : 'rpg-card'
                }`}
                title="Mover Tokens e Áreas"
              >
                <MousePointer className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Mover</span>
              </button>

              <button
                onClick={() => setTool(tool === 'pointer' ? 'select' : 'pointer')}
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
                onClick={() => setTool('ping')}
                className={`px-2 py-1 rounded-md text-xs flex items-center gap-1 cursor-pointer ${
                  tool === 'ping' ? 'rpg-btn-primary' : 'rpg-card'
                }`}
                title="Ping Visual no mapa"
              >
                <MapPin className="w-3.5 h-3.5" />
              </button>

              {/* AoE quick buttons */}
              <div className="flex items-center gap-1 pl-1 border-l" style={{ borderColor: 'var(--border-subtle)' }}>
                <button
                  onClick={() => addAoETemplate('sphere')}
                  className="rpg-card px-2.5 py-1 rounded-md text-[11px] cursor-pointer hover:border-amber-400/60"
                  title="Adicionar Esfera de Magia (Arrastável)"
                >
                  <Flame className="w-3.5 h-3.5 inline mr-1 text-orange-400" />
                  Esfera
                </button>
                <button
                  onClick={() => addAoETemplate('cone')}
                  className="rpg-card px-2.5 py-1 rounded-md text-[11px] cursor-pointer hover:border-amber-400/60"
                  title="Adicionar Cone de Magia (Arrastável e Rotacionável)"
                >
                  Cone
                </button>
                {activeMap.templates.length > 0 && (
                  <button
                    onClick={() => updateActiveMap((m) => ({ ...m, templates: [] }))}
                    className="rpg-card px-1.5 py-1 rounded-md text-[11px] text-red-400 cursor-pointer"
                    title="Limpar Áreas"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Fog of War Controls (GM) */}
              {role === 'gm' && (
                <div className="flex items-center gap-1 pl-1 border-l" style={{ borderColor: 'var(--border-subtle)' }}>
                  <button
                    onClick={() =>
                      updateActiveMap((m) => ({ ...m, fogEnabled: !m.fogEnabled }))
                    }
                    className={`px-2 py-1 rounded-md text-xs flex items-center gap-1 cursor-pointer ${
                      activeMap.fogEnabled ? 'rpg-btn-crimson' : 'rpg-card'
                    }`}
                    title="Névoa de Guerra"
                  >
                    {activeMap.fogEnabled ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </button>
                  {activeMap.fogEnabled && (
                    <>
                      <button
                        onClick={() => setTool('fog-reveal')}
                        className={`px-2 py-1 rounded-md text-[11px] cursor-pointer ${
                          tool === 'fog-reveal' ? 'rpg-btn-primary' : 'rpg-card'
                        }`}
                      >
                        Revelar
                      </button>
                      <button
                        onClick={() => setTool('fog-hide')}
                        className={`px-2 py-1 rounded-md text-[11px] cursor-pointer ${
                          tool === 'fog-hide' ? 'rpg-btn-primary' : 'rpg-card'
                        }`}
                      >
                        Ocultar
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* GM Secret Map Layer (Hidden Items, Chests, Traps, Secret Passages) */}
              {role === 'gm' && (
                <div
                  className="flex items-center gap-1 pl-1 border-l"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  {(
                    [
                      { kind: 'chest' as const, label: 'Baú', title: 'Colocar Baú Escondido (Só o Mestre vê)' },
                      { kind: 'item' as const, label: 'Item', title: 'Colocar Item Escondido (Só o Mestre vê)' },
                      { kind: 'trap' as const, label: 'Armadilha', title: 'Colocar Armadilha Oculta (Só o Mestre vê)' },
                      { kind: 'secret' as const, label: 'Segredo', title: 'Colocar Passagem Secreta (Só o Mestre vê)' },
                    ] as const
                  ).map((btn) => {
                    const active = secretMarkerKind === btn.kind;
                    return (
                      <button
                        key={btn.kind}
                        onClick={() =>
                          setSecretMarkerKind((curr) => (curr === btn.kind ? null : btn.kind))
                        }
                        className={`px-2 py-1 rounded-md text-[11px] flex items-center gap-1 cursor-pointer ${
                          active
                            ? 'ring-2 ring-amber-400 bg-amber-500/25 text-amber-200 font-bold'
                            : 'rpg-card hover:border-amber-400/60'
                        }`}
                        title={
                          active
                            ? `Clique em qualquer célula do mapa para esconder ${btn.label} (ou clique aqui para sair)`
                            : btn.title
                        }
                      >
                        <EyeOff className="w-3 h-3 text-amber-400 shrink-0" />
                        <span>+{btn.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Right: Spawn + Zoom */}
          <div className="flex items-center gap-1.5 pl-2 border-l" style={{ borderColor: 'var(--border-subtle)' }}>
            {role === 'gm' && activeMap.mode === 'tactical' && (
              <div className="flex items-center gap-1">
                <select
                  value={spawnMonsterId}
                  onChange={(e) => setSpawnMonsterId(e.target.value)}
                  className="rpg-input text-xs py-1 rounded-md max-w-[115px]"
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
                      : 'rpg-card opacity-80 hover:opacity-100'
                  }`}
                  title={
                    spawnHidden
                      ? 'Modo Emboscada Ativo: Monstros adicionados nascem invisíveis para os jogadores (Só o Mestre vê)'
                      : 'Alternar: Colocar monstros escondidos (invisíveis para jogadores)'
                  }
                >
                  {spawnHidden ? (
                    <EyeOff className="w-3.5 h-3.5 text-amber-300" />
                  ) : (
                    <Eye className="w-3.5 h-3.5 opacity-70" />
                  )}
                  <span className="hidden lg:inline">{spawnHidden ? 'Escondido' : 'Visível'}</span>
                </button>
                <button
                  onClick={handleSpawnMonster}
                  className="rpg-btn-crimson px-2.5 py-1 rounded-md text-xs cursor-pointer"
                  title={
                    spawnHidden
                      ? 'Colocar monstro ESCONDIDO no mapa (só o Mestre vê até revelar)'
                      : 'Colocar monstro no mapa'
                  }
                >
                  + Monstro
                </button>
                <button
                  onClick={handleSyncPartyTokens}
                  className="rpg-card p-1.5 rounded-md text-xs flex items-center cursor-pointer"
                  title="Puxar heróis para o mapa"
                >
                  <Users className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {activeMap.mode === 'tactical' && (
              <div className="flex items-center gap-0.5 rpg-socket rounded-md px-1.5 py-0.5">
                <button
                  onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.15).toFixed(2))))}
                  className="p-0.5 cursor-pointer hover:opacity-75"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="text-[11px] px-1 font-mono-dice">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  onClick={() => setZoom((z) => Math.min(1.8, Number((z + 0.15).toFixed(2))))}
                  className="p-0.5 cursor-pointer hover:opacity-75"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

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
      {targetToken && (
        <div className="absolute bottom-24 left-4 z-20 rpg-glass-panel rounded-md px-3.5 py-1.5 flex items-center gap-3 text-xs shadow-xl">
          <div className="flex items-center gap-1.5">
            <Crosshair className="w-4 h-4 text-red-400" />
            <span>
              Alvo Selecionado: <strong>{targetToken.name}</strong> (CA {targetToken.defense}
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
      )}

      {/* Ruler Distance Indicator */}
      {tool === 'ruler' && rulerMetrics && (
        <div className="absolute top-14 left-3 z-20 rpg-glass-panel rounded-lg px-3 py-1.5 text-xs font-mono-dice">
          📏 Distância: <strong>{rulerMetrics.meters}m</strong> ({rulerMetrics.squares} quadrados)
        </div>
      )}

      {/* Pointer Hint */}
      {tool === 'pointer' && (
        <div className="absolute top-14 left-3 z-20 rpg-glass-panel rounded-lg px-3 py-1.5 text-xs">
          🔴 Mova o mouse sobre o mapa para mostrar sua bolinha colorida a todos!
        </div>
      )}

      {/* MAIN VIEWPORT */}
      {activeMap.mode === 'scene' ? (
        <div
          className="flex-1 relative flex flex-col justify-between p-6 overflow-y-auto"
          style={{
            background: resolvedMapBg
              ? `linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.65)), url(${resolvedMapBg}) center/cover no-repeat`
              : PRESET_GRADIENTS[activeMap.themePreset],
          }}
        >
          {weatherClass && (
            <div className={`absolute inset-0 pointer-events-none ${weatherClass}`} />
          )}

          <div className="relative z-10 max-w-3xl">
            <span className="text-xs uppercase tracking-widest px-2.5 py-1 rounded bg-black/50 text-amber-300 border border-amber-400/30">
              Modo Cena — Teatro da Mente
            </span>
            <h2 className="font-display text-3xl font-bold text-white mt-3 drop-shadow">
              {activeMap.name}
            </h2>
          </div>

          <div className="relative z-10 mt-auto pt-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-200">
                Personagens / NPCs na Cena
              </h3>
              {role === 'gm' && (
                <select
                  value=""
                  onChange={(e) => {
                    const id = e.target.value;
                    if (!id) return;
                    updateActiveMap((m) => ({
                      ...m,
                      sceneNpcIds: m.sceneNpcIds.includes(id)
                        ? m.sceneNpcIds.filter((x) => x !== id)
                        : [...m.sceneNpcIds, id],
                    }));
                  }}
                  className="rpg-input text-xs py-1"
                >
                  <option value="">+ Alternar NPC na Cena...</option>
                  {campaign.npcs.map((n) => (
                    <option key={n.id} value={n.id}>
                      {activeMap.sceneNpcIds.includes(n.id) ? '✓ ' : ''}
                      {n.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {campaign.npcs
                .filter((n) => activeMap.sceneNpcIds.includes(n.id))
                .map((npc) => (
                  <div
                    key={npc.id}
                    className="rpg-glass-panel rounded-xl p-3 flex items-start gap-3"
                  >
                    <TokenPortrait
                      name={npc.name}
                      imageUrl={npc.imageUrl}
                      playerColor="#e0b84c"
                      frameStyle="gold"
                      sizePx={48}
                    />
                    <div className="min-w-0">
                      <div className="font-display font-bold text-sm truncate">
                        {npc.name}
                      </div>
                      <div className="text-[11px]" style={{ color: 'var(--accent-primary)' }}>
                        {npc.role} • {npc.disposition}
                      </div>
                      <p className="text-xs mt-1 line-clamp-3" style={{ color: 'var(--text-secondary)' }}>
                        {npc.publicBio}
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      ) : (
        /* TACTICAL GRID MAP MODE */
        <div
          className="flex-1 overflow-auto relative flex items-center justify-center p-6"
          style={{ backgroundColor: 'var(--canvas-bg)' }}
        >
          {/* Sculpted Brass & Obsidian Coordinate Tabletop Rim */}
          <div className="rpg-panel rounded-lg p-2.5 sm:p-3 shadow-[0_30px_85px_rgba(0,0,0,0.95)] shrink-0 relative">
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
                      : tool.startsWith('fog')
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
                  const strokeCol = inRange ? '#f59e0b' : '#ef4444';
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
                        className={`absolute pointer-events-none z-35 -translate-x-1/2 -translate-y-1/2 px-2 py-0.5 rounded border text-[10px] font-display font-bold whitespace-nowrap shadow-xl ${
                          inRange
                            ? 'bg-[#121620]/95 border-amber-400 text-amber-200'
                            : 'bg-red-950/95 border-red-400 text-red-200'
                        }`}
                        style={{ left: midX, top: midY }}
                      >
                        {distM}m • {inRange ? 'NO ALCANCE' : `FORA (Máx ${maxM}m)`}
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
                    {used.meters}m / {remMeters}m ({used.squares}q)
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

            {/* AoE Templates (Draggable, Resizable & 360° Rotatable) */}
            {activeMap.templates.map((tmpl) => {
              const sizePx = tmpl.radiusSquares * 2 * cellPx;
              const isSelected = selectedTemplateId === tmpl.id;
              const meters =
                Math.round(tmpl.radiusSquares * campaign.settings.gridSquareMeters * 10) / 10;

              return (
                <div
                  key={tmpl.id}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    if (e.button === 0) {
                      setSelectedTemplateId(tmpl.id);
                      setDraggingTemplateId(tmpl.id);
                    }
                  }}
                  onWheel={(e) => {
                    if (tmpl.shape !== 'cone') return;
                    e.stopPropagation();
                    const delta = e.deltaY > 0 ? 15 : -15;
                    updateActiveMap((m) => ({
                      ...m,
                      templates: m.templates.map((t) =>
                        t.id === tmpl.id ? { ...t, angleDeg: (t.angleDeg + delta + 360) % 360 } : t
                      ),
                    }));
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    updateActiveMap((m) => ({
                      ...m,
                      templates: m.templates.filter((t) => t.id !== tmpl.id),
                    }));
                  }}
                  title="Arraste para mover • Clique para Girar / Redimensionar • Botão direito para remover"
                  className="absolute cursor-grab active:cursor-grabbing select-none"
                  style={{
                    left: (tmpl.x - tmpl.radiusSquares) * cellPx,
                    top: (tmpl.y - tmpl.radiusSquares) * cellPx,
                    width: sizePx,
                    height: sizePx,
                    zIndex: isSelected ? 14 : 8,
                  }}
                >
                  {tmpl.shape === 'cone' ? (
                    <svg
                      viewBox="0 0 200 200"
                      className="w-full h-full pointer-events-none"
                      style={{
                        transform: `rotate(${tmpl.angleDeg}deg)`,
                        transition: 'transform 0.12s ease-out',
                      }}
                    >
                      {/* 60-degree directional cone originating at center (100,100) pointing right */}
                      <path
                        d="M 100 100 L 186.6 50 A 100 100 0 0 1 186.6 150 Z"
                        fill={tmpl.color}
                        stroke="#fb923c"
                        strokeWidth="3"
                        strokeDasharray="6 4"
                      />
                      <circle cx="100" cy="100" r="6" fill="#fbbf24" />
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
                      />
                      <circle
                        cx="100"
                        cy="100"
                        r="55"
                        fill="none"
                        stroke="rgba(255,255,255,0.25)"
                        strokeWidth="1.5"
                      />
                    </svg>
                  )}

                  {/* Center label */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="bg-black/75 px-2 py-0.5 rounded-full text-[10px] font-bold text-white border border-white/25">
                      {tmpl.shape === 'cone' ? `Cone ${meters}m` : `Esfera ${meters}m`}
                    </span>
                  </div>

                  {/* Floating Controls on Click */}
                  {isSelected && (
                    <div
                      onMouseDown={(e) => e.stopPropagation()}
                      className="absolute -top-9 left-1/2 -translate-x-1/2 rpg-glass-panel rounded-full px-2 py-1 flex items-center gap-1.5 text-[11px] whitespace-nowrap z-30 shadow-xl"
                    >
                      {tmpl.shape === 'cone' && (
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
                          title="Girar Cone 45°"
                        >
                          <RotateCw className="w-3 h-3" /> Girar
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          updateActiveMap((m) => ({
                            ...m,
                            templates: m.templates.map((t) =>
                              t.id === tmpl.id
                                ? { ...t, radiusSquares: Math.max(1, t.radiusSquares - 1) }
                                : t
                            ),
                          }))
                        }
                        className="px-1.5 py-0.5 rounded bg-black/40 cursor-pointer"
                        title="Diminuir tamanho"
                      >
                        -
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updateActiveMap((m) => ({
                            ...m,
                            templates: m.templates.map((t) =>
                              t.id === tmpl.id
                                ? { ...t, radiusSquares: Math.min(10, t.radiusSquares + 1) }
                                : t
                            ),
                          }))
                        }
                        className="px-1.5 py-0.5 rounded bg-black/40 cursor-pointer"
                        title="Aumentar tamanho"
                      >
                        +
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          updateActiveMap((m) => ({
                            ...m,
                            templates: m.templates.filter((t) => t.id !== tmpl.id),
                          }));
                          setSelectedTemplateId(null);
                        }}
                        className="px-1.5 py-0.5 rounded text-red-400 hover:bg-red-500/20 cursor-pointer"
                        title="Remover área"
                      >
                        ✕
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
                      if (role === 'player' && tok.hp <= 0) {
                        showTacticalAlert('Seu personagem está caído (0 PV) e não pode se mover!');
                        return;
                      }
                      if (campaign.combat.active && role === 'player') {
                        const isOwnTok =
                          tok.type === 'character' &&
                          myCharacter &&
                          tok.referenceId === myCharacter.id;
                        if (!isOwnTok) {
                          showTacticalAlert('Você só pode mover o seu próprio personagem durante o combate.');
                          return;
                        }
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
                  title={`${tok.name} | CA ${tok.defense} | Clique para abrir ações • Arraste para mover`}
                  className={`absolute flex flex-col items-center justify-center ${
                    pendingAttackChoice
                      ? isOutOfPendingRange || isSelfPendingTarget
                        ? 'cursor-not-allowed opacity-60'
                        : 'cursor-crosshair hover:scale-108'
                      : 'cursor-grab active:cursor-grabbing'
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
                    {/* Engraved Mini CA Shield Pill on Coin Rim */}
                    <span
                      className="absolute -bottom-0.5 -right-1 px-1 rounded bg-[#0c0e16]/95 border border-amber-400/60 text-[8px] font-display font-bold text-amber-200 leading-tight pointer-events-none shadow"
                      title={`Classe de Armadura: ${tok.defense}`}
                    >
                      {tok.defense}
                    </span>
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
                      className={`absolute -top-6 left-1/2 font-chronicle font-black text-lg drop-shadow-[0_2px_6px_rgba(0,0,0,0.95)] pointer-events-none animate-floating-combat ${
                        v.isHeal ? 'text-emerald-400' : 'text-red-500'
                      }`}
                    >
                      {v.isHeal ? `+${v.amount}` : `-${v.amount}`}
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
                            CA {tok.defense}
                            {(role === 'gm' || tok.type === 'character') && ` • PV ${tok.hp}/${tok.maxHp}`}
                          </div>
                        </div>
                        <button
                          onClick={() => setSelectedTokenId(null)}
                          className="text-xs opacity-60 hover:opacity-100 cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>

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

                      {/* GM Controls: Monster Attacks, Death Save Rescue, Quick HP, Hide, Delete */}
                      {role === 'gm' && (
                        <div className="space-y-2 pt-1.5 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
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

            {/* Ruler Line Overlay */}
            {tool === 'ruler' && rulerStart && rulerEnd && (
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
            )}

            {/* GM Secret Map Markers Layer (Hidden Items, Chests, Traps, Secret Passages) */}
            {(activeMap.gmMarkers || []).map((marker) => {
              if (!marker.revealed && role !== 'gm') return null;
              const isSelected = selectedMarkerId === marker.id;
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
                    if (role === 'gm') {
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
                    role === 'gm' ? 'cursor-pointer' : 'pointer-events-none'
                  } ${!marker.revealed ? 'opacity-85' : ''}`}
                  title={
                    role === 'gm'
                      ? `${marker.title} (${marker.revealed ? 'Visível para Jogadores' : 'Escondido — Só o Mestre vê'})`
                      : marker.title
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

                  {/* Marker Nameplate + Secret Status Badge */}
                  <div
                    className="absolute -top-3.5 px-1.5 py-0.2 rounded-xs bg-[#090b12]/95 border text-[8px] font-display font-bold whitespace-nowrap flex items-center gap-1 pointer-events-none shadow"
                    style={{ borderColor: markerAccent, color: '#fef3c7' }}
                  >
                    {!marker.revealed && role === 'gm' && (
                      <span className="text-amber-300">[SECRETO]</span>
                    )}
                    <span>{marker.title}</span>
                  </div>

                  {/* GM Interactive Popover to Rename, Reveal/Hide to Players, or Remove */}
                  {role === 'gm' && isSelected && (
                    <div
                      onMouseDown={(e) => e.stopPropagation()}
                      className="absolute bottom-[110%] left-1/2 -translate-x-1/2 w-52 rpg-glass-panel rounded-lg p-2.5 space-y-2 text-xs shadow-2xl z-50 cursor-default"
                    >
                      <div className="flex items-center justify-between border-b pb-1" style={{ borderColor: 'var(--border-subtle)' }}>
                        <span className="text-[10px] font-display font-bold uppercase tracking-wider text-amber-300">
                          Segredo do Mestre
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
      )}
    </div>
  );
};
