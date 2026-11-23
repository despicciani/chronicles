import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  ActionEconomyCost,
  ActiveTrackedAbilityEffect,
  BossBannerState,
  CampaignState,
  CampaignSummary,
  CardRewardNotification,
  Character,
  ChatMessageEntry,
  CombatDuelState,
  CombatMvpSummary,
  ConnectedPlayerInfo,
  DiceSkin,
  HandoutPayload,
  InitiativeCeremonyState,
  MapPointerState,
  MapProjectileVfx,
  MapToken,
  OpportunityAttackPrompt,
  PendingAttackChoice,
  CombatLogEntry,
  PendingManualRoll,
  PlayerRequest,
  ProjectileVfxKind,
  RollLogEntry,
  RolledDieVisual,
  SavedHeroEntry,
  SecretPassageAlert,
  SkillCheckRequest,
  TacticalSavePrompt,
  TacticalSaveTargetEntry,
  ThemeMode,
  UserRole,
} from '../shared/types';
import { createStarterCampaign } from '../shared/starterSeed';
import {
  buildPreviewDiceForFormula,
  computeCharacterStats,
  computeLevelForXp,
  doesTokenCollideAt,
  evaluateFormula,
  evaluateLineOfSightAndCover,
  evaluateTacticalAttackModifiers,
  findNearestFreeGridCell,
  formatFormulaForDisplay,
  getCharacterCustomResourceState,
  getGridSpanDistance,
  getTokensInsideTemplate,
  isTokenInsideAoE,
  normalizeHeroCharacter,
  parseAttackRangeMeters,
  parseAttackRangeSquares,
  pickRandomPlayerColor,
  resolveDamageWithAffinities,
  resolveElementalSurfaceCombo,
  RollAdvantageMode,
  syncCampaignDerivedCharacterStats,
} from '../shared/rulesEngine';
import { resolveAbilitySfxPreset, soundEngine } from '../utils/soundEngine';
import { openAlertDialog, openConfirmDialog } from '../components/PromptDialog';

const LOCAL_HERO_VAULT_KEY = 'chronicle_hero_vault_v1';

