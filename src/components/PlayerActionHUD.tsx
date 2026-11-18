import React, { useState } from 'react';
import {
  AlertTriangle,
  Bell,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Coffee,
  Crosshair,
  Crown,
  Dices,
  Eye,
  EyeOff,
  Flame,
  FlaskConical,
  Footprints,
  Heart,
  Moon,
  Shield,
  ShieldAlert,
  Skull,
  Sparkles,
  Swords,
  Trash2,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { useCampaign } from '../context/CampaignContext';
import {
  computeCharacterStats,
  evaluateFormula,
  formatFormulaForDisplay,
} from '../shared/rulesEngine';
import { ActionEconomyCost } from '../shared/types';
import { OrnateFrame, SculptedHealthBar } from './OrnateFrame';
import { TokenPortrait } from './TokenPortrait';

interface PlayerActionHUDProps {
  onOpenSheet: () => void;
  diceDrawerOpen: boolean;
  onToggleDiceDrawer: () => void;
}

export const PlayerActionHUD: React.FC<PlayerActionHUDProps> = ({
  onOpenSheet,
  diceDrawerOpen,
  onToggleDiceDrawer,
}) => {
  const {
    campaign,
    role,
    myCharacter,
    activeCharacterId,
    setActiveCharacterId,
    targetTokenId,
    setTargetTokenId,
    rollCharacterAction,
    sendPlayerRequest,
    pendingRequests,
    resolvePlayerRequest,
    requestToast,
    advantageMode,
    setAdvantageMode,
    updateCampaign,
    deleteCharacter,
    rollDeathSave,
    assistDeathSave,
    gmResolveDeathSave,
    sendRoll,
    triggerSlashVfx,
    tacticalAlert,
    opportunityPrompt,
    triggerOpportunityPrompt,
    performCombatManeuver,
    startCombatDuel,
    pendingAttackChoice,
    setPendingAttackChoice,
    applyDamage,
  } = useCampaign();

  const [showRestMenu, setShowRestMenu] = useState(false);
  const [gmRosterCollapsed, setGmRosterCollapsed] = useState(false);
  const [gmRosterTab, setGmRosterTab] = useState<'heroes' | 'monsters'>('heroes');
  const [expandedHeroId, setExpandedHeroId] = useState<string | null>(null);

  // STRICT ROLE SEPARATION:
  // Players ONLY see their own character (myCharacter) — never a fallback to characters[0].
  const hero = role === 'player' ? myCharacter : undefined;
  const stats = hero ? computeCharacterStats(hero, campaign) : null;

  const hpPct =
    hero && stats
      ? Math.max(0, Math.min(100, (hero.hp / Math.max(1, stats.maxHp)) * 100))
      : 100;
  const mpPct =
    hero && stats
      ? Math.max(0, Math.min(100, (hero.mp / Math.max(1, stats.maxMp)) * 100))
      : 100;

  const quickAttacks = hero?.customAttacks || [];
  const quickWeapons = (hero?.inventory || [])
    .filter((inv) => inv.equipped)
    .flatMap((inv) => {
      const def = campaign.compendium.items.find((i) => i.id === inv.itemId);
      if (!def || !def.attackFormula) return [];
      return [def];
    });
  const quickAbilities = hero?.customAbilities || [];
  const compendiumAbilities = (hero?.knownAbilityIds || [])
    .map((id) => campaign.compendium.abilities.find((a) => a.id === id))
    .filter((a): a is NonNullable<typeof a> => Boolean(a))
    .filter((a) => a.actionType !== 'Passiva');

  const toEconomyCost = (actionType: string): ActionEconomyCost =>
    actionType === 'Bônus'
      ? 'Bônus'
      : actionType === 'Reação'
      ? 'Reação'
      : actionType === 'Livre'
      ? 'Livre'
      : 'Padrão';

  const heroCombatant =
    campaign.combat.active && hero
      ? campaign.combat.combatants.find((cb) => cb.referenceId === hero.id)
      : undefined;

  const activeTurnCombatant = campaign.combat.active
    ? campaign.combat.combatants[campaign.combat.currentTurnIndex]
    : undefined;

  const isActionSlotSpent = (cost: ActionEconomyCost) => {
    if (!campaign.combat.active || !heroCombatant) return false;
    if (cost === 'Padrão') return heroCombatant.actionAvailable === false;
    if (cost === 'Bônus') return heroCombatant.bonusActionAvailable === false;
    if (cost === 'Reação') return heroCombatant.reactionAvailable === false;
    return false;
  };

  const activeMap =
    campaign.maps.find((m) => m.id === campaign.activeMapId) || campaign.maps[0];

  const canRespondOpportunity =
    Boolean(opportunityPrompt) &&
    (role === 'gm' ||
      (myCharacter && opportunityPrompt?.reactorReferenceId === myCharacter.id));

  const opportunityTargetToken = opportunityPrompt
    ? activeMap?.tokens.find((t) => t.id === opportunityPrompt.targetTokenId)
    : undefined;

  const quickConsumables = (hero?.inventory || [])
    .filter((entry) => entry.quantity > 0)
    .flatMap((entry) => {
      const def = campaign.compendium.items.find((i) => i.id === entry.itemId);
      return def && def.type === 'Consumível' ? [{ entry, def }] : [];
    });

  const handleUseConsumable = (entryId: string, itemId: string) => {
    if (!hero || !stats) return;
    const def = campaign.compendium.items.find((i) => i.id === itemId);
    if (!def) return;

    const formulaMatch = def.description.match(/(\d+d\d+(?:\s*[+-]\s*\d+)?)/i)?.[1];
    const formula = def.damageFormula || formulaMatch || '2d4+2';
    const res = evaluateFormula(formula, stats, hero);
    const amount = Math.max(1, res.total);
    const isMp =
      def.name.toLowerCase().includes('mana') ||
      def.name.toLowerCase().includes('éter') ||
      /\bpm\b/i.test(def.description);

    const nextHp = isMp ? hero.hp : Math.min(stats.maxHp, hero.hp + amount);
    const nextMp = isMp ? Math.min(stats.maxMp, hero.mp + amount) : hero.mp;

    updateCampaign((prev) => ({
      ...prev,
      characters: prev.characters.map((c) =>
        c.id !== hero.id
          ? c
          : {
              ...c,
              hp: nextHp,
              mp: nextMp,
              inventory: c.inventory
                .map((inv) =>
                  inv.id === entryId ? { ...inv, quantity: inv.quantity - 1 } : inv
                )
                .filter((inv) => inv.quantity > 0),
            }
      ),
      maps: prev.maps.map((m) =>
        m.id !== prev.activeMapId
          ? m
          : {
              ...m,
              tokens: m.tokens.map((t) =>
                t.type === 'character' && t.referenceId === hero.id
                  ? { ...t, hp: nextHp, maxHp: stats.maxHp }
                  : t
              ),
            }
      ),
      combat: isMp
        ? prev.combat
        : {
            ...prev.combat,
            combatants: prev.combat.combatants.map((c) =>
              c.type === 'character' && c.referenceId === hero.id
                ? { ...c, hp: nextHp, maxHp: stats.maxHp }
                : c
            ),
          },
    }));

    const heroToken = activeMap?.tokens.find(
      (t) => t.type === 'character' && t.referenceId === hero.id
    );
    if (heroToken && !isMp) {
      triggerSlashVfx(heroToken.id, 'heal');
    }

    sendRoll({
      rollerName: hero.name,
      rollerRole: role,
      rollerColor: heroColor,
      diceSkin: hero.diceSkin || 'emerald',
      title: `Usou ${def.name}`,
      formula: res.resolvedFormula,
      individualRolls: res.individualRolls,
      rolledDice: res.rolledDice,
      total: res.total,
      isCrit: false,
      isFumble: false,
      isSecret: false,
      details: `${def.name} recuperou +${amount} ${
        isMp ? campaign.settings.resourceShort : 'PV'
      } (${res.details})`,
    });
  };

  const heroColor = hero?.playerColor || hero?.tokenColor || '#e0b84c';

  // GM Tactical Command Dock State: inspect whichever map token is selected (or active combatant token)
  const gmInspectedToken =
    role === 'gm'
      ? activeMap?.tokens.find((t) => t.id === targetTokenId) ||
        (activeTurnCombatant
          ? activeMap?.tokens.find(
              (t) =>
                t.id === activeTurnCombatant.tokenId ||
                (t.referenceId && t.referenceId === activeTurnCombatant.referenceId)
            )
          : undefined)
      : undefined;

  const gmInspectedMonster =
    gmInspectedToken?.type === 'monster' && gmInspectedToken.referenceId
      ? campaign.compendium.monsters.find((m) => m.id === gmInspectedToken.referenceId)
      : undefined;

  const gmInspectedChar =
    gmInspectedToken?.type === 'character' && gmInspectedToken.referenceId
      ? campaign.characters.find((c) => c.id === gmInspectedToken.referenceId)
      : undefined;

  const gmMapMonsters = (activeMap?.tokens || []).filter((t) => t.type === 'monster');

  const adjustHeroHp = (characterId: string, maxHp: number, delta: number) => {
    const mapTok = activeMap?.tokens.find(
      (t) => t.type === 'character' && t.referenceId === characterId
    );
    if (mapTok) {
      applyDamage(mapTok.id, Math.abs(delta), delta > 0);
      return;
    }
    updateCampaign((prev) => ({
      ...prev,
      characters: prev.characters.map((c) =>
        c.id === characterId
          ? { ...c, hp: Math.max(0, Math.min(maxHp, c.hp + delta)) }
          : c
      ),
    }));
  };

  return (
    <>
      {/* GM Floating Pending Requests from Players */}
      {role === 'gm' && pendingRequests.length > 0 && (
        <div className="fixed top-20 right-4 z-40 w-80 space-y-2 pointer-events-auto">
          {pendingRequests.map((req) => (
            <div
              key={req.id}
              className="rpg-glass-panel rounded-lg p-3.5 space-y-2.5 animate-dice-tumble shadow-2xl"
              style={{ borderColor: req.playerColor }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-amber-400 shrink-0" />
                  <div className="text-xs">
                    <span className="font-bold" style={{ color: req.playerColor }}>
                      {req.characterName}
                    </span>{' '}
                    solicita:
                    <div className="font-display font-bold text-sm mt-0.5">{req.label}</div>
                  </div>
                </div>
                <span className="text-[10px] opacity-60">{req.createdAt}</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => resolvePlayerRequest(req.id, true)}
                  className="flex-1 py-1.5 rounded-md bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" /> Aprovar
                </button>
                <button
                  onClick={() => resolvePlayerRequest(req.id, false)}
                  className="flex-1 py-1.5 rounded-md bg-red-900/90 hover:bg-red-800 text-white text-xs font-bold flex items-center justify-center gap-1 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" /> Recusar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Opportunity Attack Reaction Prompt */}
      {opportunityPrompt && canRespondOpportunity && opportunityTargetToken && (
        <div className="fixed bottom-32 left-1/2 -translate-x-1/2 z-45 max-w-md w-[92vw] pointer-events-auto animate-dice-tumble">
          <OrnateFrame
            accentColor="#e4ba52"
            className="rpg-glass-panel rounded-lg p-3.5 shadow-[0_18px_50px_rgba(0,0,0,0.92)] space-y-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-400 shrink-0" />
                <div className="text-xs">
                  <div className="font-display font-bold text-amber-300 uppercase tracking-wider">
                    Ataque de Oportunidade! (Reação)
                  </div>
                  <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    <strong>{opportunityPrompt.targetName}</strong> saiu do alcance corpo a corpo de{' '}
                    <strong style={{ color: opportunityPrompt.reactorColor }}>
                      {opportunityPrompt.reactorName}
                    </strong>
                    .
                  </div>
                </div>
              </div>
              <button
                onClick={() => triggerOpportunityPrompt(null)}
                className="rpg-card p-1 rounded cursor-pointer"
                title="Ignorar Reação"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {opportunityPrompt.attacks.map((atk, idx) => (
                <button
                  key={idx}
                  onClick={() => startCombatDuel(atk, opportunityTargetToken)}
                  className="rpg-btn-crimson px-3 py-1.5 rounded-md text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Swords className="w-3.5 h-3.5" />
                  <span>{atk.actionTitle}</span>
                  <span className="font-mono-dice text-[10px] opacity-85">{atk.damageFormula}</span>
                </button>
              ))}
              <button
                onClick={() => triggerOpportunityPrompt(null)}
                className="rpg-card px-2.5 py-1.5 rounded-md text-xs opacity-80 hover:opacity-100 cursor-pointer"
              >
                Passar Reação
              </button>
            </div>
          </OrnateFrame>
        </div>
      )}

      {/* Tactical Rule Alert (Range / Action Economy / Turn Guard) */}
      {tacticalAlert && (
        <div className="fixed bottom-32 left-1/2 -translate-x-1/2 z-45 pointer-events-none animate-dice-tumble">
          <div className="rpg-glass-panel rounded-md px-4 py-2 text-xs font-semibold border border-red-400/70 text-red-200 flex items-center gap-2 shadow-2xl">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{tacticalAlert.message}</span>
          </div>
        </div>
      )}

      {/* Player Feedback Toast when GM approves/denies */}
      {requestToast && (
        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-40 pointer-events-none animate-dice-tumble">
          <div
            className={`rpg-glass-panel rounded-md px-5 py-2 text-xs font-bold shadow-2xl flex items-center gap-2 ${
              requestToast.approved
                ? 'border-emerald-400 text-emerald-300'
                : 'border-red-400 text-red-300'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>
              {requestToast.approved
                ? `${requestToast.label}`
                : `O Mestre recusou: ${requestToast.label}`}
            </span>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODE A-LEFT: GM LEFT VERTICAL COMMAND ROSTER (Heróis & Criaturas)
         ===================================================================== */}
      {role === 'gm' && (
        <div className="fixed left-3 top-28 bottom-36 z-25 pointer-events-none flex items-start">
          {gmRosterCollapsed ? (
            <button
              onClick={() => setGmRosterCollapsed(false)}
              className="pointer-events-auto rpg-glass-panel rounded-lg px-2.5 py-2 flex items-center gap-1.5 text-xs font-display font-bold text-amber-200 hover:border-amber-400/70 shadow-2xl cursor-pointer animate-modal-unfurl"
              title="Expandir Painel Esquerdo de Personagens & Criaturas"
            >
              <Users className="w-4 h-4 text-amber-400" />
              <span>Grupo ({campaign.characters.length})</span>
              <ChevronRight className="w-3.5 h-3.5 opacity-75" />
            </button>
          ) : (
            <OrnateFrame
              accentColor="#d4aa48"
              cornerSize={14}
              className="pointer-events-auto w-[285px] max-h-full rpg-glass-panel rounded-lg flex flex-col shadow-[0_22px_60px_rgba(0,0,0,0.92)] animate-modal-unfurl overflow-hidden"
            >
              {/* Header + Tabs */}
              <div
                className="px-3 py-2 border-b flex items-center justify-between gap-2 shrink-0"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="font-display font-bold text-[11px] uppercase tracking-wider text-amber-200 truncate">
                    Comandados do Mestre
                  </span>
                </div>
                <button
                  onClick={() => setGmRosterCollapsed(true)}
                  className="rpg-card p-1 rounded hover:border-amber-400/60 cursor-pointer shrink-0"
                  title="Recolher Painel Esquerdo"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
              </div>

              <div
                className="px-2.5 pt-2 pb-1.5 grid grid-cols-2 gap-1.5 border-b shrink-0"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <button
                  onClick={() => setGmRosterTab('heroes')}
                  className={`px-2 py-1 rounded-md text-[11px] font-display font-bold flex items-center justify-center gap-1 cursor-pointer transition ${
                    gmRosterTab === 'heroes'
                      ? 'rpg-btn-primary'
                      : 'rpg-card opacity-80 hover:opacity-100'
                  }`}
                >
                  <Users className="w-3 h-3" />
                  <span>Heróis ({campaign.characters.length})</span>
                </button>
                <button
                  onClick={() => setGmRosterTab('monsters')}
                  className={`px-2 py-1 rounded-md text-[11px] font-display font-bold flex items-center justify-center gap-1 cursor-pointer transition ${
                    gmRosterTab === 'monsters'
                      ? 'rpg-btn-crimson'
                      : 'rpg-card opacity-80 hover:opacity-100'
                  }`}
                >
                  <Swords className="w-3 h-3" />
                  <span>No Mapa ({gmMapMonsters.length})</span>
                </button>
              </div>

              {/* Scrollable Vertical List */}
              <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5">
                {gmRosterTab === 'heroes' ? (
                  campaign.characters.length === 0 ? (
                    <div className="rpg-card rounded-md p-4 text-center text-xs font-lore italic opacity-75">
                      Nenhum herói criado nesta campanha ainda.
                    </div>
                  ) : (
                    campaign.characters.map((ch) => {
                      const chStats = computeCharacterStats(ch, campaign);
                      const chClass = campaign.compendium.classes.find((cl) => cl.id === ch.classId);
                      const chRace = campaign.compendium.races.find((rc) => rc.id === ch.raceId);
                      const chColor = ch.playerColor || ch.tokenColor || '#e0b84c';
                      const chToken = activeMap?.tokens.find(
                        (t) => t.type === 'character' && t.referenceId === ch.id
                      );
                      const isSelected = ch.id === activeCharacterId;
                      const isExpanded = expandedHeroId === ch.id;
                      const isDead = ch.hp <= 0;

                      const heroWeapons = (ch.inventory || [])
                        .filter((inv) => inv.equipped)
                        .flatMap((inv) => {
                          const def = campaign.compendium.items.find((i) => i.id === inv.itemId);
                          return def && def.attackFormula ? [def] : [];
                        });

                      const heroAbilities = (ch.knownAbilityIds || [])
                        .map((id) => campaign.compendium.abilities.find((a) => a.id === id))
                        .filter((a): a is NonNullable<typeof a> => Boolean(a))
                        .filter((a) => a.actionType !== 'Passiva');

                      return (
                        <div
                          key={ch.id}
                          className={`rpg-card rounded-lg p-2.5 space-y-2 transition ${
                            isSelected
                              ? 'border-amber-400/90 bg-amber-500/10 shadow-[0_0_18px_rgba(245,158,11,0.16)]'
                              : ''
                          }`}
                        >
                          {/* Top Row: Medallion + Name + Class/Level + CA Shield */}
                          <div className="flex items-start gap-2.5">
                            <button
                              onClick={() => {
                                setActiveCharacterId(ch.id);
                                if (chToken) setTargetTokenId(chToken.id);
                              }}
                              className="shrink-0 cursor-pointer transition-transform hover:scale-105"
                              title={`Selecionar ${ch.name}`}
                            >
                              <TokenPortrait
                                name={ch.name}
                                imageUrl={ch.portraitUrl}
                                playerColor={chColor}
                                frameStyle={ch.tokenFrameStyle || 'gold'}
                                sizePx={42}
                                isDead={isDead}
                                iconHint={ch.classId}
                              />
                            </button>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-1">
                                <button
                                  onClick={() => {
                                    setActiveCharacterId(ch.id);
                                    if (chToken) setTargetTokenId(chToken.id);
                                  }}
                                  className="font-display font-bold text-xs text-amber-100 truncate text-left cursor-pointer hover:text-amber-300"
                                >
                                  {ch.name}
                                </button>
                                <span
                                  className="px-1.5 py-0.2 rounded bg-[#090b12] border border-amber-400/60 text-[10px] font-display font-bold text-amber-300 shrink-0"
                                  title="Classe de Armadura"
                                >
                                  CA {chStats.defense}
                                </span>
                              </div>

                              <div
                                className="text-[10px] truncate mt-0.5 flex items-center gap-1"
                                style={{ color: 'var(--text-secondary)' }}
                              >
                                <span>
                                  {chRace?.name ? `${chRace.name} ` : ''}
                                  {chClass?.name || 'Aventureiro'} • Nv.{ch.level}
                                </span>
                                {ch.playerName && (
                                  <span className="opacity-70">({ch.playerName})</span>
                                )}
                              </div>

                              {isDead && (() => {
                                const ds = ch.deathSaves || { successes: 0, failures: 0 };
                                const isPermDead = Boolean(ds.dead || (ds.failures || 0) >= 3);
                                const isStab = !isPermDead && Boolean(ds.stabilized || (ds.successes || 0) >= 3);
                                return (
                                  <div className="mt-1 flex flex-wrap items-center gap-1">
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-red-950/90 border border-red-500/60 text-[9px] font-display font-bold text-red-200">
                                      <Skull className="w-2.5 h-2.5 text-red-400" />
                                      {isPermDead ? 'Morto (3/3)' : isStab ? 'Estabilizado' : 'Morrendo (0 PV)'}
                                    </span>
                                    {ds.assistedBy && !isPermDead && (
                                      <span className="px-1 py-0.2 rounded bg-emerald-950/80 border border-emerald-500/50 text-[8px] text-emerald-200">
                                        Ajuda: {ds.assistedBy}
                                      </span>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                          </div>

                          {/* GM Death Save Controls when Hero is at 0 PV */}
                          {isDead && (() => {
                            const ds = ch.deathSaves || { successes: 0, failures: 0 };
                            const isPermDead = Boolean(ds.dead || (ds.failures || 0) >= 3);
                            const isStab = !isPermDead && Boolean(ds.stabilized || (ds.successes || 0) >= 3);
                            return (
                              <div className="rounded-md bg-red-950/55 border border-red-500/50 p-2 space-y-1.5">
                                <div className="flex items-center justify-between text-[9px]">
                                  <div className="flex items-center gap-1">
                                    <span className="text-emerald-300 font-bold">Vida:</span>
                                    {[0, 1, 2].map((i) => (
                                      <span
                                        key={i}
                                        className={`w-2.5 h-2.5 rounded-full border ${
                                          i < (ds.successes || 0)
                                            ? 'bg-emerald-400 border-emerald-200'
                                            : 'border-emerald-500/40 bg-black/50'
                                        }`}
                                      />
                                    ))}
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <span className="text-red-300 font-bold">Morte:</span>
                                    {[0, 1, 2].map((i) => (
                                      <span
                                        key={i}
                                        className={`w-2.5 h-2.5 rounded-full border ${
                                          i < (ds.failures || 0)
                                            ? 'bg-red-500 border-red-200'
                                            : 'border-red-500/40 bg-black/50'
                                        }`}
                                      />
                                    ))}
                                  </div>
                                </div>

                                <div className="flex flex-wrap gap-1">
                                  {isPermDead ? (
                                    <>
                                      <button
                                        onClick={() => gmResolveDeathSave(ch.id, 'revive-1')}
                                        className="flex-1 px-1.5 py-1 rounded bg-amber-900/80 hover:bg-amber-800 border border-amber-400/50 text-amber-100 text-[10px] font-display font-bold cursor-pointer"
                                        title="Reviver personagem morto com 1 PV"
                                      >
                                        Reviver (1 PV)
                                      </button>
                                      <button
                                        onClick={() => gmResolveDeathSave(ch.id, 'revive-full')}
                                        className="flex-1 rpg-btn-primary px-1.5 py-1 rounded text-[10px] font-display font-bold cursor-pointer"
                                        title="Reviver personagem morto com PV máximo"
                                      >
                                        Reviver Total
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      {!isStab && (
                                        <button
                                          onClick={() => rollDeathSave(ch.id)}
                                          className="px-1.5 py-1 rounded bg-red-900/80 hover:bg-red-800 border border-red-400/40 text-red-100 text-[10px] font-display font-bold cursor-pointer"
                                          title="Rolar Teste contra a Morte (1d20) para este herói"
                                        >
                                          1d20 Morte
                                        </button>
                                      )}
                                      {!isStab && (
                                        <button
                                          onClick={() => gmResolveDeathSave(ch.id, 'stabilize')}
                                          className="px-1.5 py-1 rounded bg-sky-900/80 hover:bg-sky-800 border border-sky-400/50 text-sky-100 text-[10px] font-display font-bold cursor-pointer"
                                          title="Estabilizar nos Portões da Morte (3/3 sucessos)"
                                        >
                                          Estabilizar
                                        </button>
                                      )}
                                      <button
                                        onClick={() => gmResolveDeathSave(ch.id, 'save-full')}
                                        className="flex-1 rpg-btn-primary px-1.5 py-1 rounded text-[10px] font-display font-bold cursor-pointer"
                                        title="Salvar totalmente do Teste contra a Morte e restaurar todos os PV"
                                      >
                                        Salvar Total
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            );
                          })()}

                          {/* Sculpted HP & MP Bars */}
                          <div className="space-y-1.5">
                            <div>
                              <div className="flex items-center justify-between text-[10px] font-mono-dice mb-0.5">
                                <span className="text-red-300 font-bold">
                                  PV {ch.hp}/{chStats.maxHp}
                                </span>
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => adjustHeroHp(ch.id, chStats.maxHp, -5)}
                                    className="px-1 rounded bg-red-950/85 border border-red-500/40 text-red-200 hover:bg-red-800 cursor-pointer"
                                    title="-5 PV"
                                  >
                                    -5
                                  </button>
                                  <button
                                    onClick={() => adjustHeroHp(ch.id, chStats.maxHp, -1)}
                                    className="px-1 rounded bg-red-950/70 border border-red-500/30 text-red-200 hover:bg-red-800 cursor-pointer"
                                    title="-1 PV"
                                  >
                                    -1
                                  </button>
                                  <button
                                    onClick={() => adjustHeroHp(ch.id, chStats.maxHp, 1)}
                                    className="px-1 rounded bg-emerald-950/70 border border-emerald-500/30 text-emerald-200 hover:bg-emerald-800 cursor-pointer"
                                    title="+1 PV"
                                  >
                                    +1
                                  </button>
                                  <button
                                    onClick={() => adjustHeroHp(ch.id, chStats.maxHp, 5)}
                                    className="px-1 rounded bg-emerald-950/85 border border-emerald-500/40 text-emerald-200 hover:bg-emerald-800 cursor-pointer"
                                    title="+5 PV"
                                  >
                                    +5
                                  </button>
                                </div>
                              </div>
                              <SculptedHealthBar
                                hp={ch.hp}
                                maxHp={chStats.maxHp}
                                variant="vital"
                                heightClass="h-2"
                              />
                            </div>

                            {chStats.maxMp > 0 && (
                              <div>
                                <div className="flex items-center justify-between text-[9px] font-mono-dice text-sky-300 mb-0.5">
                                  <span>
                                    {campaign.settings.resourceShort} {ch.mp}/{chStats.maxMp}
                                  </span>
                                  <span>Desl. {chStats.speed}m</span>
                                </div>
                                <SculptedHealthBar
                                  hp={ch.mp}
                                  maxHp={chStats.maxMp}
                                  variant="mana"
                                  heightClass="h-1.5"
                                />
                              </div>
                            )}
                          </div>

                          {/* Card Footer Actions */}
                          <div
                            className="flex items-center justify-between gap-1 pt-1.5 border-t text-[10px]"
                            style={{ borderColor: 'var(--border-subtle)' }}
                          >
                            <button
                              onClick={() => {
                                setActiveCharacterId(ch.id);
                                if (chToken) setTargetTokenId(chToken.id);
                                onOpenSheet();
                              }}
                              className="rpg-card px-2 py-1 rounded flex items-center gap-1 hover:border-amber-400/60 cursor-pointer text-amber-100"
                              title={`Abrir Ficha Completa de ${ch.name}`}
                            >
                              <BookOpen className="w-3 h-3 text-amber-400" />
                              <span>Ficha</span>
                            </button>

                            <button
                              onClick={() => {
                                setActiveCharacterId(ch.id);
                                setExpandedHeroId((curr) => (curr === ch.id ? null : ch.id));
                              }}
                              className={`px-2 py-1 rounded flex items-center gap-1 cursor-pointer ${
                                isExpanded
                                  ? 'rpg-btn-primary'
                                  : 'rpg-card hover:border-amber-400/60 text-amber-200'
                              }`}
                              title="Mostrar/Ocultar Ataques e Habilidades rápidas"
                            >
                              <Swords className="w-3 h-3" />
                              <span>Ações</span>
                            </button>

                            {chToken && (
                              <button
                                onClick={() => setTargetTokenId(chToken.id)}
                                className="rpg-card p-1 rounded hover:border-amber-400/60 cursor-pointer text-sky-300"
                                title="Selecionar token no mapa"
                              >
                                <Crosshair className="w-3 h-3" />
                              </button>
                            )}

                            <button
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `Excluir permanentemente o personagem "${ch.name}" desta campanha?`
                                  )
                                ) {
                                  deleteCharacter(ch.id);
                                }
                              }}
                              className="rpg-card p-1 rounded text-red-400/80 hover:text-red-200 hover:bg-red-950/60 cursor-pointer"
                              title={`Excluir ${ch.name}`}
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>

                          {/* Expanded Quick Attacks / Abilities Drawer for this Hero */}
                          {isExpanded && (
                            <div
                              className="pt-1.5 border-t space-y-1"
                              style={{ borderColor: 'var(--border-subtle)' }}
                            >
                              {ch.customAttacks.map((atk) => {
                                const isSkillSel = Boolean(
                                  pendingAttackChoice &&
                                    pendingAttackChoice.attackerCharacterId === ch.id &&
                                    pendingAttackChoice.actionTitle === atk.name
                                );
                                return (
                                  <button
                                    key={atk.id}
                                    disabled={isDead}
                                    onClick={() =>
                                      rollCharacterAction({
                                        characterId: ch.id,
                                        title: atk.name,
                                        attackFormula: atk.attackBonusFormula,
                                        damageFormula: atk.damageFormula,
                                        damageType: atk.damageType,
                                        range: atk.range,
                                        actionCost: 'Padrão',
                                      })
                                    }
                                    className={`w-full rpg-card px-2 py-1 rounded flex items-center justify-between text-[10px] cursor-pointer disabled:opacity-40 ${
                                      isSkillSel ? 'ring-2 ring-amber-400 bg-amber-500/20' : 'hover:border-red-400'
                                    }`}
                                  >
                                    <span className="truncate font-display font-bold text-amber-100">
                                      ⚔️ {atk.name}
                                    </span>
                                    <span className="font-mono-dice text-amber-300 shrink-0 ml-1">
                                      {isSkillSel
                                        ? '✕ Cancelar'
                                        : formatFormulaForDisplay(atk.damageFormula, chStats, ch)}
                                    </span>
                                  </button>
                                );
                              })}

                              {heroWeapons.map((wp) => {
                                const isSkillSel = Boolean(
                                  pendingAttackChoice &&
                                    pendingAttackChoice.attackerCharacterId === ch.id &&
                                    pendingAttackChoice.actionTitle === wp.name
                                );
                                return (
                                  <button
                                    key={wp.id}
                                    disabled={isDead}
                                    onClick={() =>
                                      rollCharacterAction({
                                        characterId: ch.id,
                                        title: wp.name,
                                        attackFormula: wp.attackFormula,
                                        damageFormula: wp.damageFormula,
                                        damageType: wp.damageType,
                                        range: wp.range,
                                        actionCost: 'Padrão',
                                      })
                                    }
                                    className={`w-full rpg-card px-2 py-1 rounded flex items-center justify-between text-[10px] cursor-pointer disabled:opacity-40 ${
                                      isSkillSel ? 'ring-2 ring-amber-400 bg-amber-500/20' : 'hover:border-amber-400'
                                    }`}
                                  >
                                    <span className="truncate font-display font-bold">🗡️ {wp.name}</span>
                                    <span className="font-mono-dice text-amber-200/80 shrink-0 ml-1">
                                      {isSkillSel ? '✕ Cancelar' : wp.range || '1,5m'}
                                    </span>
                                  </button>
                                );
                              })}

                              {heroAbilities.slice(0, 4).map((ab) => {
                                const cost = toEconomyCost(ab.actionType);
                                const isSkillSel = Boolean(
                                  pendingAttackChoice &&
                                    pendingAttackChoice.attackerCharacterId === ch.id &&
                                    pendingAttackChoice.actionTitle === ab.name
                                );
                                return (
                                  <button
                                    key={ab.id}
                                    disabled={isDead}
                                    onClick={() =>
                                      rollCharacterAction({
                                        characterId: ch.id,
                                        title: ab.name,
                                        attackFormula: ab.attackFormula,
                                        damageFormula: ab.damageFormula,
                                        damageType: ab.damageType,
                                        range: ab.range,
                                        actionCost: cost,
                                        saveSkillId: ab.saveSkillId,
                                        saveDcFormula: ab.saveDcFormula,
                                        costMp: ab.costMp,
                                        applyConditionId: ab.applyConditionId,
                                        conditionDurationRounds: ab.conditionDurationRounds,
                                      })
                                    }
                                    className={`w-full rpg-card px-2 py-1 rounded flex items-center justify-between text-[10px] cursor-pointer disabled:opacity-40 ${
                                      isSkillSel ? 'ring-2 ring-amber-400 bg-amber-500/20' : 'hover:border-amber-400'
                                    }`}
                                  >
                                    <span className="truncate font-display font-bold text-amber-200">
                                      ✨ {ab.name}
                                    </span>
                                    <span className="font-mono-dice text-sky-300 shrink-0 ml-1">
                                      {isSkillSel
                                        ? '✕ Cancelar'
                                        : ab.costMp > 0
                                          ? `${ab.costMp} ${campaign.settings.resourceShort}`
                                          : ab.actionType}
                                    </span>
                                  </button>
                                );
                              })}

                              {ch.customAttacks.length === 0 &&
                                heroWeapons.length === 0 &&
                                heroAbilities.length === 0 && (
                                  <div className="text-[10px] font-lore italic opacity-70 text-center py-1">
                                    Sem ataques cadastrados ainda
                                  </div>
                                )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )
                ) : gmMapMonsters.length === 0 ? (
                  <div className="rpg-card rounded-md p-4 text-center text-xs font-lore italic opacity-75">
                    Nenhuma criatura posicionada no mapa ativo.
                  </div>
                ) : (
                  gmMapMonsters.map((mtok) => {
                    const mDef = mtok.referenceId
                      ? campaign.compendium.monsters.find((m) => m.id === mtok.referenceId)
                      : undefined;
                    const isTokSelected = targetTokenId === mtok.id;
                    return (
                      <div
                        key={mtok.id}
                        className={`rpg-card rounded-lg p-2.5 space-y-2 transition ${
                          isTokSelected
                            ? 'border-red-400 bg-red-950/25 shadow-[0_0_16px_rgba(220,38,38,0.22)]'
                            : ''
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          <button
                            onClick={() => setTargetTokenId(mtok.id)}
                            className="shrink-0 cursor-pointer hover:scale-105 transition-transform"
                            title={`Selecionar ${mtok.name}`}
                          >
                            <TokenPortrait
                              name={mtok.name}
                              imageUrl={mtok.imageUrl}
                              playerColor={mtok.color}
                              frameStyle={mtok.frameStyle || 'crimson'}
                              sizePx={40}
                              isDead={mtok.hp <= 0}
                              iconHint={mDef?.type}
                            />
                          </button>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <button
                                onClick={() => setTargetTokenId(mtok.id)}
                                className="font-display font-bold text-xs text-red-100 truncate text-left cursor-pointer hover:text-amber-300"
                              >
                                {mtok.name}
                              </button>
                              <span className="px-1.5 py-0.2 rounded bg-[#090b12] border border-red-500/50 text-[10px] font-display font-bold text-amber-300 shrink-0">
                                CA {mtok.defense}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5 mt-0.5 text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                              <span>{mDef?.type || 'Criatura'}</span>
                              {mtok.isHidden && (
                                <span className="px-1 rounded bg-amber-500/20 border border-amber-400/50 text-amber-300 text-[9px] font-bold">
                                  OCULTO
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between text-[10px] font-mono-dice mb-0.5">
                            <span className="text-red-300 font-bold">
                              PV {mtok.hp}/{mtok.maxHp}
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => applyDamage(mtok.id, 5, false)}
                                className="px-1 rounded bg-red-950/85 border border-red-500/40 text-red-200 hover:bg-red-800 cursor-pointer"
                              >
                                -5
                              </button>
                              <button
                                onClick={() => applyDamage(mtok.id, 1, false)}
                                className="px-1 rounded bg-red-950/70 border border-red-500/30 text-red-200 hover:bg-red-800 cursor-pointer"
                              >
                                -1
                              </button>
                              <button
                                onClick={() => applyDamage(mtok.id, 1, true)}
                                className="px-1 rounded bg-emerald-950/70 border border-emerald-500/30 text-emerald-200 hover:bg-emerald-800 cursor-pointer"
                              >
                                +1
                              </button>
                            </div>
                          </div>
                          <SculptedHealthBar
                            hp={mtok.hp}
                            maxHp={mtok.maxHp}
                            variant="crimson"
                            heightClass="h-2"
                          />
                        </div>

                        <div className="flex items-center justify-between gap-1.5 pt-1 border-t text-[10px]" style={{ borderColor: 'var(--border-subtle)' }}>
                          <button
                            onClick={() => setTargetTokenId(mtok.id)}
                            className="flex-1 rpg-btn-crimson px-2 py-1 rounded text-[10px] flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <Crosshair className="w-3 h-3" />
                            <span>Inspecionar / Atacar</span>
                          </button>
                          <button
                            onClick={() =>
                              updateCampaign((prev) => ({
                                ...prev,
                                maps: prev.maps.map((m) =>
                                  m.id === activeMap?.id
                                    ? {
                                        ...m,
                                        tokens: m.tokens.map((t) =>
                                          t.id === mtok.id ? { ...t, isHidden: !t.isHidden } : t
                                        ),
                                      }
                                    : m
                                ),
                              }))
                            }
                            className="rpg-card p-1 rounded cursor-pointer hover:border-amber-400/60"
                            title={mtok.isHidden ? 'Revelar para jogadores' : 'Esconder dos jogadores'}
                          >
                            {mtok.isHidden ? (
                              <Eye className="w-3.5 h-3.5 text-amber-300" />
                            ) : (
                              <EyeOff className="w-3.5 h-3.5 opacity-75" />
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </OrnateFrame>
          )}
        </div>
      )}

      {/* =====================================================================
          MODE A: GM TACTICAL COMMAND DOCK (Mestre)
         ===================================================================== */}
      {role === 'gm' && (
        <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-30 max-w-[96vw] pointer-events-auto">
          <OrnateFrame
            accentColor="#d4aa48"
            cornerSize={16}
            className="rpg-glass-panel rounded-lg px-4 py-2 flex items-center gap-3 shadow-[0_22px_60px_rgba(0,0,0,0.92)]"
          >
            {/* GM Badge & Selected Map Token Inspector */}
            {gmInspectedToken ? (
              <div className="flex items-center gap-3 pr-3 border-r" style={{ borderColor: 'var(--border-subtle)' }}>
                <TokenPortrait
                  name={gmInspectedToken.name}
                  imageUrl={gmInspectedChar?.portraitUrl || gmInspectedToken.imageUrl}
                  playerColor={gmInspectedChar?.playerColor || gmInspectedToken.color}
                  frameStyle={
                    gmInspectedChar?.tokenFrameStyle ||
                    gmInspectedToken.frameStyle ||
                    (gmInspectedToken.type === 'character' ? 'gold' : 'crimson')
                  }
                  sizePx={46}
                  isDead={gmInspectedToken.hp <= 0}
                  iconHint={gmInspectedMonster?.type}
                />

                <div className="min-w-[130px] max-w-[180px]">
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="font-display font-bold text-xs truncate text-amber-100">
                      {gmInspectedToken.name}
                    </span>
                    <span className="px-1.5 py-0.2 rounded bg-black/70 border border-amber-400/50 text-[10px] font-display font-bold text-amber-300 shrink-0">
                      CA {gmInspectedToken.defense}
                    </span>
                  </div>

                  {/* Sculpted HP Bar */}
                  <div className="w-full h-2 rounded-xs bg-black/80 border border-amber-500/30 overflow-hidden mt-1">
                    <div
                      className="h-full transition-all duration-300"
                      style={{
                        width: `${Math.max(
                          0,
                          Math.min(100, (gmInspectedToken.hp / Math.max(1, gmInspectedToken.maxHp)) * 100)
                        )}%`,
                        background: 'linear-gradient(90deg, #991b1b, #ef4444)',
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[10px] mt-1 font-mono-dice">
                    <span className="text-red-200 font-bold">
                      PV {gmInspectedToken.hp}/{gmInspectedToken.maxHp}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => applyDamage(gmInspectedToken.id, 5, false)}
                        className="px-1 rounded bg-red-950/90 border border-red-500/40 text-red-200 hover:bg-red-800 cursor-pointer"
                        title="Causar 5 de dano"
                      >
                        -5
                      </button>
                      <button
                        onClick={() => applyDamage(gmInspectedToken.id, 1, false)}
                        className="px-1 rounded bg-red-950/70 border border-red-500/30 text-red-200 hover:bg-red-800 cursor-pointer"
                        title="Causar 1 de dano"
                      >
                        -1
                      </button>
                      <button
                        onClick={() => applyDamage(gmInspectedToken.id, 1, true)}
                        className="px-1 rounded bg-emerald-950/70 border border-emerald-500/30 text-emerald-200 hover:bg-emerald-800 cursor-pointer"
                        title="Curar 1 PV"
                      >
                        +1
                      </button>
                      <button
                        onClick={() => applyDamage(gmInspectedToken.id, 5, true)}
                        className="px-1 rounded bg-emerald-950/90 border border-emerald-500/40 text-emerald-200 hover:bg-emerald-800 cursor-pointer"
                        title="Curar 5 PV"
                      >
                        +5
                      </button>
                    </div>
                  </div>
                </div>

                {/* 1-Click Monster Attacks right in the GM Dock */}
                {gmInspectedMonster && gmInspectedMonster.attacks.length > 0 && (
                  <div className="hidden md:flex items-center gap-1.5">
                    {gmInspectedMonster.attacks.map((matk, idx) => {
                      const isTokenDead = gmInspectedToken.hp <= 0;
                      const isMonsterSkillSelected = Boolean(
                        pendingAttackChoice &&
                          pendingAttackChoice.attackerTokenId === gmInspectedToken.id &&
                          pendingAttackChoice.actionTitle === matk.name,
                      );
                      return (
                        <button
                          key={idx}
                          disabled={isTokenDead}
                          onClick={() => {
                            if (isMonsterSkillSelected) {
                              setPendingAttackChoice(null);
                              return;
                            }
                            setPendingAttackChoice({
                              attackerTokenId: gmInspectedToken.id,
                              attackerName: gmInspectedToken.name,
                              attackerColor: gmInspectedToken.color,
                              attackerImageUrl: gmInspectedToken.imageUrl,
                              attackerFrame: gmInspectedToken.frameStyle || 'crimson',
                              diceSkin: 'blood',
                              actionTitle: matk.name,
                              attackFormula: `1d20 + ${matk.attackBonus}`,
                              damageFormula: matk.damageFormula,
                              damageType: matk.damageType,
                              range: matk.range,
                              actionCost: 'Padrão',
                            });
                          }}
                          className={`rpg-card hover:border-red-400 px-2.5 py-1.5 rounded-md flex items-center gap-1.5 cursor-pointer text-left transition disabled:opacity-35 disabled:cursor-not-allowed ${
                            isMonsterSkillSelected ? 'ring-2 ring-amber-400 bg-amber-500/20' : ''
                          }`}
                          title={
                            isTokenDead
                              ? `${gmInspectedToken.name} está derrotado (0 PV)`
                              : isMonsterSkillSelected
                                ? `Clique para cancelar ${matk.name}`
                                : `Atacar com ${matk.name} (${matk.range || '1,5m'})`
                          }
                        >
                          <Swords className="w-3.5 h-3.5 text-red-400 shrink-0" />
                          <div className="leading-tight">
                            <div className="text-[11px] font-display font-bold text-amber-100">
                              {matk.name}
                            </div>
                            <div className="text-[9px] font-mono-dice text-amber-300/90">
                              {isMonsterSkillSelected
                                ? '✕ Cancelar'
                                : `+${matk.attackBonus} • ${matk.damageFormula}`}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div
                className="flex items-center gap-2 pr-3 border-r text-xs"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <div className="w-9 h-9 rounded-md bg-amber-950/50 border border-amber-500/40 flex items-center justify-center shrink-0">
                  <Crown className="w-4 h-4 text-amber-400" />
                </div>
                <div className="leading-tight hidden sm:block">
                  <div className="font-display font-bold text-xs text-amber-200">
                    Console do Mestre
                  </div>
                  <div className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                    Clique em um token no mapa para inspecionar ou atacar
                  </div>
                </div>
              </div>
            )}

            {/* Right: Dice Mode + Open Sheets + Dice Tray */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() =>
                  setAdvantageMode(
                    advantageMode === 'normal'
                      ? 'advantage'
                      : advantageMode === 'advantage'
                      ? 'disadvantage'
                      : 'normal'
                  )
                }
                className={`px-2.5 py-1.5 rounded-md text-[11px] font-display font-bold cursor-pointer transition ${
                  advantageMode === 'advantage'
                    ? 'bg-emerald-700 text-white border border-emerald-400'
                    : advantageMode === 'disadvantage'
                    ? 'bg-red-800 text-white border border-red-400'
                    : 'rpg-card'
                }`}
                title="Alternar modo de rolagem: Normal / Vantagem (2d20) / Desvantagem (2d20)"
              >
                {advantageMode === 'normal'
                  ? '1d20'
                  : advantageMode === 'advantage'
                  ? '2d20 Vant.'
                  : '2d20 Desv.'}
              </button>

              {campaign.characters.length > 0 && (
                <button
                  onClick={onOpenSheet}
                  className="rpg-card px-2.5 py-1.5 rounded-md text-xs font-display font-semibold flex items-center gap-1 cursor-pointer hover:border-amber-400/60"
                >
                  <BookOpen className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />
                  <span className="hidden md:inline">Fichas</span>
                </button>
              )}

              <button
                onClick={onToggleDiceDrawer}
                className={`px-3 py-1.5 rounded-md text-xs font-display font-bold flex items-center gap-1 cursor-pointer transition ${
                  diceDrawerOpen ? 'rpg-btn-primary' : 'rpg-card hover:border-amber-400/60'
                }`}
                title="Abrir/Fechar Bandeja de Dados & Histórico"
              >
                <Dices className="w-4 h-4" />
                <span className="hidden md:inline">Dados</span>
              </button>
            </div>
          </OrnateFrame>
        </div>
      )}

      {/* =====================================================================
          MODE B: PLAYER RELIQUARY ACTION HUD (Jogador com Personagem Próprio)
         ===================================================================== */}
      {role === 'player' && hero && stats && (
        <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-30 max-w-[95vw] pointer-events-auto flex flex-col items-center gap-1.5">
          {/* Player Death's Door HUD Panel when hero is at 0 PV */}
          {hero.hp <= 0 && (() => {
            const ds = hero.deathSaves || { successes: 0, failures: 0 };
            const isHeroPermDead = Boolean(ds.dead || (ds.failures || 0) >= 3);
            const isHeroStab = !isHeroPermDead && Boolean(ds.stabilized || (ds.successes || 0) >= 3);
            return (
              <OrnateFrame
                accentColor="#dc2626"
                cornerSize={14}
                className="rpg-glass-panel rounded-lg px-4 py-2 flex flex-wrap items-center justify-center gap-3 shadow-[0_14px_40px_rgba(180,25,25,0.55)] animate-death-pulse"
              >
                <div className="flex items-center gap-2">
                  <Skull className="w-5 h-5 text-red-400 animate-pulse shrink-0" />
                  <div className="leading-tight">
                    <div className="font-display font-bold text-xs text-red-200 uppercase tracking-wider">
                      {isHeroPermDead
                        ? 'Morto em Combate'
                        : isHeroStab
                          ? 'Estabilizado (0 PV)'
                          : 'Teste contra a Morte (D&D)'}
                    </div>
                    <div className="text-[10px] text-red-300/80">
                      {isHeroPermDead
                        ? 'Aguarde o Mestre ou um milagre para reviver.'
                        : isHeroStab
                          ? '3 sucessos atingidos! Fora de perigo até receber dano ou cura.'
                          : ds.assistedBy
                            ? `Ajuda de ${ds.assistedBy}: próximo teste rola 2d20 (Vantagem)!`
                            : '10+ = Sucesso • 20 = Levanta 1 PV • 1 = 2 Falhas'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-[11px]">
                  <div className="flex items-center gap-1">
                    <span className="text-emerald-300 font-semibold">Vida:</span>
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className={`w-3.5 h-3.5 rounded-full border ${
                          i < (ds.successes || 0)
                            ? 'bg-emerald-400 border-emerald-200 shadow-[0_0_8px_#34d399]'
                            : 'border-emerald-500/40 bg-black/50'
                        }`}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-red-300 font-semibold">Morte:</span>
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className={`w-3.5 h-3.5 rounded-full border ${
                          i < (ds.failures || 0)
                            ? 'bg-red-500 border-red-200 shadow-[0_0_8px_#ef4444]'
                            : 'border-red-500/40 bg-black/50'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                {!isHeroPermDead && !isHeroStab && (
                  <button
                    onClick={() => rollDeathSave(hero.id)}
                    className="rpg-btn-crimson px-3 py-1.5 rounded-md text-xs font-display font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Dices className="w-4 h-4" />
                    <span>{ds.assistedBy ? 'Rolar Destino (2d20)' : 'Rolar Teste de Morte (d20)'}</span>
                  </button>
                )}
              </OrnateFrame>
            );
          })()}

          {/* Ally Rescue Strip: when a living player sees fallen allies at 0 PV */}
          {hero.hp > 0 && (() => {
            const fallenAllies = campaign.characters.filter(
              (c) =>
                c.id !== hero.id &&
                c.hp <= 0 &&
                !c.deathSaves?.dead &&
                (c.deathSaves?.failures || 0) < 3 &&
                !c.deathSaves?.stabilized &&
                (c.deathSaves?.successes || 0) < 3
            );
            if (fallenAllies.length === 0) return null;
            return (
              <div className="rpg-glass-panel rounded-md px-3 py-1.5 flex flex-wrap items-center justify-center gap-2 border-emerald-500/50 shadow-xl">
                <span className="text-[10px] font-display font-bold uppercase tracking-wider text-emerald-300">
                  Aliado Caído:
                </span>
                {fallenAllies.map((ally) => (
                  <button
                    key={ally.id}
                    onClick={() => assistDeathSave(hero.id, ally.id)}
                    className="rpg-btn-primary px-2.5 py-1 rounded-md text-[11px] flex items-center gap-1.5 cursor-pointer"
                    title={`Prestar socorro em Medicina (CD 10) para estabilizar ou dar Vantagem a ${ally.name} (máx 1,5m em combate)`}
                  >
                    <Heart className="w-3.5 h-3.5 text-red-200" />
                    <span>Ajudar {ally.name} (Medicina CD 10)</span>
                  </button>
                ))}
              </div>
            );
          })()}

          {campaign.combat.active && heroCombatant && (
            <div className="rpg-glass-panel rounded-md px-3 py-1 flex flex-wrap items-center justify-center gap-2 text-[11px] shadow-xl">
              <div
                className="flex items-center gap-1.5 pr-2 border-r"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <span
                  className={`px-2 py-0.5 rounded font-semibold border flex items-center gap-1 ${
                    heroCombatant.actionAvailable !== false
                      ? 'bg-amber-500/20 border-amber-400/60 text-amber-200'
                      : 'bg-black/40 border-white/10 opacity-40 line-through'
                  }`}
                >
                  <Swords className="w-3 h-3" /> Ação
                </span>
                <span
                  className={`px-2 py-0.5 rounded font-semibold border flex items-center gap-1 ${
                    heroCombatant.bonusActionAvailable !== false
                      ? 'bg-sky-500/20 border-sky-400/60 text-sky-200'
                      : 'bg-black/40 border-white/10 opacity-40 line-through'
                  }`}
                >
                  <Flame className="w-3 h-3" /> Bônus
                </span>
                <span
                  className={`px-2 py-0.5 rounded font-semibold border flex items-center gap-1 ${
                    heroCombatant.reactionAvailable !== false
                      ? 'bg-purple-500/20 border-purple-400/60 text-purple-200'
                      : 'bg-black/40 border-white/10 opacity-40 line-through'
                  }`}
                >
                  <Zap className="w-3 h-3" /> Reação
                </span>
                <span className="px-2 py-0.5 rounded font-mono-dice font-bold bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 flex items-center gap-1">
                  <Footprints className="w-3 h-3" />
                  {heroCombatant.remainingMoveMeters ?? heroCombatant.speedMeters ?? 9}m
                </span>
              </div>

              {/* D&D Tactical Maneuvers */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => performCombatManeuver('dash')}
                  disabled={
                    hero.hp <= 0 ||
                    heroCombatant.actionAvailable === false ||
                    activeTurnCombatant?.id !== heroCombatant.id
                  }
                  className="rpg-card px-2 py-0.5 rounded hover:border-amber-400 cursor-pointer disabled:opacity-35 flex items-center gap-1"
                  title="Gasta Ação Padrão para dobrar o deslocamento restante neste turno"
                >
                  <Footprints className="w-3 h-3 text-emerald-300" />
                  <span>Disparada</span>
                </button>
                <button
                  onClick={() => performCombatManeuver('disengage')}
                  disabled={
                    hero.hp <= 0 ||
                    (hero.classId === 'classe-ladino' && hero.level >= 2
                      ? heroCombatant.bonusActionAvailable === false
                      : heroCombatant.actionAvailable === false) ||
                    activeTurnCombatant?.id !== heroCombatant.id
                  }
                  className="rpg-card px-2 py-0.5 rounded hover:border-amber-400 cursor-pointer disabled:opacity-35 flex items-center gap-1"
                  title="Recua sem provocar Ataques de Oportunidade neste turno"
                >
                  <ShieldAlert className="w-3 h-3 text-sky-300" />
                  <span>{heroCombatant.disengaged ? 'Desengajado ✓' : 'Desengajar'}</span>
                </button>
                <button
                  onClick={() => performCombatManeuver('dodge')}
                  disabled={
                    hero.hp <= 0 ||
                    heroCombatant.actionAvailable === false ||
                    activeTurnCombatant?.id !== heroCombatant.id
                  }
                  className="rpg-card px-2 py-0.5 rounded hover:border-amber-400 cursor-pointer disabled:opacity-35 flex items-center gap-1"
                  title="Ataques contra você rolam com Desvantagem até seu próximo turno"
                >
                  <Shield className="w-3 h-3 text-amber-300" />
                  <span>{heroCombatant.dodging ? 'Esquivando ✓' : 'Esquivar'}</span>
                </button>
                {hero.classId === 'classe-guerreiro' && hero.level >= 2 && (
                  <button
                    onClick={() => performCombatManeuver('action-surge')}
                    disabled={hero.hp <= 0 || activeTurnCombatant?.id !== heroCombatant.id}
                    className="rpg-card px-2 py-0.5 rounded border-red-400/50 text-red-200 hover:bg-red-950/60 cursor-pointer disabled:opacity-35"
                    title="Recupera +1 Ação Padrão neste turno (Guerreiro Nv 2+)"
                  >
                    Surto de Ação
                  </button>
                )}
              </div>
            </div>
          )}

          <OrnateFrame
            accentColor={heroColor}
            cornerSize={16}
            className="rpg-glass-panel rounded-lg px-4 py-2 flex items-center gap-3 shadow-[0_22px_60px_rgba(0,0,0,0.92)]"
          >
            {/* Left: Sculpted Ruby HP Globe + Hero Medallion + Sapphire MP Globe */}
            <div className="flex items-center gap-2.5 shrink-0">
              {/* HP Liquid Globe in Brass Bezel */}
              <div
                className="relative w-12 h-12 rounded-full border-2 border-amber-500/70 bg-[#08090f] overflow-hidden flex flex-col items-center justify-center shadow-[inset_0_4px_10px_rgba(0,0,0,0.95),0_0_16px_rgba(220,38,38,0.35)]"
                title={`Pontos de Vida: ${hero.hp} / ${stats.maxHp}`}
              >
                <div
                  className="absolute bottom-0 inset-x-0 transition-all duration-500"
                  style={{
                    height: `${hpPct}%`,
                    background: 'linear-gradient(180deg, #ef4444 0%, #991b1b 65%, #450a0a 100%)',
                  }}
                >
                  <div className="absolute inset-0 liquid-bar-shine" />
                </div>
                <div
                  className="absolute inset-0 rounded-full pointer-events-none"
                  style={{
                    background:
                      'linear-gradient(145deg, rgba(255,255,255,0.28) 0%, transparent 45%)',
                  }}
                />
                <span className="relative z-10 font-display font-black text-xs text-white drop-shadow leading-none">
                  {hero.hp}
                </span>
                <span className="relative z-10 text-[9px] font-display text-amber-100/90 drop-shadow leading-none mt-0.5">
                  PV
                </span>
              </div>

              {/* Hero Medallion */}
              <button
                onClick={onOpenSheet}
                className="relative group cursor-pointer transition-transform hover:scale-105"
                title={`Abrir Ficha de ${hero.name} (CA ${stats.defense})`}
              >
                <TokenPortrait
                  name={hero.name}
                  imageUrl={hero.portraitUrl}
                  playerColor={heroColor}
                  frameStyle={hero.tokenFrameStyle || 'gold'}
                  sizePx={54}
                  isDead={hero.hp <= 0}
                />
                <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 px-1.5 py-0.2 rounded bg-[#0c0e16] border border-amber-400/70 text-[9px] font-display font-bold text-amber-300 whitespace-nowrap shadow-md">
                  CA {stats.defense}
                </span>
              </button>

              {/* MP Liquid Globe in Brass Bezel */}
              <div
                className="relative w-12 h-12 rounded-full border-2 border-amber-500/70 bg-[#08090f] overflow-hidden flex flex-col items-center justify-center shadow-[inset_0_4px_10px_rgba(0,0,0,0.95),0_0_16px_rgba(37,99,235,0.35)]"
                title={`${campaign.settings.resourceName}: ${hero.mp} / ${stats.maxMp}`}
              >
                <div
                  className="absolute bottom-0 inset-x-0 transition-all duration-500"
                  style={{
                    height: `${mpPct}%`,
                    background: 'linear-gradient(180deg, #38bdf8 0%, #1d4ed8 65%, #172554 100%)',
                  }}
                >
                  <div className="absolute inset-0 liquid-bar-shine" />
                </div>
                <div
                  className="absolute inset-0 rounded-full pointer-events-none"
                  style={{
                    background:
                      'linear-gradient(145deg, rgba(255,255,255,0.28) 0%, transparent 45%)',
                  }}
                />
                <span className="relative z-10 font-display font-black text-xs text-white drop-shadow leading-none">
                  {hero.mp}
                </span>
                <span className="relative z-10 text-[9px] font-display text-sky-100/90 drop-shadow leading-none mt-0.5">
                  {campaign.settings.resourceShort}
                </span>
              </div>
            </div>

            {/* Center: 1-Click Beveled Action Slots */}
            <div
              className="hidden sm:flex items-center gap-1.5 pl-2 border-l max-w-[420px] md:max-w-[520px] overflow-x-auto py-0.5"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              {hero.hp <= 0 && (
                <button
                  onClick={onOpenSheet}
                  className="px-2.5 py-1.5 rounded-md bg-red-950/80 border border-red-500/70 text-red-200 text-[10px] font-display font-bold flex items-center gap-1.5 shrink-0 cursor-pointer hover:bg-red-900/70"
                  title="Seu personagem está caído com 0 PV! Abra a Ficha para Testes contra a Morte"
                >
                  <Skull className="w-3.5 h-3.5 text-red-400 animate-pulse" />
                  <span>Caído (0 PV) — Abrir Ficha</span>
                </button>
              )}

              {quickAttacks.map((atk) => {
                const spent = isActionSlotSpent('Padrão');
                const isDead = hero.hp <= 0;
                const isSelected = Boolean(
                  pendingAttackChoice &&
                    pendingAttackChoice.attackerCharacterId === hero.id &&
                    pendingAttackChoice.actionTitle === atk.name,
                );
                return (
                  <button
                    key={atk.id}
                    disabled={(spent && !isSelected) || isDead}
                    onClick={() =>
                      rollCharacterAction({
                        characterId: hero.id,
                        title: atk.name,
                        attackFormula: atk.attackBonusFormula,
                        damageFormula: atk.damageFormula,
                        damageType: atk.damageType,
                        range: atk.range,
                        actionCost: 'Padrão',
                      })
                    }
                    className={`rpg-card rpg-magic-card rarity-${atk.rarity} px-2.5 py-1.5 rounded-md flex items-center gap-1.5 shrink-0 cursor-pointer text-left disabled:opacity-40 disabled:cursor-not-allowed ${
                      isSelected ? 'ring-2 ring-amber-400 bg-amber-500/20' : ''
                    }`}
                    title={
                      isDead
                        ? 'Você está caído (0 PV) e não pode atacar'
                        : isSelected
                          ? `Clique novamente para cancelar ${atk.name}`
                          : `Atacar: ${formatFormulaForDisplay(atk.attackBonusFormula, stats, hero)} | Dano: ${formatFormulaForDisplay(atk.damageFormula, stats, hero)} | Alcance: ${atk.range}`
                    }
                  >
                    <Swords className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    <div className="leading-tight">
                      <div className="text-[11px] font-display font-bold max-w-[100px] truncate">
                        {atk.name}
                      </div>
                      <div className="text-[9px] font-mono-dice opacity-75">
                        {isSelected
                          ? '✕ Cancelar'
                          : formatFormulaForDisplay(atk.damageFormula, stats, hero)}
                      </div>
                    </div>
                  </button>
                );
              })}

              {quickWeapons.map((wp) => {
                const spent = isActionSlotSpent('Padrão');
                const isDead = hero.hp <= 0;
                const isSelected = Boolean(
                  pendingAttackChoice &&
                    pendingAttackChoice.attackerCharacterId === hero.id &&
                    pendingAttackChoice.actionTitle === wp.name,
                );
                return (
                  <button
                    key={wp.id}
                    disabled={(spent && !isSelected) || isDead}
                    onClick={() =>
                      rollCharacterAction({
                        characterId: hero.id,
                        title: wp.name,
                        attackFormula: wp.attackFormula,
                        damageFormula: wp.damageFormula,
                        damageType: wp.damageType,
                        range: wp.range,
                        actionCost: 'Padrão',
                      })
                    }
                    className={`rpg-card rpg-magic-card rarity-comum px-2.5 py-1.5 rounded-md flex items-center gap-1.5 shrink-0 cursor-pointer text-left disabled:opacity-40 disabled:cursor-not-allowed ${
                      isSelected ? 'ring-2 ring-amber-400 bg-amber-500/20' : ''
                    }`}
                    title={
                      isDead
                        ? 'Você está caído (0 PV) e não pode atacar'
                        : isSelected
                          ? `Clique novamente para cancelar ${wp.name}`
                          : `${wp.name} | Alcance: ${wp.range || 'Corpo a Corpo (1,5m)'}`
                    }
                  >
                    <Swords className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                    <div className="leading-tight">
                      <div className="text-[11px] font-display font-bold max-w-[100px] truncate">
                        {wp.name}
                      </div>
                      <div className="text-[9px] font-mono-dice opacity-75">
                        {isSelected ? '✕ Cancelar' : wp.range || '1,5m'}
                      </div>
                    </div>
                  </button>
                );
              })}

              {quickAbilities.map((ab) => {
                const cost = toEconomyCost(ab.actionType);
                const spent = isActionSlotSpent(cost);
                const isDead = hero.hp <= 0;
                const isSelected = Boolean(
                  pendingAttackChoice &&
                    pendingAttackChoice.attackerCharacterId === hero.id &&
                    pendingAttackChoice.actionTitle === ab.name,
                );
                return (
                  <button
                    key={ab.id}
                    disabled={(spent && !isSelected) || isDead}
                    onClick={() =>
                      rollCharacterAction({
                        characterId: hero.id,
                        title: ab.name,
                        attackFormula: ab.attackFormula,
                        damageFormula: ab.damageFormula,
                        damageType: ab.damageType,
                        range: ab.range,
                        actionCost: cost,
                        costMp: ab.costMp,
                      })
                    }
                    className={`rpg-card rpg-magic-card rarity-${ab.rarity} px-2.5 py-1.5 rounded-md flex items-center gap-1.5 shrink-0 cursor-pointer text-left disabled:opacity-40 disabled:cursor-not-allowed ${
                      isSelected ? 'ring-2 ring-amber-400 bg-amber-500/20' : ''
                    }`}
                    title={
                      isDead
                        ? 'Você está caído (0 PV) e não pode usar habilidades'
                        : isSelected
                          ? `Clique novamente para cancelar ${ab.name}`
                          : `${ab.actionType} • ${ab.description}`
                    }
                  >
                    <Flame className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <div className="leading-tight">
                      <div className="text-[11px] font-display font-bold max-w-[100px] truncate">
                        {ab.name}
                      </div>
                      <div className="text-[9px] font-mono-dice text-amber-300">
                        {isSelected
                          ? '✕ Cancelar'
                          : ab.costMp > 0
                            ? `${ab.costMp} ${campaign.settings.resourceShort}`
                            : ab.actionType}
                      </div>
                    </div>
                  </button>
                );
              })}

              {compendiumAbilities.slice(0, 3).map((ab) => {
                const cost = toEconomyCost(ab.actionType);
                const spent = isActionSlotSpent(cost);
                const isDead = hero.hp <= 0;
                const isSelected = Boolean(
                  pendingAttackChoice &&
                    pendingAttackChoice.attackerCharacterId === hero.id &&
                    pendingAttackChoice.actionTitle === ab.name,
                );
                return (
                  <button
                    key={ab.id}
                    disabled={(spent && !isSelected) || isDead}
                    onClick={() =>
                      rollCharacterAction({
                        characterId: hero.id,
                        title: ab.name,
                        attackFormula: ab.attackFormula,
                        damageFormula: ab.damageFormula,
                        damageType: ab.damageType,
                        range: ab.range,
                        actionCost: cost,
                        saveSkillId: ab.saveSkillId,
                        saveDcFormula: ab.saveDcFormula,
                        costMp: ab.costMp,
                        applyConditionId: ab.applyConditionId,
                        conditionDurationRounds: ab.conditionDurationRounds,
                      })
                    }
                    className={`rpg-card rpg-magic-card rarity-raro px-2.5 py-1.5 rounded-md flex items-center gap-1.5 shrink-0 cursor-pointer text-left disabled:opacity-40 disabled:cursor-not-allowed ${
                      isSelected ? 'ring-2 ring-amber-400 bg-amber-500/20' : ''
                    }`}
                    title={
                      isDead
                        ? 'Você está caído (0 PV) e não pode usar habilidades'
                        : isSelected
                          ? `Clique novamente para cancelar ${ab.name}`
                          : `${ab.actionType} • ${ab.range} • ${ab.description}`
                    }
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                    <div className="leading-tight">
                      <div className="text-[11px] font-display font-bold max-w-[100px] truncate">
                        {ab.name}
                      </div>
                      <div className="text-[9px] font-mono-dice text-amber-200/80">
                        {isSelected
                          ? '✕ Cancelar'
                          : ab.costMp > 0
                            ? `${ab.costMp} ${campaign.settings.resourceShort}`
                            : ab.actionType}
                      </div>
                    </div>
                  </button>
                );
              })}

              {quickConsumables.map(({ entry, def }) => (
                <button
                  key={entry.id}
                  disabled={isActionSlotSpent('Padrão') || hero.hp <= 0}
                  onClick={() => handleUseConsumable(entry.id, def.id)}
                  className="rpg-card rpg-magic-card rarity-comum px-2.5 py-1.5 rounded-md flex items-center gap-1.5 shrink-0 cursor-pointer text-left border-emerald-400/40 disabled:opacity-40 disabled:cursor-not-allowed"
                  title={
                    hero.hp <= 0
                      ? 'Você está caído (0 PV) e não pode usar consumíveis'
                      : def.description
                  }
                >
                  <FlaskConical className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <div className="leading-tight">
                    <div className="text-[11px] font-display font-bold max-w-[95px] truncate">
                      {def.name}
                    </div>
                    <div className="text-[9px] font-mono-dice text-emerald-300">
                      x{entry.quantity}
                    </div>
                  </div>
                </button>
              ))}

              {quickAttacks.length === 0 &&
                quickWeapons.length === 0 &&
                quickAbilities.length === 0 &&
                compendiumAbilities.length === 0 &&
                quickConsumables.length === 0 && (
                  <span className="text-[11px] font-lore italic px-2 opacity-65 whitespace-nowrap">
                    O Mestre forjará seus ataques aqui
                  </span>
                )}
            </div>

            {/* Right: Advantage Quick Switch + Request Rest + Open Sheet + Dice Tray */}
            <div
              className="flex items-center gap-1.5 pl-2 border-l shrink-0"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <button
                onClick={() =>
                  setAdvantageMode(
                    advantageMode === 'normal'
                      ? 'advantage'
                      : advantageMode === 'advantage'
                      ? 'disadvantage'
                      : 'normal'
                  )
                }
                className={`px-2.5 py-1.5 rounded-md text-[11px] font-display font-bold cursor-pointer transition ${
                  advantageMode === 'advantage'
                    ? 'bg-emerald-700 text-white border border-emerald-400'
                    : advantageMode === 'disadvantage'
                    ? 'bg-red-800 text-white border border-red-400'
                    : 'rpg-card'
                }`}
                title="Clique para alternar: Normal / Vantagem (2d20) / Desvantagem (2d20)"
              >
                {advantageMode === 'normal'
                  ? '1d20'
                  : advantageMode === 'advantage'
                  ? '2d20 Vant.'
                  : '2d20 Desv.'}
              </button>

              <div className="relative">
                <button
                  onClick={() => setShowRestMenu((v) => !v)}
                  className="rpg-card px-2.5 py-1.5 rounded-md text-xs font-display font-semibold flex items-center gap-1 cursor-pointer hover:border-amber-400/60"
                  title="Pedir Descanso ou Cura ao Mestre"
                >
                  <Moon className="w-3.5 h-3.5 text-amber-300" />
                  <span className="hidden lg:inline">Pedir</span>
                </button>

                {showRestMenu && (
                  <div className="absolute bottom-12 right-0 w-52 rpg-glass-panel rounded-lg p-2 space-y-1.5 shadow-2xl text-xs">
                    <div className="text-[10px] font-display uppercase tracking-wider opacity-70 px-1.5">
                      Solicitar ao Mestre
                    </div>
                    <button
                      onClick={() => {
                        sendPlayerRequest('short-rest', 'Descanso Curto');
                        setShowRestMenu(false);
                      }}
                      className="w-full text-left px-2.5 py-2 rounded-md rpg-card hover:border-amber-400/60 flex items-center gap-2 cursor-pointer"
                    >
                      <Coffee className="w-3.5 h-3.5 text-amber-400" />
                      <span>Pedir Descanso Curto</span>
                    </button>
                    <button
                      onClick={() => {
                        sendPlayerRequest('long-rest', 'Descanso Longo');
                        setShowRestMenu(false);
                      }}
                      className="w-full text-left px-2.5 py-2 rounded-md rpg-card hover:border-amber-400/60 flex items-center gap-2 cursor-pointer"
                    >
                      <Moon className="w-3.5 h-3.5 text-sky-400" />
                      <span>Pedir Descanso Longo</span>
                    </button>
                    <button
                      onClick={() => {
                        sendPlayerRequest('heal-mp', 'Cura / Restaurar Vitais');
                        setShowRestMenu(false);
                      }}
                      className="w-full text-left px-2.5 py-2 rounded-md rpg-card hover:border-amber-400/60 flex items-center gap-2 cursor-pointer"
                    >
                      <Heart className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Pedir Cura / PM</span>
                    </button>
                  </div>
                )}
              </div>

              <button
                onClick={onOpenSheet}
                className="rpg-card px-2.5 py-1.5 rounded-md text-xs font-display font-semibold flex items-center gap-1 cursor-pointer hover:border-amber-400/60"
              >
                <BookOpen className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />
                <span className="hidden md:inline">Ficha</span>
              </button>

              <button
                onClick={onToggleDiceDrawer}
                className={`px-3 py-1.5 rounded-md text-xs font-display font-bold flex items-center gap-1 cursor-pointer transition ${
                  diceDrawerOpen ? 'rpg-btn-primary' : 'rpg-card hover:border-amber-400/60'
                }`}
                title="Abrir/Fechar Bandeja de Dados & Histórico"
              >
                <Dices className="w-4 h-4" />
                <span className="hidden md:inline">Dados</span>
              </button>
            </div>
          </OrnateFrame>
        </div>
      )}
    </>
  );
};
