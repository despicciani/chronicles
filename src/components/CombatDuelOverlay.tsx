import React, { useEffect, useState } from 'react';
import { Dices, Flame, Heart, Shield, Sparkles, Swords, X } from 'lucide-react';
import { useCampaign } from '../context/CampaignContext';
import {
  formatFormulaForDisplay,
  getHeroInspirationPoints,
  getMonsterWoundStatus,
} from '../shared/rulesEngine';
import { OrnateDivider, OrnateFrame, OrnateHeaderBanner, SculptedHealthBar } from './OrnateFrame';
import { PolyhedronShape } from './PolyhedralDiceOverlay';
import { TokenPortrait } from './TokenPortrait';

export const CombatDuelOverlay: React.FC = () => {
  const {
    campaign,
    role,
    myCharacter,
    activeDuel,
    rollDuelAttack,
    rollDuelDamage,
    rerollDuelAttackWithInspiration,
    triggerDuelShieldReaction,
    advanceDuelPhase,
    dismissDuel,
    cinematicEnabled,
  } = useCampaign();
  const [tickNums, setTickNums] = useState<number[]>([20, 20, 8, 6]);

  useEffect(() => {
    if (!activeDuel) return;
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
  }, [activeDuel, advanceDuelPhase]);

  if (!activeDuel) return null;

  const isReadyAttack = activeDuel.phase === 'ready-attack';
  const isAttackRolling = activeDuel.phase === 'rolling-attack';
  const isAttackResult = activeDuel.phase === 'attack-result';
  const isDamageRolling = activeDuel.phase === 'rolling-damage';
  const isDamageResult = activeDuel.phase === 'damage-result';

  // Read live HP of defender so bar drops visually in real time when damage is applied!
  const activeMap = campaign.maps.find((m) => m.id === campaign.activeMapId);
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
    (activeDuel.attackerCharacterId
      ? myCharacter?.id === activeDuel.attackerCharacterId
      : myCharacter?.name === activeDuel.attackerName);
  const displayAttackerName =
    role !== 'gm' && liveAttackerToken?.hideNameFromPlayers ? '???' : activeDuel.attackerName;
  const displayDefenderName =
    role !== 'gm' && liveDefenderToken?.hideNameFromPlayers ? '???' : activeDuel.defenderName;
  const currentDefenderHp = liveDefenderToken ? liveDefenderToken.hp : activeDuel.defenderHpBefore;
  const isHeal = activeDuel.damageType?.toLowerCase() === 'cura';
  const isDefenderMonster =
    activeDuel.defenderType === 'monster' || liveDefenderToken?.type === 'monster';
  const defenderMonsterDef =
    liveDefenderToken?.referenceId
      ? campaign.compendium.monsters.find((m) => m.id === liveDefenderToken.referenceId)
      : undefined;
  const effectiveHideAc =
    liveDefenderToken?.hideAcFromPlayers !== undefined
      ? liveDefenderToken.hideAcFromPlayers
      : defenderMonsterDef?.hideAcFromPlayers !== undefined
        ? defenderMonsterDef.hideAcFromPlayers
        : !campaign.settings.showEnemyAcToPlayers;
  const hideEnemyAc = role !== 'gm' && isDefenderMonster && effectiveHideAc;
  const displayedAc = hideEnemyAc ? '??' : activeDuel.defenderDefense;

  return (
    <div className="fixed inset-0 z-[72] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <OrnateFrame
        accentColor={activeDuel.isCrit ? '#facc15' : activeDuel.attackerColor}
        className={`rpg-glass-panel rounded-lg max-w-3xl w-full p-6 space-y-5 ${
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
          {canRollDuel && (
            <button
              onClick={dismissDuel}
              className="rpg-card p-1.5 rounded-md hover:border-amber-400 cursor-pointer shrink-0"
              title="Fechar duelo"
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
              const isAdv = badge.startsWith('+Vant:');
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

          {/* Defender + Live Ghost-Drain HP Bar */}
          <div className="md:col-span-4 rpg-card rounded-lg p-4 flex flex-col items-center text-center gap-2">
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
              {hideEnemyAc ? (
                (() => {
                  const wound = getMonsterWoundStatus(currentDefenderHp, activeDuel.defenderMaxHp);
                  return (
                    <div className="rpg-socket rounded px-2.5 py-1.5 text-xs font-display font-bold flex items-center justify-center gap-1.5">
                      <Heart className="w-3 h-3 text-red-400" />
                      <span className={wound.colorClass}>{wound.label}</span>
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
                  Aguardando <strong>{activeDuel.attackerName}</strong> rolar o ataque...
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
                        canRollDuel ? (
                          <div className="space-y-2">
                            {activeDuel.defenderCanShieldReaction && !activeDuel.reactionShieldApplied && (
                              <button
                                type="button"
                                onClick={triggerDuelShieldReaction}
                                className="px-5 py-2 rounded-md text-xs font-display font-bold flex items-center gap-2 mx-auto cursor-pointer bg-sky-900/90 hover:bg-sky-800 border-2 border-sky-400 text-sky-100 shadow-[0_0_24px_rgba(56,189,248,0.55)] animate-pulse"
                              >
                                <Shield className="w-4 h-4 text-sky-300" />
                                <span>⚡ Usar Reação: Escudo Arcano (+5 CA)!</span>
                              </button>
                            )}
                            <button
                              onClick={rollDuelDamage}
                              className="rpg-btn-crimson px-7 py-2.5 rounded-md text-sm flex items-center gap-2 mx-auto cursor-pointer shadow-xl"
                            >
                              <Sparkles className="w-4 h-4" />
                              <span>
                                Rolar {isHeal ? 'Cura' : 'Dano'} Agora ({formatFormulaForDisplay(activeDuel.damageFormula)})
                              </span>
                            </button>
                          </div>
                        ) : (
                          <div className="px-4 py-1.5 rounded-md bg-black/35 border border-amber-500/30 text-xs font-lore italic text-amber-200/85">
                            Aguardando <strong>{activeDuel.attackerName}</strong> rolar o {isHeal ? 'efeito' : 'dano'}...
                          </div>
                        )
                      ) : canRollDuel ? (
                        <button
                          onClick={dismissDuel}
                          className="rpg-btn-primary px-6 py-2 rounded-md text-xs cursor-pointer"
                        >
                          ⚔️ Disparar & Concluir Ataque
                        </button>
                      ) : (
                        <div className="px-4 py-1.5 rounded-md bg-black/35 border border-amber-500/30 text-xs font-lore italic text-amber-200/85">
                          Aguardando <strong>{activeDuel.attackerName}</strong> concluir o ataque...
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      <div className="inline-flex items-center gap-2 px-4 py-1 rounded-md bg-slate-900/80 border border-sky-400/50 text-sky-200 font-display font-bold text-xs tracking-wider">
                        <Shield className="w-4 h-4 text-sky-400" />
                        BLOQUEADO PELA DEFESA (CA {displayedAc})!
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
                                className="px-4 py-2 rounded-md text-xs font-display font-bold flex items-center gap-1.5 cursor-pointer bg-amber-950/90 hover:bg-amber-900 border border-amber-400 text-amber-200 shadow-[0_0_16px_rgba(251,191,36,0.4)]"
                                title="Gastar 1 Ponto de Inspiração Heroica para re-rolar este d20 agora!"
                              >
                                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                                <span>★ Re-rolar d20 (Inspiração {inspPts}/3)</span>
                              </button>
                            );
                          })()}
                          <button
                            onClick={dismissDuel}
                            className="rpg-card px-5 py-2 rounded-md text-xs font-display font-semibold cursor-pointer hover:border-amber-400"
                          >
                            Fechar
                          </button>
                        </div>
                      ) : (
                        <div className="px-4 py-1.5 rounded-md bg-black/35 border border-amber-500/30 text-xs font-lore italic text-amber-200/85">
                          Aguardando <strong>{activeDuel.attackerName}</strong> fechar...
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
              <div className="text-xs uppercase tracking-widest font-display font-bold text-red-300">
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
                  <div className="font-chronicle font-black text-3xl text-red-400 drop-shadow">
                    {isHeal
                      ? `+${activeDuel.damageTotal} PV de Cura!`
                      : `-${activeDuel.damageTotal} de Dano (${activeDuel.damageType || 'Físico'})!`}
                  </div>
                  <div className="text-xs text-amber-200/85 font-semibold">
                    Clique abaixo para fechar o dado, disparar a animação no mapa e aplicar em {activeDuel.defenderName}.
                  </div>
                  {canRollDuel ? (
                    <button
                      onClick={dismissDuel}
                      className="rpg-btn-primary px-6 py-2 rounded-md text-xs font-display font-bold cursor-pointer shadow-xl"
                    >
                      {isHeal ? '💚 Disparar Cura & Aplicar' : '⚔️ Disparar Golpe & Aplicar Dano'}
                    </button>
                  ) : (
                    <div className="px-4 py-1.5 rounded-md bg-black/35 border border-amber-500/30 text-xs font-lore italic text-amber-200/85">
                      Aguardando <strong>{activeDuel.attackerName}</strong> disparar o golpe no mapa...
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
