import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Crown,
  Dices,
  Flame,
  Moon,
  Music,
  ShieldAlert,
  Sparkles,
  Sun,
  Swords,
  X,
} from 'lucide-react';
import { useCampaign } from '../context/CampaignContext';
import { soundEngine } from '../utils/soundEngine';
import {
  buildPreviewDiceForFormula,
  computeCharacterStats,
  evaluateFormula,
  formatSigned,
} from '../shared/rulesEngine';
import { DraggablePanel, DragGripBadge } from './DraggablePanel';
import { OrnateDivider, OrnateFrame, SculptedHealthBar } from './OrnateFrame';
import { TokenPortrait } from './TokenPortrait';

export const CinematicOverlays: React.FC = () => {
  const {
    campaign,
    role,
    myCharacter,
    activeCharacterId,
    activeSkillCheck,
    submitSkillCheckResult,
    dismissSkillCheck,
    sendRoll,
    openManualRoll,
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
      subtitle: `Dificuldade: CD ${activeSkillCheck.dc}`,
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
          details: `${passed ? 'SUCESSO' : 'FALHA'} contra CD ${activeSkillCheck.dc} (${res.details})`,
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
  const [mvpXpInput, setMvpXpInput] = useState('150');
  const [mvpXpDelivered, setMvpXpDelivered] = useState(false);

  useEffect(() => {
    setMvpXpDelivered(false);
  }, [activeMvpSummary?.id]);

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
      const timer = window.setTimeout(() => {
        setTurnBanner((curr) => (curr?.id === id ? null : curr));
      }, isMyTurn ? 3400 : 2200);
      return () => window.clearTimeout(timer);
    }
  }, [campaign.combat, myCharacter, role]);

  // Boss Phase Transition Cinematic Banner (auto-triggers when any visible Boss enters Phase 2, 3, ...)
  const [bossPhaseBanner, setBossPhaseBanner] = useState<{
    id: string;
    bossName: string;
    phase: number;
    phaseTitle?: string;
  } | null>(null);
  const bossPhaseMapRef = useRef<Record<string, number>>({});

  useEffect(() => {
    const activeMap = campaign.maps.find((m) => m.id === campaign.activeMapId);
    if (!activeMap) return;
    for (const tok of activeMap.tokens) {
      if (!tok.isBoss || (tok.isHidden && role !== 'gm')) continue;
      const curPhase = tok.bossPhase || 1;
      const prevPhase = bossPhaseMapRef.current[tok.id];
      bossPhaseMapRef.current[tok.id] = curPhase;
      if (prevPhase !== undefined && curPhase > prevPhase && curPhase >= 2) {
        if (cinematicEnabled) {
          const bid = `bphase-${Date.now()}`;
          const displayName =
            role !== 'gm' && tok.hideNameFromPlayers ? '???' : tok.name;
          setBossPhaseBanner({
            id: bid,
            bossName: displayName,
            phase: curPhase,
            phaseTitle: tok.bossPhase2Title,
          });
          triggerScreenShake('heavy');
          window.setTimeout(() => {
            setBossPhaseBanner((curr) => (curr?.id === bid ? null : curr));
          }, 3800);
        }
        soundEngine.playSfxPreset('crit');
      }
    }
  }, [campaign.activeMapId, campaign.maps, cinematicEnabled, role, triggerScreenShake]);

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
      const t = window.setTimeout(() => {
        setDownedFlashKey((c) => (c === k ? null : c));
      }, 1250);
      return () => window.clearTimeout(t);
    }
    if (curHp < prevHp && curHp > 0) {
      const k = Date.now();
      setDamageFlashKey(k);
      if (prevHp - curHp >= 10) {
        triggerScreenShake('light');
      }
      const t = window.setTimeout(() => {
        setDamageFlashKey((c) => (c === k ? null : c));
      }, 460);
      return () => window.clearTimeout(t);
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
          className="fixed top-24 left-1/2 -translate-x-1/2 z-50 pointer-events-auto cursor-pointer animate-modal-unfurl"
        >
          <OrnateFrame
            accentColor="#dc2626"
            cornerSize={18}
            className="rpg-glass-panel rounded-xl px-8 py-3.5 text-center shadow-[0_24px_75px_rgba(0,0,0,0.95)] border-red-500/80"
          >
            <div className="text-[10px] font-display font-bold uppercase tracking-[0.28em] text-red-400 flex items-center justify-center gap-2">
              <Crown className="w-3.5 h-3.5 text-amber-400" />
              <span>Fase {bossPhaseBanner.phase} Despertada</span>
              <Crown className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div className="font-chronicle font-black text-lg sm:text-xl tracking-[0.14em] uppercase chronicle-gold-text mt-0.5">
              {bossPhaseBanner.bossName}
            </div>
            {bossPhaseBanner.phaseTitle && (
              <div className="text-xs font-lore italic text-red-200/90 mt-0.5">
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
          className="fixed top-20 left-1/2 -translate-x-1/2 z-45 pointer-events-auto cursor-pointer animate-modal-unfurl"
        >
          <OrnateFrame
            accentColor={turnBanner.color}
            cornerSize={14}
            className="rpg-glass-panel rounded-lg px-6 py-2.5 flex items-center gap-3 shadow-[0_18px_48px_rgba(0,0,0,0.9)]"
          >
            <Swords className="w-5 h-5 shrink-0" style={{ color: turnBanner.color }} />
            <div className="text-center leading-tight">
              <div
                className="font-chronicle font-black text-sm sm:text-base tracking-[0.18em] uppercase"
                style={{ color: turnBanner.isMyTurn ? '#fde68a' : '#f3e5c0' }}
              >
                {turnBanner.isMyTurn ? 'É O SEU TURNO!' : `Turno de ${turnBanner.name}`}
              </div>
              <div className="text-[10px] font-display uppercase tracking-widest text-amber-300/75">
                {turnBanner.isMyTurn
                  ? `${turnBanner.name} • Rodada ${turnBanner.round} • Pressione Espaço p/ encerrar`
                  : `Rodada ${turnBanner.round}`}
              </div>
            </div>
            <Swords className="w-5 h-5 shrink-0 scale-x-[-1]" style={{ color: turnBanner.color }} />
          </OrnateFrame>
        </div>
      )}

      {/* 0B. PARTY REST CINEMATIC BANNER (Short / Long Rest) */}
      {activeRestBanner && (
        <div
          onClick={dismissRestBanner}
          className="fixed top-24 left-1/2 -translate-x-1/2 z-46 pointer-events-auto cursor-pointer animate-modal-unfurl"
        >
          <OrnateFrame
            accentColor={activeRestBanner.kind === 'long' ? '#818cf8' : '#f59e0b'}
            cornerSize={16}
            className="rpg-glass-panel rounded-lg px-7 py-3.5 flex items-center gap-3.5 shadow-[0_22px_55px_rgba(0,0,0,0.92)] max-w-md"
          >
            {activeRestBanner.kind === 'long' ? (
              <Moon className="w-6 h-6 text-indigo-300 shrink-0" />
            ) : (
              <div className="relative shrink-0">
                <Flame className="w-6 h-6 text-amber-400" />
                <Sun className="w-3 h-3 text-amber-200 absolute -top-1 -right-1" />
              </div>
            )}
            <div className="leading-snug">
              <div className="font-chronicle font-black text-sm tracking-[0.16em] uppercase text-amber-100">
                {activeRestBanner.kind === 'long'
                  ? 'Descanso Longo Concluído'
                  : 'Descanso Curto Concluído'}
              </div>
              <div className="text-[11px] text-amber-200/80 mt-0.5">
                {activeRestBanner.summary}
              </div>
            </div>
          </OrnateFrame>
        </div>
      )}

      {/* 0C. COMBAT VICTORY & MVP SUMMARY CARD */}
      {activeMvpSummary && (
        <div
          onClick={dismissMvpSummary}
          className="fixed inset-0 z-55 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 pointer-events-auto"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-lg w-full animate-modal-unfurl"
          >
            <OrnateFrame
              accentColor="#e8c266"
              cornerSize={18}
              className="rpg-glass-panel rounded-xl p-5 space-y-4 shadow-[0_26px_75px_rgba(0,0,0,0.95)]"
            >
              <div className="flex items-start justify-between gap-3 border-b pb-3" style={{ borderColor: 'var(--border-subtle)' }}>
                <div className="flex items-center gap-2.5">
                  <Crown className="w-6 h-6 text-amber-400 shrink-0" />
                  <div>
                    <div className="font-chronicle font-black text-lg tracking-[0.16em] uppercase chronicle-gold-text">
                      Combate Encerrado
                    </div>
                    <div className="text-[11px] text-amber-200/75 font-display">
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
                  className="rpg-card p-1.5 rounded-md hover:border-amber-400 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* MVP Highlights */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-center">
                <div className="rpg-card rounded-lg p-2.5 border border-red-500/35">
                  <div className="text-[9px] font-display uppercase tracking-wider text-red-300">
                    ⚔️ Maior Dano
                  </div>
                  <div className="font-display font-bold text-xs text-amber-100 truncate mt-0.5">
                    {activeMvpSummary.topDamageDealer?.name || '—'}
                  </div>
                  <div className="font-mono-dice font-black text-sm text-red-400">
                    {activeMvpSummary.topDamageDealer
                      ? `${activeMvpSummary.topDamageDealer.value} dano`
                      : '0'}
                  </div>
                </div>
                <div className="rpg-card rounded-lg p-2.5 border border-emerald-500/35">
                  <div className="text-[9px] font-display uppercase tracking-wider text-emerald-300">
                    💚 Maior Cura
                  </div>
                  <div className="font-display font-bold text-xs text-amber-100 truncate mt-0.5">
                    {activeMvpSummary.topHealer?.name || '—'}
                  </div>
                  <div className="font-mono-dice font-black text-sm text-emerald-400">
                    {activeMvpSummary.topHealer ? `+${activeMvpSummary.topHealer.value} PV` : '0'}
                  </div>
                </div>
                <div className="rpg-card rounded-lg p-2.5 border border-amber-400/40">
                  <div className="text-[9px] font-display uppercase tracking-wider text-amber-300">
                    ✨ Críticos (Nat 20)
                  </div>
                  <div className="font-display font-bold text-xs text-amber-100 truncate mt-0.5">
                    {activeMvpSummary.topCrits?.name || '—'}
                  </div>
                  <div className="font-mono-dice font-black text-sm text-amber-300">
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
                        <span className="truncate">{p.name}</span>
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

      {/* 1. COMPACT GOTHIC BOSS BAR (Positioned bottom-right & Draggable!) */}
      {activeBoss && activeBoss.active && (
        <DraggablePanel
          storageKey="boss-fight-bar"
          className="fixed bottom-20 right-4 z-25 w-[310px] sm:w-[350px] pointer-events-auto"
        >
          {bossMinimized ? (
            <button
              onClick={() => setBossMinimized(false)}
              className="ml-auto rpg-glass-panel rounded-md px-3 py-1.5 flex items-center gap-2 border-red-500/60 shadow-xl cursor-pointer hover:border-amber-400"
              title="Expandir barra do Chefe"
            >
              <Crown className="w-3.5 h-3.5 text-red-400" />
              <span className="font-chronicle font-bold text-xs text-red-200 truncate max-w-[180px]">
                {activeBoss.name}
              </span>
              <ChevronUp className="w-3.5 h-3.5 text-amber-300" />
            </button>
          ) : (
            <OrnateFrame
              accentColor="#dc2626"
              cornerSize={14}
              className="rpg-glass-panel rounded-lg px-3.5 py-2 shadow-[0_14px_38px_rgba(180,25,25,0.45)] animate-modal-unfurl"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <TokenPortrait
                    name={activeBoss.name}
                    imageUrl={activeBoss.imageUrl}
                    playerColor={activeBoss.color || '#dc2626'}
                    frameStyle="crimson"
                    sizePx={36}
                    isDead={activeBoss.hp <= 0}
                  />
                  <div className="min-w-0">
                    <div className="font-chronicle font-black text-xs tracking-wider text-red-200 uppercase truncate">
                      {activeBoss.name}
                    </div>
                    <div className="text-[10px] font-display uppercase tracking-wider text-amber-300/80 truncate">
                      {activeBoss.title}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0 text-[11px]">
                  <DragGripBadge />
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
        </DraggablePanel>
      )}

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

      {/* 4. "O MESTRE PEDE UM TESTE!" POP-UP (#1) */}
      {activeSkillCheck && (
        <div className="fixed bottom-6 left-6 z-40 w-80 sm:w-96 pointer-events-auto animate-ui-enter">
          <div className="rpg-glass-panel rounded-2xl p-4 space-y-3 shadow-2xl">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Crown className="w-5 h-5 text-amber-400 shrink-0" />
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-amber-300 font-bold">
                    Chamado do Mestre
                  </div>
                  <h4 className="font-display font-bold text-base leading-tight">
                    Teste de {activeSkillCheck.label}
                  </h4>
                </div>
              </div>
              {role === 'gm' && (
                <button
                  onClick={dismissSkillCheck}
                  className="rpg-card p-1 rounded cursor-pointer"
                  title="Encerrar Pedido de Teste"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {role === 'gm' && (
              <div className="text-xs text-amber-300/90 font-semibold">
                Dificuldade (CD): {activeSkillCheck.dc}
              </div>
            )}

            {/* Giant 1-click button for player */}
            {activeChar && !myResult && (
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
                className={`p-2.5 rounded-lg text-xs font-bold flex items-center justify-between ${
                  myResult.passed
                    ? 'bg-emerald-950/60 border border-emerald-500/50 text-emerald-300'
                    : 'bg-red-950/60 border border-red-500/50 text-red-300'
                }`}
              >
                <span>Seu Resultado: {myResult.total}</span>
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
              </div>
            )}

            {/* Live Results Feed */}
            {activeSkillCheck.results.length > 0 && (
              <div className="space-y-1 pt-1 border-t max-h-36 overflow-y-auto" style={{ borderColor: 'var(--border-subtle)' }}>
                {activeSkillCheck.results.map((r) => (
                  <div
                    key={r.characterId}
                    className="flex items-center justify-between text-xs px-2 py-1 rounded bg-black/25"
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: r.playerColor }}
                      />
                      <span className="font-semibold">{r.characterName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono-dice font-bold">{r.total}</span>
                      <span className={r.passed ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
                        {r.passed ? '✓' : '✕'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. MAGIC CARD REWARD ANIMATION (#2) */}
      {activeReward && (
        <div
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
    </>
  );
};
