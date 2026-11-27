import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  UserPlus,
  X,
} from 'lucide-react';
import { useCampaign } from '../context/CampaignContext';
import {
  compareInitiativeOrder,
  computeCharacterStats,
  consumeCombatantEconomy,
  ensureSurfaceCondition,
  evaluateFormula,
  getCharacterAttacksPerAction,
  getCombatantActionsRemaining,
  getCombatantBonusActionsRemaining,
  getConditionExtraEconomy,
  getMonsterWoundStatus,
  isTokenNameHiddenFromPlayers,
  maskHiddenNameForRole,
} from '../shared/rulesEngine';
import { Combatant, MapToken } from '../shared/types';
import { SculptedHealthBar } from './OrnateFrame';
import { TokenPortrait } from './TokenPortrait';

export const InitiativeBar: React.FC = () => {
  const {
    campaign,
    role,
    myCharacter,
    viewedMapId,
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
  const activeMap = maps.find((m) => m.id === viewedMapId) || maps.find((m) => m.id === activeMapId);
  const [compactMode, setCompactMode] = useState<boolean>(
    () => localStorage.getItem('chronicle_compact_init') === '1'
  );
  const [showAddCombatantMenu, setShowAddCombatantMenu] = useState(false);
  const toggleCompactMode = () => {
    setCompactMode((prev) => {
      const next = !prev;
      localStorage.setItem('chronicle_compact_init', next ? '1' : '0');
      return next;
    });
  };

  const changeTurnRef = useRef<(direction: 1 | -1) => void>(() => {});

  // Spacebar shortcut to advance turn when combat is active (strictly ignored inside text inputs/buttons/modals)
  useEffect(() => {
    if (!combat.active || combat.combatants.length === 0) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector('[data-modal-overlay="true"]')) return;
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
      changeTurnRef.current(1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [combat.active, combat.combatants, combat.currentTurnIndex, myCharacter, role]);

  const endCombat = () => {
    endCombatWithSummary();
  };

  const changeTurn = (direction: 1 | -1) => {
    if (!combat.combatants.length) return;
    triggerOpportunityPrompt(null);

    let expiredDomainName: string | null = null;
    const expiredLabels: string[] = [];
    let resolvedNextRound = combat.round;
    let resolvedPrevCombatant: Combatant | undefined;
    let resolvedActiveCombatant: Combatant | undefined;
    let resolvedExpiredCondIds: Array<{ charId?: string; tokenId?: string; condId: string }> = [];

    updateCampaign((prev) => {
      if (!prev.combat.combatants.length) return prev;
      let nextIdx = prev.combat.currentTurnIndex + direction;
      let nextRound = prev.combat.round;

      if (nextIdx >= prev.combat.combatants.length) {
        nextIdx = 0;
        nextRound += 1;
      } else if (nextIdx < 0) {
        nextIdx = prev.combat.combatants.length - 1;
        nextRound = Math.max(1, nextRound - 1);
      }

      resolvedNextRound = nextRound;
      resolvedPrevCombatant = prev.combat.combatants[prev.combat.currentTurnIndex];
      resolvedActiveCombatant = prev.combat.combatants[nextIdx];
      const roundAdvanced = direction === 1 && nextRound > prev.combat.round;
      const expiredCondIdsToRemove: Array<{ charId?: string; tokenId?: string; condId: string }> = [];
      const allPrevTokens = prev.maps.flatMap((m) => m.tokens);

      const updatedCombatants = prev.combat.combatants.map((cb, idx) => {
        // 1 Reação por Rodada: quando uma nova rodada começa, todos recuperam a Reação
        const baseCb = roundAdvanced ? { ...cb, reactionAvailable: true } : cb;
        if (direction === 1 && idx === nextIdx) {
          const nextEffects = baseCb.effects
            .map((ef) => ({ ...ef, remainingRounds: ef.remainingRounds - 1 }))
            .filter((ef) => {
              if (ef.remainingRounds <= 0) {
                expiredLabels.push(`${ef.label} em ${baseCb.name}`);
                if (ef.conditionId && (baseCb.tokenId || (baseCb.type === 'character' && baseCb.referenceId))) {
                  expiredCondIdsToRemove.push({
                    charId: baseCb.type === 'character' ? baseCb.referenceId : undefined,
                    tokenId: baseCb.tokenId,
                    condId: ef.conditionId,
                  });
                }
                return false;
              }
              return true;
            });
          const speed = baseCb.speedMeters ?? 9;
          const removedSet = new Set(
            expiredCondIdsToRemove
              .filter(
                (item) =>
                  (item.tokenId && item.tokenId === baseCb.tokenId) ||
                  (baseCb.type === 'character' && item.charId && baseCb.referenceId === item.charId)
              )
              .map((item) => item.condId)
          );
          const charForCb =
            baseCb.type === 'character'
              ? prev.characters.find((c) => c.id === baseCb.referenceId)
              : undefined;
          const curCondIds = (
            baseCb.type === 'character'
              ? charForCb?.activeConditionIds || []
              : allPrevTokens.find((t) => t.id === baseCb.tokenId)?.activeConditionIds || []
          ).filter((cid) => !removedSet.has(cid));
          const extraEcon = getConditionExtraEconomy(curCondIds, prev);
          const maxActs = 1 + extraEcon.extraActions;
          const maxBon = 1 + extraEcon.extraBonusActions;

          let refreshed: Combatant = {
            ...baseCb,
            remainingMoveMeters: speed,
            actionsRemaining: maxActs,
            actionAvailable: maxActs > 0,
            bonusActionsRemaining: maxBon,
            bonusActionAvailable: maxBon > 0,
            // Preserva Reação gasta fora de turno na mesma rodada; renova apenas quando a rodada vira!
            reactionAvailable: roundAdvanced ? true : baseCb.reactionAvailable !== false,
            disengaged: false,
            dodging: false,
            extraAttacksRemaining: 0,
            readyAction: null,
            pendingOpeningCost: null,
            pendingOpeningIsWeaponAttack: false,
            revivedLostActionPending: false,
            deathSaveRolledThisTurn: false,
            effects: nextEffects,
          };

          // BG3 Opening Strike Rule: se este combatente iniciou o combate atacando e não foi o 1º da iniciativa,
          // mantém o custo da ação de abertura gasto no seu 1º turno real da Rodada 1!
          if (baseCb.pendingOpeningCost && nextRound === 1) {
            const attacksPerAction = charForCb ? getCharacterAttacksPerAction(charForCb) : 1;
            refreshed = {
              ...consumeCombatantEconomy(refreshed, baseCb.pendingOpeningCost, {
                isWeaponAttack: Boolean(baseCb.pendingOpeningIsWeaponAttack),
                attacksPerAction,
              }),
              pendingOpeningCost: null,
              pendingOpeningIsWeaponAttack: false,
            };
          }

          // BG3 Revive Rule: se foi revivido fora do turno (cura/Ajuda/Teste de Morte), perde a Ação Padrão neste turno
          if (baseCb.revivedLostActionPending) {
            refreshed = {
              ...refreshed,
              actionsRemaining: 0,
              actionAvailable: false,
              extraAttacksRemaining: 0,
              revivedLostActionPending: false,
            };
          }

          return refreshed;
        }
        return baseCb;
      });

      resolvedExpiredCondIds = expiredCondIdsToRemove;

      let nextActiveDomain = prev.activeDomain;
      if (roundAdvanced && prev.activeDomain && typeof prev.activeDomain.remainingRounds === 'number') {
        const nextRem = prev.activeDomain.remainingRounds - 1;
        if (nextRem <= 0) {
          expiredDomainName = prev.activeDomain.name;
          nextActiveDomain = null;
        } else {
          nextActiveDomain = { ...prev.activeDomain, remainingRounds: nextRem };
        }
      }

      // D&D 5e: Boss recharges Legendary Actions at the start of its own turn!
      let nextActiveBoss = prev.activeBoss;
      if (
        direction === 1 &&
        nextActiveBoss &&
        resolvedActiveCombatant &&
        (nextActiveBoss.legendaryActionsMax || 0) > 0 &&
        ((nextActiveBoss.tokenId && nextActiveBoss.tokenId === resolvedActiveCombatant.tokenId) ||
          (nextActiveBoss.monsterId &&
            resolvedActiveCombatant.type === 'monster' &&
            nextActiveBoss.monsterId === resolvedActiveCombatant.referenceId))
      ) {
        nextActiveBoss = {
          ...nextActiveBoss,
          legendaryActionsRemaining: nextActiveBoss.legendaryActionsMax,
        };
      }

      return {
        ...prev,
        activeDomain: nextActiveDomain,
        activeBoss: nextActiveBoss,
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
            ? prev.maps.map((m) => ({
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
              }))
            : prev.maps,
        combat: {
          ...prev.combat,
          round: nextRound,
          currentTurnIndex: nextIdx,
          combatants: updatedCombatants,
        },
      };
    });

    if (expiredDomainName) {
      pushCombatLog({
        category: 'system',
        actorName: 'Domínio',
        actorKind: 'system',
        summary: `O Domínio "${expiredDomainName}" atingiu sua duração máxima e se dissipou!`,
      });
    }

    if (expiredLabels.length > 0 && resolvedActiveCombatant) {
      sendRoll({
        rollerName: 'Rastreador',
        rollerRole: 'gm',
        title: `Efeito Expirado (Rodada ${resolvedNextRound})`,
        formula: 'Duração',
        individualRolls: [],
        total: 0,
        isSecret: false,
        details: `Terminou: ${expiredLabels.join(', ')}. Turno de ${resolvedActiveCombatant.name}.`,
      });
    }

    if (direction === 1) {
      const prevCombatant = resolvedPrevCombatant;
      const activeCombatant = resolvedActiveCombatant;
      const findTokenWithMap = (cb?: Combatant) => {
        if (!cb) return null;
        for (const m of maps) {
          const tok = m.tokens.find(
            (t) =>
              t.id === cb.tokenId ||
              (cb.type === 'character' &&
                cb.referenceId &&
                t.type === 'character' &&
                t.referenceId === cb.referenceId)
          );
          if (tok) return { map: m, tok };
        }
        return null;
      };

      // 1. Outgoing combatant: END-OF-TURN Condition Tick (DoT/HoT) + End-of-Turn Save to shake off condition
      if (prevCombatant && prevCombatant.hp > 0) {
        const prevFound = findTokenWithMap(prevCombatant);
        const prevTok = prevFound?.tok;
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
        const nextFound = findTokenWithMap(activeCombatant);
        const nextTok = nextFound?.tok;
        const nextTokMap = nextFound?.map;
        const removedOnNext = new Set(
          resolvedExpiredCondIds
            .filter(
              (item) =>
                (item.tokenId && item.tokenId === activeCombatant.tokenId) ||
                (activeCombatant.type === 'character' &&
                  item.charId &&
                  activeCombatant.referenceId === item.charId)
            )
            .map((item) => item.condId)
        );
        const nextCondIds = (
          activeCombatant.type === 'character'
            ? characters.find((c) => c.id === activeCombatant.referenceId)?.activeConditionIds || []
            : nextTok?.activeConditionIds || []
        ).filter((cid) => !removedOnNext.has(cid));

        if (nextTok && nextTokMap) {
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

          // Elemental Surface start-of-turn damage (Fire / Acid — flying tokens above ground are immune!)
          const standingSurf =
            (nextTok.elevationMeters || 0) <= 0
              ? nextTokMap.elementalSurfaces?.[`${nextTok.x},${nextTok.y}`]
              : undefined;
          if (standingSurf === 'fire' || standingSurf === 'acid') {
            const surfFormula =
              standingSurf === 'fire'
                ? nextTokMap.surfaceConfig?.fireDamageFormula || '1d6'
                : nextTokMap.surfaceConfig?.acidDamageFormula || '1d4';
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
          if (nextTokMap.weatherEffectsEnabled && nextTokMap.weather === 'rain') {
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
                    m.id !== nextTokMap.id
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
  changeTurnRef.current = changeTurn;

  const updateCombatantInit = (id: string, value: number) => {
    updateCampaign((prev) => {
      const currentActiveIdBefore = prev.combat.combatants[prev.combat.currentTurnIndex]?.id;
      const sorted = prev.combat.combatants
        .map((c) => (c.id === id ? { ...c, initiative: value } : c))
        .sort(compareInitiativeOrder);
      const preservedIdx = currentActiveIdBefore
        ? sorted.findIndex((c) => c.id === currentActiveIdBefore)
        : prev.combat.currentTurnIndex;
      return {
        ...prev,
        combat: {
          ...prev.combat,
          combatants: sorted,
          currentTurnIndex:
            preservedIdx >= 0
              ? preservedIdx
              : Math.min(prev.combat.currentTurnIndex, Math.max(0, sorted.length - 1)),
        },
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
      const removedIdx = prev.combat.combatants.findIndex((c) => c.id === id);
      const removedWasActive = removedIdx !== -1 && removedIdx === prev.combat.currentTurnIndex;
      const nextList = prev.combat.combatants.filter((c) => c.id !== id);
      let nextIdx = prev.combat.currentTurnIndex;
      if (removedIdx !== -1 && removedIdx < nextIdx) {
        nextIdx = Math.max(0, nextIdx - 1);
      }
      nextIdx = Math.min(nextIdx, Math.max(0, nextList.length - 1));
      const allPrevTokens = prev.maps.flatMap((m) => m.tokens);
      const refreshedList =
        removedWasActive && nextList.length > 0
          ? nextList.map((c, idx) => {
              if (idx !== nextIdx) return c;
              const curCondIds =
                c.type === 'character'
                  ? prev.characters.find((ch) => ch.id === c.referenceId)?.activeConditionIds || []
                  : allPrevTokens.find((t) => t.id === c.tokenId)?.activeConditionIds || [];
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
                disengaged: false,
                dodging: false,
                extraAttacksRemaining: 0,
                readyAction: null,
                deathSaveRolledThisTurn: false,
              };
            })
          : nextList;
      return {
        ...prev,
        combat: { ...prev.combat, combatants: refreshedList, currentTurnIndex: nextIdx },
      };
    });
  };

  const addTokensToCombat = (tokensToAdd: MapToken[]) => {
    if (!tokensToAdd.length) return;
    updateCampaign((prev) => {
      const nextCombatants = [...prev.combat.combatants];
      let nextTurnIdx = prev.combat.currentTurnIndex;
      for (const tok of tokensToAdd) {
        const alreadyIn = nextCombatants.some(
          (cb) =>
            cb.tokenId === tok.id ||
            (tok.type === 'character' && tok.referenceId && cb.referenceId === tok.referenceId)
        );
        if (alreadyIn) continue;

        let initBonus = 1;
        let speedMeters = 9;
        let tokColor = tok.color;
        let condIds = tok.activeConditionIds || [];

        if (tok.type === 'character' && tok.referenceId) {
          const ch = prev.characters.find((c) => c.id === tok.referenceId);
          if (ch) {
            const st = computeCharacterStats(ch, prev);
            initBonus = st.initiative;
            speedMeters = st.speed || 9;
            tokColor = ch.playerColor || ch.tokenColor;
            condIds = ch.activeConditionIds || [];
          }
        } else if (tok.type === 'monster' && tok.referenceId) {
          const mon = prev.compendium.monsters.find((m) => m.id === tok.referenceId);
          if (mon) {
            initBonus = mon.initiativeBonus;
            speedMeters = mon.speed || 9;
          }
        } else if (tok.type === 'npc' && tok.referenceId) {
          const npc = prev.npcs.find((n) => n.id === tok.referenceId);
          if (npc) {
            initBonus =
              npc.initiativeBonus ?? Math.floor(((npc.attributes?.['des'] ?? 10) - 10) / 2);
            speedMeters = npc.speed || 9;
          }
        }

        const d20 = Math.floor(Math.random() * 20) + 1;
        const total = d20 + initBonus;
        const extraEcon = getConditionExtraEconomy(condIds, prev);
        const maxActs = 1 + extraEcon.extraActions;
        const maxBon = 1 + extraEcon.extraBonusActions;

        const newCb = {
          id: `comb-${tok.id}-${Date.now().toString(36).slice(-3)}`,
          tokenId: tok.id,
          referenceId: tok.referenceId,
          controlledByCharacterId: tok.controlledByCharacterId,
          type: (tok.type === 'character' ? 'character' : 'monster') as 'character' | 'monster',
          name: tok.name,
          initiative: total,
          d20Roll: d20,
          initBonus,
          hp: tok.hp,
          maxHp: tok.maxHp,
          defense: tok.defense,
          speedMeters,
          remainingMoveMeters: speedMeters,
          actionsRemaining: maxActs,
          actionAvailable: maxActs > 0,
          bonusActionsRemaining: maxBon,
          bonusActionAvailable: maxBon > 0,
          reactionAvailable: true,
          disengaged: false,
          dodging: false,
          isHidden: tok.isHidden,
          color: tokColor,
          effects: [],
        };

        let insertIdx = nextCombatants.findIndex((cb) => compareInitiativeOrder(newCb, cb) < 0);
        if (insertIdx === -1) insertIdx = nextCombatants.length;
        nextCombatants.splice(insertIdx, 0, newCb);
        if (insertIdx <= nextTurnIdx && nextCombatants.length > 1) {
          nextTurnIdx += 1;
        }
      }
      return {
        ...prev,
        combat: {
          ...prev.combat,
          combatants: nextCombatants,
          currentTurnIndex: nextTurnIdx,
        },
      };
    });
    setShowAddCombatantMenu(false);
  };

  const adjustCombatantEconomy = (
    id: string,
    kind: 'action' | 'bonus' | 'reaction',
    delta: 1 | -1
  ) => {
    updateCampaign((prev) => ({
      ...prev,
      combat: {
        ...prev.combat,
        combatants: prev.combat.combatants.map((c) => {
          if (c.id !== id) return c;
          if (kind === 'action') {
            const nextRem = Math.max(0, Math.min(5, getCombatantActionsRemaining(c) + delta));
            return { ...c, actionsRemaining: nextRem, actionAvailable: nextRem > 0 };
          }
          if (kind === 'bonus') {
            const nextRem = Math.max(0, Math.min(5, getCombatantBonusActionsRemaining(c) + delta));
            return { ...c, bonusActionsRemaining: nextRem, bonusActionAvailable: nextRem > 0 };
          }
          return { ...c, reactionAvailable: delta > 0 ? true : !c.reactionAvailable };
        }),
      },
    }));
  };

  const resetCombatantEconomy = (id: string) => {
    updateCampaign((prev) => {
      const allPrevTokens = prev.maps.flatMap((m) => m.tokens);
      return {
        ...prev,
        combat: {
          ...prev.combat,
          combatants: prev.combat.combatants.map((c) => {
            if (c.id !== id) return c;
            const curCondIds =
              c.type === 'character'
                ? prev.characters.find((ch) => ch.id === c.referenceId)?.activeConditionIds || []
                : allPrevTokens.find((t) => t.id === c.tokenId)?.activeConditionIds || [];
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
              extraAttacksRemaining: 0,
              readyAction: null,
              pendingOpeningCost: null,
              pendingOpeningIsWeaponAttack: false,
              revivedLostActionPending: false,
              deathSaveRolledThisTurn: false,
            };
          }),
        },
      };
    });
  };

  const removeCombatantConditionOrEffect = (
    combatantId: string,
    opts: { effectId?: string; conditionId?: string }
  ) => {
    if (role !== 'gm') return;
    updateCampaign((prev) => {
      const targetCb = prev.combat.combatants.find((c) => c.id === combatantId);
      if (!targetCb) return prev;
      const condId = opts.conditionId;
      return {
        ...prev,
        characters:
          condId && targetCb.type === 'character' && targetCb.referenceId
            ? prev.characters.map((ch) =>
                ch.id === targetCb.referenceId
                  ? { ...ch, activeConditionIds: ch.activeConditionIds.filter((id) => id !== condId) }
                  : ch
              )
            : prev.characters,
        maps: condId
          ? prev.maps.map((m) => ({
              ...m,
              tokens: m.tokens.map((t) => {
                const isMatch =
                  (targetCb.tokenId && t.id === targetCb.tokenId) ||
                  (targetCb.type === 'character' &&
                    targetCb.referenceId &&
                    t.type === 'character' &&
                    t.referenceId === targetCb.referenceId);
                if (!isMatch) return t;
                return {
                  ...t,
                  activeConditionIds: (t.activeConditionIds || []).filter((id) => id !== condId),
                };
              }),
            }))
          : prev.maps,
        combat: {
          ...prev.combat,
          combatants: prev.combat.combatants.map((c) =>
            c.id !== combatantId
              ? c
              : {
                  ...c,
                  effects: c.effects.filter(
                    (ef) =>
                      (opts.effectId ? ef.id !== opts.effectId : true) &&
                      (condId ? ef.conditionId !== condId : true)
                  ),
                }
          ),
        },
      };
    });
  };

  if (!combat.active) {
    // Iniciar Combate now lives cleanly inline inside the StageCanvas toolbar (zero overlap!)
    return null;
  }

  const allMapTokens = maps.flatMap((m) => m.tokens);
  const visibleCombatants = combat.combatants.filter((c) => {
    if (role === 'gm' || !c.isHidden) return true;
    if (!myCharacter) return false;
    const tok = allMapTokens.find((t) => t.id === c.tokenId);
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
      className={`fixed top-[52px] left-1/2 -translate-x-1/2 z-25 max-w-[calc(100vw-240px)] rpg-glass-panel rpg-grain rounded-lg px-2.5 flex items-center gap-2 overflow-x-auto animate-ui-enter ${
        compactMode ? 'py-1' : 'py-1.5'
      }`}
    >
      {/* Round & Turn Controls */}
      <div
        className="flex items-center gap-1.5 shrink-0 pr-2 border-r"
        style={{ borderColor: 'var(--border-hairline)' }}
      >
        <div
          className={`text-center rounded rpg-socket ${
            compactMode ? 'px-2 py-0.5 flex items-center gap-1.5' : 'px-2 py-0.5 min-w-[44px]'
          }`}
        >
          <div className="text-[9px] font-display uppercase tracking-[0.14em] text-[#8c8374]">
            {compactMode ? 'R' : 'Rodada'}
          </div>
          <div
            className={`font-mono-dice font-bold leading-none text-[#d4ad5c] ${
              compactMode ? 'text-xs' : 'text-sm mt-0.5'
            }`}
          >
            {combat.round}
          </div>
        </div>

        <button
          type="button"
          onClick={toggleCompactMode}
          className="rpg-card w-7 h-7 rounded flex items-center justify-center text-[#a69b88] hover:text-[#ece4d5] cursor-pointer"
          title={
            compactMode
              ? 'Expandir barra de iniciativa completa'
              : 'Recolher barra de iniciativa (modo compacto)'
          }
        >
          {compactMode ? (
            <Maximize2 className="w-3.5 h-3.5" />
          ) : (
            <Minimize2 className="w-3.5 h-3.5" />
          )}
        </button>

        {isMyTurn && (
          <button
            type="button"
            onClick={() => changeTurn(1)}
            className="rpg-btn-primary h-7 px-2.5 rounded text-[11px] flex items-center gap-1 cursor-pointer"
            title="Encerrar seu turno (Espaço)"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Passar Turno</span>
          </button>
        )}

        {role === 'gm' && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => changeTurn(-1)}
              className="rpg-card w-7 h-7 rounded flex items-center justify-center cursor-pointer"
              title="Turno Anterior"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => changeTurn(1)}
              className="rpg-btn-primary h-7 px-2.5 rounded text-[11px] flex items-center gap-1 cursor-pointer"
              title="Próximo Turno (Espaço)"
            >
              <span>Próximo</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setShowAddCombatantMenu((v) => !v)}
              className={`w-7 h-7 rounded flex items-center justify-center cursor-pointer transition ${
                showAddCombatantMenu ? 'rpg-btn-primary' : 'rpg-card text-[#86d9a8]'
              }`}
              title="Adicionar token do mapa ao combate"
            >
              <UserPlus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => startCombatFromMap({ forceReroll: true })}
              className="rpg-card w-7 h-7 rounded flex items-center justify-center text-[#d4ad5c] cursor-pointer"
              title="Sincronizar e rerolar iniciativa dos tokens do mapa"
            >
              <Dices className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={endCombat}
              className="rpg-card w-7 h-7 rounded flex items-center justify-center text-[#d6575b] hover:border-[#9e2427]/70 cursor-pointer"
              title="Encerrar Combate"
            >
              <Square className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Combatant Banners (Ordered from Highest Initiative to Lowest) */}
      <div className="flex items-center gap-1.5 overflow-x-auto">
        {visibleCombatants.map((cb, idx) => {
          const isTurn = cb.id === currentActiveId;
          const isSelectedOnMap = Boolean(cb.tokenId && targetTokenId === cb.tokenId);

          const mapTok = cb.tokenId
            ? allMapTokens.find((t) => t.id === cb.tokenId)
            : undefined;
          const displayCbName =
            role !== 'gm' && isTokenNameHiddenFromPlayers(mapTok, campaign)
              ? '???'
              : maskHiddenNameForRole(cb.name, role, campaign, cb.tokenId);

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
                className={`relative h-7 px-2.5 rounded text-[11px] font-display font-semibold flex items-center gap-1.5 shrink-0 transition cursor-pointer border ${
                  isTurn
                    ? 'bg-[#251e12] border-[#d4ad5c]/80 text-[#f7e6bd]'
                    : isSelectedOnMap
                      ? 'bg-[#142030] border-[#4a90d9]/75 text-[#d4e8fa]'
                      : 'rpg-card text-[#c8bfb0] opacity-85 hover:opacity-100'
                } ${cb.hp <= 0 ? 'line-through opacity-45' : ''} ${cb.isHidden ? 'border-dashed opacity-60' : ''}`}
              >
                {isTurn && <span className="absolute top-0 inset-x-1.5 h-[2px] bg-[#d4ad5c]" />}
                <span className="text-[10px] font-mono-dice text-[#8c8374]">{idx + 1}</span>
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: cb.hp <= 0 ? '#b32428' : cb.color }}
                />
                <span className="max-w-[120px] truncate">{displayCbName}</span>
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
              className={`rounded px-2 py-1.5 min-w-[168px] shrink-0 transition relative cursor-pointer border ${
                isSelectedOnMap
                  ? 'bg-[#131d2b] border-[#4a90d9]/80'
                  : isTurn
                    ? 'bg-[#1e1912] border-[#d4ad5c]/80'
                    : 'rpg-card'
              } ${cb.isHidden ? 'opacity-60 border-dashed' : ''}`}
            >
              {isTurn && (
                <div className="absolute top-0 inset-x-0 h-[2px] bg-[#d4ad5c] rounded-t" />
              )}
              <div className="flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className={`text-[9px] font-mono-dice font-bold px-1 py-0.5 rounded-[2px] leading-none ${
                      isTurn
                        ? 'bg-[#d4ad5c] text-[#140e04]'
                        : 'bg-[#090b10] border border-[#b89146]/25 text-[#a69b88]'
                    }`}
                  >
                    {idx + 1}
                  </span>
                  <TokenPortrait
                    name={displayCbName}
                    imageUrl={portraitImg}
                    playerColor={linkedChar?.playerColor || cb.color}
                    frameStyle={frameStyle}
                    sizePx={24}
                    isDead={cb.hp <= 0}
                    iconHint={linkedMon?.type || linkedChar?.classId}
                  />
                  <span className="text-[11px] font-display font-bold truncate text-[#ece4d5]">
                    {displayCbName}
                  </span>
                </div>
                {role === 'gm' ? (
                  <input
                    type="number"
                    value={cb.initiative}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => updateCombatantInit(cb.id, Number(e.target.value))}
                    className="w-9 text-center text-[11px] font-mono-dice rpg-input py-0 px-0.5"
                    title="Editar Iniciativa"
                  />
                ) : (
                  <span className="text-[11px] font-mono-dice font-bold text-[#d4ad5c]">
                    {cb.initiative}
                  </span>
                )}
              </div>

              {/* Sculpted HP Bar with Ghost Drain */}
              {role === 'gm' || cb.type === 'character' ? (
                <div className="mt-1">
                  <SculptedHealthBar hp={cb.hp} maxHp={cb.maxHp} heightClass="h-1.5" />
                  <div className="flex items-center justify-between text-[9px] mt-0.5 font-mono-dice text-[#a69b88]">
                    <span>
                      PV {cb.hp}/{cb.maxHp}
                    </span>
                    <span>CA {cb.defense}</span>
                  </div>
                </div>
              ) : (
                (() => {
                  const wound = getMonsterWoundStatus(cb.hp, cb.maxHp);
                  const matchedTok = allMapTokens.find(
                    (t) =>
                      (cb.tokenId && t.id === cb.tokenId) ||
                      (cb.type === 'character' &&
                        cb.referenceId &&
                        t.type === 'character' &&
                        t.referenceId === cb.referenceId)
                  );
                  const matchedMon = cb.referenceId
                    ? campaign.compendium.monsters.find((m) => m.id === cb.referenceId)
                    : undefined;
                  const matchedNpc = cb.referenceId
                    ? campaign.npcs.find((n) => n.id === cb.referenceId)
                    : undefined;
                  const hideAc =
                    matchedTok?.hideAcFromPlayers !== undefined
                      ? matchedTok.hideAcFromPlayers
                      : matchedNpc?.hideAcFromPlayers !== undefined
                        ? matchedNpc.hideAcFromPlayers
                        : matchedMon?.hideAcFromPlayers !== undefined
                          ? matchedMon.hideAcFromPlayers
                          : !campaign.settings.showEnemyAcToPlayers;
                  const hideHp = Boolean(
                    matchedTok?.hideHpFromPlayers !== undefined
                      ? matchedTok.hideHpFromPlayers
                      : matchedNpc?.hideHpFromPlayers !== undefined
                        ? matchedNpc.hideHpFromPlayers
                        : matchedMon?.hideHpFromPlayers
                  );
                  const showAc = !hideAc;
                  return (
                    <div className="mt-1 flex items-center justify-between text-[10px] font-display">
                      <span className={`font-semibold ${hideHp ? 'text-slate-400' : wound.colorClass}`}>
                        {hideHp ? 'PV ??' : wound.label}
                      </span>
                      <span className="font-mono-dice text-[#a69b88]">
                        CA {showAc ? cb.defense : '??'}
                      </span>
                    </div>
                  );
                })()
              )}

              {/* Restrained Faceted Action Economy Pips (GM can click to grant +1 Ação / +1 Bônus / Toggle Reação anytime!) */}
              {(() => {
                const actsLeft = getCombatantActionsRemaining(cb);
                const bonLeft = getCombatantBonusActionsRemaining(cb);
                const isGm = role === 'gm';
                return (
                  <div className="flex items-center justify-between gap-1 mt-1 text-[9px] font-mono-dice">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={!isGm}
                        onClick={(e) => {
                          if (!isGm) return;
                          e.stopPropagation();
                          adjustCombatantEconomy(cb.id, 'action', 1);
                        }}
                        onContextMenu={(e) => {
                          if (!isGm) return;
                          e.preventDefault();
                          e.stopPropagation();
                          adjustCombatantEconomy(cb.id, 'action', -1);
                        }}
                        className={`px-1 py-0.2 rounded-[2px] border ${
                          isGm ? 'cursor-pointer hover:brightness-125' : 'cursor-default'
                        } ${
                          actsLeft > 0
                            ? 'bg-[#261f12] border-[#b89146]/55 text-[#e8c683]'
                            : 'bg-[#090b10] border-white/10 text-[#6c6457] line-through'
                        }`}
                        title={
                          isGm
                            ? `Ação Padrão (${actsLeft}) — Clique: +1 Ação | Botão direito: -1`
                            : `Ação Padrão (${actsLeft} restante)`
                        }
                      >
                        A{actsLeft > 1 ? `×${actsLeft}` : ''}
                      </button>
                      <button
                        type="button"
                        disabled={!isGm}
                        onClick={(e) => {
                          if (!isGm) return;
                          e.stopPropagation();
                          adjustCombatantEconomy(cb.id, 'bonus', 1);
                        }}
                        onContextMenu={(e) => {
                          if (!isGm) return;
                          e.preventDefault();
                          e.stopPropagation();
                          adjustCombatantEconomy(cb.id, 'bonus', -1);
                        }}
                        className={`px-1 py-0.2 rounded-[2px] border ${
                          isGm ? 'cursor-pointer hover:brightness-125' : 'cursor-default'
                        } ${
                          bonLeft > 0
                            ? 'bg-[#122230] border-[#3b72a8]/55 text-[#9bc5eb]'
                            : 'bg-[#090b10] border-white/10 text-[#6c6457] line-through'
                        }`}
                        title={
                          isGm
                            ? `Ação Bônus (${bonLeft}) — Clique: +1 Bônus | Botão direito: -1`
                            : `Ação Bônus (${bonLeft} restante)`
                        }
                      >
                        B{bonLeft > 1 ? `×${bonLeft}` : ''}
                      </button>
                      <button
                        type="button"
                        disabled={!isGm}
                        onClick={(e) => {
                          if (!isGm) return;
                          e.stopPropagation();
                          adjustCombatantEconomy(cb.id, 'reaction', -1);
                        }}
                        className={`px-1 py-0.2 rounded-[2px] border ${
                          isGm ? 'cursor-pointer hover:brightness-125' : 'cursor-default'
                        } ${
                          cb.reactionAvailable !== false
                            ? 'bg-[#1f162d] border-[#9561ce]/50 text-[#cfb3f2]'
                            : 'bg-[#090b10] border-white/10 text-[#6c6457] line-through'
                        }`}
                        title={
                          isGm
                            ? 'Reação — Clique para devolver ou gastar Reação'
                            : 'Reação'
                        }
                      >
                        R
                      </button>
                      {(cb.extraAttacksRemaining ?? 0) > 0 && (
                        <span
                          className="px-1 py-0.2 rounded-[2px] border bg-amber-950/80 border-amber-400/65 text-amber-200 font-bold"
                          title={`Ataque Extra D&D 5e: +${cb.extraAttacksRemaining} ataque(s) de arma/agarrar/empurrar restante(s) nesta Ação`}
                        >
                          +{cb.extraAttacksRemaining} Atq
                        </span>
                      )}
                      {cb.readyAction && (
                        <span
                          className="px-1 py-0.2 rounded-[2px] border bg-cyan-950/85 border-cyan-400/70 text-cyan-200 font-bold"
                          title={
                            cb.readyAction.trigger
                              ? `Ação Preparada (Gatilho: "${cb.readyAction.trigger}") — pode disparar fora do turno gastando a Reação`
                              : 'Ação Preparada — pode disparar um ataque/habilidade Padrão fora do turno gastando a Reação'
                          }
                        >
                          Prep
                        </span>
                      )}
                      {cb.revivedLostActionPending && (
                        <span
                          className="px-1 py-0.2 rounded-[2px] border bg-rose-950/85 border-rose-400/70 text-rose-200 font-bold"
                          title="Regra BG3: revivido fora de turno — começará o próximo turno sem Ação Padrão (mantém Movimento e Bônus)"
                        >
                          -Ação
                        </span>
                      )}
                    </div>
                    <span
                      className="text-[9px] font-mono-dice text-[#74c997] font-semibold"
                      title="Deslocamento restante no turno"
                    >
                      {cb.remainingMoveMeters ?? cb.speedMeters ?? 9}m
                    </span>
                  </div>
                );
              })()}

              {/* Active Effects & Real Token Conditions (Always synced to real activeConditionIds!) */}
              {(() => {
                const tokCondIds =
                  cb.type === 'character'
                    ? characters.find((c) => c.id === cb.referenceId)?.activeConditionIds || []
                    : allMapTokens.find((t) => t.id === cb.tokenId)?.activeConditionIds || [];
                const realCondSet = new Set(tokCondIds);
                const condByLowerName = new Map<string, string>();
                campaign.compendium.conditions.forEach((cd) =>
                  condByLowerName.set(cd.name.trim().toLowerCase(), cd.id)
                );

                // Only display timed effects whose linked condition is STILL active on the token/character
                const liveTimedEffects = cb.effects.filter((ef) => {
                  if (ef.conditionId) return realCondSet.has(ef.conditionId);
                  const matchedCondId = condByLowerName.get(ef.label.trim().toLowerCase());
                  return matchedCondId ? realCondSet.has(matchedCondId) : true;
                });
                const timedCondIds = new Set(
                  liveTimedEffects
                    .map((e) => e.conditionId || condByLowerName.get(e.label.trim().toLowerCase()))
                    .filter((id): id is string => Boolean(id))
                );
                const realUntimedConds = tokCondIds
                  .filter((cid) => !timedCondIds.has(cid))
                  .map((cid) => campaign.compendium.conditions.find((c) => c.id === cid))
                  .filter((c): c is NonNullable<typeof c> => Boolean(c));

                if (liveTimedEffects.length === 0 && realUntimedConds.length === 0) return null;
                const isGm = role === 'gm';
                return (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {liveTimedEffects.map((ef) => {
                      const condDef = ef.conditionId
                        ? campaign.compendium.conditions.find((c) => c.id === ef.conditionId)
                        : undefined;
                      const label = condDef?.name || ef.label;
                      return (
                        <button
                          key={ef.id}
                          type="button"
                          disabled={!isGm}
                          onClick={(e) => {
                            if (!isGm) return;
                            e.stopPropagation();
                            removeCombatantConditionOrEffect(cb.id, {
                              effectId: ef.id,
                              conditionId:
                                ef.conditionId ||
                                condByLowerName.get(ef.label.trim().toLowerCase()),
                            });
                          }}
                          className={`group text-[9px] px-1 py-0.2 rounded-[2px] bg-[#241d11] text-[#e8c683] border border-[#b89146]/35 inline-flex items-center gap-1 ${
                            isGm ? 'hover:bg-[#3d1619] hover:border-red-400/60 hover:text-red-200 cursor-pointer' : 'cursor-default'
                          }`}
                          title={
                            isGm
                              ? `${label} (${ef.remainingRounds}r) — Clique para remover`
                              : condDef?.description || `${label} (${ef.remainingRounds} rodadas restantes)`
                          }
                        >
                          <span>
                            {label} ({ef.remainingRounds}r)
                          </span>
                          {isGm && <X className="w-2.5 h-2.5 opacity-55 group-hover:opacity-100" />}
                        </button>
                      );
                    })}
                    {realUntimedConds.map((c) => (
                      <button
                        key={`cond-${c.id}`}
                        type="button"
                        disabled={!isGm}
                        onClick={(e) => {
                          if (!isGm) return;
                          e.stopPropagation();
                          removeCombatantConditionOrEffect(cb.id, { conditionId: c.id });
                        }}
                        className={`group text-[9px] px-1 py-0.2 rounded-[2px] bg-[#1d152b] text-[#cfb3f2] border border-[#9561ce]/40 inline-flex items-center gap-1 ${
                          isGm ? 'hover:bg-[#3d1619] hover:border-red-400/60 hover:text-red-200 cursor-pointer' : 'cursor-default'
                        }`}
                        title={isGm ? `${c.name} — Clique para remover` : c.description}
                      >
                        <span>{c.name}</span>
                        {isGm && <X className="w-2.5 h-2.5 opacity-55 group-hover:opacity-100" />}
                      </button>
                    ))}
                  </div>
                );
              })()}

              {/* GM quick actions */}
              {role === 'gm' && (
                <div className="flex items-center justify-end gap-1 mt-1 pt-1 border-t border-white/5">
                  {cb.type === 'character' &&
                    cb.referenceId &&
                    (() => {
                      const ch = characters.find((x) => x.id === cb.referenceId);
                      if (!ch?.themeMusicUrl) return null;
                      return (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            playCharacterTheme(ch);
                          }}
                          className="px-1.5 py-0.5 rounded bg-[#241d11] text-[#d4ad5c] text-[9px] flex items-center gap-0.5 hover:bg-[#332917] cursor-pointer"
                          title={`Tocar Tema de ${ch.name}`}
                        >
                          <Music className="w-2.5 h-2.5" />
                          <span>Tema</span>
                        </button>
                      );
                    })()}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      resetCombatantEconomy(cb.id);
                    }}
                    className="p-0.5 text-[#74c997] opacity-70 hover:opacity-100 cursor-pointer"
                    title="Restaurar Movimento, Ação, Bônus e Reação do turno"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleHideCombatant(cb.id);
                    }}
                    className="p-0.5 text-[#a69b88] opacity-70 hover:opacity-100 cursor-pointer"
                    title={cb.isHidden ? 'Revelar para jogadores' : 'Ocultar dos jogadores'}
                  >
                    {cb.isHidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeCombatant(cb.id);
                    }}
                    className="p-0.5 text-[#d6575b] opacity-70 hover:opacity-100 cursor-pointer"
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

      {/* GM Add Missing Map Tokens into Active Combat Popover — rendered via Portal to document.body so overflow-x-auto NEVER clips it! */}
      {role === 'gm' &&
        showAddCombatantMenu &&
        activeMap &&
        typeof document !== 'undefined' &&
        createPortal(
          (() => {
            const missingTokens = activeMap.tokens.filter(
              (tok) =>
                !combat.combatants.some(
                  (cb) =>
                    cb.tokenId === tok.id ||
                    (tok.type === 'character' && tok.referenceId && cb.referenceId === tok.referenceId)
                )
            );
            return (
              <div
                className="fixed top-[106px] left-1/2 -translate-x-1/2 z-[110] w-72 rpg-glass-panel rpg-grain rounded-lg p-3 shadow-2xl border border-[#b89146]/55 space-y-2 text-xs animate-popover"
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  className="flex items-center justify-between gap-2 border-b pb-1.5"
                  style={{ borderColor: 'var(--border-hairline)' }}
                >
                  <span className="font-display font-bold text-[11px] uppercase tracking-wider text-[#e8c683] flex items-center gap-1.5">
                    <UserPlus className="w-3.5 h-3.5" /> Adicionar ao Combate
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowAddCombatantMenu(false)}
                    className="text-[#a69b88] hover:text-[#ece4d5] cursor-pointer text-xs"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                {missingTokens.length === 0 ? (
                  <div className="text-[11px] italic text-[#8c8374] py-2 text-center">
                    Todos os tokens deste mapa já estão na ordem de iniciativa.
                  </div>
                ) : (
                  <>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {missingTokens.map((tok) => (
                        <button
                          key={tok.id}
                          type="button"
                          onClick={() => addTokensToCombat([tok])}
                          className="w-full rpg-card px-2.5 py-1.5 rounded flex items-center justify-between gap-2 hover:border-[#86d9a8]/70 cursor-pointer text-left"
                        >
                          <span className="flex items-center gap-1.5 min-w-0">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: tok.color }}
                            />
                            <span className="font-display font-semibold truncate">{tok.name}</span>
                          </span>
                          <span className="text-[10px] text-[#86d9a8] font-bold shrink-0">+ Entrar</span>
                        </button>
                      ))}
                    </div>
                    {missingTokens.length > 1 && (
                      <button
                        type="button"
                        onClick={() => addTokensToCombat(missingTokens)}
                        className="w-full rpg-btn-primary py-1.5 rounded text-[11px] font-display font-bold cursor-pointer"
                      >
                        Adicionar Todos ({missingTokens.length})
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })(),
          document.body
        )}
    </div>
  );
};
