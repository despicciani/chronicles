import React from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Dices,
  Eye,
  EyeOff,
  Music,
  Play,
  RotateCcw,
  Square,
  Trash2,
} from 'lucide-react';
import { useCampaign } from '../context/CampaignContext';
import { computeCharacterStats } from '../shared/rulesEngine';
import { Combatant, InitiativeCeremonyEntry } from '../shared/types';
import { SculptedHealthBar } from './OrnateFrame';
import { TokenPortrait } from './TokenPortrait';

export const InitiativeBar: React.FC = () => {
  const {
    campaign,
    role,
    myCharacter,
    updateCampaign,
    sendRoll,
    playCharacterTheme,
    showInitiativeCeremony,
    triggerOpportunityPrompt,
  } = useCampaign();
  const { combat, maps, activeMapId, characters, compendium } = campaign;
  const activeMap = maps.find((m) => m.id === activeMapId);

  const startCombatFromMap = () => {
    const tokens = activeMap?.tokens || [];
    const ceremonyEntries: InitiativeCeremonyEntry[] = [];

    const combatants: Combatant[] = tokens.map((tok) => {
      let initBonus = 1;
      let speedMeters = 9;
      let portraitUrl = tok.imageUrl;
      let frameStyle = tok.frameStyle;
      let tokColor = tok.color;

      if (tok.type === 'character' && tok.referenceId) {
        const ch = characters.find((c) => c.id === tok.referenceId);
        if (ch) {
          const stats = computeCharacterStats(ch, campaign);
          initBonus = stats.initiative;
          speedMeters = stats.speed || 9;
          portraitUrl = ch.portraitUrl || portraitUrl;
          frameStyle = ch.tokenFrameStyle || frameStyle;
          tokColor = ch.playerColor || ch.tokenColor;
        }
      } else if (tok.type === 'monster' && tok.referenceId) {
        const mon = compendium.monsters.find((m) => m.id === tok.referenceId);
        if (mon) {
          initBonus = mon.initiativeBonus;
          speedMeters = mon.speed || 9;
        }
      }
      const d20 = Math.floor(Math.random() * 20) + 1;
      const total = d20 + initBonus;

      if (!tok.isHidden) {
        ceremonyEntries.push({
          id: `cer-${tok.id}`,
          name: tok.name,
          type: tok.type === 'character' ? 'character' : 'monster',
          color: tokColor,
          imageUrl: portraitUrl,
          frameStyle,
          d20Roll: d20,
          bonus: initBonus,
          total,
        });
      }

      return {
        id: `comb-${tok.id}`,
        tokenId: tok.id,
        referenceId: tok.referenceId,
        type: tok.type === 'character' ? 'character' : 'monster',
        name: tok.name,
        initiative: total,
        hp: tok.hp,
        maxHp: tok.maxHp,
        defense: tok.defense,
        speedMeters,
        remainingMoveMeters: speedMeters,
        actionAvailable: true,
        bonusActionAvailable: true,
        reactionAvailable: true,
        disengaged: false,
        dodging: false,
        isHidden: tok.isHidden,
        color: tokColor,
        effects: [],
      };
    });

    combatants.sort((a, b) => b.initiative - a.initiative);

    updateCampaign((prev) => ({
      ...prev,
      combat: {
        active: true,
        round: 1,
        currentTurnIndex: 0,
        combatants,
      },
    }));

    if (ceremonyEntries.length > 0) {
      showInitiativeCeremony({
        id: `init-${Date.now()}`,
        entries: ceremonyEntries,
      });
    }

    sendRoll({
      rollerName: 'Combate',
      rollerRole: 'gm',
      title: 'Iniciativa Rolada!',
      formula: `${combatants.length} combatentes`,
      individualRolls: combatants.map((c) => `${c.name}: ${c.initiative}`),
      total: combatants[0]?.initiative ?? 0,
      isSecret: false,
      details: combatants.map((c, idx) => `${idx + 1}º ${c.name} (${c.initiative})`).join(' → '),
    });
  };

  const endCombat = () => {
    updateCampaign((prev) => ({
      ...prev,
      combat: {
        active: false,
        round: 1,
        currentTurnIndex: 0,
        combatants: [],
      },
    }));
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
    const expiredCondIdsToRemove: Array<{ charId?: string; condId: string }> = [];

    const updatedCombatants = combat.combatants.map((cb, idx) => {
      if (direction === 1 && idx === nextIdx) {
        const nextEffects = cb.effects
          .map((ef) => ({ ...ef, remainingRounds: ef.remainingRounds - 1 }))
          .filter((ef) => {
            if (ef.remainingRounds <= 0) {
              expiredLabels.push(`${ef.label} em ${cb.name}`);
              if (ef.conditionId && cb.referenceId) {
                expiredCondIdsToRemove.push({ charId: cb.referenceId, condId: ef.conditionId });
              }
              return false;
            }
            return true;
          });
        const speed = cb.speedMeters ?? 9;
        return {
          ...cb,
          remainingMoveMeters: speed,
          actionAvailable: true,
          bonusActionAvailable: true,
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
    updateCampaign((prev) => ({
      ...prev,
      combat: {
        ...prev.combat,
        combatants: prev.combat.combatants.map((c) =>
          c.id !== id
            ? c
            : {
                ...c,
                remainingMoveMeters: c.speedMeters ?? 9,
                actionAvailable: true,
                bonusActionAvailable: true,
                reactionAvailable: true,
                disengaged: false,
                dodging: false,
              }
        ),
      },
    }));
  };

  if (!combat.active) {
    if (role !== 'gm') return null;
    return (
      <div className="fixed top-16 left-4 z-25 pointer-events-auto">
        <button
          onClick={startCombatFromMap}
          className="rpg-btn-crimson px-3.5 py-1.5 rounded-md text-xs flex items-center gap-1.5 cursor-pointer shadow-xl"
          title="Puxar tokens do mapa e iniciar ordem de turnos"
        >
          <Play className="w-3.5 h-3.5" />
          Iniciar Combate
        </button>
      </div>
    );
  }

  const visibleCombatants = combat.combatants.filter((c) => role === 'gm' || !c.isHidden);
  const currentActive = combat.combatants[combat.currentTurnIndex];
  const currentActiveId = currentActive?.id;
  const isMyTurn =
    role === 'player' &&
    myCharacter &&
    currentActive?.referenceId === myCharacter.id;

  return (
    <div className="rpg-panel border-b px-3 py-2 flex items-center gap-3 overflow-x-auto shrink-0 z-20 relative">
      {/* Round & Turn Controls */}
      <div className="flex items-center gap-2 shrink-0 pr-3 border-r" style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="text-center px-2.5 py-0.5 rounded-lg rpg-card">
          <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            Rodada
          </div>
          <div className="font-chronicle font-bold text-base leading-none" style={{ color: 'var(--accent-primary)' }}>
            {combat.round}
          </div>
        </div>

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
      <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
        {visibleCombatants.map((cb, idx) => {
          const isTurn = cb.id === currentActiveId;
          const linkedChar =
            cb.type === 'character' && cb.referenceId
              ? characters.find((c) => c.id === cb.referenceId)
              : undefined;
          const linkedMon =
            cb.type === 'monster' && cb.referenceId
              ? compendium.monsters.find((m) => m.id === cb.referenceId)
              : undefined;
          const mapTok = cb.tokenId
            ? activeMap?.tokens.find((t) => t.id === cb.tokenId)
            : undefined;
          const portraitImg = linkedChar?.portraitUrl || mapTok?.imageUrl;
          const frameStyle =
            linkedChar?.tokenFrameStyle ||
            mapTok?.frameStyle ||
            (cb.type === 'character' ? 'gold' : 'crimson');

          return (
            <div
              key={cb.id}
              className={`rpg-card rounded-md px-2.5 py-1.5 min-w-[186px] shrink-0 transition relative ${
                isTurn ? 'rpg-ornate-border ring-1 ring-amber-400/70' : ''
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
                    name={cb.name}
                    imageUrl={portraitImg}
                    playerColor={linkedChar?.playerColor || cb.color}
                    frameStyle={frameStyle}
                    sizePx={26}
                    isDead={cb.hp <= 0}
                    iconHint={linkedMon?.type || linkedChar?.classId}
                  />
                  <span className="text-xs font-display font-bold truncate">{cb.name}</span>
                </div>
                {role === 'gm' ? (
                  <input
                    type="number"
                    value={cb.initiative}
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

              {/* Sculpted HP Bar with Ghost Drain */}
              {(role === 'gm' || cb.type === 'character') && (
                <div className="mt-1.5">
                  <SculptedHealthBar hp={cb.hp} maxHp={cb.maxHp} heightClass="h-1.5" />
                  <div className="flex items-center justify-between text-[10px] mt-0.5 font-mono-dice" style={{ color: 'var(--text-secondary)' }}>
                    <span>PV {cb.hp}/{cb.maxHp}</span>
                    <span>CA {cb.defense}</span>
                  </div>
                </div>
              )}

              {/* Faceted Diamond Action Economy Gems */}
              <div className="flex items-center justify-between gap-1 mt-1 text-[9px] font-display">
                <div className="flex items-center gap-1">
                  <span
                    className={`px-1 py-0.2 rounded-xs border flex items-center gap-0.5 ${
                      cb.actionAvailable !== false
                        ? 'bg-amber-950/70 border-amber-400/60 text-amber-200'
                        : 'bg-black/40 border-white/10 opacity-35 line-through'
                    }`}
                    title="Ação Padrão"
                  >
                    ♦ A
                  </span>
                  <span
                    className={`px-1 py-0.2 rounded-xs border flex items-center gap-0.5 ${
                      cb.bonusActionAvailable !== false
                        ? 'bg-sky-950/70 border-sky-400/50 text-sky-200'
                        : 'bg-black/40 border-white/10 opacity-35 line-through'
                    }`}
                    title="Ação Bônus"
                  >
                    ♦ B
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

              {/* Active Effects */}
              {cb.effects.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {cb.effects.map((ef) => (
                    <span
                      key={ef.id}
                      className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30"
                    >
                      {ef.label} ({ef.remainingRounds}r)
                    </span>
                  ))}
                </div>
              )}

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
