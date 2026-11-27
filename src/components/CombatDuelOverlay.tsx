import React, { useEffect, useState } from 'react';
import { Dices, Flame, Heart, Shield, Sparkles, Star, Swords, X, Zap } from 'lucide-react';
import { useCampaign } from '../context/CampaignContext';
import {
  formatFormulaForDisplay,
  getHeroInspirationPoints,
  getMonsterWoundStatus,
  isTokenNameHiddenFromPlayers,
  maskHiddenNameForRole,
} from '../shared/rulesEngine';
import { OrnateDivider, OrnateFrame, OrnateHeaderBanner, SculptedHealthBar } from './OrnateFrame';
import { PolyhedronShape } from './PolyhedralDiceOverlay';
import { TokenPortrait } from './TokenPortrait';

export const CombatDuelOverlay: React.FC = () => {
  const {
    campaign,
    role,
    myCharacter,
    activeCutIn,
    activeDuel,
    rollDuelAttack,
    rollDuelDamage,
    rerollDuelAttackWithInspiration,
    triggerDuelShieldReaction,
    triggerDuelUncannyDodgeReaction,
    dismissDuelReaction,
    advanceDuelPhase,
    dismissDuel,
    cinematicEnabled,
  } = useCampaign();
  const [tickNums, setTickNums] = useState<number[]>([20, 20, 8, 6]);

  useEffect(() => {
    if (!activeDuel || activeCutIn) return;
    if (activeDuel.phase !== 'rolling-attack' && activeDuel.phase !== 'rolling-damage') {
      return;
    }
    const interval = window.setInterval(() => {
      setTickNums([
        Math.floor(Math.random() * 20) + 1,
        Math.floor(Math.random() * 20) + 1,
        Math.floor(Math.random() * 12) + 1,
        Math.floor(Math.random() * 10) + 1,
      ]);
    }, 65);
    const safetyReveal = window.setTimeout(() => {
      advanceDuelPhase(
        activeDuel.phase === 'rolling-attack' ? 'attack-result' : 'damage-result'
      );
    }, 780);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(safetyReveal);
    };
  }, [activeDuel, activeCutIn, advanceDuelPhase]);

  if (activeCutIn || !activeDuel) return null;

  const isReadyAttack = activeDuel.phase === 'ready-attack';
  const isAttackRolling = activeDuel.phase === 'rolling-attack';
  const isAttackResult = activeDuel.phase === 'attack-result';
  const isDamageRolling = activeDuel.phase === 'rolling-damage';
  const isDamageResult = activeDuel.phase === 'damage-result';

  // Read live HP of defender across ALL maps (supports token-map / gm-peek split-party mode!)
  const activeMap =
    campaign.maps.find((m) => m.tokens.some((t) => t.id === activeDuel.defenderTokenId)) ||
    campaign.maps.find((m) => m.id === campaign.activeMapId);
  const liveDefenderToken = activeMap?.tokens.find(
    (t) => t.id === activeDuel.defenderTokenId
  );
  const liveAttackerToken = activeDuel.attackerTokenId
    ? activeMap?.tokens.find((t) => t.id === activeDuel.attackerTokenId)
    : !activeDuel.attackerCharacterId
      ? activeMap?.tokens.find((t) => t.name === activeDuel.attackerName && t.type !== 'character')
      : undefined;

  const isOwnedSummonAttacker = Boolean(
    myCharacter &&
      liveAttackerToken &&
      liveAttackerToken.controlledByCharacterId === myCharacter.id
  );
  const canRollDuel =
    role === 'gm' ||
    isOwnedSummonAttacker ||
    Boolean(activeDuel.attackerCharacterId && myCharacter?.id === activeDuel.attackerCharacterId);
  const canDismissDuelViaClose =
    role === 'gm' ||
    (canRollDuel &&
      (isReadyAttack ||
        isDamageResult ||
        (isAttackResult && (!activeDuel.hitSuccess || !activeDuel.damageFormula))));
  const canActAsDefender =
    role === 'gm' ||
    (role === 'player' &&
      Boolean(
        myCharacter &&
          ((activeDuel.defenderCharacterId && activeDuel.defenderCharacterId === myCharacter.id) ||
            (liveDefenderToken?.type === 'character' &&
              liveDefenderToken.referenceId === myCharacter.id))
      ));
  const hasShieldReactionOption = Boolean(
    activeDuel.hitSuccess &&
      activeDuel.defenderCanShieldReaction &&
      !activeDuel.reactionShieldApplied
  );
  const hasUncannyDodgeOption = Boolean(
    activeDuel.hitSuccess &&
      activeDuel.defenderCanUncannyDodge &&
      !activeDuel.reactionUncannyDodgeApplied
  );
  const hasPendingDefenderReaction = Boolean(
    !activeDuel.defenderReactionDismissed && (hasShieldReactionOption || hasUncannyDodgeOption)
  );
  const displayAttackerName =
    role !== 'gm' && isTokenNameHiddenFromPlayers(liveAttackerToken, campaign)
      ? '???'
      : maskHiddenNameForRole(activeDuel.attackerName, role, campaign, activeDuel.attackerTokenId);
  const displayDefenderName =
    role !== 'gm' && isTokenNameHiddenFromPlayers(liveDefenderToken, campaign)
      ? '???'
      : maskHiddenNameForRole(activeDuel.defenderName, role, campaign, activeDuel.defenderTokenId);
  const currentDefenderHp = liveDefenderToken ? liveDefenderToken.hp : activeDuel.defenderHpBefore;
  const isHeal = activeDuel.damageType?.toLowerCase() === 'cura';
  const isDefenderMonster =
    activeDuel.defenderType === 'monster' || liveDefenderToken?.type === 'monster';
  const isDefenderNpc =
    activeDuel.defenderType === 'npc' || liveDefenderToken?.type === 'npc';
  const defenderMonsterDef =
    liveDefenderToken?.referenceId
      ? campaign.compendium.monsters.find((m) => m.id === liveDefenderToken.referenceId)
      : undefined;
  const defenderNpcDef =
    liveDefenderToken?.referenceId
      ? campaign.npcs.find((n) => n.id === liveDefenderToken.referenceId)
      : undefined;
  const effectiveHideAc =
    liveDefenderToken?.hideAcFromPlayers !== undefined
      ? liveDefenderToken.hideAcFromPlayers
      : isDefenderNpc && defenderNpcDef?.hideAcFromPlayers !== undefined
        ? defenderNpcDef.hideAcFromPlayers
        : defenderMonsterDef?.hideAcFromPlayers !== undefined
          ? defenderMonsterDef.hideAcFromPlayers
          : isDefenderMonster || (isDefenderNpc && defenderNpcDef?.disposition === 'Hostil')
            ? !campaign.settings.showEnemyAcToPlayers
            : false;
  const hideEnemyAc = role !== 'gm' && (isDefenderMonster || isDefenderNpc) && effectiveHideAc;
  const displayedAc = hideEnemyAc ? '??' : activeDuel.defenderDefense;
  const explicitHideHp =
    liveDefenderToken?.hideHpFromPlayers !== undefined
      ? liveDefenderToken.hideHpFromPlayers
      : isDefenderNpc && defenderNpcDef?.hideHpFromPlayers !== undefined
        ? defenderNpcDef.hideHpFromPlayers
        : defenderMonsterDef?.hideHpFromPlayers;
  const hideExactEnemyHp =
    role !== 'gm' &&
    (isDefenderMonster || isDefenderNpc) &&
    (explicitHideHp !== undefined
      ? explicitHideHp
      : isDefenderMonster || (isDefenderNpc && defenderNpcDef?.disposition === 'Hostil'));
  const hideEnemyWoundStatus = role !== 'gm' && (isDefenderMonster || isDefenderNpc) && explicitHideHp === true;

  return (
    <div
      data-modal-overlay="true"
      className="fixed inset-0 z-[72] bg-[#040508]/82 backdrop-blur-[3px] flex items-center justify-center p-4"
    >
      <OrnateFrame
        accentColor={activeDuel.isCrit ? '#d8b56c' : activeDuel.attackerColor}
        cornerSize={16}
        className={`rpg-panel rpg-grain rounded-lg max-w-3xl w-full p-5 sm:p-6 space-y-4 ${
          cinematicEnabled && isAttackResult && activeDuel.isCrit
            ? 'animate-crit-shake animate-critical-nova'
            : 'animate-modal-unfurl'
        }`}
      >
        {/* Top Action Header */}
        <div className="flex items-center justify-between gap-3">
          <OrnateHeaderBanner
            title={activeDuel.actionTitle}
            subtitle="Confronto de Combate"
            icon={<Swords className="w-5 h-5" style={{ color: activeDuel.attackerColor }} />}
          />
          {canDismissDuelViaClose && (
            <button
              onClick={dismissDuel}
              className="rpg-card p-1.5 rounded-md hover:border-amber-400 cursor-pointer shrink-0"
              title={isReadyAttack ? 'Cancelar ataque sem gastar recursos' : 'Fechar duelo'}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <OrnateDivider />

        {/* Situational Tactical Modifiers Banner (Ranged in Melee, Flanking, GM Grant, Conditions) */}
        {activeDuel.situationalModifiers && activeDuel.situationalModifiers.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {activeDuel.situationalModifiers.map((badge, idx) => {
              const isDisadv = badge.startsWith('-Desv:');
              const isAdv = badge.startsWith('+Vant:') || badge.startsWith('+2 ');
              const isAutoCrit = badge.toLowerCase().includes('crítico');
              return (
                <span
                  key={idx}
                  className={`px-2.5 py-0.5 rounded-md text-[10px] font-display font-bold border tracking-wide ${
                    isAutoCrit
                      ? 'bg-amber-950/85 border-amber-400/80 text-amber-200'
                      : isDisadv
                        ? 'bg-red-950/80 border-red-500/60 text-red-200'
                        : isAdv
                          ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-200'
                          : 'bg-slate-900/85 border-amber-500/40 text-amber-100'
                  }`}
                >
                  {badge}
                </span>
              );
            })}
          </div>
        )}

        {/* Duelists Row: Attacker (with Lunge) vs CA Shield (with Shards/Block) vs Defender (with Ghost HP) */}
        <div className="grid grid-cols-1 md:grid-cols-11 gap-4 items-center">
          {/* Attacker */}
          <div
            className={`md:col-span-4 rpg-card rounded-lg p-4 flex flex-col items-center text-center gap-2 ${
              !isAttackRolling && activeDuel.hitSuccess && (isAttackResult || isDamageRolling)
                ? 'animate-attacker-lunge'
                : ''
            }`}
          >
            <TokenPortrait
              name={displayAttackerName}
              imageUrl={activeDuel.attackerImageUrl}
              playerColor={activeDuel.attackerColor}
              frameStyle={activeDuel.attackerFrame || 'gold'}
              sizePx={74}
            />
            <div className="font-display font-bold text-sm text-amber-100 flex items-center justify-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/30"
                style={{ backgroundColor: activeDuel.attackerColor || '#e0b84c' }}
              />
              <span className="truncate max-w-[180px]">{displayAttackerName}</span>
            </div>
            <span className="rpg-socket text-[10px] font-display uppercase tracking-widest px-2.5 py-0.5 rounded-xs text-amber-200/85">
              Atacante
            </span>
          </div>

          {/* Center Clash: CA Shield with SVG Cracks & Shards */}
          <div className="md:col-span-3 flex flex-col items-center justify-center gap-2 relative">
            <div
              className={`relative w-24 h-28 flex flex-col items-center justify-center transition-all ${
                (isAttackResult || isDamageRolling || isDamageResult) && activeDuel.hitSuccess
                  ? 'animate-shield-shatter'
                  : isAttackResult && !activeDuel.hitSuccess
                  ? 'animate-shield-block'
                  : ''
              }`}
            >
              <svg viewBox="0 0 100 115" className="w-full h-full drop-shadow-[0_6px_18px_rgba(0,0,0,0.85)]">
                <defs>
                  <linearGradient id="ca-shield-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#64748b" />
                    <stop offset="45%" stopColor="#1e293b" />
                    <stop offset="100%" stopColor="#090d16" />
                  </linearGradient>
                </defs>
                <path
                  d="M50,4 L92,20 L88,64 C86,88 68,104 50,111 C32,104 14,88 12,64 L8,20 Z"
                  fill="url(#ca-shield-grad)"
                  stroke={
                    isAttackResult && !activeDuel.hitSuccess
                      ? '#38bdf8'
                      : activeDuel.hitSuccess && !isAttackRolling
                      ? '#facc15'
                      : '#d4aa48'
                  }
                  strokeWidth="4"
                />
                {/* Inner Steel Bevel */}
                <path
                  d="M50,12 L84,25 L80,62 C78,82 64,95 50,101 C36,95 22,82 20,62 L16,25 Z"
                  fill="none"
                  stroke="rgba(255,255,255,0.16)"
                  strokeWidth="1.5"
                />
                {/* SVG Fracture Cracks when Shield Shatters on Hit */}
                {(isAttackResult || isDamageRolling || isDamageResult) && activeDuel.hitSuccess && (
                  <g stroke="#facc15" strokeWidth="2.4" strokeLinecap="round" fill="none">
                    <polyline points="22,26 44,48 34,74 52,96" />
                    <polyline points="74,30 52,54 70,68" />
                    <line x1="44" y1="48" x2="62" y2="38" />
                  </g>
                )}
              </svg>

              {/* Flying Metallic Shards on Shatter */}
              {isAttackResult && activeDuel.hitSuccess && (
                <>
                  <svg viewBox="0 0 24 24" className="w-5 h-5 absolute -top-1 -right-2 pointer-events-none animate-shield-shards">
                    <polygon points="4,2 20,8 10,20" fill="#fde68a" />
                  </svg>
                  <svg viewBox="0 0 24 24" className="w-4 h-4 absolute top-6 -left-3 pointer-events-none animate-shield-shards">
                    <polygon points="2,14 18,4 14,22" fill="#94a3b8" />
                  </svg>
                </>
              )}

              {/* Deflection Ring on Block */}
              {isAttackResult && !activeDuel.hitSuccess && (
                <div className="absolute inset-0 rounded-full border-2 border-sky-400/80 pointer-events-none animate-impact-ripple" />
              )}

              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <Shield className="w-4 h-4 text-amber-300/90 mb-0.5" />
                <span className="text-[9px] uppercase font-display tracking-wider text-slate-300 font-bold">
                  Defesa CA
                </span>
                <span className="font-chronicle font-black text-2xl text-white leading-none drop-shadow">
                  {displayedAc}
                </span>
              </div>
            </div>
          </div>

          {/* Defender + Live Ghost-Drain HP Bar + Hit Recoil */}
          <div
            className={`md:col-span-4 rpg-card rounded-lg p-4 flex flex-col items-center text-center gap-2 ${
              cinematicEnabled && isDamageResult && !isHeal && (activeDuel.damageTotal || 0) > 0
                ? 'animate-defender-recoil'
                : ''
            }`}
          >
            <TokenPortrait
              name={displayDefenderName}
              imageUrl={activeDuel.defenderImageUrl}
              playerColor={activeDuel.defenderColor}
              frameStyle={activeDuel.defenderFrame || 'crimson'}
              sizePx={74}
              isDead={currentDefenderHp <= 0}
            />
            <div className="font-display font-bold text-sm">{displayDefenderName}</div>
            <div className="w-full space-y-1.5">
              {hideExactEnemyHp ? (
                (() => {
                  const wound = getMonsterWoundStatus(currentDefenderHp, activeDuel.defenderMaxHp);
                  return (
                    <div className="rpg-socket rounded px-2.5 py-1.5 text-xs font-display font-bold flex items-center justify-center gap-1.5">
                      <Heart className="w-3 h-3 text-red-400" />
                      <span className={hideEnemyWoundStatus ? 'text-slate-400' : wound.colorClass}>
                        {hideEnemyWoundStatus ? 'PV ??' : wound.label}
                      </span>
                      {isDamageResult && activeDuel.damageTotal !== undefined && (
                        <span className={`font-mono-dice ${isHeal ? 'text-emerald-400' : 'text-red-400'}`}>
                          ({isHeal ? `+${activeDuel.damageTotal}` : `-${activeDuel.damageTotal}`})
                        </span>
                      )}
                    </div>
                  );
                })()
              ) : (
                <>
                  <SculptedHealthBar
                    hp={currentDefenderHp}
                    maxHp={activeDuel.defenderMaxHp}
                    ghostOverride={activeDuel.defenderHpBefore}
                    heightClass="h-3"
                  />
                  <div className="text-xs font-mono-dice font-bold flex items-center justify-center gap-1">
                    <Heart className="w-3 h-3 text-red-400" />
                    <span>
                      PV {currentDefenderHp} / {activeDuel.defenderMaxHp}
                    </span>
                    {isDamageResult && activeDuel.damageTotal !== undefined && (
                      <span className={isHeal ? 'text-emerald-400' : 'text-red-400'}>
                        ({isHeal ? `+${activeDuel.damageTotal}` : `-${activeDuel.damageTotal}`})
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* STAGE 1 OR STAGE 2 DICE & ACTION PANEL */}
        <div className="rpg-socket rounded-lg p-4 flex flex-col items-center gap-3 text-center">
          {isReadyAttack && (
            <>
              <div className="text-xs uppercase tracking-widest font-display font-bold text-amber-200/90">
                Etapa 1 — Pronto para Atacar ({formatFormulaForDisplay(activeDuel.attackFormula || activeDuel.rawAttackFormula || '1d20')})
              </div>
              <div className="flex flex-wrap items-center justify-center gap-5">
                {activeDuel.attackRolledDice.map((die, idx) => (
                  <PolyhedronShape
                    key={idx}
                    die={die}
                    displayValue="?"
                    skin={activeDuel.diceSkin}
                    rolling={false}
                    onClick={canRollDuel ? rollDuelAttack : undefined}
                  />
                ))}
              </div>
              {canRollDuel ? (
                <div className="space-y-1.5">
                  <button
                    onClick={rollDuelAttack}
                    className="rpg-btn-primary px-7 py-2.5 rounded-md text-sm font-display font-bold flex items-center gap-2 mx-auto cursor-pointer shadow-xl"
                  >
                    <Dices className="w-4 h-4" />
                    <span>
                      Rolar Ataque ({formatFormulaForDisplay(activeDuel.attackFormula || activeDuel.rawAttackFormula || '1d20')})
                    </span>
                  </button>
                  <div className="text-[10px] font-lore italic" style={{ color: 'var(--text-muted)' }}>
                    Clique no dado ou no botão acima para girar o teste de acerto
                  </div>
                </div>
              ) : (
                <div className="px-4 py-1.5 rounded-md bg-black/35 border border-amber-500/30 text-xs font-lore italic text-amber-200/85">
                  Aguardando <strong>{displayAttackerName}</strong> rolar o ataque...
                </div>
              )}
            </>
          )}

          {(isAttackRolling || isAttackResult) && (
            <>
              {activeDuel.attackRolledDice.length > 0 && (
                <>
                  <div className="text-xs uppercase tracking-widest font-display font-bold text-amber-200/90">
                    Etapa 1 — Teste de Acerto ({formatFormulaForDisplay(activeDuel.attackFormula || '')})
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-5">
                    {activeDuel.attackRolledDice.map((die, idx) => (
                      <PolyhedronShape
                        key={idx}
                        die={die}
                        displayValue={isAttackRolling ? tickNums[idx % tickNums.length] : die.value}
                        skin={activeDuel.diceSkin}
                        rolling={isAttackRolling}
                        isCritDie={!isAttackRolling && die.sides === 20 && die.value === 20}
                        isFumbleDie={!isAttackRolling && die.sides === 20 && die.value === 1}
                      />
                    ))}
                  </div>
                </>
              )}

              {isAttackResult && (
                <div className="space-y-2.5">
                  {activeDuel.attackTotal !== undefined && (
                    <div className="flex items-center justify-center gap-3">
                      <span className="text-sm font-lore">Total do Ataque:</span>
                      <span
                        className="font-chronicle font-black text-3xl drop-shadow"
                        style={{ color: activeDuel.hitSuccess ? '#facc15' : '#f87171' }}
                      >
                        {activeDuel.attackTotal}
                      </span>
                      <span className="text-sm opacity-75">vs CA {displayedAc}</span>
                    </div>
                  )}

                  {activeDuel.hitSuccess ? (
                    <div className="space-y-2.5">
                      {activeDuel.attackTotal !== undefined && (
                        <div className="inline-flex items-center gap-2 px-4 py-1 rounded-md bg-amber-950/70 border border-amber-400/70 text-amber-200 font-display font-bold text-xs tracking-wider shadow">
                          <Flame className="w-4 h-4 text-amber-400" />
                          {activeDuel.isCrit
                            ? 'ACERTO CRÍTICO! (Dados de dano dobrados!)'
                            : `ACERTOU! Superou a CA ${displayedAc}!`}
                        </div>
                      )}
                      {activeDuel.damageFormula ? (
                        <div className="space-y-2.5">
                          {/* Defensive Reaction Panel: visible to DEFENDER and GM! */}
                          {hasPendingDefenderReaction && canActAsDefender && (
                            <div className="rounded-lg p-2.5 bg-[#0e1b2d]/95 border border-[#5ba3e0]/65 space-y-2 max-w-md mx-auto shadow-lg">
                              <div className="text-[10px] font-display uppercase tracking-widest text-[#8ec8f8] font-bold flex items-center justify-center gap-1.5">
                                <Zap className="w-3.5 h-3.5 text-amber-300" />
                                <span>Reação Defensiva Disponível ({displayDefenderName})</span>
                              </div>
                              <div className="flex flex-wrap items-center justify-center gap-2">
                                {hasShieldReactionOption && (
                                  <button
                                    type="button"
                                    onClick={triggerDuelShieldReaction}
                                    className="px-3.5 py-1.5 rounded text-xs font-display font-bold flex items-center gap-1.5 cursor-pointer bg-[#14253a] hover:bg-[#1b334f] border border-[#5ba3e0] text-[#dcecfb] transition"
                                  >
                                    <Shield className="w-3.5 h-3.5 text-[#7cb4e8]" />
                                    <span>Escudo Arcano (+5 CA)</span>
                                  </button>
                                )}
                                {hasUncannyDodgeOption && (
                                  <button
                                    type="button"
                                    onClick={triggerDuelUncannyDodgeReaction}
                                    className="px-3.5 py-1.5 rounded text-xs font-display font-bold flex items-center gap-1.5 cursor-pointer bg-[#251838] hover:bg-[#33204d] border border-[#a875e8] text-[#ebd9ff] transition"
                                  >
                                    <Zap className="w-3.5 h-3.5 text-[#c79cf7]" />
                                    <span>Esquiva Sobrenatural (½ Dano)</span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={dismissDuelReaction}
                                  className="px-2.5 py-1.5 rounded text-[11px] font-display font-semibold cursor-pointer bg-black/45 hover:bg-black/65 border border-white/15 text-[#c6bcab] transition"
                                >
                                  Deixar Passar
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Notice for attacker while defender decides on Reaction */}
                          {hasPendingDefenderReaction && !canActAsDefender && (
                            <div className="px-3 py-1.5 rounded bg-[#101c2d]/85 border border-[#5ba3e0]/45 text-[11px] text-[#a7d2f7] inline-flex items-center gap-1.5">
                              <Zap className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                              <span>
                                <strong>{displayDefenderName}</strong> pode usar uma Reação defensiva antes do dano...
                              </span>
                            </div>
                          )}

                          {canRollDuel ? (
                            <button
                              type="button"
                              disabled={hasPendingDefenderReaction}
                              onClick={rollDuelDamage}
                              title={
                                hasPendingDefenderReaction
                                  ? 'Aguarde o defensor usar Reação ou clicar em "Deixar Passar"'
                                  : undefined
                              }
                              className="rpg-btn-crimson px-7 py-2.5 rounded text-sm flex items-center gap-2 mx-auto cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                            >
                              <Sparkles className="w-4 h-4" />
                              <span>
                                {hasPendingDefenderReaction
                                  ? 'Aguardando Reação Defensiva...'
                                  : `Rolar ${isHeal ? 'Cura' : 'Dano'} (${formatFormulaForDisplay(activeDuel.damageFormula)})${activeDuel.reactionUncannyDodgeApplied ? ' • ½ Dano' : ''}`}
                              </span>
                            </button>
                          ) : (
                            <div className="px-4 py-1.5 rounded bg-[#0a0c12] border border-[#b89146]/25 text-xs font-lore italic text-[#a69b88]">
                              Aguardando <strong className="text-[#ece4d5]">{displayAttackerName}</strong> rolar o {isHeal ? 'efeito' : 'dano'}...
                            </div>
                          )}
                        </div>
                      ) : canRollDuel ? (
                        <button
                          type="button"
                          onClick={dismissDuel}
                          className="rpg-btn-primary px-6 py-2 rounded text-xs inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <Swords className="w-3.5 h-3.5" />
                          <span>Disparar &amp; Concluir Ataque</span>
                        </button>
                      ) : (
                        <div className="px-4 py-1.5 rounded bg-[#0a0c12] border border-[#b89146]/25 text-xs font-lore italic text-[#a69b88]">
                          Aguardando <strong className="text-[#ece4d5]">{displayAttackerName}</strong> concluir o ataque...
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      <div className="inline-flex items-center gap-2 px-4 py-1 rounded bg-[#121e2e] border border-[#4a90d9]/55 text-[#c8e1f7] font-display font-bold text-xs tracking-wider">
                        <Shield className="w-4 h-4 text-[#7cb4e8]" />
                        BLOQUEADO PELA DEFESA (CA {displayedAc})
                      </div>
                      {canRollDuel ? (
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          {(() => {
                            const atkHero = activeDuel.attackerCharacterId
                              ? campaign.characters.find((c) => c.id === activeDuel.attackerCharacterId)
                              : undefined;
                            const inspPts = getHeroInspirationPoints(atkHero);
                            if (!atkHero || inspPts <= 0) return null;
                            return (
                              <button
                                type="button"
                                onClick={rerollDuelAttackWithInspiration}
                                className="px-4 py-2 rounded text-xs font-display font-bold flex items-center gap-1.5 cursor-pointer bg-[#241d11] hover:bg-[#332917] border border-[#d4ad5c] text-[#e8c683] transition"
                                title="Gastar 1 Ponto de Inspiração Heroica para re-rolar este d20 agora"
                              >
                                <Star className="w-3.5 h-3.5 fill-[#d4ad5c] text-[#d4ad5c]" />
                                <span>Re-rolar d20 (Inspiração {inspPts}/3)</span>
                              </button>
                            );
                          })()}
                          <button
                            type="button"
                            onClick={dismissDuel}
                            className="rpg-card px-5 py-2 rounded text-xs font-display font-semibold cursor-pointer"
                          >
                            Fechar
                          </button>
                        </div>
                      ) : (
                        <div className="px-4 py-1.5 rounded bg-[#0a0c12] border border-[#b89146]/25 text-xs font-lore italic text-[#a69b88]">
                          Aguardando <strong className="text-[#ece4d5]">{displayAttackerName}</strong> fechar...
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {(isDamageRolling || isDamageResult) && activeDuel.damageRolledDice && (
            <>
              <div className="text-xs uppercase tracking-widest font-display font-bold text-[#e07a7d]">
                Etapa 2 — Rolagem de {isHeal ? 'Cura' : 'Dano'} ({formatFormulaForDisplay(activeDuel.damageFormula || '')})
              </div>
              <div className="flex flex-wrap items-center justify-center gap-5">
                {activeDuel.damageRolledDice.map((die, idx) => (
                  <PolyhedronShape
                    key={idx}
                    die={die}
                    displayValue={isDamageRolling ? tickNums[idx % tickNums.length] : die.value}
                    skin={activeDuel.diceSkin}
                    rolling={isDamageRolling}
                  />
                ))}
              </div>

              {isDamageResult && (
                <div className="space-y-2.5 animate-ui-enter">
                  <div className={`font-chronicle font-black text-3xl drop-shadow ${isHeal ? 'text-[#6fd49a]' : 'text-[#e0585c]'}`}>
                    {isHeal
                      ? `+${activeDuel.damageTotal} PV de Cura`
                      : `-${activeDuel.damageTotal} de Dano (${activeDuel.damageType || 'Físico'})`}
                  </div>
                  <div className="text-xs text-[#a69b88]">
                    Dispare o golpe para executar a animação no mapa e aplicar em {displayDefenderName}.
                  </div>
                  {canRollDuel ? (
                    <button
                      type="button"
                      onClick={dismissDuel}
                      className="rpg-btn-primary px-6 py-2 rounded text-xs inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      {isHeal ? (
                        <>
                          <Heart className="w-3.5 h-3.5" />
                          <span>Disparar Cura &amp; Aplicar</span>
                        </>
                      ) : (
                        <>
                          <Swords className="w-3.5 h-3.5" />
                          <span>Disparar Golpe &amp; Aplicar Dano</span>
                        </>
                      )}
                    </button>
                  ) : (
                    <div className="px-4 py-1.5 rounded bg-[#0a0c12] border border-[#b89146]/25 text-xs font-lore italic text-[#a69b88]">
                      Aguardando <strong className="text-[#ece4d5]">{displayAttackerName}</strong> disparar o golpe no mapa...
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </OrnateFrame>
    </div>
  );
};
