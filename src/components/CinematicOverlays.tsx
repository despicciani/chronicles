import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Crown,
  Dices,
  Feather,
  Flame,
  Heart,
  Lock,
  Moon,
  Music,
  Shield,
  ShieldAlert,
  Sparkles,
  Sun,
  Swords,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { useCampaign } from '../context/CampaignContext';
import { soundEngine } from '../utils/soundEngine';
import {
  buildPreviewDiceForFormula,
  computeCharacterStats,
  evaluateFormula,
  formatSigned,
  isTokenNameHiddenFromPlayers,
  maskHiddenNameForRole,
  maskHiddenNamesInText,
} from '../shared/rulesEngine';
import { OrnateDivider, OrnateFrame, SculptedHealthBar } from './OrnateFrame';
import { TokenPortrait } from './TokenPortrait';
import { UltimateCutInOverlay } from './UltimateCutInOverlay';
import { BlackFlashOverlay } from './BlackFlashOverlay';
import { ExecutionOverlay } from './ExecutionOverlay';

export const CinematicOverlays: React.FC = () => {
  const {
    campaign,
    role,
    myCharacter,
    activeCharacterId,
    activeSkillCheck,
    submitSkillCheckResult,
    dismissSkillCheck,
    fallDamagePrompt,
    rollFallDamageNow,
    useFeatherFallReaction,
    dismissFallDamagePrompt,
    counterspellPrompt,
    triggerCounterspellReaction,
    dismissCounterspellPrompt,
    activeCutIn,
    dismissCutIn,
    activeBlackFlash,
    dismissBlackFlash,
    activeExecution,
    dismissExecution,
    rpSpotlight,
    clearRpSpotlight,
    sendRoll,
    openManualRoll,
    recentRollToasts,
    dismissRollToast,
    activeReward,
    dismissReward,
    activeThemeBanner,
    activeRestBanner,
    dismissRestBanner,
    activeMvpSummary,
    dismissMvpSummary,
    awardXp,
    mapBannerName,
    dismissMapBanner,
    announceBoss,
    resolveAssetUrl,
    screenShakeActive,
    cinematicEnabled,
    triggerScreenShake,
  } = useCampaign();

  const activeChar =
    role === 'player'
      ? myCharacter
      : campaign.characters.find((c) => c.id === activeCharacterId);

  const handleRollRequestedCheck = () => {
    if (!activeSkillCheck || !activeChar) return;
    const stats = computeCharacterStats(activeChar, campaign);
    const skill = campaign.compendium.skills.find(
      (s) => s.id === activeSkillCheck.skillOrAttrId
    );
    const attr = campaign.compendium.attributes.find(
      (a) => a.id === activeSkillCheck.skillOrAttrId
    );

    const bonus = skill
      ? stats.skills[skill.id]?.total ?? 0
      : attr
      ? stats.attributes[attr.id]?.mod ?? 0
      : 0;
    const extraDice = skill ? stats.skills[skill.id]?.diceBonuses || [] : [];
    const formulaStr = `1d20 ${bonus >= 0 ? `+ ${bonus}` : `- ${Math.abs(bonus)}`}${
      extraDice.length > 0 ? ` + ${extraDice.join(' + ')}` : ''
    }`;

    openManualRoll({
      title: `Teste Pedido: ${activeSkillCheck.label}`,
      subtitle:
        activeSkillCheck.hideDc && role !== 'gm'
          ? 'CD Oculta (Mestre revelará o resultado)'
          : `Dificuldade: CD ${activeSkillCheck.dc}`,
      formula: formulaStr,
      displayFormula: formulaStr,
      previewDice: buildPreviewDiceForFormula(formulaStr, 'normal'),
      rollerName: activeChar.name,
      rollerColor: activeChar.playerColor || activeChar.tokenColor,
      diceSkin: activeChar.diceSkin || 'gold',
      allowAdvantageToggle: true,
      advantageMode: 'normal',
      onExecute: (chosenMode) => {
        const res = evaluateFormula(formulaStr, stats, activeChar, {
          advantageMode: chosenMode,
        });
        const passed = res.isCrit || (!res.isFumble && res.total >= activeSkillCheck.dc);

        sendRoll({
          rollerName: activeChar.name,
          rollerRole: role,
          rollerColor: activeChar.playerColor || activeChar.tokenColor,
          diceSkin: activeChar.diceSkin || 'gold',
          title: `Teste Pedido: ${activeSkillCheck.label}`,
          formula: res.resolvedFormula,
          individualRolls: res.individualRolls,
          rolledDice: res.rolledDice,
          d20Natural: res.d20Natural,
          total: res.total,
          isCrit: res.isCrit,
          isFumble: res.isFumble,
          isSecret: false,
          details: activeSkillCheck.hideDc
            ? `Rolagem concluída (CD oculta • ${res.details})`
            : `${passed ? 'SUCESSO' : 'FALHA'} contra CD ${activeSkillCheck.dc} (${res.details})`,
        });

        submitSkillCheckResult({
          checkId: activeSkillCheck.id,
          characterId: activeChar.id,
          characterName: activeChar.name,
          playerColor: activeChar.playerColor || activeChar.tokenColor,
          total: res.total,
          d20: res.d20Natural,
          passed,
        });
      },
    });
  };

  const myResult = activeSkillCheck?.results.find(
    (r) => r.characterId === activeChar?.id
  );

  const activeBoss = campaign.activeBoss;
  const [bossMinimized, setBossMinimized] = useState(false);
  const [skillCheckMinimized, setSkillCheckMinimized] = useState(false);
  const [mvpXpInput, setMvpXpInput] = useState('150');
  const [mvpXpDelivered, setMvpXpDelivered] = useState(false);
  const [cutInEdgeFlashColor, setCutInEdgeFlashColor] = useState<string | null>(null);
  const prevCutInRef = useRef<typeof activeCutIn>(null);
  const cutInFlashTimerRef = useRef<number | null>(null);
  const turnBannerTimerRef = useRef<number | null>(null);
  const bossPhaseTimerRef = useRef<number | null>(null);
  const downedFlashTimerRef = useRef<number | null>(null);
  const damageFlashTimerRef = useRef<number | null>(null);

  // Clean up all persistent animation timers ONLY on unmount (prevents stuck banners/vignettes on state updates!)
  useEffect(() => {
    return () => {
      if (cutInFlashTimerRef.current) window.clearTimeout(cutInFlashTimerRef.current);
      if (turnBannerTimerRef.current) window.clearTimeout(turnBannerTimerRef.current);
      if (bossPhaseTimerRef.current) window.clearTimeout(bossPhaseTimerRef.current);
      if (downedFlashTimerRef.current) window.clearTimeout(downedFlashTimerRef.current);
      if (damageFlashTimerRef.current) window.clearTimeout(damageFlashTimerRef.current);
    };
  }, []);

  // Colored viewport edge flash right as an Ultimate Cut-In dissolves back into the map!
  useEffect(() => {
    const prev = prevCutInRef.current;
    prevCutInRef.current = activeCutIn;
    if (prev && !activeCutIn) {
      setCutInEdgeFlashColor(prev.color || '#38bdf8');
      if (cutInFlashTimerRef.current) window.clearTimeout(cutInFlashTimerRef.current);
      cutInFlashTimerRef.current = window.setTimeout(() => {
        setCutInEdgeFlashColor(null);
        cutInFlashTimerRef.current = null;
      }, 700);
    }
  }, [activeCutIn]);

  useEffect(() => {
    setSkillCheckMinimized(false);
  }, [activeSkillCheck?.id]);

  useEffect(() => {
    setMvpXpDelivered(false);
  }, [activeMvpSummary?.id]);

  // Allow Escape key to skip/close active cinematic modals
  useEffect(() => {
    if (!activeCutIn && !activeReward && !activeMvpSummary) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (activeCutIn) {
        dismissCutIn();
      } else if (activeReward) {
        dismissReward();
      } else if (activeMvpSummary) {
        dismissMvpSummary();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeCutIn, activeReward, activeMvpSummary, dismissCutIn, dismissReward, dismissMvpSummary]);

  // Automatic "É O SEU TURNO!" Banner + Turn Herald SFX when combat turn changes
  const [turnBanner, setTurnBanner] = useState<{
    id: string;
    isMyTurn: boolean;
    name: string;
    round: number;
    color: string;
  } | null>(null);
  const lastTurnKeyRef = useRef<string>('');

  useEffect(() => {
    const combat = campaign.combat;
    if (!combat.active || combat.combatants.length === 0) {
      lastTurnKeyRef.current = '';
      if (turnBannerTimerRef.current) {
        window.clearTimeout(turnBannerTimerRef.current);
        turnBannerTimerRef.current = null;
      }
      setTurnBanner(null);
      return;
    }
    const activeCb = combat.combatants[combat.currentTurnIndex];
    if (!activeCb) return;
    const key = `${combat.round}-${combat.currentTurnIndex}-${activeCb.id}`;
    if (key === lastTurnKeyRef.current) return;
    lastTurnKeyRef.current = key;

    const isMyTurn =
      role === 'player' &&
      Boolean(
        myCharacter &&
          ((activeCb.referenceId && activeCb.referenceId === myCharacter.id) ||
            activeCb.controlledByCharacterId === myCharacter.id)
      );
    if (isMyTurn) {
      soundEngine.playSfxPreset('turn');
    }
    if (!cinematicEnabled) return;
    if (isMyTurn || role === 'gm') {
      const id = `turn-${Date.now()}`;
      setTurnBanner({
        id,
        isMyTurn,
        name: activeCb.name,
        round: combat.round,
        color: isMyTurn ? '#e8c266' : activeCb.type === 'monster' ? '#dc2626' : '#d4aa48',
      });
      if (turnBannerTimerRef.current) window.clearTimeout(turnBannerTimerRef.current);
      turnBannerTimerRef.current = window.setTimeout(() => {
        setTurnBanner((curr) => (curr?.id === id ? null : curr));
        turnBannerTimerRef.current = null;
      }, isMyTurn ? 3400 : 2200);
    }
  }, [campaign.combat, cinematicEnabled, myCharacter, role]);

  // Boss Phase Transition Cinematic Banner (auto-triggers when any visible Boss enters Phase 2, 3, ...)
  const [bossPhaseBanner, setBossPhaseBanner] = useState<{
    id: string;
    bossName: string;
    phase: number;
    phaseTitle?: string;
  } | null>(null);
  const bossPhaseMapRef = useRef<Record<string, number>>({});

  useEffect(() => {
    for (const m of campaign.maps) {
      for (const tok of m.tokens) {
        if (!tok.isBoss || (tok.isHidden && role !== 'gm')) continue;
        const curPhase = tok.bossPhase || 1;
        const prevPhase = bossPhaseMapRef.current[tok.id];
        bossPhaseMapRef.current[tok.id] = curPhase;
        if (prevPhase !== undefined && curPhase > prevPhase && curPhase >= 2) {
          if (cinematicEnabled) {
            const bid = `bphase-${Date.now()}`;
            const isHiddenName =
              role !== 'gm' && isTokenNameHiddenFromPlayers(tok, campaign);
            const displayName = isHiddenName ? '???' : tok.name;
            setBossPhaseBanner({
              id: bid,
              bossName: displayName,
              phase: curPhase,
              phaseTitle: isHiddenName ? undefined : tok.bossPhase2Title,
            });
            triggerScreenShake('heavy');
            if (bossPhaseTimerRef.current) window.clearTimeout(bossPhaseTimerRef.current);
            bossPhaseTimerRef.current = window.setTimeout(() => {
              setBossPhaseBanner((curr) => (curr?.id === bid ? null : curr));
              bossPhaseTimerRef.current = null;
            }, 3800);
          }
          soundEngine.playSfxPreset('crit');
        }
      }
    }
  }, [campaign, campaign.maps, cinematicEnabled, role, triggerScreenShake]);

  // Downed (0 PV) & Damage Taken Crimson Edge Vignette Pulse for Player
  const [downedFlashKey, setDownedFlashKey] = useState<number | null>(null);
  const [damageFlashKey, setDamageFlashKey] = useState<number | null>(null);
  const prevMyHpRef = useRef<number | undefined>(myCharacter?.hp);
  useEffect(() => {
    const curHp = myCharacter?.hp;
    const prevHp = prevMyHpRef.current;
    prevMyHpRef.current = curHp;
    if (!cinematicEnabled || role !== 'player' || prevHp === undefined || curHp === undefined) return;
    if (prevHp > 0 && curHp <= 0) {
      const k = Date.now();
      setDownedFlashKey(k);
      triggerScreenShake('heavy');
      if (downedFlashTimerRef.current) window.clearTimeout(downedFlashTimerRef.current);
      downedFlashTimerRef.current = window.setTimeout(() => {
        setDownedFlashKey((c) => (c === k ? null : c));
        downedFlashTimerRef.current = null;
      }, 1250);
      return;
    }
    if (curHp < prevHp && curHp > 0) {
      const k = Date.now();
      setDamageFlashKey(k);
      if (prevHp - curHp >= 10) {
        triggerScreenShake('light');
      }
      if (damageFlashTimerRef.current) window.clearTimeout(damageFlashTimerRef.current);
      damageFlashTimerRef.current = window.setTimeout(() => {
        setDamageFlashKey((c) => (c === k ? null : c));
        damageFlashTimerRef.current = null;
      }, 460);
    }
  }, [cinematicEnabled, myCharacter?.hp, role, triggerScreenShake]);

  return (
    <>
      {/* 0. CRITICAL HIT & DOWNED CINEMATIC EDGE VIGNETTES */}
      {/* 0. CRIT & DAMAGE EDGE FLASHES (gated by Cinematic toggle) */}
      {cinematicEnabled && damageFlashKey && (
        <div
          key={`dmg-flash-${damageFlashKey}`}
          className="fixed inset-0 pointer-events-none z-[58] animate-damage-edge-flash"
          style={{
            boxShadow: 'inset 0 0 90px 24px rgba(220, 38, 38, 0.72)',
          }}
        />
      )}
      {cinematicEnabled && screenShakeActive && (
        <div
          className="fixed inset-0 z-40 pointer-events-none animate-crit-edge-flash"
          style={{
            boxShadow: 'inset 0 0 95px 24px rgba(245, 158, 11, 0.55), inset 0 0 42px 8px rgba(220, 38, 38, 0.45)',
          }}
        />
      )}
      {cinematicEnabled && downedFlashKey !== null && (
        <div
          key={downedFlashKey}
          className="fixed inset-0 z-40 pointer-events-none animate-downed-edge-flash"
          style={{
            boxShadow: 'inset 0 0 130px 42px rgba(185, 28, 28, 0.78)',
          }}
        />
      )}

      {/* 0Z. BOSS PHASE TRANSITION CINEMATIC BANNER */}
      {cinematicEnabled && bossPhaseBanner && (
        <div
          onClick={() => setBossPhaseBanner(null)}
          className="fixed top-[148px] left-1/2 -translate-x-1/2 z-50 pointer-events-auto cursor-pointer animate-herald-unfurl"
        >
          <OrnateFrame
            accentColor="#9e2427"
            cornerSize={16}
            className="rpg-panel rpg-grain rounded-lg px-8 py-3.5 text-center border-[#9e2427]/80"
          >
            <div className="text-[10px] font-display font-bold uppercase tracking-[0.26em] text-[#e07a7d] flex items-center justify-center gap-2">
              <Crown className="w-3.5 h-3.5 text-[#d4ad5c]" />
              <span>Fase {bossPhaseBanner.phase} Despertada</span>
              <Crown className="w-3.5 h-3.5 text-[#d4ad5c]" />
            </div>
            <div className="font-chronicle font-black text-lg sm:text-xl tracking-[0.14em] uppercase chronicle-gold-text mt-0.5">
              {bossPhaseBanner.bossName}
            </div>
            <div className="h-px w-44 mx-auto my-1.5 bg-gradient-to-r from-transparent via-[#9e2427] to-transparent animate-herald-rule" />
            {bossPhaseBanner.phaseTitle && (
              <div className="text-xs font-lore italic text-[#e6c4c6]">
                “{bossPhaseBanner.phaseTitle}”
              </div>
            )}
          </OrnateFrame>
        </div>
      )}

      {/* 0A. "É O SEU TURNO!" / Turn Herald Banner */}
      {cinematicEnabled && turnBanner && (
        <div
          onClick={() => setTurnBanner(null)}
          className="fixed top-[146px] left-1/2 -translate-x-1/2 z-45 pointer-events-auto cursor-pointer animate-herald-unfurl"
        >
          <OrnateFrame
            accentColor={turnBanner.color}
            cornerSize={12}
            className="rpg-panel rpg-grain rounded-lg px-6 py-2.5 flex items-center gap-3.5"
          >
            <Swords className="w-4 h-4 shrink-0" style={{ color: turnBanner.color }} />
            <div className="text-center leading-tight">
              <div
                className="font-chronicle font-black text-sm sm:text-base tracking-[0.18em] uppercase"
                style={{ color: turnBanner.isMyTurn ? '#f4de9e' : '#ece4d5' }}
              >
                {turnBanner.isMyTurn ? 'É o Seu Turno' : `Turno de ${turnBanner.name}`}
              </div>
              <div className="h-px w-full my-1 bg-gradient-to-r from-transparent via-[#b89146]/70 to-transparent animate-herald-rule" />
              <div className="text-[10px] font-display uppercase tracking-[0.14em] text-[#a69b88]">
                {turnBanner.isMyTurn
                  ? `${turnBanner.name} • Rodada ${turnBanner.round} • Espaço para encerrar`
                  : `Rodada ${turnBanner.round}`}
              </div>
            </div>
            <Swords className="w-4 h-4 shrink-0 scale-x-[-1]" style={{ color: turnBanner.color }} />
          </OrnateFrame>
        </div>
      )}

      {/* 0B. PARTY REST CINEMATIC BANNER (Short / Long Rest) */}
      {activeRestBanner && (
        <div
          onClick={dismissRestBanner}
          className="fixed top-[60px] left-1/2 -translate-x-1/2 z-46 pointer-events-auto cursor-pointer animate-herald-unfurl"
        >
          <OrnateFrame
            accentColor={activeRestBanner.kind === 'long' ? '#5f78c4' : '#b89146'}
            cornerSize={14}
            className="rpg-panel rpg-grain rounded-lg px-6 py-3 flex items-center gap-3.5 max-w-md"
          >
            {activeRestBanner.kind === 'long' ? (
              <Moon className="w-5 h-5 text-[#8ea4e6] shrink-0" />
            ) : (
              <div className="relative shrink-0">
                <Flame className="w-5 h-5 text-[#d4ad5c]" />
                <Sun className="w-3 h-3 text-[#f0d89d] absolute -top-1 -right-1" />
              </div>
            )}
            <div className="leading-snug">
              <div className="font-display font-bold text-xs tracking-[0.16em] uppercase text-[#ece4d5]">
                {activeRestBanner.kind === 'long'
                  ? 'Descanso Longo Concluído'
                  : 'Descanso Curto Concluído'}
              </div>
              <div className="text-[11px] text-[#a69b88] mt-0.5">
                {activeRestBanner.summary}
              </div>
            </div>
          </OrnateFrame>
        </div>
      )}

      {/* 0C. COMBAT VICTORY & MVP SUMMARY CARD */}
      {activeMvpSummary && (
        <div
          data-modal-overlay="true"
          data-sub-overlay="true"
          onClick={dismissMvpSummary}
          className="fixed inset-0 z-55 bg-[#040508]/82 backdrop-blur-[3px] flex items-center justify-center p-4 pointer-events-auto"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-lg w-full animate-modal-unfurl"
          >
            <OrnateFrame
              accentColor="#b89146"
              cornerSize={16}
              className="rpg-panel rpg-grain rounded-lg p-5 space-y-4"
            >
              <div className="flex items-start justify-between gap-3 border-b pb-3" style={{ borderColor: 'var(--border-subtle)' }}>
                <div className="flex items-center gap-2.5">
                  <Crown className="w-5 h-5 text-[#d4ad5c] shrink-0" />
                  <div>
                    <div className="font-chronicle font-black text-lg tracking-[0.14em] uppercase chronicle-gold-text">
                      Combate Encerrado
                    </div>
                    <div className="text-[11px] text-[#a69b88] font-display">
                      {activeMvpSummary.rounds}{' '}
                      {activeMvpSummary.rounds === 1 ? 'rodada' : 'rodadas'} •{' '}
                      {activeMvpSummary.enemiesDefeated}{' '}
                      {activeMvpSummary.enemiesDefeated === 1
                        ? 'inimigo derrotado'
                        : 'inimigos derrotados'}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={dismissMvpSummary}
                  className="rpg-card w-8 h-8 rounded flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* MVP Highlights */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-center">
                <div className="rpg-card rounded p-2.5 border-[#9e2427]/40">
                  <div className="text-[9px] font-display uppercase tracking-wider text-[#e07a7d] flex items-center justify-center gap-1">
                    <Swords className="w-3 h-3" /> Maior Dano
                  </div>
                  <div className="font-display font-bold text-xs text-[#ece4d5] truncate mt-1">
                    {activeMvpSummary.topDamageDealer?.name
                      ? maskHiddenNameForRole(activeMvpSummary.topDamageDealer.name, role, campaign)
                      : '—'}
                  </div>
                  <div className="font-mono-dice font-bold text-sm text-[#e0585c]">
                    {activeMvpSummary.topDamageDealer
                      ? `${activeMvpSummary.topDamageDealer.value} dano`
                      : '0'}
                  </div>
                </div>
                <div className="rpg-card rounded p-2.5 border-[#2f8556]/40">
                  <div className="text-[9px] font-display uppercase tracking-wider text-[#74c997] flex items-center justify-center gap-1">
                    <Heart className="w-3 h-3" /> Maior Cura
                  </div>
                  <div className="font-display font-bold text-xs text-[#ece4d5] truncate mt-1">
                    {activeMvpSummary.topHealer?.name
                      ? maskHiddenNameForRole(activeMvpSummary.topHealer.name, role, campaign)
                      : '—'}
                  </div>
                  <div className="font-mono-dice font-bold text-sm text-[#6fd49a]">
                    {activeMvpSummary.topHealer ? `+${activeMvpSummary.topHealer.value} PV` : '0'}
                  </div>
                </div>
                <div className="rpg-card rounded p-2.5 border-[#b89146]/45">
                  <div className="text-[9px] font-display uppercase tracking-wider text-[#d4ad5c] flex items-center justify-center gap-1">
                    <Sparkles className="w-3 h-3" /> Críticos
                  </div>
                  <div className="font-display font-bold text-xs text-[#ece4d5] truncate mt-1">
                    {activeMvpSummary.topCrits?.name
                      ? maskHiddenNameForRole(activeMvpSummary.topCrits.name, role, campaign)
                      : '—'}
                  </div>
                  <div className="font-mono-dice font-bold text-sm text-[#e8c683]">
                    {activeMvpSummary.topCrits ? `${activeMvpSummary.topCrits.value}×` : '0'}
                  </div>
                </div>
              </div>

              {/* Participant Scoreboard */}
              {activeMvpSummary.participants.length > 0 && (
                <div className="space-y-1 max-h-44 overflow-y-auto pr-1">
                  <div className="text-[10px] font-display uppercase tracking-wider text-amber-300/80">
                    Placar da Batalha
                  </div>
                  {activeMvpSummary.participants.map((p) => (
                    <div
                      key={p.name}
                      className="rpg-card rounded-md px-3 py-1.5 flex items-center justify-between text-xs"
                    >
                      <span className="flex items-center gap-2 font-display font-bold truncate">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: p.color }}
                        />
                        <span className="truncate">
                          {maskHiddenNameForRole(p.name, role, campaign)}
                        </span>
                      </span>
                      <span className="font-mono-dice text-[11px] flex items-center gap-3 shrink-0">
                        <span className="text-red-300">{p.damage} dano</span>
                        {p.healing > 0 && (
                          <span className="text-emerald-300">+{p.healing} cura</span>
                        )}
                        {p.crits > 0 && <span className="text-amber-300">{p.crits} crit</span>}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Footer */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                {role === 'gm' ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      step={25}
                      value={mvpXpInput}
                      onChange={(e) => setMvpXpInput(e.target.value)}
                      disabled={mvpXpDelivered}
                      className="rpg-input w-20 py-1 px-2 text-xs font-mono-dice text-center"
                      placeholder="XP"
                      title="Quantidade de XP para entregar ao grupo"
                    />
                    <button
                      type="button"
                      disabled={mvpXpDelivered || Math.max(0, Number(mvpXpInput) || 0) <= 0}
                      onClick={() => {
                        const amount = Math.max(0, Math.floor(Number(mvpXpInput) || 0));
                        if (amount > 0) {
                          awardXp('all', amount);
                          setMvpXpDelivered(true);
                        }
                      }}
                      className="rpg-card px-2.5 py-1.5 rounded-md text-[11px] font-display font-bold text-amber-200 hover:border-amber-400 cursor-pointer disabled:opacity-45"
                    >
                      {mvpXpDelivered ? '✓ XP Entregue' : 'Entregar XP ao Grupo'}
                    </button>
                  </div>
                ) : (
                  <div />
                )}
                <button
                  type="button"
                  onClick={dismissMvpSummary}
                  className="rpg-btn-primary px-4 py-1.5 rounded-md text-xs font-display font-bold cursor-pointer"
                >
                  Continuar Aventura
                </button>
              </div>
            </OrnateFrame>
          </div>
        </div>
      )}

      {/* 1. COMPACT GOTHIC BOSS BAR (Anchored cleanly bottom-left above map bar — zero overlap with Right Chronicle) */}
      {activeBoss && activeBoss.active && (() => {
        const linkedBossTok = campaign.maps
          .flatMap((m) => m.tokens)
          .find(
            (t) =>
              t.id === activeBoss.id ||
              (t.isBoss && t.name.toLowerCase() === activeBoss.name.toLowerCase())
          );
        if (role !== 'gm' && linkedBossTok?.isHidden) {
          const spotted = Boolean(
            myCharacter && (linkedBossTok.visibleToCharacterIds || []).includes(myCharacter.id)
          );
          if (!spotted) return null;
        }
        const displayBossName = maskHiddenNameForRole(
          activeBoss.name,
          role,
          campaign,
          linkedBossTok?.id || activeBoss.id
        );
        const bossNameHidden = role !== 'gm' && displayBossName === '???';
        return (
        <div className="fixed bottom-[96px] left-3 z-25 w-[310px] sm:w-[340px] pointer-events-auto">
          {bossMinimized ? (
            <button
              type="button"
              onClick={() => setBossMinimized(false)}
              className="rpg-glass-panel rounded-md px-3 py-1.5 flex items-center gap-2 border-[#9e2427]/65 cursor-pointer hover:border-[#d4ad5c]"
              title="Expandir barra do Chefe"
            >
              <Crown className="w-3.5 h-3.5 text-[#d6575b]" />
              <span className="font-chronicle font-bold text-xs text-[#f2b3b5] truncate max-w-[180px]">
                {displayBossName}
              </span>
              <ChevronUp className="w-3.5 h-3.5 text-[#d4ad5c]" />
            </button>
          ) : (
            <OrnateFrame
              accentColor="#9e2427"
              cornerSize={12}
              className="rpg-panel rpg-grain rounded-lg px-3.5 py-2 animate-modal-unfurl"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <TokenPortrait
                    name={displayBossName}
                    imageUrl={activeBoss.imageUrl}
                    playerColor={activeBoss.color || '#dc2626'}
                    frameStyle="crimson"
                    sizePx={36}
                    isDead={activeBoss.hp <= 0}
                  />
                  <div className="min-w-0">
                    <div className="font-chronicle font-black text-xs tracking-wider text-red-200 uppercase truncate">
                      {displayBossName}
                    </div>
                    {!bossNameHidden && (
                      <div className="text-[10px] font-display uppercase tracking-wider text-amber-300/80 truncate">
                        {activeBoss.title}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0 text-[11px]">
                  {role === 'gm' && (
                    <>
                      <button
                        onClick={() =>
                          announceBoss({
                            ...activeBoss,
                            hp: Math.max(0, activeBoss.hp - 10),
                          })
                        }
                        className="px-1.5 py-0.5 rounded bg-red-950/85 border border-red-500/40 hover:bg-red-800 text-red-100 cursor-pointer"
                      >
                        -10
                      </button>
                      <button
                        onClick={() =>
                          announceBoss({
                            ...activeBoss,
                            hp: Math.min(activeBoss.maxHp, activeBoss.hp + 10),
                          })
                        }
                        className="px-1.5 py-0.5 rounded bg-emerald-950/85 border border-emerald-500/40 hover:bg-emerald-800 text-emerald-100 cursor-pointer"
                      >
                        +10
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setBossMinimized(true)}
                    className="rpg-card p-1 rounded text-amber-300 cursor-pointer"
                    title="Minimizar Barra de Chefe"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                  {role === 'gm' && (
                    <button
                      onClick={() => announceBoss(null)}
                      className="rpg-card p-1 rounded text-red-300 cursor-pointer"
                      title="Ocultar Barra de Chefe"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-2">
                <SculptedHealthBar
                  hp={activeBoss.hp}
                  maxHp={activeBoss.maxHp}
                  variant="boss"
                  heightClass="h-2.5"
                  label={role === 'gm' ? `${activeBoss.hp} / ${activeBoss.maxHp} PV` : undefined}
                />
              </div>
            </OrnateFrame>
          )}
        </div>
        );
      })()}

      {/* 2. CINEMATIC LOCATION BANNER */}
      {mapBannerName && (
        <div
          key={mapBannerName}
          onClick={dismissMapBanner}
          title="Clique para fechar"
          className="fixed top-28 left-1/2 -translate-x-1/2 z-40 pointer-events-auto cursor-pointer animate-modal-unfurl"
        >
          <OrnateFrame
            accentColor="#d4aa48"
            cornerSize={18}
            className="rpg-glass-panel px-12 py-3 rounded-lg text-center shadow-2xl relative overflow-hidden"
          >
            <div className="text-[10px] font-display uppercase tracking-[0.3em] text-amber-300/80">
              Você Chegou a
            </div>
            <div className="font-chronicle font-bold text-2xl tracking-wider chronicle-gold-text mt-0.5">
              {mapBannerName}
            </div>
            <OrnateDivider className="mt-1.5" />
            <div className="absolute bottom-0 inset-x-0 h-0.5 bg-black/50">
              <div
                className="h-full animate-banner-drain"
                style={{ background: 'linear-gradient(90deg, #9a7020, #fde047)' }}
              />
            </div>
          </OrnateFrame>
        </div>
      )}

      {/* 3. CHARACTER THEME MUSIC PLAYING BANNER */}
      {activeThemeBanner && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 pointer-events-none animate-modal-unfurl">
          <OrnateFrame
            accentColor={activeThemeBanner.characterColor}
            cornerSize={14}
            className="rpg-glass-panel px-6 py-2.5 rounded-lg flex items-center gap-3 shadow-2xl"
          >
            <div
              className="w-8 h-8 rounded-md rpg-socket flex items-center justify-center"
            >
              <Music className="w-4 h-4" style={{ color: activeThemeBanner.characterColor }} />
            </div>
            <div>
              <div className="text-[10px] font-display uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>
                Tema Épico em Execução
              </div>
              <div className="font-display font-bold text-sm" style={{ color: activeThemeBanner.characterColor }}>
                {activeThemeBanner.characterName} — {activeThemeBanner.title}
              </div>
            </div>
          </OrnateFrame>
        </div>
      )}

      {/* 3B. DISCREET CORNER ROLL TOASTS FOR OTHER PLAYERS' ROLLS (Never hijacks screen!) */}
      {recentRollToasts.length > 0 && (
        <div className="fixed top-[92px] right-3 z-[32] w-[264px] space-y-1.5 pointer-events-none">
          {recentRollToasts.map((entry) => {
            const accent = entry.rollerColor || '#d4ad5c';
            return (
              <div
                key={entry.id}
                onClick={() => dismissRollToast(entry.id)}
                title="Clique para fechar"
                className={`pointer-events-auto cursor-pointer rounded-md px-2.5 py-2 bg-[#0d1018]/92 backdrop-blur-sm border shadow-[0_10px_28px_rgba(0,0,0,0.75)] flex items-center justify-between gap-2 animate-ui-enter ${
                  entry.isCrit
                    ? 'border-[#d4ad5c]/80'
                    : entry.isFumble
                      ? 'border-[#9e2427]/80'
                      : 'border-[#b89146]/30'
                }`}
                style={{ borderLeftWidth: '3px', borderLeftColor: accent }}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[10px]">
                    <Dices className="w-3 h-3 shrink-0" style={{ color: accent }} />
                    <span className="font-display font-bold truncate" style={{ color: accent }}>
                      {maskHiddenNameForRole(entry.rollerName, role, campaign)}
                    </span>
                    {entry.isCrit && (
                      <span className="px-1 py-0.2 rounded bg-amber-950/80 border border-amber-400/50 text-[8px] font-display font-bold text-amber-200 uppercase shrink-0">
                        Crit!
                      </span>
                    )}
                    {entry.isFumble && (
                      <span className="px-1 py-0.2 rounded bg-red-950/80 border border-red-500/50 text-[8px] font-display font-bold text-red-200 uppercase shrink-0">
                        1 Nat
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-[#ded6c6] truncate mt-0.5">
                    {maskHiddenNamesInText(entry.title, role, campaign)}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div
                    className={`font-mono-dice font-black text-lg leading-none ${
                      entry.isCrit
                        ? 'text-amber-300'
                        : entry.isFumble
                          ? 'text-red-400'
                          : 'text-[#f4ede0]'
                    }`}
                  >
                    {entry.total}
                  </div>
                  {entry.damageTotal !== undefined && entry.damageTotal > 0 && (
                    <div className="text-[9px] font-mono-dice text-red-300 leading-tight mt-0.5">
                      {entry.damageType?.toLowerCase() === 'cura'
                        ? `+${entry.damageTotal} PV`
                        : `${entry.damageTotal} dano`}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 4. "O MESTRE PEDE UM TESTE!" POP-UP (#1) — Targeted, Hidden DC, Group Check Verdict */}
      {activeSkillCheck && (() => {
        const hasExplicitTargets =
          Array.isArray(activeSkillCheck.targetCharacterIds) &&
          activeSkillCheck.targetCharacterIds.length > 0;
        const isMyHeroTargeted =
          role === 'gm' ||
          !hasExplicitTargets ||
          Boolean(activeChar && activeSkillCheck.targetCharacterIds!.includes(activeChar.id));
        if (!isMyHeroTargeted) return null;

        const currentMap =
          campaign.maps.find((m) => m.id === campaign.activeMapId) || campaign.maps[0];
        const mapHeroIds = new Set(
          (currentMap?.tokens || [])
            .filter((t) => t.type === 'character' && t.referenceId)
            .map((t) => t.referenceId!)
        );
        const mapHeroes = campaign.characters.filter((c) => mapHeroIds.has(c.id));
        const expectedHeroes = hasExplicitTargets
          ? campaign.characters.filter((c) => activeSkillCheck.targetCharacterIds!.includes(c.id))
          : mapHeroes.length > 0
            ? mapHeroes
            : campaign.characters.filter((c) => Boolean(c.ownerPlayerId)).length > 0
              ? campaign.characters.filter((c) => Boolean(c.ownerPlayerId))
              : campaign.characters;
        const rolledIdSet = new Set(activeSkillCheck.results.map((r) => r.characterId));
        const pendingHeroes = expectedHeroes.filter((c) => !rolledIdSet.has(c.id));
        const rolledCount = activeSkillCheck.results.length;
        const totalExpected = Math.max(rolledCount, expectedHeroes.length);
        const allDone = totalExpected > 0 && pendingHeroes.length === 0;
        const passedCount = activeSkillCheck.results.filter((r) => r.passed).length;
        const groupCheckPassed =
          totalExpected > 0 && passedCount >= Math.ceil(totalExpected / 2);
        const revealOutcome = role === 'gm' || !activeSkillCheck.hideDc;
        const canThisUserRoll = Boolean(
          activeChar &&
            !myResult &&
            (!hasExplicitTargets || activeSkillCheck.targetCharacterIds!.includes(activeChar.id))
        );

        return (
          <div className="fixed bottom-6 left-6 z-40 pointer-events-auto animate-ui-enter">
            {skillCheckMinimized ? (
              <div className="rpg-glass-panel rounded-xl px-3 py-2 shadow-2xl border border-[#b89146]/45 flex items-center gap-2.5">
                <Crown className="w-4 h-4 text-amber-400 shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-display font-bold text-[#ece4d5] truncate max-w-[165px]">
                    {activeSkillCheck.label}
                  </div>
                  <div className="text-[10px] text-[#a69b88] font-mono-dice">
                    {rolledCount}/{totalExpected} rolaram
                    {myResult ? ` • Você: ${myResult.total}` : ''}
                  </div>
                </div>
                {canThisUserRoll && (
                  <button
                    type="button"
                    onClick={handleRollRequestedCheck}
                    className="rpg-btn-primary px-2.5 py-1 rounded-md text-[11px] font-display font-bold flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    <Dices className="w-3.5 h-3.5" /> Rolar
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSkillCheckMinimized(false)}
                  className="rpg-card p-1 rounded text-amber-300 cursor-pointer shrink-0"
                  title="Expandir Teste do Grupo"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
                {role === 'gm' && (
                  <button
                    type="button"
                    onClick={dismissSkillCheck}
                    className="rpg-card p-1 rounded text-red-300 cursor-pointer shrink-0"
                    title="Encerrar Pedido de Teste"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ) : (
              <div className="rpg-glass-panel rounded-2xl p-4 space-y-3 shadow-2xl w-80 sm:w-96">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Crown className="w-5 h-5 text-amber-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] uppercase tracking-widest text-amber-300 font-bold">
                          {activeSkillCheck.isGroupCheck ? 'Teste em Grupo' : 'Chamado do Mestre'}
                        </span>
                        <span
                          className={`px-1.5 py-0.2 rounded text-[9px] font-mono-dice font-bold ${
                            allDone
                              ? 'bg-emerald-950/80 border border-emerald-500/50 text-emerald-300'
                              : 'bg-amber-950/70 border border-amber-500/40 text-amber-200'
                          }`}
                        >
                          {rolledCount}/{totalExpected}
                        </span>
                        {activeSkillCheck.targetScopeLabel && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] bg-black/45 border border-white/15 text-[#c7bda9]">
                            {activeSkillCheck.targetScopeLabel}
                          </span>
                        )}
                      </div>
                      <h4 className="font-display font-bold text-base leading-tight truncate">
                        Teste de {activeSkillCheck.label}
                      </h4>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setSkillCheckMinimized(true)}
                      className="rpg-card p-1 rounded text-amber-300 cursor-pointer"
                      title="Recolher para o canto"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                    {role === 'gm' && (
                      <button
                        type="button"
                        onClick={dismissSkillCheck}
                        className="rpg-card p-1 rounded cursor-pointer"
                        title="Encerrar Pedido de Teste"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {revealOutcome ? (
                  <div className="text-xs text-amber-300/90 font-semibold flex items-center justify-between">
                    <span>Dificuldade (CD): {activeSkillCheck.dc}</span>
                    {activeSkillCheck.hideDc && role === 'gm' && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-950/75 border border-purple-400/45 text-purple-200 text-[9px]">
                        <Lock className="w-2.5 h-2.5" /> CD Oculta aos jogadores
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="text-[11px] text-purple-200/90 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-purple-300" />
                    <span>Dificuldade (CD) oculta — o Mestre narrará o desfecho.</span>
                  </div>
                )}

                {/* Official D&D 5e Group Check Verdict (>= 50% pass) */}
                {activeSkillCheck.isGroupCheck && revealOutcome && rolledCount > 0 && (
                  <div
                    className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-display font-bold flex items-center justify-between ${
                      allDone
                        ? groupCheckPassed
                          ? 'bg-emerald-950/75 border-emerald-400/60 text-emerald-200'
                          : 'bg-red-950/75 border-red-400/60 text-red-200'
                        : 'bg-amber-950/55 border-amber-400/40 text-amber-200'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" />
                      {allDone
                        ? groupCheckPassed
                          ? 'SUCESSO DO GRUPO!'
                          : 'FALHA DO GRUPO'
                        : 'Teste em Grupo (meta: ≥50%)'}
                    </span>
                    <span className="font-mono-dice">
                      {passedCount}/{totalExpected} passaram
                    </span>
                  </div>
                )}

                {/* Giant 1-click button for player */}
                {canThisUserRoll && activeChar && (
                  <button
                    onClick={handleRollRequestedCheck}
                    className="rpg-btn-primary w-full py-3 rounded-xl text-sm flex items-center justify-center gap-2 cursor-pointer shadow-lg"
                  >
                    <Dices className="w-5 h-5" />
                    <span>
                      Rolar {activeSkillCheck.label} Agora (
                      {(() => {
                        const stats = computeCharacterStats(activeChar, campaign);
                        const sk = stats.skills[activeSkillCheck.skillOrAttrId];
                        const at = stats.attributes[activeSkillCheck.skillOrAttrId];
                        return formatSigned(sk ? sk.total : at ? at.mod : 0);
                      })()}
                      )
                    </span>
                  </button>
                )}

                {myResult && (
                  <div
                    className={`p-2.5 rounded-lg text-xs font-bold flex items-center justify-between gap-2 ${
                      !revealOutcome
                        ? 'bg-indigo-950/60 border border-indigo-400/45 text-indigo-200'
                        : myResult.passed
                          ? 'bg-emerald-950/60 border border-emerald-500/50 text-emerald-300'
                          : 'bg-red-950/60 border border-red-500/50 text-red-300'
                    }`}
                  >
                    <span>Seu Resultado: {myResult.total}</span>
                    <div className="flex items-center gap-2">
                      {revealOutcome ? (
                        <span className="flex items-center gap-1">
                          {myResult.passed ? (
                            <>
                              <CheckCircle2 className="w-4 h-4" /> PASSOU!
                            </>
                          ) : (
                            <>
                              <ShieldAlert className="w-4 h-4" /> FALHOU
                            </>
                          )}
                        </span>
                      ) : (
                        <span className="text-[10px] opacity-85">Aguardando Mestre</span>
                      )}
                      <button
                        type="button"
                        onClick={() => setSkillCheckMinimized(true)}
                        className="px-1.5 py-0.5 rounded bg-black/35 border border-white/15 text-[10px] font-display text-[#ece4d5] hover:bg-black/55 cursor-pointer"
                        title="Recolher enquanto os outros rolam"
                      >
                        Recolher
                      </button>
                    </div>
                  </div>
                )}

                {/* Live Results Feed (Já Rolaram) */}
                {activeSkillCheck.results.length > 0 && (
                  <div
                    className="space-y-1 pt-1.5 border-t max-h-36 overflow-y-auto"
                    style={{ borderColor: 'var(--border-subtle)' }}
                  >
                    <div className="text-[10px] font-display uppercase tracking-wider text-emerald-300/80">
                      Já Rolaram ({activeSkillCheck.results.length})
                    </div>
                    {activeSkillCheck.results.map((r) => (
                      <div
                        key={r.characterId}
                        className="flex items-center justify-between text-xs px-2 py-1 rounded bg-black/25"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: r.playerColor }}
                          />
                          <span className="font-semibold truncate">{r.characterName}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono-dice font-bold">{r.total}</span>
                          {revealOutcome && (
                            <span
                              className={
                                r.passed ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'
                              }
                            >
                              {r.passed ? '✓' : '✕'}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Pending Roster (Falta Rolar) */}
                {pendingHeroes.length > 0 && (
                  <div
                    className="space-y-1.5 pt-1.5 border-t"
                    style={{ borderColor: 'var(--border-subtle)' }}
                  >
                    <div className="text-[10px] font-display uppercase tracking-wider text-amber-300/75 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Aguardando ({pendingHeroes.length})
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {pendingHeroes.map((hero) => (
                        <span
                          key={hero.id}
                          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] bg-black/35 border border-[#b89146]/25 text-[#c8bfb0]"
                        >
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{
                              backgroundColor: hero.playerColor || hero.tokenColor || '#94a3b8',
                            }}
                          />
                          <span className="truncate max-w-[110px]">{hero.name}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* 5. MAGIC CARD REWARD ANIMATION (#2) */}
      {activeReward && (
        <div
          data-modal-overlay="true"
          data-sub-overlay="true"
          onClick={dismissReward}
          className="fixed inset-0 z-[75] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`rpg-glass-panel rpg-magic-card rarity-${activeReward.rarity} animate-card-reveal rounded-2xl max-w-sm w-full p-6 text-center space-y-3`}
          >
            <div className="text-xs uppercase tracking-[0.25em] font-bold text-amber-300 flex items-center justify-center gap-1.5">
              <Sparkles className="w-4 h-4" />
              <span>Carta Recebida!</span>
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Para <strong>{activeReward.characterName}</strong>
            </div>
            <div className="py-3 px-4 rounded-xl bg-black/35 border border-amber-500/30">
              <h3 className="font-display font-extrabold text-2xl" style={{ color: 'var(--accent-primary)' }}>
                {activeReward.cardTitle}
              </h3>
              <div className="text-xs font-mono-dice text-amber-200 mt-1">
                {activeReward.cardSubtitle}
              </div>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {activeReward.description}
            </p>
            <div className="text-[10px] uppercase tracking-widest opacity-75">
              Raridade: {activeReward.rarity}
            </div>
            <button
              onClick={dismissReward}
              className="rpg-btn-primary w-full py-2 rounded-lg text-xs cursor-pointer"
            >
              Guardar na Ficha
            </button>
          </div>
        </div>
      )}

      {/* 6. D&D 5e FALL DAMAGE & FEATHER FALL REACTION PROMPT */}
      {fallDamagePrompt && (() => {
        const isMyHeroFalling = Boolean(
          myCharacter && fallDamagePrompt.characterId === myCharacter.id
        );
        const canActOnFall = role === 'gm' || isMyHeroFalling || fallDamagePrompt.canFeatherFall;
        if (!canActOnFall) return null;
        return (
          <div className="fixed bottom-24 right-6 z-50 pointer-events-auto animate-ui-enter max-w-sm w-80">
            <div className="rpg-glass-panel rounded-xl p-4 space-y-3 shadow-2xl border border-amber-400/60">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <ArrowDown className="w-5 h-5 text-red-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-widest font-display font-bold text-red-300">
                      Queda de {fallDamagePrompt.heightMeters}m!
                    </div>
                    <div className="font-display font-bold text-sm text-[#f2e8d5] truncate">
                      {maskHiddenNameForRole(
                        fallDamagePrompt.name,
                        role,
                        campaign,
                        fallDamagePrompt.tokenId
                      )}
                    </div>
                  </div>
                </div>
                {role === 'gm' && (
                  <button
                    type="button"
                    onClick={dismissFallDamagePrompt}
                    className="rpg-card p-1 rounded text-[#a69b88] hover:text-white cursor-pointer"
                    title="Ignorar / Pouso Seguro (Mestre)"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="text-xs text-[#cfc6b6] leading-relaxed">
                {fallDamagePrompt.reason
                  ? maskHiddenNamesInText(fallDamagePrompt.reason, role, campaign)
                  : `${maskHiddenNameForRole(
                      fallDamagePrompt.name,
                      role,
                      campaign,
                      fallDamagePrompt.tokenId
                    )} caiu de uma altura de ${fallDamagePrompt.heightMeters}m.`}
                <div className="mt-1 font-mono-dice text-amber-300 font-bold">
                  Dano previsto: {fallDamagePrompt.diceCount}d6 Contusão + Caído
                </div>
              </div>

              <div className="space-y-1.5">
                {fallDamagePrompt.canFeatherFall && (
                  <button
                    type="button"
                    onClick={useFeatherFallReaction}
                    className="w-full py-2 px-3 rounded-lg bg-[#14253a] hover:bg-[#1b334f] border border-[#5ba3e0] text-[#dcecfb] text-xs font-display font-bold flex items-center justify-center gap-2 cursor-pointer transition"
                  >
                    <Feather className="w-4 h-4 text-[#7cb4e8]" />
                    <span>Usar Reação: Queda Suave (0 Dano)</span>
                  </button>
                )}
                {(role === 'gm' || isMyHeroFalling) && (
                  <button
                    type="button"
                    onClick={rollFallDamageNow}
                    className="rpg-btn-crimson w-full py-2 px-3 rounded-lg text-xs font-display font-bold flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Dices className="w-4 h-4" />
                    <span>Rolar Dano de Queda ({fallDamagePrompt.diceCount}d6)</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* 7. D&D 5e COUNTERSPELL REACTION PROMPT */}
      {counterspellPrompt && (() => {
        const myReactor =
          role === 'player' && myCharacter
            ? counterspellPrompt.reactors.find((r) => r.characterId === myCharacter.id)
            : undefined;
        const canSeePrompt = role === 'gm' || Boolean(myReactor) || Boolean(counterspellPrompt.resolved);
        if (!canSeePrompt) return null;
        return (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[62] pointer-events-auto animate-ui-enter max-w-sm w-[92vw]">
            <div className="rpg-glass-panel rounded-xl p-4 space-y-3 shadow-2xl border border-purple-400/65">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Zap className="w-5 h-5 text-purple-300 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-widest font-display font-bold text-purple-300">
                      Reação: Contramágica
                    </div>
                    <div className="font-display font-bold text-sm text-[#f2e8d5] truncate">
                      {maskHiddenNameForRole(
                        counterspellPrompt.casterName,
                        role,
                        campaign,
                        counterspellPrompt.casterTokenId
                      )}{' '}
                      conjura {counterspellPrompt.spellName}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={dismissCounterspellPrompt}
                  className="rpg-card p-1 rounded text-[#a69b88] hover:text-white cursor-pointer"
                  title="Fechar"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {counterspellPrompt.resolved ? (
                <div
                  className={`p-2.5 rounded-lg border text-xs font-semibold ${
                    counterspellPrompt.resolved.countered
                      ? 'bg-emerald-950/75 border-emerald-400/60 text-emerald-200'
                      : 'bg-red-950/75 border-red-400/60 text-red-200'
                  }`}
                >
                  {maskHiddenNamesInText(counterspellPrompt.resolved.summary, role, campaign)}
                </div>
              ) : (
                <>
                  <div className="text-[11px] text-[#cfc6b6]">
                    Nível estimado: <strong className="text-purple-200">{counterspellPrompt.spellLevel}º círculo</strong>{' '}
                    {counterspellPrompt.spellLevel <= 3
                      ? '(anulação automática!)'
                      : `(teste CD ${10 + counterspellPrompt.spellLevel})`}
                  </div>
                  <div className="space-y-1.5">
                    {(role === 'gm' ? counterspellPrompt.reactors : myReactor ? [myReactor] : []).map(
                      (reactor) => (
                        <button
                          key={reactor.tokenId}
                          type="button"
                          onClick={() => triggerCounterspellReaction(reactor.tokenId)}
                          className="w-full py-2 px-3 rounded-lg bg-[#231538] hover:bg-[#311d4d] border border-purple-400/70 text-purple-100 text-xs font-display font-bold flex items-center justify-center gap-2 cursor-pointer transition"
                        >
                          <Shield className="w-4 h-4 text-purple-300" />
                          <span>
                            {role === 'gm' ? `${reactor.name}: ` : ''}Usar Contramágica ({reactor.mpCost} PM)
                          </span>
                        </button>
                      )
                    )}
                    <button
                      type="button"
                      onClick={dismissCounterspellPrompt}
                      className="w-full py-1.5 rounded-lg bg-black/40 hover:bg-black/60 border border-white/15 text-[11px] text-[#c7bda9] font-display font-semibold cursor-pointer"
                    >
                      Deixar Magia Passar
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* 8. ANIME / DARK-FANTASY ULTIMATE CUT-IN 2.0 (60FPS Canvas + 7 Styles + Impact Frame) */}
      {activeCutIn && (
        <UltimateCutInOverlay
          event={{
            ...activeCutIn,
            actorName: maskHiddenNameForRole(
              activeCutIn.actorName,
              role,
              campaign,
              activeCutIn.casterTokenId
            ),
          }}
          resolvedPortraitUrl={
            activeCutIn.portraitUrl ? resolveAssetUrl(activeCutIn.portraitUrl) : ''
          }
          onDismiss={dismissCutIn}
        />
      )}

      {/* Colored Viewport Edge Flash on Cut-In Climax Impact */}
      {cutInEdgeFlashColor && (
        <div
          className="fixed inset-0 z-[88] pointer-events-none animate-crit-edge-flash"
          style={{
            boxShadow: `inset 0 0 110px ${cutInEdgeFlashColor}cc, inset 0 0 36px #ffffff88`,
          }}
        />
      )}

      {/* 8B. VISCERAL BLACK FLASH (NATURAL 20 CRITICAL IMPACT) */}
      {cinematicEnabled && activeBlackFlash && (
        <BlackFlashOverlay
          event={{
            ...activeBlackFlash,
            attackerName: maskHiddenNameForRole(activeBlackFlash.attackerName, role, campaign),
            targetName: activeBlackFlash.targetName
              ? maskHiddenNameForRole(
                  activeBlackFlash.targetName,
                  role,
                  campaign,
                  activeBlackFlash.targetTokenId
                )
              : undefined,
          }}
          onDismiss={dismissBlackFlash}
        />
      )}

      {/* 8C. VISCERAL EXECUTION ("COMO VOCÊ QUER FAZER ISSO?") */}
      {cinematicEnabled && activeExecution && !activeCutIn && (
        <ExecutionOverlay
          event={{
            ...activeExecution,
            killerName: maskHiddenNameForRole(activeExecution.killerName, role, campaign),
            victimName: maskHiddenNameForRole(
              activeExecution.victimName,
              role,
              campaign,
              activeExecution.victimTokenId
            ),
          }}
          resolvedKillerPortraitUrl={
            activeExecution.killerPortraitUrl
              ? resolveAssetUrl(activeExecution.killerPortraitUrl)
              : ''
          }
          onDismiss={dismissExecution}
        />
      )}

      {/* 9. DUAL-SLOT VISUAL NOVEL RP PORTRAIT SPOTLIGHT ("EM CENA") */}
      {(rpSpotlight.left || rpSpotlight.right) && (
        <div className="fixed bottom-[86px] inset-x-4 z-35 pointer-events-none flex items-end justify-between gap-4">
          {(['left', 'right'] as const).map((slotKey) => {
            const entry = rpSpotlight[slotKey];
            if (!entry) return <div key={slotKey} className="flex-1" />;
            const isRight = slotKey === 'right';
            const canDismissSlot =
              role === 'gm' || (myCharacter && entry.characterId === myCharacter.id);
            const resolvedPortrait = entry.portraitUrl ? resolveAssetUrl(entry.portraitUrl) : '';
            const toneAccent =
              entry.tone === 'intense'
                ? '#ef4444'
                : entry.tone === 'whisper'
                  ? '#818cf8'
                  : entry.tone === 'epic'
                    ? '#f59e0b'
                    : entry.tone === 'serious'
                      ? '#38bdf8'
                      : entry.color || '#d4ad5c';
            const toneLabel =
              entry.tone === 'intense'
                ? 'INTENSO'
                : entry.tone === 'whisper'
                  ? 'SUSSURRO'
                  : entry.tone === 'epic'
                    ? 'ÉPICO'
                    : entry.tone === 'serious'
                      ? 'SÉRIO'
                      : '';

            return (
              <div
                key={entry.id}
                className={`pointer-events-auto max-w-[430px] w-full flex items-end gap-3 ${
                  isRight ? 'flex-row-reverse ml-auto animate-spotlight-right' : 'animate-spotlight-left'
                }`}
              >
                {/* Standing Illustrated Portrait Plate */}
                <div
                  className="relative w-24 h-28 sm:w-28 sm:h-34 rounded-lg overflow-hidden shrink-0 shadow-2xl"
                  style={{
                    border: `2px solid ${toneAccent}`,
                    background: `radial-gradient(circle at 50% 28%, ${toneAccent}2b, #080a10 85%)`,
                    boxShadow: `0 12px 32px rgba(0,0,0,0.9), 0 0 22px ${toneAccent}45`,
                  }}
                >
                  {resolvedPortrait ? (
                    <img
                      src={resolvedPortrait}
                      alt={maskHiddenNameForRole(entry.speakerName, role, campaign, entry.tokenId)}
                      className="w-full h-full object-cover object-top"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <TokenPortrait
                        name={maskHiddenNameForRole(entry.speakerName, role, campaign, entry.tokenId)}
                        playerColor={entry.color}
                        frameStyle={entry.frameStyle || 'gold'}
                        sizePx={74}
                      />
                    </div>
                  )}
                  <div
                    className="absolute inset-x-0 bottom-0 h-8 pointer-events-none"
                    style={{
                      background: 'linear-gradient(180deg, transparent, rgba(5,7,12,0.92))',
                    }}
                  />
                </div>

                {/* Carved Dialogue Box */}
                <div
                  className="flex-1 min-w-0 rpg-glass-panel rounded-lg p-3 space-y-1.5 shadow-2xl"
                  style={{
                    borderColor: `${toneAccent}80`,
                    boxShadow: `0 14px 36px rgba(0,0,0,0.9), inset 0 0 18px ${toneAccent}18`,
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                      <span
                        className="font-display font-bold text-xs sm:text-sm truncate"
                        style={{ color: toneAccent }}
                      >
                        {maskHiddenNameForRole(entry.speakerName, role, campaign, entry.tokenId)}
                      </span>
                      {entry.subtitle &&
                        !(
                          role !== 'gm' &&
                          maskHiddenNameForRole(entry.speakerName, role, campaign, entry.tokenId) ===
                            '???'
                        ) && (
                          <span className="px-1.5 py-0.2 rounded bg-black/50 border border-white/15 text-[9px] font-display text-[#d7ccb8] truncate max-w-[120px]">
                            {entry.subtitle}
                          </span>
                        )}
                      {toneLabel && (
                        <span
                          className="px-1.5 py-0.2 rounded text-[8px] font-display font-bold tracking-wider border"
                          style={{
                            borderColor: `${toneAccent}66`,
                            color: toneAccent,
                            backgroundColor: `${toneAccent}18`,
                          }}
                        >
                          {toneLabel}
                        </span>
                      )}
                    </div>
                    {canDismissSlot && (
                      <button
                        type="button"
                        onClick={() => clearRpSpotlight(slotKey)}
                        className="p-1 rounded text-[#9b9180] hover:text-white hover:bg-white/10 cursor-pointer shrink-0"
                        title="Tirar de Cena"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {entry.dialogue.trim() ? (
                    <p
                      className={`text-xs sm:text-[13px] leading-relaxed break-words ${
                        entry.tone === 'whisper'
                          ? 'italic text-indigo-200/90'
                          : entry.tone === 'intense'
                            ? 'font-semibold text-red-100'
                            : 'text-[#f2eadb]'
                      }`}
                    >
                      &ldquo;{entry.dialogue}&rdquo;
                    </p>
                  ) : (
                    <p className="text-[11px] italic text-[#9b9180]">Em destaque na cena...</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
};