function readLocalHeroVault(): SavedHeroEntry[] {
  try {
    const raw = localStorage.getItem(LOCAL_HERO_VAULT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalHeroVault(list: SavedHeroEntry[]): void {
  try {
    localStorage.setItem(LOCAL_HERO_VAULT_KEY, JSON.stringify(list));
  } catch {
    // ignore quota limits
  }
}

function mergeSavedHeroLists(...lists: SavedHeroEntry[][]): SavedHeroEntry[] {
  const byId = new Map<string, SavedHeroEntry>();
  for (const list of lists) {
    for (const entry of list || []) {
      if (!entry?.id || !entry?.character?.name) continue;
      const existing = byId.get(entry.id);
      if (
        !existing ||
        new Date(entry.updatedAt || 0).getTime() >= new Date(existing.updatedAt || 0).getTime()
      ) {
        byId.set(entry.id, entry);
      }
    }
  }
  return Array.from(byId.values()).sort(
    (a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()
  );
}

export function triggerHeroJsonDownload(char: Character): void {
  const blob = new Blob([JSON.stringify(char, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${char.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'heroi'}.hero.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export interface RestBannerState {
  id: string;
  kind: 'short' | 'long';
  summary: string;
  affectedCount: number;
}

function getAbilityUsesRemaining(
  char: Character,
  ability: { id: string; maxUsesPerRest?: number } | undefined
): number | null {
  if (!ability?.maxUsesPerRest || ability.maxUsesPerRest <= 0) return null;
  const current = char.abilityUsesRemaining?.[ability.id];
  return typeof current === 'number' ? Math.max(0, current) : ability.maxUsesPerRest;
}

function checkAbilityUsesRemaining(
  char: Character,
  ability: { id: string; name: string; maxUsesPerRest?: number; restType?: 'curto' | 'longo' } | undefined
): { ok: true } | { ok: false; error: string } {
  const rem = getAbilityUsesRemaining(char, ability);
  if (rem === null) return { ok: true };
  if (rem <= 0) {
    const restLabel = ability?.restType === 'curto' ? 'Descanso Curto' : 'Descanso Longo';
    return {
      ok: false,
      error: `"${ability?.name}" sem usos restantes (0/${ability?.maxUsesPerRest})! Recarregue com um ${restLabel}.`,
    };
  }
  return { ok: true };
}

function decrementAbilityUse(
  c: Character,
  ability: { id: string; maxUsesPerRest?: number } | undefined
): Record<string, number> {
  if (!ability?.maxUsesPerRest || ability.maxUsesPerRest <= 0) {
    return c.abilityUsesRemaining || {};
  }
  const current = getAbilityUsesRemaining(c, ability) ?? ability.maxUsesPerRest;
  return {
    ...(c.abilityUsesRemaining || {}),
    [ability.id]: Math.max(0, current - 1),
  };
}

function detectProjectileKind(params: {
  title?: string;
  damageType?: string;
  applyConditionId?: string;
  range?: string;
}): ProjectileVfxKind {
  const dt = (params.damageType || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const title = (params.title || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const range = (params.range || '').toLowerCase();

  if (dt === 'cura' || title.includes('cura')) return 'heal';
  if (dt.includes('fogo') || dt.includes('chama') || title.includes('fogo')) return 'fireball';
  if (dt.includes('eletric') || dt.includes('relampago') || dt.includes('raio') || dt.includes('trov')) {
    return 'lightning';
  }
  if (dt.includes('frio') || dt.includes('gelo') || dt.includes('gelid') || title.includes('gelo')) {
    return 'frost';
  }
  if (dt.includes('radiante') || title.includes('bencao') || title.includes('sagrad')) {
    return 'blessing';
  }
  if (dt.includes('necrot') || dt.includes('veneno') || dt.includes('psiquic') || dt.includes('acido')) {
    return 'curse';
  }
  if (!dt && params.applyConditionId) {
    return /abencoado|velocidade|inspirado|escudo|protegido/i.test(
      `${params.applyConditionId} ${title}`
    )
      ? 'blessing'
      : 'curse';
  }
  if (
    title.includes('arco') ||
    title.includes('flecha') ||
    title.includes('besta') ||
    title.includes('tiro') ||
    title.includes('disparo') ||
    (dt.includes('perfur') && (range.includes('dist') || range.includes('m')))
  ) {
    return 'arrow';
  }
  if (dt.includes('cort') || dt.includes('concuss') || dt.includes('impact') || dt.includes('perfur')) {
    return 'slash';
  }
  return 'arcane';
}

function normalizeAbilityKey(name: string): string {
  return name.trim().toLowerCase();
}

function checkCharacterResource(
  char: Character,
  costMp: number | undefined,
  costResourceId: string | undefined,
  campaign: CampaignState
): { ok: true } | { ok: false; error: string } {
  if (!costMp || costMp <= 0) return { ok: true };
  const resId = costResourceId || 'mp';
  if (resId === 'hp') {
    if (char.hp <= costMp) {
      return { ok: false, error: `Vida (PV) insuficiente para conjurar (${char.hp}/${costMp} PV).` };
    }
    return { ok: true };
  }
  if (resId === 'mp') {
    if (char.mp < costMp) {
      return {
        ok: false,
        error: `${campaign.settings.resourceName} insuficiente (${char.mp}/${costMp} ${campaign.settings.resourceShort}).`,
      };
    }
    return { ok: true };
  }
  const resDef = (campaign.compendium.customResources || []).find((r) => r.id === resId);
  if (resDef) {
    const st = getCharacterCustomResourceState(char, resDef);
    if (st.current < costMp) {
      return {
        ok: false,
        error: `${resDef.name} insuficiente (${st.current}/${costMp} ${resDef.shortName}).`,
      };
    }
  }
  return { ok: true };
}

function deductCharacterResource(
  c: Character,
  costMp: number | undefined,
  costResourceId: string | undefined,
  customResources: CampaignState['compendium']['customResources']
): Pick<Character, 'hp' | 'mp' | 'customResourceValues'> {
  let nextHp = c.hp;
  let nextMp = c.mp;
  let nextCustomRes = c.customResourceValues;
  if (costMp && costMp > 0) {
    const resId = costResourceId || 'mp';
    if (resId === 'hp') {
      nextHp = Math.max(1, c.hp - costMp);
    } else if (resId === 'mp') {
      nextMp = Math.max(0, c.mp - costMp);
    } else {
      const resDef = (customResources || []).find((r) => r.id === resId);
      if (resDef) {
        const st = getCharacterCustomResourceState(c, resDef);
        nextCustomRes = {
          ...(c.customResourceValues || {}),
          [resDef.id]: {
            ...(c.customResourceValues?.[resDef.id] || {}),
            current: Math.max(0, st.current - costMp),
          },
        };
      }
    }
  }
  return { hp: nextHp, mp: nextMp, customResourceValues: nextCustomRes };
}

function removeTrackedEffectsFromState(
  prev: CampaignState,
  casterCharId: string,
  effectsToRemove: ActiveTrackedAbilityEffect[]
): CampaignState {
  if (effectsToRemove.length === 0) return prev;
  const removeKeys = new Set(effectsToRemove.map((e) => e.abilityKey));

  const condRemovalsByChar = new Map<string, Set<string>>();
  const condRemovalsByToken = new Map<string, Set<string>>();
  effectsToRemove.forEach((eff) => {
    if (!eff.conditionId) return;
    eff.targetCharacterIds.forEach((cid) => {
      if (!condRemovalsByChar.has(cid)) condRemovalsByChar.set(cid, new Set());
      condRemovalsByChar.get(cid)!.add(eff.conditionId!);
    });
    eff.targetTokenIds.forEach((tid) => {
      if (!condRemovalsByToken.has(tid)) condRemovalsByToken.set(tid, new Set());
      condRemovalsByToken.get(tid)!.add(eff.conditionId!);
    });
  });

  return {
    ...prev,
    characters: prev.characters.map((c) => {
      let next = c;
      const toRem = condRemovalsByChar.get(c.id);
      if (toRem && toRem.size > 0) {
        next = {
          ...next,
          activeConditionIds: next.activeConditionIds.filter((id) => !toRem.has(id)),
        };
      }
      if (c.id === casterCharId && c.activeTrackedEffects?.length) {
        next = {
          ...next,
          activeTrackedEffects: c.activeTrackedEffects.filter(
            (e) => !removeKeys.has(e.abilityKey)
          ),
        };
      }
      return next;
    }),
    maps: prev.maps.map((m) =>
      m.id !== prev.activeMapId
        ? m
        : {
            ...m,
            tokens: m.tokens.map((t) => {
              const toRem = condRemovalsByToken.get(t.id);
              if (!toRem || toRem.size === 0) return t;
              return {
                ...t,
                activeConditionIds: (t.activeConditionIds || []).filter((id) => !toRem.has(id)),
              };
            }),
          }
    ),
    combat: prev.combat.active
      ? {
          ...prev.combat,
          combatants: prev.combat.combatants.map((cb) => {
            const toRemTok = cb.tokenId ? condRemovalsByToken.get(cb.tokenId) : undefined;
            const toRemChar = cb.referenceId ? condRemovalsByChar.get(cb.referenceId) : undefined;
            if ((!toRemTok || toRemTok.size === 0) && (!toRemChar || toRemChar.size === 0)) {
              return cb;
            }
            return {
              ...cb,
              effects: cb.effects.filter(
                (ef) =>
                  !(
                    ef.conditionId &&
                    ((toRemTok && toRemTok.has(ef.conditionId)) ||
                      (toRemChar && toRemChar.has(ef.conditionId)))
                  )
              ),
            };
          }),
        }
      : prev.combat,
  };
}

function upsertTrackedEffectOnCharacter(
  c: Character,
  entry: ActiveTrackedAbilityEffect
): Character {
  const existing = c.activeTrackedEffects || [];
  const filtered = existing.filter((e) => e.abilityKey !== entry.abilityKey);
  return {
    ...c,
    activeTrackedEffects: [...filtered, entry],
  };
}

async function confirmAbilityConflictIfNeeded(
  char: Character | undefined,
  params: {
    abilityName: string;
    requiresConcentration?: boolean;
    singleTargetOnly?: boolean;
    newTargetTokenId?: string;
    newTargetName?: string;
  }
): Promise<{ proceed: boolean; effectsToClear: ActiveTrackedAbilityEffect[] }> {
  if (!char) return { proceed: true, effectsToClear: [] };
  const tracked = char.activeTrackedEffects || [];
  const key = normalizeAbilityKey(params.abilityName);
  const effectsToClear: ActiveTrackedAbilityEffect[] = [];

  // 1. Single-target exclusive check (same ability already active on another target)
  if (params.singleTargetOnly) {
    const existingSame = tracked.find((e) => e.abilityKey === key);
    if (existingSame && existingSame.targetTokenIds.length > 0) {
      const isDifferentTarget =
        !params.newTargetTokenId || !existingSame.targetTokenIds.includes(params.newTargetTokenId);
      if (isDifferentTarget) {
        const oldTargetsStr = existingSame.targetNames.join(', ') || 'alvo anterior';
        const newTargetLabel = params.newTargetName ? ` para ${params.newTargetName}` : '';
        const ok = await openConfirmDialog(
          `"${params.abilityName}" já está ativa em ${oldTargetsStr}. Deseja mover${newTargetLabel}? O efeito será removido do alvo anterior.`,
          'Trocar Alvo da Habilidade',
          { confirmLabel: 'Trocar Alvo', cancelLabel: 'Cancelar' }
        );
        if (!ok) return { proceed: false, effectsToClear: [] };
        effectsToClear.push(existingSame);
      }
    }
  }

  // 2. Concentration conflict check (already concentrating on a DIFFERENT spell)
  if (params.requiresConcentration && char.concentratingSpell) {
    const currentConcKey = normalizeAbilityKey(char.concentratingSpell);
    if (currentConcKey !== key) {
      const ok = await openConfirmDialog(
        `Você já está mantendo concentração em "${char.concentratingSpell}". Conjurar "${params.abilityName}" encerrará a concentração anterior e removerá seus efeitos ativos. Continuar?`,
        'Substituir Concentração',
        { confirmLabel: 'Substituir', cancelLabel: 'Cancelar' }
      );
      if (!ok) return { proceed: false, effectsToClear: [] };
      tracked
        .filter((e) => e.isConcentration && e.abilityKey !== key)
        .forEach((e) => {
          if (!effectsToClear.some((x) => x.abilityKey === e.abilityKey)) {
            effectsToClear.push(e);
          }
        });
    }
  }

  return { proceed: true, effectsToClear };
}

export interface MapPing {
  id: string;
  mapId: string;
  x: number;
  y: number;
  color: string;
  sender: string;
}

export interface NetworkAddress {
  name: string;
  address: string;
  url: string;
  roomCode: string;
}

export interface FloatingCombatVfx {
  id: string;
  tokenId: string;
  amount: number;
  isHeal: boolean;
  note?: string;
}

export interface ThemeMusicBanner {
  id: string;
  characterName: string;
  characterColor: string;
  title: string;
}

export interface SlashVfxEvent {
  id: string;
  tokenId: string;
  kind: 'hit' | 'block' | 'heal';
}

interface CampaignContextValue {
  campaign: CampaignState;
  savedCampaigns: CampaignSummary[];
  refreshSavedCampaigns: () => Promise<void>;
  savedHeroes: SavedHeroEntry[];
  refreshSavedHeroes: () => Promise<void>;
  saveCharacterToVault: (char: Character, opts?: { silent?: boolean }) => Promise<void>;
  deleteSavedHero: (heroId: string) => Promise<void>;
  importSavedHeroIntoCampaign: (hero: Character) => void;
  claimCampaignCharacter: (characterId: string) => void;
  lastSavedHeroFeedback: { id: string; name: string; syncedAt: string } | null;
  isRemoteTunnelSession: boolean;
  inLobby: boolean;
  setInLobby: (v: boolean) => void;
  loading: boolean;
  isConnected: boolean;
  connectedClients: number;
  connectedPlayers: ConnectedPlayerInfo[];
  serverUrl: string;
  setServerUrl: (url: string) => void;
  networkAddresses: NetworkAddress[];
  publicTunnel: { status: 'idle' | 'starting' | 'active' | 'error'; url: string; error?: string };
  startPublicTunnel: () => Promise<void>;
  stopPublicTunnel: () => Promise<void>;
  resolveAssetUrl: (url?: string) => string;

  // Player identity & color
  myPlayerId: string;
  myPlayerName: string;
  setMyPlayerName: (name: string) => void;
  myPlayerColor: string;
  setMyPlayerColor: (color: string) => void;
  myCharacter: Character | undefined;

  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  role: UserRole;
  setRole: (role: UserRole) => void;
  activeCharacterId: string;
  setActiveCharacterId: (id: string) => void;
  targetTokenId: string | null;
  setTargetTokenId: (id: string | null) => void;
  advantageMode: RollAdvantageMode;
  setAdvantageMode: (mode: RollAdvantageMode) => void;
  secretRoll: boolean;
  setSecretRoll: (v: boolean) => void;

  // Overlays & VFX
  activeHandout: HandoutPayload | null;
  dismissHandout: () => void;
  latestRollForOverlay: RollLogEntry | null;
  dismissRollOverlay: () => void;
  pendingManualRoll: PendingManualRoll | null;
  openManualRoll: (req: Omit<PendingManualRoll, 'id'>) => void;
  cancelManualRoll: () => void;
  executeManualRoll: (chosenMode?: RollAdvantageMode) => void;
  activeAmbientName: string | null;
  activeThemeBanner: ThemeMusicBanner | null;
  pings: MapPing[];
  activePointers: Record<string, MapPointerState>;
  emitPointerMove: (mapId: string, xPct: number, yPct: number) => void;
  emitPointerHide: () => void;
  activeSkillCheck: SkillCheckRequest | null;
  requestSkillCheck: (skillOrAttrId: string, label: string, dc: number) => void;
  submitSkillCheckResult: (res: {
    checkId: string;
    characterId: string;
    characterName: string;
    playerColor: string;
    total: number;
    d20?: number;
    passed: boolean;
  }) => void;
  dismissSkillCheck: () => void;
  pendingRequests: PlayerRequest[];
  pendingHeroJoinRequest: PlayerRequest | null;
  heroJoinFeedback: { status: 'approved' | 'rejected'; message: string } | null;
  clearHeroJoinFeedback: () => void;
  cancelHeroJoinRequest: () => void;
  sendPlayerRequest: (type: PlayerRequest['type'], label: string, note?: string) => void;
  resolvePlayerRequest: (requestId: string, approved: boolean) => void;
  requestToast: { id: string; label: string; approved: boolean } | null;
  activeReward: CardRewardNotification | null;
  grantCardReward: (reward: Omit<CardRewardNotification, 'id'>) => void;
  dismissReward: () => void;
  floatingVfx: FloatingCombatVfx[];
  slashVfx: SlashVfxEvent[];
  triggerSlashVfx: (tokenId: string, kind: 'hit' | 'block' | 'heal') => void;
  mapBannerName: string | null;
  dismissMapBanner: () => void;

  // Combat Duel, Tactical Turn Economy, Opportunity Attacks & Initiative Ceremony
  pendingAttackChoice: PendingAttackChoice | null;
  setPendingAttackChoice: (choice: PendingAttackChoice | null) => void;
  tacticalAlert: { id: string; message: string } | null;
  showTacticalAlert: (message: string) => void;
  opportunityPrompt: OpportunityAttackPrompt | null;
  opportunityQueueCount: number;
  triggerOpportunityPrompt: (prompt: OpportunityAttackPrompt | null) => void;
  enqueueOpportunityPrompts: (prompts: OpportunityAttackPrompt[]) => void;
  performCombatManeuver: (
    maneuver: 'dash' | 'disengage' | 'dodge' | 'action-surge' | 'shove' | 'hide' | 'help' | 'jump',
    actorTokenId?: string
  ) => void;
  toggleHeroInspiration: (characterId: string) => void;
  spendHeroInspiration: (characterId: string) => void;
  triggerDuelShieldReaction: () => void;
  activeDuel: CombatDuelState | null;
  startCombatDuel: (choice: PendingAttackChoice, defenderToken: MapToken) => void;
  rollDuelAttack: () => void;
  rollDuelDamage: () => void;
  advanceDuelPhase: (phase: CombatDuelState['phase']) => void;
  dismissDuel: () => void;
  initiativeCeremony: InitiativeCeremonyState | null;
  showInitiativeCeremony: (ceremony: InitiativeCeremonyState | null) => void;
  startCombatFromMap: () => void;

  // Phase 2: Unified Hybrid Save Prompts (Traps, AoE, Concentration) & RP Chat / Whispers
  activeSavePrompt: TacticalSavePrompt | null;
  rollSavePromptTarget: (tokenId: string) => void;
  rollAllPendingSaveTargets: () => void;
  applySavePromptDamages: () => void;
  dismissSavePrompt: () => void;
  triggerTrapOnToken: (markerId: string, token: MapToken) => void;
  triggerAoESavePrompt: (
    templateId: string,
    params: {
      title: string;
      saveSkillId: string;
      saveLabel: string;
      dc: number;
      damageFormula: string;
      damageType: string;
      halfOnSuccess: boolean;
    }
  ) => void;
  setCharacterConcentration: (characterId: string, spellName: string | null) => void;
  chatMessages: ChatMessageEntry[];
  unreadChatCount: number;
  sendChatMessage: (text: string, recipientName?: string) => void;
  markChatRead: () => void;

  // Lobby Actions
  createNewCampaign: (params: {
    name: string;
    description: string;
    coverUrl?: string;
    gmName?: string;
    attributePointBudget?: number;
    maxTrainedSkills?: number;
  }) => Promise<void>;
  loadSavedCampaign: (id: string) => Promise<void>;
  deleteSavedCampaign: (id: string) => Promise<void>;
  enterTableAsPlayer: (params: {
    targetServerUrl: string;
    playerName: string;
    playerColor: string;
  }) => Promise<void>;

  // Gameplay Actions
  updateCampaign: (updater: (prev: CampaignState) => CampaignState) => void;
  deleteCharacter: (characterId: string) => void;
  rollDeathSave: (characterId: string) => void;
  setDeathSaveManual: (
    characterId: string,
    patch: Partial<Character['deathSaves']> & { hp?: number }
  ) => void;
  assistDeathSave: (helperCharacterId: string, targetCharacterId: string) => void;
  gmResolveDeathSave: (
    characterId: string,
    mode: 'stabilize' | 'save-full' | 'revive-1' | 'revive-full'
  ) => void;
  activeSecretPassage: SecretPassageAlert | null;
  triggerSecretPassage: (markerId: string, token?: MapToken) => void;
  dismissSecretPassage: () => void;
  moveTokensToMap: (
    sourceMapId: string,
    targetMapId: string,
    tokenIds: string[] | 'all-heroes'
  ) => void;
  claimTreasureMarker: (markerId: string) => void;
  sendRoll: (entry: Omit<RollLogEntry, 'id' | 'timestamp'>) => void;
  quickRollFormula: (
    title: string,
    formula: string,
    rollerName?: string,
    damageFormula?: string,
    damageType?: string
  ) => void;
  rollCharacterAction: (params: {
    characterId: string;
    title: string;
    attackFormula?: string;
    damageFormula?: string;
    damageType?: string;
    range?: string;
    actionCost?: ActionEconomyCost;
    saveSkillId?: string;
    saveDcFormula?: string;
    costMp?: number;
    costResourceId?: string;
    applyConditionId?: string;
    conditionDurationRounds?: number;
    aoeShape?: 'sphere' | 'cone' | 'line' | 'cube';
    aoeSizeMeters?: number;
    aoeColor?: string;
    aoePersistent?: boolean;
    extraBonus?: number;
    extraDice?: string[];
  }) => void;
  pushCombatLog: (entry: Omit<CombatLogEntry, 'id' | 'timestamp'>) => void;
  awardXp: (characterIds: string[] | 'all', amount: number) => void;
  castAoEAbility: (
    choice: PendingAttackChoice,
    originX: number,
    originY: number,
    angleDeg: number
  ) => void;
  applyDamage: (
    targetTokenId: string,
    amount: number,
    isHeal?: boolean,
    rollId?: string,
    damageType?: string,
    applyConditionId?: string,
    conditionDurationRounds?: number
  ) => void;
  activeRestBanner: RestBannerState | null;
  dismissRestBanner: () => void;
  partyRest: (kind: 'short' | 'long') => void;
  projectileVfx: MapProjectileVfx[];
  screenShakeActive: boolean;
  activeMvpSummary: CombatMvpSummary | null;
  dismissMvpSummary: () => void;
  endCombatWithSummary: () => void;
  setCharacterNextAttackOverride: (
    characterId: string,
    override: 'advantage' | 'disadvantage' | null
  ) => void;
  canUndo: boolean;
  undoCount: number;
  undoLastAction: () => void;
  sendHandout: (handout: Omit<HandoutPayload, 'id' | 'sentAt'>) => void;
  triggerSound: (payload: {
    action: 'ambient' | 'sfx' | 'stop-ambient';
    presetKey: string;
    name: string;
    customUrl?: string;
  }) => void;
  playCharacterTheme: (char: Character) => void;
  announceBoss: (boss: BossBannerState | null) => void;
  sendPing: (mapId: string, x: number, y: number, color: string) => void;
  resetCampaign: () => Promise<void>;
  importCampaign: (next: CampaignState) => Promise<void>;
}

const CampaignContext = createContext<CampaignContextValue | null>(null);

function getOrCreatePlayerId(): string {
  const existing = localStorage.getItem('rpg_player_id');
  if (existing) return existing;
  const fresh = `plr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  localStorage.setItem('rpg_player_id', fresh);
  return fresh;
}

export const CampaignProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [campaign, setCampaign] = useState<CampaignState>(() => createStarterCampaign());
  const [savedCampaigns, setSavedCampaigns] = useState<CampaignSummary[]>([]);
  const [savedHeroes, setSavedHeroes] = useState<SavedHeroEntry[]>(() => readLocalHeroVault());
  const [lastSavedHeroFeedback, setLastSavedHeroFeedback] = useState<{
    id: string;
    name: string;
    syncedAt: string;
  } | null>(null);
  const isRemoteTunnelSession =
    typeof window !== 'undefined' &&
    window.location.hostname.toLowerCase().includes('trycloudflare.com');
  const [inLobby, setInLobbyState] = useState<boolean>(true);
  const lastDispatchedDuelIdRef = useRef<string | null>(null);
  const gmServerLostTimerRef = useRef<number | null>(null);
  const setInLobby = useCallback((nextInLobby: boolean) => {
    if (nextInLobby && roleRef.current === 'gm' && socketRef.current?.connected) {
      socketRef.current.emit('room:gm-leave');
    } else if (!nextInLobby && roleRef.current === 'gm' && socketRef.current?.connected) {
      socketRef.current.emit('room:gm-open');
    }
    setInLobbyState(nextInLobby);
  }, []);
  const [loading, setLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [connectedClients, setConnectedClients] = useState(1);
  const [connectedPlayers, setConnectedPlayers] = useState<ConnectedPlayerInfo[]>([]);
  const connectedPlayersRef = useRef<ConnectedPlayerInfo[]>([]);
  connectedPlayersRef.current = connectedPlayers;
  const [activeSecretPassage, setActiveSecretPassage] = useState<SecretPassageAlert | null>(null);
  const [networkAddresses, setNetworkAddresses] = useState<NetworkAddress[]>([]);
  const [publicTunnel, setPublicTunnel] = useState<{
    status: 'idle' | 'starting' | 'active' | 'error';
    url: string;
    error?: string;
  }>({ status: 'idle', url: '' });

  const [serverUrl, setServerUrlState] = useState<string>(() => {
    return localStorage.getItem('rpg_server_url') || '';
  });

  const [myPlayerId] = useState<string>(() => getOrCreatePlayerId());
  const [myPlayerName, setMyPlayerNameState] = useState<string>(() => {
    return localStorage.getItem('rpg_player_name') || 'Aventureiro';
  });
  const [myPlayerColor, setMyPlayerColorState] = useState<string>(() => {
    const saved = localStorage.getItem('rpg_player_color');
    if (saved) return saved;
    const picked = pickRandomPlayerColor();
    localStorage.setItem('rpg_player_color', picked);
    return picked;
  });

  const [theme, setThemeState] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('rpg_theme');
    return saved === 'bright-fantasy' ? 'bright-fantasy' : 'dark-fantasy';
  });

  const [role, setRoleState] = useState<UserRole>(() => {
    const saved = localStorage.getItem('rpg_role');
    return saved === 'player' ? 'player' : 'gm';
  });

  const [activeCharacterId, setActiveCharacterIdState] = useState<string>(() => {
    return localStorage.getItem('rpg_active_char') || 'char-ragnar';
  });

  const [targetTokenId, setTargetTokenId] = useState<string | null>(null);
  const [advantageMode, setAdvantageMode] = useState<RollAdvantageMode>('normal');
  const [secretRoll, setSecretRoll] = useState(false);
  const [activeHandout, setActiveHandout] = useState<HandoutPayload | null>(null);
  const [latestRollForOverlay, setLatestRollForOverlay] = useState<RollLogEntry | null>(null);
  const [pendingManualRoll, setPendingManualRoll] = useState<PendingManualRoll | null>(null);
  const [activeAmbientName, setActiveAmbientName] = useState<string | null>(null);
  const [activeThemeBanner, setActiveThemeBanner] = useState<ThemeMusicBanner | null>(null);
  const [activeRestBanner, setActiveRestBanner] = useState<RestBannerState | null>(null);
  const dismissRestBanner = useCallback(() => setActiveRestBanner(null), []);
  const [pings, setPings] = useState<MapPing[]>([]);
  const [activePointers, setActivePointers] = useState<Record<string, MapPointerState>>({});
  const [activeSkillCheck, setActiveSkillCheck] = useState<SkillCheckRequest | null>(null);
  const [pendingRequests, setPendingRequests] = useState<PlayerRequest[]>([]);
  const [pendingHeroJoinRequest, setPendingHeroJoinRequest] = useState<PlayerRequest | null>(null);
  const [heroJoinFeedback, setHeroJoinFeedback] = useState<{
    status: 'approved' | 'rejected';
    message: string;
  } | null>(null);
  const [requestToast, setRequestToast] = useState<{
    id: string;
    label: string;
    approved: boolean;
  } | null>(null);
  const [activeReward, setActiveReward] = useState<CardRewardNotification | null>(null);
  const [floatingVfx, setFloatingVfx] = useState<FloatingCombatVfx[]>([]);
  const [slashVfx, setSlashVfx] = useState<SlashVfxEvent[]>([]);
  const [projectileVfx, setProjectileVfx] = useState<MapProjectileVfx[]>([]);
  const [screenShakeActive, setScreenShakeActive] = useState(false);
  const [activeMvpSummary, setActiveMvpSummary] = useState<CombatMvpSummary | null>(null);
  const dismissMvpSummary = useCallback(() => setActiveMvpSummary(null), []);
  const combatStatsRef = useRef<
    Record<string, { name: string; color: string; damage: number; healing: number; crits: number }>
  >({});
  const [mapBannerName, setMapBannerName] = useState<string | null>(null);
  const [pendingAttackChoice, setPendingAttackChoice] = useState<PendingAttackChoice | null>(null);
  const [tacticalAlert, setTacticalAlert] = useState<{ id: string; message: string } | null>(null);
  const [opportunityQueue, setOpportunityQueue] = useState<OpportunityAttackPrompt[]>([]);
  const opportunityQueueRef = useRef<OpportunityAttackPrompt[]>([]);
  opportunityQueueRef.current = opportunityQueue;
  const opportunityPrompt = opportunityQueue[0] || null;
  const [activeSavePrompt, setActiveSavePrompt] = useState<TacticalSavePrompt | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessageEntry[]>([]);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [activeDuel, setActiveDuel] = useState<CombatDuelState | null>(null);
  const [initiativeCeremony, setInitiativeCeremony] = useState<InitiativeCeremonyState | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const roleRef = useRef(role);
  const activeCharRef = useRef(activeCharacterId);
  const campaignRef = useRef(campaign);
  const serverUrlRef = useRef(serverUrl);
  const prevMapIdRef = useRef<string>(campaign.activeMapId);
  const activeDuelRef = useRef<CombatDuelState | null>(null);
  const activeSavePromptRef = useRef<TacticalSavePrompt | null>(null);
  const startConcentrationPromptRef = useRef<
    | ((payload: {
        tokenId: string;
        characterId?: string;
        name: string;
        spellName: string;
        dc: number;
        damageTaken: number;
      }) => void)
    | null
  >(null);
  const pendingAttackRef = useRef<PendingAttackChoice | null>(null);
  const inLobbyRef = useRef<boolean>(inLobby);
  const hasPlayerCharRef = useRef<boolean>(false);

  const startDuelRef = useRef<((choice: PendingAttackChoice, tok: MapToken) => void) | null>(null);

  useEffect(() => {
    activeDuelRef.current = activeDuel;
  }, [activeDuel]);

  useEffect(() => {
    pendingAttackRef.current = pendingAttackChoice;
  }, [pendingAttackChoice]);

  useEffect(() => {
    roleRef.current = role;
  }, [role]);

  useEffect(() => {
    activeCharRef.current = activeCharacterId;
  }, [activeCharacterId]);

  useEffect(() => {
    campaignRef.current = campaign;
  }, [campaign]);

  useEffect(() => {
    serverUrlRef.current = serverUrl;
  }, [serverUrl]);

  useEffect(() => {
    inLobbyRef.current = inLobby;
  }, [inLobby]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('rpg_theme', theme);
  }, [theme]);

  // Show cinematic location banner + arrival sound when activeMapId changes
  useEffect(() => {
    if (!inLobby && campaign.activeMapId && campaign.activeMapId !== prevMapIdRef.current) {
      prevMapIdRef.current = campaign.activeMapId;
      const m = campaignRef.current.maps.find((x) => x.id === campaign.activeMapId);
      if (m) {
        setMapBannerName(m.name);
        soundEngine.playSfxPreset('scene-transition');
      }
      return;
    }
    prevMapIdRef.current = campaign.activeMapId;
  }, [campaign.activeMapId, inLobby]);

  // Isolated auto-dismiss timer so campaign:updated state patches never cancel the timeout
  useEffect(() => {
    if (!mapBannerName) return;
    const t = window.setTimeout(() => setMapBannerName(null), 2800);
  }, [mapBannerName]);

  const dismissMapBanner = useCallback(() => {
    setMapBannerName(null);
  }, []);

  const setTheme = useCallback((next: ThemeMode) => {
    setThemeState(next);
  }, []);

  const setRole = useCallback((next: UserRole) => {
    setRoleState(next);
    localStorage.setItem('rpg_role', next);
  }, []);

  const setActiveCharacterId = useCallback((id: string) => {
    setActiveCharacterIdState(id);
    localStorage.setItem('rpg_active_char', id);
    const camp = campaignRef.current;
    const activeMap = camp.maps.find((m) => m.id === camp.activeMapId) || camp.maps[0];
    const charTok = activeMap?.tokens.find(
      (t) => t.type === 'character' && t.referenceId === id
    );
    if (charTok) {
      setTargetTokenId(charTok.id);
    } else if (roleRef.current === 'gm') {
      setTargetTokenId(null);
    }
  }, []);

  const setMyPlayerName = useCallback((name: string) => {
    setMyPlayerNameState(name);
    localStorage.setItem('rpg_player_name', name);
  }, []);

  const setServerUrl = useCallback((rawUrl: string) => {
    let cleaned = rawUrl.trim().replace(/\/+$/, '');
    if (cleaned && !cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
      cleaned = `http://${cleaned}`;
    }
    setServerUrlState(cleaned);
    localStorage.setItem('rpg_server_url', cleaned);
  }, []);

  const startPublicTunnel = useCallback(async () => {
    setPublicTunnel((prev) => ({ ...prev, status: 'starting', error: undefined }));
    try {
      const res = await fetch('/api/tunnel/start', { method: 'POST' });
      const data = await res.json();
      if (data?.status) {
        setPublicTunnel(data);
      }
    } catch (err) {
      setPublicTunnel({
        status: 'error',
        url: '',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  const stopPublicTunnel = useCallback(async () => {
    try {
      const res = await fetch('/api/tunnel/stop', { method: 'POST' });
      const data = await res.json();
      if (data?.status) setPublicTunnel(data);
      else setPublicTunnel({ status: 'idle', url: '' });
    } catch {
      setPublicTunnel({ status: 'idle', url: '' });
    }
  }, []);

  const resolveAssetUrl = useCallback(
    (url?: string) => {
      if (!url) return '';
      if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
        return url;
      }
      if (url.startsWith('/uploads/') && serverUrl) {
        return `${serverUrl}${url}`;
      }
      return url;
    },
    [serverUrl]
  );

  // Locate player's single character STRICTLY by ownerPlayerId (never hijack another player's hero by matching playerName!)
  const myCharacter = campaign.characters.find((c) => c.ownerPlayerId === myPlayerId);

  useEffect(() => {
    hasPlayerCharRef.current = Boolean(myCharacter);
    if (role === 'player' && myCharacter && activeCharacterId !== myCharacter.id) {
      setActiveCharacterId(myCharacter.id);
    }
  }, [role, myCharacter, activeCharacterId, setActiveCharacterId]);

  const refreshSavedCampaigns = useCallback(async () => {
    try {
      const res = await fetch('/api/campaigns');
      if (res.ok) {
        const data = (await res.json()) as { campaigns: CampaignSummary[] };
        setSavedCampaigns(data.campaigns || []);
      }
    } catch {
      // ignore
    }
  }, []);

  const savedHeroesRef = useRef<SavedHeroEntry[]>(savedHeroes);
  useEffect(() => {
    savedHeroesRef.current = savedHeroes;
  }, [savedHeroes]);

  const refreshSavedHeroes = useCallback(async () => {
    const localStored = readLocalHeroVault();
    const collected: SavedHeroEntry[][] = [localStored];
    const origin = typeof window !== 'undefined' ? window.location.origin : '';

    try {
      const resLocal = await fetch('/api/characters/saved');
      if (resLocal.ok) {
        const data = (await resLocal.json()) as { characters: SavedHeroEntry[] };
        if (Array.isArray(data.characters)) collected.push(data.characters);
      }
    } catch {
      // ignore
    }

    const remoteBase = serverUrlRef.current?.trim().replace(/\/+$/, '');
    if (remoteBase && remoteBase !== origin) {
      try {
        const resRemote = await fetch(`${remoteBase}/api/characters/saved`);
        if (resRemote.ok) {
          const data = (await resRemote.json()) as { characters: SavedHeroEntry[] };
          if (Array.isArray(data.characters)) collected.push(data.characters);
        }
      } catch {
        // ignore
      }
    }

    const merged = mergeSavedHeroLists(...collected);
    writeLocalHeroVault(merged);
    setSavedHeroes(merged);
  }, []);

  useEffect(() => {
    let mounted = true;
    const base = serverUrl || '';

    fetch(`${base}/api/campaign`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: CampaignState | null) => {
        if (mounted && data && data.compendium) {
          setCampaign(syncCampaignDerivedCharacterStats(data));
        }
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setLoading(false);
      });

    refreshSavedCampaigns();
    refreshSavedHeroes();

    fetch('/api/network-info')
      .then((res) => (res.ok ? res.json() : null))
      .then((info) => {
        if (mounted && info?.addresses) {
          setNetworkAddresses(info.addresses);
        }
      })
      .catch(() => {});

    fetch('/api/tunnel/status')
      .then((res) => (res.ok ? res.json() : null))
      .then((st) => {
        if (mounted && st?.status) {
          setPublicTunnel(st);
        }
      })
      .catch(() => {});

    const socket = base
      ? io(base, { transports: ['websocket', 'polling'] })
      : io({ transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      if (!mounted) return;
      setIsConnected(true);
      if (gmServerLostTimerRef.current !== null) {
        window.clearTimeout(gmServerLostTimerRef.current);
        gmServerLostTimerRef.current = null;
      }
      if (roleRef.current === 'gm' && !inLobbyRef.current) {
        socket.emit('room:gm-open');
      }
    });

    socket.on('disconnect', () => {
      if (!mounted) return;
      setIsConnected(false);
      if (roleRef.current === 'player' && !inLobbyRef.current) {
        if (gmServerLostTimerRef.current !== null) {
          window.clearTimeout(gmServerLostTimerRef.current);
        }
        gmServerLostTimerRef.current = window.setTimeout(() => {
          gmServerLostTimerRef.current = null;
          if (!socketRef.current?.connected && roleRef.current === 'player' && !inLobbyRef.current) {
            setPendingAttackChoice(null);
            setActiveDuel(null);
            setActiveSavePrompt(null);
            setInLobbyState(true);
            openAlertDialog(
              'O servidor do Mestre foi encerrado ou a conexão caiu. A sala foi fechada.',
              'Sala Encerrada'
            );
          }
        }, 3500);
      }
    });

    socket.on('room:closed', (payload?: { reason?: string }) => {
      if (!mounted) return;
      if (roleRef.current === 'player' && !inLobbyRef.current) {
        setPendingAttackChoice(null);
        setActiveDuel(null);
        setActiveSavePrompt(null);
        setInLobbyState(true);
        openAlertDialog(
          payload?.reason || 'O Mestre saiu da mesa — a sala foi encerrada automaticamente.',
          'Sala Encerrada'
        );
      }
    });

    socket.on('presence:count', (count: number) => {
      if (mounted) setConnectedClients(count);
    });

    socket.on('presence:list', (list: ConnectedPlayerInfo[]) => {
      if (mounted && Array.isArray(list)) setConnectedPlayers(list);
    });

    socket.on('characters:saved-updated', (serverList: SavedHeroEntry[]) => {
      if (!mounted || !Array.isArray(serverList)) return;
      setSavedHeroes((prev) => {
        const merged = mergeSavedHeroLists(readLocalHeroVault(), prev, serverList);
        writeLocalHeroVault(merged);
        return merged;
      });
    });

    socket.on('tunnel:status', (st: { status: 'idle' | 'starting' | 'active' | 'error'; url: string; error?: string }) => {
      if (mounted && st?.status) setPublicTunnel(st);
    });

    socket.on('campaign:updated', (next: CampaignState) => {
      if (mounted && next && next.compendium) {
        setCampaign(syncCampaignDerivedCharacterStats(next));
      }
    });

    socket.on('roll:new', (entry: RollLogEntry) => {
      if (!mounted) return;
      if (inLobbyRef.current) return;
      if (roleRef.current === 'player' && !hasPlayerCharRef.current) return;
      if (entry.isSecret && roleRef.current !== 'gm') return;
      if (activeDuelRef.current) return;
      if (entry.rolledDice && entry.rolledDice.length > 0) {
        setLatestRollForOverlay(entry);
      }
    });

    socket.on('duel:updated', (duel: CombatDuelState | null) => {
      if (!mounted) return;
      setActiveDuel(duel);
    });

    socket.on('initiative:ceremony', (ceremony: InitiativeCeremonyState | null) => {
      if (!mounted) return;
      setInitiativeCeremony(ceremony);
    });

    socket.on('vfx:slash', (payload: { tokenId: string; kind: 'hit' | 'block' | 'heal' }) => {
      if (!mounted) return;
      const id = `svfx-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
      setSlashVfx((prev) => [...prev, { ...payload, id }]);
      window.setTimeout(() => {
        setSlashVfx((prev) => prev.filter((x) => x.id !== id));
      }, 800);
    });

    socket.on('opportunity:prompt', (prompt: OpportunityAttackPrompt | null) => {
      if (!mounted) return;
      setOpportunityQueue((prev) => {
        if (!prompt) {
          return prev.length > 1 ? prev.slice(1) : [];
        }
        if (prev[0]?.id === prompt.id) return prev;
        return [prompt, ...prev.filter((p) => p.id !== prompt.id)];
      });
    });

    socket.on('save-prompt:updated', (prompt: TacticalSavePrompt | null) => {
      if (!mounted) return;
      activeSavePromptRef.current = prompt;
      setActiveSavePrompt(prompt);
    });

    socket.on('chat:new', (msg: ChatMessageEntry) => {
      if (!mounted || !msg?.id) return;
      setChatMessages((prev) =>
        prev.some((m) => m.id === msg.id) ? prev : [...prev, msg].slice(-150)
      );
      if (msg.senderPlayerId !== myPlayerId) {
        setUnreadChatCount((c) => c + 1);
      }
    });

    socket.on(
      'concentration:trigger',
      (payload: {
        tokenId: string;
        characterId?: string;
        name: string;
        spellName: string;
        dc: number;
        damageTaken: number;
      }) => {
        if (!mounted) return;
        const shouldInitiate =
          roleRef.current === 'gm' ||
          Boolean(payload.characterId && payload.characterId === activeCharRef.current);
        if (!shouldInitiate) return;
        if (activeSavePromptRef.current?.kind === 'concentration' && activeSavePromptRef.current.targets.some((t) => t.tokenId === payload.tokenId)) {
          return;
        }
        startConcentrationPromptRef.current?.(payload);
      }
    );

    socket.on(
      'floating:vfx',
      (vfx: { tokenId: string; amount: number; isHeal: boolean; note?: string }) => {
        if (!mounted) return;
        const id = `fvfx-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
        setFloatingVfx((prev) => [...prev, { ...vfx, id }]);
        window.setTimeout(() => {
          setFloatingVfx((prev) => prev.filter((x) => x.id !== id));
        }, 2100);
      }
    );

    socket.on('rest:banner', (banner: RestBannerState) => {
      if (!mounted || !banner?.id) return;
      setActiveRestBanner(banner);
      soundEngine.playSfxPreset('campfire');
      window.setTimeout(() => {
        setActiveRestBanner((curr) => (curr?.id === banner.id ? null : curr));
      }, 4200);
    });

    socket.on('vfx:projectile', (proj: MapProjectileVfx) => {
      if (!mounted || !proj?.id) return;
      setProjectileVfx((prev) => [...prev, proj]);
      if (proj.isCrit) {
        setScreenShakeActive(true);
        soundEngine.playSfxPreset('crit');
        window.setTimeout(() => setScreenShakeActive(false), 520);
      }
      window.setTimeout(() => {
        setProjectileVfx((prev) => prev.filter((p) => p.id !== proj.id));
      }, 1300);
    });

    socket.on('combat:mvp-summary', (summary: CombatMvpSummary) => {
      if (!mounted || !summary?.id) return;
      setActiveMvpSummary(summary);
      soundEngine.playSfxPreset('levelup');
    });

    socket.on('pointer:bulk', (list: MapPointerState[]) => {
      if (!mounted) return;
      const rec: Record<string, MapPointerState> = {};
      list.forEach((p) => {
        rec[p.playerId] = p;
      });
      setActivePointers(rec);
    });

    socket.on('pointer:update', (pointer: MapPointerState) => {
      if (!mounted) return;
      setActivePointers((prev) => ({ ...prev, [pointer.playerId]: pointer }));
    });

    socket.on('pointer:remove', (playerId: string) => {
      if (!mounted) return;
      setActivePointers((prev) => {
        const copy = { ...prev };
        delete copy[playerId];
        return copy;
      });
    });

    socket.on('check:updated', (reqState: SkillCheckRequest | null) => {
      if (!mounted) return;
      setActiveSkillCheck(reqState);
    });

    socket.on('request:list', (list: PlayerRequest[]) => {
      if (!mounted) return;
      const safeList = list || [];
      setPendingRequests(safeList);
      if (roleRef.current === 'player') {
        const myPending =
          safeList.find(
            (r) =>
              (r.type === 'claim-hero' || r.type === 'import-hero') &&
              r.requesterPlayerId === myPlayerId
          ) || null;
        setPendingHeroJoinRequest(myPending);
      } else if (
        safeList.some((r) => r.type === 'claim-hero' || r.type === 'import-hero')
      ) {
        soundEngine.playSfxPreset('dice');
      }
    });

    socket.on(
      'request:resolved',
      (res: {
        type?: PlayerRequest['type'];
        requesterPlayerId?: string;
        characterId: string;
        characterName: string;
        label: string;
        approved: boolean;
      }) => {
        if (!mounted) return;
        if (
          roleRef.current === 'player' &&
          (res.type === 'claim-hero' || res.type === 'import-hero') &&
          res.requesterPlayerId === myPlayerId
        ) {
          setPendingHeroJoinRequest(null);
          if (res.approved) {
            setActiveCharacterId(res.characterId);
            setHeroJoinFeedback({
              status: 'approved',
              message: `O Mestre permitiu sua entrada como ${res.characterName}!`,
            });
            soundEngine.playSfxPreset('heal');
            const id = `rtoast-${Date.now()}`;
            setRequestToast({
              id,
              label: `Entrada permitida: ${res.characterName}`,
              approved: true,
            });
            window.setTimeout(() => {
              setRequestToast((curr) => (curr?.id === id ? null : curr));
            }, 4200);
          } else {
            setHeroJoinFeedback({
              status: 'rejected',
              message: `O Mestre não permitiu sua entrada como ${res.characterName}. Escolha outro herói ou crie um novo.`,
            });
          }
          return;
        }
        if (roleRef.current === 'player' && res.characterId === activeCharRef.current) {
          const id = `rtoast-${Date.now()}`;
          setRequestToast({ id, label: res.label, approved: res.approved });
          if (res.approved) soundEngine.playSfxPreset('heal');
          window.setTimeout(() => {
            setRequestToast((curr) => (curr?.id === id ? null : curr));
          }, 4200);
        }
      }
    );

    socket.on('reward:received', (reward: CardRewardNotification) => {
      if (!mounted) return;
      if (
        roleRef.current === 'player' &&
        reward.targetCharacterId &&
        reward.targetCharacterId !== activeCharRef.current
      ) {
        return;
      }
      setActiveReward(reward);
      soundEngine.playSfxPreset('heal');
    });

    socket.on('handout:received', (handout: HandoutPayload) => {
      if (!mounted) return;
      if (handout.targetPlayerName && roleRef.current === 'player') {
        const myChar = campaignRef.current.characters.find((c) => c.id === activeCharRef.current);
        if (
          myChar &&
          myChar.playerName.toLowerCase() !== handout.targetPlayerName.toLowerCase() &&
          myChar.name.toLowerCase() !== handout.targetPlayerName.toLowerCase()
        ) {
          return;
        }
      }
      setActiveHandout(handout);
    });

    socket.on(
      'sound:play',
      (payload: {
        action: 'ambient' | 'sfx' | 'stop-ambient';
        presetKey: string;
        name: string;
        customUrl?: string;
      }) => {
        if (!mounted) return;
        const resolvedUrl =
          payload.customUrl && payload.customUrl.startsWith('/uploads/') && serverUrlRef.current
            ? `${serverUrlRef.current}${payload.customUrl}`
            : payload.customUrl;

        if (payload.action === 'stop-ambient') {
          soundEngine.stopAmbient();
          setActiveAmbientName(null);
        } else if (payload.action === 'ambient') {
          setActiveAmbientName(payload.name);
          if (resolvedUrl) {
            soundEngine.playCustomUrl(resolvedUrl, true);
          } else {
            soundEngine.playAmbientPreset(payload.presetKey);
          }
        } else {
          if (resolvedUrl) {
            soundEngine.playCustomUrl(resolvedUrl, false);
          } else {
            soundEngine.playSfxPreset(payload.presetKey);
          }
        }
      }
    );

    socket.on(
      'music:theme-playing',
      (payload: { characterName: string; characterColor: string; title: string; url: string }) => {
        if (!mounted) return;
        const resolvedUrl =
          payload.url.startsWith('/uploads/') && serverUrlRef.current
            ? `${serverUrlRef.current}${payload.url}`
            : payload.url;
        setActiveAmbientName(`Tema: ${payload.characterName}`);
        soundEngine.playCustomUrl(resolvedUrl, true);
        const bannerId = `tb-${Date.now()}`;
        setActiveThemeBanner({
          id: bannerId,
          characterName: payload.characterName,
          characterColor: payload.characterColor,
          title: payload.title,
        });
        window.setTimeout(() => {
          setActiveThemeBanner((curr) => (curr?.id === bannerId ? null : curr));
        }, 5000);
      }
    );

    socket.on('map:ping', (payload: Omit<MapPing, 'id'>) => {
      if (!mounted) return;
      const id = `ping-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setPings((prev) => [...prev, { ...payload, id }]);
      window.setTimeout(() => {
        setPings((prev) => prev.filter((p) => p.id !== id));
      }, 2800);
    });

    return () => {
      mounted = false;
      socket.disconnect();
    };
  }, [serverUrl, refreshSavedCampaigns, refreshSavedHeroes]);

  useEffect(() => {
    if (!socketRef.current || !isConnected) return;
    const controlledChar =
      role === 'player'
        ? myCharacter
        : campaign.characters.find((c) => c.id === activeCharacterId);
    socketRef.current.emit('presence:identify', {
      playerId: myPlayerId,
      playerName: role === 'gm' ? campaign.gmName || 'Mestre' : myPlayerName || 'Aventureiro',
      playerColor:
        role === 'gm'
          ? '#f59e0b'
          : myCharacter?.playerColor || myPlayerColor || '#38bdf8',
      role,
      inLobby,
      characterId: controlledChar?.id,
      characterName: controlledChar?.name,
    });
  }, [
    isConnected,
    inLobby,
    myPlayerId,
    myPlayerName,
    myPlayerColor,
    role,
    myCharacter?.id,
    myCharacter?.name,
    myCharacter?.playerColor,
    activeCharacterId,
    campaign.gmName,
    campaign.characters,
  ]);

  const autoSyncTimerRef = useRef<number | null>(null);

  const persistHeroToVault = useCallback(
    async (char: Character, opts?: { silent?: boolean }) => {
      const now = new Date().toISOString();
      const vaultId = char.vaultId || char.id;
      const stampedChar: Character = {
        ...char,
        vaultId,
        lastSyncedAt: now,
      };
      const newEntry: SavedHeroEntry = {
        id: vaultId,
        character: stampedChar,
        savedAt: now,
        updatedAt: now,
        originCampaignId: campaignRef.current.id,
        originCampaignName: campaignRef.current.name,
      };

      setSavedHeroes((prev) => {
        const existing = prev.find((x) => x.id === vaultId);
        const merged = mergeSavedHeroLists(prev, [
          { ...newEntry, savedAt: existing?.savedAt || now },
        ]);
        writeLocalHeroVault(merged);
        return merged;
      });

      const payload = JSON.stringify({
        character: stampedChar,
        originCampaignId: campaignRef.current.id,
        originCampaignName: campaignRef.current.name,
      });

      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      try {
        await fetch('/api/characters/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
        });
      } catch {
        // ignore
      }

      const remoteBase = serverUrlRef.current?.trim().replace(/\/+$/, '');
      if (remoteBase && remoteBase !== origin) {
        try {
          await fetch(`${remoteBase}/api/characters/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload,
          });
        } catch {
          // ignore
        }
      }

      if (!opts?.silent) {
        setLastSavedHeroFeedback({ id: vaultId, name: char.name, syncedAt: now });
        window.setTimeout(() => {
          setLastSavedHeroFeedback((curr) => (curr?.syncedAt === now ? null : curr));
        }, 3200);
      }
    },
    []
  );

  const undoHistoryRef = useRef<CampaignState[]>([]);
  const lastUndoPushMsRef = useRef<number>(0);
  const [undoCount, setUndoCount] = useState(0);

  const pushUndoSnapshot = useCallback((snapshot: CampaignState, force = false) => {
    if (roleRef.current !== 'gm') return;
    const now = Date.now();
    if (!force && now - lastUndoPushMsRef.current < 450) return;
    lastUndoPushMsRef.current = now;
    try {
      const cloned = JSON.parse(JSON.stringify(snapshot)) as CampaignState;
      undoHistoryRef.current = [...undoHistoryRef.current.slice(-14), cloned];
      setUndoCount(undoHistoryRef.current.length);
    } catch {
      // ignore clone errors
    }
  }, []);

  const updateCampaign = useCallback(
    (updater: (prev: CampaignState) => CampaignState) => {
      setCampaign((prev) => {
        pushUndoSnapshot(prev);
        const next = syncCampaignDerivedCharacterStats(updater(prev));
        if (socketRef.current?.connected) {
          socketRef.current.emit('campaign:patch', next);
        } else {
          const base = serverUrlRef.current || '';
          fetch(`${base}/api/campaign/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(next),
          }).catch(() => {});
        }

        const knownIds = new Set(savedHeroesRef.current.map((h) => h.id));
        const charsToSync = next.characters.filter(
          (ch) => Boolean(ch.vaultId) || knownIds.has(ch.id)
        );
        if (charsToSync.length > 0) {
          if (autoSyncTimerRef.current) window.clearTimeout(autoSyncTimerRef.current);
          autoSyncTimerRef.current = window.setTimeout(() => {
            charsToSync.forEach((ch) => {
              persistHeroToVault(ch, { silent: true }).catch(() => {});
            });
          }, 800);
        }

        return next;
      });
    },
    [persistHeroToVault, pushUndoSnapshot]
  );

  const undoLastAction = useCallback(() => {
    if (roleRef.current !== 'gm' || undoHistoryRef.current.length === 0) return;
    const previous = undoHistoryRef.current[undoHistoryRef.current.length - 1];
    undoHistoryRef.current = undoHistoryRef.current.slice(0, -1);
    setUndoCount(undoHistoryRef.current.length);
    const restored = syncCampaignDerivedCharacterStats(previous);
    setCampaign(restored);
    if (socketRef.current?.connected) {
      socketRef.current.emit('campaign:patch', restored);
    } else {
      const base = serverUrlRef.current || '';
      fetch(`${base}/api/campaign/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(restored),
      }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (roleRef.current !== 'gm') return;
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z' || e.shiftKey) return;
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
      if (undoHistoryRef.current.length > 0) {
        e.preventDefault();
        undoLastAction();
      }
    };
    window.addEventListener('keydown', onKeyDown);
  }, [undoLastAction]);

  const setCharacterNextAttackOverride = useCallback(
    (characterId: string, override: 'advantage' | 'disadvantage' | null) => {
      updateCampaign((prev) => ({
        ...prev,
        characters: prev.characters.map((c) =>
          c.id === characterId
            ? {
                ...c,
                nextAttackRollOverride: c.nextAttackRollOverride === override ? null : override,
              }
            : c
        ),
      }));
    },
    [updateCampaign]
  );

  const saveCharacterToVault = useCallback(
    async (char: Character, opts?: { silent?: boolean }) => {
      await persistHeroToVault(char, opts);
      // Stamp vaultId on campaign character if not yet linked so future edits auto-sync
      if (!char.vaultId) {
        const targetVaultId = char.id;
        const inCamp = campaignRef.current.characters.some((c) => c.id === char.id);
        if (inCamp) {
          updateCampaign((prev) => ({
            ...prev,
            characters: prev.characters.map((c) =>
              c.id === char.id
                ? { ...c, vaultId: targetVaultId, lastSyncedAt: new Date().toISOString() }
                : c
            ),
          }));
        }
      }
    },
    [persistHeroToVault, updateCampaign]
  );

  const deleteSavedHero = useCallback(async (heroId: string) => {
    setSavedHeroes((prev) => {
      const next = prev.filter((h) => h.id !== heroId);
      writeLocalHeroVault(next);
      return next;
    });
    try {
      await fetch(`/api/characters/saved/${encodeURIComponent(heroId)}`, {
        method: 'DELETE',
      });
    } catch {
      // ignore
    }
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const remoteBase = serverUrlRef.current?.trim().replace(/\/+$/, '');
    if (remoteBase && remoteBase !== origin) {
      try {
        await fetch(`${remoteBase}/api/characters/saved/${encodeURIComponent(heroId)}`, {
          method: 'DELETE',
        });
      } catch {
        // ignore
      }
    }
  }, []);

  const clearHeroJoinFeedback = useCallback(() => {
    setHeroJoinFeedback(null);
  }, []);

  const cancelHeroJoinRequest = useCallback(() => {
    setPendingHeroJoinRequest((curr) => {
      if (socketRef.current?.connected) {
        socketRef.current.emit('request:cancel', {
          requestId: curr?.id,
          requesterPlayerId: myPlayerId,
        });
      }
      return null;
    });
  }, [myPlayerId]);

  const importSavedHeroIntoCampaign = useCallback(
    (rawHero: Character) => {
      const camp = campaignRef.current;
      const normalized = normalizeHeroCharacter(rawHero, camp);
      const vaultId = normalized.vaultId || normalized.id;

      // Players entering with a previously created/saved hero require GM approval ONLY when a GM is online
      const hasOnlineGm = connectedPlayersRef.current.some((p) => p.role === 'gm');
      if (roleRef.current === 'player' && socketRef.current?.connected && hasOnlineGm) {
        setHeroJoinFeedback(null);
        const reqPayload: PlayerRequest = {
          id: `req-join-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          characterId: normalized.id,
          characterName: normalized.name,
          characterPortraitUrl: normalized.portraitUrl,
          playerColor: myPlayerColor || normalized.playerColor || '#38bdf8',
          requesterPlayerId: myPlayerId,
          requesterPlayerName: myPlayerName.trim() || 'Jogador',
          type: 'import-hero',
          label: `Entrar como ${normalized.name} (Nv ${normalized.level})`,
          note: `${myPlayerName.trim() || 'Jogador'} quer entrar na mesa trazendo o herói salvo "${normalized.name}" (Nível ${normalized.level}).`,
          heroPayload: { ...normalized, vaultId },
          createdAt: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        };
        setPendingHeroJoinRequest(reqPayload);
        socketRef.current.emit('request:send', reqPayload);
        return;
      }

      // Avoid ID collision if importing an independent copy, or reclaim same hero if present
      const existingMatch = camp.characters.find(
        (c) => c.id === normalized.id || (c.vaultId && c.vaultId === vaultId)
      );
      const finalCharId = existingMatch ? existingMatch.id : normalized.id;
      const ownerUpdate =
        roleRef.current === 'player'
          ? {
              ownerPlayerId: myPlayerId,
              playerName: myPlayerName || normalized.playerName,
              playerColor: myPlayerColor || normalized.playerColor,
              tokenColor: myPlayerColor || normalized.tokenColor,
            }
          : {};

      const finalChar: Character = {
        ...normalized,
        ...ownerUpdate,
        id: finalCharId,
        vaultId,
        lastSyncedAt: new Date().toISOString(),
      };
      const stats = computeCharacterStats(finalChar, camp);
      const clampedHp = Math.max(0, Math.min(stats.maxHp, finalChar.hp || stats.maxHp));
      const clampedMp = Math.max(0, Math.min(stats.maxMp, finalChar.mp || stats.maxMp));
      finalChar.hp = clampedHp;
      finalChar.mp = clampedMp;

      updateCampaign((prev) => {
        const hasChar = prev.characters.some((c) => c.id === finalChar.id);
        const nextChars = hasChar
          ? prev.characters.map((c) => (c.id === finalChar.id ? finalChar : c))
          : [...prev.characters, finalChar];

        const nextMaps = prev.maps.map((m) => {
          if (m.id !== prev.activeMapId) return m;
          const existingTok = m.tokens.find(
            (t) => t.type === 'character' && t.referenceId === finalChar.id
          );
          if (existingTok) {
            return {
              ...m,
              tokens: m.tokens.map((t) =>
                t.id === existingTok.id
                  ? {
                      ...t,
                      name: finalChar.name.split(' ')[0],
                      color: finalChar.playerColor || finalChar.tokenColor,
                      frameStyle: finalChar.tokenFrameStyle || t.frameStyle,
                      imageUrl: finalChar.portraitUrl || t.imageUrl,
                      hp: finalChar.hp,
                      maxHp: stats.maxHp,
                      defense: stats.defense,
                    }
                  : t
              ),
            };
          }
          const spawnPos = findNearestFreeGridCell(
            m,
            2 + (prev.characters.length % 3),
            4 + (prev.characters.length % 4),
            1
          );
          return {
            ...m,
            tokens: [
              ...m.tokens,
              {
                id: `tok-${finalChar.id}`,
                name: finalChar.name.split(' ')[0],
                type: 'character' as const,
                referenceId: finalChar.id,
                x: spawnPos.x,
                y: spawnPos.y,
                size: 1,
                hp: finalChar.hp,
                maxHp: stats.maxHp,
                defense: stats.defense,
                activeConditionIds: finalChar.activeConditionIds,
                isHidden: false,
                color: finalChar.playerColor || finalChar.tokenColor,
                frameStyle: finalChar.tokenFrameStyle || 'gold',
                imageUrl: finalChar.portraitUrl,
              },
            ],
          };
        });

        return {
          ...prev,
          characters: nextChars,
          maps: nextMaps,
        };
      });

      persistHeroToVault(finalChar, { silent: false }).catch(() => {});
      setActiveCharacterId(finalChar.id);
    },
    [myPlayerColor, myPlayerId, myPlayerName, persistHeroToVault, setActiveCharacterId, updateCampaign]
  );

  const claimCampaignCharacter = useCallback(
    (characterId: string) => {
      const target = campaignRef.current.characters.find((c) => c.id === characterId);
      if (!target) return;

      // Players claiming an existing campaign hero require GM approval ONLY when a GM is online
      const hasOnlineGm = connectedPlayersRef.current.some((p) => p.role === 'gm');
      if (roleRef.current === 'player' && socketRef.current?.connected && hasOnlineGm) {
        setHeroJoinFeedback(null);
        const reqPayload: PlayerRequest = {
          id: `req-claim-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          characterId: target.id,
          characterName: target.name,
          characterPortraitUrl: target.portraitUrl,
          playerColor: myPlayerColor || target.playerColor || '#38bdf8',
          requesterPlayerId: myPlayerId,
          requesterPlayerName: myPlayerName.trim() || 'Jogador',
          type: 'claim-hero',
          label: `Entrar como ${target.name} (Nv ${target.level})`,
          note: `${myPlayerName.trim() || 'Jogador'} quer assumir o controle de "${target.name}" nesta mesa.`,
          createdAt: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        };
        setPendingHeroJoinRequest(reqPayload);
        socketRef.current.emit('request:send', reqPayload);
        return;
      }

      const claimed: Character = {
        ...target,
        ownerPlayerId: myPlayerId,
        playerName: myPlayerName.trim() || target.playerName,
        vaultId: target.vaultId || target.id,
        lastSyncedAt: new Date().toISOString(),
      };
      updateCampaign((prev) => ({
        ...prev,
        characters: prev.characters.map((c) => (c.id === characterId ? claimed : c)),
      }));
      persistHeroToVault(claimed, { silent: false }).catch(() => {});
      setActiveCharacterId(characterId);
    },
    [myPlayerColor, myPlayerId, myPlayerName, persistHeroToVault, setActiveCharacterId, updateCampaign]
  );

  const setMyPlayerColor = useCallback(
    (color: string) => {
      setMyPlayerColorState(color);
      localStorage.setItem('rpg_player_color', color);
      // Sync color to player's character & map tokens
      updateCampaign((prev) => {
        const targetChar = prev.characters.find(
          (c) => c.ownerPlayerId === myPlayerId || c.id === activeCharRef.current
        );
        if (!targetChar || roleRef.current === 'gm') return prev;
        return {
          ...prev,
          characters: prev.characters.map((c) =>
            c.id === targetChar.id ? { ...c, playerColor: color, tokenColor: color } : c
          ),
          maps: prev.maps.map((m) => ({
            ...m,
            tokens: m.tokens.map((t) =>
              t.referenceId === targetChar.id ? { ...t, color } : t
            ),
          })),
        };
      });
    },
    [myPlayerId, updateCampaign]
  );

  const sendRoll = useCallback((entry: Omit<RollLogEntry, 'id' | 'timestamp'>) => {
    const full: RollLogEntry = {
      ...entry,
      id: `roll-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    };
    soundEngine.playSfxPreset('dice');
    if (socketRef.current?.connected) {
      socketRef.current.emit('roll:send', full);
    } else {
      setCampaign((prev) => ({
        ...prev,
        rollLog: [full, ...prev.rollLog].slice(0, 120),
      }));
      if (full.rolledDice && full.rolledDice.length > 0 && (!full.isSecret || roleRef.current === 'gm')) {
        setLatestRollForOverlay(full);
      }
    }
  }, []);

  const openManualRoll = useCallback((req: Omit<PendingManualRoll, 'id'>) => {
    setLatestRollForOverlay(null);
    setPendingManualRoll({
      ...req,
      id: `mroll-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    });
  }, []);

  const cancelManualRoll = useCallback(() => {
    setPendingManualRoll(null);
  }, []);

  const executeManualRoll = useCallback((chosenMode?: RollAdvantageMode) => {
    setPendingManualRoll((curr) => {
      if (!curr) return null;
      const modeToUse = chosenMode ?? curr.advantageMode;
      window.setTimeout(() => {
        curr.onExecute(modeToUse);
      }, 0);
      return null;
    });
  }, []);

  const quickRollFormula = useCallback(
    (
      title: string,
      formula: string,
      rollerName?: string,
      damageFormula?: string,
      damageType?: string
    ) => {
      const activeChar = campaignRef.current.characters.find((c) => c.id === activeCharRef.current);
      const stats = activeChar ? computeCharacterStats(activeChar, campaignRef.current) : undefined;
      const resolvedRollerName =
        rollerName || (roleRef.current === 'gm' ? 'Mestre' : activeChar?.name || myPlayerName);
      const resolvedRollerColor =
        roleRef.current === 'gm' ? '#e0b84c' : activeChar?.playerColor || myPlayerColor;
      const resolvedSkin = (activeChar?.diceSkin || 'gold') as DiceSkin;
      const isD20Roll = formula.toLowerCase().includes('d20');

      openManualRoll({
        title,
        subtitle: damageFormula ? `Com rolagem secundária: ${formatFormulaForDisplay(damageFormula, stats, activeChar)}` : undefined,
        formula,
        displayFormula: formatFormulaForDisplay(formula, stats, activeChar),
        previewDice: buildPreviewDiceForFormula(formula, advantageMode),
        rollerName: resolvedRollerName,
        rollerColor: resolvedRollerColor,
        diceSkin: resolvedSkin,
        allowAdvantageToggle: isD20Roll,
        advantageMode,
        onExecute: (chosenMode) => {
          const currChar = campaignRef.current.characters.find((c) => c.id === activeCharRef.current);
          const currStats = currChar ? computeCharacterStats(currChar, campaignRef.current) : undefined;
          const res = evaluateFormula(formula, currStats, currChar, { advantageMode: chosenMode });

          let dmgTotal: number | undefined;
          let details = `${res.individualRolls.join(' | ')}`;
          const allRolledDice: RolledDieVisual[] = [...res.rolledDice];

          if (damageFormula) {
            const dmgRes = evaluateFormula(damageFormula, currStats, currChar, {
              isCritDamage: res.isCrit,
            });
            dmgTotal = Math.max(1, dmgRes.total);
            details += ` | Dano: ${dmgTotal} (${dmgRes.details})`;
            allRolledDice.push(...dmgRes.rolledDice);
          }

          const activeMap = campaignRef.current.maps.find(
            (m) => m.id === campaignRef.current.activeMapId
          );
          const targetToken = activeMap?.tokens.find((t) => t.id === targetTokenId);
          let hitStatus: 'hit' | 'miss' | null = null;
          if (targetToken && isD20Roll) {
            hitStatus =
              res.isCrit || (!res.isFumble && res.total >= targetToken.defense) ? 'hit' : 'miss';
          }

          sendRoll({
            rollerName: resolvedRollerName,
            rollerRole: roleRef.current,
            rollerColor: resolvedRollerColor,
            diceSkin: resolvedSkin,
            title,
            formula: res.resolvedFormula,
            individualRolls: res.individualRolls,
            rolledDice: allRolledDice,
            d20Natural: res.d20Natural,
            total: res.total,
            isCrit: res.isCrit,
            isFumble: res.isFumble,
            damageTotal: dmgTotal,
            damageType,
            targetName: targetToken?.name,
            targetTokenId: targetToken?.id,
            targetDefense: targetToken?.defense,
            hitStatus,
            isSecret: roleRef.current === 'gm' && secretRoll,
            details,
          });
        },
      });
    },
    [advantageMode, myPlayerColor, myPlayerName, openManualRoll, secretRoll, sendRoll, targetTokenId]
  );

  const startTacticalSavePromptRef = useRef<
    | ((params: {
        kind: TacticalSavePrompt['kind'];
        title: string;
        subtitle?: string;
        saveSkillId: string;
        saveLabel: string;
        dc: number;
        damageFormula?: string;
        damageType?: string;
        halfOnSuccess?: boolean;
        applyConditionId?: string;
        conditionDurationRounds?: number;
        casterCharacterId?: string;
        casterName?: string;
        requiresConcentration?: boolean;
        singleTargetOnly?: boolean;
        tokens: MapToken[];
      }) => void)
    | null
  >(null);

  const playSyncedAbilitySfx = useCallback(
    (params: {
      explicitSfxPreset?: string;
      title?: string;
      damageType?: string;
      range?: string;
      applyConditionId?: string;
      isAttack?: boolean;
    }) => {
      const condName = params.applyConditionId
        ? campaignRef.current.compendium.conditions.find((c) => c.id === params.applyConditionId)?.name
        : undefined;
      const presetKey = resolveAbilitySfxPreset({
        explicitSfxPreset: params.explicitSfxPreset,
        title: params.title,
        damageType: params.damageType,
        range: params.range,
        applyConditionId: params.applyConditionId,
        conditionName: condName,
        isAttack: params.isAttack,
      });
      const payload = { action: 'sfx' as const, presetKey, name: params.title || presetKey };
      if (socketRef.current?.connected) {
        socketRef.current.emit('sound:trigger', payload);
      } else {
        soundEngine.playSfxPreset(presetKey);
      }
    },
    []
  );

  const rollCharacterAction: CampaignContextValue['rollCharacterAction'] = useCallback(
    ({
      characterId,
      title,
      attackFormula,
      damageFormula,
      damageType,
      range,
      actionCost = 'Padrão',
      saveSkillId,
      saveDcFormula,
      costMp,
      costResourceId,
      applyConditionId,
      conditionDurationRounds,
      aoeShape,
      aoeSizeMeters,
      aoeColor,
      aoePersistent,
      extraBonus,
      extraDice,
    }) => {
      // Toggle off if clicking the same skill/attack that is already selected for targeting!
      if (
        pendingAttackRef.current &&
        pendingAttackRef.current.actionTitle === title &&
        pendingAttackRef.current.attackerCharacterId === characterId
      ) {
        setPendingAttackChoice(null);
        return;
      }

      const char = campaignRef.current.characters.find((c) => c.id === characterId);
      if (!char) return;

      const activeMap = campaignRef.current.maps.find(
        (m) => m.id === campaignRef.current.activeMapId
      );
      const myToken = activeMap?.tokens.find(
        (t) => t.type === 'character' && t.referenceId === char.id
      );

      // Dead / Downed Character Guard (0 PV)
      if (char.hp <= 0 || (myToken && myToken.hp <= 0)) {
        setPendingAttackChoice(null);
        showTacticalAlert(
          `${char.name} está caído (0 PV) e não pode atacar ou usar habilidades! Abra a Ficha para o Teste contra a Morte.`
        );
        return;
      }

      const combat = campaignRef.current.combat;
      const activeTurnCb = combat.active ? combat.combatants[combat.currentTurnIndex] : undefined;
      const charCb = combat.active
        ? combat.combatants.find((cb) => cb.referenceId === char.id)
        : undefined;

      if (combat.active && charCb) {
        if (charCb.hp <= 0) {
          setPendingAttackChoice(null);
          showTacticalAlert(`${char.name} está caído (0 PV) e não pode agir!`);
          return;
        }
        if (
          roleRef.current === 'player' &&
          actionCost !== 'Reação' &&
          actionCost !== 'Livre' &&
          activeTurnCb &&
          activeTurnCb.id !== charCb.id
        ) {
          showTacticalAlert(`Aguarde seu turno na iniciativa (${activeTurnCb.name} está agindo).`);
          return;
        }
        if (actionCost === 'Padrão' && charCb.actionAvailable === false) {
          showTacticalAlert('Você já usou sua Ação Padrão neste turno! Use uma Ação Bônus ou encerre o turno.');
          return;
        }
        if (actionCost === 'Bônus' && charCb.bonusActionAvailable === false) {
          showTacticalAlert('Você já usou sua Ação Bônus neste turno!');
          return;
        }
        if (actionCost === 'Reação' && charCb.reactionAvailable === false) {
          showTacticalAlert('Você já usou sua Reação nesta rodada!');
          return;
        }
      }

      const matchingAbilityForAoe = campaignRef.current.compendium.abilities.find(
        (ab) => ab.name.trim().toLowerCase() === title.trim().toLowerCase()
      );
      const usesCheck = checkAbilityUsesRemaining(char, matchingAbilityForAoe);
      if (!usesCheck.ok) {
        showTacticalAlert(usesCheck.error);
        return;
      }
      const resolvedCostResId = costResourceId || matchingAbilityForAoe?.costResourceId || 'mp';

      if (costMp && costMp > 0) {
        if (resolvedCostResId === 'hp') {
          if (char.hp <= costMp) {
            showTacticalAlert(`Vida (PV) insuficiente para conjurar (${char.hp}/${costMp} PV).`);
            return;
          }
        } else if (resolvedCostResId === 'mp') {
          if (char.mp < costMp) {
            showTacticalAlert(
              `${campaignRef.current.settings.resourceName} insuficiente (${char.mp}/${costMp} ${campaignRef.current.settings.resourceShort}).`
            );
            return;
          }
        } else {
          const resDef = (campaignRef.current.compendium.customResources || []).find(
            (r) => r.id === resolvedCostResId
          );
          if (resDef) {
            const st = getCharacterCustomResourceState(char, resDef);
            if (st.current < costMp) {
              showTacticalAlert(`${resDef.name} insuficiente (${st.current}/${costMp} ${resDef.shortName}).`);
              return;
            }
          }
        }
      }

      const targetToken = activeMap?.tokens.find((t) => t.id === targetTokenId);
      const resolvedAoeShape = aoeShape || matchingAbilityForAoe?.aoeShape;
      const resolvedAoeSize = aoeSizeMeters || matchingAbilityForAoe?.aoeSizeMeters;
      const resolvedAoeColor = aoeColor || matchingAbilityForAoe?.aoeColor;
      const resolvedAoePersistent =
        aoePersistent !== undefined
          ? aoePersistent
          : matchingAbilityForAoe?.aoePersistent;
      const resolvedCreatesSurface = matchingAbilityForAoe?.createsSurface;
      const resolvedAoeTargetFilter = matchingAbilityForAoe?.aoeTargetFilter;
      const isSelfRange = Boolean(range && range.trim().toLowerCase().includes('pessoal'));
      const isHealingAction = damageType?.toLowerCase() === 'cura';
      const isTargetedAction = Boolean(
        resolvedAoeShape ||
          (!isSelfRange && (isHealingAction || attackFormula || damageFormula || applyConditionId))
      );

      if (isTargetedAction) {
        const choice: PendingAttackChoice = {
          attackerTokenId: myToken?.id,
          attackerName: char.name,
          attackerColor: char.playerColor || char.tokenColor,
          attackerImageUrl: char.portraitUrl,
          attackerFrame: char.tokenFrameStyle || 'gold',
          attackerCharacterId: char.id,
          diceSkin: char.diceSkin || 'gold',
          actionTitle: title,
          attackFormula: isHealingAction ? undefined : attackFormula,
          damageFormula,
          damageType,
          range,
          actionCost,
          costMp,
          costResourceId: resolvedCostResId,
          applyConditionId,
          conditionDurationRounds,
          requiresConcentration: Boolean(matchingAbilityForAoe?.requiresConcentration),
          singleTargetOnly: Boolean(matchingAbilityForAoe?.singleTargetOnly),
          sfxPreset: matchingAbilityForAoe?.sfxPreset,
          saveSkillId,
          saveDcFormula,
          aoeShape: resolvedAoeShape,
          aoeSizeMeters: resolvedAoeSize,
          aoeColor: resolvedAoeColor,
          aoePersistent: resolvedAoePersistent,
          aoeTargetFilter: resolvedAoeTargetFilter,
          createsSurface: resolvedCreatesSurface,
        };
        if (activeMap && (activeMap.tokens.length > 0 || resolvedAoeShape)) {
          // Always require explicit target selection or AoE placement on map
          setTargetTokenId(null);
          setPendingAttackChoice(choice);
          return;
        }
      }

      const stats = computeCharacterStats(char, campaignRef.current);
      const matchingAbility = matchingAbilityForAoe;
      const shouldSetConcentration = Boolean(matchingAbility?.requiresConcentration);
      const isSingleTargetOnly = Boolean(matchingAbility?.singleTargetOnly);
      const targetCharIdForSelf =
        !isSelfRange && targetToken?.type === 'character' ? targetToken.referenceId : char.id;
      const targetTokIdForSelf = !isSelfRange && targetToken ? targetToken.id : myToken?.id;
      const targetNameForSelf = !isSelfRange && targetToken ? targetToken.name : char.name;

      void (async () => {
        const conflict = await confirmAbilityConflictIfNeeded(char, {
          abilityName: title,
          requiresConcentration: shouldSetConcentration,
          singleTargetOnly: isSingleTargetOnly,
          newTargetTokenId: targetTokIdForSelf,
          newTargetName: targetNameForSelf,
        });
        if (!conflict.proceed) return;

        playSyncedAbilitySfx({
          explicitSfxPreset: matchingAbility?.sfxPreset,
          title,
          damageType,
          range,
          applyConditionId,
          isAttack: Boolean(attackFormula),
        });

        updateCampaign((prev) => {
          const base = removeTrackedEffectsFromState(prev, char.id, conflict.effectsToClear);
          return {
            ...base,
            characters: base.characters.map((c) => {
              if (c.id !== char.id) return c;
              const res = deductCharacterResource(
                c,
                costMp,
                resolvedCostResId,
                base.compendium.customResources
              );
              let nextChar: Character = {
                ...c,
                ...res,
                abilityUsesRemaining: decrementAbilityUse(c, matchingAbility),
                ...(shouldSetConcentration ? { concentratingSpell: title } : {}),
              };
              if (applyConditionId && (shouldSetConcentration || isSingleTargetOnly)) {
                nextChar = upsertTrackedEffectOnCharacter(nextChar, {
                  abilityKey: normalizeAbilityKey(title),
                  abilityName: title,
                  conditionId: applyConditionId,
                  targetTokenIds: targetTokIdForSelf ? [targetTokIdForSelf] : [],
                  targetCharacterIds: targetCharIdForSelf ? [targetCharIdForSelf] : [],
                  targetNames: [targetNameForSelf],
                  isConcentration: shouldSetConcentration,
                  singleTargetOnly: isSingleTargetOnly,
                });
              }
              return nextChar;
            }),
            combat:
              base.combat.active && charCb && (actionCost !== 'Livre' || shouldSetConcentration)
                ? {
                    ...base.combat,
                    combatants: base.combat.combatants.map((cb) =>
                      cb.id !== charCb.id
                        ? cb
                        : {
                            ...cb,
                            actionAvailable: actionCost === 'Padrão' ? false : cb.actionAvailable,
                            bonusActionAvailable:
                              actionCost === 'Bônus' ? false : cb.bonusActionAvailable,
                            reactionAvailable:
                              actionCost === 'Reação' ? false : cb.reactionAvailable,
                            ...(shouldSetConcentration ? { concentratingSpell: title } : {}),
                          }
                    ),
                  }
                : base.combat,
          };
        });

        if (applyConditionId) {
          const condDef = campaignRef.current.compendium.conditions.find(
            (c) => c.id === applyConditionId
          );
          if (condDef) {
            updateCampaign((prev) => ({
              ...prev,
              characters: prev.characters.map((c) => {
                if (c.id !== targetCharIdForSelf) return c;
                if (c.activeConditionIds.includes(applyConditionId)) return c;
                return { ...c, activeConditionIds: [...c.activeConditionIds, applyConditionId] };
              }),
              maps: targetTokIdForSelf
                ? prev.maps.map((m) =>
                    m.id !== prev.activeMapId
                      ? m
                      : {
                          ...m,
                          tokens: m.tokens.map((t) => {
                            if (t.id !== targetTokIdForSelf) return t;
                            if (t.activeConditionIds.includes(applyConditionId)) return t;
                            return {
                              ...t,
                              activeConditionIds: [...t.activeConditionIds, applyConditionId],
                            };
                          }),
                        }
                  )
                : prev.maps,
              combat: prev.combat.active
                ? {
                    ...prev.combat,
                    combatants: prev.combat.combatants.map((cb) => {
                      if (
                        (targetTokIdForSelf && cb.tokenId === targetTokIdForSelf) ||
                        (!targetTokIdForSelf && cb.referenceId === char.id)
                      ) {
                        return {
                          ...cb,
                          effects: [
                            ...cb.effects,
                            {
                              id: `eff-${Date.now()}`,
                              label: condDef.name,
                              conditionId: applyConditionId,
                              remainingRounds: conditionDurationRounds || 3,
                              sourceName: char.name,
                            },
                          ],
                        };
                      }
                      return cb;
                    }),
                  }
                : prev.combat,
            }));
          }
        }
      })();

      const combinedExtraBonus = (extraBonus || 0) + (attackFormula ? stats.attackBonusExtra : 0);
      const combinedDice = [
        ...(extraDice || []),
        ...(attackFormula ? stats.attackDiceBonuses : []),
      ];

      const executeActionRoll = (chosenMode: RollAdvantageMode) => {
        const attackRes = attackFormula
          ? evaluateFormula(attackFormula, stats, char, {
              advantageMode: chosenMode,
              extraFlatBonus: combinedExtraBonus,
              extraDiceBonuses: combinedDice,
            })
          : null;

        const allRolledDice: RolledDieVisual[] = [...(attackRes?.rolledDice || [])];

        let dmgTotal: number | undefined;
        let dmgDetails = '';
        if (damageFormula) {
          const isHealing = damageType?.toLowerCase() === 'cura';
          const dmgRes = evaluateFormula(damageFormula, stats, char, {
            extraFlatBonus: !isHealing && attackFormula ? stats.damageBonusExtra : 0,
            isCritDamage: attackRes?.isCrit,
          });
          dmgTotal = Math.max(1, dmgRes.total);
          dmgDetails = `${damageType || 'Dano'}: ${dmgTotal} (${dmgRes.details})`;
          allRolledDice.push(...dmgRes.rolledDice);
        }

        let hitStatus: 'hit' | 'miss' | null = null;
        if (attackRes && targetToken) {
          hitStatus =
            attackRes.isCrit || (!attackRes.isFumble && attackRes.total >= targetToken.defense)
              ? 'hit'
              : 'miss';
        }

        let saveText = '';
        if (saveSkillId && saveDcFormula) {
          const dcRes = evaluateFormula(saveDcFormula, stats, char);
          const skillName =
            campaignRef.current.compendium.skills.find((s) => s.id === saveSkillId)?.name ||
            saveSkillId;
          saveText = `CD ${dcRes.total} (${skillName})`;
        }

        const detailsParts = [
          attackRes ? `Ataque: ${attackRes.individualRolls.join(' ')}` : '',
          dmgDetails,
          saveText,
          costMp ? `-${costMp} ${campaignRef.current.settings.resourceShort}` : '',
        ].filter(Boolean);

        sendRoll({
          rollerName: char.name,
          rollerRole: roleRef.current,
          rollerColor: char.playerColor || char.tokenColor,
          diceSkin: char.diceSkin || 'gold',
          title,
          formula: attackRes ? attackRes.resolvedFormula : damageFormula || 'Efeito',
          individualRolls: attackRes ? attackRes.individualRolls : [],
          rolledDice: allRolledDice,
          d20Natural: attackRes?.d20Natural,
          total: attackRes ? attackRes.total : dmgTotal || 0,
          isCrit: attackRes?.isCrit,
          isFumble: attackRes?.isFumble,
          damageTotal: dmgTotal,
          damageType,
          targetName: targetToken?.name,
          targetTokenId: targetToken?.id,
          targetDefense: targetToken?.defense,
          hitStatus,
          isSecret: roleRef.current === 'gm' && secretRoll,
          details: detailsParts.join(' • ') || 'Habilidade ativada.',
        });
      };

      const activeFormula = attackFormula || damageFormula;
      if (activeFormula && /\d*d\d+/i.test(activeFormula)) {
        openManualRoll({
          title,
          subtitle: damageType?.toLowerCase() === 'cura' ? 'Rolagem de Cura' : undefined,
          formula: activeFormula,
          displayFormula: formatFormulaForDisplay(activeFormula, stats, char),
          previewDice: buildPreviewDiceForFormula(
            activeFormula,
            attackFormula ? advantageMode : 'normal'
          ),
          rollerName: char.name,
          rollerColor: char.playerColor || char.tokenColor,
          diceSkin: char.diceSkin || 'gold',
          allowAdvantageToggle: Boolean(attackFormula && attackFormula.toLowerCase().includes('d20')),
          advantageMode: attackFormula ? advantageMode : 'normal',
          onExecute: executeActionRoll,
        });
      } else {
        executeActionRoll(advantageMode);
      }
    },
    [advantageMode, openManualRoll, secretRoll, sendRoll, targetTokenId, updateCampaign]
  );

  const pushCombatLog = useCallback(
    (entry: Omit<CombatLogEntry, 'id' | 'timestamp'>) => {
      const full: CombatLogEntry = {
        ...entry,
        id: `clog-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toISOString(),
      };
      updateCampaign((prev) => ({
        ...prev,
        combatLog: [...(prev.combatLog || []).slice(-119), full],
      }));
    },
    [updateCampaign]
  );

  const awardXp = useCallback(
    (characterIds: string[] | 'all', amount: number) => {
      const cleanAmt = Math.round(amount);
      if (!Number.isFinite(cleanAmt) || cleanAmt === 0) return;
      const ASI_LEVELS = [4, 8, 12, 16, 19];
      const curr = campaignRef.current;
      const targetIds = new Set(
        characterIds === 'all' ? curr.characters.map((c) => c.id) : characterIds
      );
      if (targetIds.size === 0) return;

      const leveledUpNames: string[] = [];
      const newLogs: CombatLogEntry[] = [];
      const nowIso = new Date().toISOString();

      updateCampaign((prev) => {
        const thresholds = prev.settings.xpThresholds;
        const nextChars = prev.characters.map((c) => {
          if (!targetIds.has(c.id)) return c;
          const prevXp = c.xp ?? 0;
          const nextXp = Math.max(0, prevXp + cleanAmt);
          const computedLv = computeLevelForXp(nextXp, thresholds);
          const nextLevel = Math.max(c.level, computedLv);

          newLogs.push({
            id: `clog-xp-${Date.now()}-${c.id}`,
            timestamp: nowIso,
            category: 'xp',
            actorName: c.name,
            actorKind: 'hero',
            actorColor: c.playerColor || c.tokenColor,
            summary: `recebeu ${cleanAmt > 0 ? `+${cleanAmt}` : cleanAmt} XP (Total: ${nextXp} XP)`,
          });

          if (nextLevel > c.level) {
            let gainedAsi = 0;
            const unlockedAbilities: string[] = [];
            const cls = prev.compendium.classes.find((cl) => cl.id === c.classId);
            for (let lv = c.level + 1; lv <= nextLevel; lv++) {
              if (ASI_LEVELS.includes(lv)) gainedAsi += 2;
              cls?.levelFeatures
                .filter((f) => f.level === lv)
                .forEach((f) => {
                  if (f.abilityIds) unlockedAbilities.push(...f.abilityIds);
                });
            }
            const draft: Character = {
              ...c,
              xp: nextXp,
              level: nextLevel,
              unspentAttributePoints: (c.unspentAttributePoints ?? 0) + gainedAsi,
              knownAbilityIds: Array.from(new Set([...c.knownAbilityIds, ...unlockedAbilities])),
            };
            const nextStats = computeCharacterStats(draft, prev);
            leveledUpNames.push(`${c.name} → Nv ${nextLevel}`);
            newLogs.push({
              id: `clog-lv-${Date.now()}-${c.id}`,
              timestamp: nowIso,
              category: 'levelup',
              actorName: c.name,
              actorKind: 'hero',
              actorColor: c.playerColor || c.tokenColor,
              summary: `subiu automaticamente para o Nível ${nextLevel}!${gainedAsi > 0 ? ` (+${gainedAsi} pts atributo)` : ''}`,
            });
            return {
              ...draft,
              hp: nextStats.maxHp,
              mp: nextStats.maxMp,
            };
          }

          return { ...c, xp: nextXp };
        });

        return {
          ...prev,
          characters: nextChars,
          combatLog: [...(prev.combatLog || []).slice(-(120 - newLogs.length)), ...newLogs],
        };
      });

      if (leveledUpNames.length > 0) {
        soundEngine.playSfxPreset('levelup');
        setTacticalAlert({
          id: `xp-lv-${Date.now()}`,
          message: `✨ Level Up Automático: ${leveledUpNames.join(' • ')}!`,
        });
        setTimeout(() => setTacticalAlert(null), 5000);
      }
    },
    [updateCampaign]
  );

  const applyDamage = useCallback(
    (
      targetTokenIdParam: string,
      amount: number,
      isHeal = false,
      rollId?: string,
      damageType?: string,
      applyConditionId?: string,
      conditionDurationRounds?: number
    ) => {
      pushUndoSnapshot(campaignRef.current, true);
      if (socketRef.current?.connected) {
        socketRef.current.emit('combat:apply-damage', {
          targetTokenId: targetTokenIdParam,
          amount,
          isHeal,
          rollId,
          damageType,
          applyConditionId,
          conditionDurationRounds,
        });
      } else {
        const curr = campaignRef.current;
        const tok = curr.maps.flatMap((m) => m.tokens).find((t) => t.id === targetTokenIdParam);
        const char = curr.characters.find(
          (c) => c.id === tok?.referenceId || c.id === targetTokenIdParam
        );
        const mon =
          tok?.type === 'monster' && tok.referenceId
            ? curr.compendium.monsters.find((m) => m.id === tok.referenceId)
            : undefined;
        let finalAmt = Math.abs(amount);
        if (!isHeal && damageType) {
          finalAmt = resolveDamageWithAffinities(finalAmt, damageType, {
            immunities: char?.damageImmunities || mon?.damageImmunities,
            resistances: char?.damageResistances || mon?.damageResistances,
            vulnerabilities: char?.damageVulnerabilities || mon?.damageVulnerabilities,
            activeConditionIds: [
              ...(tok?.activeConditionIds || []),
              ...(char?.activeConditionIds || []),
            ],
          }).finalAmount;
        }
        let tempAbsorbed = 0;
        let dmgAfterTemp = finalAmt;
        if (!isHeal && finalAmt > 0 && char && (char.tempHp || 0) > 0) {
          tempAbsorbed = Math.min(char.tempHp || 0, finalAmt);
          dmgAfterTemp = finalAmt - tempAbsorbed;
        }
        const delta = isHeal ? finalAmt : -dmgAfterTemp;
        const condDef = applyConditionId
          ? curr.compendium.conditions.find((c) => c.id === applyConditionId)
          : undefined;

        updateCampaign((prev) => ({
          ...prev,
          characters: prev.characters.map((c) => {
            if (c.id !== tok?.referenceId && c.id !== targetTokenIdParam) return c;
            const maxHp = Math.max(
              1,
              tok?.maxHp || c.maxHpOverride || computeCharacterStats(c, prev).maxHp
            );
            const nextHp = Math.max(0, Math.min(maxHp, c.hp + delta));
            const nextTempHp = Math.max(0, (c.tempHp || 0) - tempAbsorbed);
            const nextConds =
              applyConditionId && !c.activeConditionIds.includes(applyConditionId)
                ? [...c.activeConditionIds, applyConditionId]
                : c.activeConditionIds;
            return { ...c, hp: nextHp, tempHp: nextTempHp, activeConditionIds: nextConds };
          }),
          maps: prev.maps.map((m) => ({
            ...m,
            tokens: m.tokens.map((t) => {
              if (t.id !== targetTokenIdParam) return t;
              const nextConds =
                applyConditionId && !(t.activeConditionIds || []).includes(applyConditionId)
                  ? [...(t.activeConditionIds || []), applyConditionId]
                  : t.activeConditionIds || [];
              return {
                ...t,
                hp: Math.max(0, Math.min(t.maxHp, t.hp + delta)),
                activeConditionIds: nextConds,
              };
            }),
          })),
          combat: prev.combat.active
            ? {
                ...prev.combat,
                combatants: prev.combat.combatants.map((cb) => {
                  const matches = cb.tokenId
                    ? cb.tokenId === targetTokenIdParam
                    : Boolean(tok?.referenceId && cb.referenceId === tok.referenceId);
                  if (!matches) return cb;
                  const nextEffects =
                    applyConditionId && condDef
                      ? [
                          ...cb.effects.filter((ef) => ef.conditionId !== applyConditionId),
                          {
                            id: `eff-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                            label: condDef.name,
                            conditionId: applyConditionId,
                            remainingRounds: conditionDurationRounds || 3,
                            sourceName: 'Combate',
                          },
                        ]
                      : cb.effects;
                  return {
                    ...cb,
                    hp: Math.max(0, Math.min(cb.maxHp, cb.hp + delta)),
                    effects: nextEffects,
                  };
                }),
              }
            : prev.combat,
          rollLog: rollId
            ? prev.rollLog.map((r) => (r.id === rollId ? { ...r, applied: true } : r))
            : prev.rollLog,
        }));
      }
    },
    [pushUndoSnapshot, updateCampaign]
  );

  const partyRest = useCallback(
    (kind: 'short' | 'long') => {
      const curr = campaignRef.current;
      const livingChars = curr.characters.filter(
        (c) => c.hp > 0 && !c.deathSaves?.dead && (c.deathSaves?.failures || 0) < 3
      );
      if (livingChars.length === 0) {
        const id = `rest-empty-${Date.now()}`;
        setTacticalAlert({ id, message: 'Nenhum herói vivo disponível para descansar.' });
        window.setTimeout(() => {
          setTacticalAlert((curr) => (curr?.id === id ? null : curr));
        }, 3500);
        return;
      }

      const hpByCharId = new Map<string, { hp: number; maxHp: number }>();
      const allConcEffectsToClear: Array<{ casterId: string; effects: ActiveTrackedAbilityEffect[] }> = [];

      updateCampaign((prev) => {
        let working = prev;
        if (kind === 'long') {
          prev.characters.forEach((c) => {
            const concEffs = (c.activeTrackedEffects || []).filter((e) => e.isConcentration);
            if (concEffs.length > 0) {
              allConcEffectsToClear.push({ casterId: c.id, effects: concEffs });
            }
          });
          allConcEffectsToClear.forEach(({ casterId, effects }) => {
            working = removeTrackedEffectsFromState(working, casterId, effects);
          });
        }

        const nextCharacters = working.characters.map((c) => {
          if (c.hp <= 0 || c.deathSaves?.dead || (c.deathSaves?.failures || 0) >= 3) {
            return c;
          }
          const stats = computeCharacterStats(c, working);
          const charClass = working.compendium.classes.find((cl) => cl.id === c.classId);
          let nextHp = stats.maxHp;
          let nextMp = stats.maxMp;
          if (kind === 'short') {
            const hitDie = charClass?.hitDie || 8;
            const conMod = stats.attributes['con']?.mod || 0;
            const rollHeal = Math.max(1, Math.floor(Math.random() * hitDie) + 1 + conMod);
            nextHp = Math.min(stats.maxHp, c.hp + rollHeal);
            nextMp = Math.min(stats.maxMp, c.mp + Math.ceil(stats.maxMp / 3));
          }
          hpByCharId.set(c.id, { hp: nextHp, maxHp: stats.maxHp });

          const resetUses: Record<string, number> =
            kind === 'long' ? {} : { ...(c.abilityUsesRemaining || {}) };
          c.knownAbilityIds.forEach((aid) => {
            const ab = working.compendium.abilities.find((a) => a.id === aid);
            if (!ab?.maxUsesPerRest) return;
            if (kind === 'long' || ab.restType === 'curto') {
              resetUses[aid] = ab.maxUsesPerRest;
            }
          });

          const nextCustomRes = { ...(c.customResourceValues || {}) };
          (working.compendium.customResources || []).forEach((resDef) => {
            if (kind === 'long' ? resDef.resetOn === 'short' || resDef.resetOn === 'long' : resDef.resetOn === 'short') {
              const st = getCharacterCustomResourceState(c, resDef);
              nextCustomRes[resDef.id] = { ...(nextCustomRes[resDef.id] || {}), current: st.max };
            }
          });

          return {
            ...c,
            hp: nextHp,
            mp: nextMp,
            tempHp: kind === 'long' ? 0 : c.tempHp,
            abilityUsesRemaining: resetUses,
            resourceTrackers: (c.resourceTrackers || []).map((tr) =>
              kind === 'long'
                ? tr.resetOn === 'short' || tr.resetOn === 'long'
                  ? { ...tr, current: tr.max }
                  : tr
                : tr.resetOn === 'short'
                  ? { ...tr, current: tr.max }
                  : tr
            ),
            customResourceValues: nextCustomRes,
            activeConditionIds:
              kind === 'long'
                ? c.activeConditionIds.filter((id) => id !== 'cond-exausto')
                : c.activeConditionIds,
            concentratingSpell: kind === 'long' ? null : c.concentratingSpell,
            deathSaves: { successes: 0, failures: 0 },
          };
        });

        const logEntry: CombatLogEntry = {
          id: `clog-rest-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          category: 'heal',
          actorName: 'Grupo',
          actorKind: 'system',
          actorColor: kind === 'long' ? '#a78bfa' : '#f59e0b',
          summary:
            kind === 'long'
              ? `concluiu um Descanso Longo (${livingChars.length} heróis com PV, recursos e cargas restaurados!)`
              : `concluiu um Descanso Curto (${livingChars.length} heróis recuperaram fôlego e cargas curtas!)`,
        };

        return {
          ...working,
          characters: nextCharacters,
          maps: working.maps.map((m) => ({
            ...m,
            tokens: m.tokens.map((t) => {
              if (t.type !== 'character' || !t.referenceId) return t;
              const rec = hpByCharId.get(t.referenceId);
              if (!rec) return t;
              return {
                ...t,
                hp: Math.min(rec.maxHp, rec.hp),
                maxHp: rec.maxHp,
                activeConditionIds:
                  kind === 'long'
                    ? (t.activeConditionIds || []).filter((id) => id !== 'cond-exausto')
                    : t.activeConditionIds || [],
              };
            }),
          })),
          combat: {
            ...working.combat,
            combatants: working.combat.combatants.map((cb) => {
              if (!cb.referenceId) return cb;
              const rec = hpByCharId.get(cb.referenceId);
              if (!rec) return cb;
              return {
                ...cb,
                hp: Math.min(rec.maxHp, rec.hp),
                maxHp: rec.maxHp,
                ...(kind === 'long' ? { concentratingSpell: null } : {}),
              };
            }),
          },
          combatLog: [...(working.combatLog || []).slice(-119), logEntry],
        };
      });

      const banner: RestBannerState = {
        id: `rest-${Date.now()}`,
        kind,
        summary:
          kind === 'long'
            ? `${livingChars.length} heróis restauraram 100% de PV, recursos e cargas de habilidades.`
            : `${livingChars.length} heróis recuperaram PV (Dado de Vida), 1/3 de energia e cargas curtas.`,
        affectedCount: livingChars.length,
      };
      if (socketRef.current?.connected) {
        socketRef.current.emit('rest:announce', banner);
      } else {
        setActiveRestBanner(banner);
        soundEngine.playSfxPreset('campfire');
        window.setTimeout(() => {
          setActiveRestBanner((b) => (b?.id === banner.id ? null : b));
        }, 4200);
      }
    },
    [updateCampaign]
  );

  const recordCombatStat = useCallback(
    (
      actorName: string,
      actorColor: string,
      delta: { damage?: number; healing?: number; crits?: number }
    ) => {
      if (!campaignRef.current.combat.active || !actorName) return;
      const key = actorName.trim().toLowerCase();
      const prev = combatStatsRef.current[key] || {
        name: actorName,
        color: actorColor || '#e0b84c',
        damage: 0,
        healing: 0,
        crits: 0,
      };
      combatStatsRef.current[key] = {
        ...prev,
        damage: prev.damage + Math.max(0, delta.damage || 0),
        healing: prev.healing + Math.max(0, delta.healing || 0),
        crits: prev.crits + Math.max(0, delta.crits || 0),
      };
    },
    []
  );

  const fireProjectileVfx = useCallback(
    (params: {
      fromToken?: MapToken;
      toToken?: MapToken;
      toX?: number;
      toY?: number;
      title?: string;
      damageType?: string;
      applyConditionId?: string;
      range?: string;
      kind?: ProjectileVfxKind;
      isCrit?: boolean;
    }) => {
      const curr = campaignRef.current;
      const activeMap = curr.maps.find((m) => m.id === curr.activeMapId);
      if (!activeMap) return;
      const toX =
        typeof params.toX === 'number'
          ? params.toX
          : params.toToken
            ? params.toToken.x + (params.toToken.size || 1) / 2
            : undefined;
      const toY =
        typeof params.toY === 'number'
          ? params.toY
          : params.toToken
            ? params.toToken.y + (params.toToken.size || 1) / 2
            : undefined;
      if (toX === undefined || toY === undefined) return;
      const fromX = params.fromToken
        ? params.fromToken.x + (params.fromToken.size || 1) / 2
        : toX;
      const fromY = params.fromToken
        ? params.fromToken.y + (params.fromToken.size || 1) / 2
        : toY;

      const proj: MapProjectileVfx = {
        id: `proj-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        mapId: activeMap.id,
        fromX,
        fromY,
        toX,
        toY,
        kind:
          params.kind ||
          detectProjectileKind({
            title: params.title,
            damageType: params.damageType,
            applyConditionId: params.applyConditionId,
            range: params.range,
          }),
        isCrit: params.isCrit,
        label: params.title,
      };
      if (socketRef.current?.connected) {
        socketRef.current.emit('vfx:projectile', proj);
      } else {
        setProjectileVfx((prev) => [...prev, proj]);
        if (proj.isCrit) {
          setScreenShakeActive(true);
          soundEngine.playSfxPreset('crit');
          window.setTimeout(() => setScreenShakeActive(false), 520);
        }
        window.setTimeout(() => {
          setProjectileVfx((prev) => prev.filter((p) => p.id !== proj.id));
        }, 1300);
      }
    },
    []
  );

  const triggerElementalComboAtCells = useCallback(
    (
      seedCells: Array<{ x: number; y: number }>,
      damageType: string | undefined,
      actorName: string,
      actorColor: string
    ) => {
      const curr = campaignRef.current;
      const activeMap = curr.maps.find((m) => m.id === curr.activeMapId);
      if (!activeMap || !activeMap.elementalSurfaces || seedCells.length === 0) return;
      const combo = resolveElementalSurfaceCombo(activeMap.elementalSurfaces, seedCells, damageType);
      if (!combo || !combo.triggered) return;

      const cellKeySet = new Set(combo.affectedCells.map((c) => `${c.x},${c.y}`));
      // 1. Find all living visible tokens standing on any connected puddle cell
      const affectedTokens = activeMap.tokens.filter((tok) => {
        if (tok.isHidden || tok.hp <= 0) return false;
        const size = Math.max(1, tok.size || 1);
        for (let dx = 0; dx < size; dx++) {
          for (let dy = 0; dy < size; dy++) {
            if (cellKeySet.has(`${Math.floor(tok.x) + dx},${Math.floor(tok.y) + dy}`)) {
              return true;
            }
          }
        }
        return false;
      });

      const comboRoll = evaluateFormula(combo.bonusDamageFormula);
      const bonusDmg = Math.max(1, comboRoll.total);

      // 2. Atomically transform connected puddle cells AND append BG3 combat log in ONE updateCampaign call
      const logEntry: CombatLogEntry = {
        id: `clog-combo-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        category: 'spell',
        actorName: actorName || 'Terreno',
        actorKind: 'system',
        actorColor: actorColor || '#38bdf8',
        summary: `COMBO ELEMENTAL: ${combo.comboName} propagou por ${combo.affectedCells.length} células e atingiu ${affectedTokens.length} alvo(s)!`,
        detail: `${combo.bonusDamageFormula} = ${bonusDmg} (${combo.bonusDamageType})`,
      };
      updateCampaign((prev) => ({
        ...prev,
        maps: prev.maps.map((m) => {
          if (m.id !== activeMap.id) return m;
          const nextSurfaces = { ...(m.elementalSurfaces || {}) };
          combo.affectedCells.forEach((c) => {
            nextSurfaces[`${c.x},${c.y}`] = combo.nextSurface;
          });
          return { ...m, elementalSurfaces: nextSurfaces };
        }),
        combatLog: [...(prev.combatLog || []).slice(-119), logEntry],
      }));

      // 3. Play synced SFX + VFX burst at puddle center
      const centerCell = combo.affectedCells[Math.floor(combo.affectedCells.length / 2)];
      if (socketRef.current?.connected) {
        socketRef.current.emit('sound:trigger', {
          action: 'sfx',
          presetKey: combo.sfx,
          name: combo.comboName,
        });
      } else {
        soundEngine.playSfxPreset(combo.sfx);
      }
      fireProjectileVfx({
        toX: centerCell.x + 0.5,
        toY: centerCell.y + 0.5,
        kind: combo.vfxKind,
        isCrit: true,
        title: combo.comboName,
      });

      // 4. Apply bonus damage/condition safely after surface update lands
      if (affectedTokens.length > 0) {
        recordCombatStat(actorName, actorColor, { damage: bonusDmg * affectedTokens.length });
        window.setTimeout(() => {
          affectedTokens.forEach((tok) => {
            applyDamage(
              tok.id,
              bonusDmg,
              false,
              undefined,
              combo.bonusDamageType,
              combo.applyConditionId,
              2
            );
          });
        }, 160);
      }
    },
    [applyDamage, fireProjectileVfx, recordCombatStat, updateCampaign]
  );

  const endCombatWithSummary = useCallback(() => {
    const curr = campaignRef.current;
    const combat = curr.combat;
    const rounds = Math.max(1, combat.round || 1);
    const enemiesDefeated = combat.combatants.filter(
      (cb) => cb.type === 'monster' && cb.hp <= 0
    ).length;

    const participants = Object.values(combatStatsRef.current).sort(
      (a, b) => b.damage - a.damage || b.healing - a.healing
    );
    const totalDamageDealt = participants.reduce((acc, p) => acc + p.damage, 0);
    const totalHealingDone = participants.reduce((acc, p) => acc + p.healing, 0);

    const topDmgEntry = [...participants].sort((a, b) => b.damage - a.damage)[0];
    const topHealEntry = [...participants].sort((a, b) => b.healing - a.healing)[0];
    const topCritEntry = [...participants].sort((a, b) => b.crits - a.crits)[0];

    const summary: CombatMvpSummary = {
      id: `mvp-${Date.now()}`,
      rounds,
      totalDamageDealt,
      totalHealingDone,
      enemiesDefeated,
      topDamageDealer:
        topDmgEntry && topDmgEntry.damage > 0
          ? { name: topDmgEntry.name, color: topDmgEntry.color, value: topDmgEntry.damage }
          : undefined,
      topHealer:
        topHealEntry && topHealEntry.healing > 0
          ? { name: topHealEntry.name, color: topHealEntry.color, value: topHealEntry.healing }
          : undefined,
      topCrits:
        topCritEntry && topCritEntry.crits > 0
          ? { name: topCritEntry.name, color: topCritEntry.color, value: topCritEntry.crits }
          : undefined,
      participants,
    };

    combatStatsRef.current = {};
    setOpportunityQueue([]);
    if (socketRef.current?.connected) {
      socketRef.current.emit('opportunity:show', null);
    }

    updateCampaign((prev) => ({
      ...prev,
      combat: {
        active: false,
        round: 1,
        currentTurnIndex: 0,
        combatants: [],
      },
    }));

    if (socketRef.current?.connected) {
      socketRef.current.emit('combat:mvp-summary', summary);
    } else {
      setActiveMvpSummary(summary);
      soundEngine.playSfxPreset('levelup');
    }
  }, [updateCampaign]);

  const sendHandout = useCallback((handout: Omit<HandoutPayload, 'id' | 'sentAt'>) => {
    const payload: HandoutPayload = {
      ...handout,
      id: `handout-${Date.now()}`,
      sentAt: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    };
    if (socketRef.current?.connected) {
      socketRef.current.emit('handout:show', payload);
    } else {
      setActiveHandout(payload);
    }
  }, []);

  const triggerSound = useCallback(
    (payload: {
      action: 'ambient' | 'sfx' | 'stop-ambient';
      presetKey: string;
      name: string;
      customUrl?: string;
    }) => {
      if (socketRef.current?.connected) {
        socketRef.current.emit('sound:trigger', payload);
      } else {
        if (payload.action === 'stop-ambient') {
          soundEngine.stopAmbient();
          setActiveAmbientName(null);
        } else if (payload.action === 'ambient') {
          setActiveAmbientName(payload.name);
          if (payload.customUrl) {
            soundEngine.playCustomUrl(payload.customUrl, true);
          } else {
            soundEngine.playAmbientPreset(payload.presetKey);
          }
        } else {
          if (payload.customUrl) {
            soundEngine.playCustomUrl(payload.customUrl, false);
          } else {
            soundEngine.playSfxPreset(payload.presetKey);
          }
        }
      }
    },
    []
  );

  const playCharacterTheme = useCallback((char: Character) => {
    if (!char.themeMusicUrl) return;
    const payload = {
      characterName: char.name,
      characterColor: char.playerColor || char.tokenColor || '#e0b84c',
      title: char.themeMusicTitle || `Tema de ${char.name}`,
      url: char.themeMusicUrl,
    };
    if (socketRef.current?.connected) {
      socketRef.current.emit('music:play-character-theme', payload);
    } else {
      soundEngine.playCustomUrl(payload.url, true);
      setActiveAmbientName(`Tema: ${char.name}`);
    }
  }, []);

  const announceBoss = useCallback(
    (boss: BossBannerState | null) => {
      if (socketRef.current?.connected) {
        socketRef.current.emit('boss:announce', boss);
      } else {
        updateCampaign((prev) => ({ ...prev, activeBoss: boss }));
      }
      if (boss) {
        soundEngine.playSfxPreset('roar');
      }
    },
    [updateCampaign]
  );

  const emitPointerMove = useCallback(
    (mapId: string, xPct: number, yPct: number) => {
      const char = campaignRef.current.characters.find((c) => c.id === activeCharRef.current);
      const pointer: MapPointerState = {
        playerId: myPlayerId,
        playerName: roleRef.current === 'gm' ? 'Mestre' : char?.name || myPlayerName,
        color:
          roleRef.current === 'gm'
            ? myPlayerColor || '#e0b84c'
            : char?.playerColor || myPlayerColor,
        mapId,
        xPct,
        yPct,
        active: true,
        updatedAt: Date.now(),
      };
      setActivePointers((prev) => ({ ...prev, [myPlayerId]: pointer }));
      if (socketRef.current?.connected) {
        socketRef.current.emit('pointer:move', pointer);
      }
    },
    [myPlayerColor, myPlayerId, myPlayerName]
  );

  const emitPointerHide = useCallback(() => {
    setActivePointers((prev) => {
      const copy = { ...prev };
      delete copy[myPlayerId];
      return copy;
    });
    if (socketRef.current?.connected) {
      socketRef.current.emit('pointer:hide', myPlayerId);
    }
  }, [myPlayerId]);

  const requestSkillCheck = useCallback((skillOrAttrId: string, label: string, dc: number) => {
    const req: SkillCheckRequest = {
      id: `chk-${Date.now()}`,
      skillOrAttrId,
      label,
      dc,
      createdAt: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      results: [],
    };
    if (socketRef.current?.connected) {
      socketRef.current.emit('check:request', req);
    } else {
      setActiveSkillCheck(req);
    }
  }, []);

  const submitSkillCheckResult = useCallback(
    (res: {
      checkId: string;
      characterId: string;
      characterName: string;
      playerColor: string;
      total: number;
      d20?: number;
      passed: boolean;
    }) => {
      if (socketRef.current?.connected) {
        socketRef.current.emit('check:submit-result', res);
      } else {
        setActiveSkillCheck((prev) =>
          prev && prev.id === res.checkId
            ? { ...prev, results: [...prev.results.filter((x) => x.characterId !== res.characterId), res] }
            : prev
        );
      }
    },
    []
  );

  const dismissSkillCheck = useCallback(() => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('check:dismiss');
    } else {
      setActiveSkillCheck(null);
    }
  }, []);

  const grantCardReward = useCallback((reward: Omit<CardRewardNotification, 'id'>) => {
    const full: CardRewardNotification = {
      ...reward,
      id: `rew-${Date.now()}`,
    };
    if (socketRef.current?.connected) {
      socketRef.current.emit('reward:grant', full);
    } else {
      setActiveReward(full);
    }
  }, []);

  const sendPing = useCallback(
    (mapId: string, x: number, y: number, color: string) => {
      const sender = roleRef.current === 'gm' ? 'Mestre' : myPlayerName;
      if (socketRef.current?.connected) {
        socketRef.current.emit('map:ping', { mapId, x, y, color, sender });
      } else {
        const id = `ping-${Date.now()}`;
        setPings((prev) => [...prev, { id, mapId, x, y, color, sender }]);
        window.setTimeout(() => {
          setPings((prev) => prev.filter((p) => p.id !== id));
        }, 2800);
      }
    },
    [myPlayerName]
  );

  const createNewCampaign = useCallback(
    async (params: {
      name: string;
      description: string;
      coverUrl?: string;
      gmName?: string;
      attributePointBudget?: number;
      maxTrainedSkills?: number;
    }) => {
      setServerUrl('');
      const res = await fetch('/api/campaigns/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (res.ok) {
        const next = (await res.json()) as CampaignState;
        setCampaign(next);
        setRole('gm');
        await refreshSavedCampaigns();
        setInLobby(false);
      }
    },
    [refreshSavedCampaigns, setRole, setServerUrl]
  );

  const loadSavedCampaign = useCallback(
    async (id: string) => {
      setServerUrl('');
      const res = await fetch(`/api/campaigns/load/${id}`, { method: 'POST' });
      if (res.ok) {
        const next = (await res.json()) as CampaignState;
        setCampaign(next);
        setRole('gm');
        setInLobby(false);
      }
    },
    [setRole, setServerUrl]
  );

  const deleteSavedCampaign = useCallback(
    async (id: string) => {
      await fetch(`/api/campaigns/${id}`, { method: 'DELETE' });
      await refreshSavedCampaigns();
    },
    [refreshSavedCampaigns]
  );

  const enterTableAsPlayer = useCallback(
    async (params: { targetServerUrl: string; playerName: string; playerColor: string }) => {
      const base = params.targetServerUrl.trim().replace(/\/+$/, '');
      try {
        const statusRes = await fetch(`${base}/api/room-status`);
        if (statusRes.ok) {
          const status = (await statusRes.json()) as { open?: boolean; hasGm?: boolean };
          if (status && status.open === false) {
            await openAlertDialog(
              'A sala está fechada no momento porque o Mestre não está na mesa. Aguarde o Mestre abrir a sessão para entrar.',
              'Sala Fechada'
            );
            return;
          }
        }
      } catch {
        // if room-status unreachable, let connection attempt proceed
      }
      setMyPlayerName(params.playerName.trim() || 'Aventureiro');
      setMyPlayerColorState(params.playerColor);
      localStorage.setItem('rpg_player_color', params.playerColor);
      setRole('player');
      setServerUrl(params.targetServerUrl);
      serverUrlRef.current = base;
      try {
        const res = await fetch(`${base}/api/campaign`);
        if (res.ok) {
          const data = (await res.json()) as CampaignState;
          setCampaign(syncCampaignDerivedCharacterStats(data));
        }
      } catch {
        // socket will sync once connected
      }
      refreshSavedHeroes().catch(() => {});
      setInLobby(false);
    },
    [refreshSavedHeroes, setInLobby, setMyPlayerName, setRole, setServerUrl]
  );

  const resetCampaign = useCallback(async () => {
    try {
      const base = serverUrlRef.current || '';
      const res = await fetch(`${base}/api/campaign/reset`, { method: 'POST' });
      if (res.ok) {
        const next = await res.json();
        setCampaign(next);
        return;
      }
    } catch {
      // ignore
    }
    setCampaign(createStarterCampaign());
  }, []);

  const importCampaign = useCallback(async (next: CampaignState) => {
    try {
      const base = serverUrlRef.current || '';
      const res = await fetch(`${base}/api/campaign/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      if (res.ok) {
        const updated = await res.json();
        setCampaign(updated);
        return;
      }
    } catch {
      // ignore
    }
    setCampaign(next);
  }, []);

  const dismissHandout = useCallback(() => setActiveHandout(null), []);
  const dismissRollOverlay = useCallback(() => setLatestRollForOverlay(null), []);
  const dismissReward = useCallback(() => setActiveReward(null), []);

  const sendPlayerRequest = useCallback(
    (type: PlayerRequest['type'], label: string, note?: string) => {
      const char =
        roleRef.current === 'player'
          ? campaignRef.current.characters.find(
              (c) =>
                c.ownerPlayerId === myPlayerId ||
                c.id === activeCharRef.current
            )
          : campaignRef.current.characters.find((c) => c.id === activeCharRef.current) ||
            campaignRef.current.characters[0];
      if (!char) return;
      if (
        (type === 'short-rest' || type === 'long-rest' || type === 'heal-mp') &&
        (char.hp <= 0 || char.deathSaves?.dead || (char.deathSaves?.failures || 0) >= 3)
      ) {
        showTacticalAlert('Personagens caídos ou mortos (0 PV) não podem pedir descanso ou cura!');
        return;
      }
      const reqPayload: PlayerRequest = {
        id: `preq-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        characterId: char.id,
        characterName: char.name,
        playerColor: char.playerColor || char.tokenColor || '#38bdf8',
        type,
        label,
        note,
        createdAt: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      };
      if (socketRef.current?.connected) {
        socketRef.current.emit('request:send', reqPayload);
      } else {
        setPendingRequests((prev) => [...prev, reqPayload]);
      }
      const id = `rtoast-${Date.now()}`;
      setRequestToast({ id, label: `Solicitação enviada: ${label}`, approved: true });
      window.setTimeout(() => {
        setRequestToast((curr) => (curr?.id === id ? null : curr));
      }, 3000);
    },
    []
  );

  const resolvePlayerRequest = useCallback((requestId: string, approved: boolean) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('request:resolve', { requestId, approved });
    } else {
      setPendingRequests((prev) => prev.filter((r) => r.id !== requestId));
    }
  }, []);

  const showTacticalAlert = useCallback((message: string) => {
    const id = `tact-${Date.now()}`;
    setTacticalAlert({ id, message });
    window.setTimeout(() => {
      setTacticalAlert((curr) => (curr?.id === id ? null : curr));
    }, 4500);
  }, []);

  const triggerOpportunityPrompt = useCallback((prompt: OpportunityAttackPrompt | null) => {
    if (prompt) {
      setOpportunityQueue([prompt]);
      if (socketRef.current?.connected) {
        socketRef.current.emit('opportunity:prompt', prompt);
      }
      return;
    }
    const remaining = opportunityQueueRef.current.slice(1);
    setOpportunityQueue(remaining);
    if (socketRef.current?.connected) {
      socketRef.current.emit('opportunity:prompt', remaining[0] || null);
    }
  }, []);

  const enqueueOpportunityPrompts = useCallback((prompts: OpportunityAttackPrompt[]) => {
    if (!prompts || prompts.length === 0) return;
    setOpportunityQueue(prompts);
    if (socketRef.current?.connected) {
      socketRef.current.emit('opportunity:prompt', prompts[0]);
    }
  }, []);

  const performCombatManeuver = useCallback(
    (
      maneuver:
        | 'dash'
        | 'disengage'
        | 'dodge'
        | 'action-surge'
        | 'shove'
        | 'hide'
        | 'help'
        | 'jump',
      actorTokenId?: string
    ) => {
      const curr = campaignRef.current;
      const activeMap = curr.maps.find((m) => m.id === curr.activeMapId);
      const explicitToken = actorTokenId
        ? activeMap?.tokens.find((t) => t.id === actorTokenId)
        : undefined;

      const char =
        explicitToken
          ? explicitToken.type === 'character' && explicitToken.referenceId
            ? curr.characters.find((c) => c.id === explicitToken.referenceId)
            : undefined
          : roleRef.current === 'player'
            ? curr.characters.find((c) => c.ownerPlayerId === myPlayerId) ||
              curr.characters.find((c) => c.id === activeCharRef.current)
            : curr.characters.find((c) => c.id === activeCharRef.current) ||
              curr.characters[0];

      const combat = curr.combat;
      if (!combat.active) {
        showTacticalAlert('As manobras de combate ficam ativas durante o combate.');
        return;
      }

      const activeTurnCb = combat.combatants[combat.currentTurnIndex];
      const targetCb =
        (explicitToken &&
          combat.combatants.find(
            (cb) =>
              cb.tokenId === explicitToken.id ||
              (explicitToken.referenceId && cb.referenceId === explicitToken.referenceId)
          )) ||
        (char && combat.combatants.find((cb) => cb.referenceId === char.id)) ||
        (roleRef.current === 'gm' ? activeTurnCb : undefined);

      if (!targetCb) {
        showTacticalAlert('Combatente não encontrado no rastreador de iniciativa.');
        return;
      }
      if ((char && char.hp <= 0) || targetCb.hp <= 0) {
        showTacticalAlert(`${targetCb.name} está caído (0 PV) e não pode realizar manobras!`);
        return;
      }

      // BG3 / D&D 5e Universal Maneuvers: Shove, Hide, Help, Jump
      if (maneuver === 'shove' || maneuver === 'hide' || maneuver === 'help' || maneuver === 'jump') {
        const isBonus = maneuver === 'shove' || maneuver === 'hide' || maneuver === 'jump';
        if (isBonus && targetCb.bonusActionAvailable === false) {
          showTacticalAlert(`${targetCb.name} já gastou a Ação Bônus neste turno!`);
          return;
        }
        if (!isBonus && targetCb.actionAvailable === false) {
          showTacticalAlert(`${targetCb.name} já gastou a Ação Padrão neste turno!`);
          return;
        }
        const myTok =
          explicitToken ||
          activeMap?.tokens.find(
            (t) =>
              (targetCb.tokenId && t.id === targetCb.tokenId) ||
              (char && t.type === 'character' && t.referenceId === char.id)
          );
        const stats = char ? computeCharacterStats(char, curr) : undefined;

        if (maneuver === 'shove') {
          if (!myTok) {
            showTacticalAlert(`${targetCb.name} precisa estar no mapa para usar Empurrar!`);
            return;
          }
          setTargetTokenId(null);
          setPendingAttackChoice({
            attackerTokenId: myTok.id,
            attackerName: char?.name || myTok.name || targetCb.name,
            attackerColor: char?.playerColor || myTok.color || targetCb.color || '#e0b84c',
            attackerImageUrl: char?.portraitUrl || myTok.imageUrl,
            attackerFrame: char?.tokenFrameStyle || myTok.frameStyle || 'gold',
            attackerCharacterId: char?.id,
            diceSkin: char?.diceSkin || 'gold',
            actionTitle: 'Empurrar (Shove)',
            range: 'Corpo a Corpo (1,5m)',
            actionCost: 'Bônus',
            isShoveManeuver: true,
          });
          showTacticalAlert(
            `Clique em um alvo adjacente (1,5m) no mapa para Empurrar com ${char?.name || myTok.name}!`
          );
          return;
        }

        if (maneuver === 'hide') {
          const stealthBonus = stats?.skills['furtividade']?.total ?? 2;
          const roll = evaluateFormula(`1d20 + ${stealthBonus}`, stats, char);
          updateCampaign((prev) => ({
            ...prev,
            characters: prev.characters.map((c) =>
              char && c.id === char.id && !c.activeConditionIds.includes('cond-invisivel')
                ? { ...c, activeConditionIds: [...c.activeConditionIds, 'cond-invisivel'] }
                : c
            ),
            maps: myTok
              ? prev.maps.map((m) =>
                  m.id !== activeMap?.id
                    ? m
                    : {
                        ...m,
                        tokens: m.tokens.map((t) =>
                          t.id === myTok.id && !(t.activeConditionIds || []).includes('cond-invisivel')
                            ? { ...t, activeConditionIds: [...(t.activeConditionIds || []), 'cond-invisivel'] }
                            : t
                        ),
                      }
                )
              : prev.maps,
            combat: {
              ...prev.combat,
              combatants: prev.combat.combatants.map((cb) =>
                cb.id === targetCb.id ? { ...cb, bonusActionAvailable: false } : cb
              ),
            },
          }));
          sendRoll({
            rollerName: targetCb.name,
            rollerRole: roleRef.current,
            rollerColor: targetCb.color,
            title: 'Esconder / Hide (Furtividade)',
            formula: roll.resolvedFormula,
            individualRolls: roll.individualRolls,
            total: roll.total,
            isSecret: false,
            details: `${targetCb.name} escondeu-se nas sombras (Furtividade ${roll.total} • Vantagem no próximo ataque).`,
          });
          pushCombatLog({
            category: 'condition',
            actorName: targetCb.name,
            actorKind: char ? 'hero' : 'monster',
            actorColor: targetCb.color,
            summary: `usou Esconder (Furtividade ${roll.total}) e ficou Oculto`,
          });
          return;
        }

        if (maneuver === 'help') {
          const adjAlly = curr.characters.find((c) => {
            if (char && c.id === char.id) return false;
            if (c.hp <= 0) return false;
            const allyTok = activeMap?.tokens.find((t) => t.type === 'character' && t.referenceId === c.id);
            if (!allyTok || !myTok) return true;
            return getGridSpanDistance(myTok.x, myTok.y, myTok.size, allyTok.x, allyTok.y, allyTok.size, 1.5).squares <= 2;
          });
          updateCampaign((prev) => ({
            ...prev,
            characters: adjAlly
              ? prev.characters.map((c) =>
                  c.id === adjAlly.id ? { ...c, nextAttackRollOverride: 'advantage' } : c
                )
              : prev.characters,
            combat: {
              ...prev.combat,
              combatants: prev.combat.combatants.map((cb) =>
                cb.id === targetCb.id ? { ...cb, actionAvailable: false } : cb
              ),
            },
          }));
          pushCombatLog({
            category: 'system',
            actorName: targetCb.name,
            actorKind: char ? 'hero' : 'monster',
            actorColor: targetCb.color,
            targetName: adjAlly?.name,
            targetKind: adjAlly ? 'hero' : undefined,
            summary: adjAlly
              ? 'usou Ajudar (concedeu Vantagem no próximo ataque) para'
              : 'usou Ajudar (próximo teste de aliado adjacente tem Vantagem)',
          });
          showTacticalAlert(
            adjAlly
              ? `${targetCb.name} ajudou ${adjAlly.name} (+Vantagem no próximo ataque)!`
              : `${targetCb.name} usou Ajudar!`
          );
          return;
        }

        if (maneuver === 'jump') {
          updateCampaign((prev) => ({
            ...prev,
            combat: {
              ...prev.combat,
              combatants: prev.combat.combatants.map((cb) =>
                cb.id === targetCb.id
                  ? {
                      ...cb,
                      bonusActionAvailable: false,
                      remainingMoveMeters: (cb.remainingMoveMeters ?? cb.speedMeters ?? 9) + 3,
                    }
                  : cb
              ),
            },
          }));
          pushCombatLog({
            category: 'system',
            actorName: targetCb.name,
            actorKind: char ? 'hero' : 'monster',
            actorColor: targetCb.color,
            summary: 'usou Saltar (+3m de salto sobre obstáculos)',
          });
          return;
        }
      }
      if (roleRef.current === 'player' && activeTurnCb?.id !== targetCb.id) {
        showTacticalAlert(`Aguarde seu turno (${activeTurnCb?.name || 'outro combatente'}).`);
        return;
      }

      const isRogueBonusDisengage =
        maneuver === 'disengage' && char?.classId === 'classe-ladino' && (char?.level ?? 1) >= 2;

      if (maneuver === 'action-surge') {
        updateCampaign((prev) => ({
          ...prev,
          combat: {
            ...prev.combat,
            combatants: prev.combat.combatants.map((cb) =>
              cb.id === targetCb.id ? { ...cb, actionAvailable: true } : cb
            ),
          },
        }));
        sendRoll({
          rollerName: targetCb.name,
          rollerRole: roleRef.current,
          rollerColor: targetCb.color,
          title: 'Surto de Ação',
          formula: '+1 Ação',
          individualRolls: [],
          total: 1,
          isSecret: false,
          details: `${targetCb.name} ativou Surto de Ação e recuperou +1 Ação Padrão neste turno!`,
        });
        return;
      }

      if (isRogueBonusDisengage) {
        if (targetCb.bonusActionAvailable === false) {
          showTacticalAlert('Sua Ação Bônus já foi gasta neste turno!');
          return;
        }
      } else if (targetCb.actionAvailable === false) {
        showTacticalAlert('Você já gastou sua Ação Padrão neste turno!');
        return;
      }

      updateCampaign((prev) => ({
        ...prev,
        combat: {
          ...prev.combat,
          combatants: prev.combat.combatants.map((cb) => {
            if (cb.id !== targetCb.id) return cb;
            const speed = cb.speedMeters ?? 9;
            return {
              ...cb,
              actionAvailable: isRogueBonusDisengage ? cb.actionAvailable : false,
              bonusActionAvailable: isRogueBonusDisengage ? false : cb.bonusActionAvailable,
              remainingMoveMeters:
                maneuver === 'dash' ? (cb.remainingMoveMeters ?? speed) + speed : cb.remainingMoveMeters,
              disengaged: maneuver === 'disengage' ? true : cb.disengaged,
              dodging: maneuver === 'dodge' ? true : cb.dodging,
            };
          }),
        },
      }));

      const descMap: Record<'dash' | 'disengage' | 'dodge', { title: string; details: string }> = {
        dash: {
          title: 'Disparada (Dash)',
          details: `${targetCb.name} dobrou seu deslocamento restante (+${targetCb.speedMeters ?? 9}m).`,
        },
        disengage: {
          title: isRogueBonusDisengage ? 'Desengajar (Ação Ardilosa)' : 'Desengajar',
          details: `${targetCb.name} recuou cautelosamente e não provocará Ataques de Oportunidade neste turno.`,
        },
        dodge: {
          title: 'Esquivar (Dodge)',
          details: `${targetCb.name} assumiu postura defensiva: ataques contra ele têm Desvantagem até seu próximo turno.`,
        },
      };

      sendRoll({
        rollerName: targetCb.name,
        rollerRole: roleRef.current,
        rollerColor: targetCb.color,
        title: descMap[maneuver].title,
        formula: isRogueBonusDisengage ? 'Ação Bônus' : 'Ação Padrão',
        individualRolls: [],
        total: 0,
        isSecret: false,
        details: descMap[maneuver].details,
      });
    },
    [myPlayerId, sendRoll, showTacticalAlert, updateCampaign]
  );

  const triggerSlashVfx = useCallback((tokenId: string, kind: 'hit' | 'block' | 'heal') => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('vfx:slash', { tokenId, kind });
    } else {
      const id = `svfx-${Date.now()}`;
      setSlashVfx((prev) => [...prev, { id, tokenId, kind }]);
      window.setTimeout(() => {
        setSlashVfx((prev) => prev.filter((x) => x.id !== id));
      }, 800);
    }
  }, []);

  const showInitiativeCeremony = useCallback((ceremony: InitiativeCeremonyState | null) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('initiative:ceremony', ceremony);
    } else {
      setInitiativeCeremony(ceremony);
    }
  }, []);

  const emitDuelState = useCallback((duel: CombatDuelState | null) => {
    activeDuelRef.current = duel;
    setActiveDuel(duel);
    if (socketRef.current?.connected) {
      socketRef.current.emit('duel:show', duel);
    }
  }, []);

  const startCombatDuel = useCallback(
    (choice: PendingAttackChoice, defenderToken: MapToken) => {
      const currCampaign = campaignRef.current;
      const activeMap = currCampaign.maps.find((m) => m.id === currCampaign.activeMapId);
      const attackerToken =
        (choice.attackerTokenId && activeMap?.tokens.find((t) => t.id === choice.attackerTokenId)) ||
        (choice.attackerCharacterId &&
          activeMap?.tokens.find(
            (t) => t.type === 'character' && t.referenceId === choice.attackerCharacterId
          )) ||
        undefined;

      const char = choice.attackerCharacterId
        ? currCampaign.characters.find((c) => c.id === choice.attackerCharacterId)
        : undefined;

      // 1. Dead / 0 HP Attacker Guard
      if ((char && char.hp <= 0) || (attackerToken && attackerToken.hp <= 0)) {
        setPendingAttackChoice(null);
        showTacticalAlert(
          `${choice.attackerName} está caído (0 PV) e não pode atacar!`
        );
        return;
      }

      // 2. Self-Attack Guard (prevent attacking own token unless healing, self-range, or condition-only)
      const isHealingAction = choice.damageType?.toLowerCase() === 'cura';
      const isConditionOnlyAction = Boolean(!choice.damageType && choice.applyConditionId);
      const isSelfRangeChoice = Boolean(
        choice.range && choice.range.trim().toLowerCase().includes('pessoal')
      );
      const isSelfTarget =
        (attackerToken && attackerToken.id === defenderToken.id) ||
        Boolean(
          choice.attackerCharacterId &&
            defenderToken.type === 'character' &&
            defenderToken.referenceId === choice.attackerCharacterId
        );
      if (isSelfTarget && !isHealingAction && !isSelfRangeChoice && !isConditionOnlyAction) {
        showTacticalAlert('Você não pode atacar a si mesmo! Clique em um inimigo no mapa.');
        return;
      }

      // 3. Range Validation (uses exact same square count as map range highlight!)
      if (
        choice.actionCost !== 'Reação' &&
        attackerToken &&
        attackerToken.id !== defenderToken.id
      ) {
        const sqM = currCampaign.settings.gridSquareMeters || 1.5;
        const maxSq = parseAttackRangeSquares(choice.range, choice.actionTitle, sqM);
        const maxRangeMeters = Math.round(maxSq * sqM * 10) / 10;
        const { squares: distSquares, meters: distMeters } = getGridSpanDistance(
          attackerToken.x,
          attackerToken.y,
          attackerToken.size,
          defenderToken.x,
          defenderToken.y,
          defenderToken.size,
          sqM
        );
        if (distSquares > maxSq) {
          showTacticalAlert(
            `Alvo fora de alcance! ${defenderToken.name} está a ${distMeters}m (${distSquares} quad.), mas "${choice.actionTitle}" alcança até ${maxRangeMeters}m (${maxSq} quad.).`
          );
          return;
        }
      }

      // 4. Action Economy Validation
      const actionCost = choice.actionCost || 'Padrão';
      const combat = currCampaign.combat;
      const activeTurnCb = combat.active ? combat.combatants[combat.currentTurnIndex] : undefined;
      const attackerCb = combat.active
        ? combat.combatants.find(
            (cb) =>
              (attackerToken && cb.tokenId === attackerToken.id) ||
              (choice.attackerCharacterId && cb.referenceId === choice.attackerCharacterId)
          )
        : undefined;
      const defenderCb = combat.active
        ? combat.combatants.find((cb) => cb.tokenId === defenderToken.id)
        : undefined;

      if (combat.active && attackerCb) {
        if (attackerCb.hp <= 0) {
          setPendingAttackChoice(null);
          showTacticalAlert(`${attackerCb.name} está caído (0 PV) e não pode atacar!`);
          return;
        }
        if (
          roleRef.current === 'player' &&
          actionCost !== 'Reação' &&
          actionCost !== 'Livre' &&
          activeTurnCb &&
          activeTurnCb.id !== attackerCb.id
        ) {
          showTacticalAlert(`Aguarde seu turno! Turno atual: ${activeTurnCb.name}.`);
          return;
        }
        if (actionCost === 'Padrão' && attackerCb.actionAvailable === false) {
          showTacticalAlert(`${attackerCb.name} já gastou a Ação Padrão neste turno!`);
          return;
        }
        if (actionCost === 'Bônus' && attackerCb.bonusActionAvailable === false) {
          showTacticalAlert(`${attackerCb.name} já gastou a Ação Bônus neste turno!`);
          return;
        }
        if (actionCost === 'Reação' && attackerCb.reactionAvailable === false) {
          showTacticalAlert(`${attackerCb.name} já gastou a Reação nesta rodada!`);
          return;
        }
      }

      if (char) {
        const resCheck = checkCharacterResource(
          char,
          choice.costMp,
          choice.costResourceId,
          currCampaign
        );
        if (!resCheck.ok) {
          showTacticalAlert(resCheck.error);
          return;
        }
      }

      setPendingAttackChoice(null);
      setTargetTokenId(null);
      if (actionCost === 'Reação') {
        triggerOpportunityPrompt(null);
      }

      // 4.0 BG3 / D&D 5e Targeted Shove (Empurrar): Size limit + Opposed Strength/Athletics test + collision-safe 1,5m push!
      if (choice.isShoveManeuver) {
        if (!attackerToken || !activeMap) {
          showTacticalAlert('Token do atacante não encontrado no mapa.');
          return;
        }
        if (defenderToken.hp <= 0) {
          showTacticalAlert(`${defenderToken.name} já está caído (0 PV).`);
          return;
        }
        const getTokenSizeTier = (tok: MapToken): number => {
          if (tok.type === 'monster' && tok.referenceId) {
            const mon = currCampaign.compendium.monsters.find((m) => m.id === tok.referenceId);
            if (mon?.size === 'Pequeno') return 1;
            if (mon?.size === 'Médio') return 1;
            if (mon?.size === 'Grande') return 2;
            if (mon?.size === 'Enorme') return 3;
            if (mon?.size === 'Colossal') return 4;
          }
          return Math.max(1, tok.size || 1);
        };
        const atkSizeTier = getTokenSizeTier(attackerToken);
        const defSizeTier = getTokenSizeTier(defenderToken);
        if (defSizeTier >= atkSizeTier + 2) {
          showTacticalAlert(
            `Alvo grande demais! ${choice.attackerName} não consegue empurrar ${defenderToken.name} (2+ categorias de tamanho maior).`
          );
          return;
        }

        const getTokenShoveAttackBonus = (tok: MapToken, linkedCh?: Character): number => {
          if (linkedCh) {
            const st = computeCharacterStats(linkedCh, currCampaign);
            return st.skills['atletismo']?.total ?? st.attributes['for']?.mod ?? 0;
          }
          if (tok.type === 'monster' && tok.referenceId) {
            const mon = currCampaign.compendium.monsters.find((m) => m.id === tok.referenceId);
            const strVal = mon?.attributes?.['for'] ?? 12;
            return Math.floor((strVal - 10) / 2);
          }
          return 1;
        };
        const getTokenShoveDefenseBonus = (tok: MapToken): number => {
          if (tok.type === 'character' && tok.referenceId) {
            const defCh = currCampaign.characters.find((c) => c.id === tok.referenceId);
            if (defCh) {
              const st = computeCharacterStats(defCh, currCampaign);
              const ath = st.skills['atletismo']?.total ?? st.attributes['for']?.mod ?? 0;
              const acr = st.skills['acrobacia']?.total ?? st.attributes['des']?.mod ?? 0;
              return Math.max(ath, acr);
            }
          }
          if (tok.type === 'monster' && tok.referenceId) {
            const mon = currCampaign.compendium.monsters.find((m) => m.id === tok.referenceId);
            const strMod = Math.floor(((mon?.attributes?.['for'] ?? 10) - 10) / 2);
            const dexMod = Math.floor(((mon?.attributes?.['des'] ?? 10) - 10) / 2);
            return Math.max(strMod, dexMod);
          }
          return 0;
        };

        const atkBonus = getTokenShoveAttackBonus(attackerToken, char);
        const defBonus = getTokenShoveDefenseBonus(defenderToken);
        const atkRoll = evaluateFormula(`1d20 + ${atkBonus}`);
        const defRoll = evaluateFormula(`1d20 + ${defBonus}`);
        const shoveSucceeded = atkRoll.total >= defRoll.total;

        // Compute push destination (1 square away from attacker, respecting map bounds & walls/collisions)
        const atkCx = attackerToken.x + (attackerToken.size || 1) / 2;
        const atkCy = attackerToken.y + (attackerToken.size || 1) / 2;
        const defCx = defenderToken.x + (defenderToken.size || 1) / 2;
        const defCy = defenderToken.y + (defenderToken.size || 1) / 2;
        const rawDx = defCx - atkCx;
        const rawDy = defCy - atkCy;
        const stepX = Math.abs(rawDx) >= 0.35 ? Math.sign(rawDx) : 0;
        const stepY = Math.abs(rawDy) >= 0.35 ? Math.sign(rawDy) : 0;
        const pushX = Math.max(0, Math.min(activeMap.gridWidth - defenderToken.size, defenderToken.x + stepX));
        const pushY = Math.max(0, Math.min(activeMap.gridHeight - defenderToken.size, defenderToken.y + stepY));
        const blockedByObstacle =
          (pushX === defenderToken.x && pushY === defenderToken.y) ||
          doesTokenCollideAt(
            activeMap.tokens,
            pushX,
            pushY,
            defenderToken.size,
            defenderToken.id,
            true,
            activeMap.terrainCells
          );
        const actuallyMoved = shoveSucceeded && !blockedByObstacle;

        updateCampaign((prev) => ({
          ...prev,
          combat:
            prev.combat.active && attackerCb
              ? {
                  ...prev.combat,
                  combatants: prev.combat.combatants.map((cb) =>
                    cb.id === attackerCb.id ? { ...cb, bonusActionAvailable: false } : cb
                  ),
                }
              : prev.combat,
          maps: actuallyMoved
            ? prev.maps.map((m) =>
                m.id !== activeMap.id
                  ? m
                  : {
                      ...m,
                      tokens: m.tokens.map((t) =>
                        t.id === defenderToken.id ? { ...t, x: pushX, y: pushY } : t
                      ),
                    }
              )
            : prev.maps,
        }));

        playSyncedAbilitySfx({
          explicitSfxPreset: shoveSucceeded ? 'shield' : 'sword',
          title: 'Empurrar',
        });
        fireProjectileVfx({
          fromToken: attackerToken,
          toToken: defenderToken,
          kind: 'slash',
          title: 'Empurrar',
        });
        triggerSlashVfx(defenderToken.id, shoveSucceeded ? 'hit' : 'block');

        const outcomeText = actuallyMoved
          ? `EMPURRADO 1,5m! (FOR ${atkRoll.total} vs Defesa ${defRoll.total})`
          : shoveSucceeded && blockedByObstacle
            ? `VENCEU O TESTE (FOR ${atkRoll.total} vs ${defRoll.total}), mas há um obstáculo atrás de ${defenderToken.name}!`
            : `RESISTIU AO EMPURRÃO! (FOR ${atkRoll.total} vs Defesa ${defRoll.total})`;

        sendRoll({
          rollerName: choice.attackerName,
          rollerRole: roleRef.current,
          rollerColor: choice.attackerColor,
          title: `Empurrar (Força/Atletismo) → ${defenderToken.name}`,
          formula: atkRoll.resolvedFormula,
          individualRolls: atkRoll.individualRolls,
          total: atkRoll.total,
          isSecret: false,
          details: outcomeText,
        });
        pushCombatLog({
          category: 'attack',
          actorName: choice.attackerName,
          actorKind: char ? 'hero' : attackerToken.type === 'npc' ? 'npc' : 'monster',
          actorColor: choice.attackerColor,
          targetName: defenderToken.name,
          targetKind:
            defenderToken.type === 'character'
              ? 'hero'
              : defenderToken.type === 'npc'
                ? 'npc'
                : 'monster',
          targetColor: defenderToken.color,
          summary: actuallyMoved
            ? `empurrou (${atkRoll.total} vs ${defRoll.total}) 1,5m para trás`
            : `tentou empurrar (${atkRoll.total} vs ${defRoll.total})`,
          detail: blockedByObstacle && shoveSucceeded ? 'Bloqueado por obstáculo' : undefined,
        });
        return;
      }

      const matchingAbilityDef = currCampaign.compendium.abilities.find(
        (ab) => normalizeAbilityKey(ab.name) === normalizeAbilityKey(choice.actionTitle)
      );
      if (char) {
        const usesCheck = checkAbilityUsesRemaining(char, matchingAbilityDef);
        if (!usesCheck.ok) {
          showTacticalAlert(usesCheck.error);
          return;
        }
      }
      const shouldSetConcentration = Boolean(
        choice.requiresConcentration ?? matchingAbilityDef?.requiresConcentration
      );
      const isSingleTargetOnly = Boolean(
        choice.singleTargetOnly ?? matchingAbilityDef?.singleTargetOnly
      );
      const resolvedSfxPreset = choice.sfxPreset || matchingAbilityDef?.sfxPreset;

      void (async () => {
        const conflict = await confirmAbilityConflictIfNeeded(char, {
          abilityName: choice.actionTitle,
          requiresConcentration: shouldSetConcentration,
          singleTargetOnly: isSingleTargetOnly,
          newTargetTokenId: defenderToken.id,
          newTargetName: defenderToken.name,
        });
        if (!conflict.proceed) return;

        const stats = char ? computeCharacterStats(char, currCampaign) : undefined;
        const defenderCharId =
          defenderToken.type === 'character' && defenderToken.referenceId
            ? defenderToken.referenceId
            : undefined;

        const buildCasterTrackedEffect = (): ActiveTrackedAbilityEffect | null => {
          if (!shouldSetConcentration && !isSingleTargetOnly) return null;
          return {
            abilityKey: normalizeAbilityKey(choice.actionTitle),
            abilityName: choice.actionTitle,
            conditionId: choice.applyConditionId,
            targetTokenIds: [defenderToken.id],
            targetCharacterIds: defenderCharId ? [defenderCharId] : [],
            targetNames: [defenderToken.name],
            isConcentration: shouldSetConcentration,
            singleTargetOnly: isSingleTargetOnly,
          };
        };

        // 4A. Single-Target Saving Throw Ability (e.g., Imobilizar Pessoa, Maldição) — no attack roll vs AC, target must roll Save!
        const isSingleTargetSaveAction = Boolean(
          !isHealingAction &&
            choice.saveSkillId &&
            (!choice.attackFormula || !choice.attackFormula.trim())
        );
        if (isSingleTargetSaveAction && choice.saveSkillId) {
          const saveSkill = currCampaign.compendium.skills.find((s) => s.id === choice.saveSkillId);
          const dcVal = choice.saveDcFormula
            ? Math.max(5, evaluateFormula(choice.saveDcFormula, stats, char).total)
            : 12;
          updateCampaign((prev) => {
            const base = char
              ? removeTrackedEffectsFromState(prev, char.id, conflict.effectsToClear)
              : prev;
            return {
              ...base,
              characters: base.characters.map((c) => {
                if (!char || c.id !== char.id) return c;
                const res = deductCharacterResource(
                  c,
                  choice.costMp,
                  choice.costResourceId,
                  base.compendium.customResources
                );
                return {
                  ...c,
                  ...res,
                  abilityUsesRemaining: decrementAbilityUse(c, matchingAbilityDef),
                  ...(shouldSetConcentration ? { concentratingSpell: choice.actionTitle } : {}),
                };
              }),
              combat:
                base.combat.active && attackerCb && (actionCost !== 'Livre' || shouldSetConcentration)
                  ? {
                      ...base.combat,
                      combatants: base.combat.combatants.map((cb) =>
                        cb.id !== attackerCb.id
                          ? cb
                          : {
                              ...cb,
                              actionAvailable: actionCost === 'Padrão' ? false : cb.actionAvailable,
                              bonusActionAvailable:
                                actionCost === 'Bônus' ? false : cb.bonusActionAvailable,
                              reactionAvailable:
                                actionCost === 'Reação' ? false : cb.reactionAvailable,
                              ...(shouldSetConcentration
                                ? { concentratingSpell: choice.actionTitle }
                                : {}),
                            }
                      ),
                    }
                  : base.combat,
            };
          });
          playSyncedAbilitySfx({
            explicitSfxPreset: resolvedSfxPreset,
            title: choice.actionTitle,
            damageType: choice.damageType,
            range: choice.range,
            applyConditionId: choice.applyConditionId,
          });
          fireProjectileVfx({
            fromToken: attackerToken,
            toToken: defenderToken,
            title: choice.actionTitle,
            damageType: choice.damageType,
            applyConditionId: choice.applyConditionId,
            range: choice.range,
          });
          pushCombatLog({
            category: 'spell',
            actorName: choice.attackerName,
            actorKind: char ? 'hero' : attackerToken?.type === 'npc' ? 'npc' : 'monster',
            actorColor: choice.attackerColor,
            targetName: defenderToken.name,
            targetKind:
              defenderToken.type === 'character'
                ? 'hero'
                : defenderToken.type === 'npc'
                  ? 'npc'
                  : 'monster',
            targetColor: defenderToken.color,
            summary: `conjurou ${choice.actionTitle} — ${defenderToken.name} precisa rolar ${saveSkill?.name || 'Salvaguarda'} (CD ${dcVal})!`,
          });
          window.setTimeout(() => {
            startTacticalSavePromptRef.current?.({
              kind: 'aoe',
              title: choice.actionTitle,
              subtitle: `Alvo: ${defenderToken.name}`,
              saveSkillId: choice.saveSkillId!,
              saveLabel: saveSkill?.name || 'Salvaguarda',
              dc: dcVal,
              damageFormula: choice.damageFormula
                ? formatFormulaForDisplay(choice.damageFormula, stats, char)
                : '',
              damageType: choice.damageType || undefined,
              halfOnSuccess: Boolean(choice.damageFormula),
              applyConditionId: choice.applyConditionId,
              conditionDurationRounds: choice.conditionDurationRounds,
              casterCharacterId: char?.id,
              casterName: choice.attackerName,
              requiresConcentration: shouldSetConcentration,
              singleTargetOnly: isSingleTargetOnly,
              tokens: [defenderToken],
            });
          }, 80);
          return;
        }

        // 4B. Condition-Only Skill (e.g., Bênção, Velocidade): skip AC roll/damage, apply condition directly to target token (works for self, allies, NPCs, monsters!)
        if (isConditionOnlyAction && choice.applyConditionId) {
          const condId = choice.applyConditionId;
          const condDef = currCampaign.compendium.conditions.find((c) => c.id === condId);
          const trackedEntry = buildCasterTrackedEffect();
          updateCampaign((prev) => {
            const base = char
              ? removeTrackedEffectsFromState(prev, char.id, conflict.effectsToClear)
              : prev;
            return {
              ...base,
              characters: base.characters.map((c) => {
                let next = c;
                if (char && c.id === char.id) {
                  const res = deductCharacterResource(
                    next,
                    choice.costMp,
                    choice.costResourceId,
                    base.compendium.customResources
                  );
                  next = {
                    ...next,
                    ...res,
                    abilityUsesRemaining: decrementAbilityUse(next, matchingAbilityDef),
                    ...(shouldSetConcentration ? { concentratingSpell: choice.actionTitle } : {}),
                  };
                  if (trackedEntry) {
                    next = upsertTrackedEffectOnCharacter(next, trackedEntry);
                  }
                }
                if (
                  defenderToken.type === 'character' &&
                  defenderToken.referenceId === c.id &&
                  !next.activeConditionIds.includes(condId)
                ) {
                  next = { ...next, activeConditionIds: [...next.activeConditionIds, condId] };
                }
                return next;
              }),
              maps: base.maps.map((m) =>
                m.id !== base.activeMapId
                  ? m
                  : {
                      ...m,
                      tokens: m.tokens.map((t) => {
                        if (t.id !== defenderToken.id) return t;
                        if ((t.activeConditionIds || []).includes(condId)) return t;
                        return {
                          ...t,
                          activeConditionIds: [...(t.activeConditionIds || []), condId],
                        };
                      }),
                    }
              ),
              combat: base.combat.active
                ? {
                    ...base.combat,
                    combatants: base.combat.combatants.map((cb) => {
                      let nextCb = cb;
                      if (attackerCb && cb.id === attackerCb.id) {
                        nextCb = {
                          ...nextCb,
                          actionAvailable: actionCost === 'Padrão' ? false : nextCb.actionAvailable,
                          bonusActionAvailable:
                            actionCost === 'Bônus' ? false : nextCb.bonusActionAvailable,
                          reactionAvailable:
                            actionCost === 'Reação' ? false : nextCb.reactionAvailable,
                          ...(shouldSetConcentration
                            ? { concentratingSpell: choice.actionTitle }
                            : {}),
                        };
                      }
                      if (cb.tokenId === defenderToken.id && condDef) {
                        nextCb = {
                          ...nextCb,
                          effects: [
                            ...nextCb.effects.filter((ef) => ef.conditionId !== condId),
                            {
                              id: `eff-${Date.now()}`,
                              label: condDef.name,
                              conditionId: condId,
                              remainingRounds: choice.conditionDurationRounds || 3,
                              sourceName: choice.attackerName,
                            },
                          ],
                        };
                      }
                      return nextCb;
                    }),
                  }
                : base.combat,
            };
          });
          playSyncedAbilitySfx({
            explicitSfxPreset: resolvedSfxPreset,
            title: choice.actionTitle,
            damageType: choice.damageType,
            range: choice.range,
            applyConditionId: condId,
          });
          pushCombatLog({
            category: 'condition',
            actorName: choice.attackerName,
            actorKind: char ? 'hero' : attackerToken?.type === 'npc' ? 'npc' : 'monster',
            actorColor: choice.attackerColor,
            targetName: defenderToken.name,
            targetKind:
              defenderToken.type === 'character'
                ? 'hero'
                : defenderToken.type === 'npc'
                  ? 'npc'
                  : 'monster',
            targetColor: defenderToken.color,
            summary: `usou ${choice.actionTitle}${shouldSetConcentration ? ' (Concentração)' : ''} e aplicou ${condDef?.icon || ''} ${condDef?.name || 'Condição'} em`,
          });
          return;
        }

        // 4C. Guaranteed Direct Healing: never roll vs AC / never miss! Roll ONLY the healing dice & heal target directly.
        if (isHealingAction) {
          const healFormula = choice.damageFormula?.trim() || '1d8';
          const healRoll = evaluateFormula(healFormula, stats, char);
          const healAmount = Math.max(1, healRoll.total);
          const trackedEntry = choice.applyConditionId ? buildCasterTrackedEffect() : null;

          if (
            (choice.costMp && choice.costMp > 0 && char) ||
            (combat.active && attackerCb && (actionCost !== 'Livre' || shouldSetConcentration)) ||
            shouldSetConcentration ||
            conflict.effectsToClear.length > 0 ||
            trackedEntry
          ) {
            updateCampaign((prev) => {
              const base = char
                ? removeTrackedEffectsFromState(prev, char.id, conflict.effectsToClear)
                : prev;
              return {
                ...base,
                characters: base.characters.map((c) => {
                  if (!char || c.id !== char.id) return c;
                  const res = deductCharacterResource(
                    c,
                    choice.costMp,
                    choice.costResourceId,
                    base.compendium.customResources
                  );
                  let next: Character = {
                    ...c,
                    ...res,
                    abilityUsesRemaining: decrementAbilityUse(c, matchingAbilityDef),
                    ...(shouldSetConcentration ? { concentratingSpell: choice.actionTitle } : {}),
                  };
                  if (trackedEntry) {
                    next = upsertTrackedEffectOnCharacter(next, trackedEntry);
                  }
                  return next;
                }),
                combat:
                  base.combat.active && attackerCb && (actionCost !== 'Livre' || shouldSetConcentration)
                    ? {
                        ...base.combat,
                        combatants: base.combat.combatants.map((cb) => {
                          if (cb.id !== attackerCb.id) return cb;
                          return {
                            ...cb,
                            actionAvailable: actionCost === 'Padrão' ? false : cb.actionAvailable,
                            bonusActionAvailable:
                              actionCost === 'Bônus' ? false : cb.bonusActionAvailable,
                            reactionAvailable:
                              actionCost === 'Reação' ? false : cb.reactionAvailable,
                            ...(shouldSetConcentration
                              ? { concentratingSpell: choice.actionTitle }
                              : {}),
                          };
                        }),
                      }
                    : base.combat,
              };
            });
          }

          window.setTimeout(() => {
            applyDamage(
              defenderToken.id,
              healAmount,
              true,
              undefined,
              'Cura',
              choice.applyConditionId
            );
            triggerSlashVfx(defenderToken.id, 'heal');
          }, 80);
          playSyncedAbilitySfx({
            explicitSfxPreset: resolvedSfxPreset,
            title: choice.actionTitle,
            damageType: 'Cura',
            range: choice.range,
            applyConditionId: choice.applyConditionId,
          });
          fireProjectileVfx({
            fromToken: attackerToken,
            toToken: defenderToken,
            title: choice.actionTitle,
            damageType: 'Cura',
            kind: 'heal',
          });
          recordCombatStat(choice.attackerName, choice.attackerColor, { healing: healAmount });
          sendRoll({
            rollerName: choice.attackerName,
            rollerRole: roleRef.current,
            title: `${choice.actionTitle} → ${defenderToken.name}`,
            formula: healRoll.resolvedFormula,
            total: healAmount,
            individualRolls: healRoll.individualRolls,
            damageTotal: healAmount,
            damageType: 'Cura',
            targetName: defenderToken.name,
            targetTokenId: defenderToken.id,
            isSecret: false,
            details: `Cura garantida (sem teste de CA): +${healAmount} PV • ${healRoll.details}`,
            isCrit: false,
            isFumble: false,
          });
          return;
        }

      const defenderChar =
        defenderToken.type === 'character' && defenderToken.referenceId
          ? currCampaign.characters.find((c) => c.id === defenderToken.referenceId)
          : undefined;

      // Line of Sight (Walls block attacks) & Automatic Cover (+2 Half / +5 Three-Quarters AC)
      const sqMetersVal = currCampaign.settings.gridSquareMeters || 1.5;
      const isRangedForLos =
        actionCost !== 'Reação' &&
        parseAttackRangeMeters(choice.range, choice.actionTitle) > sqMetersVal + 0.05;
      const losResult = evaluateLineOfSightAndCover(
        activeMap,
        attackerToken,
        defenderToken,
        isRangedForLos
      );
      if (losResult.blockedByWall) {
        showTacticalAlert(
          `Alvo sem linha de visão! Uma parede bloqueia "${choice.actionTitle}" contra ${defenderToken.name}.`
        );
        return;
      }
      const effectiveDefenderAc = defenderToken.defense + losResult.coverAcBonus;

      // Full D&D 5e situational attack modifiers:
      // Ranged in melee (1.5m), GM next-attack grant, Flanking, Dodge, Conditions (Prone, Paralyzed, Invisible, etc.)
      const tacticalMods = evaluateTacticalAttackModifiers({
        map: activeMap,
        attackerToken,
        defenderToken,
        attackerChar: char,
        defenderChar,
        characters: currCampaign.characters,
        range: choice.range,
        actionTitle: choice.actionTitle,
        sqMeters: sqMetersVal,
        enableFlanking: currCampaign.settings.enableFlanking ?? true,
        manualAdvantageMode: advantageMode,
        defenderDodging: Boolean(defenderCb?.dodging),
        isReaction: actionCost === 'Reação',
      });
      const allSituationalBadges = losResult.coverLabel
        ? [...tacticalMods.summaryBadges, losResult.coverLabel]
        : tacticalMods.summaryBadges;

      const trackedEntry = buildCasterTrackedEffect();
      updateCampaign((prev) => {
        const base = char
          ? removeTrackedEffectsFromState(prev, char.id, conflict.effectsToClear)
          : prev;
        return {
          ...base,
          characters: base.characters.map((c) => {
            if (!char || c.id !== char.id) return c;
            const res = deductCharacterResource(
              c,
              choice.costMp,
              choice.costResourceId,
              base.compendium.customResources
            );
            const clearGmOverride = Boolean(tacticalMods.gmOverrideUsed);
            let next: Character = {
              ...c,
              ...res,
              abilityUsesRemaining: decrementAbilityUse(c, matchingAbilityDef),
              nextAttackRollOverride: clearGmOverride ? null : c.nextAttackRollOverride,
              ...(shouldSetConcentration ? { concentratingSpell: choice.actionTitle } : {}),
            };
            if (trackedEntry) {
              next = upsertTrackedEffectOnCharacter(next, trackedEntry);
            }
            return next;
          }),
          combat:
            base.combat.active && attackerCb && (actionCost !== 'Livre' || shouldSetConcentration)
              ? {
                  ...base.combat,
                  combatants: base.combat.combatants.map((cb) =>
                    cb.id !== attackerCb.id
                      ? cb
                      : {
                          ...cb,
                          actionAvailable: actionCost === 'Padrão' ? false : cb.actionAvailable,
                          bonusActionAvailable:
                            actionCost === 'Bônus' ? false : cb.bonusActionAvailable,
                          reactionAvailable:
                            actionCost === 'Reação' ? false : cb.reactionAvailable,
                          ...(shouldSetConcentration
                            ? { concentratingSpell: choice.actionTitle }
                            : {}),
                        }
                  ),
                }
              : base.combat,
        };
      });

      const hasAttackRoll = Boolean(choice.attackFormula && choice.attackFormula.trim());
      const previewAttackDice = hasAttackRoll
        ? buildPreviewDiceForFormula(choice.attackFormula!, tacticalMods.effectiveAdvantageMode)
        : [];
      const displayAtkFormula = hasAttackRoll
        ? formatFormulaForDisplay(choice.attackFormula!, stats, char)
        : undefined;

      const duel: CombatDuelState = {
        id: `duel-${Date.now()}`,
        attackerCharacterId: choice.attackerCharacterId,
        attackerName: choice.attackerName,
        attackerColor: choice.attackerColor,
        attackerImageUrl: choice.attackerImageUrl,
        attackerFrame: choice.attackerFrame,
        defenderTokenId: defenderToken.id,
        defenderType: defenderToken.type,
        defenderName: defenderToken.name,
        defenderColor: defenderToken.color,
        defenderImageUrl: defenderToken.imageUrl,
        defenderFrame: defenderToken.frameStyle,
        defenderDefense: effectiveDefenderAc,
        defenderHpBefore: defenderToken.hp,
        defenderMaxHp: defenderToken.maxHp,
        actionTitle: choice.actionTitle,
        diceSkin: choice.diceSkin,
        applyConditionId: choice.applyConditionId,
        sfxPreset: resolvedSfxPreset,
        rawAttackFormula: hasAttackRoll ? choice.attackFormula : undefined,
        attackFormula: displayAtkFormula,
        attackRolledDice: previewAttackDice,
        isCrit: false,
        isFumble: false,
        hitSuccess: !hasAttackRoll,
        damageFormula: choice.damageFormula,
        damageType: choice.damageType,
        situationalModifiers: allSituationalBadges,
        effectiveAdvantageMode: tacticalMods.effectiveAdvantageMode,
        autoCritOnHit: tacticalMods.autoCritOnHit,
        // Wait for manual click on "Rolar Ataque" (or "Rolar Dano" for direct auto-hit spells!)
        phase: hasAttackRoll ? 'ready-attack' : 'attack-result',
      };

      activeDuelRef.current = duel;
      emitDuelState(duel);
      })();
    },
    [advantageMode, applyDamage, emitDuelState, playSyncedAbilitySfx, pushCombatLog, sendRoll, showTacticalAlert, triggerOpportunityPrompt, triggerSlashVfx, updateCampaign]
  );

  const rollDuelAttack = useCallback(() => {
    const duel = activeDuelRef.current;
    if (!duel || duel.phase !== 'ready-attack') return;
    const rawFormula = duel.rawAttackFormula || duel.attackFormula;
    if (!rawFormula) return;

    const currCampaign = campaignRef.current;
    const char = duel.attackerCharacterId
      ? currCampaign.characters.find((c) => c.id === duel.attackerCharacterId)
      : currCampaign.characters.find((c) => c.name === duel.attackerName);
    const stats = char ? computeCharacterStats(char, currCampaign) : undefined;

    const attackRes = evaluateFormula(rawFormula, stats, char, {
      advantageMode: duel.effectiveAdvantageMode || 'normal',
      extraFlatBonus: stats?.attackBonusExtra,
      extraDiceBonuses: stats?.attackDiceBonuses,
    });

    const hitSuccess =
      attackRes.isCrit || (!attackRes.isFumble && attackRes.total >= duel.defenderDefense);
    const effectiveIsCrit = Boolean(attackRes.isCrit || (hitSuccess && duel.autoCritOnHit));

    // BG3 Reaction Check: can defender use Escudo Arcano (+5 CA) to turn this hit into a miss?
    const activeMapForDef = currCampaign.maps.find((m) => m.id === currCampaign.activeMapId);
    const defTok = activeMapForDef?.tokens.find((t) => t.id === duel.defenderTokenId);
    const defChar =
      defTok?.type === 'character' && defTok.referenceId
        ? currCampaign.characters.find((c) => c.id === defTok.referenceId)
        : undefined;
    const defCb = currCampaign.combat.active
      ? currCampaign.combat.combatants.find((cb) => cb.tokenId === duel.defenderTokenId)
      : undefined;
    const defKnowsShield = Boolean(
      defChar &&
        (defChar.knownAbilityIds.some((id) => {
          const ab = currCampaign.compendium.abilities.find((a) => a.id === id);
          return ab && ab.actionType === 'Reação' && /escudo/i.test(ab.name);
        }) ||
          defChar.customAbilities.some((ab) => ab.actionType === 'Reação' && /escudo/i.test(ab.name)))
    );
    const defenderCanShieldReaction = Boolean(
      hitSuccess &&
        !attackRes.isCrit &&
        defChar &&
        defKnowsShield &&
        defChar.mp >= 1 &&
        (!defCb || defCb.reactionAvailable !== false)
    );

    const rollingDuel: CombatDuelState = {
      ...duel,
      attackFormula: attackRes.resolvedFormula,
      attackRolledDice: attackRes.rolledDice,
      defenderCanShieldReaction,
      attackTotal: attackRes.total,
      d20Natural: attackRes.d20Natural,
      isCrit: effectiveIsCrit,
      isFumble: attackRes.isFumble,
      hitSuccess,
      phase: 'rolling-attack',
    };

    emitDuelState(rollingDuel);
    soundEngine.playSfxPreset('dice');

    const modSuffix =
      duel.situationalModifiers && duel.situationalModifiers.length > 0
        ? ` • ${duel.situationalModifiers.join(' | ')}`
        : '';

    sendRoll({
      rollerName: duel.attackerName,
      rollerRole: roleRef.current,
      rollerColor: duel.attackerColor,
      diceSkin: duel.diceSkin,
      title: `${duel.actionTitle} → ${duel.defenderName}`,
      formula: attackRes.resolvedFormula,
      individualRolls: attackRes.individualRolls,
      rolledDice: attackRes.rolledDice,
      d20Natural: attackRes.d20Natural,
      total: attackRes.total,
      isCrit: effectiveIsCrit,
      isFumble: attackRes.isFumble,
      targetName: duel.defenderName,
      targetTokenId: duel.defenderTokenId,
      targetDefense: duel.defenderDefense,
      hitStatus: hitSuccess ? 'hit' : 'miss',
      isSecret: false,
      details: `${
        hitSuccess
          ? `ACERTOU! (${attackRes.total} vs CA ${duel.defenderDefense})`
          : `BLOQUEADO! (${attackRes.total} vs CA ${duel.defenderDefense})`
      }${modSuffix}`,
    });

    window.setTimeout(() => {
      if (activeDuelRef.current?.id === rollingDuel.id) {
        emitDuelState({ ...rollingDuel, phase: 'attack-result' });
      }
      if (effectiveIsCrit) {
        recordCombatStat(duel.attackerName, duel.attackerColor, { crits: 1 });
      }
      soundEngine.playSfxPreset(hitSuccess ? 'sword' : 'shield');
    }, 680);
  }, [emitDuelState, recordCombatStat, sendRoll]);

  const rollDuelDamage = useCallback(() => {
    const duel = activeDuelRef.current;
    if (!duel || !duel.damageFormula) return;

    const char = campaignRef.current.characters.find((c) => c.name === duel.attackerName);
    const stats = char ? computeCharacterStats(char, campaignRef.current) : undefined;
    const isHealing = duel.damageType?.toLowerCase() === 'cura';

    const dmgRes = evaluateFormula(duel.damageFormula, stats, char, {
      extraFlatBonus: !isHealing && stats ? stats.damageBonusExtra : 0,
      isCritDamage: duel.isCrit,
    });
    const dmgTotal = Math.max(1, dmgRes.total);

    const nextDuel: CombatDuelState = {
      ...duel,
      damageRolledDice: dmgRes.rolledDice,
      damageTotal: dmgTotal,
      damageApplied: false,
      phase: 'rolling-damage',
    };
    emitDuelState(nextDuel);
    soundEngine.playSfxPreset('dice');

    window.setTimeout(() => {
      if (activeDuelRef.current?.id === nextDuel.id) {
        emitDuelState({ ...nextDuel, phase: 'damage-result', damageApplied: false });
      }
      sendRoll({
        rollerName: duel.attackerName,
        rollerRole: roleRef.current,
        rollerColor: duel.attackerColor,
        diceSkin: duel.diceSkin,
        title: `Dano: ${duel.actionTitle} → ${duel.defenderName}`,
        formula: dmgRes.resolvedFormula,
        individualRolls: dmgRes.individualRolls,
        rolledDice: dmgRes.rolledDice,
        total: dmgTotal,
        damageTotal: dmgTotal,
        damageType: duel.damageType,
        targetName: duel.defenderName,
        targetTokenId: duel.defenderTokenId,
        isSecret: false,
        details: `${dmgTotal} de ${duel.damageType || 'Dano'} rolado contra ${duel.defenderName}.`,
        applied: true,
      });
    }, 680);
  }, [emitDuelState, sendRoll]);

  const advanceDuelPhase = useCallback((phase: CombatDuelState['phase']) => {
    setActiveDuel((curr) => (curr ? { ...curr, phase } : null));
  }, []);

  const dismissDuel = useCallback(() => {
    const duel = activeDuelRef.current;
    emitDuelState(null);
    setTargetTokenId(null);
    if (!duel || lastDispatchedDuelIdRef.current === duel.id) return;
    lastDispatchedDuelIdRef.current = duel.id;

    const currCampaign = campaignRef.current;
    const curMap = currCampaign.maps.find((m) => m.id === currCampaign.activeMapId);
    const defTok = curMap?.tokens.find((t) => t.id === duel.defenderTokenId);
    const atkTok = curMap?.tokens.find(
      (t) =>
        (duel.attackerCharacterId &&
          t.type === 'character' &&
          t.referenceId === duel.attackerCharacterId) ||
        t.name === duel.attackerName
    );
    const isHealing = duel.damageType?.toLowerCase() === 'cura';

    // Case 1: Damage / Healing rolled — close modal first, fly projectile across unobstructed map, then apply damage & combo at exact impact!
    if (
      duel.phase === 'damage-result' &&
      duel.damageTotal &&
      duel.damageTotal > 0 &&
      !duel.damageApplied
    ) {
      const dmgTotal = duel.damageTotal;
      window.setTimeout(() => {
        if (defTok) {
          fireProjectileVfx({
            fromToken: atkTok,
            toToken: defTok,
            title: duel.actionTitle,
            damageType: duel.damageType,
            applyConditionId: duel.applyConditionId,
            isCrit: duel.isCrit,
          });
        }
        playSyncedAbilitySfx({
          explicitSfxPreset: duel.sfxPreset,
          title: duel.actionTitle,
          damageType: duel.damageType,
          applyConditionId: duel.applyConditionId,
          isAttack: !isHealing,
        });

        // Apply HP damage + slash VFX + elemental combo right when the projectile hits the target!
        window.setTimeout(() => {
          applyDamage(
            duel.defenderTokenId,
            dmgTotal,
            isHealing,
            undefined,
            duel.damageType,
            duel.applyConditionId
          );
          recordCombatStat(
            duel.attackerName,
            duel.attackerColor,
            isHealing ? { healing: dmgTotal } : { damage: dmgTotal }
          );
          triggerSlashVfx(duel.defenderTokenId, isHealing ? 'heal' : 'hit');

          if (!isHealing && duel.damageType && defTok) {
            const sz = Math.max(1, defTok.size || 1);
            const seedCells: Array<{ x: number; y: number }> = [];
            for (let dx = 0; dx < sz; dx++) {
              for (let dy = 0; dy < sz; dy++) {
                seedCells.push({ x: Math.floor(defTok.x) + dx, y: Math.floor(defTok.y) + dy });
              }
            }
            window.setTimeout(() => {
              triggerElementalComboAtCells(
                seedCells,
                duel.damageType,
                duel.attackerName,
                duel.attackerColor
              );
            }, 240);
          }
        }, 360);
      }, 90);
      return;
    }

    // Case 2: Attack missed — close modal, fly projectile and show blue Shield Block VFX on map!
    if (duel.phase === 'attack-result' && !duel.hitSuccess && defTok) {
      window.setTimeout(() => {
        fireProjectileVfx({
          fromToken: atkTok,
          toToken: defTok,
          title: duel.actionTitle,
          damageType: duel.damageType,
          applyConditionId: duel.applyConditionId,
          isCrit: false,
        });
        window.setTimeout(() => {
          triggerSlashVfx(duel.defenderTokenId, 'block');
          playSyncedAbilitySfx({ explicitSfxPreset: 'shield', title: 'Bloqueado' });
        }, 360);
      }, 90);
      return;
    }

    // Case 3: Attack hit with NO damage formula (utility/condition hit) — fly projectile and apply condition on impact!
    if (
      duel.phase === 'attack-result' &&
      duel.hitSuccess &&
      !duel.damageFormula &&
      defTok
    ) {
      window.setTimeout(() => {
        fireProjectileVfx({
          fromToken: atkTok,
          toToken: defTok,
          title: duel.actionTitle,
          damageType: duel.damageType,
          applyConditionId: duel.applyConditionId,
          isCrit: duel.isCrit,
        });
        playSyncedAbilitySfx({
          explicitSfxPreset: duel.sfxPreset,
          title: duel.actionTitle,
          damageType: duel.damageType,
          applyConditionId: duel.applyConditionId,
        });
        if (duel.applyConditionId) {
          window.setTimeout(() => {
            applyDamage(duel.defenderTokenId, 0, false, undefined, undefined, duel.applyConditionId);
            triggerSlashVfx(duel.defenderTokenId, 'hit');
          }, 360);
        }
      }, 90);
    }
  }, [
    applyDamage,
    emitDuelState,
    fireProjectileVfx,
    playSyncedAbilitySfx,
    recordCombatStat,
    triggerElementalComboAtCells,
    triggerSlashVfx,
  ]);

  const deleteCharacter = useCallback(
    (characterId: string) => {
      updateCampaign((prev) => {
        const remainingChars = prev.characters.filter((c) => c.id !== characterId);
        const remainingCombatants = prev.combat.combatants.filter(
          (cb) => cb.referenceId !== characterId
        );
        const nextTurnIdx = Math.min(
          prev.combat.currentTurnIndex,
          Math.max(0, remainingCombatants.length - 1)
        );
        return {
          ...prev,
          characters: remainingChars,
          maps: prev.maps.map((m) => ({
            ...m,
            tokens: m.tokens.filter((t) => t.referenceId !== characterId),
          })),
          combat: {
            ...prev.combat,
            combatants: remainingCombatants,
            currentTurnIndex: nextTurnIdx,
          },
        };
      });
      const fallbackChar = campaignRef.current.characters.find((c) => c.id !== characterId);
      setActiveCharacterId(fallbackChar?.id || '');
      setTargetTokenId(null);
    },
    [setActiveCharacterId, updateCampaign]
  );

  const rollDeathSave = useCallback(
    (characterId: string) => {
      const camp = campaignRef.current;
      const char = camp.characters.find((c) => c.id === characterId);
      if (!char || char.hp > 0) return;

      const prevDs = char.deathSaves || { successes: 0, failures: 0 };
      if (prevDs.dead || (prevDs.failures || 0) >= 3) {
        showTacticalAlert(`${char.name} já morreu! Apenas o Mestre pode revivê-lo.`);
        return;
      }
      if (prevDs.stabilized || (prevDs.successes || 0) >= 3) {
        showTacticalAlert(`${char.name} já está estabilizado (3 sucessos) e não corre risco imediato.`);
        return;
      }

      const stats = computeCharacterStats(char, camp);
      const hasAid = Boolean(prevDs.assistedBy);
      const deathMode: RollAdvantageMode = hasAid ? 'advantage' : 'normal';

      openManualRoll({
        title: hasAid ? `Teste contra a Morte (Ajuda: ${prevDs.assistedBy})` : 'Teste contra a Morte',
        subtitle: '10+ Sucesso (3 sucessos = renasce com 1 PV) • 20 Natural = 1 PV imediato • 1 Natural = 2 falhas',
        formula: '1d20',
        displayFormula: hasAid ? '2d20 (Vantagem)' : '1d20',
        previewDice: buildPreviewDiceForFormula('1d20', deathMode),
        rollerName: char.name,
        rollerColor: char.playerColor || char.tokenColor,
        diceSkin: char.diceSkin || 'blood',
        allowAdvantageToggle: false,
        advantageMode: deathMode,
        onExecute: (chosenMode) => {
          const liveCamp = campaignRef.current;
          const liveChar = liveCamp.characters.find((c) => c.id === char.id);
          if (!liveChar || liveChar.hp > 0) return;
          const liveDs = liveChar.deathSaves || { successes: 0, failures: 0 };
          const res = evaluateFormula('1d20', stats, liveChar, {
            advantageMode: chosenMode,
          });
          const nat = res.d20Natural ?? res.total;

          let nextSucc = liveDs.successes || 0;
          let nextFail = liveDs.failures || 0;
          let nextHp = liveChar.hp;
          let nextStabilized = false;
          let nextDead = false;
          let msg = '';

          if (nat === 20) {
            nextHp = 1;
            nextSucc = 0;
            nextFail = 0;
            msg = '20 NATURAL! Renasceu imediatamente com 1 PV!';
          } else if (nat === 1) {
            nextFail = Math.min(3, nextFail + 2);
            nextDead = nextFail >= 3;
            msg = nextDead
              ? '1 NATURAL! Duas falhas — O herói sucumbiu nos Portões da Morte (3/3 Falhas)!'
              : `1 NATURAL! Duas falhas nos Portões da Morte (${nextFail}/3).`;
          } else if (nat >= 10) {
            nextSucc = Math.min(3, nextSucc + 1);
            if (nextSucc >= 3) {
              nextHp = 1;
              nextSucc = 0;
              nextFail = 0;
              nextStabilized = false;
              msg = '3º Sucesso contra a Morte! O herói venceu os Portões da Morte e renasceu com 1 PV!';
            } else {
              msg = `Sucesso contra a Morte (${nextSucc}/3).`;
            }
          } else {
            nextFail = Math.min(3, nextFail + 1);
            nextDead = nextFail >= 3;
            msg = nextDead
              ? `3ª Falha (${nat}) — O personagem MORREU!`
              : `Falha contra a Morte (${nextFail}/3).`;
          }

          const nextDeathPayload: Character['deathSaves'] = {
            successes: nextSucc,
            failures: nextFail,
            stabilized: nextStabilized,
            dead: nextDead,
            assistedBy: undefined,
          };

          if (socketRef.current?.connected) {
            socketRef.current.emit('character:deathSave', {
              characterId: liveChar.id,
              hp: nextHp,
              deathSaves: nextDeathPayload,
            });
          }

          updateCampaign((prev) => ({
            ...prev,
            characters: prev.characters.map((c) =>
              c.id !== liveChar.id
                ? c
                : {
                    ...c,
                    hp: nextHp,
                    deathSaves: nextDeathPayload,
                  }
            ),
            maps:
              nextHp > 0
                ? prev.maps.map((m) => ({
                    ...m,
                    tokens: m.tokens.map((t) =>
                      t.type === 'character' && t.referenceId === liveChar.id
                        ? { ...t, hp: nextHp }
                        : t
                    ),
                  }))
                : prev.maps,
            combat:
              nextHp > 0
                ? {
                    ...prev.combat,
                    combatants: prev.combat.combatants.map((cb) =>
                      cb.type === 'character' && cb.referenceId === liveChar.id
                        ? { ...cb, hp: nextHp }
                        : cb
                    ),
                  }
                : prev.combat,
          }));

          const activeMap = liveCamp.maps.find((m) => m.id === liveCamp.activeMapId);
          const charTok = activeMap?.tokens.find(
            (t) => t.type === 'character' && t.referenceId === liveChar.id
          );
          if (nextHp > 0 || nextStabilized) {
            soundEngine.playSfxPreset('heal');
            if (charTok) triggerSlashVfx(charTok.id, 'heal');
          }

          sendRoll({
            rollerName: liveChar.name,
            rollerRole: roleRef.current,
            rollerColor: liveChar.playerColor || liveChar.tokenColor,
            diceSkin: liveChar.diceSkin || 'blood',
            title: hasAid ? `Teste contra a Morte (Ajuda: ${prevDs.assistedBy})` : 'Teste contra a Morte',
            formula: hasAid ? '2d20 (Vantagem)' : '1d20',
            individualRolls: res.individualRolls,
            rolledDice: res.rolledDice,
            d20Natural: nat,
            total: nat,
            isCrit: nat === 20,
            isFumble: nat === 1 || nextDead,
            isSecret: false,
            details: msg,
          });
        },
      });
    },
    [openManualRoll, sendRoll, showTacticalAlert, triggerSlashVfx, updateCampaign]
  );

  const setDeathSaveManual = useCallback(
    (
      characterId: string,
      patch: Partial<Character['deathSaves']> & { hp?: number }
    ) => {
      const camp = campaignRef.current;
      const char = camp.characters.find((c) => c.id === characterId);
      if (!char) return;
      const prevDs = char.deathSaves || { successes: 0, failures: 0 };
      const nextSucc = Math.max(0, Math.min(3, patch.successes ?? prevDs.successes ?? 0));
      const nextFail = Math.max(0, Math.min(3, patch.failures ?? prevDs.failures ?? 0));
      const nextDead = patch.dead !== undefined ? patch.dead : nextFail >= 3;
      const nextStabilized =
        patch.stabilized !== undefined ? patch.stabilized : !nextDead && nextSucc >= 3;
      const nextHp = patch.hp !== undefined ? Math.max(0, patch.hp) : char.hp;

      const nextDeathPayload: Character['deathSaves'] = {
        successes: nextHp > 0 ? 0 : nextSucc,
        failures: nextHp > 0 ? 0 : nextFail,
        stabilized: nextHp > 0 ? false : nextStabilized,
        dead: nextHp > 0 ? false : nextDead,
        assistedBy: patch.assistedBy !== undefined ? patch.assistedBy : prevDs.assistedBy,
      };

      if (socketRef.current?.connected) {
        socketRef.current.emit('character:deathSave', {
          characterId: char.id,
          hp: nextHp,
          deathSaves: nextDeathPayload,
        });
      }

      updateCampaign((prev) => ({
        ...prev,
        characters: prev.characters.map((c) =>
          c.id !== char.id ? c : { ...c, hp: nextHp, deathSaves: nextDeathPayload }
        ),
        maps: prev.maps.map((m) => ({
          ...m,
          tokens: m.tokens.map((t) =>
            t.type === 'character' && t.referenceId === char.id ? { ...t, hp: nextHp } : t
          ),
        })),
        combat: {
          ...prev.combat,
          combatants: prev.combat.combatants.map((cb) =>
            cb.type === 'character' && cb.referenceId === char.id ? { ...cb, hp: nextHp } : cb
          ),
        },
      }));
    },
    [updateCampaign]
  );

  const assistDeathSave = useCallback(
    (helperCharacterId: string, targetCharacterId: string) => {
      if (helperCharacterId === targetCharacterId) {
        showTacticalAlert('Você não pode prestar socorro a si mesmo!');
        return;
      }
      const camp = campaignRef.current;
      const helper = camp.characters.find((c) => c.id === helperCharacterId);
      const target = camp.characters.find((c) => c.id === targetCharacterId);
      if (!helper || !target) return;

      if (helper.hp <= 0) {
        showTacticalAlert(`${helper.name} está caído (0 PV) e não pode socorrer aliados!`);
        return;
      }
      if (target.hp > 0) {
        showTacticalAlert(`${target.name} não precisa de Teste contra a Morte.`);
        return;
      }
      if (target.deathSaves?.dead || (target.deathSaves?.failures || 0) >= 3) {
        showTacticalAlert(`${target.name} já morreu! Apenas o Mestre pode revivê-lo.`);
        return;
      }

      const activeMap = camp.maps.find((m) => m.id === camp.activeMapId);
      const helperTok = activeMap?.tokens.find(
        (t) => t.type === 'character' && t.referenceId === helper.id
      );
      const targetTok = activeMap?.tokens.find(
        (t) => t.type === 'character' && t.referenceId === target.id
      );
      const sqMeters = camp.settings.gridSquareMeters || 1.5;

      if (camp.combat.active && helperTok && targetTok) {
        const dist = getGridSpanDistance(
          helperTok.x,
          helperTok.y,
          helperTok.size,
          targetTok.x,
          targetTok.y,
          targetTok.size,
          sqMeters
        );
        if (dist.squares > 1) {
          showTacticalAlert(
            `Aproxime-se de ${target.name} (${dist.meters}m — máximo 1,5m) para prestar socorro!`
          );
          return;
        }
        const helperCb = camp.combat.combatants.find((cb) => cb.referenceId === helper.id);
        const activeTurn = camp.combat.combatants[camp.combat.currentTurnIndex];
        if (roleRef.current !== 'gm' && activeTurn && helperCb && activeTurn.id !== helperCb.id) {
          showTacticalAlert(`Aguarde seu turno (${activeTurn.name} está agindo) para socorrer ${target.name}.`);
          return;
        }
        if (helperCb && helperCb.actionAvailable === false) {
          showTacticalAlert(`${helper.name} já gastou a Ação Padrão neste turno!`);
          return;
        }
      }

      const helperStats = computeCharacterStats(helper, camp);
      const medSkill = camp.compendium.skills.find(
        (s) => s.id === 'per-medicina' || s.name.toLowerCase().includes('medicina')
      );
      const medBonus =
        (medSkill ? helperStats.skills[medSkill.id]?.total : undefined) ??
        helperStats.attributes['sab']?.mod ??
        0;

      const res = evaluateFormula(`1d20 + ${medBonus}`, helperStats, helper);
      const isCritWake = res.d20Natural === 20;
      const stabilizedNow = !isCritWake && res.total >= 10;
      const revivedWithOneHp = isCritWake || stabilizedNow;

      updateCampaign((prev) => ({
        ...prev,
        characters: prev.characters.map((c) => {
          if (c.id !== target.id) return c;
          if (revivedWithOneHp) {
            return {
              ...c,
              hp: 1,
              deathSaves: {
                successes: 0,
                failures: 0,
                stabilized: false,
                dead: false,
                assistedBy: undefined,
              },
            };
          }
          return {
            ...c,
            deathSaves: {
              ...(c.deathSaves || { successes: 0, failures: 0 }),
              assistedBy: helper.name,
            },
          };
        }),
        maps: revivedWithOneHp
          ? prev.maps.map((m) => ({
              ...m,
              tokens: m.tokens.map((t) =>
                t.type === 'character' && t.referenceId === target.id ? { ...t, hp: 1 } : t
              ),
            }))
          : prev.maps,
        combat: {
          ...prev.combat,
          combatants: prev.combat.combatants.map((cb) => {
            if (revivedWithOneHp && cb.type === 'character' && cb.referenceId === target.id) {
              return { ...cb, hp: 1 };
            }
            if (prev.combat.active && cb.referenceId === helper.id) {
              return { ...cb, actionAvailable: false };
            }
            return cb;
          }),
        },
      }));

      if (revivedWithOneHp) {
        soundEngine.playSfxPreset('heal');
        if (targetTok) triggerSlashVfx(targetTok.id, 'heal');
      }

      sendRoll({
        rollerName: helper.name,
        rollerRole: roleRef.current,
        rollerColor: helper.playerColor || helper.tokenColor,
        diceSkin: helper.diceSkin || 'emerald',
        title: `Socorro (Medicina) → ${target.name}`,
        formula: res.resolvedFormula,
        individualRolls: res.individualRolls,
        rolledDice: res.rolledDice,
        d20Natural: res.d20Natural,
        total: res.total,
        isCrit: isCritWake,
        isFumble: res.isFumble,
        isSecret: false,
        details: isCritWake
          ? `20 NATURAL! ${helper.name} reanimou ${target.name} com 1 PV!`
          : stabilizedNow
            ? `SUCESSO (${res.total} vs CD 10)! ${helper.name} socorreu ${target.name}, que renasceu com 1 PV!`
            : `Medicina ${res.total} vs CD 10 — ${target.name} ainda sangra, mas recebe VANTAGEM (2d20) no próximo Teste contra a Morte graças a ${helper.name}!`,
      });
    },
    [sendRoll, showTacticalAlert, triggerSlashVfx, updateCampaign]
  );

  const gmResolveDeathSave = useCallback(
    (
      characterId: string,
      mode: 'stabilize' | 'save-full' | 'revive-1' | 'revive-full'
    ) => {
      if (roleRef.current !== 'gm') return;
      const camp = campaignRef.current;
      const char = camp.characters.find((c) => c.id === characterId);
      if (!char) return;
      const stats = computeCharacterStats(char, camp);

      const nextHp =
        mode === 'stabilize' || mode === 'revive-1'
          ? 1
          : stats.maxHp;

      const nextDeathSaves = {
        successes: 0,
        failures: 0,
        stabilized: false,
        dead: false,
        assistedBy: undefined,
      };

      if (socketRef.current?.connected) {
        socketRef.current.emit('character:deathSave', {
          characterId: char.id,
          hp: nextHp,
          deathSaves: nextDeathSaves,
        });
      }

      updateCampaign((prev) => ({
        ...prev,
        characters: prev.characters.map((c) =>
          c.id === char.id ? { ...c, hp: nextHp, deathSaves: nextDeathSaves } : c
        ),
        maps: prev.maps.map((m) => ({
          ...m,
          tokens: m.tokens.map((t) =>
            t.type === 'character' && t.referenceId === char.id
              ? { ...t, hp: nextHp, maxHp: stats.maxHp }
              : t
          ),
        })),
        combat: {
          ...prev.combat,
          combatants: prev.combat.combatants.map((cb) =>
            cb.type === 'character' && cb.referenceId === char.id
              ? { ...cb, hp: nextHp, maxHp: stats.maxHp }
              : cb
          ),
        },
      }));

      const activeMap = camp.maps.find((m) => m.id === camp.activeMapId);
      const charTok = activeMap?.tokens.find(
        (t) => t.type === 'character' && t.referenceId === char.id
      );
      soundEngine.playSfxPreset('heal');
      if (charTok) triggerSlashVfx(charTok.id, 'heal');

      const detailByMode: Record<typeof mode, string> = {
        stabilize: `O Mestre estabilizou ${char.name} nos Portões da Morte (3/3 sucessos).`,
        'save-full': `O Mestre salvou totalmente ${char.name} do Teste contra a Morte (PV ${stats.maxHp}/${stats.maxHp}).`,
        'revive-1': `O Mestre reviveu ${char.name} dentre os mortos com 1 PV!`,
        'revive-full': `O Mestre ressuscitou ${char.name} com vitalidade plena (${stats.maxHp}/${stats.maxHp} PV)!`,
      };

      sendRoll({
        rollerName: 'Mestre',
        rollerRole: 'gm',
        rollerColor: '#e0b84c',
        diceSkin: 'gold',
        title: mode.startsWith('revive') ? `Ressurreição: ${char.name}` : `Salvação: ${char.name}`,
        formula: mode === 'stabilize' ? 'Estabilizado' : `${nextHp} PV`,
        individualRolls: [],
        total: nextHp,
        isCrit: false,
        isFumble: false,
        isSecret: false,
        details: detailByMode[mode],
      });
    },
    [sendRoll, triggerSlashVfx, updateCampaign]
  );

  const claimTreasureMarker = useCallback(
    (markerId: string) => {
      const camp = campaignRef.current;
      const activeMap = camp.maps.find((m) => m.id === camp.activeMapId);
      if (!activeMap) return;
      const marker = (activeMap.gmMarkers || []).find((gm) => gm.id === markerId);
      if (!marker || (!marker.revealed && roleRef.current !== 'gm')) return;

      const char =
        roleRef.current === 'player'
          ? camp.characters.find((c) => c.ownerPlayerId === myPlayerId) ||
            camp.characters.find((c) => c.id === activeCharRef.current)
          : camp.characters.find((c) => c.id === activeCharRef.current) || camp.characters[0];

      if (!char) {
        showTacticalAlert('Nenhum herói selecionado para pegar o tesouro.');
        return;
      }
      if (char.hp <= 0) {
        showTacticalAlert(`${char.name} está caído (0 PV) e não pode pegar o tesouro!`);
        return;
      }

      const heroTok = activeMap.tokens.find(
        (t) => t.type === 'character' && t.referenceId === char.id
      );
      if (heroTok && roleRef.current !== 'gm') {
        const sqMeters = camp.settings.gridSquareMeters || 1.5;
        const dist = getGridSpanDistance(
          heroTok.x,
          heroTok.y,
          heroTok.size,
          marker.x,
          marker.y,
          1,
          sqMeters
        );
        if (dist.squares > 1) {
          showTacticalAlert(
            `Aproxime-se de "${marker.title}" (${dist.meters}m — fique a até 1,5m para pegar o tesouro).`
          );
          return;
        }
      }

      const lootItems = marker.lootItems || [];
      const lootGold = Math.max(0, marker.lootGold || 0);
      if (lootItems.length === 0 && lootGold === 0) {
        showTacticalAlert(`"${marker.title}" já está vazio.`);
        return;
      }

      updateCampaign((prev) => ({
        ...prev,
        characters: prev.characters.map((c) => {
          if (c.id !== char.id) return c;
          const nextInventory = [...c.inventory];
          for (const loot of lootItems) {
            if (loot.quantity <= 0) continue;
            const existingIdx = nextInventory.findIndex((inv) => inv.itemId === loot.itemId);
            if (existingIdx >= 0) {
              nextInventory[existingIdx] = {
                ...nextInventory[existingIdx],
                quantity: nextInventory[existingIdx].quantity + loot.quantity,
              };
            } else {
              nextInventory.push({
                id: `inv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                itemId: loot.itemId,
                quantity: loot.quantity,
                equipped: false,
              });
            }
          }
          return {
            ...c,
            gold: (c.gold || 0) + lootGold,
            inventory: nextInventory,
          };
        }),
        maps: prev.maps.map((m) =>
          m.id !== activeMap.id
            ? m
            : {
                ...m,
                gmMarkers: (m.gmMarkers || []).filter((gm) => gm.id !== markerId),
              }
        ),
      }));

      soundEngine.playSfxPreset('heal');
      const itemLabels = lootItems
        .map((li) => {
          const def = camp.compendium.items.find((i) => i.id === li.itemId);
          return `${li.quantity}x ${def?.name || 'Item'}`;
        })
        .concat(lootGold > 0 ? [`${lootGold} PO`] : []);

      sendRoll({
        rollerName: char.name,
        rollerRole: roleRef.current,
        rollerColor: char.playerColor || char.tokenColor,
        diceSkin: char.diceSkin || 'gold',
        title: `Tesouro Coletado: ${marker.title}`,
        formula: 'Saque',
        individualRolls: [],
        total: lootGold,
        isSecret: false,
        details: `${char.name} pegou: ${itemLabels.join(', ')}.`,
      });
    },
    [myPlayerId, sendRoll, showTacticalAlert, updateCampaign]
  );

  // Sync visible chat history from campaign.chatLog (hiding other players' private whispers)
  useEffect(() => {
    const rawChat = campaign.chatLog || [];
    const myCharNameLower = (myCharacter?.name || '').toLowerCase();
    const myNameLower = (myPlayerName || '').toLowerCase();
    const visible = rawChat.filter((m) => {
      if (!m.isWhisper) return true;
      if (role === 'gm') return true;
      if (m.senderPlayerId === myPlayerId) return true;
      if (m.recipientPlayerId && m.recipientPlayerId === myPlayerId) return true;
      const recLower = (m.recipientName || '').toLowerCase();
      return Boolean(
        recLower && (recLower === myNameLower || (myCharNameLower && recLower === myCharNameLower))
      );
    });
    setChatMessages((prev) => {
      const byId = new Map<string, ChatMessageEntry>();
      visible.forEach((m) => byId.set(m.id, m));
      prev.forEach((m) => {
        if (!byId.has(m.id)) byId.set(m.id, m);
      });
      return Array.from(byId.values()).slice(-150);
    });
  }, [campaign.chatLog, myCharacter?.name, myPlayerId, myPlayerName, role]);

  const emitSavePromptState = useCallback((prompt: TacticalSavePrompt | null) => {
    activeSavePromptRef.current = prompt;
    setActiveSavePrompt(prompt);
    if (socketRef.current?.connected) {
      socketRef.current.emit('save-prompt:update', prompt);
    }
  }, []);

  const getTokenSaveBonus = useCallback(
    (tok: MapToken, saveSkillId: string): number => {
      const camp = campaignRef.current;
      if (tok.type === 'character' && tok.referenceId) {
        const ch = camp.characters.find((c) => c.id === tok.referenceId);
        if (ch) {
          const st = computeCharacterStats(ch, camp);
          if (st.skills[saveSkillId]) return st.skills[saveSkillId].total;
          if (saveSkillId === 'fortitude' || saveSkillId === 'con') return st.attributes['con']?.mod ?? 0;
          if (saveSkillId === 'reflexos' || saveSkillId === 'des') return st.attributes['des']?.mod ?? 0;
          if (saveSkillId === 'vontade' || saveSkillId === 'sab') return st.attributes['sab']?.mod ?? 0;
          if (saveSkillId === 'salv-forca' || saveSkillId === 'for') return st.attributes['for']?.mod ?? 0;
          if (saveSkillId === 'salv-inteligencia' || saveSkillId === 'int') return st.attributes['int']?.mod ?? 0;
          if (saveSkillId === 'salv-carisma' || saveSkillId === 'car') return st.attributes['car']?.mod ?? 0;
          return 0;
        }
      }
      if (tok.type === 'monster' && tok.referenceId) {
        const mon = camp.compendium.monsters.find((m) => m.id === tok.referenceId);
        if (mon) {
          if (saveSkillId === 'fortitude' || saveSkillId === 'con') return mon.saves.fort;
          if (saveSkillId === 'reflexos' || saveSkillId === 'des') return mon.saves.ref;
          if (saveSkillId === 'vontade' || saveSkillId === 'sab') return mon.saves.von;
          if (saveSkillId === 'salv-forca' || saveSkillId === 'for')
            return mon.saves.for ?? Math.floor(((mon.attributes['for'] ?? 10) - 10) / 2);
          if (saveSkillId === 'salv-inteligencia' || saveSkillId === 'int')
            return mon.saves.int ?? Math.floor(((mon.attributes['int'] ?? 10) - 10) / 2);
          if (saveSkillId === 'salv-carisma' || saveSkillId === 'car')
            return mon.saves.car ?? Math.floor(((mon.attributes['car'] ?? 10) - 10) / 2);
        }
      }
      return 0;
    },
    []
  );

  const setCharacterConcentration = useCallback(
    (characterId: string, spellName: string | null) => {
      const currChar = campaignRef.current.characters.find((c) => c.id === characterId);
      const prevSpell = currChar?.concentratingSpell || null;
      const concEffectsToClear =
        spellName === null
          ? (currChar?.activeTrackedEffects || []).filter((e) => e.isConcentration)
          : [];

      updateCampaign((prev) => {
        const base =
          concEffectsToClear.length > 0
            ? removeTrackedEffectsFromState(prev, characterId, concEffectsToClear)
            : prev;
        return {
          ...base,
          characters: base.characters.map((c) =>
            c.id === characterId ? { ...c, concentratingSpell: spellName } : c
          ),
          combat: {
            ...base.combat,
            combatants: base.combat.combatants.map((cb) =>
              cb.referenceId === characterId ? { ...cb, concentratingSpell: spellName } : cb
            ),
          },
        };
      });

      if (spellName === null && prevSpell && currChar) {
        const affectedNames = concEffectsToClear.flatMap((e) => e.targetNames).filter(Boolean);
        pushCombatLog({
          category: 'condition',
          actorName: currChar.name,
          actorKind: 'hero',
          actorColor: currChar.playerColor || currChar.tokenColor,
          summary:
            affectedNames.length > 0
              ? `encerrou concentração em ${prevSpell} — efeito removido de ${affectedNames.join(', ')}`
              : `encerrou concentração em ${prevSpell}`,
        });
      }
    },
    [pushCombatLog, updateCampaign]
  );

  const startTacticalSavePrompt = useCallback(
    (params: {
      kind: TacticalSavePrompt['kind'];
      title: string;
      subtitle?: string;
      saveSkillId: string;
      saveLabel: string;
      dc: number;
      damageFormula?: string;
      damageType?: string;
      halfOnSuccess?: boolean;
      applyConditionId?: string;
      conditionDurationRounds?: number;
      casterCharacterId?: string;
      casterName?: string;
      requiresConcentration?: boolean;
      singleTargetOnly?: boolean;
      tokens: MapToken[];
    }) => {
      if (params.tokens.length === 0) return;
      const rawDamage =
        params.damageFormula && params.damageFormula.trim()
          ? Math.max(1, evaluateFormula(params.damageFormula).total)
          : 0;

      const autoApplyTargets: Array<{ tokenId: string; dmg: number; applyCond: boolean }> = [];
      const failedAutoTokens: MapToken[] = [];
      const shouldAutoApplyKind = params.kind === 'aoe' || params.kind === 'trap';

      const entries: TacticalSaveTargetEntry[] = params.tokens.map((tok) => {
        const isMonsterOrNpc = tok.type !== 'character';
        if (isMonsterOrNpc) {
          const bonus = getTokenSaveBonus(tok, params.saveSkillId);
          const d20 = Math.floor(Math.random() * 20) + 1;
          const total = d20 + bonus;
          const passed = total >= params.dc;
          const dmg =
            rawDamage > 0
              ? passed
                ? params.halfOnSuccess
                  ? Math.floor(rawDamage / 2)
                  : 0
                : rawDamage
              : 0;
          const applyCond = Boolean(!passed && params.applyConditionId);
          const willAutoApply = shouldAutoApplyKind && (dmg > 0 || applyCond);
          if (willAutoApply) {
            autoApplyTargets.push({ tokenId: tok.id, dmg, applyCond });
          }
          if (applyCond) {
            failedAutoTokens.push(tok);
          }
          return {
            tokenId: tok.id,
            characterId: tok.type === 'character' ? tok.referenceId : undefined,
            name: tok.name,
            type: tok.type,
            color: tok.color,
            imageUrl: tok.imageUrl,
            status: passed ? 'passed' : 'failed',
            d20,
            bonus,
            total,
            damageToApply: dmg,
            applied: willAutoApply,
          };
        }

        // Hybrid Mode: Player characters stay pending so the player clicks & rolls their own d20!
        return {
          tokenId: tok.id,
          characterId: tok.referenceId,
          name: tok.name,
          type: tok.type,
          color: tok.color,
          imageUrl: tok.imageUrl,
          status: 'pending',
          damageToApply: rawDamage,
          applied: false,
        };
      });

      const prompt: TacticalSavePrompt = {
        id: `sp-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        kind: params.kind,
        title: params.title,
        subtitle: params.subtitle,
        saveSkillId: params.saveSkillId,
        saveLabel: params.saveLabel,
        dc: params.dc,
        damageFormula: params.damageFormula,
        damageType: params.damageType,
        halfOnSuccess: params.halfOnSuccess,
        rolledRawDamage: rawDamage,
        applyConditionId: params.applyConditionId,
        conditionDurationRounds: params.conditionDurationRounds,
        casterCharacterId: params.casterCharacterId,
        casterName: params.casterName,
        requiresConcentration: params.requiresConcentration,
        singleTargetOnly: params.singleTargetOnly,
        targets: entries,
      };
      emitSavePromptState(prompt);
      soundEngine.playSfxPreset(params.kind === 'trap' ? 'sword' : 'dice');

      if (
        failedAutoTokens.length > 0 &&
        params.casterCharacterId &&
        params.applyConditionId &&
        (params.requiresConcentration || params.singleTargetOnly)
      ) {
        updateCampaign((prev) => ({
          ...prev,
          characters: prev.characters.map((c) => {
            if (c.id !== params.casterCharacterId) return c;
            return upsertTrackedEffectOnCharacter(c, {
              abilityKey: normalizeAbilityKey(params.title),
              abilityName: params.title,
              conditionId: params.applyConditionId,
              targetTokenIds: failedAutoTokens.map((t) => t.id),
              targetCharacterIds: failedAutoTokens
                .filter((t) => t.type === 'character' && t.referenceId)
                .map((t) => t.referenceId!),
              targetNames: failedAutoTokens.map((t) => t.name),
              isConcentration: params.requiresConcentration,
              singleTargetOnly: params.singleTargetOnly,
            });
          }),
        }));
      }

      if (autoApplyTargets.length > 0) {
        if (params.casterName) {
          const totalAutoDmg = autoApplyTargets.reduce((sum, x) => sum + x.dmg, 0);
          if (totalAutoDmg > 0) {
            recordCombatStat(params.casterName, '#e0b84c', { damage: totalAutoDmg });
          }
        }
        window.setTimeout(() => {
          autoApplyTargets.forEach(({ tokenId, dmg, applyCond }) => {
            applyDamage(
              tokenId,
              dmg,
              false,
              undefined,
              params.damageType,
              applyCond ? params.applyConditionId : undefined,
              params.conditionDurationRounds
            );
            if (dmg > 0) triggerSlashVfx(tokenId, 'hit');
          });
        }, 120);
      }
    },
    [applyDamage, emitSavePromptState, getTokenSaveBonus, triggerSlashVfx, updateCampaign]
  );

  startTacticalSavePromptRef.current = startTacticalSavePrompt;

  const rollSavePromptTarget = useCallback(
    (tokenId: string) => {
      const prompt = activeSavePromptRef.current;
      if (!prompt) return;
      const camp = campaignRef.current;
      const activeMap = camp.maps.find((m) => m.id === camp.activeMapId) || camp.maps[0];
      const tok = activeMap?.tokens.find((t) => t.id === tokenId);
      const entry = prompt.targets.find((t) => t.tokenId === tokenId);
      if (!entry || entry.status !== 'pending') return;

      const bonus = tok ? getTokenSaveBonus(tok, prompt.saveSkillId) : 0;
      const saveFormula = `1d20 ${bonus >= 0 ? `+ ${bonus}` : `- ${Math.abs(bonus)}`}`;
      const ch = entry.characterId
        ? camp.characters.find((c) => c.id === entry.characterId)
        : undefined;

      openManualRoll({
        title: `${prompt.title} — ${prompt.saveLabel}`,
        subtitle: `Dificuldade: CD ${prompt.dc}`,
        formula: saveFormula,
        displayFormula: saveFormula,
        previewDice: buildPreviewDiceForFormula('1d20', 'normal'),
        rollerName: entry.name,
        rollerColor: entry.color,
        diceSkin: (ch?.diceSkin || 'gold') as DiceSkin,
        allowAdvantageToggle: true,
        advantageMode: 'normal',
        onExecute: (chosenMode) => {
          const livePrompt = activeSavePromptRef.current;
          if (!livePrompt || livePrompt.id !== prompt.id) return;
          const liveEntry = livePrompt.targets.find((t) => t.tokenId === tokenId);
          if (!liveEntry || liveEntry.status !== 'pending') return;

          const r1 = Math.floor(Math.random() * 20) + 1;
          const r2 = chosenMode !== 'normal' ? Math.floor(Math.random() * 20) + 1 : undefined;
          const d20 =
            r2 === undefined
              ? r1
              : chosenMode === 'advantage'
                ? Math.max(r1, r2)
                : Math.min(r1, r2);
          const rolledDice: RolledDieVisual[] =
            r2 === undefined
              ? [{ sides: 20, value: r1 }]
              : [
                  { sides: 20, value: r1, discarded: r1 !== d20 },
                  { sides: 20, value: r2, discarded: r2 !== d20 || r1 === r2 },
                ];

          const total = d20 + bonus;
          const passed = total >= livePrompt.dc;
          const rawDmg = livePrompt.rolledRawDamage || 0;
          const dmgToApply =
            rawDmg > 0
              ? passed
                ? livePrompt.halfOnSuccess
                  ? Math.floor(rawDmg / 2)
                  : 0
                : rawDmg
              : 0;
          const applyCond = Boolean(!passed && livePrompt.applyConditionId);

          const shouldAutoApply =
            (livePrompt.kind === 'trap' || livePrompt.kind === 'aoe') &&
            (dmgToApply > 0 || applyCond);
          if (shouldAutoApply) {
            if (livePrompt.casterName && dmgToApply > 0) {
              recordCombatStat(livePrompt.casterName, '#e0b84c', { damage: dmgToApply });
            }
            applyDamage(
              tokenId,
              dmgToApply,
              false,
              undefined,
              livePrompt.damageType,
              applyCond ? livePrompt.applyConditionId : undefined,
              livePrompt.conditionDurationRounds
            );
            if (dmgToApply > 0) triggerSlashVfx(tokenId, 'hit');
          }
          if (
            applyCond &&
            livePrompt.casterCharacterId &&
            (livePrompt.requiresConcentration || livePrompt.singleTargetOnly)
          ) {
            updateCampaign((prev) => ({
              ...prev,
              characters: prev.characters.map((c) => {
                if (c.id !== livePrompt.casterCharacterId) return c;
                const key = normalizeAbilityKey(livePrompt.title);
                const prevEff = (c.activeTrackedEffects || []).find((e) => e.abilityKey === key);
                const nextTokenIds = Array.from(new Set([...(prevEff?.targetTokenIds || []), tokenId]));
                const nextCharIds = Array.from(
                  new Set([
                    ...(prevEff?.targetCharacterIds || []),
                    ...(liveEntry.characterId ? [liveEntry.characterId] : []),
                  ])
                );
                const nextNames = Array.from(new Set([...(prevEff?.targetNames || []), liveEntry.name]));
                return upsertTrackedEffectOnCharacter(c, {
                  abilityKey: key,
                  abilityName: livePrompt.title,
                  conditionId: livePrompt.applyConditionId,
                  targetTokenIds: nextTokenIds,
                  targetCharacterIds: nextCharIds,
                  targetNames: nextNames,
                  isConcentration: livePrompt.requiresConcentration,
                  singleTargetOnly: livePrompt.singleTargetOnly,
                });
              }),
            }));
          }

          const updated: TacticalSavePrompt = {
            ...livePrompt,
            targets: livePrompt.targets.map((t) =>
              t.tokenId === tokenId
                ? {
                    ...t,
                    status: passed ? 'passed' : 'failed',
                    d20,
                    bonus,
                    total,
                    damageToApply: dmgToApply,
                    applied: shouldAutoApply ? true : t.applied,
                  }
                : t
            ),
          };
          emitSavePromptState(updated);

          sendRoll({
            rollerName: liveEntry.name,
            rollerRole: liveEntry.type === 'character' ? 'player' : 'gm',
            rollerColor: liveEntry.color,
            diceSkin: (ch?.diceSkin || 'gold') as DiceSkin,
            title: `${livePrompt.title} — ${livePrompt.saveLabel} (CD ${livePrompt.dc})`,
            formula: saveFormula,
            individualRolls: [
              r2 !== undefined
                ? `2d20: [${r1}, ${r2}] → ${d20} ${bonus >= 0 ? `+ ${bonus}` : `- ${Math.abs(bonus)}`}`
                : `1d20: [${d20}] ${bonus >= 0 ? `+ ${bonus}` : `- ${Math.abs(bonus)}`}`,
            ],
            rolledDice,
            d20Natural: d20,
            total,
            isCrit: d20 === 20,
            isFumble: d20 === 1,
            isSecret: false,
            details:
              livePrompt.kind === 'concentration'
                ? passed
                  ? `CONCENTRAÇÃO MANTIDA! (${total} vs CD ${livePrompt.dc})`
                  : `CONCENTRAÇÃO QUEBRADA! (${total} vs CD ${livePrompt.dc})`
                : passed
                  ? `PASSOU NA SALVAGUARDA! (${total} vs CD ${livePrompt.dc})${dmgToApply > 0 ? ` • Metade: ${dmgToApply}` : ' • Sem dano'}`
                  : `FALHOU NA SALVAGUARDA! (${total} vs CD ${livePrompt.dc})${dmgToApply > 0 ? ` • Dano: ${dmgToApply}` : ''}${applyCond ? ' • Condição aplicada!' : ''}`,
          });

          if (livePrompt.kind === 'concentration' && !passed && liveEntry.characterId) {
            setCharacterConcentration(liveEntry.characterId, null);
          }
        },
      });
    },
    [applyDamage, emitSavePromptState, getTokenSaveBonus, openManualRoll, sendRoll, setCharacterConcentration, triggerSlashVfx, updateCampaign]
  );

  const rollAllPendingSaveTargets = useCallback(() => {
    const prompt = activeSavePromptRef.current;
    if (!prompt) return;
    const camp = campaignRef.current;
    const activeMap = camp.maps.find((m) => m.id === camp.activeMapId) || camp.maps[0];
    const rawDmg = prompt.rolledRawDamage || 0;
    const brokenConcCharIds: string[] = [];

    const nextTargets = prompt.targets.map((t) => {
      if (t.status !== 'pending') return t;
      const tok = activeMap?.tokens.find((x) => x.id === t.tokenId);
      const bonus = tok ? getTokenSaveBonus(tok, prompt.saveSkillId) : 0;
      const d20 = Math.floor(Math.random() * 20) + 1;
      const total = d20 + bonus;
      const passed = total >= prompt.dc;
      const dmgToApply =
        rawDmg > 0
          ? passed
            ? prompt.halfOnSuccess
              ? Math.floor(rawDmg / 2)
              : 0
            : rawDmg
          : 0;
      if (prompt.kind === 'concentration' && !passed && t.characterId) {
        brokenConcCharIds.push(t.characterId);
      }
      const applyCond = Boolean(!passed && prompt.applyConditionId);
      const shouldAutoApply =
        (prompt.kind === 'trap' || prompt.kind === 'aoe') && (dmgToApply > 0 || applyCond);
      if (shouldAutoApply) {
        applyDamage(
          t.tokenId,
          dmgToApply,
          false,
          undefined,
          prompt.damageType,
          applyCond ? prompt.applyConditionId : undefined,
          prompt.conditionDurationRounds
        );
        if (dmgToApply > 0) triggerSlashVfx(t.tokenId, 'hit');
      }
      return {
        ...t,
        status: (passed ? 'passed' : 'failed') as 'passed' | 'failed',
        d20,
        bonus,
        total,
        damageToApply: dmgToApply,
        applied: shouldAutoApply ? true : t.applied,
      };
    });

    emitSavePromptState({ ...prompt, targets: nextTargets });
    soundEngine.playSfxPreset('dice');
    brokenConcCharIds.forEach((cid) => setCharacterConcentration(cid, null));
  }, [applyDamage, emitSavePromptState, getTokenSaveBonus, setCharacterConcentration, triggerSlashVfx]);

  const applySavePromptDamages = useCallback(() => {
    const prompt = activeSavePromptRef.current;
    if (!prompt) return;
    const nextTargets = prompt.targets.map((t) => {
      if (t.status === 'pending' || t.applied) return t;
      if (t.damageToApply > 0) {
        applyDamage(t.tokenId, t.damageToApply, false, undefined, prompt.damageType);
        triggerSlashVfx(t.tokenId, 'hit');
      }
      return { ...t, applied: true };
    });
    emitSavePromptState({ ...prompt, targets: nextTargets });
    soundEngine.playSfxPreset('fireball');
  }, [applyDamage, emitSavePromptState, triggerSlashVfx]);

  const triggerSecretPassage = useCallback((markerId: string, token?: MapToken) => {
    const camp = campaignRef.current;
    const activeMap = camp.maps.find((m) => m.id === camp.activeMapId) || camp.maps[0];
    const marker = activeMap?.gmMarkers?.find((gm) => gm.id === markerId);
    if (!activeMap || !marker || marker.kind !== 'secret') return;
    const targetMap = marker.targetMapId
      ? camp.maps.find((m) => m.id === marker.targetMapId)
      : undefined;

    setActiveSecretPassage({
      id: `passage-${Date.now()}`,
      markerId: marker.id,
      markerTitle: marker.title,
      markerDescription: marker.description,
      sourceMapId: activeMap.id,
      targetMapId: targetMap?.id,
      targetMapName: targetMap?.name,
      tokenId: token?.id,
      tokenName: token?.name,
      revealed: marker.revealed,
    });
    soundEngine.playSfxPreset('magic');
  }, []);

  const dismissSecretPassage = useCallback(() => {
    setActiveSecretPassage(null);
  }, []);

  const moveTokensToMap = useCallback(
    (sourceMapId: string, targetMapId: string, tokenIds: string[] | 'all-heroes') => {
      if (sourceMapId === targetMapId) return;
      updateCampaign((prev) => {
        const srcMap = prev.maps.find((m) => m.id === sourceMapId);
        const dstMap = prev.maps.find((m) => m.id === targetMapId);
        if (!srcMap || !dstMap) return prev;

        const movingTokens =
          tokenIds === 'all-heroes'
            ? srcMap.tokens.filter((t) => t.type === 'character')
            : srcMap.tokens.filter((t) => tokenIds.includes(t.id));
        if (movingTokens.length === 0) return { ...prev, activeMapId: targetMapId };

        const movingIds = new Set(movingTokens.map((t) => t.id));
        const movingRefIds = new Set(
          movingTokens.filter((t) => t.referenceId).map((t) => `${t.type}:${t.referenceId}`)
        );

        const nextDstTokens = [...dstMap.tokens];
        movingTokens.forEach((tok, idx) => {
          const alreadyIdx = nextDstTokens.findIndex(
            (existing) =>
              existing.id === tok.id ||
              (tok.referenceId &&
                existing.type === tok.type &&
                existing.referenceId === tok.referenceId)
          );
          const spawnPos = findNearestFreeGridCell(
            { ...dstMap, tokens: nextDstTokens },
            Math.min(dstMap.gridWidth - 1, 2 + idx),
            Math.min(dstMap.gridHeight - 1, 2),
            tok.size
          );
          const relocated: MapToken = { ...tok, x: spawnPos.x, y: spawnPos.y };
          if (alreadyIdx >= 0) {
            nextDstTokens[alreadyIdx] = relocated;
          } else {
            nextDstTokens.push(relocated);
          }
        });

        return {
          ...prev,
          activeMapId: targetMapId,
          maps: prev.maps.map((m) => {
            if (m.id === sourceMapId) {
              return {
                ...m,
                tokens: m.tokens.filter(
                  (t) =>
                    !movingIds.has(t.id) &&
                    !(t.referenceId && movingRefIds.has(`${t.type}:${t.referenceId}`))
                ),
              };
            }
            if (m.id === targetMapId) {
              return { ...m, tokens: nextDstTokens };
            }
            return m;
          }),
        };
      });
      setActiveSecretPassage(null);
    },
    [updateCampaign]
  );

  const dismissSavePrompt = useCallback(() => {
    emitSavePromptState(null);
  }, [emitSavePromptState]);

  const triggerTrapOnToken = useCallback(
    (markerId: string, token: MapToken) => {
      const camp = campaignRef.current;
      const activeMap = camp.maps.find((m) => m.id === camp.activeMapId) || camp.maps[0];
      const marker = activeMap?.gmMarkers?.find((gm) => gm.id === markerId);
      if (!marker || marker.kind !== 'trap' || marker.trapTriggered) return;

      // Reveal & mark triggered so it does not double-fire
      updateCampaign((prev) => ({
        ...prev,
        maps: prev.maps.map((m) =>
          m.id === activeMap.id
            ? {
                ...m,
                gmMarkers: (m.gmMarkers || []).map((gm) =>
                  gm.id === markerId ? { ...gm, revealed: true, trapTriggered: true } : gm
                ),
              }
            : m
        ),
      }));

      const saveSkillId = marker.trapSaveSkillId || 'reflexos';
      const saveLabel =
        saveSkillId === 'fortitude'
          ? 'Fortitude (CON)'
          : saveSkillId === 'vontade'
            ? 'Vontade (SAB)'
            : 'Reflexos (DES)';

      startTacticalSavePrompt({
        kind: 'trap',
        title: `Armadilha: ${marker.title}`,
        subtitle: marker.description || `${token.name} acionou uma armadilha oculta!`,
        saveSkillId,
        saveLabel,
        dc: marker.trapDc || 13,
        damageFormula: marker.trapDamageFormula || '2d6',
        damageType: marker.trapDamageType || 'Perfuração',
        halfOnSuccess: true,
        tokens: [token],
      });
    },
    [startTacticalSavePrompt, updateCampaign]
  );

  const triggerAoESavePrompt = useCallback(
    (
      templateId: string,
      params: {
        title: string;
        saveSkillId: string;
        saveLabel: string;
        dc: number;
        damageFormula: string;
        damageType: string;
        halfOnSuccess: boolean;
      }
    ) => {
      const camp = campaignRef.current;
      const activeMap = camp.maps.find((m) => m.id === camp.activeMapId) || camp.maps[0];
      const tmpl = activeMap?.templates.find((t) => t.id === templateId);
      if (!activeMap || !tmpl) return;
      const affected = getTokensInsideTemplate(activeMap, tmpl);
      if (affected.length === 0) {
        showTacticalAlert('Nenhum token vivo encontrado dentro desta área AoE.');
        return;
      }
      startTacticalSavePrompt({
        kind: 'aoe',
        title: params.title || tmpl.label,
        subtitle: `${affected.length} ${affected.length === 1 ? 'alvo' : 'alvos'} na área de ${tmpl.label}`,
        saveSkillId: params.saveSkillId,
        saveLabel: params.saveLabel,
        dc: params.dc,
        damageFormula: params.damageFormula,
        damageType: params.damageType,
        halfOnSuccess: params.halfOnSuccess,
        tokens: affected,
      });
    },
    [showTacticalAlert, startTacticalSavePrompt]
  );

  useEffect(() => {
    startConcentrationPromptRef.current = (payload) => {
      const camp = campaignRef.current;
      const activeMap = camp.maps.find((m) => m.id === camp.activeMapId) || camp.maps[0];
      const tok = activeMap?.tokens.find((t) => t.id === payload.tokenId);
      const syntheticToken: MapToken = tok || {
        id: payload.tokenId,
        referenceId: payload.characterId,
        name: payload.name,
        type: payload.characterId ? 'character' : 'monster',
        x: 0,
        y: 0,
        size: 1,
        hp: 1,
        maxHp: 1,
        defense: 10,
        activeConditionIds: [],
        isHidden: false,
        color: '#a855f7',
      };
      startTacticalSavePrompt({
        kind: 'concentration',
        title: `Concentração: ${payload.spellName}`,
        subtitle: `${payload.name} sofreu ${payload.damageTaken} de dano — teste de Constituição para manter a magia!`,
        saveSkillId: 'fortitude',
        saveLabel: 'Constituição / Fortitude',
        dc: payload.dc,
        tokens: [syntheticToken],
      });
    };
  }, [startTacticalSavePrompt]);

  const sendChatMessage = useCallback(
    (rawText: string, explicitRecipient?: string) => {
      let text = rawText.trim();
      if (!text) return;

      let recipientName = explicitRecipient?.trim() || '';
      let isWhisper = Boolean(recipientName);

      // Parse /w Nome mensagem or /sussurro Nome mensagem
      const whisperMatch = text.match(/^\/(?:w|whisper|sussurro)\s+"([^"]+)"\s+(.+)$/i) ||
        text.match(/^\/(?:w|whisper|sussurro)\s+(\S+)\s+(.+)$/i);
      if (whisperMatch) {
        recipientName = whisperMatch[1].trim();
        text = whisperMatch[2].trim();
        isWhisper = Boolean(recipientName);
      }

      const activeChar =
        roleRef.current === 'player'
          ? campaignRef.current.characters.find((c) => c.ownerPlayerId === myPlayerId) ||
            campaignRef.current.characters.find((c) => c.id === activeCharRef.current)
          : undefined;

      const matchedOnline = recipientName
        ? connectedPlayers.find(
            (p) =>
              p.playerName.toLowerCase() === recipientName.toLowerCase() ||
              (p.characterName || '').toLowerCase() === recipientName.toLowerCase()
          )
        : undefined;

      const msg: ChatMessageEntry = {
        id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        senderName:
          roleRef.current === 'gm'
            ? campaignRef.current.gmName || 'Mestre'
            : activeChar?.name || myPlayerName || 'Aventureiro',
        senderRole: roleRef.current,
        senderColor:
          roleRef.current === 'gm'
            ? '#f59e0b'
            : activeChar?.playerColor || myPlayerColor || '#38bdf8',
        senderPlayerId: myPlayerId,
        characterName: activeChar?.name,
        recipientName: isWhisper ? recipientName : undefined,
        recipientPlayerId: matchedOnline?.playerId,
        isWhisper,
        text,
      };

      if (socketRef.current?.connected) {
        socketRef.current.emit('chat:send', msg);
      } else {
        setChatMessages((prev) => [...prev, msg].slice(-150));
      }
    },
    [connectedPlayers, myPlayerColor, myPlayerId, myPlayerName]
  );

  const markChatRead = useCallback(() => {
    setUnreadChatCount(0);
  }, []);

  const startCombatFromMap = useCallback(() => {
    combatStatsRef.current = {};
    const curr = campaignRef.current;
    const activeMap = curr.maps.find((m) => m.id === curr.activeMapId);
    const tokens = activeMap?.tokens || [];
    const ceremonyEntries: InitiativeCeremonyState['entries'] = [];

    const combatants = tokens.map((tok) => {
      let initBonus = 1;
      let speedMeters = 9;
      let portraitUrl = tok.imageUrl;
      let frameStyle = tok.frameStyle;
      let tokColor = tok.color;

      if (tok.type === 'character' && tok.referenceId) {
        const ch = curr.characters.find((c) => c.id === tok.referenceId);
        if (ch) {
          const stats = computeCharacterStats(ch, curr);
          initBonus = stats.initiative;
          speedMeters = stats.speed || 9;
          portraitUrl = ch.portraitUrl || portraitUrl;
          frameStyle = ch.tokenFrameStyle || frameStyle;
          tokColor = ch.playerColor || ch.tokenColor;
        }
      } else if (tok.type === 'monster' && tok.referenceId) {
        const mon = curr.compendium.monsters.find((m) => m.id === tok.referenceId);
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
        type: (tok.type === 'character' ? 'character' : 'monster') as 'character' | 'monster',
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
      rollerName: 'Mestre',
      rollerRole: 'gm',
      rollerColor: '#e0b84c',
      diceSkin: 'gold',
      title: 'Combate Iniciado! (Ordem de Iniciativa)',
      formula: '1d20 + INI',
      individualRolls: [],
      total: combatants[0]?.initiative || 0,
      isSecret: false,
      details: combatants
        .filter((c) => !c.isHidden)
        .map((c, idx) => `${idx + 1}º ${c.name} (${c.initiative})`)
        .join(' → '),
    });
  }, [sendRoll, showInitiativeCeremony, updateCampaign]);

  useEffect(() => {
    startDuelRef.current = startCombatDuel;
  }, [startCombatDuel]);

  const castAoEAbility = useCallback(
    (choice: PendingAttackChoice, originX: number, originY: number, angleDeg: number) => {
      const curr = campaignRef.current;
      const activeMap = curr.maps.find((m) => m.id === curr.activeMapId) || curr.maps[0];
      if (!activeMap || !choice.aoeShape) return;

      const sqM = curr.settings.gridSquareMeters || 1.5;
      const sizeMeters = choice.aoeSizeMeters || 6;
      // Sphere uses diameter (radius = diameter / 2); cube/cone/line use full width/length
      const totalSquares = Math.max(1, sizeMeters / sqM);
      const radiusSquares =
        choice.aoeShape === 'sphere' ? Math.max(0.5, totalSquares / 2) : totalSquares;
      const tmplId = `aoe-cast-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
      const baseHex =
        choice.aoeColor ||
        (choice.damageType?.toLowerCase().includes('fogo')
          ? '#f97316'
          : choice.damageType?.toLowerCase().includes('gelo') || choice.damageType?.toLowerCase().includes('frio')
            ? '#38bdf8'
            : choice.damageType?.toLowerCase().includes('veneno') || choice.damageType?.toLowerCase().includes('ácido')
              ? '#22c55e'
              : choice.damageType?.toLowerCase() === 'cura'
                ? '#10b981'
                : '#a855f7');
      // Soft translucent fill (~20% opacity) so tokens & grid stay crystal clear underneath
      const tmplColor = baseHex.startsWith('#') && baseHex.length === 7 ? `${baseHex}33` : baseHex;

      const char = choice.attackerCharacterId
        ? curr.characters.find((c) => c.id === choice.attackerCharacterId)
        : undefined;
      const stats = char ? computeCharacterStats(char, curr) : undefined;
      const actionCost = choice.actionCost || 'Padrão';
      const combat = curr.combat;
      const attackerCb = combat.active
        ? combat.combatants.find(
            (cb) =>
              (choice.attackerTokenId && cb.tokenId === choice.attackerTokenId) ||
              (choice.attackerCharacterId && cb.referenceId === choice.attackerCharacterId)
          )
        : undefined;

      setPendingAttackChoice(null);

      const matchingAbilityDef = curr.compendium.abilities.find(
        (ab) => normalizeAbilityKey(ab.name) === normalizeAbilityKey(choice.actionTitle)
      );
      if (char) {
        const usesCheck = checkAbilityUsesRemaining(char, matchingAbilityDef);
        if (!usesCheck.ok) {
          showTacticalAlert(usesCheck.error);
          return;
        }
      }
      const shouldSetConcentration = Boolean(
        choice.requiresConcentration ?? matchingAbilityDef?.requiresConcentration
      );
      const resolvedSfxPreset = choice.sfxPreset || matchingAbilityDef?.sfxPreset;

      void (async () => {
        const conflict = await confirmAbilityConflictIfNeeded(char, {
          abilityName: choice.actionTitle,
          requiresConcentration: shouldSetConcentration,
          singleTargetOnly: false,
        });
        if (!conflict.proceed) return;

        // 1. Place geometric template + optional Elemental Surface on map + spend MP & action economy + concentration
        const surfaceToPaint = choice.createsSurface;
        updateCampaign((prev) => {
          const base = char
            ? removeTrackedEffectsFromState(prev, char.id, conflict.effectsToClear)
            : prev;
          return {
            ...base,
            characters: base.characters.map((c) => {
              if (!char || c.id !== char.id) return c;
              const res = deductCharacterResource(
                c,
                choice.costMp,
                choice.costResourceId,
                base.compendium.customResources
              );
              return {
                ...c,
                ...res,
                abilityUsesRemaining: decrementAbilityUse(c, matchingAbilityDef),
                ...(shouldSetConcentration ? { concentratingSpell: choice.actionTitle } : {}),
              };
            }),
            maps: base.maps.map((m) => {
              if (m.id !== activeMap.id) return m;
              const nextSurfaces = { ...(m.elementalSurfaces || {}) };
              if (surfaceToPaint) {
                for (let gx = 0; gx < m.gridWidth; gx++) {
                  for (let gy = 0; gy < m.gridHeight; gy++) {
                    if (
                      isTokenInsideAoE(
                        { x: gx, y: gy, size: 1 },
                        choice.aoeShape!,
                        originX,
                        originY,
                        radiusSquares,
                        angleDeg
                      )
                    ) {
                      nextSurfaces[`${gx},${gy}`] = surfaceToPaint;
                    }
                  }
                }
              }
              return {
                ...m,
                elementalSurfaces: nextSurfaces,
                templates: [
                  ...m.templates,
                  {
                    id: tmplId,
                    shape: choice.aoeShape!,
                    // StageCanvas renders template origin at (x + 0.5, y + 0.5), so subtract 0.5 for exact pixel alignment
                    x: originX - 0.5,
                    y: originY - 0.5,
                    radiusSquares:
                      choice.aoeShape === 'cube' || choice.aoeShape === 'line'
                        ? Math.max(0.5, radiusSquares / 2)
                        : radiusSquares,
                    angleDeg,
                    color: tmplColor,
                    label: choice.actionTitle,
                  },
                ],
              };
            }),
            combat:
              base.combat.active && attackerCb && (actionCost !== 'Livre' || shouldSetConcentration)
                ? {
                    ...base.combat,
                    combatants: base.combat.combatants.map((cb) =>
                      cb.id !== attackerCb.id
                        ? cb
                        : {
                            ...cb,
                            actionAvailable: actionCost === 'Padrão' ? false : cb.actionAvailable,
                            bonusActionAvailable:
                              actionCost === 'Bônus' ? false : cb.bonusActionAvailable,
                            reactionAvailable:
                              actionCost === 'Reação' ? false : cb.reactionAvailable,
                            ...(shouldSetConcentration
                              ? { concentratingSpell: choice.actionTitle }
                              : {}),
                          }
                    ),
                  }
                : base.combat,
          };
        });

        // Auto-remove transient AoE template after 4.5s unless persistent
        if (!choice.aoePersistent) {
          setTimeout(() => {
            updateCampaign((prev) => ({
              ...prev,
              maps: prev.maps.map((m) =>
                m.id !== activeMap.id
                  ? m
                  : { ...m, templates: m.templates.filter((t) => t.id !== tmplId) }
              ),
            }));
          }, 4500);
        }

        // 2. Find all visible tokens inside the geometric area (respecting aoeTargetFilter!)
        const targetFilter = choice.aoeTargetFilter || 'all';
        const casterIsHeroSide =
          Boolean(choice.attackerCharacterId) ||
          activeMap.tokens.find((t) => t.id === choice.attackerTokenId)?.type !== 'monster';
        const hitTokens = activeMap.tokens.filter((t) => {
          if (t.isHidden || t.hp <= 0) return false;
          if (!isTokenInsideAoE(t, choice.aoeShape!, originX, originY, radiusSquares, angleDeg)) {
            return false;
          }
          const isCaster =
            (choice.attackerTokenId && t.id === choice.attackerTokenId) ||
            (choice.attackerCharacterId &&
              t.type === 'character' &&
              t.referenceId === choice.attackerCharacterId);
          if (targetFilter === 'exclude-caster' && isCaster) return false;
          if (targetFilter === 'exclude-allies') {
            if (isCaster) return false;
            const tokenIsHeroSide =
              t.type === 'character' ||
              (t.type === 'npc' &&
                curr.npcs.find((n) => n.id === t.referenceId)?.disposition !== 'Hostil');
            if (casterIsHeroSide === tokenIsHeroSide) return false;
          }
          return true;
        });

        const isHeal = choice.damageType?.toLowerCase() === 'cura';
        const hasDamage = Boolean(choice.damageFormula && choice.damageType);
        const aoeCasterTok =
          (choice.attackerTokenId && activeMap.tokens.find((t) => t.id === choice.attackerTokenId)) ||
          (choice.attackerCharacterId &&
            activeMap.tokens.find(
              (t) => t.type === 'character' && t.referenceId === choice.attackerCharacterId
            )) ||
          undefined;

        // Collect grid cells inside this AoE for Elemental Surface Chain Reactions!
        const aoeCells: Array<{ x: number; y: number }> = [];
        if (!isHeal && choice.damageType && activeMap.elementalSurfaces) {
          for (let gx = 0; gx < activeMap.gridWidth; gx++) {
            for (let gy = 0; gy < activeMap.gridHeight; gy++) {
              if (
                isTokenInsideAoE(
                  { x: gx, y: gy, size: 1 },
                  choice.aoeShape!,
                  originX,
                  originY,
                  radiusSquares,
                  angleDeg
                )
              ) {
                aoeCells.push({ x: gx, y: gy });
              }
            }
          }
        }

        // Fire animated projectile from caster token to AoE impact center!
        fireProjectileVfx({
          fromToken: aoeCasterTok,
          toX: originX,
          toY: originY,
          title: choice.actionTitle,
          damageType: choice.damageType,
          applyConditionId: choice.applyConditionId,
          range: choice.range,
        });

        if (hitTokens.length === 0) {
          showTacticalAlert(`Nenhum alvo encontrado dentro da área de ${choice.actionTitle}.`);
        }

        if (choice.saveSkillId && hitTokens.length > 0 && !isHeal) {
          const saveSkill = curr.compendium.skills.find((s) => s.id === choice.saveSkillId);
          const dcVal = choice.saveDcFormula
            ? Math.max(5, evaluateFormula(choice.saveDcFormula, stats, char).total)
            : 12;
          playSyncedAbilitySfx({
            explicitSfxPreset: resolvedSfxPreset,
            title: choice.actionTitle,
            damageType: choice.damageType,
            range: choice.range,
            applyConditionId: choice.applyConditionId,
          });
          pushCombatLog({
            category: 'spell',
            actorName: choice.attackerName,
            actorKind: char ? 'hero' : 'monster',
            actorColor: choice.attackerColor,
            summary: `conjurou ${choice.actionTitle} (${sizeMeters}m) — ${hitTokens.length} alvo(s) precisam rolar ${saveSkill?.name || 'Salvaguarda'} (CD ${dcVal})!`,
          });
          if (aoeCells.length > 0) {
            window.setTimeout(() => {
              triggerElementalComboAtCells(
                aoeCells,
                choice.damageType,
                choice.attackerName,
                choice.attackerColor
              );
            }, 220);
          }
          window.setTimeout(() => {
            startTacticalSavePrompt({
              kind: 'aoe',
              title: choice.actionTitle,
              subtitle: `${hitTokens.length} ${hitTokens.length === 1 ? 'alvo' : 'alvos'} na área (${sizeMeters}m)`,
              saveSkillId: choice.saveSkillId!,
              saveLabel: saveSkill?.name || 'Salvaguarda',
              dc: dcVal,
              damageFormula: choice.damageFormula
                ? formatFormulaForDisplay(choice.damageFormula, stats, char)
                : '',
              damageType: choice.damageType || 'Arcano',
              halfOnSuccess: true,
              applyConditionId: choice.applyConditionId,
              conditionDurationRounds: choice.conditionDurationRounds,
              casterCharacterId: char?.id,
              casterName: choice.attackerName,
              requiresConcentration: shouldSetConcentration,
              tokens: hitTokens,
            });
          }, 80);
          return;
        }

        const roll = hasDamage
          ? evaluateFormula(choice.damageFormula!, stats, char)
          : null;
        const totalVal = roll ? Math.max(1, roll.total) : 0;

        playSyncedAbilitySfx({
          explicitSfxPreset: resolvedSfxPreset,
          title: choice.actionTitle,
          damageType: choice.damageType,
          range: choice.range,
          applyConditionId: choice.applyConditionId,
        });

        if (totalVal > 0 && hitTokens.length > 0) {
          recordCombatStat(
            choice.attackerName,
            choice.attackerColor,
            isHeal
              ? { healing: totalVal * hitTokens.length }
              : { damage: totalVal * hitTokens.length }
          );
        }

        if (aoeCells.length > 0) {
          window.setTimeout(() => {
            triggerElementalComboAtCells(
              aoeCells,
              choice.damageType,
              choice.attackerName,
              choice.attackerColor
            );
          }, 340);
        }

        pushCombatLog({
          category: 'spell',
          actorName: choice.attackerName,
          actorKind: char ? 'hero' : 'monster',
          actorColor: choice.attackerColor,
          summary: `conjurou ${choice.actionTitle} (${sizeMeters}m) atingindo ${hitTokens.length} alvo(s)`,
          detail: roll ? `${roll.resolvedFormula} = ${totalVal} (${choice.damageType})` : undefined,
        });

        if (roll) {
          sendRoll({
            rollerName: choice.attackerName,
            rollerRole: roleRef.current,
            title: `${choice.actionTitle} (Área ${sizeMeters}m • ${hitTokens.length} alvo(s))`,
            formula: roll.resolvedFormula,
            total: totalVal,
            individualRolls: roll.individualRolls,
            damageTotal: totalVal,
            damageType: choice.damageType,
            isSecret: false,
            details: `${hitTokens.map((t) => t.name).join(', ') || 'Nenhum alvo na área'} • ${roll.details}`,
            isCrit: false,
            isFumble: false,
          });
        }

        if (
          char &&
          shouldSetConcentration &&
          choice.applyConditionId &&
          hitTokens.length > 0
        ) {
          updateCampaign((prev) => ({
            ...prev,
            characters: prev.characters.map((c) => {
              if (c.id !== char.id) return c;
              return upsertTrackedEffectOnCharacter(c, {
                abilityKey: normalizeAbilityKey(choice.actionTitle),
                abilityName: choice.actionTitle,
                conditionId: choice.applyConditionId,
                targetTokenIds: hitTokens.map((t) => t.id),
                targetCharacterIds: hitTokens
                  .filter((t) => t.type === 'character' && t.referenceId)
                  .map((t) => t.referenceId!),
                targetNames: hitTokens.map((t) => t.name),
                isConcentration: true,
              });
            }),
          }));
        }

        // 3. Apply damage / healing / condition to all tokens inside the area (slight delay so template campaign:update lands before combat:apply-damage!)
        if (hitTokens.length > 0) {
          window.setTimeout(() => {
            hitTokens.forEach((tok) => {
              if (hasDamage && totalVal > 0) {
                applyDamage(
                  tok.id,
                  totalVal,
                  isHeal,
                  undefined,
                  choice.damageType,
                  choice.applyConditionId,
                  choice.conditionDurationRounds
                );
                triggerSlashVfx(tok.id, isHeal ? 'heal' : 'hit');
              } else if (choice.applyConditionId) {
                applyDamage(
                  tok.id,
                  0,
                  false,
                  undefined,
                  undefined,
                  choice.applyConditionId,
                  choice.conditionDurationRounds
                );
              }
            });
          }, 120);
        }
      })();
    },
    [applyDamage, pushCombatLog, sendRoll, showTacticalAlert, startTacticalSavePrompt, triggerSlashVfx, updateCampaign]
  );

  const toggleHeroInspiration = useCallback(
    (characterId: string) => {
      const ch = campaignRef.current.characters.find((c) => c.id === characterId);
      if (!ch) return;
      const nextVal = !ch.hasInspiration;
      updateCampaign((prev) => ({
        ...prev,
        characters: prev.characters.map((c) =>
          c.id === characterId ? { ...c, hasInspiration: nextVal } : c
        ),
      }));
      if (nextVal) {
        soundEngine.playSfxPreset('levelup');
        pushCombatLog({
          category: 'system',
          actorName: ch.name,
          actorKind: 'hero',
          actorColor: ch.playerColor || ch.tokenColor,
          summary: 'recebeu ★ Inspiração Heroica do Mestre!',
        });
      }
    },
    [pushCombatLog, updateCampaign]
  );

  const spendHeroInspiration = useCallback(
    (characterId: string) => {
      const ch = campaignRef.current.characters.find((c) => c.id === characterId);
      if (!ch || !ch.hasInspiration) return;
      updateCampaign((prev) => ({
        ...prev,
        characters: prev.characters.map((c) =>
          c.id === characterId
            ? { ...c, hasInspiration: false, nextAttackRollOverride: 'advantage' }
            : c
        ),
      }));
      setAdvantageMode('advantage');
      soundEngine.playSfxPreset('spell');
      pushCombatLog({
        category: 'system',
        actorName: ch.name,
        actorKind: 'hero',
        actorColor: ch.playerColor || ch.tokenColor,
        summary: 'gastou ★ Inspiração Heroica (+Vantagem na próxima rolagem)!',
      });
      showTacticalAlert(`★ ${ch.name} gastou Inspiração Heroica: Vantagem ativa na próxima rolagem!`);
    },
    [pushCombatLog, showTacticalAlert, updateCampaign]
  );

  const triggerDuelShieldReaction = useCallback(() => {
    const duel = activeDuelRef.current;
    if (!duel || duel.reactionShieldApplied || !duel.defenderCanShieldReaction) return;
    const curr = campaignRef.current;
    const activeMap = curr.maps.find((m) => m.id === curr.activeMapId);
    const defTok = activeMap?.tokens.find((t) => t.id === duel.defenderTokenId);
    const defChar =
      defTok?.type === 'character' && defTok.referenceId
        ? curr.characters.find((c) => c.id === defTok.referenceId)
        : undefined;

    const nextDefense = duel.defenderDefense + 5;
    const stillHits = duel.isCrit || (duel.attackTotal ?? 0) >= nextDefense;

    updateCampaign((prev) => ({
      ...prev,
      characters: prev.characters.map((c) =>
        defChar && c.id === defChar.id ? { ...c, mp: Math.max(0, c.mp - 2) } : c
      ),
      combat: prev.combat.active
        ? {
            ...prev.combat,
            combatants: prev.combat.combatants.map((cb) =>
              cb.tokenId === duel.defenderTokenId ? { ...cb, reactionAvailable: false } : cb
            ),
          }
        : prev.combat,
    }));

    soundEngine.playSfxPreset('shield');
    pushCombatLog({
      category: 'spell',
      actorName: duel.defenderName,
      actorKind: 'hero',
      actorColor: duel.defenderColor,
      summary: stillHits
        ? `usou Reação: Escudo Arcano (+5 CA → ${nextDefense}), mas o golpe (${duel.attackTotal}) ainda acertou!`
        : `usou Reação: Escudo Arcano (+5 CA → ${nextDefense}) e BLOQUEOU o golpe (${duel.attackTotal})!`,
    });

    emitDuelState({
      ...duel,
      defenderDefense: nextDefense,
      hitSuccess: stillHits,
      reactionShieldApplied: true,
      defenderCanShieldReaction: false,
      situationalModifiers: [
        ...(duel.situationalModifiers || []),
        '⚡ Escudo Arcano (+5 CA)',
      ],
    });
  }, [emitDuelState, pushCombatLog, updateCampaign]);

  return (
    <CampaignContext.Provider
      value={{
        campaign,
        savedCampaigns,
        refreshSavedCampaigns,
        savedHeroes,
        refreshSavedHeroes,
        saveCharacterToVault,
        deleteSavedHero,
        importSavedHeroIntoCampaign,
        claimCampaignCharacter,
        lastSavedHeroFeedback,
        isRemoteTunnelSession,
        inLobby,
        setInLobby,
        loading,
        isConnected,
        connectedClients,
        connectedPlayers,
        serverUrl,
        setServerUrl,
        networkAddresses,
        publicTunnel,
        startPublicTunnel,
        stopPublicTunnel,
        resolveAssetUrl,
        myPlayerId,
        myPlayerName,
        setMyPlayerName,
        myPlayerColor,
        setMyPlayerColor,
        myCharacter,
        theme,
        setTheme,
        role,
        setRole,
        activeCharacterId,
        setActiveCharacterId,
        targetTokenId,
        setTargetTokenId,
        advantageMode,
        setAdvantageMode,
        secretRoll,
        setSecretRoll,
        activeHandout,
        dismissHandout,
        latestRollForOverlay,
        dismissRollOverlay,
        pendingManualRoll,
        openManualRoll,
        cancelManualRoll,
        executeManualRoll,
        activeAmbientName,
        activeThemeBanner,
        pings,
        activePointers,
        emitPointerMove,
        emitPointerHide,
        activeSkillCheck,
        requestSkillCheck,
        submitSkillCheckResult,
        dismissSkillCheck,
        pendingRequests,
        pendingHeroJoinRequest,
        heroJoinFeedback,
        clearHeroJoinFeedback,
        cancelHeroJoinRequest,
        sendPlayerRequest,
        resolvePlayerRequest,
        requestToast,
        activeReward,
        grantCardReward,
        dismissReward,
        floatingVfx,
        slashVfx,
        triggerSlashVfx,
        mapBannerName,
        dismissMapBanner,
        pendingAttackChoice,
        setPendingAttackChoice,
        tacticalAlert,
        showTacticalAlert,
        opportunityPrompt,
        opportunityQueueCount: opportunityQueue.length,
        triggerOpportunityPrompt,
        enqueueOpportunityPrompts,
        performCombatManeuver,
        toggleHeroInspiration,
        spendHeroInspiration,
        triggerDuelShieldReaction,
        activeDuel,
        startCombatDuel,
        rollDuelAttack,
        rollDuelDamage,
        advanceDuelPhase,
        dismissDuel,
        initiativeCeremony,
        showInitiativeCeremony,
        startCombatFromMap,
        activeSavePrompt,
        rollSavePromptTarget,
        rollAllPendingSaveTargets,
        applySavePromptDamages,
        dismissSavePrompt,
        triggerTrapOnToken,
        triggerAoESavePrompt,
        setCharacterConcentration,
        chatMessages,
        unreadChatCount,
        sendChatMessage,
        markChatRead,
        createNewCampaign,
        loadSavedCampaign,
        deleteSavedCampaign,
        enterTableAsPlayer,
        updateCampaign,
        deleteCharacter,
        rollDeathSave,
        setDeathSaveManual,
        assistDeathSave,
        gmResolveDeathSave,
        activeSecretPassage,
        triggerSecretPassage,
        dismissSecretPassage,
        moveTokensToMap,
        claimTreasureMarker,
        sendRoll,
        quickRollFormula,
        rollCharacterAction,
        pushCombatLog,
        awardXp,
        castAoEAbility,
        applyDamage,
        activeRestBanner,
        dismissRestBanner,
        partyRest,
        projectileVfx,
        screenShakeActive,
        activeMvpSummary,
        dismissMvpSummary,
        endCombatWithSummary,
        setCharacterNextAttackOverride,
        canUndo: undoCount > 0,
        undoCount,
        undoLastAction,
        sendHandout,
        triggerSound,
        playCharacterTheme,
        announceBoss,
        sendPing,
        resetCampaign,
        importCampaign,
      }}
    >
      {children}
    </CampaignContext.Provider>
  );
};

export function useCampaign() {
  const ctx = useContext(CampaignContext);
  if (!ctx) throw new Error('useCampaign must be used inside CampaignProvider');
  return ctx;
}
