import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clapperboard,
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
  Lock,
  MapPin,
  Moon,
  Pencil,
  Plus,
  Save,
  Search,
  Shield,
  ShieldAlert,
  Skull,
  Sparkles,
  Star,
  Swords,
  Trash2,
  User,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { useCampaign } from '../context/CampaignContext';
import {
  buildPendingAttackFromMonsterAttack,
  buildPreviewDiceForFormula,
  computeCharacterStats,
  consumeCombatantEconomy,
  evaluateFormula,
  findNearestFreeGridCell,
  formatFormulaForDisplay,
  formatMonsterAttackSummary,
  formatSigned,
  getCombatantActionsRemaining,
  getCombatantBonusActionsRemaining,
  getCharacterCustomResourceState,
  getConditionGrantedAbilities,
  getHeroInspirationPoints,
  getInventoryChargedAbilities,
  isTokenNameHiddenFromPlayers,
  maskHiddenNameForRole,
  maskHiddenNamesInText,
} from '../shared/rulesEngine';
import {
  ActionEconomyCost,
  CUT_IN_STYLE_OPTIONS,
  CutInStylePreset,
  NpcEntry,
  ULTIMATE_SFX_OPTIONS,
  UltimateSfxPreset,
} from '../shared/types';
import { DraggablePanel, DragGripBadge } from './DraggablePanel';
import { openEntitySheet } from './EntitySheetModal';
import { openInspectEntity } from './InspectEntityModal';
import { OrnateFrame, SculptedHealthBar } from './OrnateFrame';
import { openConfirmDialog, openTextPrompt } from './PromptDialog';
import { TokenPortrait } from './TokenPortrait';

