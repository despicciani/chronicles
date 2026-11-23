import React, { useEffect, useState } from 'react';
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
  MapPin,
  Moon,
  Plus,
  Save,
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
  buildPreviewDiceForFormula,
  computeCharacterStats,
  evaluateFormula,
  findNearestFreeGridCell,
  formatFormulaForDisplay,
  formatSigned,
  getCharacterCustomResourceState,
} from '../shared/rulesEngine';
import { ActionEconomyCost, NpcEntry } from '../shared/types';
import { DraggablePanel, DragGripBadge } from './DraggablePanel';
import { openEntitySheet } from './EntitySheetModal';
import { OrnateFrame, SculptedHealthBar } from './OrnateFrame';
import { openConfirmDialog, openTextPrompt } from './PromptDialog';
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
    awardXp,
    pushCombatLog,
    toggleHeroInspiration,
    spendHeroInspiration,
    quickRollFormula,
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
    activeSecretPassage,
    dismissSecretPassage,
    moveTokensToMap,
    resolveAssetUrl,
    sendRoll,
    triggerSlashVfx,
    tacticalAlert,
    opportunityPrompt,
    opportunityQueueCount,
    triggerOpportunityPrompt,
    performCombatManeuver,
    startCombatDuel,
    pendingAttackChoice,
    setPendingAttackChoice,
    applyDamage,
    setCharacterNextAttackOverride,
    saveCharacterToVault,
    lastSavedHeroFeedback,
    activeSavePrompt,
    rollSavePromptTarget,
    rollAllPendingSaveTargets,
    applySavePromptDamages,
    dismissSavePrompt,
    setCharacterConcentration,
    unreadChatCount,
    openManualRoll,
  } = useCampaign();

  const [showRestMenu, setShowRestMenu] = useState(false);
  const [showConcMenu, setShowConcMenu] = useState(false);
  const [showPlayerActions, setShowPlayerActions] = useState(false);
  const [showGmActions, setShowGmActions] = useState(false);
  const [actionSearch, setActionSearch] = useState('');
  const [playerSheetCollapsed, setPlayerSheetCollapsed] = useState(true);
  const [gmRosterCollapsed, setGmRosterCollapsed] = useState(true);
  const [gmRosterTab, setGmRosterTab] = useState<'heroes' | 'npcs' | 'monsters'>('heroes');
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
      if (!def || def.type !== 'Arma' || !def.attackFormula) return [];
      return [def];
    });
  const quickAbilities = (hero?.customAbilities || []).filter((a) => a.actionType !== 'Passiva');
  const passiveCustomAbilities = (hero?.customAbilities || []).filter(
    (a) => a.actionType === 'Passiva',
  );
  const compendiumAbilities = (hero?.knownAbilityIds || [])
    .map((id) => campaign.compendium.abilities.find((a) => a.id === id))
    .filter((a): a is NonNullable<typeof a> => Boolean(a))
    .filter((a) => a.actionType !== 'Passiva');
  const passiveCompendiumAbilities = (hero?.knownAbilityIds || [])
    .map((id) => campaign.compendium.abilities.find((a) => a.id === id))
    .filter((a): a is NonNullable<typeof a> => Boolean(a))
    .filter((a) => a.actionType === 'Passiva');

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

  // Tactical Keyboard Shortcuts: Esc (cancel targeting), 1-9 (hotbar slots), Space (end my combat turn)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === 'Escape' && pendingAttackChoice) {
        e.preventDefault();
        setPendingAttackChoice(null);
        return;
      }

      if (role !== 'player' || !hero || hero.hp <= 0) return;

      if (/^[1-9]$/.test(e.key)) {
        const slotIndex = Number(e.key) - 1;
        const hotbarTriggers: Array<() => void> = [
          ...quickAttacks.map((atk) => () =>
            rollCharacterAction({
              characterId: hero.id,
              title: atk.name,
              attackFormula: atk.attackBonusFormula,
              damageFormula: atk.damageFormula,
              damageType: atk.damageType,
              range: atk.range,
              actionCost: 'Padrão',
            })
          ),
          ...quickWeapons.map((wp) => () =>
            rollCharacterAction({
              characterId: hero.id,
              title: wp.name,
              attackFormula: wp.attackFormula,
              damageFormula: wp.damageFormula,
              damageType: wp.damageType,
              range: wp.range,
              actionCost: 'Padrão',
            })
          ),
          ...quickAbilities.map((ab) => () =>
            rollCharacterAction({
              characterId: hero.id,
              title: ab.name,
              attackFormula: ab.attackFormula,
              damageFormula: ab.damageFormula,
              damageType: ab.damageType,
              range: ab.range,
              actionCost: toEconomyCost(ab.actionType),
              costMp: ab.costMp,
            })
          ),
          ...compendiumAbilities.map((ab) => () =>
            rollCharacterAction({
              characterId: hero.id,
              title: ab.name,
              attackFormula: ab.attackFormula,
              damageFormula: ab.damageFormula,
              damageType: ab.damageType,
              range: ab.range,
              actionCost: toEconomyCost(ab.actionType),
              saveSkillId: ab.saveSkillId,
              saveDcFormula: ab.saveDcFormula,
              costMp: ab.costMp,
              costResourceId: ab.costResourceId,
              applyConditionId: ab.applyConditionId,
              conditionDurationRounds: ab.conditionDurationRounds,
              aoeShape: ab.aoeShape,
              aoeSizeMeters: ab.aoeSizeMeters,
              aoeColor: ab.aoeColor,
              aoePersistent: ab.aoePersistent,
            })
          ),
        ];
        if (slotIndex < hotbarTriggers.length) {
          e.preventDefault();
          setShowPlayerActions(false);
          hotbarTriggers[slotIndex]();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    activeTurnCombatant,
    campaign.combat,
    compendiumAbilities,
    hero,
    heroCombatant,
    pendingAttackChoice,
    quickAbilities,
    quickAttacks,
    quickWeapons,
    role,
    rollCharacterAction,
    setPendingAttackChoice,
    triggerOpportunityPrompt,
    updateCampaign,
  ]);

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
    const isMp =
      def.name.toLowerCase().includes('mana') ||
      def.name.toLowerCase().includes('éter') ||
      /\bpm\b/i.test(def.description);

    openManualRoll({
      title: `Usar ${def.name}`,
      subtitle: isMp ? `Recupera ${campaign.settings.resourceShort}` : 'Recupera Pontos de Vida',
      formula,
      displayFormula: formatFormulaForDisplay(formula, stats, hero),
      previewDice: buildPreviewDiceForFormula(formula, 'normal'),
      rollerName: hero.name,
      rollerColor: heroColor,
      diceSkin: hero.diceSkin || 'emerald',
      allowAdvantageToggle: false,
      advantageMode: 'normal',
      onExecute: () => {
        const res = evaluateFormula(formula, stats, hero);
        const amount = Math.max(1, res.total);
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
          combat: {
            ...prev.combat,
            combatants: prev.combat.combatants.map((c) =>
              c.type === 'character' && c.referenceId === hero.id
                ? {
                    ...c,
                    ...(isMp ? {} : { hp: nextHp, maxHp: stats.maxHp }),
                    ...(prev.combat.active ? { bonusActionAvailable: false } : {}),
                  }
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
      },
    });
  };

  const heroColor = hero?.playerColor || hero?.tokenColor || '#e0b84c';

  // GM Tactical Command Dock State: ONLY inspect when a token is actively selected (clicking empty map clears targetTokenId -> clean compact dock!)
  const gmInspectedToken =
    role === 'gm' && targetTokenId
      ? activeMap?.tokens.find((t) => t.id === targetTokenId)
      : undefined;

  const gmInspectedMonster =
    gmInspectedToken?.type === 'monster' && gmInspectedToken.referenceId
      ? campaign.compendium.monsters.find((m) => m.id === gmInspectedToken.referenceId)
      : undefined;

  const gmInspectedNpc =
    gmInspectedToken?.type === 'npc' && gmInspectedToken.referenceId
      ? campaign.npcs.find((n) => n.id === gmInspectedToken.referenceId)
      : undefined;

  const gmInspectedChar =
    role === 'gm' && gmInspectedToken?.type === 'character' && gmInspectedToken.referenceId
      ? campaign.characters.find((c) => c.id === gmInspectedToken.referenceId)
      : undefined;

  const gmInspectedCharStats = gmInspectedChar
    ? computeCharacterStats(gmInspectedChar, campaign)
    : null;

  const gmMapMonsters = (activeMap?.tokens || []).filter(
    (t) => t.type === 'monster' || t.type === 'npc'
  );

  const placeHeroOnActiveMap = (characterId: string) => {
    const ch = campaign.characters.find((c) => c.id === characterId);
    if (!ch || !activeMap) return;
    const stats = computeCharacterStats(ch, campaign);
    const existing = activeMap.tokens.find(
      (t) => t.type === 'character' && t.referenceId === ch.id
    );
    if (existing) {
      setActiveCharacterId(ch.id);
      setTargetTokenId(existing.id);
      return;
    }
    const pos = findNearestFreeGridCell(
      activeMap,
      Math.floor(activeMap.gridWidth / 2),
      Math.floor(activeMap.gridHeight / 2),
      1
    );
    const newId = `tok-${ch.id}-${Date.now()}`;
    updateCampaign((prev) => ({
      ...prev,
      maps: prev.maps.map((m) =>
        m.id !== prev.activeMapId
          ? m
          : {
              ...m,
              tokens: [
                ...m.tokens,
                {
                  id: newId,
                  name: ch.name.split(' ')[0],
                  type: 'character',
                  referenceId: ch.id,
                  x: pos.x,
                  y: pos.y,
                  size: 1,
                  hp: ch.hp,
                  maxHp: stats.maxHp,
                  defense: stats.defense,
                  activeConditionIds: ch.activeConditionIds,
                  isHidden: false,
                  color: ch.playerColor || ch.tokenColor,
                  frameStyle: ch.tokenFrameStyle || 'gold',
                  imageUrl: ch.portraitUrl,
                },
              ],
            }
      ),
    }));
    setActiveCharacterId(ch.id);
    setTargetTokenId(newId);
  };

  const quickCreateNpc = async () => {
    const name = await openTextPrompt('Nome do novo NPC:', 'Novo NPC');
    if (!name || !name.trim()) return;
    const npc: NpcEntry = {
      id: `npc-${Date.now()}`,
      name: name.trim(),
      role: 'Habitante / Aliado',
      location: activeMap?.name || 'Local Atual',
      imageUrl: '',
      tokenColor: '#e0b84c',
      publicBio: 'Descrição visível para os jogadores.',
      secretNotes: '',
      sharedPartyNotes: '',
      revealedToPlayers: false,
      disposition: 'Neutro',
      combatEnabled: false,
      maxHp: 15,
      defense: 11,
      speed: 9,
      attacks: [],
    };
    updateCampaign((prev) => ({ ...prev, npcs: [npc, ...prev.npcs] }));
  };

  const placeNpcOnActiveMap = (npc: NpcEntry) => {
    if (!activeMap) return;
    const npcColor =
      npc.tokenColor ||
      (npc.disposition === 'Hostil'
        ? '#ef4444'
        : npc.disposition === 'Aliado'
          ? '#22c55e'
          : '#e0b84c');
    const npcFrame =
      npc.disposition === 'Hostil'
        ? 'crimson'
        : npc.disposition === 'Aliado'
          ? 'emerald'
          : 'gold';
    const existing = activeMap.tokens.find(
      (t) => t.type === 'npc' && t.referenceId === npc.id
    );
    if (existing) {
      setTargetTokenId(existing.id);
      return;
    }
    const pos = findNearestFreeGridCell(
      activeMap,
      Math.floor(activeMap.gridWidth / 2),
      Math.floor(activeMap.gridHeight / 2),
      1
    );
    const newId = `tok-npc-${npc.id}-${Date.now()}`;
    updateCampaign((prev) => ({
      ...prev,
      maps: prev.maps.map((m) =>
        m.id !== prev.activeMapId
          ? m
          : {
              ...m,
              tokens: [
                ...m.tokens,
                {
                  id: newId,
                  name: npc.name,
                  type: 'npc',
                  referenceId: npc.id,
                  x: pos.x,
                  y: pos.y,
                  size: 1,
                  hp: npc.maxHp || 15,
                  maxHp: npc.maxHp || 15,
                  defense: npc.defense || 11,
                  activeConditionIds: [],
                  isHidden: !npc.revealedToPlayers,
                  color: npcColor,
                  frameStyle: npcFrame,
                  imageUrl: npc.imageUrl,
                },
              ],
            }
      ),
    }));
    setTargetTokenId(newId);
  };

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
      {/* GM Prominent Modal Overlay for Player Hero Join Approval (claim-hero / import-hero) */}
      {role === 'gm' &&
        pendingRequests.some((r) => r.type === 'claim-hero' || r.type === 'import-hero') && (
          <div className="fixed inset-0 z-[75] bg-black/60 backdrop-blur-[2px] flex items-center justify-center p-4 pointer-events-auto">
            <div className="max-w-md w-full space-y-3">
              {pendingRequests
                .filter((r) => r.type === 'claim-hero' || r.type === 'import-hero')
                .map((req) => (
                  <OrnateFrame
                    key={req.id}
                    accentColor="#e4ba52"
                    className="rpg-glass-panel rounded-lg p-5 space-y-4 shadow-[0_24px_70px_rgba(0,0,0,0.95)] animate-modal-unfurl"
                  >
                    <div className="flex items-start justify-between gap-2 border-b pb-2.5" style={{ borderColor: 'var(--border-subtle)' }}>
                      <div className="flex items-center gap-2">
                        <Shield className="w-5 h-5 text-amber-400 shrink-0" />
                        <div>
                          <div className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-amber-300">
                            Autorização do Mestre
                          </div>
                          <h3 className="font-chronicle font-bold text-base text-amber-100">
                            Jogador quer entrar como Herói
                          </h3>
                        </div>
                      </div>
                      <span className="text-[10px] opacity-65 font-mono-dice">{req.createdAt}</span>
                    </div>

                    <div className="rpg-card rounded-lg p-3 flex items-center gap-3">
                      <TokenPortrait
                        name={req.characterName}
                        imageUrl={req.characterPortraitUrl}
                        playerColor={req.playerColor || '#38bdf8'}
                        frameStyle="gold"
                        sizePx={52}
                      />
                      <div className="min-w-0 flex-1 text-xs space-y-0.5">
                        <div>
                          <strong style={{ color: req.playerColor || '#38bdf8' }}>
                            {req.requesterPlayerName || 'Jogador'}
                          </strong>{' '}
                          deseja entrar controlando:
                        </div>
                        <div className="font-display font-bold text-sm text-amber-200 truncate">
                          {req.characterName}
                        </div>
                        <div className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                          {req.type === 'import-hero'
                            ? 'Herói carregado do Cofre / arquivo salvo'
                            : 'Herói já existente nesta campanha'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <button
                        onClick={() => resolvePlayerRequest(req.id, true)}
                        className="flex-1 py-2.5 rounded-md bg-emerald-700 hover:bg-emerald-600 border border-emerald-400/50 text-white text-xs font-display font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-lg"
                      >
                        <Check className="w-4 h-4" />
                        <span>Permitir Entrada</span>
                      </button>
                      <button
                        onClick={() => resolvePlayerRequest(req.id, false)}
                        className="flex-1 py-2.5 rounded-md bg-red-900/90 hover:bg-red-800 border border-red-400/50 text-white text-xs font-display font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                        <span>Recusar</span>
                      </button>
                    </div>
                  </OrnateFrame>
                ))}
            </div>
          </div>
        )}

      {/* GM Floating Pending Requests from Players (Rests / Heals) */}
      {role === 'gm' &&
        pendingRequests.some((r) => r.type !== 'claim-hero' && r.type !== 'import-hero') && (
          <DraggablePanel
            storageKey="gm-pending-requests"
            className="fixed top-20 right-4 z-40 w-80 space-y-2 pointer-events-auto"
          >
            {pendingRequests
              .filter((r) => r.type !== 'claim-hero' && r.type !== 'import-hero')
              .map((req) => (
            <div
              key={req.id}
              className="rpg-glass-panel rounded-lg p-3.5 space-y-2.5 animate-ui-enter shadow-2xl"
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
        </DraggablePanel>
      )}

      {/* Opportunity Attack Reaction Prompt (locks movement while open!) */}
      {opportunityPrompt && opportunityTargetToken && canRespondOpportunity && (
        <div className="fixed bottom-32 left-1/2 -translate-x-1/2 z-45 max-w-md w-[92vw] pointer-events-auto animate-modal-unfurl">
          <OrnateFrame
            accentColor="#e4ba52"
            className="rpg-glass-panel rounded-lg p-3.5 shadow-[0_18px_50px_rgba(0,0,0,0.92)] space-y-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-400 shrink-0" />
                <div className="text-xs">
                  <div className="font-display font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                    <span>Ataque de Oportunidade! (Reação)</span>
                    {opportunityQueueCount > 1 && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-400/50 text-[10px] text-amber-200">
                        1 de {opportunityQueueCount}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    <strong>{opportunityPrompt.targetName}</strong> saiu do alcance corpo a corpo de{' '}
                    <strong style={{ color: opportunityPrompt.reactorColor }}>
                      {opportunityPrompt.reactorName}
                    </strong>
                    . Movimentação travada até resolver.
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

      {opportunityPrompt && opportunityTargetToken && !canRespondOpportunity && (
        <div className="fixed bottom-32 left-1/2 -translate-x-1/2 z-45 max-w-md w-[92vw] pointer-events-none animate-modal-unfurl">
          <OrnateFrame
            accentColor="#e4ba52"
            className="rpg-glass-panel rounded-lg px-4 py-2.5 shadow-[0_18px_50px_rgba(0,0,0,0.92)] flex items-center gap-2.5 text-xs"
          >
            <Zap className="w-4 h-4 text-amber-400 shrink-0" />
            <div>
              <div className="font-display font-bold text-amber-300 uppercase tracking-wider text-[11px]">
                Reação em Andamento — Movimento Travado
              </div>
              <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                Aguarde <strong style={{ color: opportunityPrompt.reactorColor }}>{opportunityPrompt.reactorName}</strong> resolver ou passar o Ataque de Oportunidade contra <strong>{opportunityPrompt.targetName}</strong>.
              </div>
            </div>
          </OrnateFrame>
        </div>
      )}

      {/* Unified Hybrid Save Prompt Overlay (Automatic Traps, AoE Spells, & Spell Concentration) */}
      {activeSavePrompt && (
        <DraggablePanel
          storageKey="tactical-save-prompt"
          className="fixed bottom-36 left-1/2 -translate-x-1/2 z-50 max-w-lg w-[94vw] pointer-events-auto animate-modal-unfurl"
        >
          <OrnateFrame
            accentColor={
              activeSavePrompt.kind === 'concentration'
                ? '#a855f7'
                : activeSavePrompt.kind === 'trap'
                  ? '#ef4444'
                  : '#f59e0b'
            }
            className="rpg-glass-panel rounded-lg p-4 shadow-[0_22px_60px_rgba(0,0,0,0.95)] space-y-3 text-xs"
          >
            <div className="flex items-start justify-between gap-2 border-b pb-2" style={{ borderColor: 'var(--border-subtle)' }}>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 font-display font-bold text-[10px] uppercase tracking-widest text-amber-300">
                  {activeSavePrompt.kind === 'concentration' ? (
                    <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                  ) : activeSavePrompt.kind === 'trap' ? (
                    <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                  ) : (
                    <Flame className="w-3.5 h-3.5 text-amber-400" />
                  )}
                  <span>
                    {activeSavePrompt.kind === 'concentration'
                      ? 'Teste de Concentração'
                      : activeSavePrompt.kind === 'trap'
                        ? 'Armadilha Disparada!'
                        : 'Salvaguarda em Área (AoE)'}
                  </span>
                </div>
                <div className="font-chronicle font-bold text-base text-amber-100 truncate mt-0.5">
                  {activeSavePrompt.title}
                </div>
                {activeSavePrompt.subtitle && (
                  <p className="text-[11px] font-lore opacity-85 leading-snug">
                    {activeSavePrompt.subtitle}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <DragGripBadge />
                <button
                  onClick={dismissSavePrompt}
                  className="rpg-card p-1 rounded cursor-pointer"
                  title="Fechar painel"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="rpg-socket px-2 py-0.5 rounded font-display font-bold text-amber-200 border border-amber-500/40">
                {activeSavePrompt.saveLabel} • CD {activeSavePrompt.dc}
              </span>
              {activeSavePrompt.rolledRawDamage !== undefined && activeSavePrompt.rolledRawDamage > 0 && (
                <span className="rpg-socket px-2 py-0.5 rounded font-mono-dice font-bold text-red-300 border border-red-500/40">
                  Dano Base: {activeSavePrompt.rolledRawDamage} ({activeSavePrompt.damageType || 'Dano'})
                  {activeSavePrompt.halfOnSuccess ? ' • ½ se passar' : ''}
                </span>
              )}
            </div>

            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {activeSavePrompt.targets.map((t) => {
                const canPlayerRoll =
                  t.status === 'pending' &&
                  (role === 'gm' || (myCharacter && t.characterId === myCharacter.id));
                return (
                  <div
                    key={t.tokenId}
                    className="rpg-card rounded-md px-2.5 py-2 flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <TokenPortrait
                        name={t.name}
                        imageUrl={t.imageUrl}
                        playerColor={t.color}
                        sizePx={32}
                      />
                      <div className="min-w-0">
                        <div className="font-display font-bold text-xs text-amber-100 truncate">
                          {t.name}
                        </div>
                        {t.status === 'pending' ? (
                          <div className="text-[10px] text-amber-300/80">
                            Aguardando rolagem de {activeSavePrompt.saveLabel}...
                          </div>
                        ) : (
                          <div className="text-[10px] font-mono-dice">
                            d20 ({t.d20}) {t.bonus !== undefined && (t.bonus >= 0 ? `+ ${t.bonus}` : `- ${Math.abs(t.bonus)}`)} ={' '}
                            <strong>{t.total}</strong> vs CD {activeSavePrompt.dc}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {t.status === 'pending' ? (
                        canPlayerRoll ? (
                          <button
                            onClick={() => rollSavePromptTarget(t.tokenId)}
                            className="rpg-btn-primary px-3 py-1 rounded-md text-[11px] font-display font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Dices className="w-3.5 h-3.5" />
                            <span>Rolar d20</span>
                          </button>
                        ) : (
                          <span className="text-[10px] opacity-65 italic">Pendente</span>
                        )
                      ) : (
                        <div className="text-right">
                          <div
                            className={`px-2 py-0.5 rounded text-[10px] font-display font-bold border ${
                              t.status === 'passed'
                                ? 'bg-emerald-950/85 border-emerald-400/70 text-emerald-200'
                                : 'bg-red-950/85 border-red-400/70 text-red-200'
                            }`}
                          >
                            {activeSavePrompt.kind === 'concentration'
                              ? t.status === 'passed'
                                ? 'Manteve ✓'
                                : 'Perdeu!'
                              : t.status === 'passed'
                                ? `Passou${t.damageToApply > 0 ? ` (-${t.damageToApply})` : ' (0)'}`
                                : `Falhou (-${t.damageToApply})`}
                          </div>
                          {t.applied && (
                            <div className="text-[9px] text-emerald-300 mt-0.5">Aplicado ✓</div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {role === 'gm' && (
              <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                {activeSavePrompt.targets.some((t) => t.status === 'pending') && (
                  <button
                    onClick={rollAllPendingSaveTargets}
                    className="rpg-card px-3 py-1.5 rounded-md text-[11px] font-display font-bold cursor-pointer hover:border-amber-400/60"
                  >
                    Rolar Pendentes (Mestre)
                  </button>
                )}
                {activeSavePrompt.kind !== 'concentration' &&
                  activeSavePrompt.targets.some(
                    (t) => t.status !== 'pending' && !t.applied && t.damageToApply > 0
                  ) && (
                    <button
                      onClick={applySavePromptDamages}
                      className="rpg-btn-crimson px-3.5 py-1.5 rounded-md text-[11px] font-display font-bold cursor-pointer"
                    >
                      Aplicar Dano em Todos
                    </button>
                  )}
                <button
                  onClick={dismissSavePrompt}
                  className="rpg-card px-3 py-1.5 rounded-md text-[11px] cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            )}
          </OrnateFrame>
        </DraggablePanel>
      )}

      {/* Secret Passage Notification Banner (with 1-Click Map Transfer for GM) */}
      {activeSecretPassage && (role === 'gm' || activeSecretPassage.revealed) && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 max-w-lg w-[94vw] pointer-events-auto animate-ui-enter">
          <OrnateFrame
            accentColor="#c084fc"
            cornerSize={14}
            className="rpg-glass-panel rounded-lg p-4 space-y-3 shadow-2xl border border-purple-400/60"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-widest font-display font-bold text-purple-300">
                  Passagem Secreta {activeSecretPassage.revealed ? 'Descoberta' : 'Acionada (Oculta)'}
                </div>
                <h4 className="font-display font-bold text-base text-amber-100 mt-0.5">
                  {activeSecretPassage.markerTitle}
                </h4>
                <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                  {activeSecretPassage.tokenName
                    ? `${activeSecretPassage.tokenName} encontrou esta passagem.`
                    : 'Passagem secreta ativada no mapa.'}
                  {activeSecretPassage.markerDescription ? ` ${activeSecretPassage.markerDescription}` : ''}
                </p>
                {activeSecretPassage.targetMapName && (
                  <div className="text-[11px] text-purple-200 font-semibold mt-1">
                    Destino vinculado: <span className="text-amber-300">{activeSecretPassage.targetMapName}</span>
                  </div>
                )}
              </div>
              <button
                onClick={dismissSecretPassage}
                className="rpg-card p-1 rounded cursor-pointer"
                title="Fechar aviso"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {role !== 'gm' &&
              activeSecretPassage.revealed &&
              activeSecretPassage.targetMapId && (
                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => {
                      const myTokId =
                        activeSecretPassage.tokenId ||
                        activeMap?.tokens.find(
                          (t) =>
                            t.type === 'character' &&
                            myCharacter &&
                            t.referenceId === myCharacter.id
                        )?.id;
                      if (myTokId) {
                        moveTokensToMap(
                          activeSecretPassage.sourceMapId,
                          activeSecretPassage.targetMapId!,
                          [myTokId]
                        );
                      } else {
                        updateCampaign((prev) => ({
                          ...prev,
                          activeMapId: activeSecretPassage.targetMapId!,
                        }));
                        dismissSecretPassage();
                      }
                    }}
                    className="rpg-btn-primary px-3.5 py-1.5 rounded text-xs font-display font-bold cursor-pointer"
                  >
                    Atravessar Passagem → {activeSecretPassage.targetMapName}
                  </button>
                </div>
              )}

            {role === 'gm' && (
              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-white/10">
                {!activeSecretPassage.revealed && (
                  <button
                    onClick={() => {
                      updateCampaign((prev) => ({
                        ...prev,
                        maps: prev.maps.map((m) =>
                          m.id === activeSecretPassage.sourceMapId
                            ? {
                                ...m,
                                gmMarkers: (m.gmMarkers || []).map((gm) =>
                                  gm.id === activeSecretPassage.markerId
                                    ? { ...gm, revealed: true }
                                    : gm
                                ),
                              }
                            : m
                        ),
                      }));
                    }}
                    className="rpg-card px-3 py-1.5 rounded text-xs font-display font-bold text-purple-200 border border-purple-400/50 cursor-pointer"
                  >
                    Revelar Passagem
                  </button>
                )}

                {activeSecretPassage.targetMapId && activeSecretPassage.tokenId && (
                  <button
                    onClick={() =>
                      moveTokensToMap(
                        activeSecretPassage.sourceMapId,
                        activeSecretPassage.targetMapId!,
                        [activeSecretPassage.tokenId!]
                      )
                    }
                    className="rpg-btn-primary px-3 py-1.5 rounded text-xs font-display font-bold cursor-pointer"
                  >
                    Mover {activeSecretPassage.tokenName || 'Herói'} → {activeSecretPassage.targetMapName}
                  </button>
                )}

                {activeSecretPassage.targetMapId && (
                  <button
                    onClick={() =>
                      moveTokensToMap(
                        activeSecretPassage.sourceMapId,
                        activeSecretPassage.targetMapId!,
                        'all-heroes'
                      )
                    }
                    className="rpg-card px-3 py-1.5 rounded text-xs font-display font-bold text-amber-200 border border-amber-400/50 cursor-pointer"
                  >
                    Mover Grupo Inteiro → {activeSecretPassage.targetMapName}
                  </button>
                )}
              </div>
            )}
          </OrnateFrame>
        </div>
      )}

      {/* Tactical Rule Alert (Range / Action Economy / Turn Guard) */}
      {tacticalAlert && (
        <div className="fixed bottom-32 left-1/2 -translate-x-1/2 z-45 pointer-events-none animate-ui-enter">
          <div className="rpg-glass-panel rounded-md px-4 py-2 text-xs font-semibold border border-red-400/70 text-red-200 flex items-center gap-2 shadow-2xl">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{tacticalAlert.message}</span>
          </div>
        </div>
      )}

      {/* Player Feedback Toast when GM approves/denies */}
      {requestToast && (
        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-40 pointer-events-none animate-ui-enter">
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
        <DraggablePanel
          storageKey="gm-left-command-roster"
          className="fixed left-3 top-36 bottom-28 z-25 pointer-events-none flex items-start"
        >
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
              className="pointer-events-auto w-[264px] max-h-full rpg-glass-panel rounded-lg flex flex-col shadow-[0_22px_60px_rgba(0,0,0,0.92)] animate-modal-unfurl overflow-hidden"
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
                <div className="flex items-center gap-1 shrink-0">
                  <DragGripBadge />
                  <button
                    onClick={() => setGmRosterCollapsed(true)}
                    className="rpg-card p-1 rounded hover:border-amber-400/60 cursor-pointer shrink-0"
                    title="Recolher Painel Esquerdo"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div
                className="px-2 pt-2 pb-1.5 grid grid-cols-3 gap-1 border-b shrink-0"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <button
                  onClick={() => setGmRosterTab('heroes')}
                  className={`px-1.5 py-1 rounded-md text-[10px] font-display font-bold flex items-center justify-center gap-1 cursor-pointer transition ${
                    gmRosterTab === 'heroes'
                      ? 'rpg-btn-primary'
                      : 'rpg-card opacity-80 hover:opacity-100'
                  }`}
                >
                  <Users className="w-3 h-3 shrink-0" />
                  <span className="truncate">Heróis ({campaign.characters.length})</span>
                </button>
                <button
                  onClick={() => setGmRosterTab('npcs')}
                  className={`px-1.5 py-1 rounded-md text-[10px] font-display font-bold flex items-center justify-center gap-1 cursor-pointer transition ${
                    gmRosterTab === 'npcs'
                      ? 'rpg-btn-primary'
                      : 'rpg-card opacity-80 hover:opacity-100'
                  }`}
                >
                  <Sparkles className="w-3 h-3 shrink-0" />
                  <span className="truncate">NPCs ({campaign.npcs.length})</span>
                </button>
                <button
                  onClick={() => setGmRosterTab('monsters')}
                  className={`px-1.5 py-1 rounded-md text-[10px] font-display font-bold flex items-center justify-center gap-1 cursor-pointer transition ${
                    gmRosterTab === 'monsters'
                      ? 'rpg-btn-crimson'
                      : 'rpg-card opacity-80 hover:opacity-100'
                  }`}
                >
                  <Swords className="w-3 h-3 shrink-0" />
                  <span className="truncate">Mapa ({gmMapMonsters.length})</span>
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
                    <>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={async () => {
                            const raw = await openTextPrompt(
                              'Dar XP para TODOS os heróis do grupo:',
                              '250'
                            );
                            const val = Number(raw);
                            if (raw && Number.isFinite(val) && val !== 0) {
                              awardXp('all', val);
                            }
                          }}
                          className="rpg-btn-primary px-2 py-1.5 rounded-md text-[10px] font-display font-bold flex items-center justify-center gap-1 cursor-pointer"
                          title="Conceder XP para todos os heróis simultaneamente (com Level Up automático)"
                        >
                          <Sparkles className="w-3 h-3" />
                          <span>+XP Grupo</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            updateCampaign((prev) => ({
                              ...prev,
                              activeLootChest: prev.activeLootChest?.open
                                ? prev.activeLootChest
                                : {
                                    id: `chest-${Date.now()}`,
                                    title: 'Baú de Tesouro',
                                    gold: 100,
                                    items: [],
                                    open: true,
                                  },
                            }))
                          }
                          className="rpg-card px-2 py-1.5 rounded-md text-[10px] font-display font-bold text-amber-200 hover:border-amber-400 flex items-center justify-center gap-1 cursor-pointer"
                          title="Abrir um Baú de Saque ao vivo na tela de todos os jogadores"
                        >
                          <Sparkles className="w-3 h-3 text-amber-400" />
                          <span>Baú Saque</span>
                        </button>
                      </div>
                      {campaign.characters.map((ch) => {
                      const chStats = computeCharacterStats(ch, campaign);
                      const chClass = campaign.compendium.classes.find((cl) => cl.id === ch.classId);
                      const chRace = campaign.compendium.races.find((rc) => rc.id === ch.raceId);
                      const chColor = ch.playerColor || ch.tokenColor || '#e0b84c';
                      const chToken = activeMap?.tokens.find(
                        (t) => t.type === 'character' && t.referenceId === ch.id
                      );
                      const isSelected = ch.id === activeCharacterId;
                      const isExpanded = isSelected || expandedHeroId === ch.id;
                      const isDead = ch.hp <= 0;

                      const heroWeapons = (ch.inventory || [])
                        .filter((inv) => inv.equipped)
                        .flatMap((inv) => {
                          const def = campaign.compendium.items.find((i) => i.id === inv.itemId);
                          return def && def.type === 'Arma' && def.attackFormula ? [def] : [];
                        });

                      const heroAbilities = (ch.knownAbilityIds || [])
                        .map((id) => campaign.compendium.abilities.find((a) => a.id === id))
                        .filter((a): a is NonNullable<typeof a> => Boolean(a))
                        .filter((a) => a.actionType !== 'Passiva');

                      return (
                        <div
                          key={ch.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('application/x-chronicle-hero', ch.id);
                            e.dataTransfer.setData('text/plain', ch.name);
                            e.dataTransfer.effectAllowed = 'copyMove';
                          }}
                          title={`Arraste ${ch.name} para qualquer quadrado do mapa para posicioná-lo`}
                          className={`rpg-card rounded-lg p-2.5 space-y-2 transition cursor-grab active:cursor-grabbing ${
                            isSelected
                              ? 'border-amber-400/90 bg-amber-500/10 shadow-[0_0_18px_rgba(245,158,11,0.16)]'
                              : ''
                          }`}
                        >
                          <div className="flex items-center justify-between text-[9px] font-display uppercase tracking-wider text-amber-300/75">
                            <span>⠿ Arraste p/ mapa</span>
                            {!chToken && (
                              <button
                                type="button"
                                onClick={() => placeHeroOnActiveMap(ch.id)}
                                className="px-1.5 py-0.2 rounded bg-amber-500/20 border border-amber-400/50 text-amber-200 hover:bg-amber-500/35 cursor-pointer flex items-center gap-0.5"
                                title={`Colocar ${ch.name} neste mapa`}
                              >
                                <MapPin className="w-2.5 h-2.5" /> + Mapa
                              </button>
                            )}
                          </div>
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

                          {/* GM 1-Click Next-Attack Advantage / Disadvantage Override + Individual XP */}
                          <div className="flex items-center gap-1 text-[9px]">
                            <button
                              onClick={() => setCharacterNextAttackOverride(ch.id, 'advantage')}
                              className={`flex-1 px-1.5 py-0.5 rounded font-display font-bold border cursor-pointer transition ${
                                ch.nextAttackRollOverride === 'advantage'
                                  ? 'bg-emerald-900/90 border-emerald-400 text-emerald-100'
                                  : 'rpg-card text-emerald-300/85 hover:border-emerald-400/60'
                              }`}
                              title="Conceder Vantagem no próximo ataque deste jogador"
                            >
                              +Vant
                            </button>
                            <button
                              onClick={() => setCharacterNextAttackOverride(ch.id, 'disadvantage')}
                              className={`flex-1 px-1.5 py-0.5 rounded font-display font-bold border cursor-pointer transition ${
                                ch.nextAttackRollOverride === 'disadvantage'
                                  ? 'bg-red-900/90 border-red-400 text-red-100'
                                  : 'rpg-card text-red-300/85 hover:border-red-400/60'
                              }`}
                              title="Impor Desvantagem no próximo ataque deste jogador"
                            >
                              +Desv
                            </button>
                            <button
                              onClick={async () => {
                                const raw = await openTextPrompt(`Dar XP para ${ch.name}:`, '100');
                                const val = Number(raw);
                                if (raw && Number.isFinite(val) && val !== 0) {
                                  awardXp([ch.id], val);
                                }
                              }}
                              className="px-1.5 py-0.5 rounded font-display font-bold border border-amber-400/50 bg-amber-950/60 text-amber-200 hover:bg-amber-800/80 cursor-pointer"
                              title={`Conceder XP individual para ${ch.name} (Atual: ${ch.xp ?? 0} XP)`}
                            >
                              +XP
                            </button>
                            <button
                              onClick={() => toggleHeroInspiration(ch.id)}
                              className={`px-1.5 py-0.5 rounded font-display font-bold border cursor-pointer transition ${
                                ch.hasInspiration
                                  ? 'bg-amber-500/30 border-amber-300 text-amber-200 shadow-[0_0_8px_rgba(251,191,36,0.5)]'
                                  : 'rpg-card text-amber-300/70 hover:border-amber-400'
                              }`}
                              title={
                                ch.hasInspiration
                                  ? `${ch.name} possui ★ Inspiração Heroica (clique para remover)`
                                  : `Conceder ★ Inspiração Heroica para ${ch.name}`
                              }
                            >
                              ★
                            </button>
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
                              onClick={async () => {
                                if (
                                  await openConfirmDialog(
                                    `Excluir permanentemente o personagem "${ch.name}" desta campanha?`,
                                    'Excluir Personagem'
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
                    })}
                    </>
                  )
                ) : gmRosterTab === 'npcs' ? (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={quickCreateNpc}
                      className="w-full rpg-btn-primary py-1.5 rounded-md text-[11px] font-display font-bold flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Novo NPC Rápido
                    </button>
                    {campaign.npcs.length === 0 ? (
                      <div className="rpg-card rounded-md p-4 text-center text-xs font-lore italic opacity-75">
                        Nenhum NPC criado. Clique acima ou abra o Diário → NPCs para editar foto, bio e combate.
                      </div>
                    ) : (
                      campaign.npcs.map((npc) => {
                        const npcColor =
                          npc.tokenColor ||
                          (npc.disposition === 'Hostil'
                            ? '#ef4444'
                            : npc.disposition === 'Aliado'
                              ? '#22c55e'
                              : '#e0b84c');
                        const npcFrame =
                          npc.disposition === 'Hostil'
                            ? 'crimson'
                            : npc.disposition === 'Aliado'
                              ? 'emerald'
                              : 'gold';
                        const npcTok = activeMap?.tokens.find(
                          (t) => t.type === 'npc' && t.referenceId === npc.id
                        );
                        return (
                          <div
                            key={npc.id}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData('application/x-chronicle-npc', npc.id);
                              e.dataTransfer.setData('text/plain', npc.name);
                              e.dataTransfer.effectAllowed = 'copyMove';
                            }}
                            title={`Arraste ${npc.name} para qualquer quadrado do mapa`}
                            className="rpg-card rounded-lg p-2.5 space-y-1.5 cursor-grab active:cursor-grabbing hover:border-amber-400/60 transition"
                          >
                            <div className="flex items-center gap-2">
                              <TokenPortrait
                                name={npc.name}
                                imageUrl={npc.imageUrl}
                                playerColor={npcColor}
                                frameStyle={npcFrame}
                                sizePx={36}
                              />
                              <div className="min-w-0 flex-1">
                                <div className="font-display font-bold text-xs truncate text-amber-100">
                                  {npc.name}
                                </div>
                                <div className="text-[10px] truncate" style={{ color: 'var(--text-secondary)' }}>
                                  {npc.role} • {npc.disposition}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center justify-between gap-1 text-[10px] pt-1 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                              <span className="opacity-70 font-display uppercase text-[9px]">
                                {npc.combatEnabled
                                  ? `PV ${npc.maxHp || 15} • CA ${npc.defense || 11}`
                                  : '⠿ Arraste p/ mapa'}
                              </span>
                              <button
                                type="button"
                                onClick={() => placeNpcOnActiveMap(npc)}
                                className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-400/50 text-amber-200 hover:bg-amber-500/35 font-display font-bold text-[10px] flex items-center gap-0.5 cursor-pointer"
                              >
                                <MapPin className="w-2.5 h-2.5" />
                                <span>{npcTok ? 'Focar' : '+ Mapa'}</span>
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
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
        </DraggablePanel>
      )}

      {/* =====================================================================
          MODE A: GM TACTICAL COMMAND DOCK (Mestre — Clean & Unselected on Empty Map Click)
         ===================================================================== */}
      {role === 'gm' && (
        <DraggablePanel
          storageKey="gm-bottom-command-dock"
          className="fixed bottom-3 left-1/2 -translate-x-1/2 z-30 max-w-[95vw] pointer-events-auto"
        >
          <OrnateFrame
            accentColor="#d4aa48"
            cornerSize={16}
            className="rpg-glass-panel rounded-lg px-3.5 py-2 flex items-center gap-3 max-w-[95vw] overflow-visible shadow-[0_22px_60px_rgba(0,0,0,0.92)]"
          >
            {/* GM Badge & Selected Map Monster OR NPC OR Character Inspector */}
            {gmInspectedMonster && gmInspectedToken ? (
              <div className="flex items-center gap-3 pr-3 border-r min-w-0 flex-1" style={{ borderColor: 'var(--border-subtle)' }}>
                <TokenPortrait
                  name={gmInspectedToken.name}
                  imageUrl={gmInspectedToken.imageUrl}
                  playerColor={gmInspectedToken.color}
                  frameStyle={gmInspectedToken.frameStyle || 'crimson'}
                  sizePx={46}
                  isDead={gmInspectedToken.hp <= 0}
                  iconHint={gmInspectedMonster.type}
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

                {/* Collapsible "Ações" Tab for Monsters in GM Dock (with search!) */}
                {(gmInspectedMonster.attacks.length > 0 || gmInspectedMonster.abilities.length > 0) && (
                  <div className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() => setShowGmActions((v) => !v)}
                      className={`px-3 py-1.5 rounded-md text-xs font-display font-bold flex items-center gap-1.5 cursor-pointer transition ${
                        showGmActions ? 'rpg-btn-primary' : 'rpg-card hover:border-amber-400/60'
                      }`}
                    >
                      <Swords className="w-3.5 h-3.5 text-red-400" />
                      <span>Ações ({gmInspectedMonster.attacks.length + gmInspectedMonster.abilities.length})</span>
                    </button>
                    {showGmActions && (() => {
                      const q = actionSearch.trim().toLowerCase();
                      const filteredAtks = gmInspectedMonster.attacks.filter(
                        (a) => !q || a.name.toLowerCase().includes(q)
                      );
                      const filteredAbs = gmInspectedMonster.abilities.filter(
                        (ab) => !q || ab.toLowerCase().includes(q)
                      );
                      return (
                        <div className="absolute bottom-14 left-0 w-[min(460px,90vw)] max-h-[50vh] overflow-y-auto rpg-glass-panel rounded-xl p-3 border border-amber-500/45 shadow-2xl space-y-2 z-50 animate-popover">
                          <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-1.5">
                            <span className="font-display font-bold text-xs text-amber-200 truncate">
                              Ações de {gmInspectedToken.name}
                            </span>
                            <button
                              type="button"
                              onClick={() => setShowGmActions(false)}
                              className="rpg-card p-1 rounded cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <input
                            value={actionSearch}
                            onChange={(e) => setActionSearch(e.target.value)}
                            placeholder="Pesquisar ataque ou habilidade..."
                            className="rpg-input w-full py-1 text-xs"
                          />
                          <div className="flex flex-wrap gap-1.5">
                            {filteredAtks.map((matk, idx) => {
                              const isTokenDead = gmInspectedToken.hp <= 0;
                              const isMonsterSkillSelected = Boolean(
                                pendingAttackChoice &&
                                  pendingAttackChoice.attackerTokenId === gmInspectedToken.id &&
                                  pendingAttackChoice.actionTitle === matk.name
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
                                    setShowGmActions(false);
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
                                  className={`rpg-card hover:border-red-400 px-2.5 py-1.5 rounded-md flex items-center gap-1.5 cursor-pointer text-left transition disabled:opacity-35 ${
                                    isMonsterSkillSelected ? 'ring-2 ring-amber-400 bg-amber-500/20' : ''
                                  }`}
                                >
                                  <Swords className="w-3.5 h-3.5 text-red-400 shrink-0" />
                                  <div className="leading-tight">
                                    <div className="text-[11px] font-display font-bold text-amber-100">
                                      {matk.name}
                                    </div>
                                    <div className="text-[9px] font-mono-dice text-amber-300/90">
                                      +{matk.attackBonus} • {matk.damageFormula} ({matk.damageType})
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                          {filteredAbs.length > 0 && (
                            <div className="space-y-1 pt-1 border-t border-white/10">
                              <div className="text-[9px] uppercase tracking-wider font-display text-amber-300/80">
                                Habilidades &amp; Traços
                              </div>
                              {filteredAbs.map((ab, idx) => (
                                <div key={idx} className="text-[11px] rpg-socket rounded px-2 py-1 text-slate-200">
                                  {ab}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            ) : gmInspectedChar && gmInspectedCharStats ? (
              (() => {
                const gmCharWeapons = (gmInspectedChar.inventory || [])
                  .filter((inv) => inv.equipped)
                  .flatMap((inv) => {
                    const def = campaign.compendium.items.find((i) => i.id === inv.itemId);
                    return def && def.type === 'Arma' && def.attackFormula ? [def] : [];
                  });
                const gmCharAbilities = (gmInspectedChar.knownAbilityIds || [])
                  .map((id) => campaign.compendium.abilities.find((a) => a.id === id))
                  .filter((a): a is NonNullable<typeof a> => Boolean(a))
                  .filter((a) => a.actionType !== 'Passiva');
                const isCharDead = gmInspectedChar.hp <= 0;

                return (
                  <div className="flex items-center gap-3 pr-3 border-r min-w-0 flex-1" style={{ borderColor: 'var(--border-subtle)' }}>
                    <button
                      onClick={() => {
                        setActiveCharacterId(gmInspectedChar.id);
                        onOpenSheet();
                      }}
                      className="cursor-pointer hover:scale-105 transition-transform shrink-0"
                      title={`Abrir Ficha de ${gmInspectedChar.name}`}
                    >
                      <TokenPortrait
                        name={gmInspectedChar.name}
                        imageUrl={gmInspectedChar.portraitUrl}
                        playerColor={gmInspectedChar.playerColor || gmInspectedChar.tokenColor}
                        frameStyle={gmInspectedChar.tokenFrameStyle || 'gold'}
                        sizePx={46}
                        isDead={isCharDead}
                        iconHint={gmInspectedChar.classId}
                      />
                    </button>

                    <div className="min-w-[135px] max-w-[185px]">
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="font-display font-bold text-xs truncate text-amber-100">
                          {gmInspectedChar.name}
                        </span>
                        <span className="px-1.5 py-0.2 rounded bg-black/70 border border-amber-400/50 text-[10px] font-display font-bold text-amber-300 shrink-0">
                          CA {gmInspectedCharStats.defense}
                        </span>
                      </div>

                      <div className="w-full h-2 rounded-xs bg-black/80 border border-amber-500/30 overflow-hidden mt-1">
                        <div
                          className="h-full transition-all duration-300"
                          style={{
                            width: `${Math.max(
                              0,
                              Math.min(
                                100,
                                (gmInspectedChar.hp / Math.max(1, gmInspectedCharStats.maxHp)) * 100
                              )
                            )}%`,
                            background: 'linear-gradient(90deg, #991b1b, #ef4444)',
                          }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[10px] mt-1 font-mono-dice">
                        <span className="text-red-200 font-bold">
                          PV {gmInspectedChar.hp}/{gmInspectedCharStats.maxHp}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() =>
                              adjustHeroHp(gmInspectedChar.id, gmInspectedCharStats.maxHp, -5)
                            }
                            className="px-1 rounded bg-red-950/90 border border-red-500/40 text-red-200 hover:bg-red-800 cursor-pointer"
                            title="-5 PV"
                          >
                            -5
                          </button>
                          <button
                            onClick={() =>
                              adjustHeroHp(gmInspectedChar.id, gmInspectedCharStats.maxHp, -1)
                            }
                            className="px-1 rounded bg-red-950/70 border border-red-500/30 text-red-200 hover:bg-red-800 cursor-pointer"
                            title="-1 PV"
                          >
                            -1
                          </button>
                          <button
                            onClick={() =>
                              adjustHeroHp(gmInspectedChar.id, gmInspectedCharStats.maxHp, 1)
                            }
                            className="px-1 rounded bg-emerald-950/70 border border-emerald-500/30 text-emerald-200 hover:bg-emerald-800 cursor-pointer"
                            title="+1 PV"
                          >
                            +1
                          </button>
                          <button
                            onClick={() =>
                              adjustHeroHp(gmInspectedChar.id, gmInspectedCharStats.maxHp, 5)
                            }
                            className="px-1 rounded bg-emerald-950/90 border border-emerald-500/40 text-emerald-200 hover:bg-emerald-800 cursor-pointer"
                            title="+5 PV"
                          >
                            +5
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 mt-1 text-[9px]">
                        <button
                          onClick={() =>
                            setCharacterNextAttackOverride(gmInspectedChar.id, 'advantage')
                          }
                          className={`flex-1 px-1.5 py-0.5 rounded font-display font-bold border cursor-pointer transition ${
                            gmInspectedChar.nextAttackRollOverride === 'advantage'
                              ? 'bg-emerald-900/90 border-emerald-400 text-emerald-100'
                              : 'rpg-card text-emerald-300/85 hover:border-emerald-400/60'
                          }`}
                          title="Adicionar Vantagem ao próximo ataque"
                        >
                          +Vant Próx.
                        </button>
                        <button
                          onClick={() =>
                            setCharacterNextAttackOverride(gmInspectedChar.id, 'disadvantage')
                          }
                          className={`flex-1 px-1.5 py-0.5 rounded font-display font-bold border cursor-pointer transition ${
                            gmInspectedChar.nextAttackRollOverride === 'disadvantage'
                              ? 'bg-red-900/90 border-red-400 text-red-100'
                              : 'rpg-card text-red-300/85 hover:border-red-400/60'
                          }`}
                          title="Adicionar Desvantagem ao próximo ataque"
                        >
                          +Desv Próx.
                        </button>
                      </div>
                    </div>

                    {/* Collapsible "⚔ Ações" Popup for Selected Hero in GM Dock (identical to Player Actions popup!) */}
                    {(() => {
                      const totalHeroActions =
                        (gmInspectedChar.customAttacks?.length || 0) +
                        gmCharWeapons.length +
                        (gmInspectedChar.customAbilities?.length || 0) +
                        gmCharAbilities.length;
                      const q = actionSearch.trim().toLowerCase();
                      return (
                        <div className="relative shrink-0">
                          <button
                            type="button"
                            onClick={() => setShowGmActions((v) => !v)}
                            className={`px-3 py-1.5 rounded-md text-xs font-display font-bold flex items-center gap-1.5 cursor-pointer transition ${
                              showGmActions ? 'rpg-btn-primary' : 'rpg-card hover:border-amber-400/60'
                            }`}
                          >
                            <Swords className="w-3.5 h-3.5 text-amber-300" />
                            <span>Ações ({totalHeroActions})</span>
                          </button>

                          {showGmActions && (
                            <div className="absolute bottom-14 left-0 w-[min(520px,92vw)] max-h-[55vh] overflow-y-auto rpg-glass-panel rounded-xl p-3 border border-amber-500/45 shadow-2xl space-y-2 z-50 animate-popover">
                              <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-1.5">
                                <span className="font-display font-bold text-xs text-amber-200 truncate">
                                  ⚔ Ações de {gmInspectedChar.name}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setShowGmActions(false)}
                                  className="rpg-card p-1 rounded cursor-pointer"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              <input
                                value={actionSearch}
                                onChange={(e) => setActionSearch(e.target.value)}
                                placeholder="Pesquisar ataque, habilidade ou magia..."
                                className="rpg-input w-full py-1 text-xs"
                              />
                              <div className="flex flex-wrap gap-1.5">
                                {(gmInspectedChar.customAttacks || [])
                                  .filter((atk) => !q || atk.name.toLowerCase().includes(q))
                                  .map((atk) => {
                                    const isSel = Boolean(
                                      pendingAttackChoice &&
                                        pendingAttackChoice.attackerCharacterId === gmInspectedChar.id &&
                                        pendingAttackChoice.actionTitle === atk.name
                                    );
                                    return (
                                      <button
                                        key={atk.id}
                                        disabled={isCharDead}
                                        onClick={() => {
                                          setShowGmActions(false);
                                          rollCharacterAction({
                                            characterId: gmInspectedChar.id,
                                            title: atk.name,
                                            attackFormula: atk.attackBonusFormula,
                                            damageFormula: atk.damageFormula,
                                            damageType: atk.damageType,
                                            range: atk.range,
                                            actionCost: 'Padrão',
                                          });
                                        }}
                                        className={`rpg-card rpg-magic-card rarity-${atk.rarity} px-2.5 py-1.5 rounded-md flex items-center gap-1.5 shrink-0 cursor-pointer text-left disabled:opacity-40 ${
                                          isSel ? 'ring-2 ring-amber-400 bg-amber-500/20' : ''
                                        }`}
                                      >
                                        <Swords className="w-3.5 h-3.5 text-red-400 shrink-0" />
                                        <div className="leading-tight">
                                          <div className="text-[11px] font-display font-bold max-w-[115px] truncate">
                                            {atk.name}
                                          </div>
                                          <div className="text-[9px] font-mono-dice opacity-75">
                                            {isSel
                                              ? '✕ Cancelar'
                                              : formatFormulaForDisplay(
                                                  atk.damageFormula,
                                                  gmInspectedCharStats,
                                                  gmInspectedChar
                                                )}
                                          </div>
                                        </div>
                                      </button>
                                    );
                                  })}

                                {gmCharWeapons
                                  .filter((wp) => !q || wp.name.toLowerCase().includes(q))
                                  .map((wp) => {
                                    const isSel = Boolean(
                                      pendingAttackChoice &&
                                        pendingAttackChoice.attackerCharacterId === gmInspectedChar.id &&
                                        pendingAttackChoice.actionTitle === wp.name
                                    );
                                    return (
                                      <button
                                        key={wp.id}
                                        disabled={isCharDead}
                                        onClick={() => {
                                          setShowGmActions(false);
                                          rollCharacterAction({
                                            characterId: gmInspectedChar.id,
                                            title: wp.name,
                                            attackFormula: wp.attackFormula,
                                            damageFormula: wp.damageFormula,
                                            damageType: wp.damageType,
                                            range: wp.range,
                                            actionCost: 'Padrão',
                                          });
                                        }}
                                        className={`rpg-card rpg-magic-card rarity-comum px-2.5 py-1.5 rounded-md flex items-center gap-1.5 shrink-0 cursor-pointer text-left disabled:opacity-40 ${
                                          isSel ? 'ring-2 ring-amber-400 bg-amber-500/20' : ''
                                        }`}
                                      >
                                        <Swords className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                                        <div className="leading-tight">
                                          <div className="text-[11px] font-display font-bold max-w-[115px] truncate">
                                            {wp.name}
                                          </div>
                                          <div className="text-[9px] font-mono-dice opacity-75">
                                            {isSel ? '✕ Cancelar' : wp.range || '1,5m'}
                                          </div>
                                        </div>
                                      </button>
                                    );
                                  })}

                                {(gmInspectedChar.customAbilities || [])
                                  .filter((ab) => !q || ab.name.toLowerCase().includes(q))
                                  .map((ab) => {
                                    const cost = toEconomyCost(ab.actionType);
                                    const isSel = Boolean(
                                      pendingAttackChoice &&
                                        pendingAttackChoice.attackerCharacterId === gmInspectedChar.id &&
                                        pendingAttackChoice.actionTitle === ab.name
                                    );
                                    return (
                                      <button
                                        key={ab.id}
                                        disabled={isCharDead || ab.actionType === 'Passiva'}
                                        onClick={() => {
                                          setShowGmActions(false);
                                          rollCharacterAction({
                                            characterId: gmInspectedChar.id,
                                            title: ab.name,
                                            attackFormula: ab.attackFormula,
                                            damageFormula: ab.damageFormula,
                                            damageType: ab.damageType,
                                            range: ab.range,
                                            actionCost: cost,
                                            costMp: ab.costMp,
                                          });
                                        }}
                                        className={`rpg-card rpg-magic-card rarity-${ab.rarity} px-2.5 py-1.5 rounded-md flex items-center gap-1.5 shrink-0 cursor-pointer text-left disabled:opacity-40 ${
                                          isSel ? 'ring-2 ring-amber-400 bg-amber-500/20' : ''
                                        }`}
                                      >
                                        <Flame className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                        <div className="leading-tight">
                                          <div className="text-[11px] font-display font-bold max-w-[115px] truncate">
                                            {ab.name}
                                          </div>
                                          <div className="text-[9px] font-mono-dice text-amber-300">
                                            {isSel
                                              ? '✕ Cancelar'
                                              : ab.costMp > 0
                                                ? `${ab.costMp} ${campaign.settings.resourceShort}`
                                                : ab.actionType}
                                          </div>
                                        </div>
                                      </button>
                                    );
                                  })}

                                {gmCharAbilities
                                  .filter((ab) => !q || ab.name.toLowerCase().includes(q))
                                  .map((ab) => {
                                    const cost = toEconomyCost(ab.actionType);
                                    const isSel = Boolean(
                                      pendingAttackChoice &&
                                        pendingAttackChoice.attackerCharacterId === gmInspectedChar.id &&
                                        pendingAttackChoice.actionTitle === ab.name
                                    );
                                    return (
                                      <button
                                        key={ab.id}
                                        disabled={isCharDead}
                                        onClick={() => {
                                          setShowGmActions(false);
                                          rollCharacterAction({
                                            characterId: gmInspectedChar.id,
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
                                            aoeShape: ab.aoeShape,
                                            aoeSizeMeters: ab.aoeSizeMeters,
                                            aoeColor: ab.aoeColor,
                                            aoePersistent: ab.aoePersistent,
                                          });
                                        }}
                                        className={`rpg-card rpg-magic-card rarity-raro px-2.5 py-1.5 rounded-md flex items-center gap-1.5 shrink-0 cursor-pointer text-left disabled:opacity-40 ${
                                          isSel ? 'ring-2 ring-amber-400 bg-amber-500/20' : ''
                                        }`}
                                      >
                                        <Sparkles className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                                        <div className="leading-tight">
                                          <div className="text-[11px] font-display font-bold max-w-[115px] truncate">
                                            {ab.name}
                                          </div>
                                          <div className="text-[9px] font-mono-dice text-amber-200/80">
                                            {isSel
                                              ? '✕ Cancelar'
                                              : ab.costMp > 0
                                                ? `${ab.costMp} ${campaign.settings.resourceShort}`
                                                : ab.actionType}
                                          </div>
                                        </div>
                                      </button>
                                    );
                                  })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                );
              })()
            ) : gmInspectedNpc && gmInspectedToken ? (
              <div className="flex items-center gap-3 pr-3 border-r min-w-0 flex-1" style={{ borderColor: 'var(--border-subtle)' }}>
                <TokenPortrait
                  name={gmInspectedToken.name}
                  imageUrl={gmInspectedToken.imageUrl}
                  playerColor={gmInspectedToken.color}
                  frameStyle={gmInspectedToken.frameStyle || 'gold'}
                  sizePx={44}
                  isDead={gmInspectedToken.hp <= 0}
                />
                <div className="min-w-[130px] max-w-[180px] shrink-0">
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="font-display font-bold text-xs truncate text-amber-100">
                      {gmInspectedToken.name}
                    </span>
                    <span className="px-1.5 py-0.2 rounded bg-black/70 border border-amber-400/50 text-[10px] font-display font-bold text-amber-300 shrink-0">
                      CA {gmInspectedToken.defense}
                    </span>
                  </div>
                  <div className="text-[10px] truncate" style={{ color: 'var(--text-secondary)' }}>
                    {gmInspectedNpc.role} • {gmInspectedNpc.disposition}
                  </div>
                  {gmInspectedNpc.combatEnabled && (
                    <div className="flex items-center justify-between text-[10px] mt-1 font-mono-dice">
                      <span className="text-amber-200 font-bold">
                        PV {gmInspectedToken.hp}/{gmInspectedToken.maxHp}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => applyDamage(gmInspectedToken.id, 5, false)}
                          className="px-1 rounded bg-red-950/90 border border-red-500/40 text-red-200 hover:bg-red-800 cursor-pointer"
                        >
                          -5
                        </button>
                        <button
                          onClick={() => applyDamage(gmInspectedToken.id, 1, true)}
                          className="px-1 rounded bg-emerald-950/80 border border-emerald-500/40 text-emerald-200 hover:bg-emerald-800 cursor-pointer"
                        >
                          +1
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                {/* Collapsible "Ações" Tab for NPCs in GM Dock */}
                {gmInspectedNpc.combatEnabled &&
                  ((gmInspectedNpc.attacks?.length || 0) > 0 ||
                    (gmInspectedNpc.abilities?.length || 0) > 0) && (
                    <div className="relative shrink-0">
                      <button
                        type="button"
                        onClick={() => setShowGmActions((v) => !v)}
                        className={`px-3 py-1.5 rounded-md text-xs font-display font-bold flex items-center gap-1.5 cursor-pointer transition ${
                          showGmActions ? 'rpg-btn-primary' : 'rpg-card hover:border-amber-400/60'
                        }`}
                      >
                        <Swords className="w-3.5 h-3.5 text-amber-300" />
                        <span>
                          Ações ({(gmInspectedNpc.attacks?.length || 0) + (gmInspectedNpc.abilities?.length || 0)})
                        </span>
                      </button>
                      {showGmActions && (() => {
                        const q = actionSearch.trim().toLowerCase();
                        const filteredAtks = (gmInspectedNpc.attacks || []).filter(
                          (a) => !q || a.name.toLowerCase().includes(q)
                        );
                        const filteredAbs = (gmInspectedNpc.abilities || []).filter(
                          (ab) => !q || ab.toLowerCase().includes(q)
                        );
                        return (
                          <div className="absolute bottom-14 left-0 w-[min(440px,90vw)] max-h-[50vh] overflow-y-auto rpg-glass-panel rounded-xl p-3 border border-amber-500/45 shadow-2xl space-y-2 z-50 animate-popover">
                            <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-1.5">
                              <span className="font-display font-bold text-xs text-amber-200 truncate">
                                Ações de {gmInspectedToken.name}
                              </span>
                              <button
                                type="button"
                                onClick={() => setShowGmActions(false)}
                                className="rpg-card p-1 rounded cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <input
                              value={actionSearch}
                              onChange={(e) => setActionSearch(e.target.value)}
                              placeholder="Pesquisar ataque ou habilidade..."
                              className="rpg-input w-full py-1 text-xs"
                            />
                            <div className="flex flex-wrap gap-1.5">
                              {filteredAtks.map((natk, idx) => (
                                <button
                                  key={idx}
                                  disabled={gmInspectedToken.hp <= 0}
                                  onClick={() => {
                                    setShowGmActions(false);
                                    const isCondOnly = Boolean(!natk.damageType && natk.applyConditionId);
                                    const isSelfRng = Boolean(
                                      natk.range && natk.range.trim().toLowerCase().includes('pessoal')
                                    );
                                    if (isCondOnly && isSelfRng && natk.applyConditionId) {
                                      const condId = natk.applyConditionId;
                                      const condDef = campaign.compendium.conditions.find((c) => c.id === condId);
                                      updateCampaign((prev) => ({
                                        ...prev,
                                        maps: prev.maps.map((m) =>
                                          m.id !== prev.activeMapId
                                            ? m
                                            : {
                                                ...m,
                                                tokens: m.tokens.map((t) =>
                                                  t.id === gmInspectedToken.id &&
                                                  !(t.activeConditionIds || []).includes(condId)
                                                    ? {
                                                        ...t,
                                                        activeConditionIds: [
                                                          ...(t.activeConditionIds || []),
                                                          condId,
                                                        ],
                                                      }
                                                    : t
                                                ),
                                              }
                                        ),
                                      }));
                                      pushCombatLog({
                                        category: 'condition',
                                        actorName: gmInspectedToken.name,
                                        actorKind: 'npc',
                                        actorColor: gmInspectedToken.color,
                                        summary: `ativou ${natk.name} (${condDef?.icon || ''} ${condDef?.name || 'Condição'}) em si mesmo`,
                                      });
                                      return;
                                    }
                                    setPendingAttackChoice({
                                      attackerTokenId: gmInspectedToken.id,
                                      attackerName: gmInspectedToken.name,
                                      attackerColor: gmInspectedToken.color,
                                      attackerImageUrl: gmInspectedToken.imageUrl,
                                      attackerFrame: gmInspectedToken.frameStyle || 'gold',
                                      diceSkin: 'gold',
                                      actionTitle: natk.name,
                                      attackFormula: isCondOnly ? undefined : `1d20 + ${natk.attackBonus}`,
                                      damageFormula: isCondOnly ? undefined : natk.damageFormula,
                                      damageType: natk.damageType,
                                      range: natk.range,
                                      actionCost: 'Padrão',
                                      applyConditionId: natk.applyConditionId,
                                      conditionDurationRounds: natk.conditionDurationRounds,
                                    });
                                  }}
                                  className="rpg-card hover:border-amber-400 px-2.5 py-1.5 rounded-md flex items-center gap-1.5 cursor-pointer text-left disabled:opacity-35"
                                >
                                  <Swords className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                                  <div className="leading-tight">
                                    <div className="text-[11px] font-display font-bold text-amber-100">
                                      {natk.name}
                                    </div>
                                    <div className="text-[9px] font-mono-dice text-amber-300/90">
                                      +{natk.attackBonus} • {natk.damageFormula}
                                    </div>
                                  </div>
                                </button>
                              ))}
                            </div>
                            {filteredAbs.length > 0 && (
                              <div className="space-y-1 pt-1 border-t border-white/10">
                                {filteredAbs.map((ab, idx) => (
                                  <div key={idx} className="text-[11px] rpg-socket rounded px-2 py-1 text-slate-200">
                                    {ab}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}
              </div>
            ) : null}

            {/* Right: Open Sheets + Dice Tray + Drag Grip (1d20 lives in Dados / Chat) */}
            <div className="flex items-center gap-1.5 shrink-0">
              <DragGripBadge />

              {(gmInspectedMonster || gmInspectedNpc || gmInspectedChar || campaign.characters.length > 0) && (
                <button
                  onClick={() => {
                    if (gmInspectedMonster) {
                      openEntitySheet({ kind: 'monster', id: gmInspectedMonster.id });
                      return;
                    }
                    if (gmInspectedNpc) {
                      openEntitySheet({ kind: 'npc', id: gmInspectedNpc.id });
                      return;
                    }
                    if (gmInspectedChar) {
                      setActiveCharacterId(gmInspectedChar.id);
                    }
                    onOpenSheet();
                  }}
                  className="rpg-card px-2.5 py-1.5 rounded-md text-xs font-display font-semibold flex items-center gap-1 cursor-pointer hover:border-amber-400/60"
                  title={
                    gmInspectedMonster
                      ? `Abrir Ficha Completa de ${gmInspectedMonster.name}`
                      : gmInspectedNpc
                        ? `Abrir Ficha Completa de ${gmInspectedNpc.name}`
                        : gmInspectedChar
                          ? `Abrir Ficha de ${gmInspectedChar.name}`
                          : 'Abrir Fichas dos Jogadores'
                  }
                >
                  <BookOpen className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />
                  <span className="hidden md:inline">
                    {gmInspectedMonster || gmInspectedNpc || gmInspectedChar ? 'Ficha' : 'Fichas'}
                  </span>
                </button>
              )}

              <button
                onClick={onToggleDiceDrawer}
                className={`relative px-3 py-1.5 rounded-md text-xs font-display font-bold flex items-center gap-1 cursor-pointer transition ${
                  diceDrawerOpen ? 'rpg-btn-primary' : 'rpg-card hover:border-amber-400/60'
                }`}
                title="Abrir/Fechar Bandeja de Dados, Histórico & Chat RP"
              >
                <Dices className="w-4 h-4" />
                <span className="hidden md:inline">Dados / Chat</span>
                {unreadChatCount > 0 && !diceDrawerOpen && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 border border-amber-200 text-white text-[9px] font-bold flex items-center justify-center">
                    {unreadChatCount}
                  </span>
                )}
              </button>
            </div>
          </OrnateFrame>
        </DraggablePanel>
      )}

      {/* =====================================================================
          MODE B: PLAYER RELIQUARY ACTION HUD (Jogador com Personagem Próprio)
         ===================================================================== */}
      {role === 'player' && hero && stats && (
        <DraggablePanel
          storageKey="player-bottom-hud"
          className="fixed bottom-3 left-1/2 -translate-x-1/2 z-30 max-w-[95vw] pointer-events-auto flex flex-col items-center gap-1.5"
        >
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
                  <Skull className="w-5 h-5 text-red-400 shrink-0" />
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
                <button
                  onClick={() => performCombatManeuver('shove')}
                  disabled={
                    hero.hp <= 0 ||
                    heroCombatant.bonusActionAvailable === false ||
                    activeTurnCombatant?.id !== heroCombatant.id
                  }
                  className="rpg-card px-2 py-0.5 rounded hover:border-amber-400 cursor-pointer disabled:opacity-35"
                  title="Ação Bônus: Teste de Atletismo para empurrar inimigo adjacente 1,5m para trás"
                >
                  Empurrar
                </button>
                <button
                  onClick={() => performCombatManeuver('hide')}
                  disabled={
                    hero.hp <= 0 ||
                    heroCombatant.bonusActionAvailable === false ||
                    activeTurnCombatant?.id !== heroCombatant.id
                  }
                  className="rpg-card px-2 py-0.5 rounded hover:border-amber-400 cursor-pointer disabled:opacity-35"
                  title="Ação Bônus: Rola Furtividade e aplica Oculto/Invisível"
                >
                  Esconder
                </button>
                <button
                  onClick={() => performCombatManeuver('help')}
                  disabled={
                    hero.hp <= 0 ||
                    heroCombatant.actionAvailable === false ||
                    activeTurnCombatant?.id !== heroCombatant.id
                  }
                  className="rpg-card px-2 py-0.5 rounded hover:border-amber-400 cursor-pointer disabled:opacity-35"
                  title="Ação Padrão: Concede Vantagem no próximo ataque de um aliado adjacente"
                >
                  Ajudar
                </button>
                <button
                  onClick={() => performCombatManeuver('jump')}
                  disabled={
                    hero.hp <= 0 ||
                    heroCombatant.bonusActionAvailable === false ||
                    activeTurnCombatant?.id !== heroCombatant.id
                  }
                  className="rpg-card px-2 py-0.5 rounded hover:border-amber-400 cursor-pointer disabled:opacity-35"
                  title="Ação Bônus: Salta +3m sobre obstáculos ou superfícies"
                >
                  Saltar
                </button>
              </div>
            </div>
          )}

          {/* Classic D&D 5e Heroic Inspiration Medallion (1 star) */}
          {hero.hasInspiration && (
            <button
              type="button"
              onClick={() => spendHeroInspiration(hero.id)}
              className="rpg-glass-panel rounded-full px-3.5 py-1 text-[11px] font-display font-bold flex items-center gap-1.5 border border-amber-400 text-amber-200 bg-amber-950/85 shadow-[0_0_18px_rgba(251,191,36,0.45)] hover:brightness-115 cursor-pointer transition"
              title="Clique para gastar sua Inspiração Heroica e ganhar Vantagem na próxima rolagem!"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>★ Inspiração Heroica Disponível — Clique para usar (+Vantagem)</span>
            </button>
          )}

          {/* GM Next-Attack Advantage/Disadvantage Banner for Player */}
          {hero.nextAttackRollOverride && (
            <div
              className={`rpg-glass-panel rounded-md px-3.5 py-1 text-[11px] font-display font-bold flex items-center gap-1.5 border shadow-lg ${
                hero.nextAttackRollOverride === 'advantage'
                  ? 'border-emerald-400/75 text-emerald-200 bg-emerald-950/80'
                  : 'border-red-400/75 text-red-200 bg-red-950/80'
              }`}
            >
              <Crown className="w-3.5 h-3.5 text-amber-300 shrink-0" />
              <span>
                {hero.nextAttackRollOverride === 'advantage'
                  ? 'Mestre concedeu: VANTAGEM no seu próximo ataque!'
                  : 'Mestre impôs: DESVANTAGEM no seu próximo ataque!'}
              </span>
            </div>
          )}

          <OrnateFrame
            accentColor={heroColor}
            cornerSize={16}
            className="rpg-glass-panel rounded-lg px-4 py-2 flex items-center gap-3 shadow-[0_22px_60px_rgba(0,0,0,0.92)]"
          >
            {/* Left: Sculpted Ruby HP Globe + Hero Medallion + Sapphire MP Globe */}
            <div className="flex items-center gap-2.5 shrink-0">
              {/* HP Liquid Globe in Brass Bezel (Crimson Skull Crest at 0 PV — never flat black ball) */}
              <div
                className={`relative w-12 h-12 rounded-full border-2 overflow-hidden flex flex-col items-center justify-center ${
                  hero.hp <= 0
                    ? 'border-red-500/80 bg-[#2a070b] animate-death-pulse shadow-[inset_0_2px_10px_rgba(185,28,28,0.65),0_0_18px_rgba(220,38,38,0.5)]'
                    : 'border-amber-500/70 bg-[#1a090d] shadow-[inset_0_4px_10px_rgba(0,0,0,0.95),0_0_16px_rgba(220,38,38,0.35)]'
                }`}
                title={`Pontos de Vida: ${hero.hp} / ${stats.maxHp}`}
              >
                {hero.hp <= 0 ? (
                  <>
                    <Skull className="w-4 h-4 text-red-300" />
                    <span className="font-display font-black text-[9px] text-red-200 leading-none mt-0.5">
                      0 PV
                    </span>
                  </>
                ) : (
                  <>
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
                  </>
                )}
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

            {/* Center: Collapsible "Ações" Tab Button + Popup Tray above dock */}
            <div
              className="relative flex items-center gap-1.5 pl-2 border-l shrink-0"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              {hero.hp <= 0 && (
                <button
                  onClick={onOpenSheet}
                  className="px-2.5 py-1.5 rounded-md bg-red-950/80 border border-red-500/70 text-red-200 text-[10px] font-display font-bold flex items-center gap-1.5 shrink-0 cursor-pointer hover:bg-red-900/70"
                  title="Seu personagem está caído com 0 PV! Abra a Ficha para Testes contra a Morte"
                >
                  <Skull className="w-3.5 h-3.5 text-red-400" />
                  <span>Caído (0 PV)</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setShowRestMenu(false);
                  setShowConcMenu(false);
                  setShowPlayerActions((v) => !v);
                }}
                className={`px-3 py-1.5 rounded-md text-xs font-display font-bold flex items-center gap-1.5 cursor-pointer transition ${
                  showPlayerActions || pendingAttackChoice
                    ? 'rpg-btn-primary shadow-md'
                    : 'rpg-card hover:border-amber-400/60'
                }`}
                title="Abrir/Fechar aba de Ataques, Armas, Habilidades e Consumíveis"
              >
                <Swords className="w-3.5 h-3.5" />
                <span>Ações</span>
                <span className="text-[10px] font-mono-dice px-1.5 py-0.2 rounded bg-black/35">
                  {quickAttacks.length +
                    quickWeapons.length +
                    quickAbilities.length +
                    compendiumAbilities.length +
                    quickConsumables.length}
                </span>
              </button>

              {showPlayerActions && (
                <div className="absolute bottom-14 left-0 w-[min(560px,90vw)] max-h-[52vh] overflow-y-auto rpg-glass-panel rounded-xl p-3 border border-amber-500/45 shadow-2xl space-y-2 z-50 animate-popover">
                  <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
                    <span className="font-display font-bold text-xs uppercase tracking-wider text-amber-200 flex items-center gap-1.5">
                      <Swords className="w-3.5 h-3.5 text-amber-400" />
                      Ações de {hero.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowPlayerActions(false)}
                      className="rpg-card p-1 rounded cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <input
                    value={actionSearch}
                    onChange={(e) => setActionSearch(e.target.value)}
                    placeholder="Pesquisar ataque, habilidade ou consumível..."
                    className="rpg-input w-full py-1 text-xs"
                  />
                  <div className="flex flex-wrap gap-1.5">

              {quickAttacks
                .filter((atk) => !actionSearch.trim() || atk.name.toLowerCase().includes(actionSearch.trim().toLowerCase()))
                .map((atk, idx) => {
                const hotkeyNum = idx + 1;
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
                    className={`relative rpg-card rpg-magic-card rarity-${atk.rarity} px-2.5 py-1.5 rounded-md flex items-center gap-1.5 shrink-0 cursor-pointer text-left disabled:opacity-40 disabled:cursor-not-allowed ${
                      isSelected ? 'ring-2 ring-amber-400 bg-amber-500/20' : ''
                    }`}
                    title={
                      isDead
                        ? 'Você está caído (0 PV) e não pode atacar'
                        : isSelected
                          ? `Clique novamente para cancelar ${atk.name}`
                          : `[${hotkeyNum <= 9 ? hotkeyNum : '—'}] Atacar: ${formatFormulaForDisplay(atk.attackBonusFormula, stats, hero)} | Dano: ${formatFormulaForDisplay(atk.damageFormula, stats, hero)} | Alcance: ${atk.range}`
                    }
                  >
                    {hotkeyNum <= 9 && (
                      <span className="absolute -top-1.5 -left-1 px-1 rounded bg-[#0c0e15] border border-amber-500/50 text-[8px] font-mono-dice font-bold text-amber-300 leading-tight">
                        {hotkeyNum}
                      </span>
                    )}
                    {atk.imageUrl ? (
                      <img
                        src={resolveAssetUrl(atk.imageUrl)}
                        alt={atk.name}
                        draggable={false}
                        className="w-6 h-6 rounded object-cover border border-amber-400/50 shrink-0 pointer-events-none"
                      />
                    ) : (
                      <Swords className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    )}
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

              {quickWeapons
                .filter((wp) => !actionSearch.trim() || wp.name.toLowerCase().includes(actionSearch.trim().toLowerCase()))
                .map((wp, idx) => {
                const hotkeyNum = quickAttacks.length + idx + 1;
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
                    className={`relative rpg-card rpg-magic-card rarity-comum px-2.5 py-1.5 rounded-md flex items-center gap-1.5 shrink-0 cursor-pointer text-left disabled:opacity-40 disabled:cursor-not-allowed ${
                      isSelected ? 'ring-2 ring-amber-400 bg-amber-500/20' : ''
                    }`}
                    title={
                      isDead
                        ? 'Você está caído (0 PV) e não pode atacar'
                        : isSelected
                          ? `Clique novamente para cancelar ${wp.name}`
                          : `${hotkeyNum <= 9 ? `[${hotkeyNum}] ` : ''}${wp.name} | Alcance: ${wp.range || 'Corpo a Corpo (1,5m)'}`
                    }
                  >
                    {hotkeyNum <= 9 && (
                      <span className="absolute -top-1.5 -left-1 px-1 rounded bg-[#0c0e15] border border-amber-500/50 text-[8px] font-mono-dice font-bold text-amber-300 leading-tight">
                        {hotkeyNum}
                      </span>
                    )}
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

              {quickAbilities
                .filter((ab) => !actionSearch.trim() || ab.name.toLowerCase().includes(actionSearch.trim().toLowerCase()))
                .map((ab, idx) => {
                const hotkeyNum = quickAttacks.length + quickWeapons.length + idx + 1;
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
                    className={`relative rpg-card rpg-magic-card rarity-${ab.rarity} px-2.5 py-1.5 rounded-md flex items-center gap-1.5 shrink-0 cursor-pointer text-left disabled:opacity-40 disabled:cursor-not-allowed ${
                      isSelected ? 'ring-2 ring-amber-400 bg-amber-500/20' : ''
                    }`}
                    title={
                      isDead
                        ? 'Você está caído (0 PV) e não pode usar habilidades'
                        : isSelected
                          ? `Clique novamente para cancelar ${ab.name}`
                          : `${hotkeyNum <= 9 ? `[${hotkeyNum}] ` : ''}${ab.actionType} • ${ab.description}`
                    }
                  >
                    {hotkeyNum <= 9 && (
                      <span className="absolute -top-1.5 -left-1 px-1 rounded bg-[#0c0e15] border border-amber-500/50 text-[8px] font-mono-dice font-bold text-amber-300 leading-tight">
                        {hotkeyNum}
                      </span>
                    )}
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

              {compendiumAbilities
                .filter((ab) => !actionSearch.trim() || ab.name.toLowerCase().includes(actionSearch.trim().toLowerCase()))
                .map((ab, idx) => {
                const hotkeyNum =
                  quickAttacks.length + quickWeapons.length + quickAbilities.length + idx + 1;
                const cost = toEconomyCost(ab.actionType);
                const spent = isActionSlotSpent(cost);
                const isDead = hero.hp <= 0;
                const maxUses = ab.maxUsesPerRest && ab.maxUsesPerRest > 0 ? ab.maxUsesPerRest : null;
                const remUses =
                  maxUses !== null
                    ? typeof hero.abilityUsesRemaining?.[ab.id] === 'number'
                      ? Math.max(0, hero.abilityUsesRemaining[ab.id])
                      : maxUses
                    : null;
                const outOfUses = remUses !== null && remUses <= 0;
                const isSelected = Boolean(
                  pendingAttackChoice &&
                    pendingAttackChoice.attackerCharacterId === hero.id &&
                    pendingAttackChoice.actionTitle === ab.name,
                );
                return (
                  <button
                    key={ab.id}
                    disabled={(spent && !isSelected) || isDead || (outOfUses && !isSelected)}
                    onClick={() => {
                      setShowPlayerActions(false);
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
                        costResourceId: ab.costResourceId,
                        applyConditionId: ab.applyConditionId,
                        conditionDurationRounds: ab.conditionDurationRounds,
                        aoeShape: ab.aoeShape,
                        aoeSizeMeters: ab.aoeSizeMeters,
                        aoeColor: ab.aoeColor,
                        aoePersistent: ab.aoePersistent,
                      });
                    }}
                    className={`relative rpg-card rpg-magic-card rarity-raro px-2.5 py-1.5 rounded-md flex items-center gap-1.5 shrink-0 cursor-pointer text-left disabled:opacity-40 disabled:cursor-not-allowed ${
                      isSelected ? 'ring-2 ring-amber-400 bg-amber-500/20' : ''
                    }`}
                    title={
                      isDead
                        ? 'Você está caído (0 PV) e não pode usar habilidades'
                        : outOfUses
                          ? `Sem usos restantes (0/${maxUses}) — recarregue no Descanso ${ab.restType === 'curto' ? 'Curto' : 'Longo'}`
                          : isSelected
                            ? `Clique novamente para cancelar ${ab.name}`
                            : `${hotkeyNum <= 9 ? `[${hotkeyNum}] ` : ''}${ab.actionType} • ${ab.range} • ${ab.description}`
                    }
                  >
                    {hotkeyNum <= 9 && (
                      <span className="absolute -top-1.5 -left-1 px-1 rounded bg-[#0c0e15] border border-amber-500/50 text-[8px] font-mono-dice font-bold text-amber-300 leading-tight">
                        {hotkeyNum}
                      </span>
                    )}
                    <Sparkles className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                    <div className="leading-tight">
                      <div className="text-[11px] font-display font-bold max-w-[100px] truncate">
                        {ab.name}
                      </div>
                      <div className="text-[9px] font-mono-dice text-amber-200/80 flex items-center gap-1">
                        <span>
                          {isSelected
                            ? '✕ Cancelar'
                            : ab.costMp > 0
                              ? `${ab.costMp} ${
                                  ab.costResourceId === 'hp'
                                    ? 'PV'
                                    : ab.costResourceId && ab.costResourceId !== 'mp'
                                      ? campaign.compendium.customResources?.find(
                                          (r) => r.id === ab.costResourceId
                                        )?.shortName || campaign.settings.resourceShort
                                      : campaign.settings.resourceShort
                                }`
                              : ab.actionType}
                        </span>
                        {maxUses !== null && remUses !== null && (
                          <span
                            className={`px-1 rounded border text-[8px] font-bold ${
                              remUses > 0
                                ? 'border-amber-400/50 bg-amber-500/15 text-amber-200'
                                : 'border-red-500/50 bg-red-950/60 text-red-300'
                            }`}
                          >
                            {maxUses <= 4
                              ? '●'.repeat(remUses) + '○'.repeat(Math.max(0, maxUses - remUses))
                              : `${remUses}/${maxUses}`}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}

              {quickConsumables
                .filter(({ def }) => !actionSearch.trim() || def.name.toLowerCase().includes(actionSearch.trim().toLowerCase()))
                .map(({ entry, def }) => (
                <button
                  key={entry.id}
                  disabled={isActionSlotSpent('Bônus') || hero.hp <= 0}
                  onClick={() => handleUseConsumable(entry.id, def.id)}
                  className="rpg-card rpg-magic-card rarity-comum px-2.5 py-1.5 rounded-md flex items-center gap-1.5 shrink-0 cursor-pointer text-left border-emerald-400/40 disabled:opacity-40 disabled:cursor-not-allowed"
                  title={
                    hero.hp <= 0
                      ? 'Você está caído (0 PV) e não pode usar consumíveis'
                      : `Ação Bônus • ${def.description}`
                  }
                >
                  <FlaskConical className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <div className="leading-tight">
                    <div className="text-[11px] font-display font-bold max-w-[95px] truncate">
                      {def.name}
                    </div>
                    <div className="text-[9px] font-mono-dice text-emerald-300">
                      Bônus • x{entry.quantity}
                    </div>
                  </div>
                </button>
              ))}

              {[
                ...passiveCustomAbilities.map((ab) => ({
                  id: ab.id,
                  name: ab.name,
                  description: ab.description,
                })),
                ...passiveCompendiumAbilities.map((ab) => ({
                  id: ab.id,
                  name: ab.name,
                  description: ab.description,
                })),
              ]
                .filter(
                  (ab) =>
                    !actionSearch.trim() ||
                    ab.name.toLowerCase().includes(actionSearch.trim().toLowerCase()),
                )
                .map((ab) => (
                  <div
                    key={`passive-${ab.id}`}
                    className="rpg-card px-2.5 py-1.5 rounded-md flex items-center gap-1.5 shrink-0 text-left border-violet-400/35 bg-violet-500/10"
                    title={`Passiva • ${ab.description}`}
                  >
                    <Shield className="w-3.5 h-3.5 text-violet-300 shrink-0" />
                    <div className="leading-tight">
                      <div className="text-[11px] font-display font-bold max-w-[100px] truncate text-violet-100">
                        {ab.name}
                      </div>
                      <div className="text-[9px] font-mono-dice text-violet-300">
                        Passiva
                      </div>
                    </div>
                  </div>
                ))}

              {quickAttacks.length === 0 &&
                quickWeapons.length === 0 &&
                quickAbilities.length === 0 &&
                compendiumAbilities.length === 0 &&
                passiveCustomAbilities.length === 0 &&
                passiveCompendiumAbilities.length === 0 &&
                quickConsumables.length === 0 && (
                  <span className="text-[11px] font-lore italic px-2 opacity-65 whitespace-nowrap">
                    O Mestre forjará seus ataques aqui
                  </span>
                )}
                  </div>
                </div>
              )}
            </div>

            {/* Right: Request Rest + Concentration Selector + Open Sheet + Dice Tray (Salvar & 1d20 removed) */}
            <div
              className="flex items-center gap-1.5 pl-2 border-l shrink-0"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <div className="relative">
                <button
                  disabled={hero.hp <= 0}
                  onClick={() => {
                    setShowConcMenu(false);
                    setShowRestMenu((v) => !v);
                  }}
                  className="rpg-card px-2.5 py-1.5 rounded-md text-xs font-display font-semibold flex items-center gap-1 cursor-pointer hover:border-amber-400/60 disabled:opacity-40 disabled:cursor-not-allowed"
                  title={
                    hero.hp <= 0
                      ? 'Personagens caídos ou mortos (0 PV) não podem pedir descanso'
                      : 'Pedir Descanso ou Cura ao Mestre'
                  }
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

              {/* Structured Concentration Selector (pick from character's spells/abilities — no free typing!) */}
              <div className="relative">
                <button
                  onClick={() => {
                    if (hero.concentratingSpell) {
                      setCharacterConcentration(hero.id, null);
                      setShowConcMenu(false);
                    } else {
                      setShowRestMenu(false);
                      setShowConcMenu((v) => !v);
                    }
                  }}
                  className={`px-2 py-1.5 rounded-md text-xs font-display font-semibold flex items-center gap-1 cursor-pointer transition border ${
                    hero.concentratingSpell
                      ? 'bg-purple-950/90 border-purple-400/80 text-purple-200'
                      : 'rpg-card hover:border-purple-400/60'
                  }`}
                  title={
                    hero.concentratingSpell
                      ? `Concentrando em: ${hero.concentratingSpell} (Clique para encerrar)`
                      : 'Selecionar magia/habilidade para manter em Concentração'
                  }
                >
                  <Sparkles className="w-3.5 h-3.5 text-purple-300 shrink-0" />
                  <span className="hidden xl:inline max-w-[95px] truncate">
                    {hero.concentratingSpell ? `Conc: ${hero.concentratingSpell}` : 'Concentrar'}
                  </span>
                </button>

                {showConcMenu && !hero.concentratingSpell && (() => {
                  const concOptions = Array.from(
                    new Set([
                      ...compendiumAbilities.map((a) => a.name),
                      ...quickAbilities.map((a) => a.name),
                    ])
                  );
                  return (
                    <div className="absolute bottom-12 right-0 w-56 max-h-60 overflow-y-auto rpg-glass-panel rounded-lg p-2 space-y-1 shadow-2xl text-xs">
                      <div className="text-[10px] font-display uppercase tracking-wider opacity-70 px-1.5 pb-1">
                        Escolher Magia / Habilidade
                      </div>
                      {concOptions.length === 0 ? (
                        <div className="text-[11px] opacity-70 px-1.5 py-2">
                          Nenhuma magia/habilidade cadastrada na ficha.
                        </div>
                      ) : (
                        concOptions.map((spellName) => (
                          <button
                            key={spellName}
                            type="button"
                            onClick={() => {
                              setCharacterConcentration(hero.id, spellName);
                              setShowConcMenu(false);
                            }}
                            className="w-full text-left px-2.5 py-1.5 rounded-md rpg-card hover:border-purple-400/70 truncate cursor-pointer"
                          >
                            {spellName}
                          </button>
                        ))
                      )}
                    </div>
                  );
                })()}
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
                className={`relative px-3 py-1.5 rounded-md text-xs font-display font-bold flex items-center gap-1 cursor-pointer transition ${
                  diceDrawerOpen ? 'rpg-btn-primary' : 'rpg-card hover:border-amber-400/60'
                }`}
                title="Abrir/Fechar Bandeja de Dados, Histórico & Chat RP"
              >
                <Dices className="w-4 h-4" />
                <span className="hidden md:inline">Dados / Chat</span>
                {unreadChatCount > 0 && !diceDrawerOpen && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 border border-amber-200 text-white text-[9px] font-bold flex items-center justify-center">
                    {unreadChatCount}
                  </span>
                )}
              </button>
              <DragGripBadge />
            </div>
          </OrnateFrame>
        </DraggablePanel>
      )}

      {/* =========================================================
          PLAYER DRAGGABLE COLLAPSIBLE LEFT MINI-SHEET ("Minha Ficha")
         ========================================================= */}
      {role === 'player' && hero && stats && (
        <DraggablePanel
          storageKey="player-mini-sheet"
          className="fixed top-20 left-3 z-30 pointer-events-auto flex flex-col items-start"
        >
          {playerSheetCollapsed ? (
            <div className="rpg-glass-panel rounded-lg px-2 py-1.5 border border-amber-500/45 shadow-xl flex items-center gap-1.5">
              <DragGripBadge />
              <button
                type="button"
                onClick={() => setPlayerSheetCollapsed(false)}
                className="flex items-center gap-2 cursor-pointer"
                title="Expandir resumo rápido da sua ficha"
              >
                <TokenPortrait
                  name={hero.name}
                  imageUrl={hero.portraitUrl}
                  playerColor={hero.playerColor || '#38bdf8'}
                  frameStyle={hero.tokenFrameStyle || 'gold'}
                  sizePx={26}
                  isDead={hero.hp <= 0}
                />
                <div className="text-left leading-tight">
                  <div className="font-display font-bold text-[11px] text-amber-100 max-w-[110px] truncate">
                    {hero.name}
                  </div>
                  <div className="text-[9px] font-mono-dice text-amber-300/85">
                    Nv {hero.level} • PV {hero.hp}/{stats.maxHp}
                    {(hero.unspentAttributePoints || 0) > 0 && (
                      <span className="ml-1 text-emerald-300 font-bold">
                        +{hero.unspentAttributePoints}pt
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-amber-400" />
              </button>
            </div>
          ) : (
            <div className="w-64 max-h-[74vh] overflow-y-auto rpg-glass-panel rounded-xl p-3 border border-amber-500/45 shadow-2xl space-y-2.5 text-xs animate-ui-enter">
              <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <DragGripBadge />
                  <TokenPortrait
                    name={hero.name}
                    imageUrl={hero.portraitUrl}
                    playerColor={hero.playerColor || '#38bdf8'}
                    frameStyle={hero.tokenFrameStyle || 'gold'}
                    sizePx={34}
                    isDead={hero.hp <= 0}
                  />
                  <div className="min-w-0">
                    <div className="font-display font-bold text-xs text-amber-100 truncate">
                      {hero.name}
                    </div>
                    <div className="text-[10px] text-amber-300/80 truncate">
                      Nv {hero.level} •{' '}
                      {campaign.compendium.classes.find((c) => c.id === hero.classId)?.name || 'Herói'}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPlayerSheetCollapsed(true)}
                  className="rpg-card p-1 rounded cursor-pointer shrink-0"
                  title="Recolher ficha rápida"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
              </div>

              {(hero.unspentAttributePoints || 0) > 0 && (
                <button
                  type="button"
                  onClick={onOpenSheet}
                  className="w-full py-1.5 px-2 rounded bg-amber-500/20 border border-amber-400/70 text-amber-200 text-[10px] font-display font-bold cursor-pointer hover:bg-amber-500/30 text-center"
                >
                  ✨ +{hero.unspentAttributePoints} Ponto(s) de Atributo — Distribuir na Ficha
                </button>
              )}

              {/* Compact Vitals */}
              <div className="grid grid-cols-3 gap-1.5 text-center font-mono-dice text-[10px]">
                <div className="rpg-socket rounded p-1.5">
                  <div className="opacity-70 text-[9px]">PV</div>
                  <div className="font-bold text-red-300">
                    {hero.hp}/{stats.maxHp}
                  </div>
                </div>
                <div className="rpg-socket rounded p-1.5">
                  <div className="opacity-70 text-[9px]">{campaign.settings.resourceShort}</div>
                  <div className="font-bold text-sky-300">
                    {hero.mp}/{stats.maxMp}
                  </div>
                </div>
                <div className="rpg-socket rounded p-1.5">
                  <div className="opacity-70 text-[9px]">CA</div>
                  <div className="font-bold text-amber-300">{stats.defense}</div>
                </div>
              </div>

              {/* Custom Campaign Resource Bars in Player Mini-Sheet */}
              {(campaign.compendium.customResources || []).length > 0 && (
                <div className="space-y-1">
                  {(campaign.compendium.customResources || []).map((res) => {
                    const st = getCharacterCustomResourceState(hero, res);
                    const pct = Math.max(0, Math.min(100, (st.current / Math.max(1, st.max)) * 100));
                    return (
                      <div key={res.id} className="rpg-socket rounded px-2 py-1 space-y-0.5 text-[10px]">
                        <div className="flex items-center justify-between">
                          <span className="font-display font-bold" style={{ color: res.color }}>
                            {res.shortName}
                          </span>
                          <span className="font-mono-dice font-bold">
                            {st.current}/{st.max}
                          </span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-black/70 overflow-hidden">
                          <div
                            className="h-full transition-all"
                            style={{ width: `${pct}%`, backgroundColor: res.color }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 6 Attributes (1-Click Roll) */}
              <div className="space-y-1">
                <div className="text-[9px] uppercase tracking-wider font-display font-bold text-amber-300/85">
                  Atributos (Clique para rolar)
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {campaign.compendium.attributes.map((attr) => {
                    const comp = stats.attributes[attr.id] || { value: 10, mod: 0 };
                    return (
                      <button
                        key={attr.id}
                        type="button"
                        onClick={() =>
                          quickRollFormula(`Teste de ${attr.name}`, `1d20 + ${comp.mod}`, hero.name)
                        }
                        className="rpg-card rounded p-1 text-center hover:border-amber-400/70 cursor-pointer transition"
                      >
                        <div className="text-[9px] font-display opacity-75">{attr.shortName}</div>
                        <div className="font-mono-dice font-bold text-xs text-amber-200">
                          {formatSigned(comp.mod)}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Trained Skills (1-Click Roll) */}
              {hero.trainedSkillIds.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[9px] uppercase tracking-wider font-display font-bold text-amber-300/85">
                    Perícias Treinadas
                  </div>
                  <div className="space-y-1 max-h-28 overflow-y-auto pr-0.5">
                    {hero.trainedSkillIds.map((skId) => {
                      const sk = campaign.compendium.skills.find((s) => s.id === skId);
                      const comp = stats.skills[skId];
                      if (!sk || !comp) return null;
                      return (
                        <button
                          key={skId}
                          type="button"
                          onClick={() =>
                            quickRollFormula(`Perícia: ${sk.name}`, `1d20 + ${comp.total}`, hero.name)
                          }
                          className="w-full rpg-card px-2 py-1 rounded flex items-center justify-between text-[10px] hover:border-amber-400/60 cursor-pointer"
                        >
                          <span className="truncate">{sk.name}</span>
                          <span className="font-mono-dice font-bold text-amber-300">
                            {formatSigned(comp.total)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Active Conditions & Concentration in Mini-Sheet */}
              <div className="space-y-1">
                <div className="text-[9px] uppercase tracking-wider font-display font-bold text-amber-300/85">
                  Condições &amp; Concentração
                </div>
                <div className="flex flex-wrap gap-1">
                  {hero.concentratingSpell && (
                    <span className="px-1.5 py-0.5 rounded bg-purple-950/80 border border-purple-400/60 text-purple-200 text-[9px] font-bold">
                      ✨ Conc: {hero.concentratingSpell}
                    </span>
                  )}
                  {(hero.activeConditionIds || []).map((cid) => {
                    const cond = campaign.compendium.conditions.find((c) => c.id === cid);
                    if (!cond) return null;
                    return (
                      <span
                        key={cid}
                        className="px-1.5 py-0.5 rounded bg-black/50 border text-[9px] font-semibold"
                        style={{ borderColor: cond.color, color: cond.color }}
                      >
                        {cond.icon} {cond.name}
                      </span>
                    );
                  })}
                  {!hero.concentratingSpell && (hero.activeConditionIds || []).length === 0 && (
                    <span className="text-[10px] opacity-60 italic">Nenhuma condição ativa</span>
                  )}
                </div>
              </div>

              {/* Damage Resistances / Immunities / Vulnerabilities in Mini-Sheet */}
              <div className="space-y-1">
                <div className="text-[9px] uppercase tracking-wider font-display font-bold text-amber-300/85">
                  Resistências &amp; Afinidades
                </div>
                <div className="flex flex-wrap gap-1 text-[9px]">
                  {(hero.damageResistances || []).map((dt) => (
                    <span
                      key={`res-${dt}`}
                      className="px-1.5 py-0.5 rounded bg-sky-950/80 border border-sky-400/50 text-sky-200"
                    >
                      ½ {dt}
                    </span>
                  ))}
                  {(hero.damageImmunities || []).map((dt) => (
                    <span
                      key={`imm-${dt}`}
                      className="px-1.5 py-0.5 rounded bg-emerald-950/80 border border-emerald-400/50 text-emerald-200"
                    >
                      0 {dt}
                    </span>
                  ))}
                  {(hero.damageVulnerabilities || []).map((dt) => (
                    <span
                      key={`vul-${dt}`}
                      className="px-1.5 py-0.5 rounded bg-red-950/80 border border-red-400/50 text-red-200"
                    >
                      2× {dt}
                    </span>
                  ))}
                  {(hero.damageResistances || []).length === 0 &&
                    (hero.damageImmunities || []).length === 0 &&
                    (hero.damageVulnerabilities || []).length === 0 && (
                      <span className="text-[10px] opacity-60 italic">Sem resistências especiais</span>
                    )}
                </div>
              </div>

              {/* Cargas & Munição (● ● ○) in Player Mini-Sheet */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] uppercase tracking-wider font-display font-bold text-amber-300/85">
                    Cargas &amp; Munição
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      const label = await openTextPrompt('Nome da carga ou munição (ex: Fúria, Flechas):', 'Flechas');
                      if (!label) return;
                      const maxRaw = await openTextPrompt(`Máximo de cargas para "${label}":`, '5');
                      const maxVal = Math.max(1, Math.min(99, Number(maxRaw) || 5));
                      updateCampaign((prev) => ({
                        ...prev,
                        characters: prev.characters.map((c) =>
                          c.id !== hero.id
                            ? c
                            : {
                                ...c,
                                resourceTrackers: [
                                  ...(c.resourceTrackers || []),
                                  {
                                    id: `res-${Date.now()}`,
                                    name: label.trim(),
                                    current: maxVal,
                                    max: maxVal,
                                    resetOn: 'long',
                                  },
                                ],
                              }
                        ),
                      }));
                    }}
                    className="text-[9px] px-1.5 py-0.5 rounded rpg-card hover:border-amber-400 cursor-pointer text-amber-200"
                    title="Adicionar rastreador de cargas ou munição"
                  >
                    + Carga
                  </button>
                </div>
                {(hero.resourceTrackers || []).length === 0 ? (
                  <div className="text-[10px] opacity-55 italic">
                    Clique em + Carga para controlar Fúria, Flechas, etc.
                  </div>
                ) : (
                  <div className="space-y-1">
                    {(hero.resourceTrackers || []).map((tr) => (
                      <div
                        key={tr.id}
                        className="rpg-socket rounded px-2 py-1 flex items-center justify-between gap-1.5 text-[10px]"
                      >
                        <span className="font-display font-semibold truncate">{tr.name}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          {tr.max <= 8 ? (
                            <div className="flex items-center gap-0.5">
                              {Array.from({ length: tr.max }).map((_, i) => {
                                const filled = i < tr.current;
                                return (
                                  <button
                                    key={i}
                                    type="button"
                                    onClick={() => {
                                      const nextCur = filled && i + 1 === tr.current ? i : i + 1;
                                      updateCampaign((prev) => ({
                                        ...prev,
                                        characters: prev.characters.map((c) =>
                                          c.id !== hero.id
                                            ? c
                                            : {
                                                ...c,
                                                resourceTrackers: (c.resourceTrackers || []).map((x) =>
                                                  x.id === tr.id ? { ...x, current: nextCur } : x
                                                ),
                                              }
                                        ),
                                      }));
                                    }}
                                    className={`w-2.5 h-2.5 rounded-full border cursor-pointer transition ${
                                      filled
                                        ? 'bg-amber-400 border-amber-200 shadow-[0_0_5px_rgba(251,191,36,0.7)]'
                                        : 'bg-black/60 border-white/25'
                                    }`}
                                    title={`${tr.name}: ${tr.current}/${tr.max}`}
                                  />
                                );
                              })}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 font-mono-dice">
                              <button
                                type="button"
                                onClick={() =>
                                  updateCampaign((prev) => ({
                                    ...prev,
                                    characters: prev.characters.map((c) =>
                                      c.id !== hero.id
                                        ? c
                                        : {
                                            ...c,
                                            resourceTrackers: (c.resourceTrackers || []).map((x) =>
                                              x.id === tr.id
                                                ? { ...x, current: Math.max(0, x.current - 1) }
                                                : x
                                            ),
                                          }
                                    ),
                                  }))
                                }
                                className="px-1 rounded bg-black/60 hover:bg-black cursor-pointer"
                              >
                                -
                              </button>
                              <span className="text-amber-300 font-bold">
                                {tr.current}/{tr.max}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  updateCampaign((prev) => ({
                                    ...prev,
                                    characters: prev.characters.map((c) =>
                                      c.id !== hero.id
                                        ? c
                                        : {
                                            ...c,
                                            resourceTrackers: (c.resourceTrackers || []).map((x) =>
                                              x.id === tr.id
                                                ? { ...x, current: Math.min(x.max, x.current + 1) }
                                                : x
                                            ),
                                          }
                                    ),
                                  }))
                                }
                                className="px-1 rounded bg-black/60 hover:bg-black cursor-pointer"
                              >
                                +
                              </button>
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              updateCampaign((prev) => ({
                                ...prev,
                                characters: prev.characters.map((c) =>
                                  c.id !== hero.id
                                    ? c
                                    : {
                                        ...c,
                                        resourceTrackers: (c.resourceTrackers || []).filter(
                                          (x) => x.id !== tr.id
                                        ),
                                      }
                                ),
                              }))
                            }
                            className="text-red-400/70 hover:text-red-300 cursor-pointer"
                            title="Remover rastreador"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Quick Personal Notes in Player Mini-Sheet */}
              <div className="space-y-1">
                <div className="text-[9px] uppercase tracking-wider font-display font-bold text-amber-300/85">
                  Notas Rápidas
                </div>
                <textarea
                  rows={2}
                  value={hero.notes || ''}
                  onChange={(e) =>
                    updateCampaign((prev) => ({
                      ...prev,
                      characters: prev.characters.map((c) =>
                        c.id === hero.id ? { ...c, notes: e.target.value } : c
                      ),
                    }))
                  }
                  placeholder="Anotações de pistas, NPCs, objetivos..."
                  className="rpg-input w-full text-[10px] py-1 px-2 resize-none"
                />
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-white/10 text-[10px]">
                <span className="font-mono-dice text-amber-300">Ouro: {hero.gold} PO</span>
                <button
                  type="button"
                  onClick={onOpenSheet}
                  className="rpg-btn-primary px-2.5 py-1 rounded text-[10px] font-display font-bold cursor-pointer"
                >
                  Ficha Completa
                </button>
              </div>
            </div>
          )}
        </DraggablePanel>
      )}
    </>
  );
};
