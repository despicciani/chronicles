import React, { useEffect, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Dices,
  Eye,
  EyeOff,
  Maximize2,
  Minimize2,
  Music,
  RotateCcw,
  Square,
  Trash2,
} from 'lucide-react';
import { useCampaign } from '../context/CampaignContext';
import {
  computeCharacterStats,
  ensureSurfaceCondition,
  evaluateFormula,
  getCombatantActionsRemaining,
  getCombatantBonusActionsRemaining,
  getConditionExtraEconomy,
  getMonsterWoundStatus,
} from '../shared/rulesEngine';
import { SculptedHealthBar } from './OrnateFrame';
import { TokenPortrait } from './TokenPortrait';

export const InitiativeBar: React.FC = () => {
  const {
    campaign,
    role,
    myCharacter,
    targetTokenId,
    setTargetTokenId,
    setActiveCharacterId,
    updateCampaign,
    sendRoll,
    applyDamage,
    pushCombatLog,
    triggerSlashVfx,
    startTacticalSavePrompt,
    playCharacterTheme,
    triggerOpportunityPrompt,
    startCombatFromMap,
    endCombatWithSummary,
  } = useCampaign();
  const { combat, maps, activeMapId, characters, compendium } = campaign;
  const activeMap = maps.find((m) => m.id === activeMapId);
  const [compactMode, setCompactMode] = useState<boolean>(
    () => localStorage.getItem('chronicle_compact_init') === '1'
  );
  const toggleCompactMode = () => {
    setCompactMode((prev) => {
      const next = !prev;
      localStorage.setItem('chronicle_compact_init', next ? '1' : '0');
      return next;
    });
  };

  // Spacebar shortcut to advance turn when combat is active (strictly ignored inside text inputs/buttons/modals)
  useEffect(() => {
    if (!combat.active || combat.combatants.length === 0) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        tag === 'BUTTON' ||
        el?.isContentEditable
      ) {
        return;
      }
      const activeCb = combat.combatants[combat.currentTurnIndex];
      const canPass =
        role === 'gm' ||
        Boolean(
          activeCb &&
            myCharacter &&
            (activeCb.referenceId === myCharacter.id ||
              activeCb.controlledByCharacterId === myCharacter.id)
        );
      if (!canPass) return;
      e.preventDefault();
      changeTurn(1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const endCombat = () => {
    endCombatWithSummary();
  };

  const changeTurn = (direction: 1 | -1) => {
    if (!combat.combatants.length) return;
    let nextIdx = combat.currentTurnIndex + direction;
    let nextRound = combat.round;

    if (nextIdx >= combat.combatants.length) {
      nextIdx = 0;
      nextRound += 1;
    } else if (nextIdx < 0) {
      nextIdx = combat.combatants.length - 1;
      nextRound = Math.max(1, nextRound - 1);
    }

    const activeCombatant = combat.combatants[nextIdx];
    const expiredLabels: string[] = [];
    const expiredCondIdsToRemove: Array<{ charId?: string; tokenId?: string; condId: string }> = [];

    const updatedCombatants = combat.combatants.map((cb, idx) => {
      if (direction === 1 && idx === nextIdx) {
        const nextEffects = cb.effects
          .map((ef) => ({ ...ef, remainingRounds: ef.remainingRounds - 1 }))
          .filter((ef) => {
            if (ef.remainingRounds <= 0) {
              expiredLabels.push(`${ef.label} em ${cb.name}`);
              if (ef.conditionId && (cb.referenceId || cb.tokenId)) {
                expiredCondIdsToRemove.push({
                  charId: cb.referenceId,
                  tokenId: cb.tokenId,
                  condId: ef.conditionId,
                });
              }
              return false;
            }
            return true;
          });
        const speed = cb.speedMeters ?? 9;
        const removedSet = new Set(
          expiredCondIdsToRemove
            .filter(
              (item) =>
                (item.tokenId && item.tokenId === cb.tokenId) ||
                (item.charId && cb.referenceId === item.charId)
            )
            .map((item) => item.condId)
        );
        const curCondIds = (
          cb.type === 'character'
            ? characters.find((c) => c.id === cb.referenceId)?.activeConditionIds || []
            : activeMap?.tokens.find((t) => t.id === cb.tokenId)?.activeConditionIds || []
        ).filter((cid) => !removedSet.has(cid));
        const extraEcon = getConditionExtraEconomy(curCondIds, campaign);
        const maxActs = 1 + extraEcon.extraActions;
        const maxBon = 1 + extraEcon.extraBonusActions;
        return {
          ...cb,
          remainingMoveMeters: speed,
          actionsRemaining: maxActs,
          actionAvailable: maxActs > 0,
          bonusActionsRemaining: maxBon,
          bonusActionAvailable: maxBon > 0,
          reactionAvailable: true,
          disengaged: false,
          dodging: false,
          effects: nextEffects,
        };
      }
      return cb;
    });

    triggerOpportunityPrompt(null);

    updateCampaign((prev) => ({
      ...prev,
      characters: prev.characters.map((ch) => {
        const toRemove = expiredCondIdsToRemove
          .filter((item) => item.charId === ch.id)
          .map((item) => item.condId);
        if (!toRemove.length) return ch;
        return {
          ...ch,
          activeConditionIds: ch.activeConditionIds.filter((cid) => !toRemove.includes(cid)),
        };
      }),
      maps:
        expiredCondIdsToRemove.length > 0
          ? prev.maps.map((m) =>
              m.id !== prev.activeMapId
                ? m
                : {
                    ...m,
                    tokens: m.tokens.map((tok) => {
                      const toRemove = expiredCondIdsToRemove
                        .filter(
                          (item) =>
                            (item.tokenId && item.tokenId === tok.id) ||
                            (item.charId && tok.type === 'character' && tok.referenceId === item.charId)
                        )
                        .map((item) => item.condId);
                      if (!toRemove.length) return tok;
                      return {
                        ...tok,
                        activeConditionIds: (tok.activeConditionIds || []).filter(
                          (cid) => !toRemove.includes(cid)
                        ),
                      };
                    }),
                  }
            )
          : prev.maps,
      combat: {
        ...prev.combat,
        round: nextRound,
        currentTurnIndex: nextIdx,
        combatants: updatedCombatants,
      },
    }));

    if (expiredLabels.length > 0) {
      sendRoll({
        rollerName: 'Rastreador',
        rollerRole: 'gm',
        title: `Efeito Expirado (Rodada ${nextRound})`,
        formula: 'Duração',
        individualRolls: [],
        total: 0,
        isSecret: false,
        details: `Terminou: ${expiredLabels.join(', ')}. Turno de ${activeCombatant.name}.`,
      });
    }

    if (direction === 1 && activeMap) {
      const prevCombatant = combat.combatants[combat.currentTurnIndex];

      // 1. Outgoing combatant: END-OF-TURN Condition Tick (DoT/HoT) + End-of-Turn Save to shake off condition
      if (prevCombatant && prevCombatant.hp > 0) {
        const prevTok = activeMap.tokens.find(
          (t) =>
            t.id === prevCombatant.tokenId ||
            (prevCombatant.referenceId &&
              t.type === 'character' &&
              t.referenceId === prevCombatant.referenceId)
        );
        const prevCondIds =
          prevCombatant.type === 'character'
            ? characters.find((c) => c.id === prevCombatant.referenceId)?.activeConditionIds || []
            : prevTok?.activeConditionIds || [];

        if (prevTok) {
          const prevHero =
            prevCombatant.type === 'character' && prevCombatant.referenceId
              ? characters.find((c) => c.id === prevCombatant.referenceId)
              : undefined;
          const prevStats = prevHero ? computeCharacterStats(prevHero, campaign) : undefined;
          let promptedEndSave = false;
          for (const cid of prevCondIds) {
            const cond = compendium.conditions.find((c) => c.id === cid);
            if (!cond) continue;
            if (cond.tickEffect && cond.tickEffect.trigger === 'end' && cond.tickEffect.formula.trim()) {
              const res = evaluateFormula(cond.tickEffect.formula, prevStats, prevHero);
              const val = Math.max(1, res.total);
              const isHeal = cond.tickEffect.mode === 'heal';
              const dmgType = isHeal ? 'Cura' : cond.tickEffect.damageType || 'Dano';
              window.setTimeout(() => {
                applyDamage(prevTok.id, val, isHeal, undefined, dmgType);
                triggerSlashVfx(prevTok.id, isHeal ? 'heal' : 'hit');
              }, 140);
              window.setTimeout(() => {
                pushCombatLog({
                  category: isHeal ? 'heal' : 'damage',
                  actorName: prevCombatant.name,
                  actorKind: prevCombatant.type === 'character' ? 'hero' : 'monster',
                  actorColor: prevCombatant.color,
                  summary: isHeal
                    ? `recuperou +${val} PV por ${cond.icon} ${cond.name} (Fim do Turno)`
                    : `sofreu -${val} de ${dmgType} por ${cond.icon} ${cond.name} (Fim do Turno)`,
                });
              }, 420);
            }
            if (!promptedEndSave && cond.endOfTurnSave?.skillId) {
              promptedEndSave = true;
              const sk = compendium.skills.find((s) => s.id === cond.endOfTurnSave!.skillId);
              const saveDc = cond.endOfTurnSave.dc || 12;
              window.setTimeout(() => {
                startTacticalSavePrompt({
                  kind: 'condition-save',
                  title: `Resistir: ${cond.icon} ${cond.name}`,
                  subtitle: `Fim do turno de ${prevCombatant.name} — se passar, encerra a condição!`,
                  saveSkillId: cond.endOfTurnSave!.skillId,
                  saveLabel: sk?.name || 'Salvaguarda',
                  dc: saveDc,
                  removeConditionOnPassId: cond.id,
                  tokens: [prevTok],
                });
              }, 220);
            }
          }
        }
      }

      // 2. Incoming combatant: START-OF-TURN Condition Tick (DoT/HoT) + Elemental Surface hazard check
      if (activeCombatant && activeCombatant.hp > 0) {
        const nextTok = activeMap.tokens.find(
          (t) =>
            t.id === activeCombatant.tokenId ||
            (activeCombatant.referenceId &&
              t.type === 'character' &&
              t.referenceId === activeCombatant.referenceId)
        );
        const removedOnNext = new Set(
          expiredCondIdsToRemove
            .filter(
              (item) =>
                (item.tokenId && item.tokenId === activeCombatant.tokenId) ||
                (item.charId && activeCombatant.referenceId === item.charId)
            )
            .map((item) => item.condId)
        );
        const nextCondIds = (
          activeCombatant.type === 'character'
            ? characters.find((c) => c.id === activeCombatant.referenceId)?.activeConditionIds || []
            : nextTok?.activeConditionIds || []
        ).filter((cid) => !removedOnNext.has(cid));

        if (nextTok) {
          const nextHero =
            activeCombatant.type === 'character' && activeCombatant.referenceId
              ? characters.find((c) => c.id === activeCombatant.referenceId)
              : undefined;
          const nextStats = nextHero ? computeCharacterStats(nextHero, campaign) : undefined;
          for (const cid of nextCondIds) {
            const cond = compendium.conditions.find((c) => c.id === cid);
            if (!cond?.tickEffect || cond.tickEffect.trigger !== 'start' || !cond.tickEffect.formula.trim()) {
              continue;
            }
            const res = evaluateFormula(cond.tickEffect.formula, nextStats, nextHero);
            const val = Math.max(1, res.total);
            const isHeal = cond.tickEffect.mode === 'heal';
            const dmgType = isHeal ? 'Cura' : cond.tickEffect.damageType || 'Dano';
            window.setTimeout(() => {
              applyDamage(nextTok.id, val, isHeal, undefined, dmgType);
              triggerSlashVfx(nextTok.id, isHeal ? 'heal' : 'hit');
            }, 180);
            window.setTimeout(() => {
              pushCombatLog({
                category: isHeal ? 'heal' : 'damage',
                actorName: activeCombatant.name,
                actorKind: activeCombatant.type === 'character' ? 'hero' : 'monster',
                actorColor: activeCombatant.color,
                summary: isHeal
                  ? `recuperou +${val} PV por ${cond.icon} ${cond.name} (Início do Turno)`
                  : `sofreu -${val} de ${dmgType} por ${cond.icon} ${cond.name} (Início do Turno)`,
              });
            }, 460);
          }

          // Elemental Surface start-of-turn damage (Fire / Acid)
          const standingSurf = activeMap.elementalSurfaces?.[`${nextTok.x},${nextTok.y}`];
          if (standingSurf === 'fire' || standingSurf === 'acid') {
            const surfFormula =
              standingSurf === 'fire'
                ? activeMap.surfaceConfig?.fireDamageFormula || '1d6'
                : activeMap.surfaceConfig?.acidDamageFormula || '1d4';
            const surfDmg = Math.max(1, evaluateFormula(surfFormula).total);
            const surfDmgType = standingSurf === 'fire' ? 'Fogo' : 'Ácido';
            window.setTimeout(() => {
              applyDamage(nextTok.id, surfDmg, false, undefined, surfDmgType);
              triggerSlashVfx(nextTok.id, 'hit');
            }, 240);
            window.setTimeout(() => {
              pushCombatLog({
                category: 'damage',
                actorName: activeCombatant.name,
                actorKind: activeCombatant.type === 'character' ? 'hero' : 'monster',
                actorColor: activeCombatant.color,
                summary: `iniciou o turno sobre ${surfDmgType} e sofreu -${surfDmg} de dano (${surfFormula})!`,
              });
            }, 520);
          }

          // Tactical Weather: Rain applies Molhado on turn start when weatherEffectsEnabled is active (staggered after damage to avoid Socket.IO patch race!)
          if (activeMap.weatherEffectsEnabled && activeMap.weather === 'rain') {
            const wetId =
              compendium.conditions.find((c) => /molhad/i.test(c.name) || c.id === 'cond-molhado')
                ?.id || 'cond-molhado';
            if (!nextCondIds.includes(wetId)) {
              window.setTimeout(() => {
                updateCampaign((prev) => ({
                  ...prev,
                  compendium: {
                    ...prev.compendium,
                    conditions: ensureSurfaceCondition(prev.compendium.conditions, 'cond-molhado'),
                  },
                  characters:
                    activeCombatant.type === 'character' && activeCombatant.referenceId
                      ? prev.characters.map((c) =>
                          c.id === activeCombatant.referenceId && !c.activeConditionIds.includes(wetId)
                            ? { ...c, activeConditionIds: [...c.activeConditionIds, wetId] }
                            : c
                        )
                      : prev.characters,
                  maps: prev.maps.map((m) =>
                    m.id !== activeMap.id
                      ? m
                      : {
                          ...m,
                          tokens: m.tokens.map((t) =>
                            t.id === nextTok.id && !(t.activeConditionIds || []).includes(wetId)
                              ? { ...t, activeConditionIds: [...(t.activeConditionIds || []), wetId] }
                              : t
                          ),
                        }
                  ),
                }));
              }, 580);
            }
          }
        }
      }
    }
  };

  const updateCombatantInit = (id: string, value: number) => {
    updateCampaign((prev) => {
      const sorted = prev.combat.combatants
        .map((c) => (c.id === id ? { ...c, initiative: value } : c))
        .sort((a, b) => b.initiative - a.initiative);
      return {
        ...prev,
        combat: { ...prev.combat, combatants: sorted },
      };
    });
  };

  const toggleHideCombatant = (id: string) => {
    updateCampaign((prev) => ({
      ...prev,
      combat: {
        ...prev.combat,
        combatants: prev.combat.combatants.map((c) =>
          c.id === id ? { ...c, isHidden: !c.isHidden } : c
        ),
      },
    }));
  };

  const removeCombatant = (id: string) => {
    updateCampaign((prev) => {
      const nextList = prev.combat.combatants.filter((c) => c.id !== id);
      const nextIdx = Math.min(prev.combat.currentTurnIndex, Math.max(0, nextList.length - 1));
      return {
        ...prev,
        combat: { ...prev.combat, combatants: nextList, currentTurnIndex: nextIdx },
      };
    });
  };

  const resetCombatantEconomy = (id: string) => {
    updateCampaign((prev) => {
      const aMap = prev.maps.find((m) => m.id === prev.activeMapId);
      return {
        ...prev,
        combat: {
          ...prev.combat,
          combatants: prev.combat.combatants.map((c) => {
            if (c.id !== id) return c;
            const curCondIds =
              c.type === 'character'
                ? prev.characters.find((ch) => ch.id === c.referenceId)?.activeConditionIds || []
                : aMap?.tokens.find((t) => t.id === c.tokenId)?.activeConditionIds || [];
            const extraEcon = getConditionExtraEconomy(curCondIds, prev);
            const maxActs = 1 + extraEcon.extraActions;
            const maxBon = 1 + extraEcon.extraBonusActions;
            return {
              ...c,
              remainingMoveMeters: c.speedMeters ?? 9,
              actionsRemaining: maxActs,
              actionAvailable: maxActs > 0,
              bonusActionsRemaining: maxBon,
              bonusActionAvailable: maxBon > 0,
              reactionAvailable: true,
              disengaged: false,
              dodging: false,
            };
          }),
        },
      };
    });
  };

  if (!combat.active) {
    // Iniciar Combate now lives cleanly inline inside the StageCanvas toolbar (zero overlap!)
    return null;
  }

  const visibleCombatants = combat.combatants.filter((c) => {
    if (role === 'gm' || !c.isHidden) return true;
    if (!myCharacter) return false;
    const tok = activeMap?.tokens.find((t) => t.id === c.tokenId);
    return Boolean(tok?.visibleToCharacterIds?.includes(myCharacter.id));
  });
  const currentActive = combat.combatants[combat.currentTurnIndex];
  const currentActiveId = currentActive?.id;
  const isMyTurn =
    role === 'player' &&
    myCharacter &&
    (currentActive?.referenceId === myCharacter.id ||
      currentActive?.controlledByCharacterId === myCharacter.id);

  return (
    <div
      className={`rpg-panel border-b px-3 flex items-center gap-2.5 overflow-x-auto shrink-0 z-20 relative ${
        compactMode ? 'py-1' : 'py-2'
      }`}
    >
      {/* Round & Turn Controls */}
      <div className="flex items-center gap-1.5 shrink-0 pr-2.5 border-r" style={{ borderColor: 'var(--border-subtle)' }}>
        <div className={`text-center rounded-lg rpg-card ${compactMode ? 'px-2 py-0.5 flex items-center gap-1.5' : 'px-2.5 py-0.5'}`}>
          <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            {compactMode ? 'R' : 'Rodada'}
          </div>
          <div
            className={`font-chronicle font-bold leading-none ${compactMode ? 'text-xs' : 'text-base'}`}
            style={{ color: 'var(--accent-primary)' }}
          >
            {combat.round}
          </div>
        </div>

        <button
          type="button"
          onClick={toggleCompactMode}
          className="rpg-card p-1.5 rounded hover:border-amber-400/70 cursor-pointer"
          title={
            compactMode
              ? 'Expandir barra de iniciativa completa'
              : 'Recolher barra de iniciativa (modo compacto só com nomes)'
          }
        >
          {compactMode ? (
            <Maximize2 className="w-3.5 h-3.5 text-amber-300" />
          ) : (
            <Minimize2 className="w-3.5 h-3.5 text-amber-300" />
          )}
        </button>

        {isMyTurn && (
          <button
            onClick={() => changeTurn(1)}
            className="rpg-btn-primary px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 cursor-pointer shadow-lg"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Encerrar Meu Turno</span>
          </button>
        )}

        {role === 'gm' && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => changeTurn(-1)}
              className="rpg-card p-1.5 rounded hover:opacity-80 cursor-pointer"
              title="Turno Anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => changeTurn(1)}
              className="rpg-btn-primary px-2.5 py-1.5 rounded text-xs flex items-center gap-1 cursor-pointer"
              title="Próximo Turno (decrementa duração dos efeitos)"
            >
              <span>Próximo</span>
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={startCombatFromMap}
              className="rpg-card p-1.5 rounded hover:opacity-80 cursor-pointer"
              title="Sincronizar e rerolar iniciativa dos tokens do mapa"
            >
              <Dices className="w-4 h-4" />
            </button>
            <button
              onClick={endCombat}
              className="rpg-card p-1.5 rounded text-red-400 hover:opacity-80 cursor-pointer"
              title="Encerrar Combate"
            >
              <Square className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Combatant Banners (Ordered from Highest Initiative to Lowest) */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
        {visibleCombatants.map((cb, idx) => {
          const isTurn = cb.id === currentActiveId;
          const isSelectedOnMap = Boolean(cb.tokenId && targetTokenId === cb.tokenId);

          const mapTok = cb.tokenId
            ? activeMap?.tokens.find((t) => t.id === cb.tokenId)
            : undefined;
          const displayCbName =
            role !== 'gm' && mapTok?.hideNameFromPlayers ? '???' : cb.name;

          if (compactMode) {
            return (
              <button
                key={cb.id}
                type="button"
                onClick={() => {
                  if (cb.tokenId) {
                    setTargetTokenId(isSelectedOnMap ? null : cb.tokenId);
                  }
                  if (role === 'gm' && cb.type === 'character' && cb.referenceId) {
                    setActiveCharacterId(cb.referenceId);
                  }
                }}
                title={`${displayCbName} • Init ${cb.initiative}${role === 'gm' || cb.type === 'character' ? ` • PV ${cb.hp}/${cb.maxHp}` : ''}`}
                className={`px-2.5 py-1 rounded-md text-xs font-display font-bold flex items-center gap-1.5 shrink-0 transition cursor-pointer border ${
                  isTurn
                    ? 'bg-amber-500/20 border-amber-400 text-amber-100 shadow-[0_0_12px_rgba(245,158,11,0.35)]'
                    : isSelectedOnMap
                      ? 'bg-sky-500/20 border-sky-400 text-sky-100'
                      : 'rpg-card border-white/10 hover:border-amber-400/50 opacity-85'
                } ${cb.hp <= 0 ? 'line-through opacity-45' : ''} ${cb.isHidden ? 'border-dashed opacity-60' : ''}`}
              >
                <span className="text-[10px] font-mono-dice opacity-70">{idx + 1}.</span>
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: cb.hp <= 0 ? '#ef4444' : cb.color }}
                />
                <span className="max-w-[125px] truncate">{displayCbName}</span>
                {isTurn && <span className="text-[9px] text-amber-300">◀</span>}
              </button>
            );
          }

          const linkedChar =
            cb.type === 'character' && cb.referenceId
              ? characters.find((c) => c.id === cb.referenceId)
              : undefined;
          const linkedMon =
            cb.type === 'monster' && cb.referenceId
              ? compendium.monsters.find((m) => m.id === cb.referenceId)
              : undefined;
          const portraitImg = linkedChar?.portraitUrl || mapTok?.imageUrl;
          const frameStyle =
            linkedChar?.tokenFrameStyle ||
            mapTok?.frameStyle ||
            (cb.type === 'character' ? 'gold' : 'crimson');

          return (
            <div
              key={cb.id}
              onClick={() => {
                if (cb.tokenId) {
                  setTargetTokenId(isSelectedOnMap ? null : cb.tokenId);
                }
                if (role === 'gm' && cb.type === 'character' && cb.referenceId) {
                  setActiveCharacterId(cb.referenceId);
                }
              }}
              title="Clique para selecionar e destacar este combatente no mapa"
              className={`rpg-card rounded-md px-2.5 py-1.5 min-w-[186px] shrink-0 transition relative cursor-pointer ${
                isSelectedOnMap
                  ? 'ring-2 ring-sky-400 border-sky-400/80 shadow-[0_0_14px_rgba(56,189,248,0.4)]'
                  : isTurn
                    ? 'rpg-ornate-border ring-1 ring-amber-400/70'
                    : 'hover:border-amber-400/50'
              } ${cb.isHidden ? 'opacity-60 border-dashed' : ''}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className={`text-[10px] font-chronicle font-bold px-1.5 py-0.2 rounded-xs ${
                      idx === 0 ? 'bg-amber-400 text-black' : 'bg-[#090b10] border border-amber-500/30 text-amber-200'
                    }`}
                  >
                    {idx + 1}º
                  </span>
                  <TokenPortrait
                    name={displayCbName}
                    imageUrl={portraitImg}
                    playerColor={linkedChar?.playerColor || cb.color}
                    frameStyle={frameStyle}
                    sizePx={26}
                    isDead={cb.hp <= 0}
                    iconHint={linkedMon?.type || linkedChar?.classId}
                  />
                  <span className="text-xs font-display font-bold truncate">{displayCbName}</span>
                </div>
                {role === 'gm' ? (
                  <input
                    type="number"
                    value={cb.initiative}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => updateCombatantInit(cb.id, Number(e.target.value))}
                    className="w-10 text-center text-xs font-mono-dice rpg-input py-0 px-1"
                    title="Editar Iniciativa"
                  />
                ) : (
                  <span className="text-xs font-mono-dice font-bold" style={{ color: 'var(--accent-primary)' }}>
                    {cb.initiative}
                  </span>
                )}
              </div>

              {/* Sculpted HP Bar with Ghost Drain (Exact numbers for GM & Characters; qualitative status for Monsters when hidden) */}
              {role === 'gm' || cb.type === 'character' ? (
                <div className="mt-1.5">
                  <SculptedHealthBar hp={cb.hp} maxHp={cb.maxHp} heightClass="h-1.5" />
                  <div className="flex items-center justify-between text-[10px] mt-0.5 font-mono-dice" style={{ color: 'var(--text-secondary)' }}>
                    <span>PV {cb.hp}/{cb.maxHp}</span>
                    <span>CA {cb.defense}</span>
                  </div>
                </div>
              ) : (
                (() => {
                  const wound = getMonsterWoundStatus(cb.hp, cb.maxHp);
                  const activeMap = campaign.maps.find((m) => m.id === campaign.activeMapId);
                  const matchedTok = activeMap?.tokens.find(
                    (t) => (cb.tokenId && t.id === cb.tokenId) || (cb.referenceId && t.referenceId === cb.referenceId)
                  );
                  const matchedMon = cb.referenceId
                    ? campaign.compendium.monsters.find((m) => m.id === cb.referenceId)
                    : undefined;
                  const hideAc =
                    matchedTok?.hideAcFromPlayers !== undefined
                      ? matchedTok.hideAcFromPlayers
                      : matchedMon?.hideAcFromPlayers !== undefined
                        ? matchedMon.hideAcFromPlayers
                        : !campaign.settings.showEnemyAcToPlayers;
                  const showAc = !hideAc;
                  return (
                    <div className="mt-1.5 flex items-center justify-between text-[10px] font-display">
                      <span className={`font-bold ${wound.colorClass}`}>{wound.label}</span>
                      <span className="font-mono-dice opacity-75">
                        CA {showAc ? cb.defense : '??'}
                      </span>
                    </div>
                  );
                })()
              )}

              {/* Faceted Diamond Action Economy Gems */}
              {(() => {
                const actsLeft = getCombatantActionsRemaining(cb);
                const bonLeft = getCombatantBonusActionsRemaining(cb);
                return (
              <div className="flex items-center justify-between gap-1 mt-1 text-[9px] font-display">
                <div className="flex items-center gap-1">
                  <span
                    className={`px-1 py-0.2 rounded-xs border flex items-center gap-0.5 ${
                      actsLeft > 0
                        ? 'bg-amber-950/70 border-amber-400/60 text-amber-200'
                        : 'bg-black/40 border-white/10 opacity-35 line-through'
                    }`}
                    title={`Ação Padrão (${actsLeft} restante(s))`}
                  >
                    ♦ A{actsLeft > 1 ? ` ×${actsLeft}` : ''}
                  </span>
                  <span
                    className={`px-1 py-0.2 rounded-xs border flex items-center gap-0.5 ${
                      bonLeft > 0
                        ? 'bg-sky-950/70 border-sky-400/50 text-sky-200'
                        : 'bg-black/40 border-white/10 opacity-35 line-through'
                    }`}
                    title={`Ação Bônus (${bonLeft} restante(s))`}
                  >
                    ♦ B{bonLeft > 1 ? ` ×${bonLeft}` : ''}
                  </span>
                  <span
                    className={`px-1 py-0.2 rounded-xs border flex items-center gap-0.5 ${
                      cb.reactionAvailable !== false
                        ? 'bg-purple-950/70 border-purple-400/50 text-purple-200'
                        : 'bg-black/40 border-white/10 opacity-35 line-through'
                    }`}
                    title="Reação"
                  >
                    ♦ R
                  </span>
                </div>
                <span className="text-[10px] font-mono-dice text-emerald-300 font-semibold" title="Deslocamento restante no turno">
                  {cb.remainingMoveMeters ?? cb.speedMeters ?? 9}m
                </span>
              </div>
                );
              })()}

              {/* Active Effects & Conditions (Synced for Heroes, Monsters & NPCs!) */}
              {(() => {
                const tokCondIds =
                  cb.type === 'character'
                    ? characters.find((c) => c.id === cb.referenceId)?.activeConditionIds || []
                    : activeMap?.tokens.find((t) => t.id === cb.tokenId)?.activeConditionIds || [];
                const effectCondIds = new Set(cb.effects.map((e) => e.conditionId).filter(Boolean));
                const extraConds = tokCondIds
                  .filter((cid) => !effectCondIds.has(cid))
                  .map((cid) => campaign.compendium.conditions.find((c) => c.id === cid))
                  .filter((c): c is NonNullable<typeof c> => Boolean(c));
                if (cb.effects.length === 0 && extraConds.length === 0) return null;
                return (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {cb.effects.map((ef) => (
                      <span
                        key={ef.id}
                        className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30"
                      >
                        {ef.label} ({ef.remainingRounds}r)
                      </span>
                    ))}
                    {extraConds.map((c) => (
                      <span
                        key={`cond-${c.id}`}
                        className="text-[10px] px-1.5 py-0.2 rounded bg-violet-500/20 text-violet-200 border border-violet-400/40"
                        title={c.description}
                      >
                        {c.icon} {c.name}
                      </span>
                    ))}
                  </div>
                );
              })()}

              {/* GM quick actions + Theme Song button */}
              {role === 'gm' && (
                <div className="flex items-center justify-end gap-1 mt-1">
                  {cb.type === 'character' &&
                    cb.referenceId &&
                    (() => {
                      const ch = characters.find((x) => x.id === cb.referenceId);
                      if (!ch?.themeMusicUrl) return null;
                      return (
                        <button
                          onClick={() => playCharacterTheme(ch)}
                          className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] flex items-center gap-0.5 hover:bg-amber-500/35 cursor-pointer"
                          title={`Tocar Tema Épico de ${ch.name}`}
                        >
                          <Music className="w-2.5 h-2.5" />
                          <span>Tema</span>
                        </button>
                      );
                    })()}
                  <button
                    onClick={() => resetCombatantEconomy(cb.id)}
                    className="p-0.5 text-emerald-300 opacity-70 hover:opacity-100 cursor-pointer"
                    title="Restaurar Movimento, Ação, Bônus e Reação do turno"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => toggleHideCombatant(cb.id)}
                    className="p-0.5 opacity-70 hover:opacity-100 cursor-pointer"
                    title={cb.isHidden ? 'Revelar para jogadores' : 'Ocultar dos jogadores'}
                  >
                    {cb.isHidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  </button>
                  <button
                    onClick={() => removeCombatant(cb.id)}
                    className="p-0.5 text-red-400 opacity-70 hover:opacity-100 cursor-pointer"
                    title="Remover do combate"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