interface PrivateNoteTab {
  id: string;
  title: string;
  content: string;
  updatedAt: number;
}

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
    viewedMapId,
    activeCharacterId,
    setActiveCharacterId,
    targetTokenId,
    setTargetTokenId,
    rollCharacterAction,
    awardXp,
    pushCombatLog,
    toggleHeroInspiration,
    adjustHeroInspiration,
    spendHeroInspiration,
    useChargedItemAbility,
    useConsumable,
    rerollSaveWithInspiration,
    acceptFailedSaveTarget,
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
    useBossLegendaryResistance,
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
    switchCharacterForm,
    enterRpSpotlight,
    clearRpSpotlight,
    rpSpotlight,
    triggerUltimateCutIn,
  } = useCampaign();

  const [showRestMenu, setShowRestMenu] = useState(false);
  const [showConcMenu, setShowConcMenu] = useState(false);
  const [showPlayerActions, setShowPlayerActions] = useState(false);
  const [showSkillsMenu, setShowSkillsMenu] = useState(false);
  const [skillSearch, setSkillSearch] = useState('');
  const [managingFavSkills, setManagingFavSkills] = useState(false);
  const [showSceneMenu, setShowSceneMenu] = useState(false);
  const [sceneMenuTab, setSceneMenuTab] = useState<'rp' | 'forms' | 'cutin'>('rp');
  const [rpSlot, setRpSlot] = useState<'left' | 'right'>('left');
  const [rpTone, setRpTone] = useState<'normal' | 'serious' | 'intense' | 'whisper' | 'epic'>('normal');
  const [rpDialogue, setRpDialogue] = useState('');
  const [quickCutInName, setQuickCutInName] = useState('');
  const [quickCutInPhrase, setQuickCutInPhrase] = useState('');
  const [quickCutInColor, setQuickCutInColor] = useState('#38bdf8');
  const [quickCutInStyle, setQuickCutInStyle] = useState<CutInStylePreset>('anime-impact');
  const [quickCutInSfx, setQuickCutInSfx] = useState<UltimateSfxPreset>('bass-drop');
  const [quickCutInDomain, setQuickCutInDomain] = useState(false);
  const [quickCutInTheme, setQuickCutInTheme] = useState<'sonic' | 'void' | 'crimson' | 'frost' | 'solar' | 'emerald'>('sonic');
  const [showPrivateNotes, setShowPrivateNotes] = useState(false);
  const [privateNoteTabs, setPrivateNoteTabs] = useState<PrivateNoteTab[]>([
    { id: 'note-1', title: 'Sessão Atual', content: '', updatedAt: Date.now() },
  ]);
  const [activePrivateNoteId, setActivePrivateNoteId] = useState<string>('note-1');
  const [showGmActions, setShowGmActions] = useState(false);
  const [actionSearch, setActionSearch] = useState('');
  const [playerSheetCollapsed, setPlayerSheetCollapsed] = useState(true);
  const [playerDrawerTab, setPlayerDrawerTab] = useState<'sheet' | 'party'>('sheet');
  const [gmRosterCollapsed, setGmRosterCollapsed] = useState(true);
  const [gmRosterTab, setGmRosterTab] = useState<'heroes' | 'npcs' | 'monsters'>('heroes');
  const [expandedHeroId, setExpandedHeroId] = useState<string | null>(null);
  const playerActionsRef = useRef<HTMLDivElement | null>(null);
  const playerRestRef = useRef<HTMLDivElement | null>(null);
  const playerSkillsRef = useRef<HTMLDivElement | null>(null);
  const playerSceneRef = useRef<HTMLDivElement | null>(null);
  const privateNoteTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const togglePlayerDrawerTab = (tab: 'sheet' | 'party') => {
    if (playerSheetCollapsed) {
      setPlayerDrawerTab(tab);
      setPlayerSheetCollapsed(false);
    } else if (playerDrawerTab === tab) {
      setPlayerSheetCollapsed(true);
    } else {
      setPlayerDrawerTab(tab);
    }
  };

  useEffect(() => {
    if (!showPlayerActions && !showRestMenu && !showSkillsMenu && !showSceneMenu) return;
    const onDocDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (playerActionsRef.current && !playerActionsRef.current.contains(target)) {
        setShowPlayerActions(false);
      }
      if (playerRestRef.current && !playerRestRef.current.contains(target)) {
        setShowRestMenu(false);
      }
      if (playerSkillsRef.current && !playerSkillsRef.current.contains(target)) {
        setShowSkillsMenu(false);
      }
      if (playerSceneRef.current && !playerSceneRef.current.contains(target)) {
        setShowSceneMenu(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[data-modal-overlay="true"]')) {
        setShowPlayerActions(false);
        setShowRestMenu(false);
        setShowSkillsMenu(false);
        setShowSceneMenu(false);
      }
    };
    window.addEventListener('mousedown', onDocDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDocDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [showPlayerActions, showRestMenu, showSkillsMenu, showSceneMenu]);

  // STRICT ROLE SEPARATION:
  // Players ONLY see their own character (myCharacter) — never a fallback to characters[0].
  const hero = role === 'player' ? myCharacter : undefined;
  const stats = hero ? computeCharacterStats(hero, campaign) : null;

  // 100% Client-Local Private Multi-Tab Notes (NEVER sent to server, GM, or other players)
  const privateNotesStorageKey =
    role === 'player' && hero
      ? `chronicle_player_private_notes_v1:${campaign.id}:${hero.vaultId || hero.id}`
      : null;

  useEffect(() => {
    if (!privateNotesStorageKey) return;
    try {
      const raw = window.localStorage.getItem(privateNotesStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const validTabs: PrivateNoteTab[] = parsed
            .filter((t) => t && typeof t.id === 'string')
            .map((t, idx) => ({
              id: String(t.id),
              title: typeof t.title === 'string' && t.title.trim() ? t.title : `Nota ${idx + 1}`,
              content: typeof t.content === 'string' ? t.content : '',
              updatedAt: typeof t.updatedAt === 'number' ? t.updatedAt : Date.now(),
            }));
          if (validTabs.length > 0) {
            setPrivateNoteTabs(validTabs);
            setActivePrivateNoteId(validTabs[0].id);
            return;
          }
        }
      }
    } catch {
      // Ignore malformed localStorage entries and initialize cleanly
    }
    const starter: PrivateNoteTab = {
      id: `note-${Date.now()}`,
      title: 'Sessão Atual',
      content: '',
      updatedAt: Date.now(),
    };
    setPrivateNoteTabs([starter]);
    setActivePrivateNoteId(starter.id);
  }, [privateNotesStorageKey]);

  const persistPrivateNotes = (nextTabs: PrivateNoteTab[]) => {
    setPrivateNoteTabs(nextTabs);
    if (!privateNotesStorageKey) return;
    try {
      window.localStorage.setItem(privateNotesStorageKey, JSON.stringify(nextTabs));
    } catch {
      // Ignore storage quota errors silently
    }
  };

  const createPrivateNoteTab = () => {
    const newTab: PrivateNoteTab = {
      id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: `Assunto ${privateNoteTabs.length + 1}`,
      content: '',
      updatedAt: Date.now(),
    };
    persistPrivateNotes([...privateNoteTabs, newTab]);
    setActivePrivateNoteId(newTab.id);
  };

  const renamePrivateNoteTab = (tabId: string, nextTitle: string) => {
    persistPrivateNotes(
      privateNoteTabs.map((t) =>
        t.id === tabId ? { ...t, title: nextTitle, updatedAt: Date.now() } : t
      )
    );
  };

  const updatePrivateNoteContent = (tabId: string, nextContent: string) => {
    persistPrivateNotes(
      privateNoteTabs.map((t) =>
        t.id === tabId ? { ...t, content: nextContent, updatedAt: Date.now() } : t
      )
    );
  };

  const deletePrivateNoteTab = async (tabId: string) => {
    const target = privateNoteTabs.find((t) => t.id === tabId);
    if (!target) return;
    if (target.content.trim().length > 0) {
      const ok = await openConfirmDialog(
        `Excluir a aba "${target.title || 'Sem título'}" e todo o seu conteúdo? Esta nota existe apenas no seu dispositivo.`,
        'Excluir Nota Privada'
      );
      if (!ok) return;
    }
    const remaining = privateNoteTabs.filter((t) => t.id !== tabId);
    if (remaining.length === 0) {
      const fresh: PrivateNoteTab = {
        id: `note-${Date.now()}`,
        title: 'Sessão Atual',
        content: '',
        updatedAt: Date.now(),
      };
      persistPrivateNotes([fresh]);
      setActivePrivateNoteId(fresh.id);
      return;
    }
    persistPrivateNotes(remaining);
    if (activePrivateNoteId === tabId) {
      setActivePrivateNoteId(remaining[0].id);
    }
  };

  const appendPrivateNoteClue = (tabId: string) => {
    const target = privateNoteTabs.find((t) => t.id === tabId);
    if (!target) return;
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const prefix = target.content.trim().length > 0 ? '\n' : '';
    const nextContent = `${target.content}${prefix}• [${hh}:${mm}] `;
    updatePrivateNoteContent(tabId, nextContent);
    window.setTimeout(() => {
      const el = privateNoteTextareaRef.current;
      if (el) {
        el.focus();
        el.selectionStart = el.value.length;
        el.selectionEnd = el.value.length;
      }
    }, 0);
  };

  const toggleHeroFavoriteSkill = (skillId: string) => {
    if (!hero) return;
    updateCampaign((prev) => ({
      ...prev,
      characters: prev.characters.map((c) => {
        if (c.id !== hero.id) return c;
        const validRegularSkillIds = new Set(
          prev.compendium.skills.filter((s) => !s.isSavingThrow).map((s) => s.id)
        );
        const current = (c.favoriteSkillIds || []).filter((id) => validRegularSkillIds.has(id));
        if (current.includes(skillId)) {
          return { ...c, favoriteSkillIds: current.filter((id) => id !== skillId) };
        }
        if (current.length >= 6) return c;
        return { ...c, favoriteSkillIds: [...current, skillId] };
      }),
    }));
  };

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
  const orderedKnownAbilities = (hero?.knownAbilityIds || [])
    .map((id) => campaign.compendium.abilities.find((a) => a.id === id))
    .filter((a): a is NonNullable<typeof a> => Boolean(a));
  const compendiumAbilities = orderedKnownAbilities.filter((a) => a.actionType !== 'Passiva');
  const passiveCompendiumAbilities = orderedKnownAbilities.filter(
    (a) => a.actionType === 'Passiva'
  );
  const conditionGrantedAbilities = getConditionGrantedAbilities(
    hero?.activeConditionIds,
    campaign
  ).filter(({ ability }) => !compendiumAbilities.some((a) => a.id === ability.id));
  const chargedItemAbilities = getInventoryChargedAbilities(hero, campaign);

  const toEconomyCost = (actionType: string): ActionEconomyCost => {
    const t = (actionType || '').trim();
    if (/b[oô]nus/i.test(t)) return 'Bônus';
    if (/rea[cç][aã]o/i.test(t)) return 'Reação';
    if (/livre/i.test(t)) return 'Livre';
    return 'Padrão';
  };

  const heroCombatant =
    campaign.combat.active && hero
      ? campaign.combat.combatants.find(
          (cb) => cb.type === 'character' && cb.referenceId === hero.id
        )
      : undefined;

  const activeTurnCombatant = campaign.combat.active
    ? campaign.combat.combatants[campaign.combat.currentTurnIndex]
    : undefined;

  const isActionSlotSpent = (
    cost: ActionEconomyCost,
    opts?: { isWeaponAttack?: boolean }
  ) => {
    if (!campaign.combat.active || !heroCombatant) return false;
    const isOffTurnAsPlayer =
      role === 'player' &&
      Boolean(activeTurnCombatant && activeTurnCombatant.id !== heroCombatant.id);
    if (cost === 'Padrão') {
      // D&D 5e Ready Action: off-turn Standard actions are unlocked while Ready + Reaction available!
      if (isOffTurnAsPlayer) {
        return !(heroCombatant.readyAction && heroCombatant.reactionAvailable !== false);
      }
      // D&D 5e Extra Attack: weapon attacks remain available while extraAttacksRemaining > 0!
      if (opts?.isWeaponAttack && (heroCombatant.extraAttacksRemaining ?? 0) > 0) {
        return false;
      }
      return heroCombatant.actionAvailable === false;
    }
    if (cost === 'Bônus') return isOffTurnAsPlayer || heroCombatant.bonusActionAvailable === false;
    // D&D 5e: Reação e Ação Livre podem ser usadas mesmo fora do próprio turno!
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
      if (document.querySelector('[data-modal-overlay="true"]')) return;

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
              isWeaponAttack: true,
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
              isWeaponAttack: true,
              critRange: wp.critRange,
              critMultiplier: wp.critMultiplier,
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
              costResourceId: ab.costResourceId,
              isTeleport: ab.isTeleport,
              teleportRequiresSight: ab.teleportRequiresSight,
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
          ...conditionGrantedAbilities.map(({ ability: ab }) => () =>
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
    conditionGrantedAbilities,
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
    campaign.maps.find((m) => m.id === viewedMapId) ||
    campaign.maps.find((m) => m.id === campaign.activeMapId) ||
    campaign.maps[0];

  const allMapTokens = campaign.maps.flatMap((m) => m.tokens);

  const canRespondOpportunity =
    Boolean(opportunityPrompt) &&
    (role === 'gm' ||
      Boolean(
        myCharacter &&
          (opportunityPrompt?.reactorReferenceId === myCharacter.id ||
            allMapTokens.find((t) => t.id === opportunityPrompt?.reactorTokenId)
              ?.controlledByCharacterId === myCharacter.id)
      ));

  const opportunityTargetToken = opportunityPrompt
    ? allMapTokens.find((t) => t.id === opportunityPrompt.targetTokenId)
    : undefined;

  const quickConsumables = (hero?.inventory || [])
    .filter((entry) => entry.quantity > 0)
    .flatMap((entry) => {
      const def = campaign.compendium.items.find((i) => i.id === entry.itemId);
      return def && def.type === 'Consumível' ? [{ entry, def }] : [];
    });

  const handleUseConsumable = (entryId: string, itemId: string) => {
    if (!hero) return;
    useConsumable(hero.id, entryId, itemId);
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
        m.id !== activeMap.id
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
        m.id !== activeMap.id
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
                  hideNameFromPlayers: npc.hideNameFromPlayers,
                  hideAcFromPlayers: npc.hideAcFromPlayers,
                  hideHpFromPlayers: npc.hideHpFromPlayers,
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
    const mapTok = allMapTokens.find(
      (t) => t.type === 'character' && t.referenceId === characterId
    );
    if (mapTok) {
      applyDamage(
        mapTok.id,
        Math.abs(delta),
        delta > 0,
        undefined,
        undefined,
        undefined,
        undefined,
        false,
        { suppressExecution: true, skipRevivePenalty: true }
      );
      return;
    }
    updateCampaign((prev) => {
      const targetCh = prev.characters.find((c) => c.id === characterId);
      if (!targetCh) return prev;
      const isPermDead = Boolean(
        targetCh.hp <= 0 &&
          (targetCh.deathSaves?.dead || (targetCh.deathSaves?.failures ?? 0) >= 3)
      );
      if (delta > 0 && isPermDead) return prev;
      const nextHp = Math.max(0, Math.min(maxHp, targetCh.hp + delta));
      const revived = targetCh.hp <= 0 && nextHp > 0;
      const nextConds = revived
        ? targetCh.activeConditionIds.filter((cid) => cid !== 'cond-inconsciente')
        : targetCh.activeConditionIds;
      return {
        ...prev,
        characters: prev.characters.map((c) =>
          c.id === characterId
            ? {
                ...c,
                hp: nextHp,
                activeConditionIds: nextConds,
                ...(revived
                  ? { deathSaves: { successes: 0, failures: 0, stabilized: false, dead: false } }
                  : {}),
              }
            : c
        ),
        combat: prev.combat.active
          ? {
              ...prev.combat,
              combatants: prev.combat.combatants.map((cb) =>
                cb.type === 'character' && cb.referenceId === characterId
                  ? { ...cb, hp: nextHp, maxHp }
                  : cb
              ),
            }
          : prev.combat,
      };
    });
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
                    <strong>
                      {role !== 'gm' && isTokenNameHiddenFromPlayers(opportunityTargetToken, campaign)
                        ? '???'
                        : maskHiddenNameForRole(
                            opportunityPrompt.targetName,
                            role,
                            campaign,
                            opportunityPrompt.targetTokenId
                          )}
                    </strong>{' '}
                    saiu do alcance corpo a corpo de{' '}
                    <strong style={{ color: opportunityPrompt.reactorColor }}>
                      {maskHiddenNameForRole(
                        opportunityPrompt.reactorName,
                        role,
                        campaign,
                        opportunityPrompt.reactorTokenId
                      )}
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
                Aguarde{' '}
                <strong style={{ color: opportunityPrompt.reactorColor }}>
                  {maskHiddenNameForRole(
                    opportunityPrompt.reactorName,
                    role,
                    campaign,
                    opportunityPrompt.reactorTokenId
                  )}
                </strong>{' '}
                resolver ou passar o Ataque de Oportunidade contra{' '}
                <strong>
                  {role !== 'gm' && isTokenNameHiddenFromPlayers(opportunityTargetToken, campaign)
                    ? '???'
                    : maskHiddenNameForRole(
                        opportunityPrompt.targetName,
                        role,
                        campaign,
                        opportunityPrompt.targetTokenId
                      )}
                </strong>
                .
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
                  {maskHiddenNamesInText(activeSavePrompt.title, role, campaign)}
                </div>
                {activeSavePrompt.subtitle && (
                  <p className="text-[11px] font-lore opacity-85 leading-snug">
                    {maskHiddenNamesInText(activeSavePrompt.subtitle, role, campaign)}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <DragGripBadge />
                <button
                  onClick={dismissSavePrompt}
                  className="rpg-card p-1 rounded cursor-pointer"
                  title={
                    activeSavePrompt.kind === 'concentration' &&
                    activeSavePrompt.targets.some((t) => t.status === 'pending')
                      ? 'Fechar sem rolar (perde a Concentração automaticamente)'
                      : 'Fechar painel'
                  }
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
                const saveTok = campaign.maps
                  .flatMap((m) => m.tokens)
                  .find((x) => x.id === t.tokenId);
                const displaySaveName =
                  role !== 'gm' && isTokenNameHiddenFromPlayers(saveTok, campaign)
                    ? '???'
                    : maskHiddenNameForRole(t.name, role, campaign, t.tokenId);
                return (
                  <div
                    key={t.tokenId}
                    className="rpg-card rounded-md px-2.5 py-2 flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <TokenPortrait
                        name={displaySaveName}
                        imageUrl={t.imageUrl}
                        playerColor={t.color}
                        sizePx={32}
                      />
                      <div className="min-w-0">
                        <div className="font-display font-bold text-xs text-amber-100 truncate">
                          {displaySaveName}
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
                              : activeSavePrompt.kind === 'condition-save'
                                ? t.status === 'passed'
                                  ? 'Livrou-se ✓'
                                  : 'Continua!'
                                : t.status === 'passed'
                                  ? `Passou${t.damageToApply > 0 ? ` (-${t.damageToApply})` : ' (0)'}`
                                  : `Falhou (-${t.damageToApply})`}
                          </div>
                          {t.applied && (
                            <div className="text-[9px] text-emerald-300 mt-0.5">Aplicado ✓</div>
                          )}
                          {t.status === 'failed' &&
                            !t.applied &&
                            t.characterId &&
                            (role === 'gm' || myCharacter?.id === t.characterId) &&
                            (() => {
                              const saveHero = campaign.characters.find((c) => c.id === t.characterId);
                              const inspPts = getHeroInspirationPoints(saveHero);
                              if (!saveHero || inspPts <= 0) return null;
                              return (
                                <div className="mt-1 flex items-center justify-end gap-1">
                                  <button
                                    type="button"
                                    onClick={() => rerollSaveWithInspiration(t.tokenId)}
                                    className="px-2 py-0.5 rounded bg-amber-950/90 border border-amber-400/70 text-[9px] font-display font-bold text-amber-200 hover:bg-amber-900 cursor-pointer"
                                    title="Gasta 1 Ponto de Inspiração Heroica para re-rolar esta salvaguarda!"
                                  >
                                    ★ Re-rolar ({inspPts}/3)
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => acceptFailedSaveTarget(t.tokenId)}
                                    className="px-2 py-0.5 rounded bg-black/50 border border-white/20 text-[9px] font-display font-semibold text-slate-200 hover:border-red-400/60 cursor-pointer"
                                    title="Aceitar o resultado da falha sem gastar Inspiração"
                                  >
                                    Aceitar
                                  </button>
                                </div>
                              );
                            })()}
                          {role === 'gm' &&
                            t.status === 'failed' &&
                            activeSavePrompt.kind !== 'concentration' &&
                            (() => {
                              const bossTok = campaign.maps
                                .flatMap((m) => m.tokens)
                                .find((x) => x.id === t.tokenId);
                              const legRem =
                                bossTok?.isBoss
                                  ? bossTok.legendaryResistancesRemaining ??
                                    bossTok.legendaryResistancesMax ??
                                    0
                                  : 0;
                              if (legRem <= 0) return null;
                              return (
                                <button
                                  type="button"
                                  onClick={() => useBossLegendaryResistance(t.tokenId)}
                                  className="mt-1 px-2 py-0.5 rounded bg-sky-950/90 border border-sky-400/70 text-[9px] font-display font-bold text-sky-200 hover:bg-sky-900 cursor-pointer"
                                  title="Gasta 1 Resistência Lendária para transformar esta falha em SUCESSO automático!"
                                >
                                  ⚡ Resist. Lendária ({legRem})
                                </button>
                              );
                            })()}
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

      {/* Secret Passage Notification Banner (with 1-Click Map Transfer for GM & Spotted Players) */}
      {activeSecretPassage &&
        (role === 'gm' ||
          activeSecretPassage.revealed ||
          Boolean(
            myCharacter &&
              activeSecretPassage.visibleToCharacterIds?.includes(myCharacter.id)
          )) && (
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
                    Destino vinculado:{' '}
                    <span className="text-amber-300">
                      {activeSecretPassage.targetMapName}
                      {activeSecretPassage.targetMarkerTitle
                        ? ` → 🌀 ${activeSecretPassage.targetMarkerTitle}`
                        : ''}
                    </span>
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
              (activeSecretPassage.revealed ||
                Boolean(
                  myCharacter &&
                    activeSecretPassage.visibleToCharacterIds?.includes(myCharacter.id)
                )) &&
              activeSecretPassage.targetMapId && (
                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => {
                      const sourceMap =
                        campaign.maps.find((m) => m.id === activeSecretPassage.sourceMapId) ||
                        activeMap;
                      const myTokId =
                        sourceMap?.tokens.find(
                          (t) =>
                            t.type === 'character' &&
                            myCharacter &&
                            t.referenceId === myCharacter.id
                        )?.id || activeSecretPassage.tokenId;
                      if (myTokId) {
                        moveTokensToMap(
                          activeSecretPassage.sourceMapId,
                          activeSecretPassage.targetMapId!,
                          [myTokId],
                          activeSecretPassage.targetMarkerId
                        );
                      } else {
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
                        [activeSecretPassage.tokenId!],
                        activeSecretPassage.targetMarkerId
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
                        'all-heroes',
                        activeSecretPassage.targetMarkerId
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
            <span>{maskHiddenNamesInText(tacticalAlert.message, role, campaign)}</span>
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
          MODE A-LEFT: GM DRAGGABLE COMMAND ROSTER ("Grupo" — Heróis, NPCs & Mapa)
         ===================================================================== */}
      {role === 'gm' && (
        <DraggablePanel
          storageKey="gm-left-command-roster"
          className="fixed left-[64px] top-[58px] bottom-[94px] z-25 pointer-events-none flex items-start"
        >
          {gmRosterCollapsed ? (
            <div className="pointer-events-auto rpg-glass-panel rounded-lg px-2 py-1.5 flex items-center gap-1.5 shadow-xl">
              <DragGripBadge />
              <button
                type="button"
                onClick={() => setGmRosterCollapsed(false)}
                className="flex items-center gap-1.5 text-[13px] font-semibold text-[#f0dca6] hover:text-white cursor-pointer pr-1"
                title="Expandir painel Grupo (Heróis, NPCs e Criaturas)"
              >
                <Users className="w-4 h-4 text-[#d4ad5c]" />
                <span>Grupo ({campaign.characters.length})</span>
                <ChevronRight className="w-3.5 h-3.5 text-[#a69b88]" />
              </button>
            </div>
          ) : (
            <OrnateFrame
              accentColor="#b89146"
              cornerSize={12}
              className="pointer-events-auto w-[274px] max-h-full rpg-glass-panel rpg-grain rounded-lg flex flex-col animate-drawer-left overflow-hidden"
            >
              {/* Header + Tabs */}
              <div
                className="px-3 py-2 border-b flex items-center justify-between gap-2 shrink-0 bg-[#0d0f16]"
                style={{ borderColor: 'var(--border-hairline)' }}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <Crown className="w-3.5 h-3.5 text-[#d4ad5c] shrink-0" />
                  <span className="font-semibold text-[13px] text-[#e8c683] truncate">
                    Grupo &amp; Elenco
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <DragGripBadge />
                  <button
                    type="button"
                    onClick={() => setGmRosterCollapsed(true)}
                    className="rpg-card p-1 rounded cursor-pointer shrink-0 text-[#a69b88] hover:text-[#ece4d5]"
                    title="Recolher Grupo"
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
                            {(() => {
                              const inspPts = getHeroInspirationPoints(ch);
                              return (
                                <div
                                  className={`inline-flex items-center rounded border text-[10px] font-display font-bold ${
                                    inspPts > 0
                                      ? 'bg-amber-500/25 border-amber-300/80 text-amber-200 shadow-[0_0_8px_rgba(251,191,36,0.35)]'
                                      : 'rpg-card text-amber-300/70'
                                  }`}
                                  title={`Pontos de Inspiração Heroica de ${ch.name} (${inspPts}/3)`}
                                >
                                  <button
                                    type="button"
                                    disabled={inspPts <= 0}
                                    onClick={() => adjustHeroInspiration(ch.id, -1)}
                                    className="px-1 py-0.5 hover:bg-black/30 disabled:opacity-30 cursor-pointer"
                                    title="Remover 1 Ponto de Inspiração"
                                  >
                                    −
                                  </button>
                                  <span className="px-1">★{inspPts}</span>
                                  <button
                                    type="button"
                                    disabled={inspPts >= 3}
                                    onClick={() => adjustHeroInspiration(ch.id, 1)}
                                    className="px-1 py-0.5 hover:bg-black/30 disabled:opacity-30 cursor-pointer"
                                    title="Conceder +1 Ponto de Inspiração (máx. 3)"
                                  >
                                    +
                                  </button>
                                </div>
                              );
                            })()}
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
                                        isWeaponAttack: true,
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
                                        isWeaponAttack: true,
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

                              {getInventoryChargedAbilities(ch, campaign).map(
                                ({ inventoryEntryId, itemDef, ability: ab, maxCharges, chargesRemaining }) => {
                                  const outOfCharges = maxCharges > 0 && chargesRemaining <= 0;
                                  return (
                                    <button
                                      key={`gm-item-chg-${inventoryEntryId}`}
                                      disabled={isDead || outOfCharges}
                                      onClick={() => useChargedItemAbility(ch.id, inventoryEntryId)}
                                      className="w-full rpg-card px-2 py-1 rounded flex items-center justify-between text-[10px] border cursor-pointer disabled:opacity-40 hover:brightness-110"
                                      style={{
                                        borderColor: '#a855f7',
                                        backgroundColor: 'rgba(168, 85, 247, 0.14)',
                                      }}
                                    >
                                      <span className="truncate font-display font-bold text-purple-100">
                                        ⚡ {ab.name} ({itemDef.name})
                                      </span>
                                      <span className="font-mono-dice text-purple-200 shrink-0 ml-1">
                                        {maxCharges > 0 ? `${chargesRemaining}/${maxCharges}` : '∞'}
                                      </span>
                                    </button>
                                  );
                                }
                              )}

                              {getConditionGrantedAbilities(ch.activeConditionIds, campaign).map(
                                ({ ability: ab, condition: cond }) => {
                                  const cost = toEconomyCost(ab.actionType);
                                  const isSkillSel = Boolean(
                                    pendingAttackChoice &&
                                      pendingAttackChoice.attackerCharacterId === ch.id &&
                                      pendingAttackChoice.actionTitle === ab.name
                                  );
                                  return (
                                    <button
                                      key={`gm-cond-${cond.id}-${ab.id}`}
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
                                          costResourceId: ab.costResourceId,
                                          applyConditionId: ab.applyConditionId,
                                          conditionDurationRounds: ab.conditionDurationRounds,
                                          aoeShape: ab.aoeShape,
                                          aoeSizeMeters: ab.aoeSizeMeters,
                                          aoeColor: ab.aoeColor,
                                          aoePersistent: ab.aoePersistent,
                                        })
                                      }
                                      style={{ borderColor: cond.color || '#f59e0b' }}
                                      className={`w-full rpg-card px-2 py-1 rounded flex items-center justify-between text-[10px] cursor-pointer border disabled:opacity-40 ${
                                        isSkillSel ? 'ring-2 ring-amber-400 bg-amber-500/20' : ''
                                      }`}
                                    >
                                      <span className="truncate font-display font-bold text-amber-100">
                                        {cond.icon} {ab.name}
                                      </span>
                                      <span className="font-mono-dice text-amber-300 shrink-0 ml-1">
                                        {isSkillSel ? '✕ Cancelar' : cond.name}
                                      </span>
                                    </button>
                                  );
                                }
                              )}

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
                                        costResourceId: ab.costResourceId,
                                        applyConditionId: ab.applyConditionId,
                                        conditionDurationRounds: ab.conditionDurationRounds,
                                        aoeShape: ab.aoeShape,
                                        aoeSizeMeters: ab.aoeSizeMeters,
                                        aoeColor: ab.aoeColor,
                                        aoePersistent: ab.aoePersistent,
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
                              <span className="opacity-70 font-display uppercase text-[9px] truncate">
                                {npc.combatEnabled
                                  ? `PV ${npc.maxHp || 15} • CA ${npc.defense || 11}`
                                  : '⠿ Arraste p/ mapa'}
                              </span>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const nextHidden = !npc.hideNameFromPlayers;
                                    updateCampaign((prev) => ({
                                      ...prev,
                                      npcs: prev.npcs.map((n) =>
                                        n.id === npc.id
                                          ? { ...n, hideNameFromPlayers: nextHidden }
                                          : n
                                      ),
                                      maps: prev.maps.map((m) => ({
                                        ...m,
                                        tokens: m.tokens.map((t) =>
                                          t.type === 'npc' && t.referenceId === npc.id
                                            ? { ...t, hideNameFromPlayers: nextHidden }
                                            : t
                                        ),
                                      })),
                                    }));
                                  }}
                                  className={`px-1.5 py-0.5 rounded border font-display font-bold text-[9px] cursor-pointer ${
                                    npc.hideNameFromPlayers
                                      ? 'bg-purple-950/80 border-purple-400/60 text-purple-200'
                                      : 'rpg-card opacity-75 hover:opacity-100'
                                  }`}
                                  title={
                                    npc.hideNameFromPlayers
                                      ? "Nome oculto ('???') — clique para revelar aos jogadores"
                                      : "Clique para ocultar o nome deste NPC ('???') dos jogadores"
                                  }
                                >
                                  {npc.hideNameFromPlayers ? '???' : 'Nome'}
                                </button>
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
                                onClick={() =>
                                  applyDamage(
                                    mtok.id,
                                    5,
                                    false,
                                    undefined,
                                    undefined,
                                    undefined,
                                    undefined,
                                    false,
                                    { suppressExecution: true }
                                  )
                                }
                                className="px-1 rounded bg-red-950/85 border border-red-500/40 text-red-200 hover:bg-red-800 cursor-pointer"
                              >
                                -5
                              </button>
                              <button
                                onClick={() =>
                                  applyDamage(
                                    mtok.id,
                                    1,
                                    false,
                                    undefined,
                                    undefined,
                                    undefined,
                                    undefined,
                                    false,
                                    { suppressExecution: true }
                                  )
                                }
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
                          {(() => {
                            const nameHidden = isTokenNameHiddenFromPlayers(mtok, campaign);
                            return (
                              <button
                                type="button"
                                onClick={() =>
                                  updateCampaign((prev) => ({
                                    ...prev,
                                    maps: prev.maps.map((m) =>
                                      m.id === activeMap?.id
                                        ? {
                                            ...m,
                                            tokens: m.tokens.map((t) =>
                                              t.id === mtok.id
                                                ? { ...t, hideNameFromPlayers: !nameHidden }
                                                : t
                                            ),
                                          }
                                        : m
                                    ),
                                  }))
                                }
                                className={`px-1.5 py-1 rounded border font-display font-bold text-[9px] cursor-pointer ${
                                  nameHidden
                                    ? 'bg-purple-950/80 border-purple-400/60 text-purple-200'
                                    : 'rpg-card opacity-75 hover:opacity-100'
                                }`}
                                title={
                                  nameHidden
                                    ? "Nome oculto ('???') — clique para revelar"
                                    : "Ocultar nome ('???') para os jogadores"
                                }
                              >
                                ???
                              </button>
                            );
                          })()}
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
          MODE A: GM ANCHORED TACTICAL COMMAND DOCK (Direct 1-Click Monster/Hero Actions)
         ===================================================================== */}
      {role === 'gm' && (
        <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-30 max-w-[min(980px,calc(100vw-360px))] pointer-events-auto select-none">
          <OrnateFrame
            accentColor="#b89146"
            cornerSize={14}
            className="rpg-glass-panel rpg-grain rounded-lg px-3 py-2 flex items-center gap-2.5 overflow-visible"
          >
            {/* Left Trigger: Grupo Drawer */}
            <button
              type="button"
              onClick={() => setGmRosterCollapsed((v) => !v)}
              className={`h-10 px-2.5 rounded text-[13px] font-semibold flex items-center gap-1.5 cursor-pointer shrink-0 transition ${
                !gmRosterCollapsed ? 'rpg-btn-primary' : 'rpg-card'
              }`}
              title="Abrir/Fechar Grupo (Heróis, NPCs e Monstros)"
            >
              <Users className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Grupo</span>
              <span className="font-mono-dice text-[11px] opacity-80">
                {campaign.characters.length}
              </span>
            </button>

            <div className="w-px h-8 bg-[#b89146]/20 shrink-0" />

            {/* Selected Map Monster OR Hero OR NPC Inspector (or Compact Party Strip when idle) */}
            {gmInspectedMonster && gmInspectedToken ? (
              <div className="flex items-center gap-2.5 pr-2.5 border-r min-w-0 flex-1" style={{ borderColor: 'var(--border-hairline)' }}>
                <TokenPortrait
                  name={gmInspectedToken.name}
                  imageUrl={gmInspectedToken.imageUrl}
                  playerColor={gmInspectedToken.color}
                  frameStyle={gmInspectedToken.frameStyle || 'crimson'}
                  sizePx={42}
                  isDead={gmInspectedToken.hp <= 0}
                  iconHint={gmInspectedMonster.type}
                />

                <div className="min-w-[144px] max-w-[195px] shrink-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-display font-bold text-xs truncate text-[#ece4d5]">
                      {gmInspectedToken.name}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      {(() => {
                        const isMonNameHidden = isTokenNameHiddenFromPlayers(gmInspectedToken, campaign);
                        return (
                          <button
                            type="button"
                            onClick={() =>
                              updateCampaign((prev) => ({
                                ...prev,
                                maps: prev.maps.map((m) =>
                                  m.id !== activeMap?.id
                                    ? m
                                    : {
                                        ...m,
                                        tokens: m.tokens.map((t) =>
                                          t.id === gmInspectedToken.id
                                            ? { ...t, hideNameFromPlayers: !isMonNameHidden }
                                            : t
                                        ),
                                      }
                                ),
                              }))
                            }
                            className={`px-1 py-0.2 rounded border text-[9px] font-display font-bold cursor-pointer ${
                              isMonNameHidden
                                ? 'bg-purple-950/85 border-purple-400/70 text-purple-200'
                                : 'bg-[#090b10] border-white/20 text-[#a69b88] hover:border-purple-400/60'
                            }`}
                            title={
                              isMonNameHidden
                                ? "Nome oculto ('???') — clique para mostrar aos jogadores"
                                : "Ocultar nome ('???') para os jogadores"
                            }
                          >
                            ???
                          </button>
                        );
                      })()}
                      <span className="px-1.5 py-0.2 rounded bg-[#090b10] border border-[#b89146]/45 text-[10px] font-mono-dice font-bold text-[#d4ad5c]">
                        CA {gmInspectedToken.defense}
                      </span>
                    </div>
                  </div>

                  <div className="mt-1">
                    <SculptedHealthBar
                      hp={gmInspectedToken.hp}
                      maxHp={gmInspectedToken.maxHp}
                      variant="crimson"
                      heightClass="h-1.5"
                    />
                  </div>

                  <div className="flex items-center justify-between text-[10px] mt-1 font-mono-dice">
                    <span className="text-[#e07a7d] font-bold">
                      {gmInspectedToken.hp}/{gmInspectedToken.maxHp}
                    </span>
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() =>
                          applyDamage(
                            gmInspectedToken.id,
                            5,
                            false,
                            undefined,
                            undefined,
                            undefined,
                            undefined,
                            false,
                            { suppressExecution: true }
                          )
                        }
                        className="px-1 rounded bg-[#2d1012] border border-[#9e2427]/50 text-[#f0a5a8] hover:bg-[#42171a] cursor-pointer"
                        title="Causar 5 de dano"
                      >
                        -5
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          applyDamage(
                            gmInspectedToken.id,
                            1,
                            false,
                            undefined,
                            undefined,
                            undefined,
                            undefined,
                            false,
                            { suppressExecution: true }
                          )
                        }
                        className="px-1 rounded bg-[#240e10] border border-[#9e2427]/40 text-[#f0a5a8] hover:bg-[#42171a] cursor-pointer"
                        title="Causar 1 de dano"
                      >
                        -1
                      </button>
                      <button
                        type="button"
                        onClick={() => applyDamage(gmInspectedToken.id, 1, true)}
                        className="px-1 rounded bg-[#0f2419] border border-[#2f8556]/40 text-[#86d9a8] hover:bg-[#173826] cursor-pointer"
                        title="Curar 1 PV"
                      >
                        +1
                      </button>
                      <button
                        type="button"
                        onClick={() => applyDamage(gmInspectedToken.id, 5, true)}
                        className="px-1 rounded bg-[#132e20] border border-[#2f8556]/50 text-[#86d9a8] hover:bg-[#1b402c] cursor-pointer"
                        title="Curar 5 PV"
                      >
                        +5
                      </button>
                    </div>
                  </div>
                </div>

                {/* DIRECT 1-Click Inline Monster Attack Tiles (First 3 right on dock!) */}
                {gmInspectedMonster.attacks.length > 0 && (
                  <div className="flex items-center gap-1 min-w-0 overflow-x-auto">
                    {gmInspectedMonster.attacks.slice(0, 3).map((matk, idx) => {
                      const isTokenDead = gmInspectedToken.hp <= 0;
                      const isSel = Boolean(
                        pendingAttackChoice &&
                          pendingAttackChoice.attackerTokenId === gmInspectedToken.id &&
                          pendingAttackChoice.actionTitle === matk.name
                      );
                      return (
                        <button
                          key={`inline-matk-${idx}`}
                          type="button"
                          disabled={isTokenDead}
                          onClick={() => {
                            if (isSel) {
                              setPendingAttackChoice(null);
                              return;
                            }
                            setShowGmActions(false);
                            setPendingAttackChoice(
                              buildPendingAttackFromMonsterAttack({
                                token: gmInspectedToken,
                                attack: matk,
                                campaign,
                                diceSkin: 'blood',
                                frameFallback: 'crimson',
                              })
                            );
                          }}
                          className={`rpg-hotbar-slot h-10 px-2.5 rounded flex items-center gap-1.5 text-left shrink-0 cursor-pointer disabled:opacity-35 ${
                            isSel ? 'border-[#d4ad5c] bg-[#2a2112]' : ''
                          }`}
                          title={`${matk.name} • ${formatMonsterAttackSummary(matk, campaign)}${matk.damageType ? ` (${matk.damageType})` : ''}`}
                        >
                          <Swords className="w-3.5 h-3.5 text-[#d6575b] shrink-0" />
                          <div className="leading-tight">
                            <div className="text-[11px] font-display font-bold text-[#ece4d5] max-w-[92px] truncate">
                              {matk.name}
                            </div>
                            <div className="text-[9px] font-mono-dice text-[#a69b88]">
                              {isSel ? 'Cancelar' : formatMonsterAttackSummary(matk, campaign)}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Collapsible Full "Ações" Drawer for Monsters with >3 attacks or traits */}
                {(gmInspectedMonster.attacks.length > 3 || gmInspectedMonster.abilities.length > 0) && (
                  <div className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() => setShowGmActions((v) => !v)}
                      className={`h-10 px-2.5 rounded text-[11px] font-display font-semibold flex items-center gap-1 cursor-pointer transition ${
                        showGmActions ? 'rpg-btn-primary' : 'rpg-card'
                      }`}
                      title="Ver todos os ataques e traços da criatura"
                    >
                      <Search className="w-3.5 h-3.5" />
                      <span className="font-mono-dice text-[10px]">
                        +{Math.max(0, gmInspectedMonster.attacks.length - 3) + gmInspectedMonster.abilities.length}
                      </span>
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
                                    setPendingAttackChoice(
                                      buildPendingAttackFromMonsterAttack({
                                        token: gmInspectedToken,
                                        attack: matk,
                                        campaign,
                                        diceSkin: 'blood',
                                        frameFallback: 'crimson',
                                      })
                                    );
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
                                      {formatMonsterAttackSummary(matk, campaign)}
                                      {matk.damageType ? ` (${matk.damageType})` : ''}
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
                                <span className="font-semibold text-xs text-amber-200 truncate flex items-center gap-1.5">
                                  <Swords className="w-3.5 h-3.5 text-[#d4ad5c] shrink-0" />
                                  <span className="truncate">Ações de {gmInspectedChar.name}</span>
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
                                            isWeaponAttack: true,
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
                                            isWeaponAttack: true,
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
                                            costResourceId: ab.costResourceId,
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
                <div className="min-w-[144px] max-w-[195px] shrink-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-display font-bold text-xs truncate text-amber-100">
                      {gmInspectedToken.name}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      {(() => {
                        const isNpcNameHidden = isTokenNameHiddenFromPlayers(gmInspectedToken, campaign);
                        return (
                          <button
                            type="button"
                            onClick={() => {
                              const nextHidden = !isNpcNameHidden;
                              updateCampaign((prev) => ({
                                ...prev,
                                npcs: prev.npcs.map((n) =>
                                  n.id === gmInspectedNpc.id
                                    ? { ...n, hideNameFromPlayers: nextHidden }
                                    : n
                                ),
                                maps: prev.maps.map((m) => ({
                                  ...m,
                                  tokens: m.tokens.map((t) =>
                                    t.id === gmInspectedToken.id ||
                                    (t.type === 'npc' && t.referenceId === gmInspectedNpc.id)
                                      ? { ...t, hideNameFromPlayers: nextHidden }
                                      : t
                                  ),
                                })),
                              }));
                            }}
                            className={`px-1 py-0.2 rounded border text-[9px] font-display font-bold cursor-pointer ${
                              isNpcNameHidden
                                ? 'bg-purple-950/85 border-purple-400/70 text-purple-200'
                                : 'bg-black/70 border-white/20 text-[#a69b88] hover:border-purple-400/60'
                            }`}
                            title={
                              isNpcNameHidden
                                ? "Nome oculto ('???') — clique para mostrar aos jogadores"
                                : "Ocultar nome ('???') para os jogadores"
                            }
                          >
                            ???
                          </button>
                        );
                      })()}
                      <span className="px-1.5 py-0.2 rounded bg-black/70 border border-amber-400/50 text-[10px] font-display font-bold text-amber-300">
                        CA {gmInspectedToken.defense}
                      </span>
                    </div>
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
                          onClick={() =>
                            applyDamage(
                              gmInspectedToken.id,
                              5,
                              false,
                              undefined,
                              undefined,
                              undefined,
                              undefined,
                              false,
                              { suppressExecution: true }
                            )
                          }
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
                                    const pending = buildPendingAttackFromMonsterAttack({
                                      token: gmInspectedToken,
                                      attack: natk,
                                      campaign,
                                      diceSkin: 'gold',
                                      frameFallback: 'gold',
                                    });
                                    const isCondOnly = Boolean(!pending.damageType && pending.applyConditionId);
                                    const isSelfRng = Boolean(
                                      pending.range && pending.range.trim().toLowerCase().includes('pessoal')
                                    );
                                    if (isCondOnly && isSelfRng && !pending.aoeShape && pending.applyConditionId) {
                                      const condId = pending.applyConditionId;
                                      const condDef = campaign.compendium.conditions.find((c) => c.id === condId);
                                      const durRounds =
                                        pending.conditionDurationRounds && pending.conditionDurationRounds > 0
                                          ? pending.conditionDurationRounds
                                          : undefined;
                                      updateCampaign((prev) => ({
                                        ...prev,
                                        maps: prev.maps.map((m) =>
                                          m.id !== activeMap?.id
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
                                        combat: prev.combat.active
                                          ? {
                                              ...prev.combat,
                                              combatants: prev.combat.combatants.map((cb) => {
                                                if (cb.tokenId !== gmInspectedToken.id) return cb;
                                                const spentCb = consumeCombatantEconomy(cb, 'Padrão');
                                                if (!durRounds) return spentCb;
                                                const nextEff = {
                                                  id: `eff-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                                                  label: condDef?.name || natk.name,
                                                  conditionId: condId,
                                                  remainingRounds: durRounds,
                                                };
                                                return {
                                                  ...spentCb,
                                                  effects: [
                                                    ...(spentCb.effects || []).filter(
                                                      (e) => e.conditionId !== condId
                                                    ),
                                                    nextEff,
                                                  ],
                                                };
                                              }),
                                            }
                                          : prev.combat,
                                      }));
                                      pushCombatLog({
                                        category: 'condition',
                                        actorName: gmInspectedToken.name,
                                        actorKind: 'npc',
                                        actorColor: gmInspectedToken.color,
                                        summary: `ativou ${natk.name} (${condDef?.icon || ''} ${condDef?.name || 'Condição'}) em si mesmo${durRounds ? ` por ${durRounds} rodada(s)` : ''}`,
                                      });
                                      return;
                                    }
                                    setPendingAttackChoice(pending);
                                  }}
                                  className="rpg-card hover:border-amber-400 px-2.5 py-1.5 rounded-md flex items-center gap-1.5 cursor-pointer text-left disabled:opacity-35"
                                >
                                  <Swords className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                                  <div className="leading-tight">
                                    <div className="text-[11px] font-display font-bold text-amber-100">
                                      {natk.name}
                                    </div>
                                    <div className="text-[9px] font-mono-dice text-amber-300/90">
                                      {formatMonsterAttackSummary(natk, campaign)}
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
            ) : (
              /* Idle GM Dock: Compact Party Portrait Strip for 1-click Hero Selection */
              <div className="flex items-center gap-1.5 pr-2 border-r min-w-0 overflow-x-auto" style={{ borderColor: 'var(--border-hairline)' }}>
                {campaign.characters.length === 0 ? (
                  <span className="text-xs font-lore italic text-[#a69b88] px-2">
                    Clique em qualquer token no mapa para inspecionar e agir.
                  </span>
                ) : (
                  campaign.characters.slice(0, 6).map((ch) => {
                    const cStats = computeCharacterStats(ch, campaign);
                    const tok = activeMap?.tokens.find(
                      (t) => t.type === 'character' && t.referenceId === ch.id
                    );
                    return (
                      <button
                        key={ch.id}
                        type="button"
                        onClick={() => {
                          setActiveCharacterId(ch.id);
                          if (tok) setTargetTokenId(tok.id);
                        }}
                        className="rpg-hotbar-slot px-2 py-1 rounded flex items-center gap-2 cursor-pointer shrink-0"
                        title={`${ch.name} • PV ${ch.hp}/${cStats.maxHp} • CA ${cStats.defense}`}
                      >
                        <TokenPortrait
                          name={ch.name}
                          imageUrl={ch.portraitUrl}
                          playerColor={ch.playerColor || ch.tokenColor}
                          frameStyle={ch.tokenFrameStyle || 'gold'}
                          sizePx={26}
                          isDead={ch.hp <= 0}
                          iconHint={ch.classId}
                        />
                        <div className="w-16 text-left leading-tight">
                          <div className="text-[10px] font-display font-bold text-[#ece4d5] truncate">
                            {ch.name}
                          </div>
                          <div className="mt-0.5">
                            <SculptedHealthBar hp={ch.hp} maxHp={cStats.maxHp} heightClass="h-1" />
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            )}

            {/* Right: Open Sheets + Chronicle Drawer */}
            <div className="flex items-center gap-1.5 shrink-0">
              {(gmInspectedMonster || gmInspectedNpc || gmInspectedChar || campaign.characters.length > 0) && (
                <button
                  type="button"
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
                  className="rpg-card h-10 px-2.5 rounded text-[11px] font-display font-semibold flex items-center gap-1.5 cursor-pointer"
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
                  <BookOpen className="w-3.5 h-3.5 text-[#d4ad5c]" />
                  <span className="hidden md:inline">
                    {gmInspectedMonster || gmInspectedNpc || gmInspectedChar ? 'Ficha' : 'Fichas'}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={onToggleDiceDrawer}
                className={`relative h-10 px-2.5 rounded text-[11px] font-display font-semibold flex items-center gap-1.5 cursor-pointer transition ${
                  diceDrawerOpen ? 'rpg-btn-primary' : 'rpg-card'
                }`}
                title="Abrir/Fechar Crônica (Combate, Dados e Chat) — Tab"
              >
                <Dices className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Crônica</span>
                {unreadChatCount > 0 && !diceDrawerOpen && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded bg-[#6b3fa0] border border-[#d4ad5c]/60 text-white text-[9px] font-mono-dice font-bold flex items-center justify-center">
                    {unreadChatCount}
                  </span>
                )}
              </button>
            </div>
          </OrnateFrame>
        </div>
      )}

      {/* =====================================================================
          MODE B: PLAYER RELIQUARY & DIRECT BG3-STYLE TACTICAL HOTBAR
         ===================================================================== */}
      {role === 'player' && hero && stats && (
        <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-30 max-w-[min(1080px,calc(100vw-320px))] pointer-events-auto flex flex-col items-center gap-1.5 select-none">
          {/* Player Death's Door HUD Panel when hero is at 0 PV */}
          {hero.hp <= 0 && (() => {
            const ds = hero.deathSaves || { successes: 0, failures: 0 };
            const isHeroPermDead = Boolean(ds.dead || (ds.failures || 0) >= 3);
            const isHeroStab = !isHeroPermDead && Boolean(ds.stabilized || (ds.successes || 0) >= 3);
            return (
              <OrnateFrame
                accentColor="#9e2427"
                cornerSize={12}
                className="rpg-glass-panel rounded-lg px-4 py-2 flex flex-wrap items-center justify-center gap-3 animate-death-pulse"
              >
                <div className="flex items-center gap-2">
                  <Skull className="w-4 h-4 text-[#e07a7d] shrink-0" />
                  <div className="leading-tight">
                    <div className="font-display font-bold text-xs text-[#f2b3b5] uppercase tracking-wider">
                      {isHeroPermDead
                        ? 'Morto em Combate'
                        : isHeroStab
                          ? 'Estabilizado (0 PV)'
                          : 'Teste contra a Morte'}
                    </div>
                    <div className="text-[10px] text-[#a69b88]">
                      {isHeroPermDead
                        ? 'Aguarde o Mestre ou um milagre para reviver.'
                        : isHeroStab
                          ? '3 sucessos atingidos. Fora de perigo até receber dano ou cura.'
                          : ds.assistedBy
                            ? `Ajuda de ${ds.assistedBy}: próximo teste rola 2d20 (Vantagem).`
                            : '10+ Sucesso • 20 Levanta 1 PV • 1 = 2 Falhas'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-[11px]">
                  <div className="flex items-center gap-1">
                    <span className="text-[#74c997] font-semibold">Vida</span>
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className={`w-3 h-3 rounded-full border ${
                          i < (ds.successes || 0)
                            ? 'bg-[#2f8556] border-[#74c997]'
                            : 'border-[#2f8556]/40 bg-[#090b10]'
                        }`}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[#e07a7d] font-semibold">Morte</span>
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className={`w-3 h-3 rounded-full border ${
                          i < (ds.failures || 0)
                            ? 'bg-[#9e2427] border-[#e07a7d]'
                            : 'border-[#9e2427]/40 bg-[#090b10]'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                {!isHeroPermDead && !isHeroStab && (() => {
                  const notMyTurnInCombat = Boolean(
                    campaign.combat.active &&
                      heroCombatant &&
                      activeTurnCombatant &&
                      activeTurnCombatant.id !== heroCombatant.id
                  );
                  const alreadyRolledThisTurn = Boolean(
                    campaign.combat.active &&
                      heroCombatant &&
                      heroCombatant.actionAvailable === false
                  );
                  const locked = notMyTurnInCombat || alreadyRolledThisTurn;
                  return (
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() => rollDeathSave(hero.id)}
                      title={
                        notMyTurnInCombat
                          ? `Aguarde seu turno (${activeTurnCombatant?.name || 'outro combatente'} está agindo)`
                          : alreadyRolledThisTurn
                            ? 'Você já rolou seu Teste contra a Morte neste turno (Ação Padrão gasta). Encerre o turno.'
                            : campaign.combat.active
                              ? 'Rola 1x por turno gastando sua Ação Padrão'
                              : 'Rolar Teste contra a Morte (1d20)'
                      }
                      className="rpg-btn-crimson px-3 py-1.5 rounded text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                    >
                      <Dices className="w-3.5 h-3.5" />
                      <span>
                        {notMyTurnInCombat
                          ? 'Aguarde seu Turno'
                          : alreadyRolledThisTurn
                            ? 'Feito neste Turno'
                            : ds.assistedBy
                              ? 'Rolar Destino (2d20)'
                              : 'Teste de Morte'}
                      </span>
                    </button>
                  );
                })()}
              </OrnateFrame>
            );
          })()}

          {/* Ally Rescue Strip */}
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
              <div className="rpg-glass-panel rounded-md px-3 py-1.5 flex flex-wrap items-center justify-center gap-2 border-[#2f8556]/60">
                <span className="text-[10px] font-display font-bold uppercase tracking-wider text-[#86d9a8]">
                  Aliado Caído
                </span>
                {fallenAllies.map((ally) => (
                  <button
                    key={ally.id}
                    type="button"
                    onClick={() => assistDeathSave(hero.id, ally.id)}
                    className="rpg-btn-primary px-2.5 py-1 rounded text-[11px] flex items-center gap-1.5 cursor-pointer"
                    title={`Medicina CD 10 para estabilizar ou dar Vantagem a ${ally.name} (máx 1,5m em combate)`}
                  >
                    <Heart className="w-3.5 h-3.5" />
                    <span>Ajudar {ally.name}</span>
                  </button>
                ))}
              </div>
            );
          })()}

          {/* GM Next-Attack Advantage/Disadvantage Banner */}
          {hero.nextAttackRollOverride && (
            <div
              className={`rpg-glass-panel rounded-md px-3 py-1 text-[11px] font-display font-semibold flex items-center gap-1.5 border ${
                hero.nextAttackRollOverride === 'advantage'
                  ? 'border-[#2f8556]/70 text-[#9ae2b8] bg-[#0e2217]'
                  : 'border-[#9e2427]/70 text-[#f2b3b5] bg-[#260f11]'
              }`}
            >
              <Crown className="w-3.5 h-3.5 text-[#d4ad5c] shrink-0" />
              <span>
                {hero.nextAttackRollOverride === 'advantage'
                  ? 'Mestre concedeu Vantagem no próximo ataque'
                  : 'Mestre impôs Desvantagem no próximo ataque'}
              </span>
            </div>
          )}

          {/* MAIN BG3-STYLE RELIQUARY HOTBAR DOCK */}
          <OrnateFrame
            accentColor={heroColor}
            cornerSize={14}
            className="rpg-glass-panel rpg-grain rounded-lg px-3 py-2 flex items-center gap-3 overflow-visible"
          >
            {/* Left: Ruby HP Vial + Hero Medallion + Sapphire MP Vial */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Ruby HP Vial */}
              <div
                className={`relative w-11 h-11 rounded-full border overflow-hidden flex flex-col items-center justify-center ${
                  hero.hp <= 0
                    ? 'border-[#c52a2e] bg-[#25070a] animate-death-pulse'
                    : 'border-[#b89146]/65 bg-[#12080a] shadow-[inset_0_3px_8px_rgba(0,0,0,0.95)]'
                }`}
                title={`Pontos de Vida: ${hero.hp} / ${stats.maxHp}`}
              >
                {hero.hp <= 0 ? (
                  <>
                    <Skull className="w-4 h-4 text-[#e07a7d]" />
                    <span className="font-mono-dice font-bold text-[8px] text-[#f2b3b5] leading-none mt-0.5">
                      0 PV
                    </span>
                  </>
                ) : (
                  <>
                    <div
                      className="absolute bottom-0 inset-x-0 transition-all duration-500"
                      style={{
                        height: `${hpPct}%`,
                        background: 'linear-gradient(180deg, #b8292d 0%, #7a1417 65%, #3d080a 100%)',
                      }}
                    >
                      <div className="absolute inset-0 liquid-bar-shine" />
                    </div>
                    <span className="relative z-10 font-mono-dice font-extrabold text-xs text-[#f7f2e8] drop-shadow leading-none">
                      {hero.hp}
                    </span>
                    <span className="relative z-10 text-[8px] font-display text-[#e6d5c3] leading-none mt-0.5">
                      PV
                    </span>
                  </>
                )}
              </div>

              {/* Hero Medallion */}
              <button
                type="button"
                onClick={onOpenSheet}
                className="relative group cursor-pointer transition-transform hover:scale-105"
                title={`Abrir Ficha de ${hero.name} (C) • CA ${stats.defense}`}
              >
                <TokenPortrait
                  name={hero.name}
                  imageUrl={hero.portraitUrl}
                  playerColor={heroColor}
                  frameStyle={hero.tokenFrameStyle || 'gold'}
                  sizePx={48}
                  isDead={hero.hp <= 0}
                />
                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-1.5 py-0.2 rounded-[2px] bg-[#0a0c12] border border-[#b89146]/70 text-[9px] font-mono-dice font-bold text-[#e8c683] whitespace-nowrap">
                  CA {stats.defense}
                </span>
              </button>

              {/* Sapphire MP Vial */}
              <div
                className="relative w-11 h-11 rounded-full border border-[#b89146]/65 bg-[#080b14] overflow-hidden flex flex-col items-center justify-center shadow-[inset_0_3px_8px_rgba(0,0,0,0.95)]"
                title={`${campaign.settings.resourceName}: ${hero.mp} / ${stats.maxMp}`}
              >
                <div
                  className="absolute bottom-0 inset-x-0 transition-all duration-500"
                  style={{
                    height: `${mpPct}%`,
                    background: 'linear-gradient(180deg, #3b7cc0 0%, #1f4d85 65%, #102647 100%)',
                  }}
                >
                  <div className="absolute inset-0 liquid-bar-shine" />
                </div>
                <span className="relative z-10 font-mono-dice font-extrabold text-xs text-[#f7f2e8] drop-shadow leading-none">
                  {hero.mp}
                </span>
                <span className="relative z-10 text-[8px] font-display text-[#c8dff5] leading-none mt-0.5">
                  {campaign.settings.resourceShort}
                </span>
              </div>
            </div>

            {/* Center: BG3-Style Direct Hotbar (Category Tabs + Economy Strip + Direct 1-Click Slots) */}
            {(() => {
              const isDead = hero.hp <= 0;
              type DirectSlot = {
                key: string;
                category: 'attacks' | 'spells' | 'items';
                hotkey?: number;
                title: string;
                subtitle: string;
                tooltip: string;
                icon: React.ReactNode;
                imageUrl?: string;
                disabled: boolean;
                selected: boolean;
                accentColor?: string;
                onClick: () => void;
              };

              const allDirectSlots: DirectSlot[] = [
                ...quickAttacks.map((atk, idx): DirectSlot => {
                  const hotkey = idx + 1;
                  const spent = isActionSlotSpent('Padrão', { isWeaponAttack: true });
                  const isSel = Boolean(
                    pendingAttackChoice &&
                      pendingAttackChoice.attackerCharacterId === hero.id &&
                      pendingAttackChoice.actionTitle === atk.name
                  );
                  return {
                    key: `slot-atk-${atk.id}`,
                    category: 'attacks',
                    hotkey: hotkey <= 9 ? hotkey : undefined,
                    title: atk.name,
                    subtitle: isSel
                      ? 'Cancelar'
                      : formatFormulaForDisplay(atk.damageFormula, stats, hero),
                    tooltip: `${atk.name} • Atq ${formatFormulaForDisplay(atk.attackBonusFormula, stats, hero)} • Dano ${formatFormulaForDisplay(atk.damageFormula, stats, hero)} • ${atk.range}`,
                    icon: <Swords className="w-3.5 h-3.5 text-[#d6575b]" />,
                    imageUrl: atk.imageUrl,
                    disabled: (spent && !isSel) || isDead,
                    selected: isSel,
                    onClick: () =>
                      rollCharacterAction({
                        characterId: hero.id,
                        title: atk.name,
                        attackFormula: atk.attackBonusFormula,
                        damageFormula: atk.damageFormula,
                        damageType: atk.damageType,
                        range: atk.range,
                        actionCost: 'Padrão',
                        isWeaponAttack: true,
                      }),
                  };
                }),
                ...quickWeapons.map((wp, idx): DirectSlot => {
                  const hotkey = quickAttacks.length + idx + 1;
                  const spent = isActionSlotSpent('Padrão', { isWeaponAttack: true });
                  const isSel = Boolean(
                    pendingAttackChoice &&
                      pendingAttackChoice.attackerCharacterId === hero.id &&
                      pendingAttackChoice.actionTitle === wp.name
                  );
                  return {
                    key: `slot-wp-${wp.id}`,
                    category: 'attacks',
                    hotkey: hotkey <= 9 ? hotkey : undefined,
                    title: wp.name,
                    subtitle: isSel ? 'Cancelar' : wp.range || '1,5m',
                    tooltip: `${wp.name} • Alcance: ${wp.range || 'Corpo a Corpo (1,5m)'}`,
                    icon: <Swords className="w-3.5 h-3.5 text-[#d4ad5c]" />,
                    disabled: (spent && !isSel) || isDead,
                    selected: isSel,
                    onClick: () =>
                      rollCharacterAction({
                        characterId: hero.id,
                        title: wp.name,
                        attackFormula: wp.attackFormula,
                        damageFormula: wp.damageFormula,
                        damageType: wp.damageType,
                        range: wp.range,
                        actionCost: 'Padrão',
                        isWeaponAttack: true,
                        critRange: wp.critRange,
                        critMultiplier: wp.critMultiplier,
                      }),
                  };
                }),
                ...quickAbilities.map((ab, idx): DirectSlot => {
                  const hotkey = quickAttacks.length + quickWeapons.length + idx + 1;
                  const cost = toEconomyCost(ab.actionType);
                  const spent = isActionSlotSpent(cost);
                  const isSel = Boolean(
                    pendingAttackChoice &&
                      pendingAttackChoice.attackerCharacterId === hero.id &&
                      pendingAttackChoice.actionTitle === ab.name
                  );
                  return {
                    key: `slot-qab-${ab.id}`,
                    category: 'spells',
                    hotkey: hotkey <= 9 ? hotkey : undefined,
                    title: ab.name,
                    subtitle: isSel
                      ? 'Cancelar'
                      : ab.costMp > 0
                        ? `${ab.costMp} ${campaign.settings.resourceShort}`
                        : ab.actionType,
                    tooltip: `${ab.name} • ${ab.actionType} • ${ab.description}`,
                    icon: <Flame className="w-3.5 h-3.5 text-[#d4ad5c]" />,
                    disabled: (spent && !isSel) || isDead,
                    selected: isSel,
                    onClick: () =>
                      rollCharacterAction({
                        characterId: hero.id,
                        title: ab.name,
                        attackFormula: ab.attackFormula,
                        damageFormula: ab.damageFormula,
                        damageType: ab.damageType,
                        range: ab.range,
                        actionCost: cost,
                        costMp: ab.costMp,
                        costResourceId: ab.costResourceId,
                        isTeleport: ab.isTeleport,
                        teleportRequiresSight: ab.teleportRequiresSight,
                      }),
                  };
                }),
                ...compendiumAbilities.map((ab, idx): DirectSlot => {
                  const hotkey =
                    quickAttacks.length + quickWeapons.length + quickAbilities.length + idx + 1;
                  const cost = toEconomyCost(ab.actionType);
                  const spent = isActionSlotSpent(cost);
                  const maxUses = ab.maxUsesPerRest && ab.maxUsesPerRest > 0 ? ab.maxUsesPerRest : null;
                  const remUses =
                    maxUses !== null
                      ? typeof hero.abilityUsesRemaining?.[ab.id] === 'number'
                        ? Math.max(0, hero.abilityUsesRemaining[ab.id])
                        : maxUses
                      : null;
                  const outOfUses = remUses !== null && remUses <= 0;
                  const isSel = Boolean(
                    pendingAttackChoice &&
                      pendingAttackChoice.attackerCharacterId === hero.id &&
                      pendingAttackChoice.actionTitle === ab.name
                  );
                  return {
                    key: `slot-cab-${ab.id}`,
                    category: 'spells',
                    hotkey: hotkey <= 9 ? hotkey : undefined,
                    title: ab.name,
                    subtitle: isSel
                      ? 'Cancelar'
                      : remUses !== null
                        ? `${remUses}/${maxUses}`
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
                          : ab.actionType,
                    tooltip: `${ab.name} • ${ab.actionType} • ${ab.range} • ${ab.description}`,
                    icon: <Sparkles className="w-3.5 h-3.5 text-[#7cb4e8]" />,
                    disabled: (spent && !isSel) || isDead || (outOfUses && !isSel),
                    selected: isSel,
                    onClick: () =>
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
                        isTeleport: ab.isTeleport,
                        teleportRequiresSight: ab.teleportRequiresSight,
                        teleportAoeOrigin: ab.teleportAoeOrigin,
                      }),
                  };
                }),
                ...conditionGrantedAbilities.map(({ ability: ab, condition: cond }, idx): DirectSlot => {
                  const hotkey =
                    quickAttacks.length +
                    quickWeapons.length +
                    quickAbilities.length +
                    compendiumAbilities.length +
                    idx +
                    1;
                  const cost = toEconomyCost(ab.actionType);
                  const spent = isActionSlotSpent(cost);
                  const isSel = Boolean(
                    pendingAttackChoice &&
                      pendingAttackChoice.attackerCharacterId === hero.id &&
                      pendingAttackChoice.actionTitle === ab.name
                  );
                  return {
                    key: `slot-cond-${cond.id}-${ab.id}`,
                    category: 'spells',
                    hotkey: hotkey <= 9 ? hotkey : undefined,
                    title: ab.name,
                    subtitle: isSel ? 'Cancelar' : cond.name,
                    tooltip: `[${cond.name}] ${ab.name} • ${ab.actionType} • ${ab.description}`,
                    icon: <Zap className="w-3.5 h-3.5 text-[#e8c683]" />,
                    disabled: (spent && !isSel) || isDead,
                    selected: isSel,
                    accentColor: cond.color || '#d4ad5c',
                    onClick: () =>
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
                        isTeleport: ab.isTeleport,
                        teleportRequiresSight: ab.teleportRequiresSight,
                        teleportAoeOrigin: ab.teleportAoeOrigin,
                      }),
                  };
                }),
                ...chargedItemAbilities.map(
                  ({ inventoryEntryId, itemDef, ability: ab, maxCharges, chargesRemaining }): DirectSlot => {
                    const cost = toEconomyCost(ab.actionType);
                    const outOfCharges = maxCharges > 0 && chargesRemaining <= 0;
                    return {
                      key: `slot-chg-${inventoryEntryId}`,
                      category: 'items',
                      title: ab.name,
                      subtitle: maxCharges > 0 ? `${chargesRemaining}/${maxCharges}` : itemDef.name,
                      tooltip: `${itemDef.name}: ${ab.name}${maxCharges > 0 ? ` (${chargesRemaining}/${maxCharges} cargas)` : ''}`,
                      icon: <Zap className="w-3.5 h-3.5 text-[#c9a8f0]" />,
                      disabled: isActionSlotSpent(cost) || outOfCharges || isDead,
                      selected: false,
                      accentColor: '#9561ce',
                      onClick: () => useChargedItemAbility(hero.id, inventoryEntryId),
                    };
                  }
                ),
                ...quickConsumables.map(({ entry, def }): DirectSlot => ({
                  key: `slot-cons-${entry.id}`,
                  category: 'items',
                  title: def.name,
                  subtitle: `×${entry.quantity}`,
                  tooltip: `Consumível (Ação Bônus) • ${def.description}`,
                  icon: <FlaskConical className="w-3.5 h-3.5 text-[#6fd49a]" />,
                  disabled: isActionSlotSpent('Bônus') || isDead,
                  selected: false,
                  onClick: () => handleUseConsumable(entry.id, def.id),
                })),
              ];

              const canManeuverTurn = Boolean(
                campaign.combat.active &&
                  heroCombatant &&
                  activeTurnCombatant?.id === heroCombatant.id &&
                  !isDead
              );

              const q = actionSearch.trim().toLowerCase();
              const matchesSearch = (text: string) => !q || text.toLowerCase().includes(q);

              const attackSlots = allDirectSlots.filter(
                (s) => s.category === 'attacks' && matchesSearch(s.title)
              );
              const spellSlots = allDirectSlots.filter(
                (s) => s.category === 'spells' && matchesSearch(s.title)
              );
              const itemSlots = allDirectSlots.filter(
                (s) => s.category === 'items' && matchesSearch(s.title)
              );

              const isRogueCunning = hero.classId === 'classe-ladino' && hero.level >= 2;
              const activeMapCur =
                campaign.maps.find((m) => m.id === viewedMapId) ||
                campaign.maps.find((m) => m.id === campaign.activeMapId);
              const heroMapTok = activeMapCur?.tokens.find(
                (t) => t.type === 'character' && t.referenceId === hero.id
              );
              const isHeroGrappled = Boolean(hero.activeConditionIds?.includes('cond-agarrado'));
              const isHeroHoldingSomeone = Boolean(
                heroMapTok && activeMapCur?.tokens.some((t) => t.grappledByTokenId === heroMapTok.id)
              );
              const hasExtraAtkOrAction = Boolean(
                heroCombatant &&
                  (heroCombatant.actionAvailable !== false ||
                    (heroCombatant.extraAttacksRemaining ?? 0) > 0)
              );
              const maneuverSlots = [
                {
                  id: 'dash' as const,
                  label: 'Disparada',
                  sub: isRogueCunning ? 'Bônus • 2×Mov' : 'Ação • 2×Mov',
                  icon: <Footprints className="w-3.5 h-3.5 text-[#74c997]" />,
                  disabled:
                    !canManeuverTurn ||
                    (isRogueCunning
                      ? heroCombatant?.bonusActionAvailable === false
                      : heroCombatant?.actionAvailable === false),
                },
                {
                  id: 'disengage' as const,
                  label: heroCombatant?.disengaged ? 'Desengajado' : 'Desengajar',
                  sub: isRogueCunning ? 'Bônus' : 'Ação',
                  icon: <ShieldAlert className="w-3.5 h-3.5 text-[#8ec5f0]" />,
                  disabled:
                    !canManeuverTurn ||
                    (isRogueCunning
                      ? heroCombatant?.bonusActionAvailable === false
                      : heroCombatant?.actionAvailable === false),
                },
                {
                  id: 'dodge' as const,
                  label: heroCombatant?.dodging ? 'Esquivando' : 'Esquivar',
                  sub: 'Ação • Desv.',
                  icon: <Shield className="w-3.5 h-3.5 text-[#d4ad5c]" />,
                  disabled: !canManeuverTurn || heroCombatant?.actionAvailable === false,
                },
                {
                  id: 'grapple' as const,
                  label: 'Agarrar',
                  sub: 'Ação • 1,5m',
                  icon: <Swords className="w-3.5 h-3.5 text-[#f0a56b]" />,
                  disabled: !canManeuverTurn || !hasExtraAtkOrAction,
                },
                ...(isHeroGrappled
                  ? [
                      {
                        id: 'escape-grapple' as const,
                        label: 'Escapar',
                        sub: 'Ação • Soltar',
                        icon: <Zap className="w-3.5 h-3.5 text-amber-300" />,
                        disabled: !canManeuverTurn || heroCombatant?.actionAvailable === false,
                      },
                    ]
                  : []),
                ...(isHeroHoldingSomeone
                  ? [
                      {
                        id: 'release-grapple' as const,
                        label: 'Soltar Alvo',
                        sub: 'Livre',
                        icon: <ShieldAlert className="w-3.5 h-3.5 text-emerald-300" />,
                        disabled: !canManeuverTurn,
                      },
                    ]
                  : []),
                {
                  id: 'ready' as const,
                  label: heroCombatant?.readyAction ? 'Preparado' : 'Preparar',
                  sub: 'Ação → Reação',
                  icon: <Sparkles className="w-3.5 h-3.5 text-cyan-300" />,
                  disabled:
                    !canManeuverTurn ||
                    heroCombatant?.actionAvailable === false ||
                    Boolean(heroCombatant?.readyAction),
                },
                {
                  id: 'shove' as const,
                  label: 'Empurrar',
                  sub: 'Bônus • 1,5m',
                  icon: <Swords className="w-3.5 h-3.5 text-[#e07a7d]" />,
                  disabled: !canManeuverTurn || heroCombatant?.bonusActionAvailable === false,
                },
                {
                  id: 'hide' as const,
                  label: 'Esconder',
                  sub: isRogueCunning ? 'Bônus • Furt.' : 'Ação • Furt.',
                  icon: <EyeOff className="w-3.5 h-3.5 text-[#c9a8f0]" />,
                  disabled:
                    !canManeuverTurn ||
                    (isRogueCunning
                      ? heroCombatant?.bonusActionAvailable === false
                      : heroCombatant?.actionAvailable === false),
                },
                {
                  id: 'help' as const,
                  label: 'Ajudar',
                  sub: 'Ação • +Vant',
                  icon: <Heart className="w-3.5 h-3.5 text-[#86d9a8]" />,
                  disabled: !canManeuverTurn || heroCombatant?.actionAvailable === false,
                },
                {
                  id: 'jump' as const,
                  label: 'Saltar',
                  sub: 'Bônus • +3m',
                  icon: <Footprints className="w-3.5 h-3.5 text-[#d4ad5c]" />,
                  disabled: !canManeuverTurn || heroCombatant?.bonusActionAvailable === false,
                },
                ...(hero.classId === 'classe-guerreiro' && hero.level >= 2
                  ? [
                      {
                        id: 'action-surge' as const,
                        label: 'Surto de Ação',
                        sub:
                          hero.actionSurgeUsed || heroCombatant?.actionSurgeUsed
                            ? 'Usado (Descanso)'
                            : '+1 Ação',
                        icon: <Zap className="w-3.5 h-3.5 text-[#e07a7d]" />,
                        disabled:
                          !canManeuverTurn ||
                          Boolean(hero.actionSurgeUsed || heroCombatant?.actionSurgeUsed),
                      },
                    ]
                  : []),
              ].filter((m) => matchesSearch(m.label));

              const passiveItems = [
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
              ].filter((ab) => matchesSearch(ab.name));

              const totalActionsCount = allDirectSlots.length + passiveCustomAbilities.length + passiveCompendiumAbilities.length;
              const hasActiveArmedAction = Boolean(
                pendingAttackChoice && pendingAttackChoice.attackerCharacterId === hero.id
              );

              const renderActionSlotCard = (slot: DirectSlot) => (
                <button
                  key={`pop-${slot.key}`}
                  type="button"
                  disabled={slot.disabled}
                  onClick={() => {
                    setShowPlayerActions(false);
                    slot.onClick();
                  }}
                  style={
                    slot.accentColor && !slot.selected
                      ? { borderColor: `${slot.accentColor}88` }
                      : undefined
                  }
                  className={`rpg-hotbar-slot px-2.5 py-2 rounded-md flex items-center gap-2 text-left cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed ${
                    slot.selected ? 'border-[#d4ad5c] bg-[#2a2112]' : ''
                  }`}
                  title={slot.tooltip}
                >
                  {slot.hotkey && (
                    <span className="text-[10px] font-mono-dice font-semibold text-[#d4ad5c] bg-[#090b10] border border-[#b89146]/40 rounded-[3px] px-1.5 py-0.5 leading-none shrink-0">
                      {slot.hotkey}
                    </span>
                  )}
                  {slot.imageUrl ? (
                    <img
                      src={resolveAssetUrl(slot.imageUrl)}
                      alt={slot.title}
                      draggable={false}
                      className="w-6 h-6 rounded-[4px] object-cover border border-[#b89146]/45 shrink-0 pointer-events-none"
                    />
                  ) : (
                    <span className="shrink-0">{slot.icon}</span>
                  )}
                  <div className="leading-tight min-w-0">
                    <div className="text-[13px] font-semibold text-[#f1eadc] max-w-[180px] truncate">
                      {slot.title}
                    </div>
                    <div className="text-[10px] font-mono-dice text-[#a69b88] max-w-[180px] truncate mt-0.5">
                      {slot.subtitle}
                    </div>
                  </div>
                </button>
              );

              return (
                <div
                  ref={playerActionsRef}
                  className="relative flex items-center gap-2 pl-3 border-l"
                  style={{ borderColor: 'var(--border-hairline)' }}
                >
                  {/* Compact "Ações (N)" Trigger Button (matches GM Hero Actions style) */}
                  <button
                    type="button"
                    onClick={() => {
                      setShowRestMenu(false);
                      setShowConcMenu(false);
                      setShowPlayerActions((v) => !v);
                    }}
                    className={`h-10 px-3.5 rounded-md text-[13px] font-semibold flex items-center gap-2 cursor-pointer shrink-0 transition ${
                      showPlayerActions
                        ? 'rpg-btn-primary'
                        : hasActiveArmedAction
                          ? 'bg-[#2a2112] border border-[#d4ad5c] text-[#f2dba4]'
                          : 'rpg-card hover:border-[#d4ad5c]/65 text-[#ece4d5]'
                    }`}
                    title="Abrir barra de Ações, Magias, Itens e Manobras (atalhos 1–9)"
                  >
                    <Swords
                      className={`w-4 h-4 shrink-0 ${
                        showPlayerActions ? 'text-[#140e04]' : 'text-[#d4ad5c]'
                      }`}
                    />
                    <span>Ações</span>
                    <span
                      className={`font-mono-dice text-[11px] px-1.5 py-0.5 rounded-[3px] leading-none ${
                        showPlayerActions
                          ? 'bg-black/20 text-[#140e04]'
                          : 'bg-[#090b10] border border-[#b89146]/35 text-[#d4ad5c]'
                      }`}
                    >
                      {totalActionsCount}
                    </span>
                    <ChevronUp
                      className={`w-3.5 h-3.5 transition-transform duration-150 ${
                        showPlayerActions ? 'rotate-180 text-[#140e04]' : 'text-[#a69b88]'
                      }`}
                    />
                  </button>

                  {/* Compact Inline Combat Action Economy (A / B / R / Move) */}
                  {campaign.combat.active && heroCombatant && (() => {
                    const actsLeft = getCombatantActionsRemaining(heroCombatant);
                    const bonLeft = getCombatantBonusActionsRemaining(heroCombatant);
                    return (
                      <div className="flex items-center gap-1 text-[10px] font-mono-dice shrink-0">
                        <span
                          className={`px-1.5 py-1 rounded-[3px] border font-semibold ${
                            actsLeft > 0
                              ? 'bg-[#261f12] border-[#b89146]/55 text-[#e8c683]'
                              : 'bg-[#090b10] border-white/10 text-[#6c6457] line-through'
                          }`}
                          title={`Ação Padrão (${actsLeft})`}
                        >
                          A{actsLeft > 1 ? `×${actsLeft}` : ''}
                        </span>
                        <span
                          className={`px-1.5 py-1 rounded-[3px] border font-semibold ${
                            bonLeft > 0
                              ? 'bg-[#122230] border-[#3b72a8]/55 text-[#9bc5eb]'
                              : 'bg-[#090b10] border-white/10 text-[#6c6457] line-through'
                          }`}
                          title={`Ação Bônus (${bonLeft})`}
                        >
                          B{bonLeft > 1 ? `×${bonLeft}` : ''}
                        </span>
                        <span
                          className={`px-1.5 py-1 rounded-[3px] border font-semibold ${
                            heroCombatant.reactionAvailable !== false
                              ? 'bg-[#1f162d] border-[#9561ce]/50 text-[#cfb3f2]'
                              : 'bg-[#090b10] border-white/10 text-[#6c6457] line-through'
                          }`}
                          title="Reação"
                        >
                          R
                        </span>
                        <span
                          className="px-1.5 py-1 rounded-[3px] bg-[#0e2117] border border-[#2f8556]/45 text-[#74c997] font-semibold"
                          title="Deslocamento restante"
                        >
                          {heroCombatant.remainingMoveMeters ?? heroCombatant.speedMeters ?? 9}m
                        </span>
                        {(heroCombatant.extraAttacksRemaining ?? 0) > 0 && (
                          <span
                            className="px-1.5 py-1 rounded-[3px] bg-amber-950/85 border border-amber-400/65 text-amber-200 font-bold animate-pulse"
                            title={`Ataque Extra D&D 5e: +${heroCombatant.extraAttacksRemaining} ataque(s) de arma/Agarrar restante(s) nesta Ação`}
                          >
                            +{heroCombatant.extraAttacksRemaining} Atq
                          </span>
                        )}
                        {heroCombatant.readyAction && (
                          <span
                            className="px-1.5 py-1 rounded-[3px] bg-cyan-950/85 border border-cyan-400/70 text-cyan-200 font-bold"
                            title={
                              heroCombatant.readyAction.trigger
                                ? `Ação Preparada (Gatilho: "${heroCombatant.readyAction.trigger}") — clique em um ataque/habilidade Padrão fora do turno para usar sua Reação!`
                                : 'Ação Preparada — clique em um ataque/habilidade Padrão fora do turno para usar sua Reação!'
                            }
                          >
                            Preparado
                          </span>
                        )}
                      </div>
                    );
                  })()}

                  {/* Full Categorized "Ações" Popover (Attacks, Abilities, Items, Maneuvers, Passives) */}
                  {showPlayerActions && (
                    <div className="absolute bottom-[68px] left-1/2 -translate-x-1/2 w-[min(600px,92vw)] max-h-[60vh] overflow-y-auto rpg-glass-panel rounded-xl p-3.5 space-y-3 z-50 animate-popover">
                      <div
                        className="flex items-center justify-between gap-2 border-b pb-2"
                        style={{ borderColor: 'var(--border-hairline)' }}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Swords className="w-4 h-4 text-[#d4ad5c] shrink-0" />
                          <span className="font-semibold text-sm text-[#f2e8d5] truncate">
                            Ações de {hero.name}
                          </span>
                          <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono-dice text-[#8f8574] bg-[#090b10] border border-[#b89146]/25 rounded px-1.5 py-0.5">
                            Teclas 1–9
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowPlayerActions(false)}
                          className="rpg-card p-1 rounded cursor-pointer text-[#a69b88] hover:text-[#ece4d5]"
                          title="Fechar (Esc)"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-[#8f8574] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          value={actionSearch}
                          onChange={(e) => setActionSearch(e.target.value)}
                          placeholder="Pesquisar ataque, habilidade, item ou manobra..."
                          className="rpg-input w-full pl-8 py-1.5 text-xs"
                        />
                      </div>

                      {attackSlots.length > 0 && (
                        <div className="space-y-1.5">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#d4ad5c]">
                            Ataques &amp; Armas
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {attackSlots.map(renderActionSlotCard)}
                          </div>
                        </div>
                      )}

                      {spellSlots.length > 0 && (
                        <div className="space-y-1.5">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7cb4e8]">
                            Habilidades &amp; Magias
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {spellSlots.map(renderActionSlotCard)}
                          </div>
                        </div>
                      )}

                      {itemSlots.length > 0 && (
                        <div className="space-y-1.5">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#6fd49a]">
                            Itens &amp; Consumíveis
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {itemSlots.map(renderActionSlotCard)}
                          </div>
                        </div>
                      )}

                      {maneuverSlots.length > 0 && (
                        <div className="space-y-1.5 pt-1 border-t" style={{ borderColor: 'var(--border-hairline)' }}>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#a69b88]">
                              Manobras de Combate
                            </span>
                            {!canManeuverTurn && (
                              <span className="text-[10px] text-[#787062]">
                                Disponível no seu turno de combate
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {maneuverSlots.map((m) => (
                              <button
                                key={m.id}
                                type="button"
                                disabled={m.disabled}
                                onClick={() => {
                                  setShowPlayerActions(false);
                                  performCombatManeuver(m.id);
                                }}
                                className={`rpg-hotbar-slot px-2.5 py-1.5 rounded-md flex items-center gap-1.5 text-left cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed ${
                                  m.id === 'action-surge' ? 'border-[#9e2427]/60' : ''
                                }`}
                              >
                                {m.icon}
                                <div className="leading-tight">
                                  <div className="text-xs font-semibold text-[#ece4d5]">
                                    {m.label}
                                  </div>
                                  <div className="text-[10px] font-mono-dice text-[#8c8374]">
                                    {m.sub}
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {passiveItems.length > 0 && (
                        <div className="space-y-1.5 pt-1 border-t" style={{ borderColor: 'var(--border-hairline)' }}>
                          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#c9a8f0]">
                            Passivas
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {passiveItems.map((ab) => (
                              <div
                                key={`passive-${ab.id}`}
                                className="rpg-card px-2.5 py-1.5 rounded-md flex items-center gap-1.5 text-left border-[#9561ce]/35 bg-[#171124]"
                                title={`Passiva • ${ab.description}`}
                              >
                                <Shield className="w-3.5 h-3.5 text-[#c9a8f0] shrink-0" />
                                <div className="leading-tight">
                                  <div className="text-xs font-semibold max-w-[170px] truncate text-[#e3d2f8]">
                                    {ab.name}
                                  </div>
                                  <div className="text-[10px] font-mono-dice text-[#b589e6]">
                                    Passiva
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {attackSlots.length === 0 &&
                        spellSlots.length === 0 &&
                        itemSlots.length === 0 &&
                        maneuverSlots.length === 0 &&
                        passiveItems.length === 0 && (
                          <div className="py-4 text-center text-xs text-[#8f8574]">
                            Nenhuma ação encontrada para &ldquo;{actionSearch}&rdquo;.
                          </div>
                        )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Right: Inspiration + Concentration + Quick-Sheet + Request + Chronicle */}
            <div
              className="flex items-center gap-1.5 pl-2.5 border-l shrink-0"
              style={{ borderColor: 'var(--border-hairline)' }}
            >
              {/* Inspiration Star Trigger (Inline — zero floating neon pill) */}
              {(() => {
                const inspPts = getHeroInspirationPoints(hero);
                if (inspPts <= 0) return null;
                return (
                  <button
                    type="button"
                    onClick={() => spendHeroInspiration(hero.id, 'advantage')}
                    className="h-10 px-2 rounded bg-[#241d11] border border-[#d4ad5c]/65 text-[#e8c683] flex flex-col items-center justify-center cursor-pointer hover:brightness-110 transition"
                    title={`Inspiração Heroica (${inspPts}/3) — Clique para gastar 1 ponto e ganhar Vantagem`}
                  >
                    <Star className="w-3.5 h-3.5 fill-[#d4ad5c] text-[#d4ad5c]" />
                    <span className="text-[9px] font-mono-dice font-bold leading-none mt-0.5">
                      {inspPts}/3
                    </span>
                  </button>
                );
              })()}

              {/* Concentration Active Indicator */}
              {hero.concentratingSpell && (
                <button
                  type="button"
                  onClick={() => {
                    setCharacterConcentration(hero.id, null);
                    setShowConcMenu(false);
                  }}
                  className="h-10 px-2 rounded bg-[#1d142c] border border-[#9561ce]/65 text-[#d9c0f5] hover:border-[#9e2427]/70 flex items-center gap-1 text-[10px] font-display font-semibold cursor-pointer transition"
                  title={`Concentrando em: ${hero.concentratingSpell} (Clique para encerrar)`}
                >
                  <Sparkles className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden xl:inline max-w-[78px] truncate">
                    {hero.concentratingSpell}
                  </span>
                </button>
              )}

              {/* Favorite Skills & Saving Throws 1-Click 3D Roll Popover (Clearly Separated!) */}
              {stats && (() => {
                const attrOrder = ['for', 'des', 'con', 'int', 'sab', 'car'];
                const allSavingThrows = [...campaign.compendium.skills]
                  .filter((s) => s.isSavingThrow)
                  .sort(
                    (a, b) =>
                      (attrOrder.indexOf(a.defaultAttributeId) === -1
                        ? 99
                        : attrOrder.indexOf(a.defaultAttributeId)) -
                      (attrOrder.indexOf(b.defaultAttributeId) === -1
                        ? 99
                        : attrOrder.indexOf(b.defaultAttributeId))
                  );
                const regularSkills = campaign.compendium.skills.filter((s) => !s.isSavingThrow);
                const regularIdSet = new Set(regularSkills.map((s) => s.id));
                const favIds = (hero.favoriteSkillIds || []).filter((id) => regularIdSet.has(id));
                const q = skillSearch.trim().toLowerCase();
                const filteredSaves = allSavingThrows.filter(
                  (sk) =>
                    !q ||
                    sk.name.toLowerCase().includes(q) ||
                    (stats.skills[sk.id]?.attrShort || '').toLowerCase().includes(q)
                );
                const filteredRegularSkills = regularSkills.filter(
                  (sk) =>
                    !q ||
                    sk.name.toLowerCase().includes(q) ||
                    (stats.skills[sk.id]?.attrShort || '').toLowerCase().includes(q)
                );
                const quickSkillList =
                  q || managingFavSkills
                    ? filteredRegularSkills
                    : favIds.length > 0
                      ? favIds
                          .map((id) => regularSkills.find((s) => s.id === id))
                          .filter((s): s is NonNullable<typeof s> => Boolean(s))
                      : hero.trainedSkillIds
                          .map((id) => regularSkills.find((s) => s.id === id))
                          .filter((s): s is NonNullable<typeof s> => Boolean(s));

                return (
                  <div ref={playerSkillsRef} className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setShowRestMenu(false);
                        setShowPlayerActions(false);
                        setShowSkillsMenu((v) => !v);
                      }}
                      className={`relative h-10 px-2.5 rounded text-[13px] font-semibold flex items-center gap-1.5 cursor-pointer transition ${
                        showSkillsMenu ? 'rpg-btn-primary' : 'rpg-card'
                      }`}
                      title="Salvaguardas e Perícias em 1 clique (rolagem 3D imediata)"
                    >
                      <Star
                        className={`w-3.5 h-3.5 ${
                          favIds.length > 0 ? 'text-[#d4ad5c] fill-[#d4ad5c]/40' : 'text-[#d4ad5c]'
                        }`}
                      />
                      <span className="hidden lg:inline">Perícias</span>
                      {favIds.length > 0 && (
                        <span className="font-mono-dice text-[10px] opacity-85">
                          {favIds.length}
                        </span>
                      )}
                    </button>

                    {showSkillsMenu && (
                      <div className="absolute bottom-12 right-0 w-[330px] max-w-[calc(100vw-24px)] rpg-glass-panel rounded-lg p-2.5 space-y-2.5 text-xs z-50 animate-popover border border-[#d4ad5c]/35 shadow-2xl">
                        {/* Search Box across both Saving Throws & Skills */}
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 text-[#8f8574] absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            type="text"
                            value={skillSearch}
                            onChange={(e) => setSkillSearch(e.target.value)}
                            placeholder="Buscar salvaguarda ou perícia..."
                            className="rpg-input w-full pl-7 pr-7 py-1 text-[11px]"
                          />
                          {skillSearch && (
                            <button
                              type="button"
                              onClick={() => setSkillSearch('')}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8f8574] hover:text-white cursor-pointer"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>

                        {/* Section 1: Saving Throws (Salvaguardas) — always separated at the top! */}
                        {!managingFavSkills && filteredSaves.length > 0 && (
                          <div className="space-y-1.5 pb-2 border-b border-sky-400/20">
                            <div className="flex items-center gap-1 text-[10px] font-display uppercase tracking-[0.14em] text-sky-300 font-bold">
                              <Shield className="w-3 h-3" />
                              <span>Salvaguardas (Resistência)</span>
                            </div>
                            <div className="grid grid-cols-2 gap-1">
                              {filteredSaves.map((sk) => {
                                const comp = stats.skills[sk.id];
                                if (!comp) return null;
                                return (
                                  <button
                                    key={sk.id}
                                    type="button"
                                    onClick={() => {
                                      quickRollFormula(
                                        `Salvaguarda: ${comp.attrShort} • ${sk.name}`,
                                        `1d20 + ${comp.total}${comp.diceBonuses.length > 0 ? ` + ${comp.diceBonuses.join(' + ')}` : ''}`,
                                        hero.name
                                      );
                                      setShowSkillsMenu(false);
                                    }}
                                    className={`flex items-center justify-between gap-1 rounded px-2 py-1 border text-left cursor-pointer transition hover:border-sky-300/70 ${
                                      comp.trained
                                        ? 'bg-sky-950/55 border-sky-400/45 text-sky-100'
                                        : 'bg-black/35 border-white/10 text-[#d9d1c2]'
                                    }`}
                                    title={comp.breakdown.join(' | ')}
                                  >
                                    <span className="truncate text-[10px] font-medium">
                                      <span className="font-mono-dice text-[9px] font-bold text-sky-300 mr-1">
                                        {comp.attrShort}
                                      </span>
                                      {sk.name}
                                    </span>
                                    <span className="font-mono-dice text-[10px] font-bold text-sky-300 shrink-0">
                                      {formatSigned(comp.total)}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Section 2: Regular Skills (Perícias) */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-[10px] font-display uppercase tracking-[0.14em] text-[#d4ad5c] font-bold">
                              {managingFavSkills
                                ? `Favoritar Perícias (${favIds.length}/6)`
                                : favIds.length > 0
                                  ? `Perícias Favoritas (${favIds.length}/6)`
                                  : 'Perícias'}
                            </div>
                            <button
                              type="button"
                              onClick={() => setManagingFavSkills((v) => !v)}
                              className={`px-2 py-0.5 rounded text-[10px] font-display font-semibold border cursor-pointer transition flex items-center gap-1 ${
                                managingFavSkills
                                  ? 'bg-amber-950/80 border-amber-400/60 text-amber-200'
                                  : 'bg-black/40 border-white/15 text-[#c7bda9] hover:border-amber-400/45'
                              }`}
                              title="Escolher até 6 perícias favoritas para acesso em 1 clique"
                            >
                              <Star className="w-3 h-3" />
                              <span>{managingFavSkills ? 'Concluir' : 'Favoritar'}</span>
                            </button>
                          </div>

                          {!q && !managingFavSkills && favIds.length === 0 && (
                            <div className="text-[10px] text-[#9b9180] px-1">
                              Clique na estrela para fixar até 6 perícias favoritas aqui.
                            </div>
                          )}

                          <div className="space-y-1 max-h-[210px] overflow-y-auto pr-0.5">
                            {quickSkillList.map((sk) => {
                              const comp = stats.skills[sk.id];
                              if (!comp) return null;
                              const isFav = favIds.includes(sk.id);
                              const favFull = !isFav && favIds.length >= 6;
                              return (
                                <div
                                  key={sk.id}
                                  className={`flex items-center gap-1.5 rounded px-1.5 py-1 border transition ${
                                    isFav
                                      ? 'bg-[#241d11]/85 border-[#d4ad5c]/45'
                                      : comp.trained
                                        ? 'bg-amber-500/8 border-amber-500/25'
                                        : 'bg-black/30 border-white/10'
                                  }`}
                                >
                                  <button
                                    type="button"
                                    disabled={favFull}
                                    onClick={() => toggleHeroFavoriteSkill(sk.id)}
                                    className={`p-1 rounded cursor-pointer transition disabled:opacity-25 disabled:cursor-not-allowed shrink-0 ${
                                      isFav
                                        ? 'text-amber-300 hover:text-amber-200'
                                        : 'text-white/30 hover:text-amber-300/80'
                                    }`}
                                    title={
                                      isFav
                                        ? 'Remover das favoritas'
                                        : favFull
                                          ? 'Máximo de 6 perícias favoritas atingido'
                                          : 'Fixar como perícia favorita'
                                    }
                                  >
                                    <Star className={`w-3.5 h-3.5 ${isFav ? 'fill-amber-400' : ''}`} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      quickRollFormula(
                                        `Perícia: ${sk.name}`,
                                        `1d20 + ${comp.total}${comp.diceBonuses.length > 0 ? ` + ${comp.diceBonuses.join(' + ')}` : ''}`,
                                        hero.name
                                      );
                                      setShowSkillsMenu(false);
                                    }}
                                    className="flex-1 min-w-0 flex items-center justify-between gap-2 text-left cursor-pointer hover:text-[#f2dfb7]"
                                    title={comp.breakdown.join(' | ')}
                                  >
                                    <span className="truncate text-[11px] font-medium">
                                      {sk.name}{' '}
                                      <span className="text-[9px] text-[#9b9180]">
                                        ({comp.attrShort})
                                      </span>
                                    </span>
                                    <span className="font-mono-dice text-[11px] font-bold text-amber-300 shrink-0 flex items-center gap-1">
                                      <span>
                                        {formatSigned(comp.total)}
                                        {comp.diceBonuses.length > 0
                                          ? ` +${comp.diceBonuses.join('+')}`
                                          : ''}
                                      </span>
                                      <Dices className="w-3 h-3 opacity-70" />
                                    </span>
                                  </button>
                                </div>
                              );
                            })}
                            {quickSkillList.length === 0 && (
                              <div className="py-4 text-center text-[11px] text-[#8f8574]">
                                {q
                                  ? `Nenhuma perícia encontrada para "${skillSearch}".`
                                  : 'Clique em "Favoritar" acima para escolher suas perícias.'}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Cinematic Scene / Forms / Ultimate Cut-In Popover ("Cena") */}
              {(() => {
                const heroForms = hero.forms || [];
                const activeForm = heroForms.find((f) => f.id === hero.activeFormId);
                const isHeroInSpotlight =
                  rpSpotlight.left?.characterId === hero.id ||
                  rpSpotlight.right?.characterId === hero.id;
                const heroUltimates = [
                  ...orderedKnownAbilities
                    .filter((ab) => ab.isUltimate || ab.isDomainExpansion)
                    .map((ab) => ({
                      id: ab.id,
                      name: ab.name,
                      ultimateCatchphrase: ab.ultimateCatchphrase,
                      ultimateColor: ab.ultimateColor,
                      ultimateImageUrl: ab.ultimateImageUrl || ab.imageUrl,
                      ultimateStyle: ab.ultimateStyle,
                      ultimateSfxPreset: ab.ultimateSfxPreset,
                      ultimateSfxUrl: ab.ultimateSfxUrl,
                      isDomainExpansion: ab.isDomainExpansion,
                      domainTheme: ab.domainTheme,
                      domainDurationRounds: ab.domainDurationRounds,
                      domainMusicUrl: ab.domainMusicUrl,
                    })),
                  ...(hero.customAbilities || [])
                    .filter((ab) => ab.isUltimate || ab.isDomainExpansion)
                    .map((ab) => ({
                      id: ab.id,
                      name: ab.name,
                      ultimateCatchphrase: ab.ultimateCatchphrase,
                      ultimateColor: ab.ultimateColor,
                      ultimateImageUrl: ab.ultimateImageUrl || ab.imageUrl,
                      ultimateStyle: ab.ultimateStyle,
                      ultimateSfxPreset: ab.ultimateSfxPreset,
                      ultimateSfxUrl: ab.ultimateSfxUrl,
                      isDomainExpansion: ab.isDomainExpansion,
                      domainTheme: ab.domainTheme,
                      domainDurationRounds: ab.domainDurationRounds,
                      domainMusicUrl: ab.domainMusicUrl,
                    })),
                ];

                return (
                  <div ref={playerSceneRef} className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setShowRestMenu(false);
                        setShowPlayerActions(false);
                        setShowSkillsMenu(false);
                        setShowSceneMenu((v) => !v);
                      }}
                      className={`relative h-10 px-2.5 rounded text-[13px] font-semibold flex items-center gap-1.5 cursor-pointer transition ${
                        showSceneMenu || isHeroInSpotlight ? 'rpg-btn-primary' : 'rpg-card'
                      }`}
                      title="Em Cena (RP), Formas/Transformações e Cut-In de Técnica Suprema"
                    >
                      <Clapperboard className="w-3.5 h-3.5 text-[#d4ad5c]" />
                      <span className="hidden lg:inline">Cena</span>
                      {isHeroInSpotlight && (
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-sky-400 border border-[#090b10]" />
                      )}
                    </button>

                    {showSceneMenu && (
                      <div
                        className="absolute bottom-12 right-0 w-[335px] max-w-[calc(100vw-24px)] rpg-glass-panel rounded-lg p-2.5 space-y-2.5 text-xs z-50 animate-popover border border-[#d4ad5c]/40 shadow-2xl"
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <div className="grid grid-cols-3 gap-1">
                          {(
                            [
                              { id: 'rp', label: 'Em Cena' },
                              { id: 'forms', label: `Formas${heroForms.length ? ` (${heroForms.length})` : ''}` },
                              { id: 'cutin', label: 'Cut-In' },
                            ] as const
                          ).map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => setSceneMenuTab(t.id)}
                              className={`py-1 px-1.5 rounded text-[10px] font-display font-bold border cursor-pointer transition ${
                                sceneMenuTab === t.id
                                  ? 'bg-[#282012] border-[#d4ad5c]/75 text-[#f5e3be]'
                                  : 'bg-black/35 border-white/10 text-[#a69b88] hover:text-white'
                              }`}
                            >
                              {t.label}
                            </button>
                          ))}
                        </div>

                        {/* TAB 1: RP PORTRAIT SPOTLIGHT */}
                        {sceneMenuTab === 'rp' && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-1.5">
                              <span className="text-[10px] text-[#9b9180] font-display uppercase">
                                Posição
                              </span>
                              <div className="flex items-center gap-1">
                                {(['left', 'right'] as const).map((sl) => (
                                  <button
                                    key={sl}
                                    type="button"
                                    onClick={() => setRpSlot(sl)}
                                    className={`px-2 py-0.5 rounded text-[10px] border cursor-pointer ${
                                      rpSlot === sl
                                        ? 'bg-[#282012] border-[#d4ad5c]/70 text-[#f3dfb7]'
                                        : 'bg-black/35 border-white/15 text-[#a69b88]'
                                    }`}
                                  >
                                    {sl === 'left' ? 'Esquerda' : 'Direita'}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-1">
                              {(
                                [
                                  { id: 'normal', label: 'Normal' },
                                  { id: 'serious', label: 'Sério' },
                                  { id: 'intense', label: 'Intenso' },
                                  { id: 'whisper', label: 'Sussurro' },
                                  { id: 'epic', label: 'Épico' },
                                ] as const
                              ).map((tn) => (
                                <button
                                  key={tn.id}
                                  type="button"
                                  onClick={() => setRpTone(tn.id)}
                                  className={`px-2 py-0.5 rounded text-[10px] border cursor-pointer ${
                                    rpTone === tn.id
                                      ? 'bg-sky-950/80 border-sky-400/65 text-sky-200 font-semibold'
                                      : 'bg-black/35 border-white/15 text-[#a69b88]'
                                  }`}
                                >
                                  {tn.label}
                                </button>
                              ))}
                            </div>

                            <textarea
                              rows={2}
                              value={rpDialogue}
                              onChange={(e) => setRpDialogue(e.target.value)}
                              placeholder="Fala dramática em destaque (opcional — deixe vazio para só subir seu retrato)..."
                              className="rpg-input w-full text-xs p-2 resize-none"
                            />

                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  enterRpSpotlight({
                                    slot: rpSlot,
                                    speakerName: hero.name,
                                    subtitle: activeForm?.name,
                                    characterId: hero.id,
                                    portraitUrl: hero.portraitUrl,
                                    color: heroColor,
                                    frameStyle: hero.tokenFrameStyle,
                                    dialogue: rpDialogue.trim(),
                                    tone: rpTone,
                                  });
                                  setRpDialogue('');
                                  setShowSceneMenu(false);
                                }}
                                className="rpg-btn-primary flex-1 py-1.5 rounded text-xs font-display font-bold cursor-pointer"
                              >
                                Entrar em Cena
                              </button>
                              {isHeroInSpotlight && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (rpSpotlight.left?.characterId === hero.id) {
                                      clearRpSpotlight('left');
                                    }
                                    if (rpSpotlight.right?.characterId === hero.id) {
                                      clearRpSpotlight('right');
                                    }
                                  }}
                                  className="px-2.5 py-1.5 rounded bg-red-950/75 border border-red-400/50 text-red-200 text-[11px] font-display font-semibold cursor-pointer"
                                >
                                  Sair
                                </button>
                              )}
                            </div>
                          </div>
                        )}

                        {/* TAB 2: CHARACTER FORMS / TRANSFORMATIONS */}
                        {sceneMenuTab === 'forms' && (
                          <div className="space-y-2">
                            {heroForms.length === 0 ? (
                              <div className="py-3 text-center space-y-2">
                                <div className="text-[11px] text-[#a69b88]">
                                  Nenhuma forma alternativa criada ainda (ex: Modo Desperto, Ferido, Disfarce).
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setShowSceneMenu(false);
                                    onOpenSheet();
                                  }}
                                  className="rpg-btn-primary px-3 py-1.5 rounded text-[11px] font-display font-bold cursor-pointer"
                                >
                                  Configurar na Ficha (Aba Bio)
                                </button>
                              </div>
                            ) : (
                              <div className="space-y-1.5 max-h-[240px] overflow-y-auto pr-0.5">
                                {heroForms.map((fm) => {
                                  const isAct = hero.activeFormId === fm.id;
                                  return (
                                    <button
                                      key={fm.id}
                                      type="button"
                                      onClick={() => {
                                        switchCharacterForm(hero.id, fm.id);
                                        setShowSceneMenu(false);
                                      }}
                                      className={`w-full p-1.5 rounded-md border flex items-center gap-2.5 text-left cursor-pointer transition ${
                                        isAct
                                          ? 'bg-[#282012] border-[#d4ad5c]/80'
                                          : 'bg-black/35 border-white/10 hover:border-[#d4ad5c]/45'
                                      }`}
                                    >
                                      <TokenPortrait
                                        name={fm.name}
                                        imageUrl={fm.portraitUrl || hero.portraitUrl}
                                        playerColor={fm.tokenColor || heroColor}
                                        frameStyle={fm.frameStyle || hero.tokenFrameStyle || 'gold'}
                                        sizePx={34}
                                      />
                                      <div className="flex-1 min-w-0">
                                        <div className="text-xs font-display font-bold text-[#f2e8d5] truncate">
                                          {fm.name}
                                        </div>
                                        <div className="text-[10px] text-[#9b9180] truncate">
                                          {[
                                            fm.bonusAc ? `${fm.bonusAc > 0 ? '+' : ''}${fm.bonusAc} CA` : '',
                                            fm.bonusSpeed
                                              ? `${fm.bonusSpeed > 0 ? '+' : ''}${fm.bonusSpeed}m`
                                              : '',
                                            fm.catchphrase ? `"${fm.catchphrase}"` : '',
                                          ]
                                            .filter(Boolean)
                                            .join(' • ') || 'Visual / Retrato'}
                                        </div>
                                      </div>
                                      {isAct && (
                                        <span className="px-1.5 py-0.5 rounded bg-emerald-950/80 border border-emerald-400/55 text-emerald-200 text-[9px] font-display font-bold shrink-0">
                                          Ativa
                                        </span>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}

                        {/* TAB 3: QUICK ULTIMATE CUT-IN & DOMAIN EXPANSION */}
                        {sceneMenuTab === 'cutin' && (
                          <div className="space-y-2">
                            {heroUltimates.length > 0 && (
                              <div className="space-y-1">
                                <div className="text-[9px] uppercase tracking-wider font-display text-[#d4ad5c]">
                                  Suas Técnicas Supremas
                                </div>
                                {heroUltimates.map((ab) => (
                                  <button
                                    key={ab.id}
                                    type="button"
                                    onClick={() => {
                                      triggerUltimateCutIn({
                                        actorName: hero.name,
                                        techniqueName: ab.name,
                                        catchphrase: ab.ultimateCatchphrase,
                                        color: ab.ultimateColor || heroColor,
                                        portraitUrl: ab.ultimateImageUrl || hero.portraitUrl,
                                        style: ab.ultimateStyle,
                                        sfxPreset: ab.ultimateSfxPreset,
                                        sfxUrl: ab.ultimateSfxUrl,
                                        activateDomain: Boolean(ab.isDomainExpansion),
                                        domainTheme: ab.domainTheme || 'sonic',
                                        domainDurationRounds: ab.domainDurationRounds,
                                        domainMusicUrl: ab.domainMusicUrl,
                                        domainMapId: activeMap?.id,
                                        casterCharacterId: hero.id,
                                      });
                                      setShowSceneMenu(false);
                                    }}
                                    className="w-full px-2 py-1.5 rounded bg-[#161b29] hover:bg-[#1e263b] border border-sky-400/45 text-left flex items-center justify-between gap-2 cursor-pointer"
                                  >
                                    <span className="text-[11px] font-display font-bold text-sky-100 truncate">
                                      {ab.name}
                                    </span>
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-black/50 text-sky-300 shrink-0">
                                      {ab.isDomainExpansion ? 'Domínio' : 'Cut-In'}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            )}

                            <div className="space-y-1.5 pt-1 border-t border-white/10">
                              <div className="text-[9px] uppercase tracking-wider font-display text-[#9b9180]">
                                Disparar Cut-In Livre
                              </div>
                              <input
                                type="text"
                                value={quickCutInName}
                                onChange={(e) => setQuickCutInName(e.target.value)}
                                placeholder="Nome da Técnica / Domínio..."
                                className="rpg-input w-full py-1 px-2 text-xs"
                              />
                              <input
                                type="text"
                                value={quickCutInPhrase}
                                onChange={(e) => setQuickCutInPhrase(e.target.value)}
                                placeholder="Frase de impacto (opcional)..."
                                className="rpg-input w-full py-1 px-2 text-xs"
                              />
                              <div className="grid grid-cols-2 gap-1.5">
                                <select
                                  value={quickCutInStyle}
                                  onChange={(e) =>
                                    setQuickCutInStyle(e.target.value as CutInStylePreset)
                                  }
                                  className="rpg-input py-1 text-[10px]"
                                >
                                  {CUT_IN_STYLE_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value} className="bg-[#11131b]">
                                      Estilo: {opt.shortLabel}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  value={quickCutInSfx}
                                  onChange={(e) =>
                                    setQuickCutInSfx(e.target.value as UltimateSfxPreset)
                                  }
                                  className="rpg-input py-1 text-[10px]"
                                >
                                  {ULTIMATE_SFX_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value} className="bg-[#11131b]">
                                      Som: {opt.shortLabel}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1">
                                  {['#38bdf8', '#a855f7', '#ef4444', '#f59e0b', '#10b981', '#000000'].map((col) => (
                                    <button
                                      key={col}
                                      type="button"
                                      onClick={() => setQuickCutInColor(col)}
                                      className={`w-4 h-4 rounded-full border cursor-pointer ${
                                        quickCutInColor === col
                                          ? 'border-white scale-115'
                                          : col === '#000000'
                                            ? 'border-white/40 opacity-85'
                                            : 'border-transparent opacity-70'
                                      }`}
                                      style={{ backgroundColor: col }}
                                      title={col === '#000000' ? 'Abissal (Preto + Prata)' : col}
                                    />
                                  ))}
                                </div>
                                <label className="flex items-center gap-1 text-[10px] text-[#d5cbb9] cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={quickCutInDomain}
                                    onChange={(e) => setQuickCutInDomain(e.target.checked)}
                                    className="accent-sky-400 cursor-pointer"
                                  />
                                  <span>Expandir Domínio</span>
                                </label>
                              </div>
                              {quickCutInDomain && (
                                <select
                                  value={quickCutInTheme}
                                  onChange={(e) =>
                                    setQuickCutInTheme(
                                      e.target.value as 'sonic' | 'void' | 'crimson' | 'frost' | 'solar' | 'emerald'
                                    )
                                  }
                                  className="rpg-input w-full py-1 text-[11px]"
                                >
                                  <option value="sonic" className="bg-[#11131b]">Tema: Sônico / Azul Elétrico</option>
                                  <option value="void" className="bg-[#11131b]">Tema: Vazio / Violeta Arcano</option>
                                  <option value="crimson" className="bg-[#11131b]">Tema: Eclipse Carmesim</option>
                                  <option value="frost" className="bg-[#11131b]">Tema: Domínio Glacial</option>
                                  <option value="solar" className="bg-[#11131b]">Tema: Santuário Solar</option>
                                  <option value="emerald" className="bg-[#11131b]">Tema: Névoa Esmeralda</option>
                                </select>
                              )}
                              <button
                                type="button"
                                disabled={!quickCutInName.trim()}
                                onClick={() => {
                                  triggerUltimateCutIn({
                                    actorName: hero.name,
                                    techniqueName: quickCutInName.trim(),
                                    catchphrase: quickCutInPhrase.trim() || undefined,
                                    color: quickCutInColor,
                                    portraitUrl: hero.portraitUrl,
                                    style: quickCutInStyle,
                                    sfxPreset: quickCutInSfx,
                                    activateDomain: quickCutInDomain,
                                    domainTheme: quickCutInTheme,
                                    domainMapId: activeMap?.id,
                                    casterCharacterId: hero.id,
                                  });
                                  setQuickCutInName('');
                                  setQuickCutInPhrase('');
                                  setShowSceneMenu(false);
                                }}
                                className="rpg-btn-primary w-full py-1.5 rounded text-xs font-display font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40"
                              >
                                <Sparkles className="w-3.5 h-3.5" />
                                <span>{quickCutInDomain ? 'Expandir Domínio!' : 'Disparar Cut-In!'}</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Private Player Multi-Tab Notebook Toggle (100% Local & Private — ONLY the player sees it) */}
              <button
                type="button"
                onClick={() => setShowPrivateNotes((v) => !v)}
                className={`relative h-10 px-2.5 rounded text-[13px] font-semibold flex items-center gap-1.5 cursor-pointer transition ${
                  showPrivateNotes ? 'rpg-btn-primary' : 'rpg-card'
                }`}
                title="Caderno de Anotações Privado (múltiplas abas — salvo apenas no seu PC, só você vê)"
              >
                <BookOpen className="w-3.5 h-3.5 text-[#d4ad5c]" />
                <span className="hidden lg:inline">Notas</span>
                {privateNoteTabs.length > 1 && (
                  <span className="font-mono-dice text-[10px] opacity-80">
                    {privateNoteTabs.length}
                  </span>
                )}
              </button>

              {/* Toggle Movable Player Quick-Sheet ("Resumo") & Party ("Grupo") */}
              <button
                type="button"
                onClick={() => togglePlayerDrawerTab('sheet')}
                className={`relative h-10 px-2.5 rounded text-[13px] font-semibold flex items-center gap-1.5 cursor-pointer transition ${
                  !playerSheetCollapsed && playerDrawerTab === 'sheet' ? 'rpg-btn-primary' : 'rpg-card'
                }`}
                title="Resumo rápido arrastável: Atributos, Perícias, Cargas e Notas"
              >
                <User className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">Resumo</span>
                {(hero.unspentAttributePoints || 0) > 0 && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#3ea66b] border border-[#090b10]" />
                )}
              </button>

              <button
                type="button"
                onClick={() => togglePlayerDrawerTab('party')}
                className={`relative h-10 px-2.5 rounded text-[13px] font-semibold flex items-center gap-1.5 cursor-pointer transition ${
                  !playerSheetCollapsed && playerDrawerTab === 'party' ? 'rpg-btn-primary' : 'rpg-card'
                }`}
                title="Ver Grupo e Aliados da campanha"
              >
                <Users className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">Grupo</span>
                <span className="font-mono-dice text-[10px] opacity-80">
                  {campaign.characters.length}
                </span>
              </button>

              {/* Request Rest / Heal Menu */}
              <div ref={playerRestRef} className="relative">
                <button
                  type="button"
                  disabled={hero.hp <= 0}
                  onClick={() => {
                    setShowConcMenu(false);
                    setShowRestMenu((v) => !v);
                  }}
                  className="rpg-card h-10 px-2 rounded text-[11px] font-display font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-35"
                  title="Pedir Descanso ou Cura ao Mestre"
                >
                  <Moon className="w-3.5 h-3.5 text-[#d4ad5c]" />
                </button>

                {showRestMenu && (
                  <div className="absolute bottom-12 right-0 w-52 rpg-glass-panel rounded-lg p-2 space-y-1.5 text-xs z-50 animate-popover">
                    <div className="text-[10px] font-display uppercase tracking-[0.14em] text-[#8c8374] px-1.5">
                      Solicitar ao Mestre
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        sendPlayerRequest('short-rest', 'Descanso Curto');
                        setShowRestMenu(false);
                      }}
                      className="w-full text-left px-2.5 py-2 rounded rpg-card flex items-center gap-2 cursor-pointer"
                    >
                      <Coffee className="w-3.5 h-3.5 text-[#d4ad5c]" />
                      <span>Descanso Curto</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        sendPlayerRequest('long-rest', 'Descanso Longo');
                        setShowRestMenu(false);
                      }}
                      className="w-full text-left px-2.5 py-2 rounded rpg-card flex items-center gap-2 cursor-pointer"
                    >
                      <Moon className="w-3.5 h-3.5 text-[#7cb4e8]" />
                      <span>Descanso Longo</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        sendPlayerRequest('heal-mp', 'Cura / Restaurar Vitais');
                        setShowRestMenu(false);
                      }}
                      className="w-full text-left px-2.5 py-2 rounded rpg-card flex items-center gap-2 cursor-pointer"
                    >
                      <Heart className="w-3.5 h-3.5 text-[#6fd49a]" />
                      <span>Cura / Recurso</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Chronicle Drawer Trigger */}
              <button
                type="button"
                onClick={onToggleDiceDrawer}
                className={`relative h-10 px-2.5 rounded text-[11px] font-display font-semibold flex items-center gap-1 cursor-pointer transition ${
                  diceDrawerOpen ? 'rpg-btn-primary' : 'rpg-card'
                }`}
                title="Abrir/Fechar Crônica (Combate, Dados e Chat) — Tab"
              >
                <Dices className="w-3.5 h-3.5" />
                {unreadChatCount > 0 && !diceDrawerOpen && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded bg-[#6b3fa0] border border-[#d4ad5c]/60 text-white text-[9px] font-mono-dice font-bold flex items-center justify-center">
                    {unreadChatCount}
                  </span>
                )}
              </button>
            </div>
          </OrnateFrame>
        </div>
      )}

      {/* =========================================================
          PLAYER DRAGGABLE QUICK-SHEET & PARTY DRAWER ("Resumo" & "Grupo")
         ========================================================= */}
      {role === 'player' && hero && stats && !playerSheetCollapsed && (
        <DraggablePanel
          storageKey="player-mini-sheet"
          className="fixed left-[64px] top-[58px] bottom-[94px] z-25 pointer-events-none flex items-start"
        >
          <OrnateFrame
            accentColor="#b89146"
            cornerSize={12}
            className="pointer-events-auto w-[280px] max-h-full overflow-y-auto rpg-glass-panel rpg-grain rounded-lg p-3 space-y-2.5 text-xs animate-ui-enter"
          >
            <div
              className="flex items-center justify-between gap-2 border-b pb-2"
              style={{ borderColor: 'var(--border-hairline)' }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <DragGripBadge />
                <TokenPortrait
                  name={hero.name}
                  imageUrl={hero.portraitUrl}
                  playerColor={hero.playerColor || '#d4ad5c'}
                  frameStyle={hero.tokenFrameStyle || 'gold'}
                  sizePx={32}
                  isDead={hero.hp <= 0}
                />
                <div className="min-w-0">
                  <div className="font-semibold text-[13px] text-[#ece4d5] truncate">
                    {playerDrawerTab === 'party' ? 'Grupo da Campanha' : hero.name}
                  </div>
                  <div className="text-[11px] text-[#a69b88] truncate">
                    {playerDrawerTab === 'party'
                      ? `${campaign.characters.length} herói(s) na mesa`
                      : `Nv ${hero.level} • ${
                          campaign.compendium.classes.find((c) => c.id === hero.classId)?.name || 'Herói'
                        }`}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPlayerSheetCollapsed(true)}
                className="rpg-card p-1 rounded cursor-pointer shrink-0 text-[#a69b88] hover:text-[#ece4d5]"
                title="Fechar painel"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* 2-Tab Switcher: Meu Herói vs Grupo */}
            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={() => setPlayerDrawerTab('sheet')}
                className={`py-1 px-2 rounded text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition ${
                  playerDrawerTab === 'sheet' ? 'rpg-btn-primary' : 'rpg-card text-[#b8ae9b]'
                }`}
              >
                <User className="w-3.5 h-3.5" />
                <span>Meu Herói</span>
              </button>
              <button
                type="button"
                onClick={() => setPlayerDrawerTab('party')}
                className={`py-1 px-2 rounded text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition ${
                  playerDrawerTab === 'party' ? 'rpg-btn-primary' : 'rpg-card text-[#b8ae9b]'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Grupo ({campaign.characters.length})</span>
              </button>
            </div>

            {playerDrawerTab === 'party' ? (
              <div className="space-y-2">
                {campaign.characters.map((ally) => {
                  const allyStats = computeCharacterStats(ally, campaign);
                  const allyClass =
                    campaign.compendium.classes.find((c) => c.id === ally.classId)?.name || 'Herói';
                  const allyTok = activeMap?.tokens.find(
                    (t) => t.type === 'character' && t.referenceId === ally.id
                  );
                  const isMe = ally.id === hero.id;
                  const canAssistAlly =
                    !isMe &&
                    ally.hp <= 0 &&
                    hero.hp > 0 &&
                    !ally.deathSaves?.dead &&
                    (ally.deathSaves?.failures || 0) < 3 &&
                    !ally.deathSaves?.stabilized;
                  return (
                    <div
                      key={ally.id}
                      className={`rpg-card rounded-md p-2.5 space-y-1.5 ${
                        isMe ? 'border-[#d4ad5c]/55' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <TokenPortrait
                          name={ally.name}
                          imageUrl={ally.portraitUrl}
                          playerColor={ally.playerColor || ally.tokenColor || '#d4ad5c'}
                          frameStyle={ally.tokenFrameStyle || 'gold'}
                          sizePx={34}
                          isDead={ally.hp <= 0}
                        />
                        <div className="min-w-0 flex-1 leading-tight">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-[13px] text-[#f0e7d8] truncate">
                              {ally.name}
                            </span>
                            {isMe && (
                              <span className="px-1.5 py-0.2 rounded bg-[#2a2112] border border-[#d4ad5c]/50 text-[10px] text-[#e8c683] shrink-0">
                                Você
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-[#a69b88] truncate">
                            Nv {ally.level} • {allyClass}
                            {ally.playerName ? ` • ${ally.playerName}` : ''}
                          </div>
                        </div>
                        <span className="font-mono-dice text-[10px] px-1.5 py-0.5 rounded bg-[#090b10] border border-[#b89146]/40 text-[#e8c683] shrink-0">
                          CA {allyStats.defense}
                        </span>
                      </div>

                      <div className="space-y-0.5">
                        <div className="flex items-center justify-between text-[10px] font-mono-dice">
                          <span className={ally.hp <= 0 ? 'text-[#e07a7d] font-bold' : 'text-[#d9c9b6]'}>
                            {ally.hp <= 0
                              ? ally.deathSaves?.dead
                                ? 'Morto'
                                : ally.deathSaves?.stabilized
                                  ? 'Estabilizado (0 PV)'
                                  : 'Caído (0 PV)'
                              : `PV ${ally.hp}/${allyStats.maxHp}`}
                          </span>
                          <span className="text-[#8fc2ef]">
                            {campaign.settings.resourceShort} {ally.mp}/{allyStats.maxMp}
                          </span>
                        </div>
                        <SculptedHealthBar
                          hp={ally.hp}
                          maxHp={allyStats.maxHp}
                          variant={ally.hp <= 0 ? 'crimson' : 'vital'}
                          heightClass="h-1.5"
                        />
                      </div>

                      {(ally.concentratingSpell || (ally.activeConditionIds || []).length > 0) && (
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {ally.concentratingSpell && (
                            <span className="px-1.5 py-0.5 rounded bg-[#1d142c] border border-[#9561ce]/55 text-[#d9c0f5] text-[10px]">
                              Conc: {ally.concentratingSpell}
                            </span>
                          )}
                          {(ally.activeConditionIds || []).map((cid) => {
                            const cond = campaign.compendium.conditions.find((c) => c.id === cid);
                            if (!cond) return null;
                            return (
                              <span
                                key={cid}
                                className="px-1.5 py-0.5 rounded bg-black/50 border text-[10px]"
                                style={{ borderColor: cond.color, color: cond.color }}
                              >
                                {cond.name}
                              </span>
                            );
                          })}
                        </div>
                      )}

                      {(allyTok || canAssistAlly) && (
                        <div className="flex items-center gap-1.5 pt-1 border-t border-[#b89146]/15">
                          {allyTok && (
                            <button
                              type="button"
                              onClick={() => openInspectEntity(allyTok.id)}
                              className="flex-1 rpg-card py-1 px-2 rounded text-[11px] font-semibold text-[#c9e1f8] hover:border-[#4a90d9]/65 flex items-center justify-center gap-1 cursor-pointer"
                            >
                              <Eye className="w-3 h-3" />
                              <span>Inspecionar</span>
                            </button>
                          )}
                          {canAssistAlly && (
                            <button
                              type="button"
                              onClick={() => assistDeathSave(hero.id, ally.id)}
                              className="flex-1 rpg-btn-primary py-1 px-2 rounded text-[11px] flex items-center justify-center gap-1 cursor-pointer"
                            >
                              <Heart className="w-3 h-3" />
                              <span>Socorrer</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <>

            {(hero.unspentAttributePoints || 0) > 0 && (
              <button
                type="button"
                onClick={onOpenSheet}
                className="w-full py-1.5 px-2 rounded bg-[#241d11] border border-[#d4ad5c]/65 text-[#e8c683] text-[10px] font-display font-bold cursor-pointer hover:brightness-110 text-center"
              >
                +{hero.unspentAttributePoints} Ponto(s) de Atributo — Distribuir na Ficha
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
                            quickRollFormula(
                              `Perícia: ${sk.name}`,
                              `1d20 + ${comp.total}${comp.diceBonuses.length > 0 ? ` + ${comp.diceBonuses.join(' + ')}` : ''}`,
                              hero.name
                            )
                          }
                          className="w-full rpg-card px-2 py-1 rounded flex items-center justify-between text-[10px] hover:border-amber-400/60 cursor-pointer"
                        >
                          <span className="truncate">{sk.name}</span>
                          <span className="font-mono-dice font-bold text-amber-300">
                            {formatSigned(comp.total)}
                            {comp.diceBonuses.length > 0 ? ` +${comp.diceBonuses.join('+')}` : ''}
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

              {/* Private Multi-Tab Notes Shortcut inside Player Mini-Sheet */}
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => setShowPrivateNotes(true)}
                  className="w-full rpg-card px-2.5 py-1.5 rounded flex items-center justify-between text-[11px] hover:border-amber-400/55 cursor-pointer transition"
                  title="Abrir seu Caderno de Notas Privado (só você pode ver)"
                >
                  <span className="flex items-center gap-1.5 font-semibold text-[#ecdcb9]">
                    <Lock className="w-3 h-3 text-[#d4ad5c]" />
                    <span>Caderno Privado</span>
                  </span>
                  <span className="text-[10px] font-mono-dice text-[#9b9180]">
                    {privateNoteTabs.length} {privateNoteTabs.length === 1 ? 'aba' : 'abas'}
                  </span>
                </button>
              </div>

              <div className="flex items-center justify-between pt-1.5 border-t border-[#b89146]/18 text-[11px]">
                <span className="font-mono-dice text-[#d4ad5c]">Ouro: {hero.gold} PO</span>
                <button
                  type="button"
                  onClick={onOpenSheet}
                  className="rpg-btn-primary px-2.5 py-1 rounded text-xs cursor-pointer"
                >
                  Ficha Completa
                </button>
              </div>
              </>
            )}
          </OrnateFrame>
        </DraggablePanel>
      )}

      {/* =====================================================================
          FLOATING PRIVATE MULTI-TAB NOTEBOOK (PLAYER-ONLY • 100% LOCALSTORAGE)
         ===================================================================== */}
      {role === 'player' && hero && showPrivateNotes && (() => {
        const activeTab =
          privateNoteTabs.find((t) => t.id === activePrivateNoteId) || privateNoteTabs[0];
        return (
          <div
            className="fixed bottom-[76px] left-3 z-40 w-[390px] max-w-[calc(100vw-24px)] rpg-glass-panel rounded-lg border border-[#d4ad5c]/45 shadow-2xl overflow-hidden flex flex-col animate-popover"
            onKeyDown={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-3 py-2 bg-black/45 border-b border-white/10 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <BookOpen className="w-4 h-4 text-[#d4ad5c] shrink-0" />
                <span className="text-xs font-display font-bold text-[#f2dfb7] truncate">
                  Caderno Privado
                </span>
                <span
                  className="px-1.5 py-0.5 rounded bg-emerald-950/80 border border-emerald-400/40 text-emerald-200 text-[9px] font-display font-semibold flex items-center gap-1 shrink-0"
                  title="Salvo exclusivamente no seu computador. Nem o Mestre nem outros jogadores conseguem ver estas anotações."
                >
                  <Lock className="w-2.5 h-2.5" />
                  <span>Só você vê</span>
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowPrivateNotes(false)}
                className="w-6 h-6 rounded flex items-center justify-center text-[#9b9180] hover:text-white hover:bg-white/10 cursor-pointer shrink-0"
                title="Fechar caderno"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Multi-Tab Strip */}
            <div className="px-2 py-1.5 bg-black/30 border-b border-white/10 flex items-center gap-1 overflow-x-auto">
              {privateNoteTabs.map((tab) => {
                const isActive = tab.id === activeTab?.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActivePrivateNoteId(tab.id)}
                    className={`px-2 py-1 rounded text-[11px] font-medium max-w-[130px] truncate border cursor-pointer transition shrink-0 ${
                      isActive
                        ? 'bg-[#282012] border-[#d4ad5c]/70 text-[#f5e3be] font-semibold'
                        : 'bg-black/35 border-white/10 text-[#a59b89] hover:text-[#ece4d5] hover:border-white/25'
                    }`}
                    title={tab.title || 'Sem título'}
                  >
                    {tab.title.trim() || 'Sem título'}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={createPrivateNoteTab}
                className="px-2 py-1 rounded text-[10px] font-display font-bold bg-[#1f1a12] border border-[#d4ad5c]/45 text-[#e6c785] hover:bg-[#2d2416] flex items-center gap-1 cursor-pointer shrink-0"
                title="Criar nova aba de anotação"
              >
                <Plus className="w-3 h-3" />
                <span>Nova</span>
              </button>
            </div>

            {/* Active Tab Subject Rename + Quick Actions */}
            {activeTab && (
              <>
                <div className="px-2.5 py-2 border-b border-white/10 flex items-center gap-1.5 bg-black/20">
                  <Pencil className="w-3.5 h-3.5 text-[#b7a98f] shrink-0" />
                  <input
                    type="text"
                    value={activeTab.title}
                    onChange={(e) => renamePrivateNoteTab(activeTab.id, e.target.value)}
                    placeholder="Nome do assunto (ex: NPCs, Pistas, Missão)..."
                    className="flex-1 min-w-0 bg-black/45 border border-white/15 focus:border-[#d4ad5c]/65 rounded px-2 py-1 text-xs font-semibold text-[#f2e8d5] outline-none"
                    title="Clique para renomear o assunto desta aba"
                  />
                  <button
                    type="button"
                    onClick={() => appendPrivateNoteClue(activeTab.id)}
                    className="px-2 py-1 rounded bg-[#211b12] border border-[#d4ad5c]/45 text-[10px] font-display font-semibold text-[#ecd5a4] hover:bg-[#312718] cursor-pointer shrink-0"
                    title="Inserir tópico com horário atual"
                  >
                    + Pista
                  </button>
                  <button
                    type="button"
                    onClick={() => deletePrivateNoteTab(activeTab.id)}
                    className="p-1.5 rounded bg-black/35 border border-white/10 text-red-400/75 hover:text-red-200 hover:border-red-400/50 cursor-pointer shrink-0"
                    title="Excluir esta aba"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Note Body */}
                <div className="p-2.5">
                  <textarea
                    ref={privateNoteTextareaRef}
                    value={activeTab.content}
                    onChange={(e) => updatePrivateNoteContent(activeTab.id, e.target.value)}
                    placeholder={`Escreva suas anotações privadas sobre "${activeTab.title.trim() || 'este assunto'}"...\nPistas, teorias, segredos do grupo, nomes de NPCs...`}
                    className="w-full min-h-[210px] max-h-[42vh] resize-y bg-[#0b0d13]/90 border border-white/12 focus:border-[#d4ad5c]/55 rounded-md p-2.5 text-xs leading-relaxed text-[#ece4d5] placeholder:text-[#787061] outline-none"
                  />
                </div>

                {/* Footer */}
                <div className="px-3 py-1.5 bg-black/35 border-t border-white/10 flex items-center justify-between text-[10px] text-[#8f8574]">
                  <span>
                    {privateNoteTabs.length}{' '}
                    {privateNoteTabs.length === 1 ? 'aba' : 'abas'} • {activeTab.content.length}{' '}
                    caracteres
                  </span>
                  <span className="flex items-center gap-1 text-emerald-300/80">
                    <Lock className="w-2.5 h-2.5" />
                    <span>Salvo localmente</span>
                  </span>
                </div>
              </>
            )}
          </div>
        );
      })()}
    </>
  );
};
