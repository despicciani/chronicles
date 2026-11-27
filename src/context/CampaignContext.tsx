import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  ActionEconomyCost,
  ActiveDomainState,
  ActiveTrackedAbilityEffect,
  BattleScar,
  BattleScarKind,
  BlackFlashCinematicEvent,
  BossBannerState,
  CampaignState,
  CampaignSummary,
  CardRewardNotification,
  Character,
  ChatMessageEntry,
  Combatant,
  CombatDuelState,
  CombatMvpSummary,
  ConnectedPlayerInfo,
  CounterspellPrompt,
  CutInCinematicEvent,
  CutInStylePreset,
  DiceSkin,
  DomainThemePreset,
  ExecutionCinematicEvent,
  FallDamagePrompt,
  GmMapMarker,
  HandoutPayload,
  InitiativeCeremonyState,
  MapDrawingStroke,
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
  RpSpotlightEntry,
  RpSpotlightState,
  SavedHeroEntry,
  SecretPassageAlert,
  SkillCheckRequest,
  TacticalSavePrompt,
  TacticalSaveTargetEntry,
  ThemeMode,
  TokenSpeechEvent,
  UltimateSfxPreset,
  UserRole,
} from '../shared/types';
import { createStarterCampaign } from '../shared/starterSeed';
import {
  applyBg3ReviveActionPenalty,
  applyCharacterRestToState,
  areTokensAllied,
  buildPreviewDiceForFormula,
  compareInitiativeOrder,
  computeCharacterStats,
  computeLevelForXp,
  consumeCombatantEconomy,
  doesObserverDetectStealthedToken,
  doesStepCrossWall,
  doesTokenCollideAt,
  evaluateFormula,
  evaluateLineOfSightAndCover,
  evaluateTacticalAttackModifiers,
  findNearestFreeGridCell,
  formatFormulaForDisplay,
  getAttributePointsGainedAtLevel,
  getCharacterAttacksPerAction,
  getCharacterCustomResourceState,
  getCombatantActionsRemaining,
  getConditionExtraEconomy,
  getEffectiveFlankingMode,
  getEffectiveTerrainCells,
  getEffectiveWallMeta,
  getGridSpanDistance,
  getHeroInspirationPoints,
  getToken3DDistance,
  getTokenPassivePerception,
  getTokensInsideTemplate,
  hasContinuousWallLineOfSight,
  isHeroFactionToken,
  isThinEdgeWall,
  isTokenHostileTo,
  isTokenIncapacitated,
  isTokenInsideAoE,
  isTokenNameHiddenFromPlayers,
  maskHiddenNamesInText,
  normalizeActionEconomyCost,
  computeSyntheticEntityStats,
  normalizeHeroCharacter,
  parseAbilityDuration,
  parseAttackRangeMeters,
  parseAttackRangeSquares,
  pickRandomPlayerColor,
  resolveDamageWithAffinities,
  resolveElementalSurfaceCombo,
  resolveFormulaVariablesToRaw,
  resolveViewedMapId,
  RollAdvantageMode,
  syncCampaignDerivedCharacterStats,
  validateTeleportDestination,
} from '../shared/rulesEngine';
import { resolveAbilitySfxPreset, soundEngine } from '../utils/soundEngine';
import { openAlertDialog, openConfirmDialog, openTextPrompt } from '../components/PromptDialog';

const LOCAL_HERO_VAULT_KEY = 'chronicle_hero_vault_v1';

function isOffensiveCondition(condDef?: {
  name?: string;
  modifiers?: Array<{ value: number }>;
  tickEffect?: { mode?: 'damage' | 'heal' };
}): boolean {
  if (!condDef) return false;
  if (condDef.tickEffect?.mode === 'heal') return false;
  if (condDef.tickEffect?.mode === 'damage') return true;
  const name = condDef.name || '';
  if (
    /abencoad|abençoad|velocidade|inspirad|escudo|protegid|invis[ií]vel|voo|voando|regenera|f[uú]ria|fortalec|b[êe]n[çc][ãa]o|cura/i.test(
      name
    )
  ) {
    return false;
  }
  if (
    /envenenad|paralisad|atordoad|ceg|amedrontad|ca[ií]d|derrubad|imobilizad|agarrad|amaldic|amaldiç|petrificad|queimand|sangrand|corro[ií]d|congelad|surd|enfeiti[çc]ad|exausto|inconscient|incapacitad|vulner[aá]vel|lent/i.test(
      name
    )
  ) {
    return true;
  }
  const mods = condDef.modifiers || [];
  if (mods.length > 0 && mods.some((m) => m.value < 0) && !mods.some((m) => m.value > 0)) {
    return true;
  }
  return false;
}

function flipAttackedNpcsToHostile(
  prev: CampaignState,
  targetTokens: MapToken[]
): { nextState: CampaignState; turnedHostileNames: string[] } {
  const npcIdsToFlip = new Set<string>();
  const turnedHostileNames: string[] = [];
  for (const tok of targetTokens) {
    if (tok.type === 'npc' && tok.referenceId) {
      const npc = prev.npcs.find((n) => n.id === tok.referenceId);
      if (npc && npc.disposition !== 'Hostil') {
        npcIdsToFlip.add(npc.id);
        turnedHostileNames.push(npc.name);
      }
    }
  }
  if (npcIdsToFlip.size === 0) {
    return { nextState: prev, turnedHostileNames };
  }
  return {
    turnedHostileNames,
    nextState: {
      ...prev,
      npcs: prev.npcs.map((n) =>
        npcIdsToFlip.has(n.id)
          ? { ...n, disposition: 'Hostil', combatEnabled: true }
          : n
      ),
      maps: prev.maps.map((m) => ({
        ...m,
        tokens: m.tokens.map((t) =>
          t.type === 'npc' && t.referenceId && npcIdsToFlip.has(t.referenceId)
            ? { ...t, frameStyle: 'crimson', color: '#ef4444' }
            : t
        ),
      })),
    },
  };
}

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

function deductChargedInventoryItem(
  c: Character,
  inventoryEntryId: string | undefined,
  compendiumItems: CampaignState['compendium']['items']
): Character['inventory'] {
  if (!inventoryEntryId) return c.inventory;
  const inv = c.inventory.find((x) => x.id === inventoryEntryId);
  if (!inv) return c.inventory;
  const itemDef = compendiumItems.find((i) => i.id === inv.itemId);
  const maxChg = Math.max(0, Math.floor(itemDef?.maxCharges ?? 0));
  if (!itemDef || maxChg <= 0) return c.inventory;
  const curChg = typeof inv.chargesRemaining === 'number' ? inv.chargesRemaining : maxChg;
  const nextChg = Math.max(0, curChg - 1);
  const isConsumable = itemDef.rechargeType === 'consumable';
  return c.inventory
    .map((entry) => {
      if (entry.id !== inventoryEntryId) return entry;
      if (isConsumable && nextChg <= 0) {
        const nextQty = (entry.quantity ?? 1) - 1;
        if (nextQty <= 0) return null;
        return { ...entry, quantity: nextQty, chargesRemaining: maxChg };
      }
      return { ...entry, chargesRemaining: nextChg };
    })
    .filter(Boolean) as Character['inventory'];
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
  if (
    title.includes('demon') ||
    title.includes('sangue') ||
    title.includes('furia') ||
    title.includes('infernal') ||
    dt.includes('sangue')
  ) {
    return 'blood';
  }
  if (dt.includes('fogo') || dt.includes('chama') || title.includes('fogo') || title.includes('chama')) {
    return 'fireball';
  }
  if (dt.includes('trovao') || dt.includes('sonor') || title.includes('trovao') || title.includes('onda')) {
    return 'thunder';
  }
  if (dt.includes('eletric') || dt.includes('relampago') || dt.includes('raio')) {
    return 'lightning';
  }
  if (dt.includes('frio') || dt.includes('gelo') || dt.includes('gelid') || title.includes('gelo')) {
    return 'frost';
  }
  if (dt.includes('radiante') || title.includes('divin') || title.includes('solar') || title.includes('pilar')) {
    return 'radiant';
  }
  if (title.includes('bencao') || title.includes('sagrad') || title.includes('escudo da fe')) {
    return 'blessing';
  }
  if (dt.includes('veneno') || dt.includes('acido') || title.includes('veneno') || title.includes('acido')) {
    return 'poison';
  }
  if (dt.includes('necrot') || dt.includes('sombri') || dt.includes('trevas') || title.includes('sombra') || title.includes('necrot')) {
    return 'necrotic';
  }
  if (dt.includes('psiquic')) {
    return 'curse';
  }
  if (!dt && params.applyConditionId) {
    if (/demon|furia|sangue/i.test(`${params.applyConditionId} ${title}`)) return 'blood';
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
    maps: prev.maps.map((m) => {
      let changed = false;
      const nextTokens = m.tokens.map((t) => {
        const toRem = condRemovalsByToken.get(t.id);
        if (!toRem || toRem.size === 0) return t;
        changed = true;
        return {
          ...t,
          activeConditionIds: (t.activeConditionIds || []).filter((id) => !toRem.has(id)),
        };
      });
      return changed ? { ...m, tokens: nextTokens } : m;
    }),
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
  viewedMapId: string;

  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  role: UserRole;
  setRole: (role: UserRole) => void;
  hasGmPrivilege: boolean;
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
  recentRollToasts: RollLogEntry[];
  dismissRollToast: (id: string) => void;
  pendingManualRoll: PendingManualRoll | null;
  openManualRoll: (req: Omit<PendingManualRoll, 'id'>) => void;
  cancelManualRoll: () => void;
  executeManualRoll: (chosenMode?: RollAdvantageMode) => void;
  activeAmbientName: string | null;
  activeThemeBanner: ThemeMusicBanner | null;
  pings: MapPing[];
  tokenSpeeches: Record<string, TokenSpeechEvent>;
  emitTokenSpeech: (payload: Omit<TokenSpeechEvent, 'id' | 'createdAt'>) => void;
  tempDrawings: MapDrawingStroke[];
  emitTempDrawing: (stroke: Omit<MapDrawingStroke, 'id' | 'createdAt'>) => void;
  clearMapDrawings: (mapId: string) => void;
  activePointers: Record<string, MapPointerState>;
  emitPointerMove: (mapId: string, xPct: number, yPct: number) => void;
  emitPointerHide: () => void;
  activeSkillCheck: SkillCheckRequest | null;
  requestSkillCheck: (
    skillOrAttrId: string,
    label: string,
    dc: number,
    options?: {
      targetCharacterIds?: string[];
      targetScopeLabel?: string;
      hideDc?: boolean;
      isGroupCheck?: boolean;
    }
  ) => void;
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
    maneuver:
      | 'dash'
      | 'disengage'
      | 'dodge'
      | 'action-surge'
      | 'shove'
      | 'grapple'
      | 'escape-grapple'
      | 'release-grapple'
      | 'ready'
      | 'hide'
      | 'help'
      | 'jump',
    actorTokenId?: string
  ) => void;
  toggleHeroInspiration: (characterId: string) => void;
  adjustHeroInspiration: (characterId: string, delta: number) => void;
  spendHeroInspiration: (characterId: string, mode?: 'advantage' | 'reroll') => void;
  useChargedItemAbility: (characterId: string, inventoryEntryId: string) => void;
  useConsumable: (characterId: string, inventoryEntryId: string, itemId: string) => void;
  rerollDuelAttackWithInspiration: () => void;
  rerollSaveWithInspiration: (tokenId: string) => void;
  acceptFailedSaveTarget: (tokenId: string) => void;
  startTacticalSavePrompt: (params: {
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
    removeConditionOnPassId?: string;
    conditionDurationRounds?: number;
    casterCharacterId?: string;
    casterName?: string;
    requiresConcentration?: boolean;
    singleTargetOnly?: boolean;
    tokens: MapToken[];
  }) => void;
  triggerDuelShieldReaction: () => void;
  triggerDuelUncannyDodgeReaction: () => void;
  dismissDuelReaction: () => void;
  fallDamagePrompt: FallDamagePrompt | null;
  setTokenElevation: (mapId: string, tokenId: string, nextElevationMeters: number) => void;
  triggerFallDamageCheck: (tokenId: string, mapId?: string, reason?: string) => void;
  rollFallDamageNow: () => void;
  useFeatherFallReaction: () => void;
  dismissFallDamagePrompt: () => void;
  counterspellPrompt: CounterspellPrompt | null;
  triggerCounterspellReaction: (reactorTokenId: string) => void;
  dismissCounterspellPrompt: () => void;
  activeCutIn: CutInCinematicEvent | null;
  triggerUltimateCutIn: (params: {
    kind?: CutInCinematicEvent['kind'];
    actorName: string;
    techniqueName: string;
    catchphrase?: string;
    color?: string;
    portraitUrl?: string;
    style?: CutInStylePreset;
    sfxPreset?: UltimateSfxPreset;
    sfxUrl?: string;
    domainTheme?: DomainThemePreset;
    activateDomain?: boolean;
    domainMapId?: string;
    domainDurationRounds?: number;
    domainMusicUrl?: string;
    casterCharacterId?: string;
    casterTokenId?: string;
  }) => void;
  dismissCutIn: () => void;
  activeBlackFlash: BlackFlashCinematicEvent | null;
  dismissBlackFlash: () => void;
  activeExecution: ExecutionCinematicEvent | null;
  dismissExecution: () => void;
  clearMapBattleScars: (mapId?: string) => void;
  dismissDomainExpansion: () => void;
  switchCharacterForm: (characterId: string, formId: string) => void;
  rpSpotlight: RpSpotlightState;
  enterRpSpotlight: (entry: Omit<RpSpotlightEntry, 'id' | 'updatedAt'>) => void;
  clearRpSpotlight: (slot?: 'left' | 'right' | 'all') => void;
  activeDuel: CombatDuelState | null;
  startCombatDuel: (choice: PendingAttackChoice, defenderToken: MapToken) => void;
  rollDuelAttack: () => void;
  rollDuelDamage: () => void;
  advanceDuelPhase: (phase: CombatDuelState['phase']) => void;
  dismissDuel: () => void;
  initiativeCeremony: InitiativeCeremonyState | null;
  showInitiativeCeremony: (ceremony: InitiativeCeremonyState | null) => void;
  startCombatFromMap: (options?: {
    forceReroll?: boolean;
    openingAttacker?: {
      tokenId?: string;
      characterId?: string;
      actionCost?: ActionEconomyCost;
      isWeaponAttack?: boolean;
    };
    reason?: string;
  }) => void;

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
  sendChatMessage: (
    text: string,
    recipientName?: string,
    imageUrl?: string,
    options?: {
      speakerOverride?: {
        name: string;
        color: string;
        tokenId?: string;
        npcId?: string;
        fireBubble?: boolean;
      };
    }
  ) => void;
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
  loadSavedCampaign: (id: string) => Promise<boolean>;
  deleteSavedCampaign: (id: string) => Promise<void>;
  enterTableAsPlayer: (params: {
    targetServerUrl: string;
    playerName: string;
    playerColor: string;
  }) => Promise<void>;

  // Gameplay Actions
  updateCampaign: (updater: (prev: CampaignState) => CampaignState) => void;
  moveTokensLive: (
    mapId: string,
    moves: Array<{ id: string; x: number; y: number }>,
    flushNow?: boolean
  ) => void;
  setLocallyDraggedTokenIds: (ids: string[]) => void;
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
    tokenIds: string[] | 'all-heroes',
    targetMarkerId?: string
  ) => void;
  useBossLegendaryResistance: (tokenId: string) => void;
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
    chargedInventoryEntryId?: string;
    applyConditionId?: string;
    conditionDurationRounds?: number;
    aoeShape?: 'sphere' | 'cone' | 'line' | 'cube';
    aoeSizeMeters?: number;
    aoeColor?: string;
    aoePersistent?: boolean;
    isTeleport?: boolean;
    teleportRequiresSight?: boolean;
    teleportAoeOrigin?: 'departure' | 'arrival';
    isWeaponAttack?: boolean;
    critRange?: number;
    critMultiplier?: number;
    extraBonus?: number;
    extraDice?: string[];
  }) => void;
  pushCombatLog: (entry: Omit<CombatLogEntry, 'id' | 'timestamp'>) => void;
  awardXp: (characterIds: string[] | 'all', amount: number) => void;
  castAoEAbility: (
    choice: PendingAttackChoice,
    originX: number,
    originY: number,
    angleDeg: number,
    options?: { skipCostAndEconomy?: boolean }
  ) => void;
  executeTeleportAbility: (
    choice: PendingAttackChoice,
    targetX: number,
    targetY: number
  ) => void;
  applyDamage: (
    targetTokenId: string,
    amount: number,
    isHeal?: boolean,
    rollId?: string,
    damageType?: string,
    applyConditionId?: string,
    conditionDurationRounds?: number,
    isCrit?: boolean,
    options?: {
      suppressExecution?: boolean;
      skipRevivePenalty?: boolean;
      killerName?: string;
      killerColor?: string;
      killerPortraitUrl?: string;
    }
  ) => void;
  activeRestBanner: RestBannerState | null;
  dismissRestBanner: () => void;
  partyRest: (kind: 'short' | 'long') => void;
  projectileVfx: MapProjectileVfx[];
  screenShakeActive: boolean;
  screenShakeIntensity: 'none' | 'light' | 'heavy';
  cinematicEnabled: boolean;
  setCinematicEnabled: (enabled: boolean) => void;
  autoCameraFocus: boolean;
  setAutoCameraFocus: (enabled: boolean) => void;
  shockwaves: Array<{ id: string; mapId: string; x: number; y: number; color: string; sizePx?: number }>;
  triggerShockwave: (
    x: number,
    y: number,
    color?: string,
    sizePx?: number,
    explicitMapId?: string
  ) => void;
  triggerScreenShake: (intensity?: 'light' | 'heavy') => void;
  cameraFocusSignal: { id: string; mapId: string; x: number; y: number; label?: string } | null;
  broadcastCameraFocus: (x: number, y: number, label?: string) => void;
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
  const inLobbyRef = useRef<boolean>(inLobby);
  const [isGmHostSession, setIsGmHostSessionState] = useState<boolean>(() => {
    const saved = localStorage.getItem('rpg_role');
    return saved !== 'player';
  });
  const isGmHostSessionRef = useRef<boolean>(isGmHostSession);
  const setIsGmHostSession = useCallback((next: boolean) => {
    isGmHostSessionRef.current = next;
    setIsGmHostSessionState(next);
  }, []);
  const lastDispatchedDuelIdRef = useRef<string | null>(null);
  const gmServerLostTimerRef = useRef<number | null>(null);
  const deletedHeroIdsRef = useRef<Set<string>>(new Set());
  const lastChatCampaignIdRef = useRef<string>('');
  const pendingCounterspellActionRef = useRef<(() => void) | null>(null);
  const deferredDuelCommitRef = useRef<{
    duelId: string;
    commit: () => void;
    spellMeta?: {
      casterToken: MapToken;
      casterName: string;
      casterColor: string;
      spellName: string;
      costMp: number;
      activeMap: CampaignState['maps'][number];
    };
  } | null>(null);
  const resetLocalEphemeralStateRef = useRef<(() => void) | null>(null);
  const setInLobby = useCallback((nextInLobby: boolean) => {
    inLobbyRef.current = nextInLobby;
    const isGmOrHost = roleRef.current === 'gm' || isGmHostSessionRef.current;
    if (nextInLobby && isGmOrHost && socketRef.current?.connected) {
      socketRef.current.emit('room:gm-leave');
    } else if (!nextInLobby && isGmOrHost && socketRef.current?.connected) {
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

  const [theme, setThemeState] = useState<ThemeMode>('dark-fantasy');

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
  const lastShownOverlayRollIdRef = useRef<string | null>(null);
  const [recentRollToasts, setRecentRollToasts] = useState<RollLogEntry[]>([]);
  const [pendingManualRoll, setPendingManualRoll] = useState<PendingManualRoll | null>(null);
  const [activeAmbientName, setActiveAmbientName] = useState<string | null>(null);
  const [activeThemeBanner, setActiveThemeBanner] = useState<ThemeMusicBanner | null>(null);
  const [activeRestBanner, setActiveRestBanner] = useState<RestBannerState | null>(null);
  const dismissRestBanner = useCallback(() => setActiveRestBanner(null), []);
  const [pings, setPings] = useState<MapPing[]>([]);
  const [tokenSpeeches, setTokenSpeeches] = useState<Record<string, TokenSpeechEvent>>({});
  const [tempDrawings, setTempDrawings] = useState<MapDrawingStroke[]>([]);
  const [activePointers, setActivePointers] = useState<Record<string, MapPointerState>>({});
  const [activeSkillCheck, setActiveSkillCheck] = useState<SkillCheckRequest | null>(null);
  const [fallDamagePrompt, setFallDamagePrompt] = useState<FallDamagePrompt | null>(null);
  const fallDamagePromptRef = useRef<FallDamagePrompt | null>(null);
  fallDamagePromptRef.current = fallDamagePrompt;
  const [counterspellPrompt, setCounterspellPrompt] = useState<CounterspellPrompt | null>(null);
  const counterspellPromptRef = useRef<CounterspellPrompt | null>(null);
  counterspellPromptRef.current = counterspellPrompt;
  const [activeCutIn, setActiveCutIn] = useState<CutInCinematicEvent | null>(null);
  const activeCutInRef = useRef<CutInCinematicEvent | null>(null);
  activeCutInRef.current = activeCutIn;
  const cutInTimerRef = useRef<number | null>(null);
  const [activeBlackFlash, setActiveBlackFlash] = useState<BlackFlashCinematicEvent | null>(null);
  const blackFlashTimerRef = useRef<number | null>(null);
  const [activeExecution, setActiveExecution] = useState<ExecutionCinematicEvent | null>(null);
  const executionTimerRef = useRef<number | null>(null);
  const queuedExecutionRef = useRef<ExecutionCinematicEvent | null>(null);
  const launchExecutionLocalRef = useRef<((evt: ExecutionCinematicEvent) => void) | null>(null);
  const triggerBlackFlashRef = useRef<
    | ((params: {
        attackerName: string;
        attackerColor?: string;
        targetName?: string;
        targetTokenId?: string;
        damageTotal?: number;
      }) => void)
    | null
  >(null);
  const [rpSpotlight, setRpSpotlight] = useState<RpSpotlightState>({ left: null, right: null });
  const rpSpotlightRef = useRef<RpSpotlightState>({ left: null, right: null });
  rpSpotlightRef.current = rpSpotlight;
  const triggerUltimateCutInRef = useRef<CampaignContextValue['triggerUltimateCutIn'] | null>(null);
  const checkAndTriggerCounterspellRef = useRef<
    | ((params: {
        casterToken: MapToken;
        casterName: string;
        casterColor: string;
        spellName: string;
        costMp: number;
        activeMap: CampaignState['maps'][number];
        onProceedIfNotCountered?: () => void;
      }) => boolean)
    | null
  >(null);
  const prevFlyingTokensRef = useRef<Map<string, { mapId: string; flying: boolean; elevation: number; hp: number }>>(new Map());
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
  const [screenShakeIntensity, setScreenShakeIntensity] = useState<'none' | 'light' | 'heavy'>('none');
  const [cinematicEnabled, setCinematicEnabledState] = useState<boolean>(() => {
    try {
      return localStorage.getItem('chronicle_cinematic_vfx') !== '0';
    } catch {
      return true;
    }
  });
  const cinematicEnabledRef = useRef(cinematicEnabled);
  cinematicEnabledRef.current = cinematicEnabled;
  const setCinematicEnabled = useCallback((enabled: boolean) => {
    setCinematicEnabledState(enabled);
    try {
      localStorage.setItem('chronicle_cinematic_vfx', enabled ? '1' : '0');
    } catch {
      // ignore storage errors
    }
  }, []);

  const [autoCameraFocus, setAutoCameraFocusState] = useState<boolean>(() => {
    try {
      return localStorage.getItem('chronicle_auto_camera') !== '0';
    } catch {
      return true;
    }
  });
  const setAutoCameraFocus = useCallback((enabled: boolean) => {
    setAutoCameraFocusState(enabled);
    try {
      localStorage.setItem('chronicle_auto_camera', enabled ? '1' : '0');
    } catch {
      // ignore storage errors
    }
  }, []);

  const [shockwaves, setShockwaves] = useState<
    Array<{ id: string; mapId: string; x: number; y: number; color: string; sizePx?: number }>
  >([]);
  const [cameraFocusSignal, setCameraFocusSignal] = useState<{
    id: string;
    mapId: string;
    x: number;
    y: number;
    label?: string;
  } | null>(null);

  const triggerScreenShake = useCallback((intensity: 'light' | 'heavy' = 'light') => {
    if (!cinematicEnabledRef.current) return;
    setScreenShakeActive(true);
    setScreenShakeIntensity(intensity);
    window.setTimeout(
      () => {
        setScreenShakeActive(false);
        setScreenShakeIntensity('none');
      },
      intensity === 'heavy' ? 500 : 300
    );
  }, []);

  const triggerShockwave = useCallback(
    (x: number, y: number, color = '#f59e0b', sizePx = 110, explicitMapId?: string) => {
      if (!cinematicEnabledRef.current) return;
      const mapId = explicitMapId || campaignRef.current.activeMapId;
      if (!mapId) return;
      const id = `sw-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setShockwaves((prev) => [...prev.slice(-8), { id, mapId, x, y, color, sizePx }]);
      window.setTimeout(() => {
        setShockwaves((prev) => prev.filter((s) => s.id !== id));
      }, 760);
    },
    []
  );

  const launchExecutionLocal = useCallback(
    (evt: ExecutionCinematicEvent) => {
      if (!cinematicEnabledRef.current || inLobbyRef.current) return;
      if (executionTimerRef.current) {
        window.clearTimeout(executionTimerRef.current);
        executionTimerRef.current = null;
      }
      setActiveExecution(evt);
      soundEngine.playExecutionSfx(Boolean(evt.isBoss));
      triggerScreenShake('heavy');
      const curCamp = campaignRef.current;
      const m =
        curCamp.maps.find((mp) => mp.id === evt.mapId) ||
        curCamp.maps.find((mp) => mp.id === curCamp.activeMapId);
      const tok = evt.victimTokenId
        ? m?.tokens.find((t) => t.id === evt.victimTokenId)
        : undefined;
      if (tok) {
        const cx = tok.x + (tok.size || 1) / 2;
        const cy = tok.y + (tok.size || 1) / 2;
        triggerShockwave(
          cx,
          cy,
          evt.isBoss ? '#f59e0b' : '#dc2626',
          evt.isBoss ? 220 : 155,
          m?.id
        );
      }
      executionTimerRef.current = window.setTimeout(
        () => setActiveExecution((cur) => (cur?.id === evt.id ? null : cur)),
        evt.isBoss ? 2850 : 2150
      );
    },
    [triggerScreenShake, triggerShockwave]
  );
  launchExecutionLocalRef.current = launchExecutionLocal;

  // Flush any Execution cinematic queued behind an Ultimate Cut-In as soon as the Cut-In finishes
  useEffect(() => {
    if (activeCutIn) return;
    const queued = queuedExecutionRef.current;
    if (!queued) return;
    queuedExecutionRef.current = null;
    const timer = window.setTimeout(() => {
      launchExecutionLocalRef.current?.(queued);
    }, 120);
    return () => window.clearTimeout(timer);
  }, [activeCutIn]);

  const broadcastCameraFocus = useCallback((x: number, y: number, label?: string) => {
    const mapId = campaignRef.current.activeMapId;
    if (!mapId) return;
    const payload = {
      id: `cam-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      mapId,
      x,
      y,
      label,
    };
    if (socketRef.current?.connected) {
      socketRef.current.emit('camera:focus', payload);
    } else {
      setCameraFocusSignal(payload);
    }
  }, []);

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
  const hasPlayerCharRef = useRef<boolean>(false);
  const locallyDraggedTokensRef = useRef<Set<string>>(new Set());
  const pendingTokenMovesRef = useRef<{
    mapId: string;
    moves: Map<string, { x: number; y: number }>;
  } | null>(null);
  const tokenMoveFlushTimerRef = useRef<number | null>(null);
  const lastTokenMoveEmitRef = useRef<number>(0);

  const startDuelRef = useRef<((choice: PendingAttackChoice, tok: MapToken) => void) | null>(null);
  const startCombatFromMapRef = useRef<
    | ((options?: {
        openingAttacker?: {
          tokenId?: string;
          characterId?: string;
          actionCost?: ActionEconomyCost;
          isWeaponAttack?: boolean;
        };
        reason?: string;
      }) => void)
    | null
  >(null);
  const pendingAutoCombatOnSaveRef = useRef<{
    tokenId?: string;
    characterId?: string;
    actionCost?: ActionEconomyCost;
    reason?: string;
  } | null>(null);

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

  // Isolated auto-dismiss timer so campaign:updated state patches never cancel the timeout
  useEffect(() => {
    if (!mapBannerName) return;
    const t = window.setTimeout(() => setMapBannerName(null), 2800);
    return () => window.clearTimeout(t);
  }, [mapBannerName]);

  const dismissMapBanner = useCallback(() => {
    setMapBannerName(null);
  }, []);

  const setTheme = useCallback((next: ThemeMode) => {
    setThemeState(next);
  }, []);

  const setRole = useCallback((next: UserRole) => {
    roleRef.current = next;
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

  // Sync Domain Expansion music across ALL connected clients (and auto-restore when Domain ends)
  const activeDomainMusicSyncedRef = useRef<string>('');
  useEffect(() => {
    const rawUrl = !inLobby ? campaign.activeDomain?.musicUrl : undefined;
    const resolved = rawUrl ? resolveAssetUrl(rawUrl) : '';
    if (resolved) {
      if (resolved === activeDomainMusicSyncedRef.current) return;
      activeDomainMusicSyncedRef.current = resolved;
      const delayMs = activeCutInRef.current ? 2900 : 80;
      const timer = window.setTimeout(() => {
        if (activeDomainMusicSyncedRef.current === resolved && !inLobbyRef.current) {
          soundEngine.pushDomainMusic(resolved);
        }
      }, delayMs);
      return () => window.clearTimeout(timer);
    }
    if (activeDomainMusicSyncedRef.current) {
      activeDomainMusicSyncedRef.current = '';
      soundEngine.popDomainMusic();
    }
  }, [campaign.activeDomain?.musicUrl, inLobby, resolveAssetUrl]);

  // Locate player's single character STRICTLY by ownerPlayerId (never hijack another player's hero by matching playerName!)
  const myCharacter = campaign.characters.find((c) => c.ownerPlayerId === myPlayerId);
  const viewedMapId = resolveViewedMapId(campaign, role, myCharacter?.id);

  // Show cinematic location banner + arrival sound when the user's OWN viewed map changes
  useEffect(() => {
    if (!inLobby && viewedMapId && viewedMapId !== prevMapIdRef.current) {
      prevMapIdRef.current = viewedMapId;
      const m = campaignRef.current.maps.find((x) => x.id === viewedMapId);
      if (m) {
        setMapBannerName(m.name);
        soundEngine.playSfxPreset('scene-transition');
      }
      return;
    }
    prevMapIdRef.current = viewedMapId;
  }, [viewedMapId, inLobby]);

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
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    let localServerList: SavedHeroEntry[] | null = null;
    let remoteServerList: SavedHeroEntry[] | null = null;

    try {
      const resLocal = await fetch('/api/characters/saved');
      if (resLocal.ok) {
        const data = (await resLocal.json()) as { characters: SavedHeroEntry[] };
        if (Array.isArray(data.characters)) localServerList = data.characters;
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
          if (Array.isArray(data.characters)) remoteServerList = data.characters;
        }
      } catch {
        // ignore
      }
    }

    const collected: SavedHeroEntry[][] = [];
    if (localServerList) collected.push(localServerList);
    if (remoteServerList) collected.push(remoteServerList);
    // Only fall back to localStorage cache when neither server responded (prevents resurrecting server-deleted heroes!)
    if (collected.length === 0) {
      collected.push(readLocalHeroVault());
    }

    const merged = mergeSavedHeroLists(...collected).filter(
      (h) => !deletedHeroIdsRef.current.has(h.id)
    );
    writeLocalHeroVault(merged);
    setSavedHeroes(merged);
  }, []);

  useEffect(() => {
    let mounted = true;
    const base = serverUrl || '';
    const initRole = roleRef.current === 'gm' || isGmHostSessionRef.current ? 'gm' : 'player';

    fetch(`${base}/api/campaign?role=${initRole}&playerId=${encodeURIComponent(myPlayerId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: CampaignState | null) => {
        if (mounted && data && data.compendium) {
          const synced = syncCampaignDerivedCharacterStats(data);
          campaignRef.current = synced;
          setCampaign(synced);
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

    const socketOpts = {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 800,
      reconnectionDelayMax: 4000,
      timeout: 25000,
    };
    const socket = base ? io(base, socketOpts) : io(socketOpts);
    socketRef.current = socket;

    socket.on('connect', () => {
      if (!mounted) return;
      setIsConnected(true);
      if (gmServerLostTimerRef.current !== null) {
        window.clearTimeout(gmServerLostTimerRef.current);
        gmServerLostTimerRef.current = null;
      }
      if ((roleRef.current === 'gm' || isGmHostSessionRef.current) && !inLobbyRef.current) {
        socket.emit('room:gm-open');
      }
    });

    socket.on('disconnect', () => {
      if (!mounted) return;
      setIsConnected(false);
      if (roleRef.current === 'player' && !isGmHostSessionRef.current && !inLobbyRef.current) {
        if (gmServerLostTimerRef.current !== null) {
          window.clearTimeout(gmServerLostTimerRef.current);
        }
        // 18s grace period so brief Cloudflare Tunnel / Wi-Fi hiccups reconnect silently without kicking players!
        gmServerLostTimerRef.current = window.setTimeout(() => {
          gmServerLostTimerRef.current = null;
          if (
            !socketRef.current?.connected &&
            roleRef.current === 'player' &&
            !isGmHostSessionRef.current &&
            !inLobbyRef.current
          ) {
            resetLocalEphemeralStateRef.current?.();
            setServerUrl('');
            serverUrlRef.current = '';
            setInLobbyState(true);
            inLobbyRef.current = true;
            openAlertDialog(
              'O servidor do Mestre foi encerrado ou a conexão caiu. A sala foi fechada.',
              'Sala Encerrada'
            );
          }
        }, 18000);
      }
    });

    socket.on('room:closed', (payload?: { reason?: string }) => {
      if (!mounted) return;
      if (roleRef.current === 'player' && !isGmHostSessionRef.current && !inLobbyRef.current) {
        resetLocalEphemeralStateRef.current?.();
        setServerUrl('');
        serverUrlRef.current = '';
        setInLobbyState(true);
        inLobbyRef.current = true;
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
      const filtered = serverList.filter((h) => !deletedHeroIdsRef.current.has(h.id));
      writeLocalHeroVault(filtered);
      setSavedHeroes(filtered);
    });

    socket.on('tunnel:status', (st: { status: 'idle' | 'starting' | 'active' | 'error'; url: string; error?: string }) => {
      if (mounted && st?.status) setPublicTunnel(st);
    });

    socket.on('campaign:updated', (next: CampaignState) => {
      if (mounted && next && next.compendium) {
        let synced = syncCampaignDerivedCharacterStats(next);
        // Preserve recent local rollLog entries ONLY when staying in the SAME campaign!
        const curLocalRolls = campaignRef.current?.rollLog || [];
        if (
          synced.id === campaignRef.current?.id &&
          synced.rollLog.length > 0 &&
          curLocalRolls.length > 0
        ) {
          const syncedIds = new Set(synced.rollLog.map((r) => r.id));
          const missingLocal = curLocalRolls.slice(0, 12).filter((r) => r?.id && !syncedIds.has(r.id));
          if (missingLocal.length > 0) {
            synced = {
              ...synced,
              rollLog: [...missingLocal, ...synced.rollLog].slice(0, 120),
            };
          }
        }
        // Preserve coordinates of any tokens we are actively dragging locally so simultaneous edits never snap our token back
        if (locallyDraggedTokensRef.current.size > 0 && synced.id === campaignRef.current?.id) {
          const curLocal = campaignRef.current;
          const localMapById = new Map(curLocal.maps.map((m) => [m.id, m]));
          const preserved: CampaignState = {
            ...synced,
            maps: synced.maps.map((m) => {
              const lm = localMapById.get(m.id);
              if (!lm) return m;
              const localTokById = new Map(lm.tokens.map((t) => [t.id, t]));
              let patched = false;
              const nextTokens = m.tokens.map((t) => {
                if (!locallyDraggedTokensRef.current.has(t.id)) return t;
                const lt = localTokById.get(t.id);
                if (!lt || (lt.x === t.x && lt.y === t.y)) return t;
                patched = true;
                return { ...t, x: lt.x, y: lt.y };
              });
              return patched ? { ...m, tokens: nextTokens } : m;
            }),
          };
          campaignRef.current = preserved;
          setCampaign(preserved);
          return;
        }
        campaignRef.current = synced;
        setCampaign(synced);
      }
    });

    socket.on('passage:triggered', (alertPayload: SecretPassageAlert) => {
      if (!mounted || !alertPayload) return;
      if (roleRef.current === 'gm') {
        setActiveSecretPassage(alertPayload);
        soundEngine.playSfxPreset('magic');
        showTacticalAlertRef.current?.(
          `🚪 ${alertPayload.tokenName || 'Um herói'} pisou na passagem secreta "${alertPayload.markerTitle}"!`
        );
      }
    });

    socket.on(
      'token:moved',
      (payload: { mapId: string; moves: Array<{ id: string; x: number; y: number }> }) => {
        if (!mounted || !payload?.mapId || !Array.isArray(payload.moves) || payload.moves.length === 0) {
          return;
        }
        const moveById = new Map<string, { x: number; y: number }>();
        for (const mv of payload.moves) {
          if (!mv?.id || locallyDraggedTokensRef.current.has(mv.id)) continue;
          moveById.set(mv.id, { x: mv.x, y: mv.y });
        }
        if (moveById.size === 0) return;

        setCampaign((prev) => {
          let anyChanged = false;
          const nextMaps = prev.maps.map((m) => {
            if (m.id !== payload.mapId) return m;
            let mapChanged = false;
            const nextTokens = m.tokens.map((t) => {
              const mv = moveById.get(t.id);
              if (!mv || (t.x === mv.x && t.y === mv.y)) return t;
              mapChanged = true;
              anyChanged = true;
              return { ...t, x: mv.x, y: mv.y };
            });
            return mapChanged ? { ...m, tokens: nextTokens } : m;
          });
          if (!anyChanged) return prev;
          const nextState = { ...prev, maps: nextMaps };
          campaignRef.current = nextState;
          return nextState;
        });
      }
    );

    socket.on('roll:new', (entry: RollLogEntry) => {
      if (!mounted) return;
      // Sync rollLog incrementally so roll:send never overwrites combat economy / movement with a stale campaign snapshot
      setCampaign((prev) => {
        if (prev.rollLog.some((r) => r.id === entry.id)) return prev;
        const nextState = { ...prev, rollLog: [entry, ...prev.rollLog].slice(0, 120) };
        campaignRef.current = nextState;
        return nextState;
      });
      if (inLobbyRef.current) return;
      if (roleRef.current === 'player' && !hasPlayerCharRef.current) return;
      if (entry.isSecret && roleRef.current !== 'gm') return;
      const isMyRoll = Boolean(entry.rollerPlayerId && entry.rollerPlayerId === myPlayerId);
      if (isMyRoll) {
        if (activeDuelRef.current) return;
        if (
          entry.rolledDice &&
          entry.rolledDice.length > 0 &&
          lastShownOverlayRollIdRef.current !== entry.id
        ) {
          lastShownOverlayRollIdRef.current = entry.id;
          setLatestRollForOverlay(entry);
        }
        return;
      }
      // For other players' rolls, never hijack screen with fullscreen 3D dice — show a discreet corner toast instead
      setRecentRollToasts((prev) => [
        ...prev.filter((r) => r.id !== entry.id).slice(-3),
        entry,
      ]);
      window.setTimeout(() => {
        setRecentRollToasts((prev) => prev.filter((r) => r.id !== entry.id));
      }, 4500);
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

    socket.on('fall:prompt', (prompt: FallDamagePrompt | null) => {
      if (!mounted) return;
      fallDamagePromptRef.current = prompt;
      setFallDamagePrompt(prompt);
    });

    socket.on('counterspell:prompt', (prompt: CounterspellPrompt | null) => {
      if (!mounted) return;
      counterspellPromptRef.current = prompt;
      setCounterspellPrompt(prompt);
    });

    socket.on('cinematic:cutin', (evt: CutInCinematicEvent | null) => {
      if (!mounted) return;
      if (cutInTimerRef.current) {
        window.clearTimeout(cutInTimerRef.current);
        cutInTimerRef.current = null;
      }
      setActiveCutIn(evt);
      if (evt) {
        const resolvedAudioUrl = evt.sfxUrl ? resolveAssetUrl(evt.sfxUrl) : undefined;
        const defaultSfx: UltimateSfxPreset =
          evt.sfxPreset ||
          (evt.style === 'dimension-rift'
            ? 'dimension-rift'
            : evt.style === 'persona-slash'
              ? 'anime-slash'
              : evt.domainTheme === 'sonic'
                ? 'sonic-boom'
                : 'bass-drop');
        soundEngine.playUltimateSfx(defaultSfx, resolvedAudioUrl);

        // Schedule Map Climax Impact right as the Cut-In dissolves back to the battlemap!
        cutInTimerRef.current = window.setTimeout(() => {
          setActiveCutIn((cur) => (cur?.id === evt.id ? null : cur));
          triggerScreenShake('heavy');
          const curCamp = campaignRef.current;
          const m =
            curCamp.maps.find((mp) => mp.id === evt.mapId) ||
            curCamp.maps.find((mp) => mp.id === curCamp.activeMapId);
          const tok =
            (evt.casterTokenId && m?.tokens.find((t) => t.id === evt.casterTokenId)) ||
            m?.tokens.find((t) => t.name === evt.actorName);
          if (tok) {
            const cx = tok.x + (tok.size || 1) / 2;
            const cy = tok.y + (tok.size || 1) / 2;
            triggerShockwave(cx, cy, evt.color || '#38bdf8', 190);
            window.setTimeout(() => triggerShockwave(cx, cy, '#ffffff', 120), 120);
          }
        }, 3150);
      }
    });

    socket.on('cinematic:blackflash', (evt: BlackFlashCinematicEvent | null) => {
      if (!mounted) return;
      if (blackFlashTimerRef.current) {
        window.clearTimeout(blackFlashTimerRef.current);
        blackFlashTimerRef.current = null;
      }
      if (!evt) {
        setActiveBlackFlash(null);
        return;
      }
      if (!cinematicEnabledRef.current || inLobbyRef.current) return;
      setActiveBlackFlash(evt);
      soundEngine.playBlackFlashSfx();
      triggerScreenShake('heavy');
      const curCamp = campaignRef.current;
      const m =
        curCamp.maps.find((mp) => mp.id === evt.mapId) ||
        curCamp.maps.find((mp) => mp.id === curCamp.activeMapId);
      const tok = evt.targetTokenId
        ? m?.tokens.find((t) => t.id === evt.targetTokenId)
        : undefined;
      if (tok) {
        const cx = tok.x + (tok.size || 1) / 2;
        const cy = tok.y + (tok.size || 1) / 2;
        triggerShockwave(cx, cy, '#dc2626', 180, m?.id);
        window.setTimeout(() => triggerShockwave(cx, cy, '#050507', 120, m?.id), 90);
      }
      blackFlashTimerRef.current = window.setTimeout(() => {
        setActiveBlackFlash((cur) => (cur?.id === evt.id ? null : cur));
      }, 780);
    });

    socket.on('cinematic:execution', (evt: ExecutionCinematicEvent | null) => {
      if (!mounted) return;
      if (!evt) {
        queuedExecutionRef.current = null;
        if (executionTimerRef.current) {
          window.clearTimeout(executionTimerRef.current);
          executionTimerRef.current = null;
        }
        setActiveExecution(null);
        return;
      }
      if (!cinematicEnabledRef.current || inLobbyRef.current) return;
      // Queue behind active Ultimate Cut-In so Execution is never swallowed!
      if (activeCutInRef.current) {
        queuedExecutionRef.current = evt;
        return;
      }
      launchExecutionLocalRef.current?.(evt);
    });

    socket.on('spotlight:updated', (state: RpSpotlightState) => {
      if (!mounted) return;
      const safeState = state || { left: null, right: null };
      rpSpotlightRef.current = safeState;
      setRpSpotlight(safeState);
    });

    socket.on('save-prompt:updated', (prompt: TacticalSavePrompt | null) => {
      if (!mounted) return;
      activeSavePromptRef.current = prompt;
      setActiveSavePrompt(prompt);
    });

    socket.on('chat:new', (msg: ChatMessageEntry) => {
      if (!mounted || !msg?.id) return;
      // Defense-in-depth whisper privacy check on client (GM sees all whispers; players ONLY see own sent/received whispers)
      if (msg.isWhisper && roleRef.current !== 'gm') {
        const myChar = campaignRef.current.characters.find(
          (c) => c.ownerPlayerId === myPlayerId || c.id === activeCharRef.current
        );
        const myCharLower = (myChar?.name || '').trim().toLowerCase();
        const myNameLower = (localStorage.getItem('rpg_player_name') || '').trim().toLowerCase();
        const recLower = (msg.recipientName || '').trim().toLowerCase();
        const isSender = Boolean(msg.senderPlayerId && msg.senderPlayerId === myPlayerId);
        // Strict recipient matching: when recipientPlayerId is set, NEVER allow name-collision fallback!
        const isRecipient = msg.recipientPlayerId
          ? msg.recipientPlayerId === myPlayerId
          : Boolean(
              recLower !== '' &&
                recLower !== 'mestre' &&
                (recLower === myNameLower || (myCharLower !== '' && recLower === myCharLower))
            );
        if (!isSender && !isRecipient) return;
      }
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
        // Deterministic single initiator to prevent GM & Player racing with duplicate Save Prompt IDs!
        const ownerConnected = Boolean(
          payload.characterId &&
            connectedPlayersRef.current.some(
              (p) => p.role === 'player' && p.characterId === payload.characterId
            )
        );
        const isTargetPlayer = Boolean(
          roleRef.current === 'player' &&
            payload.characterId &&
            payload.characterId === activeCharRef.current
        );
        const shouldInitiate = ownerConnected
          ? isTargetPlayer
          : roleRef.current === 'gm' || isTargetPlayer;
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
        if (cinematicEnabledRef.current) {
          setScreenShakeActive(true);
          setScreenShakeIntensity('heavy');
          window.setTimeout(() => {
            setScreenShakeActive(false);
            setScreenShakeIntensity('none');
          }, 520);
        }
        soundEngine.playSfxPreset('crit');
        if (proj.toX !== undefined && proj.toY !== undefined) {
          triggerShockwave(proj.toX, proj.toY, '#facc15', 145);
        }
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

    socket.on(
      'camera:focus',
      (payload: { id: string; mapId: string; x: number; y: number; label?: string }) => {
        if (!mounted) return;
        setCameraFocusSignal(payload);
      }
    );

    socket.on('handout:received', (handout: HandoutPayload) => {
      if (!mounted) return;
      if (roleRef.current === 'player') {
        const myChar = campaignRef.current.characters.find((c) => c.id === activeCharRef.current);
        if (handout.recipientCharacterIds && handout.recipientCharacterIds.length > 0) {
          if (!myChar || !handout.recipientCharacterIds.includes(myChar.id)) {
            return;
          }
        } else if (handout.targetPlayerName) {
          if (
            !myChar ||
            (myChar.playerName.toLowerCase() !== handout.targetPlayerName.toLowerCase() &&
              myChar.name.toLowerCase() !== handout.targetPlayerName.toLowerCase())
          ) {
            return;
          }
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
      }, 1250);
    });

    socket.on('token:speech', (payload: TokenSpeechEvent) => {
      if (!mounted || !payload?.id || !payload?.tokenId) return;
      setTokenSpeeches((prev) => ({ ...prev, [payload.tokenId]: payload }));
      const ttl = payload.text ? 6500 : 3500;
      window.setTimeout(() => {
        setTokenSpeeches((prev) => {
          if (prev[payload.tokenId]?.id !== payload.id) return prev;
          const next = { ...prev };
          delete next[payload.tokenId];
          return next;
        });
      }, ttl);
    });

    socket.on('map:draw', (stroke: MapDrawingStroke) => {
      if (!mounted || !stroke?.id || !stroke?.mapId || !Array.isArray(stroke.points)) return;
      setTempDrawings((prev) => [...prev.filter((d) => d.id !== stroke.id).slice(-45), stroke]);
      window.setTimeout(() => {
        setTempDrawings((prev) => prev.filter((d) => d.id !== stroke.id));
      }, 8200);
    });

    socket.on('map:draw-clear', (payload: { mapId: string }) => {
      if (!mounted || !payload?.mapId) return;
      setTempDrawings((prev) => prev.filter((d) => d.mapId !== payload.mapId));
    });

    return () => {
      mounted = false;
      socket.disconnect();
    };
  }, [serverUrl, refreshSavedCampaigns, refreshSavedHeroes]);

  useEffect(() => {
    if (!socketRef.current || !isConnected) return;
    const controlledChar = role === 'player' ? myCharacter : undefined;
    socketRef.current.emit('presence:identify', {
      playerId: myPlayerId,
      playerName: role === 'gm' ? campaign.gmName || 'Mestre' : myPlayerName || 'Aventureiro',
      playerColor:
        role === 'gm'
          ? '#f59e0b'
          : myCharacter?.playerColor || myPlayerColor || '#38bdf8',
      role,
      inLobby,
      characterId: role === 'player' ? controlledChar?.id : undefined,
      characterName: role === 'player' ? controlledChar?.name : undefined,
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

  const pushCombatLogRef = useRef<
    ((entry: Omit<CombatLogEntry, 'id' | 'timestamp'>) => void) | null
  >(null);
  const showTacticalAlertRef = useRef<((message: string) => void) | null>(null);

  const resetLocalEphemeralState = useCallback(() => {
    undoHistoryRef.current = [];
    setUndoCount(0);
    activeDuelRef.current = null;
    setActiveDuel(null);
    activeSavePromptRef.current = null;
    setActiveSavePrompt(null);
    fallDamagePromptRef.current = null;
    setFallDamagePrompt(null);
    counterspellPromptRef.current = null;
    setCounterspellPrompt(null);
    pendingCounterspellActionRef.current = null;
    pendingAttackRef.current = null;
    setPendingAttackChoice(null);
    setPendingManualRoll(null);
    setTargetTokenId(null);
    setActiveHandout(null);
    setActiveSecretPassage(null);
    setActiveSkillCheck(null);
    setOpportunityQueue([]);
    setActiveCutIn(null);
    setActiveBlackFlash(null);
    setActiveExecution(null);
    setActiveMvpSummary(null);
    setActiveAmbientName(null);
    setLatestRollForOverlay(null);
    setRecentRollToasts([]);
    combatStatsRef.current = {};
    prevFlyingTokensRef.current = new Map();
    soundEngine.stopAmbient();
  }, []);
  resetLocalEphemeralStateRef.current = resetLocalEphemeralState;

  const updateCampaign = useCallback(
    (updater: (prev: CampaignState) => CampaignState) => {
      const prev = campaignRef.current;
      const lateJoinAnnouncements: Array<{
        name: string;
        kind: 'hero' | 'monster' | 'npc';
        color: string;
        d20: number;
        bonus: number;
        total: number;
        isHidden: boolean;
      }> = [];

      const updatedRaw = updater(prev);
      if (updatedRaw === prev) return;

      pushUndoSnapshot(prev);
      let next = syncCampaignDerivedCharacterStats(updatedRaw, prev);

      // Auto-roll Initiative for any token spawned/added to any map while Combat is already running!
      if (prev.combat.active && next.combat.active) {
        const prevMap = prev.maps.find((m) => m.id === prev.activeMapId);
        const nextMap = next.maps.find((m) => m.id === next.activeMapId);
        if (prevMap && nextMap && prevMap.id === nextMap.id) {
          const prevTokenIds = new Set(prevMap.tokens.map((t) => t.id));
          const existingCombatants = next.combat.combatants;
          const lateTokens = nextMap.tokens.filter((tok) => {
            if (prevTokenIds.has(tok.id)) return false;
            const alreadyIn = existingCombatants.some(
              (cb) =>
                cb.tokenId === tok.id ||
                (tok.type === 'character' && tok.referenceId && cb.referenceId === tok.referenceId)
            );
            return !alreadyIn;
          });

          if (lateTokens.length > 0) {
            const nextCombatants = [...existingCombatants];
            let nextTurnIdx = next.combat.currentTurnIndex;

            for (const tok of lateTokens) {
              let initBonus = 1;
              let speedMeters = 9;
              let tokColor = tok.color;
              let condIds = tok.activeConditionIds || [];

              if (tok.type === 'character' && tok.referenceId) {
                const ch = next.characters.find((c) => c.id === tok.referenceId);
                if (ch) {
                  const st = computeCharacterStats(ch, next);
                  initBonus = st.initiative;
                  speedMeters = st.speed || 9;
                  tokColor = ch.playerColor || ch.tokenColor;
                  condIds = ch.activeConditionIds || [];
                }
              } else if (tok.type === 'monster' && tok.referenceId) {
                const mon = next.compendium.monsters.find((m) => m.id === tok.referenceId);
                if (mon) {
                  initBonus = mon.initiativeBonus;
                  speedMeters = mon.speed || 9;
                }
              }

              const d20 = Math.floor(Math.random() * 20) + 1;
              const total = d20 + initBonus;
              const extraEcon = getConditionExtraEconomy(condIds, next);
              const maxActs = 1 + extraEcon.extraActions;
              const maxBon = 1 + extraEcon.extraBonusActions;

              const newCb = {
                id: `comb-${tok.id}`,
                tokenId: tok.id,
                referenceId: tok.referenceId,
                controlledByCharacterId: tok.controlledByCharacterId,
                type: (tok.type === 'character' ? 'character' : 'monster') as
                  | 'character'
                  | 'monster',
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

              let insertIdx = nextCombatants.findIndex(
                (cb) => compareInitiativeOrder(newCb, cb) < 0
              );
              if (insertIdx === -1) insertIdx = nextCombatants.length;
              nextCombatants.splice(insertIdx, 0, newCb);
              if (insertIdx <= nextTurnIdx && nextCombatants.length > 1) {
                nextTurnIdx += 1;
              }

              lateJoinAnnouncements.push({
                name: tok.name,
                kind: tok.type === 'character' ? 'hero' : tok.type === 'npc' ? 'npc' : 'monster',
                color: tokColor,
                d20,
                bonus: initBonus,
                total,
                isHidden: Boolean(tok.isHidden),
              });
            }

            next = {
              ...next,
              combat: {
                ...next.combat,
                currentTurnIndex: nextTurnIdx,
                combatants: nextCombatants,
              },
            };
          }
        }
      }

      // Synchronous ref update + pure React state commit (StrictMode-safe: zero side effects inside setCampaign!)
      campaignRef.current = next;
      setCampaign(next);

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
        (ch) =>
          !deletedHeroIdsRef.current.has(ch.vaultId || ch.id) &&
          (Boolean(ch.vaultId) || knownIds.has(ch.id))
      );
      if (charsToSync.length > 0) {
        if (autoSyncTimerRef.current) window.clearTimeout(autoSyncTimerRef.current);
        autoSyncTimerRef.current = window.setTimeout(() => {
          charsToSync.forEach((ch) => {
            persistHeroToVault(ch, { silent: true }).catch(() => {});
          });
        }, 800);
      }

      if (lateJoinAnnouncements.length > 0) {
        window.setTimeout(() => {
          lateJoinAnnouncements.forEach((ann) => {
            if (ann.isHidden && roleRef.current !== 'gm') return;
            const bonusText = ann.bonus >= 0 ? `+${ann.bonus}` : `${ann.bonus}`;
            const msg = `⚔️ ${ann.name} entrou no combate! Iniciativa: ${ann.total} (1d20=${ann.d20} ${bonusText})`;
            if (!ann.isHidden) {
              pushCombatLogRef.current?.({
                category: 'system',
                actorName: ann.name,
                actorKind: ann.kind,
                actorColor: ann.color,
                summary: `entrou no combate com Iniciativa ${ann.total} (1d20=${ann.d20} ${bonusText})`,
              });
            }
            showTacticalAlertRef.current?.(msg);
          });
        }, 40);
      }
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
    return () => window.removeEventListener('keydown', onKeyDown);
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
    deletedHeroIdsRef.current.add(heroId);
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
      rollerPlayerId: entry.rollerPlayerId || myPlayerId,
      id: `roll-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    };
    soundEngine.playSfxPreset('dice');

    // Optimistically prepend to local rollLog immediately (0ms lag — never waits for next turn or round-trip!)
    setCampaign((prev) => {
      if (prev.rollLog.some((r) => r.id === full.id)) return prev;
      const nextState = { ...prev, rollLog: [full, ...prev.rollLog].slice(0, 120) };
      campaignRef.current = nextState;
      return nextState;
    });

    // Show 3D polyhedral dice immediately for the roller whenever dice were rolled (and no fullscreen duel is open)
    if (
      !activeDuelRef.current &&
      full.rolledDice &&
      full.rolledDice.length > 0 &&
      (!full.isSecret || roleRef.current === 'gm')
    ) {
      lastShownOverlayRollIdRef.current = full.id;
      setLatestRollForOverlay(full);
    }

    if (socketRef.current?.connected) {
      socketRef.current.emit('roll:send', full);
    }

    // Trigger synchronized BLACK FLASH strictly on Combat Attack Natural 20 (or 19-20 weapon crit) right as the d20 lands (~600ms)!
    if (
      full.isAttackRoll &&
      !full.isSecret &&
      full.d20Natural !== undefined &&
      (full.d20Natural === 20 || (full.isCrit && full.d20Natural >= 19))
    ) {
      window.setTimeout(() => {
        triggerBlackFlashRef.current?.({
          attackerName: full.rollerName,
          attackerColor: full.rollerColor,
          targetName: full.targetName,
          targetTokenId: full.targetTokenId,
          damageTotal: full.damageTotal,
        });
      }, 600);
    }

    // Auto-reveal hidden GM markers with perceptionDc when a hero rolls Percepção >= perceptionDc!
    if (/percep/i.test(full.title) && typeof full.total === 'number') {
      const currCamp = campaignRef.current;
      const rollingHero =
        currCamp.characters.find((c) => c.id === activeCharRef.current && c.name === full.rollerName) ||
        currCamp.characters.find((c) => c.name === full.rollerName);
      // Locate the rolling hero's ACTUAL map (supports split-party token-map mode!)
      const heroMap =
        (rollingHero &&
          currCamp.maps.find((m) =>
            m.tokens.some((t) => t.type === 'character' && t.referenceId === rollingHero.id)
          )) ||
        currCamp.maps.find((m) => m.id === currCamp.activeMapId);
      if (rollingHero && heroMap?.gmMarkers?.length) {
        const newlySpotted = heroMap.gmMarkers.filter(
          (mk) =>
            !mk.revealed &&
            typeof mk.perceptionDc === 'number' &&
            mk.perceptionDc > 0 &&
            (full.isCrit || (!full.isFumble && full.total >= mk.perceptionDc)) &&
            !(mk.visibleToCharacterIds || []).includes(rollingHero.id)
        );
        if (newlySpotted.length > 0) {
          const spottedIds = new Set(newlySpotted.map((m) => m.id));
          window.setTimeout(() => {
            updateCampaign((prev) => ({
              ...prev,
              maps: prev.maps.map((m) =>
                m.id !== heroMap.id
                  ? m
                  : {
                      ...m,
                      gmMarkers: (m.gmMarkers || []).map((mk) =>
                        spottedIds.has(mk.id)
                          ? {
                              ...mk,
                              visibleToCharacterIds: Array.from(
                                new Set([...(mk.visibleToCharacterIds || []), rollingHero.id])
                              ),
                            }
                          : mk
                      ),
                    }
              ),
            }));
            const names = newlySpotted.map((m) => m.title).join(', ');
            showTacticalAlertRef.current?.(
              `👁️ Percepção (${full.total}) de ${rollingHero.name} revelou: ${names}!`
            );
          }, 80);
        }
      }
    }
  }, [updateCampaign]);

  const openManualRoll = useCallback((req: Omit<PendingManualRoll, 'id'>) => {
    setLatestRollForOverlay(null);
    setPendingManualRoll({
      ...req,
      id: `mroll-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    });
  }, []);

  const cancelManualRoll = useCallback(() => {
    setPendingManualRoll((curr) => {
      if (curr?.onCancel) {
        const cancelFn = curr.onCancel;
        window.setTimeout(() => {
          cancelFn();
        }, 0);
      }
      return null;
    });
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
            isAttackRoll: Boolean(targetToken && isD20Roll),
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
      chargedInventoryEntryId,
      applyConditionId,
      conditionDurationRounds,
      aoeShape,
      aoeSizeMeters,
      aoeColor,
      aoePersistent,
      isTeleport,
      teleportRequiresSight,
      teleportAoeOrigin,
      isWeaponAttack,
      critRange,
      critMultiplier,
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

      // Guarantee Bonus/Reaction/Free abilities NEVER accidentally spend a Standard Action
      const titleKey = normalizeAbilityKey(title);
      const matchedAbilityForCost =
        char.customAbilities?.find((ab) => normalizeAbilityKey(ab.name) === titleKey) ||
        campaignRef.current.compendium.abilities.find(
          (ab) => normalizeAbilityKey(ab.name) === titleKey
        );
      const normalizedPassedCost = normalizeActionEconomyCost(actionCost);
      const effectiveActionCost: ActionEconomyCost =
        normalizedPassedCost !== 'Reação' && matchedAbilityForCost?.actionType
          ? normalizeActionEconomyCost(matchedAbilityForCost.actionType)
          : normalizedPassedCost;
      actionCost = effectiveActionCost;

      const activeMap =
        campaignRef.current.maps.find(
          (m) =>
            m.id ===
            resolveViewedMapId(
              campaignRef.current,
              roleRef.current,
              roleRef.current === 'player' ? char.id : undefined
            )
        ) || campaignRef.current.maps.find((m) => m.id === campaignRef.current.activeMapId);
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

      // Incapacitated Condition Guard for Players (Paralisado / Atordoado / Petrificado / Inconsciente / Incapacitado)
      if (roleRef.current === 'player') {
        const incapCond = (char.activeConditionIds || [])
          .map((cid) => campaignRef.current.compendium.conditions.find((c) => c.id === cid))
          .find(
            (c) =>
              c &&
              /paralisad|atordoad|petrificad|inconscient|incapacitad/i.test(c.name)
          );
        if (incapCond) {
          setPendingAttackChoice(null);
          showTacticalAlert(
            `${char.name} está ${incapCond.icon} ${incapCond.name} e não pode realizar ações!`
          );
          return;
        }
      }

      const combat = campaignRef.current.combat;
      const activeTurnCb = combat.active ? combat.combatants[combat.currentTurnIndex] : undefined;
      const charCb = combat.active
        ? combat.combatants.find((cb) => cb.referenceId === char.id)
        : undefined;

      if (combat.active && !charCb && roleRef.current === 'player' && actionCost !== 'Livre') {
        showTacticalAlert(
          activeTurnCb
            ? `Aguarde seu turno na iniciativa (${activeTurnCb.name} está agindo).`
            : 'Seu personagem ainda não está na fila de iniciativa.'
        );
        return;
      }

      const isReadyTrigger = Boolean(
        combat.active &&
          charCb &&
          actionCost === 'Padrão' &&
          charCb.readyAction &&
          charCb.reactionAvailable !== false &&
          activeTurnCb &&
          activeTurnCb.id !== charCb.id
      );
      const hasExtraAtkSlot = Boolean(
        combat.active &&
          charCb &&
          isWeaponAttack &&
          actionCost === 'Padrão' &&
          (charCb.extraAttacksRemaining ?? 0) > 0
      );

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
          !isReadyTrigger &&
          activeTurnCb &&
          activeTurnCb.id !== charCb.id
        ) {
          showTacticalAlert(`Aguarde seu turno na iniciativa (${activeTurnCb.name} está agindo).`);
          return;
        }
        if (
          actionCost === 'Padrão' &&
          !isReadyTrigger &&
          !hasExtraAtkSlot &&
          charCb.actionAvailable === false
        ) {
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
      const matchingCustomAbEarly = char.customAbilities?.find(
        (ab) => ab.name.trim().toLowerCase() === title.trim().toLowerCase()
      );
      const usesCheck = checkAbilityUsesRemaining(char, matchingAbilityForAoe);
      if (!usesCheck.ok) {
        showTacticalAlert(usesCheck.error);
        return;
      }
      const resolvedCostResId =
        costResourceId ||
        matchingCustomAbEarly?.costResourceId ||
        matchingAbilityForAoe?.costResourceId ||
        'mp';

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
      const matchingCustomAb = char.customAbilities?.find(
        (ab) => ab.name.trim().toLowerCase() === title.trim().toLowerCase()
      );
      const resolvedIsTeleport = Boolean(
        isTeleport ?? matchingAbilityForAoe?.isTeleport ?? matchingCustomAb?.isTeleport
      );
      const resolvedTeleportRequiresSight =
        teleportRequiresSight ??
        matchingAbilityForAoe?.teleportRequiresSight ??
        matchingCustomAb?.teleportRequiresSight ??
        true;
      const resolvedTeleportAoeOrigin =
        teleportAoeOrigin ?? matchingAbilityForAoe?.teleportAoeOrigin ?? 'departure';
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
      // When a compendium ability has Tipo de Dano = Nenhum (empty), ignore any hidden/stale attack/damage formula left in older saves
      const isAbilityWithNoDamageType = Boolean(
        matchingAbilityForAoe && (!damageType || !damageType.trim())
      );
      const cleanAttackFormula =
        !isAbilityWithNoDamageType && attackFormula && /\d*d\d+/i.test(attackFormula.trim())
          ? attackFormula.trim()
          : undefined;
      const cleanDamageFormula =
        !isAbilityWithNoDamageType &&
        damageFormula &&
        (/\d*d\d+/i.test(damageFormula.trim()) ||
          /[1-9]/.test(damageFormula.trim()) ||
          /\b(FOR|DES|CON|INT|SAB|CAR|PROF|NIVEL)\b/i.test(damageFormula.trim()))
          ? damageFormula.trim()
          : undefined;
      const isHealingAction = Boolean(
        cleanDamageFormula && /cura/i.test(damageType || '')
      );
      const isTargetedAction = Boolean(
        resolvedIsTeleport ||
          resolvedAoeShape ||
          (!isSelfRange &&
            (isHealingAction ||
              cleanAttackFormula ||
              cleanDamageFormula ||
              saveSkillId ||
              applyConditionId))
      );

      const resolvedParsedDuration = parseAbilityDuration(
        matchingAbilityForAoe?.duration,
        conditionDurationRounds ?? matchingAbilityForAoe?.conditionDurationRounds
      );
      const resolvedStaticDurationRounds = resolvedParsedDuration.isDiceFormula
        ? undefined
        : resolvedParsedDuration.rounds;

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
          attackFormula: isHealingAction ? undefined : cleanAttackFormula,
          damageFormula: cleanDamageFormula,
          damageType,
          range,
          actionCost,
          costMp,
          costResourceId: resolvedCostResId,
          chargedInventoryEntryId,
          applyConditionId,
          conditionDurationRounds: resolvedStaticDurationRounds,
          conditionDurationFormula: resolvedParsedDuration.isDiceFormula
            ? resolvedParsedDuration.formula
            : undefined,
          requiresConcentration: Boolean(matchingAbilityForAoe?.requiresConcentration),
          singleTargetOnly: Boolean(matchingAbilityForAoe?.singleTargetOnly),
          sfxPreset: matchingAbilityForAoe?.sfxPreset,
          vfxKind: matchingAbilityForAoe?.vfxKind,
          saveSkillId,
          saveDcFormula,
          halfOnSuccess: matchingAbilityForAoe?.halfOnSuccess,
          aoeShape: resolvedAoeShape,
          aoeSizeMeters: resolvedAoeSize,
          aoeColor: resolvedAoeColor,
          aoePersistent: resolvedAoePersistent,
          aoeTargetFilter: resolvedAoeTargetFilter,
          createsSurface: resolvedCreatesSurface,
          isTeleport: resolvedIsTeleport || undefined,
          teleportRequiresSight: resolvedIsTeleport ? resolvedTeleportRequiresSight : undefined,
          teleportAoeOrigin: resolvedIsTeleport ? resolvedTeleportAoeOrigin : undefined,
          isWeaponAttack: isWeaponAttack || undefined,
          critRange,
          critMultiplier,
          isReadyReactionTrigger: isReadyTrigger || undefined,
        };
        if (activeMap && (activeMap.tokens.length > 0 || resolvedAoeShape || resolvedIsTeleport)) {
          // Always require explicit target selection, AoE placement, or Teleport destination on map
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

      const applySelfConditionWithRounds = (roundsCount: number) => {
        if (!applyConditionId) return;
        const condDef = campaignRef.current.compendium.conditions.find(
          (c) => c.id === applyConditionId
        );
        if (!condDef) return;
        const targetMapIdForSelf = activeMap?.id || campaignRef.current.activeMapId;
        updateCampaign((prev) => ({
          ...prev,
          characters: prev.characters.map((c) => {
            if (c.id !== targetCharIdForSelf) return c;
            if (c.activeConditionIds.includes(applyConditionId)) return c;
            return { ...c, activeConditionIds: [...c.activeConditionIds, applyConditionId] };
          }),
          maps: targetTokIdForSelf
            ? prev.maps.map((m) =>
                m.id !== targetMapIdForSelf
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
                        ...cb.effects.filter((ef) => ef.conditionId !== applyConditionId),
                        {
                          id: `eff-${Date.now()}`,
                          label: condDef.name,
                          conditionId: applyConditionId,
                          remainingRounds: Math.max(1, roundsCount),
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
      };

      const needsDurationDiceRoll = Boolean(
        applyConditionId &&
          resolvedParsedDuration.isDiceFormula &&
          !(cleanAttackFormula || cleanDamageFormula)
      );

      void (async () => {
        const conflict = await confirmAbilityConflictIfNeeded(char, {
          abilityName: title,
          requiresConcentration: shouldSetConcentration,
          singleTargetOnly: isSingleTargetOnly,
          newTargetTokenId: targetTokIdForSelf,
          newTargetName: targetNameForSelf,
        });
        if (!conflict.proceed) return;

        if (
          matchingCustomAb?.isUltimate ||
          matchingCustomAb?.isDomainExpansion ||
          matchingAbility?.isUltimate ||
          matchingAbility?.isDomainExpansion
        ) {
          triggerUltimateCutInRef.current?.({
            actorName: char.name,
            techniqueName: title,
            catchphrase:
              matchingCustomAb?.ultimateCatchphrase || matchingAbility?.ultimateCatchphrase,
            color:
              matchingCustomAb?.ultimateColor ||
              matchingAbility?.ultimateColor ||
              char.playerColor ||
              char.tokenColor,
            portraitUrl:
              matchingCustomAb?.ultimateImageUrl ||
              matchingCustomAb?.imageUrl ||
              matchingAbility?.ultimateImageUrl ||
              matchingAbility?.imageUrl ||
              char.portraitUrl,
            style: matchingCustomAb?.ultimateStyle || matchingAbility?.ultimateStyle,
            sfxPreset: matchingCustomAb?.ultimateSfxPreset || matchingAbility?.ultimateSfxPreset,
            sfxUrl: matchingCustomAb?.ultimateSfxUrl || matchingAbility?.ultimateSfxUrl,
            activateDomain: Boolean(
              matchingCustomAb?.isDomainExpansion || matchingAbility?.isDomainExpansion
            ),
            domainTheme:
              matchingCustomAb?.domainTheme || matchingAbility?.domainTheme || 'sonic',
            domainDurationRounds:
              matchingCustomAb?.domainDurationRounds || matchingAbility?.domainDurationRounds,
            domainMusicUrl:
              matchingCustomAb?.domainMusicUrl || matchingAbility?.domainMusicUrl,
            domainMapId: activeMap?.id,
            casterCharacterId: char.id,
            casterTokenId: myToken?.id,
          });
        }

        const commitSelfCostAndEffects = (finalDurationRounds: number) => {
          playSyncedAbilitySfx({
            explicitSfxPreset: matchingAbility?.sfxPreset,
            title,
            damageType,
            range,
            applyConditionId,
            isAttack: Boolean(cleanAttackFormula),
          });
          if (myToken) {
            fireProjectileVfx({
              fromToken: myToken,
              toToken: targetToken || myToken,
              title,
              damageType,
              applyConditionId,
              range,
              kind: matchingAbility?.vfxKind,
            });
          }

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
                  inventory: deductChargedInventoryItem(
                    c,
                    chargedInventoryEntryId,
                    base.compendium.items
                  ),
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
                base.combat.active && charCb && (actionCost !== 'Livre' || shouldSetConcentration || isReadyTrigger)
                  ? {
                      ...base.combat,
                      combatants: base.combat.combatants.map((cb) =>
                        cb.id !== charCb.id
                          ? cb
                          : {
                              ...consumeCombatantEconomy(cb, actionCost, {
                                isReadyReaction: isReadyTrigger,
                              }),
                              ...(shouldSetConcentration ? { concentratingSpell: title } : {}),
                            }
                      ),
                    }
                  : base.combat,
            };
          });

          if (applyConditionId) {
            applySelfConditionWithRounds(finalDurationRounds);
          }
        };

        if (needsDurationDiceRoll && resolvedParsedDuration.isDiceFormula) {
          const condDef = campaignRef.current.compendium.conditions.find(
            (c) => c.id === applyConditionId
          );
          const durFormula = resolvedParsedDuration.formula;
          openManualRoll({
            title: `Duração: ${title}`,
            subtitle: condDef
              ? `Turnos completos de ${condDef.icon} ${condDef.name}`
              : 'Turnos completos de duração',
            formula: durFormula,
            displayFormula: formatFormulaForDisplay(durFormula, stats, char),
            previewDice: buildPreviewDiceForFormula(durFormula, 'normal'),
            rollerName: char.name,
            rollerColor: char.playerColor || char.tokenColor,
            diceSkin: char.diceSkin || 'gold',
            allowAdvantageToggle: false,
            advantageMode: 'normal',
            onExecute: () => {
              const durRes = evaluateFormula(durFormula, stats, char);
              const rolledTurns = Math.max(1, durRes.total);
              commitSelfCostAndEffects(rolledTurns);
              sendRoll({
                rollerName: char.name,
                rollerRole: roleRef.current,
                rollerColor: char.playerColor || char.tokenColor,
                diceSkin: char.diceSkin || 'gold',
                title: `Duração: ${title}`,
                formula: durRes.resolvedFormula,
                individualRolls: durRes.individualRolls,
                rolledDice: durRes.rolledDice,
                total: rolledTurns,
                isSecret: roleRef.current === 'gm' && secretRoll,
                details: `${condDef?.icon || '✨'} ${condDef?.name || title} ativo por ${rolledTurns} ${rolledTurns === 1 ? 'turno completo' : 'turnos completos'}!`,
              });
              pushCombatLog({
                category: 'condition',
                actorName: char.name,
                actorKind: 'hero',
                actorColor: char.playerColor || char.tokenColor,
                summary: `ativou ${title} (${condDef?.name || 'Efeito'} por ${rolledTurns} ${rolledTurns === 1 ? 'turno' : 'turnos'})`,
              });
              showTacticalAlert(
                `✨ ${char.name} ativou ${title} por ${rolledTurns} ${rolledTurns === 1 ? 'turno completo' : 'turnos completos'}!`
              );
            },
          });
          return;
        }

        const combinedExtraBonus =
          (extraBonus || 0) + (cleanAttackFormula ? stats.attackBonusExtra : 0);
        const combinedDice = [
          ...(extraDice || []),
          ...(cleanAttackFormula ? stats.attackDiceBonuses : []),
        ];

        const executeActionRoll = (chosenMode: RollAdvantageMode) => {
          // Commit MP/Action/Uses/Charges ONLY when roll is confirmed (canceling dice modal burns zero resources!)
          commitSelfCostAndEffects(resolvedStaticDurationRounds ?? 3);

          const attackRes = cleanAttackFormula
            ? evaluateFormula(cleanAttackFormula, stats, char, {
                advantageMode: chosenMode,
                extraFlatBonus: combinedExtraBonus,
                extraDiceBonuses: combinedDice,
                critRange,
              })
            : null;

          const allRolledDice: RolledDieVisual[] = [...(attackRes?.rolledDice || [])];

          let dmgTotal: number | undefined;
          let dmgDetails = '';
          if (cleanDamageFormula) {
            const isHealing = damageType?.toLowerCase() === 'cura';
            const dmgRes = evaluateFormula(cleanDamageFormula, stats, char, {
              extraFlatBonus: !isHealing ? stats.damageBonusExtra : 0,
              extraDiceBonuses: !isHealing ? stats.damageDiceBonuses : undefined,
              isCritDamage: attackRes?.isCrit,
              critMultiplier,
            });
            dmgTotal = Math.max(1, dmgRes.total);
            dmgDetails = `${damageType || 'Dano'}: ${dmgTotal} (${dmgRes.details})`;
            allRolledDice.push(...dmgRes.rolledDice);
            // Apply self-healing directly when using Pessoal healing skills or healing potions!
            if (isHealing && isSelfRange && dmgTotal > 0) {
              const healTargetId = targetTokIdForSelf || char.id;
              window.setTimeout(() => {
                applyDamage(healTargetId, dmgTotal!, true, undefined, 'Cura');
                if (targetTokIdForSelf) triggerSlashVfx(targetTokIdForSelf, 'heal');
              }, 60);
            }
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
            formula: attackRes ? attackRes.resolvedFormula : cleanDamageFormula || 'Efeito',
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
            isAttackRoll: Boolean(attackRes),
            isSecret: roleRef.current === 'gm' && secretRoll,
            details: detailsParts.join(' • ') || 'Habilidade ativada.',
          });
        };

        const activeFormula = cleanAttackFormula || cleanDamageFormula;
        if (activeFormula && /\d*d\d+/i.test(activeFormula)) {
          const isDirectDmgPreview = !cleanAttackFormula && Boolean(cleanDamageFormula) && !isHealingAction;
          const previewFormulaWithBonuses =
            isDirectDmgPreview && stats.damageDiceBonuses.length > 0
              ? `${activeFormula} + ${stats.damageDiceBonuses.join(' + ')}`
              : activeFormula;
          openManualRoll({
            title,
            subtitle: damageType?.toLowerCase() === 'cura' ? 'Rolagem de Cura' : undefined,
            formula: previewFormulaWithBonuses,
            displayFormula: formatFormulaForDisplay(previewFormulaWithBonuses, stats, char),
            previewDice: buildPreviewDiceForFormula(
              previewFormulaWithBonuses,
              cleanAttackFormula ? advantageMode : 'normal'
            ),
            rollerName: char.name,
            rollerColor: char.playerColor || char.tokenColor,
            diceSkin: char.diceSkin || 'gold',
            allowAdvantageToggle: Boolean(
              cleanAttackFormula && cleanAttackFormula.toLowerCase().includes('d20')
            ),
            advantageMode: cleanAttackFormula ? advantageMode : 'normal',
            onExecute: executeActionRoll,
          });
        } else if (!needsDurationDiceRoll) {
          commitSelfCostAndEffects(resolvedStaticDurationRounds ?? 3);
          // Skill without dice (utility / buff / condition / flat effect): activate directly without opening any dice roller!
          const condName = applyConditionId
            ? campaignRef.current.compendium.conditions.find((c) => c.id === applyConditionId)?.name
            : undefined;
          const costNote =
            costMp && costMp > 0 ? ` (-${costMp} ${campaignRef.current.settings.resourceShort})` : '';
          const durNote =
            applyConditionId && resolvedStaticDurationRounds
              ? ` (${resolvedStaticDurationRounds} ${resolvedStaticDurationRounds === 1 ? 'turno' : 'turnos'})`
              : '';
          const effectNote = condName
            ? ` • Aplicou ${condName}${durNote}`
            : shouldSetConcentration
              ? ' • Concentração ativa'
              : '';
          pushCombatLog({
            category: applyConditionId ? 'condition' : 'spell',
            actorName: char.name,
            actorKind: 'hero',
            actorColor: char.playerColor || char.tokenColor,
            summary: `ativou ${title}${costNote}${effectNote}`,
          });
          showTacticalAlert(`✨ ${char.name} usou ${title}${effectNote}!`);
        }
      })();
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
  pushCombatLogRef.current = pushCombatLog;

  const awardXp = useCallback(
    (characterIds: string[] | 'all', amount: number) => {
      const cleanAmt = Math.round(amount);
      if (!Number.isFinite(cleanAmt) || cleanAmt === 0) return;
      const curr = campaignRef.current;
      const targetIds = new Set(
        characterIds === 'all'
          ? curr.characters
              .filter((c) => !c.deathSaves?.dead && (c.deathSaves?.failures ?? 0) < 3)
              .map((c) => c.id)
          : characterIds
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
              gainedAsi += getAttributePointsGainedAtLevel(lv, prev.settings);
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
            const isCharPermanentlyDead = Boolean(
              c.deathSaves?.dead || (c.deathSaves?.failures ?? 0) >= 3
            );
            return {
              ...draft,
              hp: isCharPermanentlyDead ? 0 : nextStats.maxHp,
              mp: isCharPermanentlyDead ? c.mp : nextStats.maxMp,
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
      conditionDurationRounds?: number,
      isCrit = false,
      options?: {
        suppressExecution?: boolean;
        skipRevivePenalty?: boolean;
        killerName?: string;
        killerColor?: string;
        killerPortraitUrl?: string;
      }
    ) => {
      pushUndoSnapshot(campaignRef.current, true);
      const currSnapshot = campaignRef.current;
      const duelSnap = activeDuelRef.current;
      const activeTurnCbSnap = currSnapshot.combat.active
        ? currSnapshot.combat.combatants[currSnapshot.combat.currentTurnIndex]
        : undefined;
      const activeCharSnap = currSnapshot.characters.find(
        (c) =>
          c.id === duelSnap?.attackerCharacterId ||
          c.id === activeTurnCbSnap?.referenceId ||
          c.id === activeCharRef.current
      );
      const resolvedKillerName =
        options?.killerName ||
        duelSnap?.attackerName ||
        activeTurnCbSnap?.name ||
        activeCharSnap?.name ||
        'Golpe Fatal';
      const resolvedKillerColor =
        options?.killerColor ||
        duelSnap?.attackerColor ||
        activeCharSnap?.playerColor ||
        activeTurnCbSnap?.color ||
        '#f59e0b';
      const resolvedKillerPortrait =
        options?.killerPortraitUrl || duelSnap?.attackerImageUrl || activeCharSnap?.portraitUrl;

      if (socketRef.current?.connected) {
        socketRef.current.emit('combat:apply-damage', {
          targetTokenId: targetTokenIdParam,
          amount,
          isHeal,
          rollId,
          damageType,
          applyConditionId,
          conditionDurationRounds,
          isCrit,
          suppressExecution: options?.suppressExecution,
          skipRevivePenalty: options?.skipRevivePenalty,
          killerName: resolvedKillerName,
          killerColor: resolvedKillerColor,
          killerPortraitUrl: resolvedKillerPortrait,
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
        const targetNpc =
          tok?.type === 'npc' && tok.referenceId
            ? curr.npcs.find((n) => n.id === tok.referenceId)
            : undefined;
        const isTargetPermanentlyDead = Boolean(
          char && (char.deathSaves?.dead || (char.deathSaves?.failures ?? 0) >= 3)
        );
        if (isHeal && isTargetPermanentlyDead) {
          return;
        }
        let finalAmt = Math.abs(amount);
        if (!isHeal && damageType) {
          finalAmt = resolveDamageWithAffinities(finalAmt, damageType, {
            immunities:
              char?.damageImmunities || mon?.damageImmunities || targetNpc?.damageImmunities,
            resistances:
              char?.damageResistances || mon?.damageResistances || targetNpc?.damageResistances,
            vulnerabilities:
              char?.damageVulnerabilities ||
              mon?.damageVulnerabilities ||
              targetNpc?.damageVulnerabilities,
            activeConditionIds: [
              ...(tok?.activeConditionIds || []),
              ...(char?.activeConditionIds || []),
            ],
            compendiumConditions: curr.compendium.conditions,
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
        const suppressExec = Boolean(options?.suppressExecution);

        updateCampaign((prev) => {
          let working = prev;
          let bossPhaseTitleUpdate: string | undefined;
          let concBrokenForChar = false;
          if (char && !isHeal && char.hp + delta <= 0 && char.concentratingSpell) {
            concBrokenForChar = true;
            const concEffs = (char.activeTrackedEffects || []).filter((e) => e.isConcentration);
            if (concEffs.length > 0) {
              working = removeTrackedEffectsFromState(working, char.id, concEffs);
            }
          }

          const nextChars = working.characters.map((c) => {
            if (c.id !== tok?.referenceId && c.id !== targetTokenIdParam) return c;
            const maxHp = Math.max(1, computeCharacterStats(c, working).maxHp);
            const nextHp = Math.max(0, Math.min(maxHp, c.hp + delta));
            const nextTempHp = Math.max(0, (c.tempHp || 0) - tempAbsorbed);
            let nextConds =
              applyConditionId && !c.activeConditionIds.includes(applyConditionId)
                ? [...c.activeConditionIds, applyConditionId]
                : [...c.activeConditionIds];
            let nextDeathSaves = c.deathSaves;
            if (isHeal && nextHp > 0) {
              nextConds = nextConds.filter((id) => id !== 'cond-inconsciente');
              nextDeathSaves = { successes: 0, failures: 0, stabilized: false, dead: false };
            } else if (!isHeal && c.hp <= 0 && dmgAfterTemp > 0) {
              const prevFail = c.deathSaves?.failures ?? 0;
              const nextFail = Math.min(3, prevFail + (isCrit ? 2 : 1));
              nextDeathSaves = {
                ...(c.deathSaves || { successes: 0, failures: 0 }),
                failures: nextFail,
                stabilized: false,
                dead: nextFail >= 3,
              };
            }
            return {
              ...c,
              hp: nextHp,
              tempHp: nextTempHp,
              activeConditionIds: nextConds,
              deathSaves: nextDeathSaves,
              ...(concBrokenForChar ? { concentratingSpell: null } : {}),
            };
          });

          const nextMaps = working.maps.map((m) => {
            const autoLootMarkers: GmMapMarker[] = [];
            const newScars: BattleScar[] = [];
            const resolveLocalScarKind = (dt?: string, crit?: boolean): BattleScarKind => {
              if (crit) return 'black-flash';
              const l = (dt || '').toLowerCase();
              if (/fogo|chama|radiant|solar|calor/.test(l)) return 'scorch';
              if (/frio|gelo|gélid/.test(l)) return 'frost-shatter';
              if (/ácid|acid|venen|necrót|necrot|tóxic/.test(l)) return 'acid-pool';
              if (/concuss|impact|trov|força|forca|elétric|eletric/.test(l)) return 'crater';
              return 'blood-slash';
            };
            const nextTokens = m.tokens.map((t) => {
              const isLinkedCharToken =
                Boolean(char && t.type === 'character' && t.referenceId === char.id);
              if (t.id !== targetTokenIdParam && !isLinkedCharToken) return t;
              const nextHp = Math.max(0, Math.min(t.maxHp, t.hp + delta));
              const killedOffline = !isHeal && t.hp > 0 && nextHp <= 0;
              if (
                t.id === targetTokenIdParam &&
                !isHeal &&
                !suppressExec &&
                !t.isHidden &&
                finalAmt > 0 &&
                (isCrit || killedOffline)
              ) {
                newScars.push({
                  id: `scar-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                  x: t.x,
                  y: t.y,
                  size: Math.max(1, t.size || 1),
                  kind: resolveLocalScarKind(damageType, Boolean(isCrit)),
                  rotation: Math.floor(Math.random() * 360),
                  createdAt: Date.now(),
                });
              }
              if (
                t.id === targetTokenIdParam &&
                killedOffline &&
                !suppressExec &&
                !t.isHidden &&
                finalAmt > 0 &&
                t.type !== 'character'
              ) {
                const execEvt: ExecutionCinematicEvent = {
                  id: `exec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                  killerName: resolvedKillerName,
                  killerColor: resolvedKillerColor,
                  killerPortraitUrl: resolvedKillerPortrait,
                  victimName: t.name,
                  victimTokenId: t.id,
                  isBoss: Boolean(t.isBoss || (t.size || 1) >= 2),
                  damageType,
                  mapId: m.id,
                  createdAt: Date.now(),
                };
                window.setTimeout(() => {
                  if (activeCutInRef.current) {
                    queuedExecutionRef.current = execEvt;
                  } else {
                    launchExecutionLocalRef.current?.(execEvt);
                  }
                }, 40);
              }
              let nextConds =
                applyConditionId && !(t.activeConditionIds || []).includes(applyConditionId)
                  ? [...(t.activeConditionIds || []), applyConditionId]
                  : [...(t.activeConditionIds || [])];
              if (isHeal && nextHp > 0) {
                nextConds = nextConds.filter((id) => id !== 'cond-inconsciente');
              }
              let nextPhase = t.bossPhase || 1;
              let nextPhaseTitle = t.bossPhase2Title;
              let nextTriggeredIds = t.triggeredBossPhaseIds ? [...t.triggeredBossPhaseIds] : [];
              let restoreLegActions = false;
              if (t.isBoss && t.maxHp > 0 && nextHp > 0) {
                const hpPct = (nextHp / t.maxHp) * 100;
                if (t.bossPhases && t.bossPhases.length > 0) {
                  const sorted = [...t.bossPhases].sort(
                    (a, b) => b.hpThresholdPct - a.hpThresholdPct
                  );
                  sorted.forEach((ph, idx) => {
                    if (hpPct <= ph.hpThresholdPct && !nextTriggeredIds.includes(ph.id)) {
                      nextTriggeredIds.push(ph.id);
                      nextPhase = Math.max(nextPhase, idx + 2);
                      nextPhaseTitle = ph.title;
                      if (ph.restoreLegendaryActions) restoreLegActions = true;
                    }
                  });
                } else if (t.bossPhase2Title && (t.bossPhase || 1) < 2) {
                  const phase2Pct = t.bossPhase2HpPct ?? 50;
                  if (hpPct <= phase2Pct) {
                    nextPhase = 2;
                    restoreLegActions = true;
                  }
                }
              }
              if (nextPhase !== (t.bossPhase || 1) && nextPhaseTitle) {
                bossPhaseTitleUpdate = nextPhaseTitle;
              }
              let droppedNow = false;
              if (
                t.type === 'monster' &&
                t.hp > 0 &&
                nextHp === 0 &&
                !t.lootDropped &&
                mon &&
                ((mon.lootGoldFormula && mon.lootGoldFormula.trim()) ||
                  (mon.lootItems && mon.lootItems.length > 0))
              ) {
                droppedNow = true;
                const goldVal = mon.lootGoldFormula?.trim()
                  ? Math.max(0, evaluateFormula(mon.lootGoldFormula.trim()).total)
                  : 0;
                const lootDisplayName = isTokenNameHiddenFromPlayers(t, working)
                  ? 'Inimigo Desconhecido'
                  : t.name;
                autoLootMarkers.push({
                  id: `loot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                  x: t.x,
                  y: t.y,
                  kind: 'chest',
                  title: `Espólio: ${lootDisplayName}`,
                  description: `Itens e moedas deixados por ${lootDisplayName}.`,
                  revealed: true,
                  lootGold: goldVal > 0 ? goldVal : undefined,
                  lootItems: mon.lootItems?.map((li) => ({ ...li })),
                });
              }
              return {
                ...t,
                hp: nextHp,
                activeConditionIds: nextConds,
                ...(droppedNow ? { lootDropped: true } : {}),
                ...(nextPhase !== (t.bossPhase || 1)
                  ? {
                      bossPhase: nextPhase,
                      bossPhase2Title: nextPhaseTitle,
                      triggeredBossPhaseIds: nextTriggeredIds,
                      ...(restoreLegActions
                        ? {
                            legendaryActionsRemaining:
                              t.legendaryActionsMax ?? t.legendaryActionsRemaining,
                          }
                        : {}),
                    }
                  : {}),
              };
            });
            return {
              ...m,
              tokens: nextTokens,
              ...(autoLootMarkers.length > 0
                ? { gmMarkers: [...(m.gmMarkers || []), ...autoLootMarkers] }
                : {}),
              ...(newScars.length > 0
                ? { battleScars: [...(m.battleScars || []), ...newScars].slice(-60) }
                : {}),
            };
          });

          return {
            ...working,
            characters: nextChars,
            maps: nextMaps,
            activeBoss:
              working.activeBoss && working.activeBoss.id === targetTokenIdParam
                ? {
                    ...working.activeBoss,
                    hp: Math.max(0, Math.min(working.activeBoss.maxHp, working.activeBoss.hp + delta)),
                    ...(bossPhaseTitleUpdate ? { title: bossPhaseTitleUpdate } : {}),
                  }
                : working.activeBoss,
            combat: working.combat.active
              ? {
                  ...working.combat,
                  combatants: working.combat.combatants.map((cb) => {
                    const matches =
                      (cb.tokenId && cb.tokenId === targetTokenIdParam) ||
                      Boolean(
                        cb.type === 'character' &&
                          char &&
                          cb.referenceId === char.id
                      );
                    if (!matches) return cb;
                    const wasDownCb = cb.hp <= 0;
                    const nextCbHp = Math.max(0, Math.min(cb.maxHp, cb.hp + delta));
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
                    const baseCb = {
                      ...cb,
                      hp: nextCbHp,
                      effects: nextEffects,
                      ...(concBrokenForChar ? { concentratingSpell: null } : {}),
                    };
                    // BG3 Revive Rule: healing a downed combatant from 0 PV spends their Standard Action (unless GM manual +1/+5)
                    if (isHeal && !options?.skipRevivePenalty && wasDownCb && nextCbHp > 0) {
                      const activeTurnCb =
                        working.combat.combatants[working.combat.currentTurnIndex];
                      return applyBg3ReviveActionPenalty(
                        baseCb,
                        Boolean(activeTurnCb && activeTurnCb.id === cb.id)
                      );
                    }
                    return baseCb;
                  }),
                }
              : working.combat,
            rollLog: rollId
              ? working.rollLog.map((r) => (r.id === rollId ? { ...r, applied: true } : r))
              : working.rollLog,
          };
        });

        // Offline D&D 5e Concentration Save Trigger when concentrating character takes damage and stays > 0 PV!
        if (!isHeal && finalAmt > 0 && char && char.concentratingSpell && char.hp + delta > 0) {
          const concDc = Math.max(10, Math.floor(finalAmt / 2));
          const charTok = tok || curr.maps.flatMap((m) => m.tokens).find((t) => t.type === 'character' && t.referenceId === char.id);
          window.setTimeout(() => {
            if (
              activeSavePromptRef.current?.kind === 'concentration' &&
              activeSavePromptRef.current.targets.some((t) => t.characterId === char.id)
            ) {
              return;
            }
            startConcentrationPromptRef.current?.({
              tokenId: charTok?.id || targetTokenIdParam,
              characterId: char.id,
              name: char.name,
              spellName: char.concentratingSpell!,
              dc: concDc,
              damageTaken: finalAmt,
            });
          }, 90);
        }
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

      updateCampaign((prev) => {
        let working = prev;
        for (const c of prev.characters) {
          if (c.hp <= 0 || c.deathSaves?.dead || (c.deathSaves?.failures || 0) >= 3) {
            continue;
          }
          const res = applyCharacterRestToState(working, c.id, kind);
          if (res) {
            working = res.nextState;
          }
        }

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
      const activeMap =
        (params.toToken && curr.maps.find((m) => m.tokens.some((t) => t.id === params.toToken!.id))) ||
        (params.fromToken && curr.maps.find((m) => m.tokens.some((t) => t.id === params.fromToken!.id))) ||
        curr.maps.find((m) => m.id === curr.activeMapId);
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
          if (cinematicEnabledRef.current) {
            setScreenShakeActive(true);
            setScreenShakeIntensity('heavy');
            window.setTimeout(() => {
              setScreenShakeActive(false);
              setScreenShakeIntensity('none');
            }, 520);
          }
          soundEngine.playSfxPreset('crit');
          triggerShockwave(proj.toX, proj.toY, '#facc15', 145);
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
      actorColor: string,
      explicitMapId?: string
    ) => {
      const curr = campaignRef.current;
      const activeMap =
        (explicitMapId && curr.maps.find((m) => m.id === explicitMapId)) ||
        curr.maps.find((m) => m.id === curr.activeMapId);
      if (!activeMap || !activeMap.elementalSurfaces || seedCells.length === 0) return;
      const combo = resolveElementalSurfaceCombo(activeMap.elementalSurfaces, seedCells, damageType);
      if (!combo || !combo.triggered) return;

      const cellKeySet = new Set(combo.affectedCells.map((c) => `${c.x},${c.y}`));
      // 1. Find all living, grounded visible tokens standing on any connected puddle cell (flying tokens > 0m are immune!)
      const affectedTokens = activeMap.tokens.filter((tok) => {
        if (tok.isHidden || tok.hp <= 0 || (tok.elevationMeters || 0) > 0) return false;
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
      socketRef.current.emit('opportunity:prompt', null);
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
        const resolvedUrl = payload.customUrl ? resolveAssetUrl(payload.customUrl) : undefined;
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
    },
    [resolveAssetUrl]
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
      soundEngine.playCustomUrl(resolveAssetUrl(payload.url), true);
      setActiveAmbientName(`Tema: ${char.name}`);
    }
  }, [resolveAssetUrl]);

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

  const requestSkillCheck = useCallback(
    (
      skillOrAttrId: string,
      label: string,
      dc: number,
      options?: {
        targetCharacterIds?: string[];
        targetScopeLabel?: string;
        hideDc?: boolean;
        isGroupCheck?: boolean;
      }
    ) => {
      const req: SkillCheckRequest = {
        id: `chk-${Date.now()}`,
        skillOrAttrId,
        label,
        dc,
        targetCharacterIds:
          options?.targetCharacterIds && options.targetCharacterIds.length > 0
            ? options.targetCharacterIds
            : undefined,
        targetScopeLabel: options?.targetScopeLabel,
        hideDc: Boolean(options?.hideDc),
        isGroupCheck: Boolean(options?.isGroupCheck),
        createdAt: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        results: [],
      };
      if (socketRef.current?.connected) {
        socketRef.current.emit('check:request', req);
      } else {
        setActiveSkillCheck(req);
      }
    },
    []
  );

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
      const ownChar =
        roleRef.current === 'player'
          ? campaignRef.current.characters.find((c) => c.ownerPlayerId === myPlayerId) ||
            campaignRef.current.characters.find((c) => c.id === activeCharRef.current)
          : undefined;
      const sender =
        roleRef.current === 'gm'
          ? campaignRef.current.gmName || 'Mestre'
          : ownChar?.name || myPlayerName || 'Jogador';
      if (socketRef.current?.connected) {
        socketRef.current.emit('map:ping', { mapId, x, y, color, sender });
      } else {
        const id = `ping-${Date.now()}`;
        setPings((prev) => [...prev, { id, mapId, x, y, color, sender }]);
        window.setTimeout(() => {
          setPings((prev) => prev.filter((p) => p.id !== id));
        }, 1250);
      }
    },
    [myPlayerId, myPlayerName]
  );

  const emitTokenSpeech = useCallback((payload: Omit<TokenSpeechEvent, 'id' | 'createdAt'>) => {
    const full: TokenSpeechEvent = {
      ...payload,
      id: `sp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: Date.now(),
    };
    if (socketRef.current?.connected) {
      socketRef.current.emit('token:speech', full);
    } else {
      setTokenSpeeches((prev) => ({ ...prev, [full.tokenId]: full }));
      const ttl = full.text ? 6500 : 3500;
      window.setTimeout(() => {
        setTokenSpeeches((prev) => {
          if (prev[full.tokenId]?.id !== full.id) return prev;
          const next = { ...prev };
          delete next[full.tokenId];
          return next;
        });
      }, ttl);
    }
  }, []);

  const emitTempDrawing = useCallback((stroke: Omit<MapDrawingStroke, 'id' | 'createdAt'>) => {
    if (!stroke.mapId || !stroke.points || stroke.points.length < 2) return;
    const full: MapDrawingStroke = {
      ...stroke,
      permanent: false,
      id: `drw-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: Date.now(),
    };
    if (socketRef.current?.connected) {
      socketRef.current.emit('map:draw', full);
    } else {
      setTempDrawings((prev) => [...prev.slice(-45), full]);
      window.setTimeout(() => {
        setTempDrawings((prev) => prev.filter((d) => d.id !== full.id));
      }, 8200);
    }
  }, []);

  const clearMapDrawings = useCallback(
    (mapId: string) => {
      if (!mapId) return;
      setTempDrawings((prev) => prev.filter((d) => d.mapId !== mapId));
      if (socketRef.current?.connected) {
        socketRef.current.emit('map:draw-clear', { mapId });
      }
      updateCampaign((prev) => ({
        ...prev,
        maps: prev.maps.map((m) => (m.id === mapId ? { ...m, drawings: [] } : m)),
      }));
    },
    [updateCampaign]
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
      serverUrlRef.current = '';
      try {
        const res = await fetch('/api/campaigns/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        });
        if (!res.ok) {
          let errMsg = `Erro do servidor (${res.status})`;
          try {
            const payload = (await res.json()) as { error?: string };
            if (payload?.error) errMsg = payload.error;
          } catch {
            // keep default status message
          }
          await openAlertDialog(
            `Não foi possível criar a campanha: ${errMsg}`,
            'Erro ao Criar Campanha'
          );
          return;
        }
        const next = (await res.json()) as CampaignState;
        resetLocalEphemeralState();
        const synced = syncCampaignDerivedCharacterStats(next);
        campaignRef.current = synced;
        setCampaign(synced);
        setIsGmHostSession(true);
        setRole('gm');
        await refreshSavedCampaigns();
        setInLobby(false);
      } catch (err) {
        await openAlertDialog(
          `Não foi possível conectar ao servidor local para criar a campanha. (${String(err)})`,
          'Erro de Conexão'
        );
      }
    },
    [refreshSavedCampaigns, resetLocalEphemeralState, setInLobby, setIsGmHostSession, setRole, setServerUrl]
  );

  const loadSavedCampaign = useCallback(
    async (id: string): Promise<boolean> => {
      setServerUrl('');
      serverUrlRef.current = '';
      try {
        const res = await fetch(`/api/campaigns/load/${encodeURIComponent(id)}`, {
          method: 'POST',
        });
        if (!res.ok) {
          let errMsg = `Erro do servidor (${res.status})`;
          try {
            const payload = (await res.json()) as { error?: string };
            if (payload?.error) errMsg = payload.error;
          } catch {
            // keep default
          }
          await openAlertDialog(
            `Não foi possível abrir a campanha salva: ${errMsg}`,
            'Erro ao Abrir Campanha'
          );
          return false;
        }
        const next = (await res.json()) as CampaignState;
        resetLocalEphemeralState();
        const synced = syncCampaignDerivedCharacterStats(next);
        campaignRef.current = synced;
        setCampaign(synced);
        setIsGmHostSession(true);
        setRole('gm');
        setInLobby(false);
        return true;
      } catch (err) {
        await openAlertDialog(
          `Não foi possível conectar ao servidor local para abrir a campanha. (${String(err)})`,
          'Erro de Conexão'
        );
        return false;
      }
    },
    [resetLocalEphemeralState, setInLobby, setIsGmHostSession, setRole, setServerUrl]
  );

  const deleteSavedCampaign = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/campaigns/${encodeURIComponent(id)}`, { method: 'DELETE' });
        if (!res.ok) {
          await openAlertDialog('Não foi possível excluir a campanha salva.', 'Erro ao Excluir');
          return;
        }
        await refreshSavedCampaigns();
      } catch {
        await openAlertDialog('Erro de conexão ao excluir a campanha.', 'Erro de Conexão');
      }
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
        await openAlertDialog(
          `Não foi possível alcançar o servidor "${base || 'local'}". Verifique o endereço/link da sala e se o Mestre abriu a mesa.`,
          'Servidor Inacessível'
        );
        return;
      }
      resetLocalEphemeralState();
      setMyPlayerName(params.playerName.trim() || 'Aventureiro');
      setMyPlayerColorState(params.playerColor);
      localStorage.setItem('rpg_player_color', params.playerColor);
      setIsGmHostSession(false);
      setRole('player');
      setServerUrl(base);
      serverUrlRef.current = base;
      try {
        const res = await fetch(
          `${base}/api/campaign?role=player&playerId=${encodeURIComponent(myPlayerId)}`
        );
        if (res.ok) {
          const data = (await res.json()) as CampaignState;
          const synced = syncCampaignDerivedCharacterStats(data);
          campaignRef.current = synced;
          setCampaign(synced);
        }
      } catch {
        // socket will sync once connected
      }
      refreshSavedHeroes().catch(() => {});
      setInLobby(false);
    },
    [myPlayerId, refreshSavedHeroes, resetLocalEphemeralState, setInLobby, setIsGmHostSession, setMyPlayerName, setRole, setServerUrl]
  );

  const resetCampaign = useCallback(async () => {
    if (roleRef.current !== 'gm' && !isGmHostSessionRef.current) return;
    resetLocalEphemeralState();
    try {
      const base = serverUrlRef.current || '';
      const res = await fetch(`${base}/api/campaign/reset`, { method: 'POST' });
      if (res.ok) {
        const next = await res.json();
        const synced = syncCampaignDerivedCharacterStats(next);
        campaignRef.current = synced;
        setCampaign(synced);
        return;
      }
    } catch {
      // ignore
    }
    const starter = createStarterCampaign();
    campaignRef.current = starter;
    setCampaign(starter);
  }, [resetLocalEphemeralState]);

  const importCampaign = useCallback(async (next: CampaignState) => {
    if (roleRef.current !== 'gm' && !isGmHostSessionRef.current) return;
    resetLocalEphemeralState();
    try {
      const base = serverUrlRef.current || '';
      const res = await fetch(`${base}/api/campaign/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      if (res.ok) {
        const updated = await res.json();
        const synced = syncCampaignDerivedCharacterStats(updated);
        campaignRef.current = synced;
        setCampaign(synced);
        return;
      }
    } catch {
      // ignore
    }
    const synced = syncCampaignDerivedCharacterStats(next);
    campaignRef.current = synced;
    setCampaign(synced);
  }, [resetLocalEphemeralState]);

  const dismissHandout = useCallback(() => setActiveHandout(null), []);
  const dismissRollOverlay = useCallback(() => setLatestRollForOverlay(null), []);
  const dismissRollToast = useCallback((id: string) => {
    setRecentRollToasts((prev) => prev.filter((r) => r.id !== id));
  }, []);
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
    const safeMsg = maskHiddenNamesInText(message, roleRef.current, campaignRef.current);
    setTacticalAlert({ id, message: safeMsg });
    window.setTimeout(() => {
      setTacticalAlert((curr) => (curr?.id === id ? null : curr));
    }, 4500);
  }, []);
  showTacticalAlertRef.current = showTacticalAlert;

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
        | 'grapple'
        | 'escape-grapple'
        | 'release-grapple'
        | 'ready'
        | 'hide'
        | 'help'
        | 'jump',
      actorTokenId?: string
    ) => {
      const curr = campaignRef.current;
      const viewedIdForManeuver = resolveViewedMapId(
        curr,
        roleRef.current,
        roleRef.current === 'player' ? activeCharRef.current : undefined
      );
      const activeMap =
        (actorTokenId && curr.maps.find((m) => m.tokens.some((t) => t.id === actorTokenId))) ||
        curr.maps.find((m) => m.id === viewedIdForManeuver) ||
        curr.maps.find((m) => m.id === curr.activeMapId);
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
              (explicitToken.type === 'character' &&
                explicitToken.referenceId &&
                cb.type === 'character' &&
                cb.referenceId === explicitToken.referenceId)
          )) ||
        (char && combat.combatants.find((cb) => cb.type === 'character' && cb.referenceId === char.id)) ||
        (roleRef.current === 'gm' ? activeTurnCb : undefined);

      if (!targetCb) {
        showTacticalAlert('Combatente não encontrado no rastreador de iniciativa.');
        return;
      }
      if ((char && char.hp <= 0) || targetCb.hp <= 0) {
        showTacticalAlert(`${targetCb.name} está caído (0 PV) e não pode realizar manobras!`);
        return;
      }
      const actorTokForIncap =
        explicitToken ||
        curr.maps
          .flatMap((m) => m.tokens)
          .find(
            (t) =>
              (targetCb.tokenId && t.id === targetCb.tokenId) ||
              (char && t.type === 'character' && t.referenceId === char.id)
          );
      if (
        actorTokForIncap &&
        isTokenIncapacitated(actorTokForIncap, char, curr.compendium.conditions)
      ) {
        showTacticalAlert(
          `${targetCb.name} está incapacitado (Paralisado/Atordoado/Inconsciente) e não pode realizar manobras!`
        );
        return;
      }

      const isRogueCunningAction = Boolean(
        char && char.classId === 'classe-ladino' && (char.level ?? 1) >= 2
      );

      // D&D 5e Grapple / Escape Grapple / Release Grapple / Ready Action
      if (
        maneuver === 'grapple' ||
        maneuver === 'escape-grapple' ||
        maneuver === 'release-grapple' ||
        maneuver === 'ready'
      ) {
        if (roleRef.current === 'player' && activeTurnCb?.id !== targetCb.id) {
          showTacticalAlert(`Aguarde seu turno (${activeTurnCb?.name || 'outro combatente'}).`);
          return;
        }
        const myTok =
          explicitToken ||
          activeMap?.tokens.find(
            (t) =>
              (targetCb.tokenId && t.id === targetCb.tokenId) ||
              (char && t.type === 'character' && t.referenceId === char.id)
          );
        const actorKind: 'hero' | 'monster' | 'npc' = char
          ? 'hero'
          : myTok?.type === 'npc'
            ? 'npc'
            : 'monster';

        if (maneuver === 'release-grapple') {
          if (!myTok || !activeMap) return;
          const heldTokens = activeMap.tokens.filter((t) => t.grappledByTokenId === myTok.id);
          if (heldTokens.length === 0) {
            showTacticalAlert(`${targetCb.name} não está agarrando nenhum alvo.`);
            return;
          }
          const heldCharIds = new Set(
            heldTokens
              .filter((t) => t.type === 'character' && t.referenceId)
              .map((t) => t.referenceId!)
          );
          const heldTokIds = new Set(heldTokens.map((t) => t.id));
          updateCampaign((prev) => ({
            ...prev,
            characters: prev.characters.map((c) =>
              heldCharIds.has(c.id)
                ? { ...c, activeConditionIds: c.activeConditionIds.filter((id) => id !== 'cond-agarrado') }
                : c
            ),
            maps: prev.maps.map((m) =>
              m.id !== activeMap.id
                ? m
                : {
                    ...m,
                    tokens: m.tokens.map((t) =>
                      heldTokIds.has(t.id)
                        ? {
                            ...t,
                            grappledByTokenId: null,
                            activeConditionIds: (t.activeConditionIds || []).filter(
                              (id) => id !== 'cond-agarrado'
                            ),
                          }
                        : t
                    ),
                  }
            ),
          }));
          pushCombatLog({
            category: 'condition',
            actorName: targetCb.name,
            actorKind,
            actorColor: targetCb.color,
            summary: `soltou ${heldTokens.map((t) => t.name).join(', ')} (Ação Livre)`,
          });
          showTacticalAlert(`${targetCb.name} soltou ${heldTokens.map((t) => t.name).join(', ')}.`);
          return;
        }

        if (maneuver === 'grapple') {
          const hasAtk = targetCb.actionAvailable !== false || (targetCb.extraAttacksRemaining ?? 0) > 0;
          if (!hasAtk) {
            showTacticalAlert(`${targetCb.name} já gastou a Ação Padrão (e Ataques Extras) neste turno!`);
            return;
          }
          if (!myTok) {
            showTacticalAlert(`${targetCb.name} precisa estar no mapa para usar Agarrar!`);
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
            actionTitle: 'Agarrar (Grapple)',
            range: 'Corpo a Corpo (1,5m)',
            actionCost: 'Padrão',
            isGrappleManeuver: true,
            isWeaponAttack: true,
          });
          showTacticalAlert(
            `Clique em um alvo adjacente (1,5m) no mapa para Agarrar com ${char?.name || myTok.name}!`
          );
          return;
        }

        if (maneuver === 'escape-grapple') {
          if (targetCb.actionAvailable === false) {
            showTacticalAlert(`${targetCb.name} já gastou a Ação Padrão neste turno!`);
            return;
          }
          const curConds = char ? char.activeConditionIds : myTok?.activeConditionIds || [];
          if (!curConds.includes('cond-agarrado')) {
            showTacticalAlert(`${targetCb.name} não está Agarrado!`);
            return;
          }
          const grapplerTok =
            myTok?.grappledByTokenId && activeMap
              ? activeMap.tokens.find((t) => t.id === myTok.grappledByTokenId)
              : undefined;
          const grapplerChar =
            grapplerTok?.type === 'character' && grapplerTok.referenceId
              ? curr.characters.find((c) => c.id === grapplerTok.referenceId)
              : undefined;

          const getEscapeBonus = (): number => {
            if (char) {
              const st = computeCharacterStats(char, curr);
              const ath = st.skills['atletismo']?.total ?? st.attributes['for']?.mod ?? 0;
              const acr = st.skills['acrobacia']?.total ?? st.attributes['des']?.mod ?? 0;
              return Math.max(ath, acr);
            }
            if (myTok?.type === 'monster' && myTok.referenceId) {
              const mon = curr.compendium.monsters.find((m) => m.id === myTok.referenceId);
              const strMod = Math.floor(((mon?.attributes?.['for'] ?? 10) - 10) / 2);
              const dexMod = Math.floor(((mon?.attributes?.['des'] ?? 10) - 10) / 2);
              return Math.max(strMod, dexMod);
            }
            return 0;
          };
          const getGrapplerBonus = (): number => {
            if (grapplerChar) {
              const st = computeCharacterStats(grapplerChar, curr);
              return st.skills['atletismo']?.total ?? st.attributes['for']?.mod ?? 0;
            }
            if (grapplerTok?.type === 'monster' && grapplerTok.referenceId) {
              const mon = curr.compendium.monsters.find((m) => m.id === grapplerTok.referenceId);
              return Math.floor(((mon?.attributes?.['for'] ?? 12) - 10) / 2);
            }
            return 2;
          };

          const escRoll = evaluateFormula(`1d20 + ${getEscapeBonus()}`);
          const oppRoll = grapplerTok ? evaluateFormula(`1d20 + ${getGrapplerBonus()}`) : null;
          const escaped = oppRoll
            ? escRoll.isCrit
              ? !oppRoll.isCrit || escRoll.total >= oppRoll.total
              : oppRoll.isCrit
                ? false
                : escRoll.isFumble
                  ? false
                  : oppRoll.isFumble
                    ? true
                    : escRoll.total >= oppRoll.total
            : escRoll.isCrit || (!escRoll.isFumble && escRoll.total >= 12);

          updateCampaign((prev) => ({
            ...prev,
            characters:
              escaped && char
                ? prev.characters.map((c) =>
                    c.id === char.id
                      ? { ...c, activeConditionIds: c.activeConditionIds.filter((id) => id !== 'cond-agarrado') }
                      : c
                  )
                : prev.characters,
            maps:
              escaped && myTok && activeMap
                ? prev.maps.map((m) =>
                    m.id !== activeMap.id
                      ? m
                      : {
                          ...m,
                          tokens: m.tokens.map((t) =>
                            t.id === myTok.id
                              ? {
                                  ...t,
                                  grappledByTokenId: null,
                                  activeConditionIds: (t.activeConditionIds || []).filter(
                                    (id) => id !== 'cond-agarrado'
                                  ),
                                }
                              : t
                          ),
                        }
                  )
                : prev.maps,
            combat: {
              ...prev.combat,
              combatants: prev.combat.combatants.map((cb) =>
                cb.id === targetCb.id ? consumeCombatantEconomy(cb, 'Padrão') : cb
              ),
            },
          }));

          const detailTxt = oppRoll
            ? `${escaped ? 'ESCAPOU!' : 'CONTINUA AGARRADO!'} (${escRoll.total} vs ${grapplerTok?.name} ${oppRoll.total})`
            : `${escaped ? 'ESCAPOU!' : 'CONTINUA AGARRADO!'} (${escRoll.total} vs CD 12)`;
          sendRoll({
            rollerName: targetCb.name,
            rollerRole: roleRef.current,
            rollerColor: targetCb.color,
            diceSkin: (char?.diceSkin || 'gold') as DiceSkin,
            title: 'Escapar de Agarrado (Atletismo/Acrobacia)',
            formula: escRoll.resolvedFormula,
            individualRolls: escRoll.individualRolls,
            rolledDice: escRoll.rolledDice,
            d20Natural: escRoll.d20Natural,
            total: escRoll.total,
            isCrit: escRoll.isCrit,
            isFumble: escRoll.isFumble,
            isSecret: false,
            details: detailTxt,
          });
          pushCombatLog({
            category: 'condition',
            actorName: targetCb.name,
            actorKind,
            actorColor: targetCb.color,
            summary: escaped
              ? `escapou de Agarrado! (${escRoll.total}${oppRoll ? ` vs ${oppRoll.total}` : ' vs CD 12'})`
              : `tentou escapar de Agarrado e falhou (${escRoll.total}${oppRoll ? ` vs ${oppRoll.total}` : ' vs CD 12'})`,
          });
          showTacticalAlert(detailTxt);
          return;
        }

        if (maneuver === 'ready') {
          if (targetCb.actionAvailable === false) {
            showTacticalAlert(`${targetCb.name} já gastou a Ação Padrão neste turno!`);
            return;
          }
          if (targetCb.reactionAvailable === false) {
            showTacticalAlert(`${targetCb.name} não possui Reação disponível nesta rodada para disparar uma Ação Preparada!`);
            return;
          }
          void (async () => {
            const trigger = await openTextPrompt('Preparar Ação (D&D 5e)', '', {
              description:
                'Gasta sua Ação Padrão agora. Fora do seu turno, seus ataques e habilidades Padrão ficarão liberados para disparar gastando sua Reação.',
              placeholder: 'Gatilho opcional (ex: Se o inimigo passar pela porta)...',
              confirmLabel: 'Preparar Ação',
            });
            if (trigger === null) return;
            const cleanTrigger = trigger.trim();
            updateCampaign((prev) => ({
              ...prev,
              combat: {
                ...prev.combat,
                combatants: prev.combat.combatants.map((cb) =>
                  cb.id === targetCb.id
                    ? {
                        ...consumeCombatantEconomy(cb, 'Padrão'),
                        readyAction: {
                          trigger: cleanTrigger || undefined,
                          preparedAtRound: prev.combat.round,
                        },
                      }
                    : cb
                ),
              },
            }));
            soundEngine.playSfxPreset('shield');
            pushCombatLog({
              category: 'system',
              actorName: targetCb.name,
              actorKind,
              actorColor: targetCb.color,
              summary: cleanTrigger
                ? `preparou uma Ação (Gatilho: "${cleanTrigger}") — pronta p/ Reação fora do turno!`
                : 'preparou uma Ação — pronta p/ disparar como Reação fora do turno!',
            });
            showTacticalAlert(
              `${targetCb.name} está com Ação Preparada! Fora do turno, clique num ataque/magia Padrão para usar sua Reação.`
            );
          })();
          return;
        }
      }

      // BG3 / D&D 5e Universal Maneuvers: Shove, Hide, Help, Jump
      if (maneuver === 'shove' || maneuver === 'hide' || maneuver === 'help' || maneuver === 'jump') {
        const isBonus =
          maneuver === 'shove' ||
          maneuver === 'jump' ||
          (maneuver === 'hide' && isRogueCunningAction);
        if (isBonus && targetCb.bonusActionAvailable === false) {
          showTacticalAlert(`${targetCb.name} já gastou a Ação Bônus neste turno!`);
          return;
        }
        if (!isBonus && targetCb.actionAvailable === false) {
          showTacticalAlert(`${targetCb.name} já gastou a Ação Padrão neste turno!`);
          return;
        }
        if (roleRef.current === 'player' && activeTurnCb?.id !== targetCb.id) {
          showTacticalAlert(`Aguarde seu turno (${activeTurnCb?.name || 'outro combatente'}).`);
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

        const maneuverActorKind: 'hero' | 'monster' | 'npc' = char
          ? 'hero'
          : myTok?.type === 'npc'
            ? 'npc'
            : 'monster';

        if (maneuver === 'hide') {
          const hideCost: ActionEconomyCost = isRogueCunningAction ? 'Bônus' : 'Padrão';
          const sqM = curr.settings.gridSquareMeters || 1.5;

          // D&D 5e Hide Rule: cannot hide while an aware hostile enemy is adjacent or has unobstructed LoS in open light
          if (myTok && activeMap) {
            const effTerrain = getEffectiveTerrainCells(activeMap);
            const hasNearbyCoverOrWall = (() => {
              const sz = Math.max(1, myTok.size || 1);
              for (let x = myTok.x - 1; x <= myTok.x + sz; x++) {
                for (let y = myTok.y - 1; y <= myTok.y + sz; y++) {
                  const tk = effTerrain[`${x},${y}`];
                  if (tk === 'cover' || tk === 'wall') return true;
                }
              }
              return false;
            })();
            const isInDarkness = Boolean(activeMap.darknessEnabled);
            const awareHostiles = activeMap.tokens.filter((other) => {
              if (other.id === myTok.id || other.hp <= 0 || other.isHidden) return false;
              if (!isTokenHostileTo(myTok, other, curr.npcs)) return false;
              const otherChar =
                other.type === 'character' && other.referenceId
                  ? curr.characters.find((c) => c.id === other.referenceId)
                  : undefined;
              return !isTokenIncapacitated(other, otherChar, curr.compendium.conditions);
            });

            const adjacentSpotter = awareHostiles.find((other) => {
              const distSq = getGridSpanDistance(
                myTok.x,
                myTok.y,
                myTok.size,
                other.x,
                other.y,
                other.size,
                sqM
              ).squares;
              if (distSq > 1) return false;
              return !evaluateLineOfSightAndCover(activeMap, other, myTok, false).blockedByWall;
            });
            if (adjacentSpotter) {
              showTacticalAlert(
                `Não é possível Esconder! ${adjacentSpotter.name} está adjacente (1,5m) vendo você.`
              );
              return;
            }

            if (!hasNearbyCoverOrWall && !isInDarkness) {
              const openSpotter = awareHostiles.find(
                (other) => !evaluateLineOfSightAndCover(activeMap, other, myTok, false).blockedByWall
              );
              if (openSpotter) {
                showTacticalAlert(
                  `Sem cobertura! ${openSpotter.name} tem linha de visão limpa — fique atrás de parede/cobertura ou no escuro para se Esconder.`
                );
                return;
              }
            }
          }

          // Real D&D 5e Stealth: compare roll individually against EVERY hostile creature's Passive Perception!
          const hostileObservers: Array<{ token: MapToken; pp: number }> = [];
          if (myTok && activeMap) {
            for (const other of activeMap.tokens) {
              if (other.id === myTok.id || other.hp <= 0 || other.isHidden) continue;
              if (!isTokenHostileTo(myTok, other, curr.npcs)) continue;
              hostileObservers.push({ token: other, pp: getTokenPassivePerception(other, curr) });
            }
          }

          const monDef =
            !char && myTok?.type === 'monster' && myTok.referenceId
              ? curr.compendium.monsters.find((m) => m.id === myTok.referenceId)
              : undefined;
          const monDexMod = monDef
            ? Math.floor(((monDef.attributes?.des ?? monDef.attributes?.DES ?? 12) - 10) / 2)
            : 2;
          const stealthBonus = stats?.skills['furtividade']?.total ?? monDexMod;
          const extraStealthDice = stats?.skills['furtividade']?.diceBonuses || [];
          const stealthFormula = `1d20 ${stealthBonus >= 0 ? `+ ${stealthBonus}` : `- ${Math.abs(stealthBonus)}`}${
            extraStealthDice.length > 0 ? ` + ${extraStealthDice.join(' + ')}` : ''
          }`;

          openManualRoll({
            title: `Esconder-se / Furtividade (${hideCost})`,
            subtitle:
              hostileObservers.length > 0
                ? `Comparado à Percepção Passiva de ${hostileObservers.length} inimigo(s)`
                : 'Define seu valor de Furtividade no token',
            formula: stealthFormula,
            displayFormula: stealthFormula,
            previewDice: buildPreviewDiceForFormula(stealthFormula, advantageMode),
            rollerName: targetCb.name,
            rollerColor: targetCb.color,
            diceSkin: (char?.diceSkin || 'gold') as DiceSkin,
            allowAdvantageToggle: true,
            advantageMode,
            onExecute: (chosenMode) => {
              const roll = evaluateFormula(stealthFormula, stats, char, {
                advantageMode: chosenMode,
              });
              const hiddenFrom = hostileObservers.filter((o) => roll.total > o.pp);
              const spottedBy = hostileObservers.filter((o) => roll.total <= o.pp);
              const hideValue = roll.total;

              updateCampaign((prev) => ({
                ...prev,
                maps: myTok
                  ? prev.maps.map((m) =>
                      m.id !== activeMap?.id
                        ? m
                        : {
                            ...m,
                            tokens: m.tokens.map((t) =>
                              t.id === myTok.id ? { ...t, stealthTotal: hideValue } : t
                            ),
                          }
                    )
                  : prev.maps,
                combat: {
                  ...prev.combat,
                  combatants: prev.combat.combatants.map((cb) =>
                    cb.id === targetCb.id ? consumeCombatantEconomy(cb, hideCost) : cb
                  ),
                },
              }));

              // Never leak enemy names or Passive Perception (PP) values in public rolls/combat logs!
              const publicStealthSummary =
                hostileObservers.length > 0
                  ? hiddenFrom.length > 0
                    ? `Oculto de ${hiddenFrom.length}/${hostileObservers.length} inimigo(s) no mapa`
                    : 'Inimigos atentos perceberam o movimento'
                  : `Valor de Furtividade ${hideValue} gravado no token`;

              sendRoll({
                rollerName: targetCb.name,
                rollerRole: roleRef.current,
                rollerColor: targetCb.color,
                diceSkin: (char?.diceSkin || 'gold') as DiceSkin,
                title: `Esconder-se / Furtividade (${hideCost})`,
                formula: roll.resolvedFormula,
                individualRolls: roll.individualRolls,
                rolledDice: roll.rolledDice,
                d20Natural: roll.d20Natural,
                total: roll.total,
                isCrit: roll.isCrit,
                isFumble: roll.isFumble,
                isSecret: false,
                details: `Furtivo: ${hideValue} — ${publicStealthSummary} (Vantagem automática contra quem não percebeu).`,
              });
              pushCombatLog({
                category: 'condition',
                actorName: targetCb.name,
                actorKind: maneuverActorKind,
                actorColor: targetCb.color,
                summary: `usou Esconder-se (Furtivo: ${hideValue}) — ${publicStealthSummary}`,
              });
              showTacticalAlert(
                `Furtivo: ${hideValue}${
                  hiddenFrom.length > 0
                    ? ` • Oculto de ${hiddenFrom.length}/${hostileObservers.length} inimigo(s)!`
                    : spottedBy.length > 0
                      ? ' • Inimigos atentos perceberam!'
                      : ''
                }`
              );
            },
          });
          return;
        }

        if (maneuver === 'help') {
          const isEnemyHelper = maneuverActorKind === 'monster';
          const adjAlly = !isEnemyHelper
            ? curr.characters.find((c) => {
                if (char && c.id === char.id) return false;
                if (c.hp <= 0) return false;
                const allyTok = activeMap?.tokens.find(
                  (t) => t.type === 'character' && t.referenceId === c.id
                );
                if (!allyTok || !myTok) return true;
                return (
                  getGridSpanDistance(
                    myTok.x,
                    myTok.y,
                    myTok.size,
                    allyTok.x,
                    allyTok.y,
                    allyTok.size,
                    1.5
                  ).squares <= 2
                );
              })
            : undefined;
          const adjMonsterAlly =
            isEnemyHelper && myTok && activeMap
              ? activeMap.tokens.find(
                  (t) =>
                    t.id !== myTok.id &&
                    t.type === 'monster' &&
                    t.hp > 0 &&
                    getGridSpanDistance(
                      myTok.x,
                      myTok.y,
                      myTok.size,
                      t.x,
                      t.y,
                      t.size,
                      1.5
                    ).squares <= 2
                )
              : undefined;
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
                cb.id === targetCb.id ? consumeCombatantEconomy(cb, 'Padrão') : cb
              ),
            },
          }));
          pushCombatLog({
            category: 'system',
            actorName: targetCb.name,
            actorKind: maneuverActorKind,
            actorColor: targetCb.color,
            targetName: adjAlly?.name || adjMonsterAlly?.name,
            targetKind: adjAlly ? 'hero' : adjMonsterAlly ? 'monster' : undefined,
            summary: adjAlly
              ? 'usou Ajudar (concedeu Vantagem no próximo ataque) para'
              : adjMonsterAlly
                ? 'usou Ajudar (distraiu alvo para conceder Vantagem) a favor de'
                : 'usou Ajudar (próximo teste de aliado adjacente tem Vantagem)',
          });
          showTacticalAlert(
            adjAlly
              ? `${targetCb.name} ajudou ${adjAlly.name} (+Vantagem no próximo ataque)!`
              : adjMonsterAlly
                ? `${targetCb.name} ajudou ${adjMonsterAlly.name} (+Vantagem no próximo ataque)!`
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
                      ...consumeCombatantEconomy(cb, 'Bônus'),
                      remainingMoveMeters: (cb.remainingMoveMeters ?? cb.speedMeters ?? 9) + 3,
                    }
                  : cb
              ),
            },
          }));
          pushCombatLog({
            category: 'system',
            actorName: targetCb.name,
            actorKind: maneuverActorKind,
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

      const isRogueBonusManeuver =
        (maneuver === 'disengage' || maneuver === 'dash') &&
        char?.classId === 'classe-ladino' &&
        (char?.level ?? 1) >= 2;

      if (maneuver === 'action-surge') {
        if (char) {
          const isFighter2Plus =
            (char.classId === 'classe-guerreiro' ||
              /guerreiro|fighter/i.test(
                curr.compendium.classes.find((cl) => cl.id === char.classId)?.name || ''
              )) &&
            (char.level ?? 1) >= 2;
          if (!isFighter2Plus && roleRef.current !== 'gm') {
            showTacticalAlert('Surto de Ação exige Guerreiro nível 2+!');
            return;
          }
        }
        if (char?.actionSurgeUsed || targetCb.actionSurgeUsed) {
          showTacticalAlert('Surto de Ação já foi usado! Recarrega em Descanso Curto ou Longo.');
          return;
        }
        updateCampaign((prev) => ({
          ...prev,
          characters: char
            ? prev.characters.map((c) => (c.id === char.id ? { ...c, actionSurgeUsed: true } : c))
            : prev.characters,
          combat: {
            ...prev.combat,
            combatants: prev.combat.combatants.map((cb) =>
              cb.id === targetCb.id
                ? {
                    ...cb,
                    actionsRemaining: getCombatantActionsRemaining(cb) + 1,
                    actionAvailable: true,
                    actionSurgeUsed: true,
                  }
                : cb
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

      if (isRogueBonusManeuver) {
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
              ...consumeCombatantEconomy(cb, isRogueBonusManeuver ? 'Bônus' : 'Padrão'),
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
          title: isRogueBonusManeuver ? 'Disparada (Ação Ardilosa)' : 'Disparada (Dash)',
          details: `${targetCb.name} dobrou seu deslocamento restante (+${targetCb.speedMeters ?? 9}m).`,
        },
        disengage: {
          title: isRogueBonusManeuver ? 'Desengajar (Ação Ardilosa)' : 'Desengajar',
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
        formula: isRogueBonusManeuver ? 'Ação Bônus' : 'Ação Padrão',
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
      const viewedIdForDuel = resolveViewedMapId(
        currCampaign,
        roleRef.current,
        roleRef.current === 'player' ? choice.attackerCharacterId || activeCharRef.current : undefined
      );
      const activeMap =
        currCampaign.maps.find((m) => m.id === viewedIdForDuel) ||
        currCampaign.maps.find((m) => m.id === currCampaign.activeMapId);
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

      // 1. Dead / 0 HP Attacker Guard & Incapacitated Condition Guard (Heroes AND Summons/Monsters!)
      if ((char && char.hp <= 0) || (attackerToken && attackerToken.hp <= 0)) {
        setPendingAttackChoice(null);
        showTacticalAlert(
          `${choice.attackerName} está caído (0 PV) e não pode atacar!`
        );
        return;
      }
      const atkCondIds = char?.activeConditionIds || attackerToken?.activeConditionIds || [];
      const atkIncapCond = atkCondIds
        .map((cid) => currCampaign.compendium.conditions.find((c) => c.id === cid))
        .find(
          (c) =>
            c &&
            /paralisad|atordoad|petrificad|inconscient|incapacitad/i.test(c.name)
        );
      if (atkIncapCond && roleRef.current === 'player') {
        setPendingAttackChoice(null);
        showTacticalAlert(
          `${choice.attackerName} está ${atkIncapCond.icon} ${atkIncapCond.name} e não pode agir!`
        );
        return;
      }

      // 2. Self-Attack Guard (prevent attacking own token unless healing, self-range, or condition-only)
      const hasAttackOrDamageFormula = Boolean(
        choice.attackFormula?.trim() || choice.damageFormula?.trim()
      );
      const isHealingAction = Boolean(
        choice.damageFormula?.trim() && choice.damageType?.toLowerCase() === 'cura'
      );
      const isConditionOnlyAction = Boolean(
        !hasAttackOrDamageFormula && !choice.saveSkillId && choice.applyConditionId
      );
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

      // 3. 3D Range Validation (horizontal grid + vertical elevation in meters!)
      if (
        choice.actionCost !== 'Reação' &&
        attackerToken &&
        attackerToken.id !== defenderToken.id
      ) {
        const sqM = currCampaign.settings.gridSquareMeters || 1.5;
        const maxSq = parseAttackRangeSquares(choice.range, choice.actionTitle, sqM);
        const maxRangeMeters = Math.round(maxSq * sqM * 10) / 10;
        const dist3D = getToken3DDistance(attackerToken, defenderToken, sqM);
        if (dist3D.squares3D > maxSq) {
          const elevNote =
            dist3D.verticalMeters > 0 ? ` (diferença de altura: ${dist3D.verticalMeters}m)` : '';
          showTacticalAlert(
            `Alvo fora de alcance! ${defenderToken.name} está a ${dist3D.meters3D}m${elevNote}, mas "${choice.actionTitle}" alcança até ${maxRangeMeters}m (${maxSq} quad.).`
          );
          return;
        }
      }

      // 4. Action Economy Validation (always cross-check ability definition so Bonus abilities NEVER spend Standard Action!)
      const matchedAbilityForDuelCost =
        char?.customAbilities?.find(
          (ab) => normalizeAbilityKey(ab.name) === normalizeAbilityKey(choice.actionTitle)
        ) ||
        currCampaign.compendium.abilities.find(
          (ab) => normalizeAbilityKey(ab.name) === normalizeAbilityKey(choice.actionTitle)
        );
      const rawPassedDuelCost = normalizeActionEconomyCost(choice.actionCost);
      const actionCost: ActionEconomyCost =
        rawPassedDuelCost !== 'Reação' && matchedAbilityForDuelCost?.actionType
          ? normalizeActionEconomyCost(matchedAbilityForDuelCost.actionType)
          : rawPassedDuelCost;
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

      if (combat.active && !attackerCb && roleRef.current === 'player' && actionCost !== 'Livre') {
        setPendingAttackChoice(null);
        showTacticalAlert(
          activeTurnCb
            ? `Aguarde seu turno! Turno atual: ${activeTurnCb.name}.`
            : 'Seu personagem ainda não está na fila de iniciativa.'
        );
        return;
      }

      const isReadyTriggerDuel = Boolean(
        combat.active &&
          attackerCb &&
          (choice.isReadyReactionTrigger ||
            (actionCost === 'Padrão' &&
              attackerCb.readyAction &&
              attackerCb.reactionAvailable !== false &&
              activeTurnCb &&
              activeTurnCb.id !== attackerCb.id))
      );
      const hasExtraAtkSlotDuel = Boolean(
        combat.active &&
          attackerCb &&
          choice.isWeaponAttack &&
          actionCost === 'Padrão' &&
          (attackerCb.extraAttacksRemaining ?? 0) > 0
      );

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
          !isReadyTriggerDuel &&
          activeTurnCb &&
          activeTurnCb.id !== attackerCb.id
        ) {
          showTacticalAlert(`Aguarde seu turno! Turno atual: ${activeTurnCb.name}.`);
          return;
        }
        if (
          actionCost === 'Padrão' &&
          !isReadyTriggerDuel &&
          !hasExtraAtkSlotDuel &&
          attackerCb.actionAvailable === false
        ) {
          showTacticalAlert(`${attackerCb.name} já gastou a Ação Padrão neste turno!`);
          return;
        }
        if (actionCost === 'Bônus' && attackerCb.bonusActionAvailable === false) {
          showTacticalAlert(`${attackerCb.name} já gastou a Ação Bônus neste turno!`);
          return;
        }
        if (
          (actionCost === 'Reação' || isReadyTriggerDuel) &&
          attackerCb.reactionAvailable === false
        ) {
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
        if (evaluateLineOfSightAndCover(activeMap, attackerToken, defenderToken, false).blockedByWall) {
          showTacticalAlert('Uma parede ou porta fechada impede Empurrar este alvo!');
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
        const shoveSucceeded = atkRoll.isCrit
          ? !defRoll.isCrit || atkRoll.total >= defRoll.total
          : defRoll.isCrit
            ? false
            : atkRoll.isFumble
              ? false
              : defRoll.isFumble
                ? true
                : atkRoll.total >= defRoll.total;

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
        const effShoveTerrain = getEffectiveTerrainCells(activeMap);
        const effShoveWallMeta = getEffectiveWallMeta(activeMap);
        const stepBlockedByWall =
          stepX !== 0 || stepY !== 0
            ? (() => {
                const sz = Math.max(1, defenderToken.size || 1);
                for (let ox = 0; ox < sz; ox++) {
                  for (let oy = 0; oy < sz; oy++) {
                    if (
                      doesStepCrossWall(
                        effShoveTerrain,
                        effShoveWallMeta,
                        defenderToken.x + ox,
                        defenderToken.y + oy,
                        pushX + ox,
                        pushY + oy
                      )
                    ) {
                      return true;
                    }
                  }
                }
                return false;
              })()
            : true;
        const blockedByObstacle =
          (pushX === defenderToken.x && pushY === defenderToken.y) ||
          stepBlockedByWall ||
          doesTokenCollideAt(
            activeMap.tokens,
            pushX,
            pushY,
            defenderToken.size,
            defenderToken.id,
            true,
            effShoveTerrain,
            effShoveWallMeta
          );
        const actuallyMoved = shoveSucceeded && !blockedByObstacle;
        const shouldAutoStartShoveCombat = !combat.active && !isSelfTarget;
        let shoveTurnedHostile: string[] = [];

        updateCampaign((prev) => {
          const flipped = flipAttackedNpcsToHostile(prev, [defenderToken]);
          shoveTurnedHostile = flipped.turnedHostileNames;
          const base = flipped.nextState;
          return {
            ...base,
            combat:
              base.combat.active && attackerCb
                ? {
                    ...base.combat,
                    combatants: base.combat.combatants.map((cb) =>
                      cb.id === attackerCb.id ? consumeCombatantEconomy(cb, 'Bônus') : cb
                    ),
                  }
                : base.combat,
            maps: actuallyMoved
              ? base.maps.map((m) =>
                  m.id !== activeMap.id
                    ? m
                    : {
                        ...m,
                        tokens: m.tokens.map((t) =>
                          t.id === defenderToken.id ? { ...t, x: pushX, y: pushY } : t
                        ),
                      }
                )
              : base.maps,
          };
        });

        shoveTurnedHostile.forEach((npcName) => {
          pushCombatLog({
            category: 'system',
            actorName: npcName,
            actorKind: 'npc',
            actorColor: '#ef4444',
            summary: 'tornou-se Hostil ao ser atacado!',
          });
        });

        if (shouldAutoStartShoveCombat) {
          window.setTimeout(() => {
            startCombatFromMapRef.current?.({
              openingAttacker: {
                tokenId: attackerToken.id,
                characterId: choice.attackerCharacterId,
                actionCost: 'Bônus',
              },
              reason: `${choice.attackerName} empurrou ${defenderToken.name}`,
            });
          }, 520);
        }

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
          diceSkin: choice.diceSkin || 'gold',
          title: `Empurrar (Força/Atletismo) → ${defenderToken.name}`,
          formula: atkRoll.resolvedFormula,
          individualRolls: atkRoll.individualRolls,
          rolledDice: atkRoll.rolledDice,
          d20Natural: atkRoll.d20Natural,
          total: atkRoll.total,
          isCrit: atkRoll.isCrit,
          isFumble: atkRoll.isFumble,
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

      // 4.0B D&D 5e Targeted Grapple (Agarrar): Size limit + Opposed Athletics vs Athletics/Acrobatics + tracks grappledByTokenId!
      if (choice.isGrappleManeuver) {
        if (!attackerToken || !activeMap) {
          showTacticalAlert('Token do atacante não encontrado no mapa.');
          return;
        }
        if (defenderToken.id === attackerToken.id) {
          showTacticalAlert('Você não pode agarrar a si mesmo.');
          return;
        }
        if (defenderToken.hp <= 0) {
          showTacticalAlert(`${defenderToken.name} já está caído (0 PV).`);
          return;
        }
        const distGrapSq = getToken3DDistance(
          attackerToken,
          defenderToken,
          currCampaign.settings.gridSquareMeters || 1.5
        ).squares3D;
        if (distGrapSq > 1) {
          showTacticalAlert(
            `Alvo fora de alcance! Agarrar exige estar adjacente (1,5m, mesma altura) a ${defenderToken.name}.`
          );
          return;
        }
        if (evaluateLineOfSightAndCover(activeMap, attackerToken, defenderToken, false).blockedByWall) {
          showTacticalAlert('Uma parede ou porta fechada impede Agarrar este alvo!');
          return;
        }
        const getGrapSizeTier = (tok: MapToken): number => {
          if (tok.type === 'monster' && tok.referenceId) {
            const mon = currCampaign.compendium.monsters.find((m) => m.id === tok.referenceId);
            if (mon?.size === 'Pequeno' || mon?.size === 'Médio') return 1;
            if (mon?.size === 'Grande') return 2;
            if (mon?.size === 'Enorme') return 3;
            if (mon?.size === 'Colossal') return 4;
          }
          return Math.max(1, tok.size || 1);
        };
        if (getGrapSizeTier(defenderToken) >= getGrapSizeTier(attackerToken) + 2) {
          showTacticalAlert(
            `Alvo grande demais! ${choice.attackerName} não consegue agarrar ${defenderToken.name} (2+ categorias de tamanho maior).`
          );
          return;
        }
        const atkAth = char
          ? (() => {
              const st = computeCharacterStats(char, currCampaign);
              return st.skills['atletismo']?.total ?? st.attributes['for']?.mod ?? 0;
            })()
          : attackerToken.type === 'monster' && attackerToken.referenceId
            ? Math.floor(
                ((currCampaign.compendium.monsters.find((m) => m.id === attackerToken.referenceId)
                  ?.attributes?.['for'] ?? 12) -
                  10) /
                  2
              )
            : 1;
        const defBest =
          defenderToken.type === 'character' && defenderToken.referenceId
            ? (() => {
                const dCh = currCampaign.characters.find((c) => c.id === defenderToken.referenceId);
                if (!dCh) return 0;
                const st = computeCharacterStats(dCh, currCampaign);
                return Math.max(
                  st.skills['atletismo']?.total ?? st.attributes['for']?.mod ?? 0,
                  st.skills['acrobacia']?.total ?? st.attributes['des']?.mod ?? 0
                );
              })()
            : defenderToken.type === 'monster' && defenderToken.referenceId
              ? (() => {
                  const mon = currCampaign.compendium.monsters.find(
                    (m) => m.id === defenderToken.referenceId
                  );
                  return Math.max(
                    Math.floor(((mon?.attributes?.['for'] ?? 10) - 10) / 2),
                    Math.floor(((mon?.attributes?.['des'] ?? 10) - 10) / 2)
                  );
                })()
              : 0;

        const atkRoll = evaluateFormula(`1d20 + ${atkAth}`);
        const defRoll = evaluateFormula(`1d20 + ${defBest}`);
        const grappleSucceeded = atkRoll.isCrit
          ? !defRoll.isCrit || atkRoll.total >= defRoll.total
          : defRoll.isCrit
            ? false
            : atkRoll.isFumble
              ? false
              : defRoll.isFumble
                ? true
                : atkRoll.total >= defRoll.total;

        const attacksPerAct = getCharacterAttacksPerAction(char);
        let grapTurnedHostile: string[] = [];

        updateCampaign((prev) => {
          const flipped = flipAttackedNpcsToHostile(prev, [defenderToken]);
          grapTurnedHostile = flipped.turnedHostileNames;
          const base = flipped.nextState;
          return {
            ...base,
            characters:
              grappleSucceeded && defenderToken.type === 'character' && defenderToken.referenceId
                ? base.characters.map((c) =>
                    c.id === defenderToken.referenceId && !c.activeConditionIds.includes('cond-agarrado')
                      ? { ...c, activeConditionIds: [...c.activeConditionIds, 'cond-agarrado'] }
                      : c
                  )
                : base.characters,
            maps: grappleSucceeded
              ? base.maps.map((m) =>
                  m.id !== activeMap.id
                    ? m
                    : {
                        ...m,
                        tokens: m.tokens.map((t) =>
                          t.id === defenderToken.id
                            ? {
                                ...t,
                                grappledByTokenId: attackerToken.id,
                                activeConditionIds: (t.activeConditionIds || []).includes('cond-agarrado')
                                  ? t.activeConditionIds
                                  : [...(t.activeConditionIds || []), 'cond-agarrado'],
                              }
                            : t
                        ),
                      }
                )
              : base.maps,
            combat:
              base.combat.active && attackerCb
                ? {
                    ...base.combat,
                    combatants: base.combat.combatants.map((cb) =>
                      cb.id === attackerCb.id
                        ? consumeCombatantEconomy(cb, 'Padrão', {
                            isWeaponAttack: true,
                            attacksPerAction: attacksPerAct,
                            isReadyReaction: isReadyTriggerDuel,
                          })
                        : cb
                    ),
                  }
                : base.combat,
          };
        });

        grapTurnedHostile.forEach((npcName) => {
          pushCombatLog({
            category: 'system',
            actorName: npcName,
            actorKind: 'npc',
            actorColor: '#ef4444',
            summary: 'tornou-se Hostil ao ser agarrado!',
          });
        });

        playSyncedAbilitySfx({
          explicitSfxPreset: grappleSucceeded ? 'shield' : 'sword',
          title: 'Agarrar',
        });
        triggerSlashVfx(defenderToken.id, grappleSucceeded ? 'hit' : 'block');

        const outcomeText = grappleSucceeded
          ? `AGARROU ${defenderToken.name}! (Atletismo ${atkRoll.total} vs ${defRoll.total} • deslocamento 0m)`
          : `${defenderToken.name} ESCAPOU DA TENTATIVA! (Atletismo ${atkRoll.total} vs ${defRoll.total})`;

        sendRoll({
          rollerName: choice.attackerName,
          rollerRole: roleRef.current,
          rollerColor: choice.attackerColor,
          diceSkin: choice.diceSkin || 'gold',
          title: `Agarrar (Atletismo) → ${defenderToken.name}`,
          formula: atkRoll.resolvedFormula,
          individualRolls: atkRoll.individualRolls,
          rolledDice: atkRoll.rolledDice,
          d20Natural: atkRoll.d20Natural,
          total: atkRoll.total,
          isCrit: atkRoll.isCrit,
          isFumble: atkRoll.isFumble,
          isSecret: false,
          details: outcomeText,
        });
        pushCombatLog({
          category: 'condition',
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
          summary: grappleSucceeded
            ? `agarrou (${atkRoll.total} vs ${defRoll.total})`
            : `tentou agarrar e falhou (${atkRoll.total} vs ${defRoll.total}) em`,
        });
        showTacticalAlert(outcomeText);
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
        const matchedCustomUlt = char?.customAbilities?.find(
          (ab) => normalizeAbilityKey(ab.name) === normalizeAbilityKey(choice.actionTitle)
        );
        const isUltAct = Boolean(
          choice.isUltimate ||
            choice.isDomainExpansion ||
            matchedCustomUlt?.isUltimate ||
            matchedCustomUlt?.isDomainExpansion ||
            matchingAbilityDef?.isUltimate ||
            matchingAbilityDef?.isDomainExpansion
        );
        if (isUltAct) {
          triggerUltimateCutInRef.current?.({
            actorName: choice.attackerName,
            techniqueName: choice.actionTitle,
            catchphrase:
              choice.ultimateCatchphrase ||
              matchedCustomUlt?.ultimateCatchphrase ||
              matchingAbilityDef?.ultimateCatchphrase,
            color:
              choice.ultimateColor ||
              matchedCustomUlt?.ultimateColor ||
              matchingAbilityDef?.ultimateColor ||
              choice.attackerColor,
            portraitUrl:
              choice.ultimateImageUrl ||
              matchedCustomUlt?.ultimateImageUrl ||
              matchingAbilityDef?.ultimateImageUrl ||
              matchingAbilityDef?.imageUrl ||
              char?.portraitUrl ||
              choice.attackerImageUrl,
            style:
              choice.ultimateStyle ||
              matchedCustomUlt?.ultimateStyle ||
              matchingAbilityDef?.ultimateStyle,
            sfxPreset:
              choice.ultimateSfxPreset ||
              matchedCustomUlt?.ultimateSfxPreset ||
              matchingAbilityDef?.ultimateSfxPreset,
            sfxUrl:
              choice.ultimateSfxUrl ||
              matchedCustomUlt?.ultimateSfxUrl ||
              matchingAbilityDef?.ultimateSfxUrl,
            activateDomain: Boolean(
              choice.isDomainExpansion ||
                matchedCustomUlt?.isDomainExpansion ||
                matchingAbilityDef?.isDomainExpansion
            ),
            domainTheme:
              choice.domainTheme ||
              matchedCustomUlt?.domainTheme ||
              matchingAbilityDef?.domainTheme ||
              'sonic',
            domainDurationRounds:
              choice.domainDurationRounds ||
              matchedCustomUlt?.domainDurationRounds ||
              matchingAbilityDef?.domainDurationRounds,
            domainMusicUrl:
              choice.domainMusicUrl ||
              matchedCustomUlt?.domainMusicUrl ||
              matchingAbilityDef?.domainMusicUrl,
            domainMapId: activeMap?.id,
            casterCharacterId: char?.id,
            casterTokenId: attackerToken?.id,
          });
        }
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

        // Line of Sight (Walls/Closed Doors) enforced BEFORE Sections 4A, 4B, 4C AND Attack Duels (skipping self-target)!
        const sqMetersVal = currCampaign.settings.gridSquareMeters || 1.5;
        const isRangedForLos =
          actionCost !== 'Reação' &&
          parseAttackRangeMeters(choice.range, choice.actionTitle) > sqMetersVal + 0.05;
        const losResult =
          !isSelfTarget && activeMap && attackerToken
            ? evaluateLineOfSightAndCover(activeMap, attackerToken, defenderToken, isRangedForLos)
            : { blockedByWall: false, coverAcBonus: 0, coverLabel: null };
        if (losResult.blockedByWall) {
          showTacticalAlert(
            `Alvo sem linha de visão! Uma parede ou porta fechada bloqueia "${choice.actionTitle}" contra ${defenderToken.name}.`
          );
          return;
        }
        const isSpellAction = Boolean(
          matchingAbilityDef?.category === 'Magia' ||
            (choice.costMp && choice.costMp > 0 && !choice.isWeaponAttack)
        );

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

          const commitSingleSaveCosts = (): string[] => {
            let saveTurnedHostile: string[] = [];
            updateCampaign((prev) => {
              const afterFlip = !isSelfTarget
                ? flipAttackedNpcsToHostile(prev, [defenderToken])
                : { nextState: prev, turnedHostileNames: [] };
              saveTurnedHostile = afterFlip.turnedHostileNames;
              const base = char
                ? removeTrackedEffectsFromState(afterFlip.nextState, char.id, conflict.effectsToClear)
                : afterFlip.nextState;
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
                    inventory: deductChargedInventoryItem(
                      c,
                      choice.chargedInventoryEntryId,
                      base.compendium.items
                    ),
                    abilityUsesRemaining: decrementAbilityUse(c, matchingAbilityDef),
                    ...(shouldSetConcentration ? { concentratingSpell: choice.actionTitle } : {}),
                  };
                }),
                maps:
                  !isSelfTarget && attackerToken && activeMap
                    ? base.maps.map((m) =>
                        m.id !== activeMap.id
                          ? m
                          : {
                              ...m,
                              tokens: m.tokens.map((t) =>
                                t.id === attackerToken.id
                                  ? {
                                      ...t,
                                      stealthTotal: null,
                                      ...(choice.isLegendaryAction && t.isBoss
                                        ? {
                                            legendaryActionsRemaining: Math.max(
                                              0,
                                              (t.legendaryActionsRemaining ?? t.legendaryActionsMax ?? 3) - 1
                                            ),
                                          }
                                        : {}),
                                    }
                                  : t
                              ),
                            }
                      )
                    : base.maps,
                activeBoss:
                  choice.isLegendaryAction && base.activeBoss
                    ? {
                        ...base.activeBoss,
                        legendaryActionsRemaining: Math.max(
                          0,
                          (base.activeBoss.legendaryActionsRemaining ??
                            base.activeBoss.legendaryActionsMax ??
                            3) - 1
                        ),
                      }
                    : base.activeBoss,
                combat:
                  !choice.isLegendaryAction &&
                  base.combat.active &&
                  attackerCb &&
                  (actionCost !== 'Livre' || shouldSetConcentration)
                    ? {
                        ...base.combat,
                        combatants: base.combat.combatants.map((cb) =>
                          cb.id !== attackerCb.id
                            ? cb
                            : {
                                ...consumeCombatantEconomy(cb, actionCost, {
                                  isReadyReaction: isReadyTriggerDuel,
                                }),
                                ...(shouldSetConcentration
                                  ? { concentratingSpell: choice.actionTitle }
                                  : {}),
                              }
                        ),
                      }
                    : base.combat,
              };
            });
            return saveTurnedHostile;
          };

          const executeSingleSaveAfterCounterspell = (finalDurRounds?: number) => {
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
            if (!combat.active && !isSelfTarget) {
              pendingAutoCombatOnSaveRef.current = {
                tokenId: attackerToken?.id || choice.attackerTokenId,
                characterId: choice.attackerCharacterId,
                actionCost,
                reason: `${choice.attackerName} conjurou ${choice.actionTitle} em ${defenderToken.name}`,
              };
            }
            window.setTimeout(() => {
              startTacticalSavePromptRef.current?.({
                kind: 'aoe',
                title: choice.actionTitle,
                subtitle: `Alvo: ${defenderToken.name}`,
                saveSkillId: choice.saveSkillId!,
                saveLabel: saveSkill?.name || 'Salvaguarda',
                dc: dcVal,
                damageFormula: choice.damageFormula
                  ? resolveFormulaVariablesToRaw(choice.damageFormula, stats, char)
                  : '',
                damageType: choice.damageType || undefined,
                halfOnSuccess:
                  choice.halfOnSuccess !== false &&
                  matchingAbilityDef?.halfOnSuccess !== false &&
                  Boolean(choice.damageFormula),
                applyConditionId: choice.applyConditionId,
                conditionDurationRounds: finalDurRounds,
                casterCharacterId: char?.id,
                casterName: choice.attackerName,
                requiresConcentration: shouldSetConcentration,
                singleTargetOnly: isSingleTargetOnly,
                tokens: [defenderToken],
              });
            }, 80);
          };

          const commitAndGateSingleSave = (finalDurRounds?: number) => {
            const turnedHostile = commitSingleSaveCosts();
            turnedHostile.forEach((npcName) => {
              pushCombatLog({
                category: 'system',
                actorName: npcName,
                actorKind: 'npc',
                actorColor: '#ef4444',
                summary: 'tornou-se Hostil ao ser atacado!',
              });
            });
            if (isSpellAction && attackerToken && activeMap) {
              const pausedByCs = checkAndTriggerCounterspellRef.current?.({
                casterToken: attackerToken,
                casterName: choice.attackerName,
                casterColor: choice.attackerColor,
                spellName: choice.actionTitle,
                costMp: choice.costMp || matchingAbilityDef?.costMp || 2,
                activeMap,
                onProceedIfNotCountered: () => executeSingleSaveAfterCounterspell(finalDurRounds),
              });
              if (pausedByCs) return;
            }
            executeSingleSaveAfterCounterspell(finalDurRounds);
          };

          if (choice.applyConditionId && choice.conditionDurationFormula) {
            const condDef = currCampaign.compendium.conditions.find(
              (c) => c.id === choice.applyConditionId
            );
            const durFormula = choice.conditionDurationFormula;
            openManualRoll({
              title: `Duração: ${choice.actionTitle}`,
              subtitle: condDef
                ? `Turnos completos de ${condDef.icon} ${condDef.name}`
                : 'Turnos completos de duração',
              formula: durFormula,
              displayFormula: formatFormulaForDisplay(durFormula, stats, char),
              previewDice: buildPreviewDiceForFormula(durFormula, 'normal'),
              rollerName: choice.attackerName,
              rollerColor: choice.attackerColor,
              diceSkin: choice.diceSkin || 'gold',
              allowAdvantageToggle: false,
              advantageMode: 'normal',
              onExecute: () => {
                const durRes = evaluateFormula(durFormula, stats, char);
                const rolledTurns = Math.max(1, durRes.total);
                sendRoll({
                  rollerName: choice.attackerName,
                  rollerRole: roleRef.current,
                  rollerColor: choice.attackerColor,
                  diceSkin: choice.diceSkin || 'gold',
                  title: `Duração: ${choice.actionTitle}`,
                  formula: durRes.resolvedFormula,
                  individualRolls: durRes.individualRolls,
                  rolledDice: durRes.rolledDice,
                  total: rolledTurns,
                  isSecret: false,
                  details: `${condDef?.icon || '✨'} ${condDef?.name || choice.actionTitle} por ${rolledTurns} ${rolledTurns === 1 ? 'turno completo' : 'turnos completos'}!`,
                });
                commitAndGateSingleSave(rolledTurns);
              },
            });
            return;
          }

          commitAndGateSingleSave(choice.conditionDurationRounds);
          return;
        }

        // 4B. Condition-Only Skill (e.g., Bênção, Velocidade): skip AC roll/damage, apply condition directly to target token (rolls duration dice if Duração is a dice formula!)
        if (isConditionOnlyAction && choice.applyConditionId) {
          const condId = choice.applyConditionId;
          const condDef = currCampaign.compendium.conditions.find((c) => c.id === condId);
          const trackedEntry = buildCasterTrackedEffect();
          const parsedDur = parseAbilityDuration(
            matchingAbilityDef?.duration,
            choice.conditionDurationRounds ?? matchingAbilityDef?.conditionDurationRounds
          );

          const isOffensiveDebuffTarget = !isSelfTarget && isOffensiveCondition(condDef);

          const applyTargetedConditionEffect = (finalRounds: number) => {
            let condTurnedHostile: string[] = [];
            updateCampaign((prev) => {
              const afterFlip = isOffensiveDebuffTarget
                ? flipAttackedNpcsToHostile(prev, [defenderToken])
                : { nextState: prev, turnedHostileNames: [] };
              condTurnedHostile = afterFlip.turnedHostileNames;
              const base = char
                ? removeTrackedEffectsFromState(afterFlip.nextState, char.id, conflict.effectsToClear)
                : afterFlip.nextState;
              return {
                ...base,
                characters: base.characters.map((c) => {
                  let next = c;
                  if (char && c.id === char.id && trackedEntry) {
                    next = upsertTrackedEffectOnCharacter(next, trackedEntry);
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
                  m.id !== (activeMap?.id || base.activeMapId)
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
                        if (cb.tokenId === defenderToken.id && condDef) {
                          return {
                            ...cb,
                            effects: [
                              ...cb.effects.filter((ef) => ef.conditionId !== condId),
                              {
                                id: `eff-${Date.now()}`,
                                label: condDef.name,
                                conditionId: condId,
                                remainingRounds: Math.max(1, finalRounds),
                                sourceName: choice.attackerName,
                              },
                            ],
                          };
                        }
                        return cb;
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
            fireProjectileVfx({
              fromToken: attackerToken,
              toToken: defenderToken,
              title: choice.actionTitle,
              damageType: choice.damageType,
              applyConditionId: condId,
              range: choice.range,
              kind: choice.vfxKind || matchingAbilityDef?.vfxKind,
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
              summary: `usou ${choice.actionTitle}${shouldSetConcentration ? ' (Concentração)' : ''} e aplicou ${condDef?.icon || ''} ${condDef?.name || 'Condição'} (${finalRounds} ${finalRounds === 1 ? 'turno' : 'turnos'}) em`,
            });
            condTurnedHostile.forEach((npcName) => {
              pushCombatLog({
                category: 'system',
                actorName: npcName,
                actorKind: 'npc',
                actorColor: '#ef4444',
                summary: 'tornou-se Hostil ao ser atacado!',
              });
            });
            if (isOffensiveDebuffTarget && !campaignRef.current.combat.active) {
              window.setTimeout(() => {
                startCombatFromMapRef.current?.({
                  openingAttacker: {
                    tokenId: attackerToken?.id || choice.attackerTokenId,
                    characterId: choice.attackerCharacterId,
                    actionCost,
                  },
                  reason: `${choice.attackerName} lançou ${choice.actionTitle} em ${defenderToken.name}`,
                });
              }, 480);
            }
          };

          const commitTargetedCondition = (finalRounds: number) => {
            // Spend caster cost & action immediately
            updateCampaign((prev) => ({
              ...prev,
              characters: prev.characters.map((c) => {
                if (!char || c.id !== char.id) return c;
                const res = deductCharacterResource(
                  c,
                  choice.costMp,
                  choice.costResourceId,
                  prev.compendium.customResources
                );
                return {
                  ...c,
                  ...res,
                  inventory: deductChargedInventoryItem(
                    c,
                    choice.chargedInventoryEntryId,
                    prev.compendium.items
                  ),
                  abilityUsesRemaining: decrementAbilityUse(c, matchingAbilityDef),
                  ...(shouldSetConcentration ? { concentratingSpell: choice.actionTitle } : {}),
                };
              }),
              combat:
                prev.combat.active && attackerCb
                  ? {
                      ...prev.combat,
                      combatants: prev.combat.combatants.map((cb) =>
                        cb.id !== attackerCb.id
                          ? cb
                          : {
                              ...consumeCombatantEconomy(cb, actionCost, {
                                isReadyReaction: isReadyTriggerDuel,
                              }),
                              ...(shouldSetConcentration
                                ? { concentratingSpell: choice.actionTitle }
                                : {}),
                            }
                      ),
                    }
                  : prev.combat,
            }));
            if (isSpellAction && attackerToken && activeMap) {
              const pausedByCs = checkAndTriggerCounterspellRef.current?.({
                casterToken: attackerToken,
                casterName: choice.attackerName,
                casterColor: choice.attackerColor,
                spellName: choice.actionTitle,
                costMp: choice.costMp || matchingAbilityDef?.costMp || 2,
                activeMap,
                onProceedIfNotCountered: () => applyTargetedConditionEffect(finalRounds),
              });
              if (pausedByCs) return;
            }
            applyTargetedConditionEffect(finalRounds);
          };

          if (parsedDur.isDiceFormula) {
            const durFormula = parsedDur.formula;
            openManualRoll({
              title: `Duração: ${choice.actionTitle}`,
              subtitle: `Turnos completos de ${condDef?.icon || '✨'} ${condDef?.name || 'Condição'} em ${defenderToken.name}`,
              formula: durFormula,
              displayFormula: formatFormulaForDisplay(durFormula, stats, char),
              previewDice: buildPreviewDiceForFormula(durFormula, 'normal'),
              rollerName: choice.attackerName,
              rollerColor: choice.attackerColor,
              diceSkin: choice.diceSkin || 'gold',
              allowAdvantageToggle: false,
              advantageMode: 'normal',
              onExecute: () => {
                const durRes = evaluateFormula(durFormula, stats, char);
                const rolledTurns = Math.max(1, durRes.total);
                commitTargetedCondition(rolledTurns);
                sendRoll({
                  rollerName: choice.attackerName,
                  rollerRole: roleRef.current,
                  rollerColor: choice.attackerColor,
                  diceSkin: choice.diceSkin || 'gold',
                  title: `Duração: ${choice.actionTitle} → ${defenderToken.name}`,
                  formula: durRes.resolvedFormula,
                  individualRolls: durRes.individualRolls,
                  rolledDice: durRes.rolledDice,
                  total: rolledTurns,
                  isSecret: false,
                  details: `${condDef?.icon || '✨'} ${condDef?.name || choice.actionTitle} em ${defenderToken.name} por ${rolledTurns} ${rolledTurns === 1 ? 'turno completo' : 'turnos completos'}!`,
                });
              },
            });
            return;
          }

          commitTargetedCondition(parsedDur.rounds);
          return;
        }

        // 4C. Guaranteed Direct Healing: never roll vs AC / never miss! Roll ONLY the healing dice & heal target directly.
        if (isHealingAction) {
          const healFormula = choice.damageFormula?.trim() || '1d8';
          const trackedEntry = choice.applyConditionId ? buildCasterTrackedEffect() : null;

          // Always deduct MP / Charges / Ability Uses / Economy (even at 0 MP out of combat!)
          if (
            char ||
            (combat.active && attackerCb && (actionCost !== 'Livre' || shouldSetConcentration))
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
                    inventory: deductChargedInventoryItem(
                      c,
                      choice.chargedInventoryEntryId,
                      base.compendium.items
                    ),
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
                            ...consumeCombatantEconomy(cb, actionCost, {
                              isReadyReaction: isReadyTriggerDuel,
                            }),
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

          const executeDirectHealEffect = () => {
            const healRoll = evaluateFormula(healFormula, stats, char);
            const healAmount = Math.max(1, healRoll.total);
            window.setTimeout(() => {
              applyDamage(
                defenderToken.id,
                healAmount,
                true,
                undefined,
                'Cura',
                choice.applyConditionId,
                choice.conditionDurationRounds
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
              rollerColor: choice.attackerColor,
              diceSkin: choice.diceSkin || 'gold',
              title: `${choice.actionTitle} → ${defenderToken.name}`,
              formula: healRoll.resolvedFormula,
              total: healAmount,
              individualRolls: healRoll.individualRolls,
              rolledDice: healRoll.rolledDice,
              damageTotal: healAmount,
              damageType: 'Cura',
              targetName: defenderToken.name,
              targetTokenId: defenderToken.id,
              isSecret: false,
              details: `Cura garantida (sem teste de CA): +${healAmount} PV • ${healRoll.details}`,
              isCrit: false,
              isFumble: false,
            });
          };

          if (isSpellAction && attackerToken && activeMap) {
            const pausedByCs = checkAndTriggerCounterspellRef.current?.({
              casterToken: attackerToken,
              casterName: choice.attackerName,
              casterColor: choice.attackerColor,
              spellName: choice.actionTitle,
              costMp: choice.costMp || matchingAbilityDef?.costMp || 2,
              activeMap,
              onProceedIfNotCountered: executeDirectHealEffect,
            });
            if (pausedByCs) return;
          }

          executeDirectHealEffect();
          return;
        }

      const defenderChar =
        defenderToken.type === 'character' && defenderToken.referenceId
          ? currCampaign.characters.find((c) => c.id === defenderToken.referenceId)
          : undefined;

      const effectiveDefenderAc = defenderToken.defense + losResult.coverAcBonus;

      // Full D&D 5e situational attack modifiers:
      // Ranged in melee (1.5m), GM next-attack grant, Flanking (Off/Advantage/+2), Adjacent Ally, Real Stealth, 3D Elevation, Dodge, Conditions
      const tacticalMods = evaluateTacticalAttackModifiers({
        map: activeMap,
        attackerToken,
        defenderToken,
        attackerChar: char,
        defenderChar,
        characters: currCampaign.characters,
        npcs: currCampaign.npcs,
        campaign: currCampaign,
        range: choice.range,
        actionTitle: choice.actionTitle,
        sqMeters: sqMetersVal,
        flankingMode: getEffectiveFlankingMode(currCampaign.settings),
        manualAdvantageMode: advantageMode,
        defenderDodging: Boolean(defenderCb?.dodging),
        isReaction: actionCost === 'Reação',
      });
      const allSituationalBadges = losResult.coverLabel
        ? [...tacticalMods.summaryBadges, losResult.coverLabel]
        : tacticalMods.summaryBadges;

      const trackedEntry = buildCasterTrackedEffect();
      const commitAttackDuelCostNow = () => {
        let duelTurnedHostile: string[] = [];
        updateCampaign((prev) => {
          const afterFlip =
            !isSelfTarget && !isHealingAction
              ? flipAttackedNpcsToHostile(prev, [defenderToken])
              : { nextState: prev, turnedHostileNames: [] };
          duelTurnedHostile = afterFlip.turnedHostileNames;
          const base = char
            ? removeTrackedEffectsFromState(afterFlip.nextState, char.id, conflict.effectsToClear)
            : afterFlip.nextState;
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
                // D&D 5e: attacking reveals hidden/invisible attacker after Vantagem is applied
                activeConditionIds:
                  !isHealingAction && !isSelfTarget
                    ? c.activeConditionIds.filter((cid) => cid !== 'cond-invisivel')
                    : c.activeConditionIds,
                inventory: deductChargedInventoryItem(
                  c,
                  choice.chargedInventoryEntryId,
                  base.compendium.items
                ),
                abilityUsesRemaining: decrementAbilityUse(c, matchingAbilityDef),
                nextAttackRollOverride: clearGmOverride ? null : c.nextAttackRollOverride,
                ...(shouldSetConcentration ? { concentratingSpell: choice.actionTitle } : {}),
              };
              if (trackedEntry) {
                next = upsertTrackedEffectOnCharacter(next, trackedEntry);
              }
              return next;
            }),
            maps:
              !isHealingAction && !isSelfTarget && attackerToken && activeMap
                ? base.maps.map((m) =>
                    m.id !== activeMap.id
                      ? m
                      : {
                          ...m,
                          tokens: m.tokens.map((t) =>
                            t.id === attackerToken.id
                              ? {
                                  ...t,
                                  // D&D 5e: attacking reveals hidden/stealthed attacker after Ambush Advantage is applied
                                  stealthTotal: null,
                                  activeConditionIds: (t.activeConditionIds || []).filter(
                                    (cid) => cid !== 'cond-invisivel'
                                  ),
                                  ...(choice.isLegendaryAction && t.isBoss
                                    ? {
                                        legendaryActionsRemaining: Math.max(
                                          0,
                                          (t.legendaryActionsRemaining ?? t.legendaryActionsMax ?? 3) - 1
                                        ),
                                      }
                                    : {}),
                                }
                              : t
                          ),
                        }
                  )
                : base.maps,
            activeBoss:
              choice.isLegendaryAction && base.activeBoss
                ? {
                    ...base.activeBoss,
                    legendaryActionsRemaining: Math.max(
                      0,
                      (base.activeBoss.legendaryActionsRemaining ??
                        base.activeBoss.legendaryActionsMax ??
                        3) - 1
                    ),
                  }
                : base.activeBoss,
            combat:
              !choice.isLegendaryAction &&
              base.combat.active &&
              attackerCb &&
              (actionCost !== 'Livre' || shouldSetConcentration || isReadyTriggerDuel)
                ? {
                    ...base.combat,
                    combatants: base.combat.combatants.map((cb) =>
                      cb.id !== attackerCb.id
                        ? cb
                        : {
                            ...consumeCombatantEconomy(cb, actionCost, {
                              isWeaponAttack: Boolean(choice.isWeaponAttack),
                              attacksPerAction: getCharacterAttacksPerAction(char),
                              isReadyReaction: isReadyTriggerDuel,
                            }),
                            ...(shouldSetConcentration
                              ? { concentratingSpell: choice.actionTitle }
                              : {}),
                          }
                    ),
                  }
                : base.combat,
          };
        });

        duelTurnedHostile.forEach((npcName) => {
          pushCombatLog({
            category: 'system',
            actorName: npcName,
            actorKind: 'npc',
            actorColor: '#ef4444',
            summary: 'tornou-se Hostil ao ser atacado!',
          });
        });
      };

      const hasAttackRoll = Boolean(choice.attackFormula && choice.attackFormula.trim());
      const previewAttackDice = hasAttackRoll
        ? buildPreviewDiceForFormula(choice.attackFormula!, tacticalMods.effectiveAdvantageMode)
        : [];
      const displayAtkFormula = hasAttackRoll
        ? formatFormulaForDisplay(choice.attackFormula!, stats, char)
        : undefined;

      const effectiveDuelDamageFormula =
        choice.damageFormula && !isHealingAction && stats && stats.damageDiceBonuses.length > 0
          ? `${choice.damageFormula} + ${stats.damageDiceBonuses.join(' + ')}`
          : choice.damageFormula;

      // D&D 5e Shield reaction for auto-hit spells (e.g. Mísseis Mágicos) when attack roll is skipped
      let autoHitCanShieldReaction = false;
      if (!hasAttackRoll && !isHealingAction && effectiveDuelDamageFormula && defenderChar) {
        const defShieldAb =
          defenderChar.knownAbilityIds
            .map((id) => currCampaign.compendium.abilities.find((a) => a.id === id))
            .find((ab) => ab && ab.actionType === 'Reação' && /escudo/i.test(ab.name)) ||
          defenderChar.customAbilities.find((ab) => ab.actionType === 'Reação' && /escudo/i.test(ab.name));
        const defShieldMp = defShieldAb ? Math.max(0, defShieldAb.costMp ?? 2) : 2;
        const defIncapAuto = isTokenIncapacitated(
          defenderToken,
          defenderChar,
          currCampaign.compendium.conditions
        );
        autoHitCanShieldReaction = Boolean(
          defShieldAb &&
            !defIncapAuto &&
            defenderChar.mp >= defShieldMp &&
            (!defenderCb || defenderCb.reactionAvailable !== false)
        );
      }

      const matchedWeaponDef = char
        ? char.inventory
            .filter((inv) => inv.equipped)
            .map((inv) => currCampaign.compendium.items.find((i) => i.id === inv.itemId))
            .find(
              (item) =>
                item &&
                item.type === 'Arma' &&
                normalizeAbilityKey(item.name) === normalizeAbilityKey(choice.actionTitle)
            )
        : undefined;
      const resolvedCritRange = choice.critRange ?? matchedWeaponDef?.critRange ?? 20;
      const resolvedCritMultiplier = choice.critMultiplier ?? matchedWeaponDef?.critMultiplier ?? 2;

      const duel: CombatDuelState = {
        id: `duel-${Date.now()}`,
        attackerTokenId: attackerToken?.id || choice.attackerTokenId,
        attackerCharacterId: choice.attackerCharacterId,
        attackerName: choice.attackerName,
        attackerColor: choice.attackerColor,
        attackerImageUrl: choice.attackerImageUrl,
        attackerFrame: choice.attackerFrame,
        defenderTokenId: defenderToken.id,
        defenderCharacterId: defenderChar?.id,
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
        conditionDurationRounds: choice.conditionDurationRounds,
        conditionDurationFormula: choice.conditionDurationFormula,
        sfxPreset: resolvedSfxPreset,
        vfxKind: choice.vfxKind || matchingAbilityDef?.vfxKind,
        rawAttackFormula: hasAttackRoll ? choice.attackFormula : undefined,
        attackFormula: displayAtkFormula,
        attackRolledDice: previewAttackDice,
        isCrit: false,
        isFumble: false,
        hitSuccess: !hasAttackRoll,
        damageFormula: effectiveDuelDamageFormula,
        damageType: choice.damageType,
        situationalModifiers: allSituationalBadges,
        effectiveAdvantageMode: tacticalMods.effectiveAdvantageMode,
        flankingAttackBonus: tacticalMods.flankingAttackBonus || 0,
        hasAdjacentAllyForSneak: tacticalMods.hasAdjacentAllyForSneak,
        adjacentAllyName: tacticalMods.adjacentAllyName,
        defenderCanShieldReaction: autoHitCanShieldReaction,
        autoCritOnHit: tacticalMods.autoCritOnHit,
        critRange: resolvedCritRange,
        critMultiplier: resolvedCritMultiplier,
        actionCost,
        isWeaponAttack: choice.isWeaponAttack,
        isLegendaryAction: choice.isLegendaryAction,
        deferredCostCommitted: !hasAttackRoll,
        autoStartCombatOnClose: Boolean(!combat.active && !isSelfTarget && !isHealingAction),
        // Wait for manual click on "Rolar Ataque" (or "Rolar Dano" for direct auto-hit spells!)
        phase: hasAttackRoll ? 'ready-attack' : 'attack-result',
      };

      const spellMetaForDuel =
        isSpellAction && attackerToken && activeMap
          ? {
              casterToken: attackerToken,
              casterName: choice.attackerName,
              casterColor: choice.attackerColor,
              spellName: choice.actionTitle,
              costMp: choice.costMp || matchingAbilityDef?.costMp || 2,
              activeMap,
            }
          : undefined;

      if (hasAttackRoll) {
        // Defer MP/Action/Uses/Charges/LegendaryAction deduction until "Rolar Ataque" is clicked (canceling in ready-attack refunds 100%!)
        deferredDuelCommitRef.current = {
          duelId: duel.id,
          commit: commitAttackDuelCostNow,
          spellMeta: spellMetaForDuel,
        };
        activeDuelRef.current = duel;
        emitDuelState(duel);
      } else {
        // Auto-hit spell (e.g., Mísseis Mágicos): commit cost and gate duel behind Counterspell if eligible reactors exist
        commitAttackDuelCostNow();
        if (spellMetaForDuel) {
          const pausedByCs = checkAndTriggerCounterspellRef.current?.({
            ...spellMetaForDuel,
            onProceedIfNotCountered: () => {
              activeDuelRef.current = duel;
              emitDuelState(duel);
            },
          });
          if (pausedByCs) return;
        }
        activeDuelRef.current = duel;
        emitDuelState(duel);
      }
      })();
    },
    [advantageMode, applyDamage, emitDuelState, playSyncedAbilitySfx, pushCombatLog, sendRoll, showTacticalAlert, triggerOpportunityPrompt, triggerSlashVfx, updateCampaign]
  );

  const executeRollDuelAttackCore = useCallback(
    (duel: CombatDuelState) => {
      const rawFormula = duel.rawAttackFormula || duel.attackFormula;
      if (!rawFormula) return;

      const currCampaign = campaignRef.current;
      // Strict ID match only (never match homonymous hero by attackerName!)
      const char = duel.attackerCharacterId
        ? currCampaign.characters.find((c) => c.id === duel.attackerCharacterId)
        : undefined;
      const stats = char ? computeCharacterStats(char, currCampaign) : undefined;

      const attackRes = evaluateFormula(rawFormula, stats, char, {
        advantageMode: duel.effectiveAdvantageMode || 'normal',
        extraFlatBonus: (stats?.attackBonusExtra || 0) + (duel.flankingAttackBonus || 0),
        extraDiceBonuses: stats?.attackDiceBonuses,
        critRange: duel.critRange,
      });

      const hitSuccess =
        attackRes.isCrit || (!attackRes.isFumble && attackRes.total >= duel.defenderDefense);
      const effectiveIsCrit = Boolean(attackRes.isCrit || (hitSuccess && duel.autoCritOnHit));

      // D&D 5e Defensive Reaction Checks: Escudo Arcano (+5 CA) & Esquiva Sobrenatural (½ Dano)
      const activeMapForDef =
        currCampaign.maps.find((m) => m.tokens.some((t) => t.id === duel.defenderTokenId)) ||
        currCampaign.maps.find((m) => m.id === currCampaign.activeMapId);
      const defTok = activeMapForDef?.tokens.find((t) => t.id === duel.defenderTokenId);
      const defChar =
        defTok?.type === 'character' && defTok.referenceId
          ? currCampaign.characters.find((c) => c.id === defTok.referenceId)
          : undefined;
      const defCb = currCampaign.combat.active
        ? currCampaign.combat.combatants.find((cb) => cb.tokenId === duel.defenderTokenId)
        : undefined;
      const defShieldAbility = defChar
        ? defChar.knownAbilityIds
            .map((id) => currCampaign.compendium.abilities.find((a) => a.id === id))
            .find((ab) => ab && ab.actionType === 'Reação' && /escudo/i.test(ab.name)) ||
          defChar.customAbilities.find((ab) => ab.actionType === 'Reação' && /escudo/i.test(ab.name))
        : undefined;
      const shieldMpCost = defShieldAbility ? Math.max(0, defShieldAbility.costMp ?? 2) : 2;
      const defIsIncapacitated = Boolean(
        defTok && isTokenIncapacitated(defTok, defChar, currCampaign.compendium.conditions)
      );
      const defHasReaction = !defCb || defCb.reactionAvailable !== false;
      const defenderCanShieldReaction = Boolean(
        hitSuccess &&
          !attackRes.isCrit &&
          !duel.reactionShieldApplied &&
          !defIsIncapacitated &&
          defChar &&
          !defChar.activeConditionIds.includes('cond-escudo-arcano') &&
          defShieldAbility &&
          defChar.mp >= shieldMpCost &&
          defHasReaction
      );

      const defClassDef = defChar
        ? currCampaign.compendium.classes.find((cl) => cl.id === defChar.classId)
        : undefined;
      const isRogue5Plus = Boolean(
        defChar &&
          defChar.level >= 5 &&
          defClassDef &&
          /ladin|rogue/i.test(`${defClassDef.id} ${defClassDef.name}`)
      );
      const hasUncannyDodgeAbility = Boolean(
        defChar &&
          (defChar.knownAbilityIds
            .map((id) => currCampaign.compendium.abilities.find((a) => a.id === id))
            .some((ab) => ab && /esquiva sobrenatural|uncanny dodge/i.test(ab.name)) ||
            defChar.customAbilities.some((ab) =>
              /esquiva sobrenatural|uncanny dodge/i.test(ab.name)
            ))
      );
      const isHealingDuel = duel.damageType?.toLowerCase() === 'cura';
      const defenderCanUncannyDodge = Boolean(
        hitSuccess &&
          !isHealingDuel &&
          Boolean(duel.damageFormula) &&
          !defIsIncapacitated &&
          defChar &&
          defHasReaction &&
          (isRogue5Plus || hasUncannyDodgeAbility)
      );

      const rollingDuel: CombatDuelState = {
        ...duel,
        deferredCostCommitted: true,
        attackFormula: attackRes.resolvedFormula,
        attackRolledDice: attackRes.rolledDice,
        defenderCanShieldReaction,
        defenderCanUncannyDodge,
        defenderReactionDismissed: false,
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
        isAttackRoll: true,
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
    },
    [emitDuelState, recordCombatStat, sendRoll]
  );

  const rollDuelAttack = useCallback(() => {
    const duel = activeDuelRef.current;
    if (!duel || duel.phase !== 'ready-attack') return;

    if (deferredDuelCommitRef.current?.duelId === duel.id) {
      const pending = deferredDuelCommitRef.current;
      deferredDuelCommitRef.current = null;
      pending.commit();
      if (pending.spellMeta) {
        const pausedByCs = checkAndTriggerCounterspellRef.current?.({
          ...pending.spellMeta,
          onProceedIfNotCountered: () => {
            if (activeDuelRef.current?.id === duel.id) {
              executeRollDuelAttackCore({ ...duel, deferredCostCommitted: true });
            }
          },
        });
        if (pausedByCs) return;
      }
    }

    executeRollDuelAttackCore({ ...duel, deferredCostCommitted: true });
  }, [executeRollDuelAttackCore]);

  const rollDuelDamage = useCallback(() => {
    const duel = activeDuelRef.current;
    if (!duel || !duel.damageFormula) return;

    const char = duel.attackerCharacterId
      ? campaignRef.current.characters.find((c) => c.id === duel.attackerCharacterId)
      : undefined;
    const stats = char ? computeCharacterStats(char, campaignRef.current) : undefined;
    const isHealing = duel.damageType?.toLowerCase() === 'cura';

    const dmgRes = evaluateFormula(duel.damageFormula, stats, char, {
      extraFlatBonus: !isHealing && stats ? stats.damageBonusExtra : 0,
      isCritDamage: duel.isCrit,
      critMultiplier: duel.critMultiplier,
    });
    const rawDmgTotal = Math.max(1, dmgRes.total);
    const dmgTotal =
      !isHealing && duel.reactionUncannyDodgeApplied
        ? Math.max(1, Math.floor(rawDmgTotal / 2))
        : rawDmgTotal;

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
        details: `${dmgTotal} de ${duel.damageType || 'Dano'} rolado contra ${duel.defenderName}${
          duel.reactionUncannyDodgeApplied ? ` (Esquiva Sobrenatural: metade de ${rawDmgTotal})` : ''
        }.`,
        applied: true,
      });
    }, 680);
  }, [emitDuelState, sendRoll]);

  const advanceDuelPhase = useCallback((phase: CombatDuelState['phase']) => {
    setActiveDuel((curr) => (curr ? { ...curr, phase } : null));
  }, []);

  const dismissDuel = useCallback(() => {
    const duel = activeDuelRef.current;
    if (duel && deferredDuelCommitRef.current?.duelId === duel.id) {
      deferredDuelCommitRef.current = null;
    }
    emitDuelState(null);
    setTargetTokenId(null);
    if (!duel || lastDispatchedDuelIdRef.current === duel.id) return;
    lastDispatchedDuelIdRef.current = duel.id;

    const currCampaign = campaignRef.current;
    const curMap =
      currCampaign.maps.find((m) => m.tokens.some((t) => t.id === duel.defenderTokenId)) ||
      currCampaign.maps.find((m) => m.id === currCampaign.activeMapId);
    const defTok = curMap?.tokens.find((t) => t.id === duel.defenderTokenId);
    const atkTok =
      (duel.attackerTokenId && curMap?.tokens.find((t) => t.id === duel.attackerTokenId)) ||
      (duel.attackerCharacterId &&
        curMap?.tokens.find(
          (t) => t.type === 'character' && t.referenceId === duel.attackerCharacterId
        )) ||
      curMap?.tokens.find((t) => t.name === duel.attackerName);
    const isHealing = duel.damageType?.toLowerCase() === 'cura';

    const scheduleAutoCombatAfterDuel = (delayMs: number) => {
      if (!duel.autoStartCombatOnClose || campaignRef.current.combat.active) return;
      window.setTimeout(() => {
        if (campaignRef.current.combat.active) return;
        startCombatFromMapRef.current?.({
          openingAttacker: {
            tokenId: duel.attackerTokenId || atkTok?.id,
            characterId: duel.attackerCharacterId,
            actionCost: duel.actionCost || 'Padrão',
            isWeaponAttack: Boolean(duel.isWeaponAttack),
          },
          reason: `${duel.attackerName} atacou ${duel.defenderName}`,
        });
      }, delayMs);
    };

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
            kind: duel.vfxKind,
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
          const needsDiceDur = Boolean(duel.applyConditionId && duel.conditionDurationFormula);
          applyDamage(
            duel.defenderTokenId,
            dmgTotal,
            isHealing,
            undefined,
            duel.damageType,
            needsDiceDur ? undefined : duel.applyConditionId,
            duel.conditionDurationRounds,
            Boolean(duel.isCrit),
            {
              killerName: duel.attackerName,
              killerColor: duel.attackerColor,
              killerPortraitUrl: duel.attackerImageUrl,
            }
          );
          if (needsDiceDur && duel.applyConditionId && duel.conditionDurationFormula) {
            const condDef = campaignRef.current.compendium.conditions.find(
              (c) => c.id === duel.applyConditionId
            );
            const durFormula = duel.conditionDurationFormula;
            const atkChar = duel.attackerCharacterId
              ? campaignRef.current.characters.find((c) => c.id === duel.attackerCharacterId)
              : undefined;
            const atkStats = atkChar
              ? computeCharacterStats(atkChar, campaignRef.current)
              : undefined;
            openManualRoll({
              title: `Duração: ${duel.actionTitle}`,
              subtitle: condDef
                ? `Turnos completos de ${condDef.icon} ${condDef.name} em ${duel.defenderName}`
                : `Turnos completos em ${duel.defenderName}`,
              formula: durFormula,
              displayFormula: formatFormulaForDisplay(durFormula, atkStats, atkChar),
              previewDice: buildPreviewDiceForFormula(durFormula, 'normal'),
              rollerName: duel.attackerName,
              rollerColor: duel.attackerColor,
              diceSkin: duel.diceSkin || 'gold',
              allowAdvantageToggle: false,
              advantageMode: 'normal',
              onExecute: () => {
                const durRes = evaluateFormula(durFormula, atkStats, atkChar);
                const rolledTurns = Math.max(1, durRes.total);
                applyDamage(
                  duel.defenderTokenId,
                  0,
                  false,
                  undefined,
                  undefined,
                  duel.applyConditionId,
                  rolledTurns
                );
                sendRoll({
                  rollerName: duel.attackerName,
                  rollerRole: roleRef.current,
                  rollerColor: duel.attackerColor,
                  diceSkin: duel.diceSkin || 'gold',
                  title: `Duração: ${duel.actionTitle} → ${duel.defenderName}`,
                  formula: durRes.resolvedFormula,
                  individualRolls: durRes.individualRolls,
                  rolledDice: durRes.rolledDice,
                  total: rolledTurns,
                  isSecret: false,
                  details: `${condDef?.icon || '✨'} ${condDef?.name || duel.actionTitle} em ${duel.defenderName} por ${rolledTurns} ${rolledTurns === 1 ? 'turno completo' : 'turnos completos'}!`,
                });
                scheduleAutoCombatAfterDuel(240);
              },
            });
          }
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
                duel.attackerColor,
                curMap?.id
              );
            }, 240);
          }
          if (!needsDiceDur) {
            scheduleAutoCombatAfterDuel(260);
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
          scheduleAutoCombatAfterDuel(220);
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
            if (duel.conditionDurationFormula) {
              const condDef = campaignRef.current.compendium.conditions.find(
                (c) => c.id === duel.applyConditionId
              );
              const durFormula = duel.conditionDurationFormula;
              const atkChar = duel.attackerCharacterId
                ? campaignRef.current.characters.find((c) => c.id === duel.attackerCharacterId)
                : undefined;
              const atkStats = atkChar
                ? computeCharacterStats(atkChar, campaignRef.current)
                : undefined;
              openManualRoll({
                title: `Duração: ${duel.actionTitle}`,
                subtitle: condDef
                  ? `Turnos completos de ${condDef.icon} ${condDef.name} em ${duel.defenderName}`
                  : `Turnos completos em ${duel.defenderName}`,
                formula: durFormula,
                displayFormula: formatFormulaForDisplay(durFormula, atkStats, atkChar),
                previewDice: buildPreviewDiceForFormula(durFormula, 'normal'),
                rollerName: duel.attackerName,
                rollerColor: duel.attackerColor,
                diceSkin: duel.diceSkin || 'gold',
                allowAdvantageToggle: false,
                advantageMode: 'normal',
                onExecute: () => {
                  const durRes = evaluateFormula(durFormula, atkStats, atkChar);
                  const rolledTurns = Math.max(1, durRes.total);
                  applyDamage(
                    duel.defenderTokenId,
                    0,
                    false,
                    undefined,
                    undefined,
                    duel.applyConditionId,
                    rolledTurns
                  );
                  sendRoll({
                    rollerName: duel.attackerName,
                    rollerRole: roleRef.current,
                    rollerColor: duel.attackerColor,
                    diceSkin: duel.diceSkin || 'gold',
                    title: `Duração: ${duel.actionTitle} → ${duel.defenderName}`,
                    formula: durRes.resolvedFormula,
                    individualRolls: durRes.individualRolls,
                    rolledDice: durRes.rolledDice,
                    total: rolledTurns,
                    isSecret: false,
                    details: `${condDef?.icon || '✨'} ${condDef?.name || duel.actionTitle} em ${duel.defenderName} por ${rolledTurns} ${rolledTurns === 1 ? 'turno completo' : 'turnos completos'}!`,
                  });
                  scheduleAutoCombatAfterDuel(240);
                },
              });
            } else {
              applyDamage(
                duel.defenderTokenId,
                0,
                false,
                undefined,
                undefined,
                duel.applyConditionId,
                duel.conditionDurationRounds
              );
              scheduleAutoCombatAfterDuel(240);
            }
            triggerSlashVfx(duel.defenderTokenId, 'hit');
          }, 360);
        } else {
          scheduleAutoCombatAfterDuel(420);
        }
      }, 90);
    }
  }, [
    applyDamage,
    emitDuelState,
    fireProjectileVfx,
    openManualRoll,
    playSyncedAbilitySfx,
    recordCombatStat,
    sendRoll,
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

      // D&D 5e / BG3 Combat Turn Rule: in combat, players can ONLY roll 1 Death Save per turn, on their own turn, spending Standard Action!
      if (camp.combat.active) {
        const charCb = camp.combat.combatants.find(
          (cb) => cb.type === 'character' && cb.referenceId === char.id
        );
        const activeTurnCb = camp.combat.combatants[camp.combat.currentTurnIndex];
        if (roleRef.current !== 'gm') {
          if (!charCb) {
            showTacticalAlert(
              `${char.name} não está na fila de iniciativa deste combate.`
            );
            return;
          }
          if (activeTurnCb && activeTurnCb.id !== charCb.id) {
            showTacticalAlert(
              `Aguarde seu turno na iniciativa (${activeTurnCb.name} está agindo) para rolar o Teste contra a Morte.`
            );
            return;
          }
          if (charCb.deathSaveRolledThisTurn || charCb.actionAvailable === false) {
            showTacticalAlert(
              `${char.name} já rolou seu Teste contra a Morte neste turno! Encerre o turno.`
            );
            return;
          }
        }
      }

      const stats = computeCharacterStats(char, camp);
      const hasAid = Boolean(prevDs.assistedBy);
      const deathMode: RollAdvantageMode = hasAid ? 'advantage' : 'normal';

      openManualRoll({
        title: hasAid ? `Teste contra a Morte (Ajuda: ${prevDs.assistedBy})` : 'Teste contra a Morte',
        subtitle: camp.combat.active
          ? 'Gasta sua Ação Padrão do turno • 10+ Sucesso • 20 Natural = 1 PV • 1 Natural = 2 falhas'
          : '10+ Sucesso (3 sucessos = renasce com 1 PV) • 20 Natural = 1 PV imediato • 1 Natural = 2 falhas',
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

          if (liveCamp.combat.active && roleRef.current !== 'gm') {
            const liveCharCb = liveCamp.combat.combatants.find(
              (cb) => cb.type === 'character' && cb.referenceId === liveChar.id
            );
            const liveActiveTurnCb = liveCamp.combat.combatants[liveCamp.combat.currentTurnIndex];
            if (!liveCharCb) {
              showTacticalAlert(`${liveChar.name} não está na fila de iniciativa.`);
              return;
            }
            if (liveActiveTurnCb && liveActiveTurnCb.id !== liveCharCb.id) {
              showTacticalAlert(
                `Aguarde seu turno na iniciativa (${liveActiveTurnCb.name} está agindo) para rolar o Teste contra a Morte.`
              );
              return;
            }
            if (liveCharCb.deathSaveRolledThisTurn || liveCharCb.actionAvailable === false) {
              showTacticalAlert(
                `${liveChar.name} já rolou seu Teste contra a Morte neste turno! Encerre o turno.`
              );
              return;
            }
          }

          const liveDs = liveChar.deathSaves || { successes: 0, failures: 0 };
          const liveStats = computeCharacterStats(liveChar, liveCamp);
          const res = evaluateFormula('1d20', liveStats, liveChar, {
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
            msg = '20 NATURAL! Renasceu imediatamente com 1 PV (Ação Padrão gasta — BG3)!';
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
              msg = '3º Sucesso contra a Morte! O herói venceu os Portões da Morte e renasceu com 1 PV (Ação Padrão gasta)!';
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

          const revivedNow = nextHp > 0;
          const applyLocalDeathSave = (prev: CampaignState): CampaignState => {
            const activeTurnCb = prev.combat.active
              ? prev.combat.combatants[prev.combat.currentTurnIndex]
              : undefined;
            return {
              ...prev,
              characters: prev.characters.map((c) =>
                c.id !== liveChar.id
                  ? c
                  : {
                      ...c,
                      hp: nextHp,
                      activeConditionIds:
                        nextHp > 0
                          ? c.activeConditionIds.filter((id) => id !== 'cond-inconsciente')
                          : c.activeConditionIds,
                      deathSaves: nextDeathPayload,
                    }
              ),
              maps:
                nextHp > 0
                  ? prev.maps.map((m) => ({
                      ...m,
                      tokens: m.tokens.map((t) =>
                        t.type === 'character' && t.referenceId === liveChar.id
                          ? {
                              ...t,
                              hp: nextHp,
                              activeConditionIds: (t.activeConditionIds || []).filter(
                                (id) => id !== 'cond-inconsciente'
                              ),
                            }
                          : t
                      ),
                    }))
                  : prev.maps,
              combat: prev.combat.active
                ? {
                    ...prev.combat,
                    combatants: prev.combat.combatants.map((cb) => {
                      if (!(cb.type === 'character' && cb.referenceId === liveChar.id)) return cb;
                      let nextCb: Combatant = {
                        ...consumeCombatantEconomy({ ...cb, hp: nextHp }, 'Padrão'),
                        actionsRemaining: 0,
                        actionAvailable: false,
                        deathSaveRolledThisTurn: true,
                      };
                      if (revivedNow) {
                        const isActiveTurn = Boolean(activeTurnCb && activeTurnCb.id === cb.id);
                        nextCb = applyBg3ReviveActionPenalty(nextCb, isActiveTurn);
                      }
                      return nextCb;
                    }),
                  }
                : prev.combat,
            };
          };

          // Single authoritative emit when connected (eliminates character:deathSave vs campaign:patch overwrite race!)
          if (socketRef.current?.connected) {
            setCampaign((prev) => {
              const next = syncCampaignDerivedCharacterStats(applyLocalDeathSave(prev), prev);
              campaignRef.current = next;
              return next;
            });
            socketRef.current.emit('character:deathSave', {
              characterId: liveChar.id,
              hp: nextHp,
              deathSaves: nextDeathPayload,
              consumeAction: liveCamp.combat.active,
              applyRevivePenalty: revivedNow,
            });
          } else {
            updateCampaign(applyLocalDeathSave);
          }

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
      if (roleRef.current !== 'gm') return;
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

      const applyManualPatch = (prev: CampaignState): CampaignState => ({
        ...prev,
        characters: prev.characters.map((c) =>
          c.id !== char.id
            ? c
            : {
                ...c,
                hp: nextHp,
                activeConditionIds:
                  nextHp > 0
                    ? c.activeConditionIds.filter((id) => id !== 'cond-inconsciente')
                    : c.activeConditionIds,
                deathSaves: nextDeathPayload,
              }
        ),
        maps: prev.maps.map((m) => ({
          ...m,
          tokens: m.tokens.map((t) =>
            t.type === 'character' && t.referenceId === char.id
              ? {
                  ...t,
                  hp: nextHp,
                  activeConditionIds:
                    nextHp > 0
                      ? (t.activeConditionIds || []).filter((id) => id !== 'cond-inconsciente')
                      : t.activeConditionIds || [],
                }
              : t
          ),
        })),
        combat: {
          ...prev.combat,
          combatants: prev.combat.combatants.map((cb) =>
            cb.type === 'character' && cb.referenceId === char.id ? { ...cb, hp: nextHp } : cb
          ),
        },
      });

      if (socketRef.current?.connected) {
        setCampaign((prev) => {
          const next = syncCampaignDerivedCharacterStats(applyManualPatch(prev), prev);
          campaignRef.current = next;
          return next;
        });
        socketRef.current.emit('character:deathSave', {
          characterId: char.id,
          hp: nextHp,
          deathSaves: nextDeathPayload,
        });
      } else {
        updateCampaign(applyManualPatch);
      }
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

      // Search ALL maps for helper & target (supports split-party token-map mode!)
      let helperMap: CampaignState['maps'][number] | undefined;
      let helperTok: MapToken | undefined;
      let targetMap: CampaignState['maps'][number] | undefined;
      let targetTok: MapToken | undefined;
      for (const m of camp.maps) {
        if (!helperTok) {
          const foundH = m.tokens.find((t) => t.type === 'character' && t.referenceId === helper.id);
          if (foundH) {
            helperTok = foundH;
            helperMap = m;
          }
        }
        if (!targetTok) {
          const foundT = m.tokens.find((t) => t.type === 'character' && t.referenceId === target.id);
          if (foundT) {
            targetTok = foundT;
            targetMap = m;
          }
        }
      }
      if (
        isTokenIncapacitated(
          helperTok || ({ activeConditionIds: helper.activeConditionIds } as MapToken),
          helper,
          camp.compendium.conditions
        )
      ) {
        showTacticalAlert(`${helper.name} está incapacitado e não pode prestar socorro!`);
        return;
      }

      const sqMeters = camp.settings.gridSquareMeters || 1.5;

      if (helperTok && targetTok) {
        if (helperMap && targetMap && helperMap.id !== targetMap.id) {
          showTacticalAlert(`${helper.name} e ${target.name} estão em mapas diferentes!`);
          return;
        }
        const dist3D = getToken3DDistance(helperTok, targetTok, sqMeters);
        if (dist3D.meters3D > sqMeters + 0.05) {
          showTacticalAlert(
            `Aproxime-se de ${target.name} (${dist3D.meters3D}m — máximo ${sqMeters}m) para prestar socorro!`
          );
          return;
        }
        if (
          helperMap &&
          evaluateLineOfSightAndCover(helperMap, helperTok, targetTok, false).blockedByWall
        ) {
          showTacticalAlert(`Uma parede ou porta fechada bloqueia o acesso até ${target.name}!`);
          return;
        }
      }

      if (camp.combat.active) {
        const helperCb = camp.combat.combatants.find(
          (cb) => cb.type === 'character' && cb.referenceId === helper.id
        );
        const activeTurn = camp.combat.combatants[camp.combat.currentTurnIndex];
        if (roleRef.current !== 'gm') {
          if (!helperCb) {
            showTacticalAlert(`${helper.name} não está na fila de iniciativa deste combate.`);
            return;
          }
          if (activeTurn && activeTurn.id !== helperCb.id) {
            showTacticalAlert(
              `Aguarde seu turno (${activeTurn.name} está agindo) para socorrer ${target.name}.`
            );
            return;
          }
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
      const stabilizedNow = !isCritWake && !res.isFumble && res.total >= 10;
      const revivedWithOneHp = isCritWake || stabilizedNow;

      updateCampaign((prev) => ({
        ...prev,
        characters: prev.characters.map((c) => {
          if (c.id !== target.id) return c;
          if (revivedWithOneHp) {
            return {
              ...c,
              hp: 1,
              activeConditionIds: c.activeConditionIds.filter((cid) => cid !== 'cond-inconsciente'),
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
                t.type === 'character' && t.referenceId === target.id
                  ? {
                      ...t,
                      hp: 1,
                      activeConditionIds: (t.activeConditionIds || []).filter(
                        (cid) => cid !== 'cond-inconsciente'
                      ),
                    }
                  : t
              ),
            }))
          : prev.maps,
        combat: {
          ...prev.combat,
          combatants: prev.combat.combatants.map((cb) => {
            if (revivedWithOneHp && cb.type === 'character' && cb.referenceId === target.id) {
              const baseRevived = { ...cb, hp: 1 };
              if (prev.combat.active) {
                const activeTurnCb = prev.combat.combatants[prev.combat.currentTurnIndex];
                return applyBg3ReviveActionPenalty(
                  baseRevived,
                  Boolean(activeTurnCb && activeTurnCb.id === cb.id)
                );
              }
              return baseRevived;
            }
            if (prev.combat.active && cb.type === 'character' && cb.referenceId === helper.id) {
              return consumeCombatantEconomy(cb, 'Padrão');
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

      // GM Revive/Save restores full turn with NO BG3 revive penalty
      const applyGmRevive = (prev: CampaignState): CampaignState => {
        const activeTurnCb = prev.combat.active
          ? prev.combat.combatants[prev.combat.currentTurnIndex]
          : undefined;
        return {
          ...prev,
          characters: prev.characters.map((c) =>
            c.id === char.id
              ? {
                  ...c,
                  hp: nextHp,
                  activeConditionIds:
                    nextHp > 0
                      ? c.activeConditionIds.filter((id) => id !== 'cond-inconsciente')
                      : c.activeConditionIds,
                  deathSaves: nextDeathSaves,
                }
              : c
          ),
          maps: prev.maps.map((m) => ({
            ...m,
            tokens: m.tokens.map((t) =>
              t.type === 'character' && t.referenceId === char.id
                ? {
                    ...t,
                    hp: nextHp,
                    maxHp: stats.maxHp,
                    activeConditionIds:
                      nextHp > 0
                        ? (t.activeConditionIds || []).filter((id) => id !== 'cond-inconsciente')
                        : t.activeConditionIds || [],
                  }
                : t
            ),
          })),
          combat: {
            ...prev.combat,
            combatants: prev.combat.combatants.map((cb) => {
              if (!(cb.type === 'character' && cb.referenceId === char.id)) return cb;
              const isActiveTurn = Boolean(activeTurnCb && activeTurnCb.id === cb.id);
              return {
                ...cb,
                hp: nextHp,
                maxHp: stats.maxHp,
                revivedLostActionPending: false,
                ...(isActiveTurn && nextHp > 0
                  ? {
                      actionsRemaining: Math.max(1, getCombatantActionsRemaining(cb)),
                      actionAvailable: true,
                    }
                  : {}),
              };
            }),
          },
        };
      };

      if (socketRef.current?.connected) {
        setCampaign((prev) => {
          const next = syncCampaignDerivedCharacterStats(applyGmRevive(prev), prev);
          campaignRef.current = next;
          return next;
        });
        socketRef.current.emit('character:deathSave', {
          characterId: char.id,
          hp: nextHp,
          deathSaves: nextDeathSaves,
          clearRevivePenalty: true,
        });
      } else {
        updateCampaign(applyGmRevive);
      }

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

  const useBossLegendaryResistance = useCallback(
    (tokenId: string) => {
      const prompt = activeSavePromptRef.current;
      const curr = campaignRef.current;
      const activeMap =
        curr.maps.find((m) => m.tokens.some((t) => t.id === tokenId)) ||
        curr.maps.find((m) => m.id === curr.activeMapId);
      const tok = activeMap?.tokens.find((t) => t.id === tokenId);
      if (!tok || !tok.isBoss) return;
      const rem = tok.legendaryResistancesRemaining ?? tok.legendaryResistancesMax ?? 0;
      if (rem <= 0) return;

      const entry = prompt?.targets.find((t) => t.tokenId === tokenId);
      const rawDmg = prompt?.rolledRawDamage || 0;
      const prevAppliedDmg = entry?.applied ? entry.damageToApply : 0;
      const newDmg =
        rawDmg > 0 ? (prompt?.halfOnSuccess ? Math.floor(rawDmg / 2) : 0) : 0;
      const bossMon =
        tok.type === 'monster' && tok.referenceId
          ? curr.compendium.monsters.find((m) => m.id === tok.referenceId)
          : undefined;
      const bossNpc =
        tok.type === 'npc' && tok.referenceId
          ? curr.npcs.find((n) => n.id === tok.referenceId)
          : undefined;
      const bossChar =
        tok.type === 'character' && tok.referenceId
          ? curr.characters.find((c) => c.id === tok.referenceId)
          : undefined;
      const affOpts = {
        immunities:
          bossChar?.damageImmunities || bossMon?.damageImmunities || bossNpc?.damageImmunities,
        resistances:
          bossChar?.damageResistances || bossMon?.damageResistances || bossNpc?.damageResistances,
        vulnerabilities:
          bossChar?.damageVulnerabilities ||
          bossMon?.damageVulnerabilities ||
          bossNpc?.damageVulnerabilities,
        activeConditionIds: [
          ...(tok.activeConditionIds || []),
          ...(bossChar?.activeConditionIds || []),
        ],
        compendiumConditions: curr.compendium.conditions,
      };
      const effectivePrev =
        prevAppliedDmg > 0 && prompt?.damageType
          ? resolveDamageWithAffinities(prevAppliedDmg, prompt.damageType, affOpts).finalAmount
          : prevAppliedDmg;
      const effectiveNew =
        newDmg > 0 && prompt?.damageType
          ? resolveDamageWithAffinities(newDmg, prompt.damageType, affOpts).finalAmount
          : newDmg;
      const computeResolvedHp = (curHp: number, maxHp: number): number => {
        if (typeof entry?.hpBeforeSave === 'number') {
          return Math.max(0, Math.min(maxHp, entry.hpBeforeSave - effectiveNew));
        }
        if (entry?.applied) {
          const hpRefund = Math.max(0, effectivePrev - effectiveNew);
          return Math.min(maxHp, curHp + hpRefund);
        }
        return Math.max(0, curHp - effectiveNew);
      };
      const condsToStrip = new Set<string>(
        [prompt?.applyConditionId, prompt?.removeConditionOnPassId].filter(
          (id): id is string => Boolean(id)
        )
      );

      updateCampaign((prev) => ({
        ...prev,
        maps: prev.maps.map((m) =>
          m.id !== activeMap?.id
            ? m
            : {
                ...m,
                tokens: m.tokens.map((t) => {
                  if (t.id !== tokenId) return t;
                  const nextConds =
                    condsToStrip.size > 0
                      ? (t.activeConditionIds || []).filter((id) => !condsToStrip.has(id))
                      : t.activeConditionIds || [];
                  return {
                    ...t,
                    hp: computeResolvedHp(t.hp, t.maxHp),
                    activeConditionIds: nextConds,
                    legendaryResistancesRemaining: Math.max(0, rem - 1),
                  };
                }),
              }
        ),
        combat: {
          ...prev.combat,
          combatants: prev.combat.combatants.map((cb) =>
            cb.tokenId === tokenId
              ? {
                  ...cb,
                  hp: computeResolvedHp(cb.hp, cb.maxHp),
                  effects:
                    condsToStrip.size > 0
                      ? cb.effects.filter((ef) => !ef.conditionId || !condsToStrip.has(ef.conditionId))
                      : cb.effects,
                }
              : cb
          ),
        },
        activeBoss:
          prev.activeBoss && (prev.activeBoss.id === tokenId || prev.activeBoss.tokenId === tokenId)
            ? {
                ...prev.activeBoss,
                hp: computeResolvedHp(prev.activeBoss.hp, prev.activeBoss.maxHp),
              }
            : prev.activeBoss,
      }));

      if (prompt && entry) {
        const nextPrompt: TacticalSavePrompt = {
          ...prompt,
          targets: prompt.targets.map((t) =>
            t.tokenId === tokenId
              ? { ...t, status: 'passed', damageToApply: newDmg, applied: true }
              : t
          ),
        };
        activeSavePromptRef.current = nextPrompt;
        setActiveSavePrompt(nextPrompt);
        if (socketRef.current?.connected) {
          socketRef.current.emit('save-prompt:update', nextPrompt);
        }
      }

      playSyncedAbilitySfx({ explicitSfxPreset: 'shield', title: 'Resistência Lendária' });
      pushCombatLog({
        category: 'condition',
        actorName: tok.name,
        actorKind: 'monster',
        actorColor: tok.color || '#dc2626',
        summary: `usou ⚡ Resistência Lendária (${rem - 1} restante) e transformou a falha em SUCESSO automático!`,
      });
    },
    [playSyncedAbilitySfx, pushCombatLog, updateCampaign]
  );

  const claimTreasureMarker = useCallback(
    (markerId: string) => {
      const camp = campaignRef.current;
      const activeMap =
        camp.maps.find((m) => (m.gmMarkers || []).some((gm) => gm.id === markerId)) ||
        camp.maps.find((m) => m.id === camp.activeMapId);
      if (!activeMap) return;
      const marker = (activeMap.gmMarkers || []).find((gm) => gm.id === markerId);
      if (!marker) return;

      const char =
        roleRef.current === 'player'
          ? camp.characters.find((c) => c.ownerPlayerId === myPlayerId) ||
            camp.characters.find((c) => c.id === activeCharRef.current)
          : camp.characters.find((c) => c.id === activeCharRef.current) || camp.characters[0];

      const isSpottedByChar = Boolean(char && marker.visibleToCharacterIds?.includes(char.id));
      if (!marker.revealed && roleRef.current !== 'gm' && !isSpottedByChar) return;

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

  // Sync visible chat history from campaign.chatLog (strictly hiding other players' private whispers)
  useEffect(() => {
    const rawChat = campaign.chatLog || [];
    const myCharNameLower = (myCharacter?.name || '').trim().toLowerCase();
    const myNameLower = (myPlayerName || '').trim().toLowerCase();
    const canSeeMsg = (m: ChatMessageEntry): boolean => {
      if (!m.isWhisper) return true;
      if (role === 'gm') return true;
      if (m.senderPlayerId && m.senderPlayerId === myPlayerId) return true;
      if (m.recipientPlayerId) {
        return m.recipientPlayerId === myPlayerId;
      }
      const recLower = (m.recipientName || '').trim().toLowerCase();
      if (!recLower || recLower === 'mestre') return false;
      return recLower === myNameLower || (myCharNameLower !== '' && recLower === myCharNameLower);
    };
    const visible = rawChat.filter(canSeeMsg);
    const switchedCampaign = lastChatCampaignIdRef.current !== campaign.id;
    lastChatCampaignIdRef.current = campaign.id;
    setChatMessages((prev) => {
      if (switchedCampaign) {
        return visible.slice(-150);
      }
      const byId = new Map<string, ChatMessageEntry>();
      visible.forEach((m) => byId.set(m.id, m));
      prev.filter(canSeeMsg).forEach((m) => {
        if (!byId.has(m.id)) byId.set(m.id, m);
      });
      return Array.from(byId.values()).slice(-150);
    });
  }, [campaign.chatLog, campaign.id, myCharacter?.name, myPlayerId, myPlayerName, role]);

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
      if (tok.type === 'npc' && tok.referenceId) {
        const npc = camp.npcs.find((n) => n.id === tok.referenceId);
        if (npc) {
          if (saveSkillId === 'fortitude' || saveSkillId === 'con')
            return npc.saves?.fort ?? Math.floor(((npc.attributes?.['con'] ?? 10) - 10) / 2);
          if (saveSkillId === 'reflexos' || saveSkillId === 'des')
            return npc.saves?.ref ?? Math.floor(((npc.attributes?.['des'] ?? 10) - 10) / 2);
          if (saveSkillId === 'vontade' || saveSkillId === 'sab')
            return npc.saves?.von ?? Math.floor(((npc.attributes?.['sab'] ?? 10) - 10) / 2);
          if (saveSkillId === 'salv-forca' || saveSkillId === 'for')
            return npc.saves?.for ?? Math.floor(((npc.attributes?.['for'] ?? 10) - 10) / 2);
          if (saveSkillId === 'salv-inteligencia' || saveSkillId === 'int')
            return npc.saves?.int ?? Math.floor(((npc.attributes?.['int'] ?? 10) - 10) / 2);
          if (saveSkillId === 'salv-carisma' || saveSkillId === 'car')
            return npc.saves?.car ?? Math.floor(((npc.attributes?.['car'] ?? 10) - 10) / 2);
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
      removeConditionOnPassId?: string;
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
      const passedRemoveCondTokens: MapToken[] = [];
      const shouldAutoApplyKind = params.kind === 'aoe' || params.kind === 'trap';

      const entries: TacticalSaveTargetEntry[] = params.tokens.map((tok) => {
        const isMonsterOrNpc = tok.type !== 'character';
        if (isMonsterOrNpc) {
          const bonus = getTokenSaveBonus(tok, params.saveSkillId);
          const d20 = Math.floor(Math.random() * 20) + 1;
          const total = d20 + bonus;
          const passed = d20 === 20 || (d20 !== 1 && total >= params.dc);
          const dmg =
            rawDamage > 0
              ? passed
                ? params.halfOnSuccess
                  ? Math.floor(rawDamage / 2)
                  : 0
                : rawDamage
              : 0;
          const applyCond = Boolean(!passed && params.applyConditionId);
          if (passed && params.removeConditionOnPassId) {
            passedRemoveCondTokens.push(tok);
          }
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
            hpBeforeSave: tok.hp,
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
          hpBeforeSave: tok.hp,
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
        removeConditionOnPassId: params.removeConditionOnPassId,
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

      if (passedRemoveCondTokens.length > 0 && params.removeConditionOnPassId) {
        const condToRemove = params.removeConditionOnPassId;
        const tokIds = new Set(passedRemoveCondTokens.map((t) => t.id));
        updateCampaign((prev) => ({
          ...prev,
          maps: prev.maps.map((m) =>
            !m.tokens.some((t) => tokIds.has(t.id))
              ? m
              : {
                  ...m,
                  tokens: m.tokens.map((t) =>
                    tokIds.has(t.id)
                      ? {
                          ...t,
                          activeConditionIds: (t.activeConditionIds || []).filter(
                            (cid) => cid !== condToRemove
                          ),
                        }
                      : t
                  ),
                }
          ),
          combat: prev.combat.active
            ? {
                ...prev.combat,
                combatants: prev.combat.combatants.map((cb) =>
                  cb.tokenId && tokIds.has(cb.tokenId)
                    ? {
                        ...cb,
                        effects: cb.effects.filter((ef) => ef.conditionId !== condToRemove),
                      }
                    : cb
                ),
              }
            : prev.combat,
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
      const tok = camp.maps.flatMap((m) => m.tokens).find((t) => t.id === tokenId);
      const entry = prompt.targets.find((t) => t.tokenId === tokenId);
      if (!entry || entry.status !== 'pending') return;

      const bonus = tok ? getTokenSaveBonus(tok, prompt.saveSkillId) : 0;
      const ch = entry.characterId
        ? camp.characters.find((c) => c.id === entry.characterId)
        : undefined;
      const chStats = ch ? computeCharacterStats(ch, camp) : undefined;
      const saveDiceBonuses = chStats?.saveDiceBonuses || [];
      const saveFormula = `1d20 ${bonus >= 0 ? `+ ${bonus}` : `- ${Math.abs(bonus)}`}${
        saveDiceBonuses.length > 0 ? ` + ${saveDiceBonuses.join(' + ')}` : ''
      }`;

      openManualRoll({
        title: `${prompt.title} — ${prompt.saveLabel}`,
        subtitle: `Dificuldade: CD ${prompt.dc}`,
        formula: saveFormula,
        displayFormula: saveFormula,
        previewDice: buildPreviewDiceForFormula(saveFormula, 'normal'),
        rollerName: entry.name,
        rollerColor: entry.color,
        diceSkin: (ch?.diceSkin || 'gold') as DiceSkin,
        allowAdvantageToggle: true,
        advantageMode: 'normal',
        onCancel:
          prompt.kind === 'concentration'
            ? () => {
                const livePrompt = activeSavePromptRef.current;
                const liveEntry = livePrompt?.targets.find((t) => t.tokenId === tokenId);
                if (!livePrompt || !liveEntry || liveEntry.status !== 'pending') return;
                if (liveEntry.characterId) {
                  setCharacterConcentration(liveEntry.characterId, null);
                }
                const nextPrompt: TacticalSavePrompt = {
                  ...livePrompt,
                  targets: livePrompt.targets.map((t) =>
                    t.tokenId === tokenId ? { ...t, status: 'failed', applied: true } : t
                  ),
                };
                emitSavePromptState(nextPrompt);
                pushCombatLog({
                  category: 'condition',
                  actorName: liveEntry.name,
                  actorKind: 'hero',
                  actorColor: liveEntry.color,
                  summary: 'perdeu a Concentração (fechou o teste sem rolar)!',
                });
                showTacticalAlert(
                  `⚠️ ${liveEntry.name} fechou o teste sem rolar e perdeu a Concentração!`
                );
              }
            : undefined,
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

          let extraSaveDiceTotal = 0;
          for (const db of saveDiceBonuses) {
            const extraRes = evaluateFormula(db, chStats, ch);
            extraSaveDiceTotal += extraRes.total;
            rolledDice.push(...extraRes.rolledDice);
          }

          const total = d20 + bonus + extraSaveDiceTotal;
          const passed = d20 === 20 || (d20 !== 1 && total >= livePrompt.dc);
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
          // If a hero failed AND still has Heroic Inspiration points, hold off auto-applying so they can choose ★ Re-rolar or Aceitar Falha!
          const canHoldForInspiration = Boolean(
            !passed && ch && getHeroInspirationPoints(ch) > 0
          );

          const shouldAutoApply =
            !canHoldForInspiration &&
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
            !canHoldForInspiration &&
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

          if (
            !canHoldForInspiration &&
            livePrompt.kind === 'concentration' &&
            !passed &&
            liveEntry.characterId
          ) {
            setCharacterConcentration(liveEntry.characterId, null);
          }
          if (passed && livePrompt.removeConditionOnPassId) {
            const condToRemove = livePrompt.removeConditionOnPassId;
            updateCampaign((prev) => ({
              ...prev,
              characters: liveEntry.characterId
                ? prev.characters.map((c) =>
                    c.id === liveEntry.characterId
                      ? {
                          ...c,
                          activeConditionIds: c.activeConditionIds.filter(
                            (cid) => cid !== condToRemove
                          ),
                        }
                      : c
                  )
                : prev.characters,
              maps: prev.maps.map((m) =>
                !m.tokens.some((t) => t.id === tokenId)
                  ? m
                  : {
                      ...m,
                      tokens: m.tokens.map((t) =>
                        t.id === tokenId
                          ? {
                              ...t,
                              activeConditionIds: (t.activeConditionIds || []).filter(
                                (cid) => cid !== condToRemove
                              ),
                            }
                          : t
                      ),
                    }
              ),
              combat: prev.combat.active
                ? {
                    ...prev.combat,
                    combatants: prev.combat.combatants.map((cb) =>
                      cb.tokenId === tokenId ||
                      (liveEntry.characterId && cb.referenceId === liveEntry.characterId)
                        ? {
                            ...cb,
                            effects: cb.effects.filter((ef) => ef.conditionId !== condToRemove),
                          }
                        : cb
                    ),
                  }
                : prev.combat,
            }));
            showTacticalAlert(`✨ ${liveEntry.name} passou na salvaguarda e se livrou da condição!`);
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
    const allTokensById = new Map(camp.maps.flatMap((m) => m.tokens).map((x) => [x.id, x]));
    const rawDmg = prompt.rolledRawDamage || 0;
    const brokenConcCharIds: string[] = [];
    const passedRemoveCondEntries: TacticalSaveTargetEntry[] = [];
    const failedTrackedEntries: TacticalSaveTargetEntry[] = [];

    const nextTargets = prompt.targets.map((t) => {
      if (t.status !== 'pending') return t;
      const tok = allTokensById.get(t.tokenId);
      const bonus = tok ? getTokenSaveBonus(tok, prompt.saveSkillId) : 0;
      const targetChar = t.characterId
        ? camp.characters.find((c) => c.id === t.characterId)
        : undefined;
      const targetCharStats = targetChar ? computeCharacterStats(targetChar, camp) : undefined;
      let extraSaveDiceTotal = 0;
      for (const db of targetCharStats?.saveDiceBonuses || []) {
        extraSaveDiceTotal += evaluateFormula(db, targetCharStats, targetChar).total;
      }
      const d20 = Math.floor(Math.random() * 20) + 1;
      const total = d20 + bonus + extraSaveDiceTotal;
      const passed = d20 === 20 || (d20 !== 1 && total >= prompt.dc);
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
      if (passed && prompt.removeConditionOnPassId) {
        passedRemoveCondEntries.push(t);
      }
      const applyCond = Boolean(!passed && prompt.applyConditionId);
      if (applyCond) {
        failedTrackedEntries.push(t);
      }
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

    if (passedRemoveCondEntries.length > 0 && prompt.removeConditionOnPassId) {
      const condToRemove = prompt.removeConditionOnPassId;
      const tokIds = new Set(passedRemoveCondEntries.map((e) => e.tokenId));
      const charIds = new Set(
        passedRemoveCondEntries.map((e) => e.characterId).filter((id): id is string => Boolean(id))
      );
      updateCampaign((prev) => ({
        ...prev,
        characters: prev.characters.map((c) =>
          charIds.has(c.id)
            ? { ...c, activeConditionIds: c.activeConditionIds.filter((cid) => cid !== condToRemove) }
            : c
        ),
        maps: prev.maps.map((m) =>
          !m.tokens.some((t) => tokIds.has(t.id))
            ? m
            : {
                ...m,
                tokens: m.tokens.map((t) =>
                  tokIds.has(t.id)
                    ? {
                        ...t,
                        activeConditionIds: (t.activeConditionIds || []).filter(
                          (cid) => cid !== condToRemove
                        ),
                      }
                    : t
                ),
              }
        ),
        combat: prev.combat.active
          ? {
              ...prev.combat,
              combatants: prev.combat.combatants.map((cb) =>
                (cb.tokenId && tokIds.has(cb.tokenId)) ||
                (cb.type === 'character' && cb.referenceId && charIds.has(cb.referenceId))
                  ? { ...cb, effects: cb.effects.filter((ef) => ef.conditionId !== condToRemove) }
                  : cb
              ),
            }
          : prev.combat,
      }));
    }

    if (
      failedTrackedEntries.length > 0 &&
      prompt.casterCharacterId &&
      prompt.applyConditionId &&
      (prompt.requiresConcentration || prompt.singleTargetOnly)
    ) {
      updateCampaign((prev) => ({
        ...prev,
        characters: prev.characters.map((c) => {
          if (c.id !== prompt.casterCharacterId) return c;
          const key = normalizeAbilityKey(prompt.title);
          const prevEff = (c.activeTrackedEffects || []).find((e) => e.abilityKey === key);
          return upsertTrackedEffectOnCharacter(c, {
            abilityKey: key,
            abilityName: prompt.title,
            conditionId: prompt.applyConditionId,
            targetTokenIds: Array.from(
              new Set([...(prevEff?.targetTokenIds || []), ...failedTrackedEntries.map((e) => e.tokenId)])
            ),
            targetCharacterIds: Array.from(
              new Set([
                ...(prevEff?.targetCharacterIds || []),
                ...failedTrackedEntries
                  .map((e) => e.characterId)
                  .filter((id): id is string => Boolean(id)),
              ])
            ),
            targetNames: Array.from(
              new Set([...(prevEff?.targetNames || []), ...failedTrackedEntries.map((e) => e.name)])
            ),
            isConcentration: prompt.requiresConcentration,
            singleTargetOnly: prompt.singleTargetOnly,
          });
        }),
      }));
    }

    emitSavePromptState({ ...prompt, targets: nextTargets });
    soundEngine.playSfxPreset('dice');
    brokenConcCharIds.forEach((cid) => setCharacterConcentration(cid, null));
  }, [applyDamage, emitSavePromptState, getTokenSaveBonus, setCharacterConcentration, triggerSlashVfx, updateCampaign]);

  const acceptFailedSaveTarget = useCallback(
    (tokenId: string) => {
      const prompt = activeSavePromptRef.current;
      if (!prompt) return;
      const entry = prompt.targets.find((t) => t.tokenId === tokenId);
      if (!entry || entry.status !== 'failed' || entry.applied) return;

      const applyCond = Boolean(prompt.applyConditionId);
      if (prompt.kind === 'concentration' && entry.characterId) {
        setCharacterConcentration(entry.characterId, null);
      } else if (entry.damageToApply > 0 || applyCond) {
        if (prompt.casterName && entry.damageToApply > 0) {
          recordCombatStat(prompt.casterName, '#e0b84c', { damage: entry.damageToApply });
        }
        applyDamage(
          tokenId,
          entry.damageToApply,
          false,
          undefined,
          prompt.damageType,
          applyCond ? prompt.applyConditionId : undefined,
          prompt.conditionDurationRounds
        );
        if (entry.damageToApply > 0) triggerSlashVfx(tokenId, 'hit');
        if (
          applyCond &&
          prompt.casterCharacterId &&
          (prompt.requiresConcentration || prompt.singleTargetOnly)
        ) {
          updateCampaign((prev) => ({
            ...prev,
            characters: prev.characters.map((c) => {
              if (c.id !== prompt.casterCharacterId) return c;
              const key = normalizeAbilityKey(prompt.title);
              const prevEff = (c.activeTrackedEffects || []).find((e) => e.abilityKey === key);
              return upsertTrackedEffectOnCharacter(c, {
                abilityKey: key,
                abilityName: prompt.title,
                conditionId: prompt.applyConditionId,
                targetTokenIds: Array.from(new Set([...(prevEff?.targetTokenIds || []), tokenId])),
                targetCharacterIds: Array.from(
                  new Set([
                    ...(prevEff?.targetCharacterIds || []),
                    ...(entry.characterId ? [entry.characterId] : []),
                  ])
                ),
                targetNames: Array.from(new Set([...(prevEff?.targetNames || []), entry.name])),
                isConcentration: prompt.requiresConcentration,
                singleTargetOnly: prompt.singleTargetOnly,
              });
            }),
          }));
        }
      }

      emitSavePromptState({
        ...prompt,
        targets: prompt.targets.map((t) =>
          t.tokenId === tokenId ? { ...t, applied: true } : t
        ),
      });
    },
    [applyDamage, emitSavePromptState, setCharacterConcentration, triggerSlashVfx, updateCampaign]
  );

  const applySavePromptDamages = useCallback(() => {
    const prompt = activeSavePromptRef.current;
    if (!prompt) return;
    const failedTracked: TacticalSaveTargetEntry[] = [];
    const nextTargets = prompt.targets.map((t) => {
      if (t.status === 'pending' || t.applied) return t;
      const applyCond = Boolean(t.status === 'failed' && prompt.applyConditionId);
      if (prompt.kind === 'concentration' && t.status === 'failed' && t.characterId) {
        setCharacterConcentration(t.characterId, null);
      } else if (t.damageToApply > 0 || applyCond) {
        applyDamage(
          t.tokenId,
          t.damageToApply,
          false,
          undefined,
          prompt.damageType,
          applyCond ? prompt.applyConditionId : undefined,
          prompt.conditionDurationRounds
        );
        if (t.damageToApply > 0) triggerSlashVfx(t.tokenId, 'hit');
        if (applyCond) failedTracked.push(t);
      }
      return { ...t, applied: true };
    });
    if (
      failedTracked.length > 0 &&
      prompt.casterCharacterId &&
      prompt.applyConditionId &&
      (prompt.requiresConcentration || prompt.singleTargetOnly)
    ) {
      updateCampaign((prev) => ({
        ...prev,
        characters: prev.characters.map((c) => {
          if (c.id !== prompt.casterCharacterId) return c;
          const key = normalizeAbilityKey(prompt.title);
          const prevEff = (c.activeTrackedEffects || []).find((e) => e.abilityKey === key);
          return upsertTrackedEffectOnCharacter(c, {
            abilityKey: key,
            abilityName: prompt.title,
            conditionId: prompt.applyConditionId,
            targetTokenIds: Array.from(
              new Set([...(prevEff?.targetTokenIds || []), ...failedTracked.map((e) => e.tokenId)])
            ),
            targetCharacterIds: Array.from(
              new Set([
                ...(prevEff?.targetCharacterIds || []),
                ...failedTracked
                  .map((e) => e.characterId)
                  .filter((id): id is string => Boolean(id)),
              ])
            ),
            targetNames: Array.from(
              new Set([...(prevEff?.targetNames || []), ...failedTracked.map((e) => e.name)])
            ),
            isConcentration: prompt.requiresConcentration,
            singleTargetOnly: prompt.singleTargetOnly,
          });
        }),
      }));
    }
    emitSavePromptState({ ...prompt, targets: nextTargets });
    soundEngine.playSfxPreset('fireball');

    const queuedAuto = pendingAutoCombatOnSaveRef.current;
    if (queuedAuto && prompt.kind === 'aoe') {
      pendingAutoCombatOnSaveRef.current = null;
      if (!campaignRef.current.combat.active) {
        window.setTimeout(() => {
          startCombatFromMapRef.current?.({
            openingAttacker: {
              tokenId: queuedAuto.tokenId,
              characterId: queuedAuto.characterId,
              actionCost: queuedAuto.actionCost,
            },
            reason: queuedAuto.reason,
          });
        }, 420);
      }
    }
  }, [applyDamage, emitSavePromptState, setCharacterConcentration, triggerSlashVfx, updateCampaign]);

  const triggerSecretPassage = useCallback((markerId: string, token?: MapToken) => {
    const camp = campaignRef.current;
    // Search ALL maps (not just global activeMapId) so split-party players still trigger passages after another hero crossed!
    const sourceMap =
      camp.maps.find((m) => (m.gmMarkers || []).some((gm) => gm.id === markerId && gm.kind === 'secret')) ||
      camp.maps.find((m) => m.id === camp.activeMapId) ||
      camp.maps[0];
    const marker = sourceMap?.gmMarkers?.find((gm) => gm.id === markerId);
    if (!sourceMap || !marker || marker.kind !== 'secret') return;
    const targetMap = marker.targetMapId
      ? camp.maps.find((m) => m.id === marker.targetMapId)
      : undefined;
    const targetMarker =
      targetMap && marker.targetMarkerId
        ? (targetMap.gmMarkers || []).find((gm) => gm.id === marker.targetMarkerId)
        : undefined;

    const myChar =
      roleRef.current === 'player'
        ? camp.characters.find((c) => c.ownerPlayerId === myPlayerId || c.id === activeCharRef.current)
        : undefined;
    const isSpottedByMe = Boolean(myChar && marker.visibleToCharacterIds?.includes(myChar.id));

    const alertPayload: SecretPassageAlert = {
      id: `passage-${Date.now()}`,
      markerId: marker.id,
      markerTitle: marker.title,
      markerDescription: marker.description,
      sourceMapId: sourceMap.id,
      targetMapId: targetMap?.id,
      targetMapName: targetMap?.name,
      targetMarkerId: targetMarker?.id,
      targetMarkerTitle: targetMarker?.title,
      tokenId: token?.id,
      tokenName: token?.name,
      revealed: marker.revealed,
      visibleToCharacterIds: marker.visibleToCharacterIds,
    };

    if (roleRef.current === 'gm' || marker.revealed || isSpottedByMe) {
      setActiveSecretPassage(alertPayload);
      soundEngine.playSfxPreset('magic');
    }
    if (roleRef.current !== 'gm' && socketRef.current?.connected) {
      socketRef.current.emit('passage:triggered', alertPayload);
    }
  }, [myPlayerId]);

  const dismissSecretPassage = useCallback(() => {
    setActiveSecretPassage(null);
  }, []);

  const moveTokensToMap = useCallback(
    (
      sourceMapId: string,
      targetMapId: string,
      tokenIds: string[] | 'all-heroes',
      targetMarkerId?: string
    ) => {
      if (sourceMapId === targetMapId) return;
      updateCampaign((prev) => {
        const srcMap = prev.maps.find((m) => m.id === sourceMapId);
        const dstMap = prev.maps.find((m) => m.id === targetMapId);
        if (!srcMap || !dstMap) return prev;

        const isMovingWholeParty = tokenIds === 'all-heroes';
        const movingTokens = isMovingWholeParty
          ? srcMap.tokens.filter((t) => t.type === 'character')
          : srcMap.tokens.filter((t) => tokenIds.includes(t.id));
        if (movingTokens.length === 0) {
          return isMovingWholeParty ? { ...prev, activeMapId: targetMapId } : prev;
        }

        const dstAnchor = targetMarkerId
          ? (dstMap.gmMarkers || []).find((gm) => gm.id === targetMarkerId)
          : undefined;
        const movingIds = new Set(movingTokens.map((t) => t.id));
        const movingCharRefIds = new Set(
          movingTokens
            .filter((t) => t.type === 'character' && t.referenceId)
            .map((t) => t.referenceId!)
        );

        const nextDstTokens = [...dstMap.tokens];
        const relocatedTokens: MapToken[] = [];
        movingTokens.forEach((tok, idx) => {
          const alreadyIdx = nextDstTokens.findIndex(
            (existing) =>
              existing.id === tok.id ||
              (tok.type === 'character' &&
                tok.referenceId &&
                existing.type === 'character' &&
                existing.referenceId === tok.referenceId)
          );
          const anchorX = dstAnchor ? dstAnchor.x : Math.min(dstMap.gridWidth - 1, 2 + idx);
          const anchorY = dstAnchor ? dstAnchor.y : Math.min(dstMap.gridHeight - 1, 2);
          const spawnPos = findNearestFreeGridCell(
            { ...dstMap, tokens: nextDstTokens },
            anchorX,
            anchorY,
            tok.size
          );
          const relocated: MapToken = { ...tok, x: spawnPos.x, y: spawnPos.y };
          relocatedTokens.push(relocated);
          if (alreadyIdx >= 0) {
            nextDstTokens[alreadyIdx] = relocated;
          } else {
            nextDstTokens.push(relocated);
          }
        });

        let nextDstRevealed = dstMap.revealedCells;
        if (dstMap.fogEnabled && relocatedTokens.length > 0) {
          const sqM = Math.max(0.5, prev.settings.gridSquareMeters || 1.5);
          const dstEffTerrain = getEffectiveTerrainCells(dstMap);
          const dstEffWallMeta = getEffectiveWallMeta(dstMap);
          const revealedSet = new Set(dstMap.revealedCells);
          let revealedChanged = false;
          for (const rt of relocatedTokens) {
            // Only Shared Light reveals party Fog of War (Personal Darkvision stays private!)
            if (rt.lightMode === 'personal-darkvision' || rt.lightSource === 'darkvision') {
              continue;
            }
            const radM =
              typeof rt.lightRadiusMeters === 'number' && rt.lightRadiusMeters > 0
                ? rt.lightRadiusMeters
                : rt.lightSource === 'torch'
                  ? 6
                  : rt.lightSource === 'lantern'
                    ? 9
                    : 0;
            if (radM <= 0) continue;
            const radSq = radM / sqM;
            const cx = rt.x + (rt.size || 1) / 2;
            const cy = rt.y + (rt.size || 1) / 2;
            const minX = Math.max(0, Math.floor(cx - radSq - 1));
            const maxX = Math.min(dstMap.gridWidth - 1, Math.ceil(cx + radSq + 1));
            const minY = Math.max(0, Math.floor(cy - radSq - 1));
            const maxY = Math.min(dstMap.gridHeight - 1, Math.ceil(cy + radSq + 1));
            for (let gx = minX; gx <= maxX; gx++) {
              for (let gy = minY; gy <= maxY; gy++) {
                if (Math.hypot(gx + 0.5 - cx, gy + 0.5 - cy) <= radSq + 0.35) {
                  if (
                    !hasContinuousWallLineOfSight(
                      dstEffTerrain,
                      dstEffWallMeta,
                      cx,
                      cy,
                      gx + 0.5,
                      gy + 0.5
                    )
                  ) {
                    continue;
                  }
                  const key = `${gx},${gy}`;
                  if (!revealedSet.has(key)) {
                    revealedSet.add(key);
                    revealedChanged = true;
                  }
                }
              }
            }
          }
          if (revealedChanged) nextDstRevealed = Array.from(revealedSet);
        }

        // Individual hero crossing: keep global activeMapId untouched for GM & other players,
        // and auto-enable 'token-map' view mode so the crossing player's camera follows their token to the destination!
        const movedAnyHeroIndividually =
          !isMovingWholeParty && movingTokens.some((t) => t.type === 'character');

        return {
          ...prev,
          activeMapId: isMovingWholeParty ? targetMapId : prev.activeMapId,
          settings: isMovingWholeParty
            ? { ...prev.settings, playerVisibleMapId: targetMapId }
            : movedAnyHeroIndividually
              ? { ...prev.settings, mapViewMode: 'token-map' }
              : prev.settings,
          maps: prev.maps.map((m) => {
            if (m.id === sourceMapId) {
              return {
                ...m,
                tokens: m.tokens.filter(
                  (t) =>
                    !movingIds.has(t.id) &&
                    !(t.type === 'character' && t.referenceId && movingCharRefIds.has(t.referenceId))
                ),
              };
            }
            if (m.id === targetMapId) {
              return { ...m, tokens: nextDstTokens, revealedCells: nextDstRevealed };
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
    const livePrompt = activeSavePromptRef.current;
    let updatedPrompt: TacticalSavePrompt | null = null;
    if (livePrompt) {
      const isOwnedByMe = (t: TacticalSaveTargetEntry) =>
        roleRef.current === 'gm' ||
        (t.characterId &&
          (campaignRef.current.characters.some(
            (c) => c.id === t.characterId && c.ownerPlayerId === myPlayerId
          ) ||
            t.characterId === activeCharRef.current));

      if (livePrompt.kind === 'concentration') {
        const pendingTargets = livePrompt.targets.filter(
          (t) => t.status === 'pending' && t.characterId && isOwnedByMe(t)
        );
        if (pendingTargets.length > 0) {
          const failedIds = new Set(pendingTargets.map((t) => t.tokenId));
          pendingTargets.forEach((t) => {
            if (t.characterId) {
              setCharacterConcentration(t.characterId, null);
              pushCombatLog({
                category: 'condition',
                actorName: t.name,
                actorKind: 'hero',
                actorColor: t.color,
                summary: 'perdeu a Concentração (fechou o teste sem rolar)!',
              });
            }
          });
          showTacticalAlert(
            `⚠️ ${pendingTargets.map((t) => t.name).join(', ')} fechou o teste sem rolar e perdeu a Concentração!`
          );
          updatedPrompt = {
            ...livePrompt,
            targets: livePrompt.targets.map((t) =>
              failedIds.has(t.tokenId) ? { ...t, status: 'failed', applied: true } : t
            ),
          };
        }
      } else if (livePrompt.kind === 'aoe' || livePrompt.kind === 'trap') {
        // Anti-exploit: if closing while an AoE/Trap failed save is still unapplied (held for Inspiration), auto-apply its damage/condition now!
        const unappliedOwned = livePrompt.targets.filter(
          (t) => t.status === 'failed' && !t.applied && isOwnedByMe(t)
        );
        if (unappliedOwned.length > 0) {
          const appliedIds = new Set(unappliedOwned.map((t) => t.tokenId));
          unappliedOwned.forEach((t) => {
            const applyCond = Boolean(livePrompt.applyConditionId);
            if (t.damageToApply > 0 || applyCond) {
              applyDamage(
                t.tokenId,
                t.damageToApply,
                false,
                undefined,
                livePrompt.damageType,
                applyCond ? livePrompt.applyConditionId : undefined,
                livePrompt.conditionDurationRounds
              );
              if (t.damageToApply > 0) triggerSlashVfx(t.tokenId, 'hit');
            }
          });
          updatedPrompt = {
            ...livePrompt,
            targets: livePrompt.targets.map((t) =>
              appliedIds.has(t.tokenId) ? { ...t, applied: true } : t
            ),
          };
        }
        // Block non-GM players from dismissing while they STILL have a pending unrolled AoE/Trap save!
        if (
          roleRef.current !== 'gm' &&
          livePrompt.targets.some((t) => t.status === 'pending' && isOwnedByMe(t))
        ) {
          showTacticalAlert('Role sua Salvaguarda antes de fechar este painel!');
          return;
        }
      }
    }
    if (roleRef.current === 'gm') {
      emitSavePromptState(null);
    } else if (
      updatedPrompt &&
      updatedPrompt.targets.every((t) => t.status !== 'pending' && t.applied)
    ) {
      emitSavePromptState(null);
    } else {
      if (updatedPrompt) {
        emitSavePromptState(updatedPrompt);
      }
      // Players closing a shared multi-target save prompt only dismiss it locally without wiping GM/other players
      activeSavePromptRef.current = null;
      setActiveSavePrompt(null);
    }
    const queuedAuto = pendingAutoCombatOnSaveRef.current;
    if (queuedAuto && livePrompt?.kind === 'aoe') {
      pendingAutoCombatOnSaveRef.current = null;
      if (!campaignRef.current.combat.active) {
        window.setTimeout(() => {
          startCombatFromMapRef.current?.({
            openingAttacker: {
              tokenId: queuedAuto.tokenId,
              characterId: queuedAuto.characterId,
              actionCost: queuedAuto.actionCost,
            },
            reason: queuedAuto.reason,
          });
        }, 280);
      }
    }
  }, [applyDamage, emitSavePromptState, myPlayerId, pushCombatLog, setCharacterConcentration, showTacticalAlert, triggerSlashVfx]);

  const triggerTrapOnToken = useCallback(
    (markerId: string, token: MapToken) => {
      const camp = campaignRef.current;
      const activeMap =
        camp.maps.find((m) => (m.gmMarkers || []).some((gm) => gm.id === markerId)) ||
        camp.maps.find((m) => m.id === camp.activeMapId) ||
        camp.maps[0];
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
      const activeMap =
        camp.maps.find((m) => m.templates.some((t) => t.id === templateId)) ||
        camp.maps.find((m) => m.id === camp.activeMapId) ||
        camp.maps[0];
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

  const setLocallyDraggedTokenIds = useCallback((ids: string[]) => {
    locallyDraggedTokensRef.current = new Set(ids);
  }, []);

  const flushPendingTokenMoves = useCallback(() => {
    if (tokenMoveFlushTimerRef.current !== null) {
      window.clearTimeout(tokenMoveFlushTimerRef.current);
      tokenMoveFlushTimerRef.current = null;
    }
    const pending = pendingTokenMovesRef.current;
    if (!pending || pending.moves.size === 0) {
      pendingTokenMovesRef.current = null;
      return;
    }
    const movesArr = Array.from(pending.moves.entries()).map(([id, pos]) => ({
      id,
      x: pos.x,
      y: pos.y,
    }));
    const mapId = pending.mapId;
    pendingTokenMovesRef.current = null;
    lastTokenMoveEmitRef.current = Date.now();
    if (socketRef.current?.connected) {
      socketRef.current.emit('token:move', { mapId, moves: movesArr });
    }
  }, []);

  const moveTokensLive = useCallback(
    (mapId: string, moves: Array<{ id: string; x: number; y: number }>, flushNow = false) => {
      if (!mapId || moves.length === 0) return;

      const moveById = new Map<string, { x: number; y: number }>();
      for (const mv of moves) {
        moveById.set(mv.id, { x: mv.x, y: mv.y });
      }

      // Immediate local UI update without emitting a 215KB campaign:patch
      setCampaign((prev) => {
        let anyChanged = false;
        const nextMaps = prev.maps.map((m) => {
          if (m.id !== mapId) return m;
          let mapChanged = false;
          const nextTokens = m.tokens.map((t) => {
            const mv = moveById.get(t.id);
            if (!mv || (t.x === mv.x && t.y === mv.y)) return t;
            mapChanged = true;
            anyChanged = true;
            return { ...t, x: mv.x, y: mv.y };
          });
          return mapChanged ? { ...m, tokens: nextTokens } : m;
        });
        if (!anyChanged) return prev;
        const nextState = { ...prev, maps: nextMaps };
        campaignRef.current = nextState;
        return nextState;
      });

      // Merge into throttled ~45ms delta queue (or flush immediately on drop)
      if (!pendingTokenMovesRef.current || pendingTokenMovesRef.current.mapId !== mapId) {
        if (pendingTokenMovesRef.current) {
          flushPendingTokenMoves();
        }
        pendingTokenMovesRef.current = { mapId, moves: new Map() };
      }
      for (const mv of moves) {
        pendingTokenMovesRef.current.moves.set(mv.id, { x: mv.x, y: mv.y });
      }

      const elapsed = Date.now() - lastTokenMoveEmitRef.current;
      if (flushNow || elapsed >= 45) {
        flushPendingTokenMoves();
      } else if (tokenMoveFlushTimerRef.current === null) {
        tokenMoveFlushTimerRef.current = window.setTimeout(() => {
          flushPendingTokenMoves();
        }, Math.max(10, 45 - elapsed));
      }
    },
    [flushPendingTokenMoves]
  );

  const sendChatMessage = useCallback(
    (
      rawText: string,
      explicitRecipient?: string,
      imageUrl?: string,
      options?: {
        speakerOverride?: {
          name: string;
          color: string;
          tokenId?: string;
          npcId?: string;
          fireBubble?: boolean;
        };
      }
    ) => {
      let text = (rawText || '').trim();
      const cleanImageUrl = imageUrl?.trim() || undefined;
      if (!text && !cleanImageUrl) return;

      let recipientName = explicitRecipient?.trim() || '';
      let isWhisper = Boolean(recipientName);
      let triggerSpeechBubble = Boolean(options?.speakerOverride?.fireBubble);

      // Parse /falar <texto> or /say <texto> — fires RP speech bubble above speaker's token!
      const sayMatch = text.match(/^\/(?:falar|fala|say|s)\s+(.+)$/i);
      if (sayMatch) {
        text = sayMatch[1].trim();
        triggerSpeechBubble = true;
      }

      // Parse /w Nome mensagem or /sussurro Nome mensagem (or /w Nome with image only)
      const whisperMatch =
        text.match(/^\/(?:w|whisper|sussurro)\s+"([^"]+)"\s+(.+)$/i) ||
        text.match(/^\/(?:w|whisper|sussurro)\s+(\S+)\s+(.+)$/i);
      if (whisperMatch) {
        recipientName = whisperMatch[1].trim();
        text = whisperMatch[2].trim();
        isWhisper = Boolean(recipientName);
        triggerSpeechBubble = false;
      } else if (cleanImageUrl) {
        const whisperImgOnly =
          text.match(/^\/(?:w|whisper|sussurro)\s+"([^"]+)"\s*$/i) ||
          text.match(/^\/(?:w|whisper|sussurro)\s+(\S+)\s*$/i);
        if (whisperImgOnly) {
          recipientName = whisperImgOnly[1].trim();
          text = '';
          isWhisper = Boolean(recipientName);
          triggerSpeechBubble = false;
        }
      }

      const activeChar =
        roleRef.current === 'player'
          ? campaignRef.current.characters.find((c) => c.ownerPlayerId === myPlayerId) ||
            campaignRef.current.characters.find((c) => c.id === activeCharRef.current)
          : undefined;

      const recLowerClean = recipientName.toLowerCase();
      const gmNameLower = (campaignRef.current.gmName || 'Mestre').trim().toLowerCase();
      const isWhisperToGm =
        isWhisper && (recLowerClean === 'mestre' || recLowerClean === 'gm' || recLowerClean === gmNameLower);
      const matchedOnline =
        recipientName && !isWhisperToGm
          ? connectedPlayers.find(
              (p) =>
                p.role !== 'gm' &&
                (p.playerName.trim().toLowerCase() === recLowerClean ||
                  (p.characterName || '').trim().toLowerCase() === recLowerClean)
            )
          : isWhisperToGm
            ? connectedPlayers.find((p) => p.role === 'gm')
            : undefined;
      const matchedCharOwnerId =
        !matchedOnline && recipientName && !isWhisperToGm
          ? campaignRef.current.characters.find(
              (c) => c.name.trim().toLowerCase() === recLowerClean
            )?.ownerPlayerId
          : undefined;

      const override = options?.speakerOverride;
      const resolvedSenderName = override
        ? override.name
        : roleRef.current === 'gm'
          ? campaignRef.current.gmName || 'Mestre'
          : activeChar?.name || myPlayerName || 'Aventureiro';
      const resolvedSenderColor = override
        ? override.color
        : roleRef.current === 'gm'
          ? '#f59e0b'
          : activeChar?.playerColor || myPlayerColor || '#38bdf8';

      const msg: ChatMessageEntry = {
        id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        senderName: resolvedSenderName,
        senderRole: roleRef.current,
        senderColor: resolvedSenderColor,
        senderPlayerId: myPlayerId,
        characterName: activeChar?.name,
        recipientName: isWhisper ? (isWhisperToGm ? 'Mestre' : recipientName) : undefined,
        recipientPlayerId: matchedOnline?.playerId || matchedCharOwnerId,
        isWhisper,
        text,
        imageUrl: cleanImageUrl,
        speakerTokenId: override?.tokenId,
      };

      if (socketRef.current?.connected) {
        socketRef.current.emit('chat:send', msg);
      } else {
        setChatMessages((prev) => [...prev, msg].slice(-150));
      }

      // Trigger floating RP Speech Bubble on map token when /falar was used or GM spoke as NPC/Monster
      if (!isWhisper && triggerSpeechBubble && text) {
        const curr = campaignRef.current;
        let speechMap =
          (override?.tokenId &&
            curr.maps.find((m) => m.tokens.some((t) => t.id === override.tokenId))) ||
          (activeChar &&
            curr.maps.find((m) =>
              m.tokens.some((t) => t.type === 'character' && t.referenceId === activeChar.id)
            )) ||
          curr.maps.find((m) => m.id === curr.activeMapId) ||
          curr.maps[0];
        if (speechMap) {
          let targetTokId = override?.tokenId;
          if (!targetTokId && activeChar) {
            targetTokId = speechMap.tokens.find(
              (t) => t.type === 'character' && t.referenceId === activeChar.id
            )?.id;
          }
          if (targetTokId) {
            emitTokenSpeech({
              mapId: speechMap.id,
              tokenId: targetTokId,
              speakerName: resolvedSenderName,
              color: resolvedSenderColor,
              text: text.slice(0, 140),
            });
          }
        }
      }
    },
    [connectedPlayers, emitTokenSpeech, myPlayerColor, myPlayerId, myPlayerName]
  );

  const markChatRead = useCallback(() => {
    setUnreadChatCount(0);
  }, []);

  const startCombatFromMap = useCallback(
    (options?: {
      forceReroll?: boolean;
      openingAttacker?: {
        tokenId?: string;
        characterId?: string;
        actionCost?: ActionEconomyCost;
        isWeaponAttack?: boolean;
      };
      reason?: string;
    }) => {
      const curr = campaignRef.current;
      if (curr.combat.active && !options?.forceReroll) return;
      combatStatsRef.current = {};
      const openingAttacker = options?.openingAttacker;
      const activeMap =
        (openingAttacker?.tokenId &&
          curr.maps.find((m) => m.tokens.some((t) => t.id === openingAttacker.tokenId))) ||
        (openingAttacker?.characterId &&
          curr.maps.find((m) =>
            m.tokens.some(
              (t) => t.type === 'character' && t.referenceId === openingAttacker.characterId
            )
          )) ||
        curr.maps.find((m) => m.id === curr.activeMapId);
      const tokens = activeMap?.tokens || [];
      if (tokens.length === 0) return;
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
        } else if (tok.type === 'npc' && tok.referenceId) {
          const npc = curr.npcs.find((n) => n.id === tok.referenceId);
          if (npc) {
            initBonus =
              npc.initiativeBonus ?? Math.floor(((npc.attributes?.['des'] ?? 10) - 10) / 2);
            speedMeters = npc.speed || 9;
            portraitUrl = npc.imageUrl || portraitUrl;
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

        const condIdsForInit =
          tok.type === 'character' && tok.referenceId
            ? curr.characters.find((c) => c.id === tok.referenceId)?.activeConditionIds || []
            : tok.activeConditionIds || [];
        const extraEcon = getConditionExtraEconomy(condIdsForInit, curr);
        const maxActs = 1 + extraEcon.extraActions;
        const maxBon = 1 + extraEcon.extraBonusActions;

        const baseCombatant: Combatant = {
          id: `comb-${tok.id}`,
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

        // BG3 Opening Strike Rule: mark the attacker's opening action cost as already spent in Round 1
        const isOpeningAttacker = Boolean(
          openingAttacker &&
            ((openingAttacker.tokenId && tok.id === openingAttacker.tokenId) ||
              (openingAttacker.characterId &&
                tok.type === 'character' &&
                tok.referenceId === openingAttacker.characterId))
        );
        if (isOpeningAttacker && openingAttacker?.actionCost && openingAttacker.actionCost !== 'Livre') {
          const chForOpening =
            tok.type === 'character' && tok.referenceId
              ? curr.characters.find((c) => c.id === tok.referenceId)
              : undefined;
          const attacksPerAction = chForOpening
            ? getCharacterAttacksPerAction(chForOpening)
            : 1;
          return {
            ...consumeCombatantEconomy(baseCombatant, openingAttacker.actionCost, {
              isWeaponAttack: Boolean(openingAttacker.isWeaponAttack),
              attacksPerAction,
            }),
            pendingOpeningCost: openingAttacker.actionCost,
            pendingOpeningIsWeaponAttack: Boolean(openingAttacker.isWeaponAttack),
          };
        }
        return baseCombatant;
      });

      combatants.sort(compareInitiativeOrder);
      // If the opening attacker happens to be 1st in initiative (index 0), their Round 1 turn starts right now
      // so clear `pendingOpeningCost` (the action is already spent on index 0); otherwise keep `pendingOpeningCost`
      // so InitiativeBar.changeTurn preserves the spent opening action when their actual Round 1 turn arrives!
      if (combatants[0]?.pendingOpeningCost) {
        combatants[0] = {
          ...combatants[0],
          pendingOpeningCost: null,
          pendingOpeningIsWeaponAttack: false,
        };
      }
      ceremonyEntries.sort((a, b) =>
        compareInitiativeOrder(
          { initiative: a.total, d20Roll: a.d20Roll, initBonus: a.bonus },
          { initiative: b.total, d20Roll: b.d20Roll, initBonus: b.bonus }
        )
      );

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

      if (options?.reason) {
        pushCombatLog({
          category: 'system',
          actorName: 'Combate',
          actorKind: 'system',
          actorColor: '#e0b84c',
          summary: `Combate iniciado automaticamente (${options.reason})!`,
        });
      }

      sendRoll({
        rollerName: options?.reason ? 'Combate' : 'Mestre',
        rollerRole: 'gm',
        rollerColor: '#e0b84c',
        diceSkin: 'gold',
        title: options?.reason
          ? `Combate Iniciado! (${options.reason})`
          : 'Combate Iniciado! (Ordem de Iniciativa)',
        formula: '1d20 + INI',
        individualRolls: [],
        total: combatants[0]?.initiative || 0,
        isSecret: false,
        details: combatants
          .filter((c) => !c.isHidden)
          .map((c, idx) => `${idx + 1}º ${c.name} (${c.initiative})`)
          .join(' → '),
      });
    },
    [pushCombatLog, sendRoll, showInitiativeCeremony, updateCampaign]
  );

  useEffect(() => {
    startCombatFromMapRef.current = startCombatFromMap;
  }, [startCombatFromMap]);

  useEffect(() => {
    startDuelRef.current = startCombatDuel;
  }, [startCombatDuel]);

  const castAoEAbility = useCallback(
    (
      choice: PendingAttackChoice,
      originX: number,
      originY: number,
      angleDeg: number,
      options?: { skipCostAndEconomy?: boolean }
    ) => {
      const skipCost = Boolean(options?.skipCostAndEconomy);
      const curr = campaignRef.current;
      const viewedIdForAoe = resolveViewedMapId(
        curr,
        roleRef.current,
        roleRef.current === 'player' ? choice.attackerCharacterId || activeCharRef.current : undefined
      );
      const activeMap =
        curr.maps.find((m) => m.id === viewedIdForAoe) ||
        curr.maps.find((m) => m.id === curr.activeMapId) ||
        curr.maps[0];
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
      const aoeCasterTokLookup =
        (choice.attackerTokenId && activeMap.tokens.find((t) => t.id === choice.attackerTokenId)) ||
        (choice.attackerCharacterId &&
          activeMap.tokens.find(
            (t) => t.type === 'character' && t.referenceId === choice.attackerCharacterId
          )) ||
        undefined;
      const casterMonsterDef =
        !char && aoeCasterTokLookup?.type === 'monster' && aoeCasterTokLookup.referenceId
          ? curr.compendium.monsters.find((m) => m.id === aoeCasterTokLookup.referenceId)
          : undefined;
      const casterNpcDef =
        !char && aoeCasterTokLookup?.type === 'npc' && aoeCasterTokLookup.referenceId
          ? curr.npcs.find((n) => n.id === aoeCasterTokLookup.referenceId)
          : undefined;
      const stats = char
        ? computeCharacterStats(char, curr)
        : computeSyntheticEntityStats(casterMonsterDef || casterNpcDef, curr);
      const matchingAbilityForAoeCost =
        char?.customAbilities?.find(
          (ab) => normalizeAbilityKey(ab.name) === normalizeAbilityKey(choice.actionTitle)
        ) ||
        curr.compendium.abilities.find(
          (ab) => normalizeAbilityKey(ab.name) === normalizeAbilityKey(choice.actionTitle)
        );
      const rawAoeCost = normalizeActionEconomyCost(choice.actionCost);
      const actionCost: ActionEconomyCost =
        rawAoeCost !== 'Reação' && matchingAbilityForAoeCost?.actionType
          ? normalizeActionEconomyCost(matchingAbilityForAoeCost.actionType)
          : rawAoeCost;
      const combat = curr.combat;
      const attackerCb = combat.active
        ? combat.combatants.find(
            (cb) =>
              (choice.attackerTokenId && cb.tokenId === choice.attackerTokenId) ||
              (choice.attackerCharacterId && cb.referenceId === choice.attackerCharacterId)
          )
        : undefined;

      const aoeEffTerrain = getEffectiveTerrainCells(activeMap);
      const aoeEffWallMeta = getEffectiveWallMeta(activeMap);
      const aoeCasterTokPre =
        (choice.attackerTokenId && activeMap.tokens.find((t) => t.id === choice.attackerTokenId)) ||
        (choice.attackerCharacterId &&
          activeMap.tokens.find(
            (t) => t.type === 'character' && t.referenceId === choice.attackerCharacterId
          )) ||
        undefined;

      // Dead / Incapacitated / Combat Turn / Action Economy / Resource Guards (matching startCombatDuel!)
      if ((char && char.hp <= 0) || (aoeCasterTokPre && aoeCasterTokPre.hp <= 0)) {
        setPendingAttackChoice(null);
        showTacticalAlert(`${choice.attackerName} está caído (0 PV) e não pode conjurar!`);
        return;
      }
      const aoeCondIds = char?.activeConditionIds || aoeCasterTokPre?.activeConditionIds || [];
      const aoeIncap = aoeCondIds
        .map((cid) => curr.compendium.conditions.find((c) => c.id === cid))
        .find((c) => c && /paralisad|atordoad|petrificad|inconscient|incapacitad/i.test(c.name));
      if (aoeIncap && roleRef.current === 'player') {
        setPendingAttackChoice(null);
        showTacticalAlert(
          `${choice.attackerName} está ${aoeIncap.icon} ${aoeIncap.name} e não pode agir!`
        );
        return;
      }
      const isReadyTriggerAoe = Boolean(
        combat.active &&
          attackerCb &&
          (choice.isReadyReactionTrigger ||
            (actionCost === 'Padrão' &&
              attackerCb.readyAction &&
              attackerCb.reactionAvailable !== false &&
              combat.combatants[combat.currentTurnIndex]?.id !== attackerCb.id))
      );
      if (!skipCost && combat.active && attackerCb) {
        const activeTurnCb = combat.combatants[combat.currentTurnIndex];
        if (
          roleRef.current === 'player' &&
          actionCost !== 'Reação' &&
          actionCost !== 'Livre' &&
          !isReadyTriggerAoe &&
          activeTurnCb &&
          activeTurnCb.id !== attackerCb.id
        ) {
          showTacticalAlert(`Aguarde seu turno! Turno atual: ${activeTurnCb.name}.`);
          return;
        }
        if (actionCost === 'Padrão' && !isReadyTriggerAoe && attackerCb.actionAvailable === false) {
          showTacticalAlert(`${attackerCb.name} já gastou a Ação Padrão neste turno!`);
          return;
        }
        if (actionCost === 'Bônus' && attackerCb.bonusActionAvailable === false) {
          showTacticalAlert(`${attackerCb.name} já gastou a Ação Bônus neste turno!`);
          return;
        }
        if (
          (actionCost === 'Reação' || isReadyTriggerAoe) &&
          attackerCb.reactionAvailable === false
        ) {
          showTacticalAlert(`${attackerCb.name} já gastou a Reação nesta rodada!`);
          return;
        }
      }
      if (!skipCost && char) {
        const resCheck = checkCharacterResource(char, choice.costMp, choice.costResourceId, curr);
        if (!resCheck.ok) {
          showTacticalAlert(resCheck.error);
          return;
        }
      }

      if (!skipCost && aoeCasterTokPre && roleRef.current === 'player') {
        const casterCx = aoeCasterTokPre.x + (aoeCasterTokPre.size || 1) / 2;
        const casterCy = aoeCasterTokPre.y + (aoeCasterTokPre.size || 1) / 2;
        if (choice.range && !/pessoal|self/i.test(choice.range)) {
          const maxRangeM = parseAttackRangeMeters(choice.range, choice.actionTitle);
          if (maxRangeM > 0) {
            const edgeDistM = Math.max(
              0,
              (Math.hypot(originX - casterCx, originY - casterCy) -
                (aoeCasterTokPre.size || 1) / 2) *
                sqM
            );
            if (edgeDistM > maxRangeM + 0.5) {
              showTacticalAlert(
                `Fora de alcance! "${choice.actionTitle}" alcança até ${maxRangeM}m (ponto clicado: ${edgeDistM.toFixed(1)}m).`
              );
              return;
            }
          }
        }
        const origCellX = Math.floor(originX);
        const origCellY = Math.floor(originY);
        const origCellKey = `${origCellX},${origCellY}`;
        const origBlockedSolid =
          aoeEffTerrain[origCellKey] === 'wall' &&
          !isThinEdgeWall(aoeEffWallMeta[origCellKey]?.shape || 'full');
        if (
          origBlockedSolid ||
          !hasContinuousWallLineOfSight(
            aoeEffTerrain,
            aoeEffWallMeta,
            casterCx,
            casterCy,
            originX,
            originY
          )
        ) {
          showTacticalAlert(
            `Sem linha de visão! Uma parede ou porta fechada bloqueia conjurar "${choice.actionTitle}" nesse ponto.`
          );
          return;
        }
      }

      setPendingAttackChoice(null);

      const matchingAbilityDef = curr.compendium.abilities.find(
        (ab) => normalizeAbilityKey(ab.name) === normalizeAbilityKey(choice.actionTitle)
      );
      if (!skipCost && char) {
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
        const conflict = skipCost
          ? { proceed: true, effectsToClear: [] as ActiveTrackedAbilityEffect[] }
          : await confirmAbilityConflictIfNeeded(char, {
              abilityName: choice.actionTitle,
              requiresConcentration: shouldSetConcentration,
              singleTargetOnly: false,
            });
        if (!conflict.proceed) return;

        // 1. Place geometric template + optional Elemental Surface on map + spend MP & action economy + concentration + break invisibility on offensive AoE
        const surfaceToPaint = choice.createsSurface;
        const isHealPre = choice.damageType?.toLowerCase() === 'cura';
        updateCampaign((prev) => {
          const base = char
            ? removeTrackedEffectsFromState(prev, char.id, conflict.effectsToClear)
            : prev;
          return {
            ...base,
            characters: base.characters.map((c) => {
              if (!char || c.id !== char.id) return c;
              const res = skipCost
                ? {}
                : deductCharacterResource(
                    c,
                    choice.costMp,
                    choice.costResourceId,
                    base.compendium.customResources
                  );
              return {
                ...c,
                ...res,
                activeConditionIds: !isHealPre
                  ? c.activeConditionIds.filter((cid) => cid !== 'cond-invisivel')
                  : c.activeConditionIds,
                inventory: skipCost
                  ? c.inventory
                  : deductChargedInventoryItem(
                      c,
                      choice.chargedInventoryEntryId,
                      base.compendium.items
                    ),
                abilityUsesRemaining: skipCost
                  ? c.abilityUsesRemaining
                  : decrementAbilityUse(c, matchingAbilityDef),
                ...(shouldSetConcentration ? { concentratingSpell: choice.actionTitle } : {}),
              };
            }),
            maps:
              !isHealPre && aoeCasterTokPre
                ? base.maps.map((m) =>
                    m.id !== activeMap.id
                      ? m
                      : {
                          ...m,
                          tokens: m.tokens.map((t) =>
                            t.id === aoeCasterTokPre.id
                              ? {
                                  ...t,
                                  stealthTotal: null,
                                  activeConditionIds: (t.activeConditionIds || []).filter(
                                    (cid) => cid !== 'cond-invisivel'
                                  ),
                                  ...(choice.isLegendaryAction && t.isBoss
                                    ? {
                                        legendaryActionsRemaining: Math.max(
                                          0,
                                          (t.legendaryActionsRemaining ?? t.legendaryActionsMax ?? 3) - 1
                                        ),
                                      }
                                    : {}),
                                }
                              : t
                          ),
                        }
                  )
                : base.maps,
            activeBoss:
              choice.isLegendaryAction && base.activeBoss
                ? {
                    ...base.activeBoss,
                    legendaryActionsRemaining: Math.max(
                      0,
                      (base.activeBoss.legendaryActionsRemaining ??
                        base.activeBoss.legendaryActionsMax ??
                        3) - 1
                    ),
                  }
                : base.activeBoss,
            combat:
              !skipCost &&
              !choice.isLegendaryAction &&
              base.combat.active &&
              attackerCb &&
              (actionCost !== 'Livre' || shouldSetConcentration || isReadyTriggerAoe)
                ? {
                    ...base.combat,
                    combatants: base.combat.combatants.map((cb) =>
                      cb.id !== attackerCb.id
                        ? cb
                        : {
                            ...consumeCombatantEconomy(cb, actionCost, {
                              isReadyReaction: isReadyTriggerAoe,
                            }),
                            ...(shouldSetConcentration
                              ? { concentratingSpell: choice.actionTitle }
                              : {}),
                          }
                    ),
                  }
                : base.combat,
          };
        });

        const executeAoeSpellBody = () => {
          // Paint elemental surfaces & place AoE template ONLY if not Counterspelled!
          updateCampaign((prev) => ({
            ...prev,
            maps: prev.maps.map((m) => {
              if (m.id !== activeMap.id) return m;
              const nextSurfaces = { ...(m.elementalSurfaces || {}) };
              if (surfaceToPaint) {
                const paintTerrain = getEffectiveTerrainCells(m);
                const paintWallMeta = getEffectiveWallMeta(m);
                const minGx = Math.max(0, Math.floor(originX - radiusSquares - 2));
                const maxGx = Math.min(m.gridWidth - 1, Math.ceil(originX + radiusSquares + 2));
                const minGy = Math.max(0, Math.floor(originY - radiusSquares - 2));
                const maxGy = Math.min(m.gridHeight - 1, Math.ceil(originY + radiusSquares + 2));
                for (let gx = minGx; gx <= maxGx; gx++) {
                  for (let gy = minGy; gy <= maxGy; gy++) {
                    const pKey = `${gx},${gy}`;
                    if (
                      paintTerrain[pKey] === 'wall' &&
                      !isThinEdgeWall(paintWallMeta[pKey]?.shape || 'full')
                    ) {
                      continue;
                    }
                    if (
                      isTokenInsideAoE(
                        { x: gx, y: gy, size: 1 },
                        choice.aoeShape!,
                        originX,
                        originY,
                        radiusSquares,
                        angleDeg
                      ) &&
                      hasContinuousWallLineOfSight(
                        paintTerrain,
                        paintWallMeta,
                        originX,
                        originY,
                        gx + 0.5,
                        gy + 0.5
                      )
                    ) {
                      nextSurfaces[pKey] = surfaceToPaint;
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
          }));

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

          const liveMap = campaignRef.current.maps.find((m) => m.id === activeMap.id) || activeMap;
          const targetFilter = choice.aoeTargetFilter || 'all';
          const casterTokForFaction = liveMap.tokens.find((t) => t.id === choice.attackerTokenId);
          const casterIsHeroSide =
            Boolean(choice.attackerCharacterId) ||
            (casterTokForFaction ? isHeroFactionToken(casterTokForFaction) : true);
          const hitTokens = liveMap.tokens.filter((t) => {
            if (t.isHidden || t.hp <= 0) return false;
            if (!isTokenInsideAoE(t, choice.aoeShape!, originX, originY, radiusSquares, angleDeg)) {
              return false;
            }
            const tCx = t.x + (t.size || 1) / 2;
            const tCy = t.y + (t.size || 1) / 2;
            if (
              !hasContinuousWallLineOfSight(
                aoeEffTerrain,
                aoeEffWallMeta,
                originX,
                originY,
                tCx,
                tCy
              )
            ) {
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
              if (casterTokForFaction) {
                if (areTokensAllied(casterTokForFaction, t, curr.npcs)) return false;
              } else {
                const tokenIsHeroSide =
                  isHeroFactionToken(t) ||
                  (t.type === 'npc' &&
                    curr.npcs.find((n) => n.id === t.referenceId)?.disposition !== 'Hostil');
                if (casterIsHeroSide === tokenIsHeroSide) return false;
              }
            }
            return true;
          });

          const isHeal = choice.damageType?.toLowerCase() === 'cura';
          const hasDamage = Boolean(choice.damageFormula && choice.damageType);
          const aoeCondDef = choice.applyConditionId
            ? curr.compendium.conditions.find((c) => c.id === choice.applyConditionId)
            : undefined;
          const isOffensiveAoE =
            !isHeal && (hasDamage || Boolean(choice.saveSkillId) || isOffensiveCondition(aoeCondDef));
          const hitOtherTokens = hitTokens.filter((t) => {
            const isCaster =
              (choice.attackerTokenId && t.id === choice.attackerTokenId) ||
              (choice.attackerCharacterId &&
                t.type === 'character' &&
                t.referenceId === choice.attackerCharacterId);
            return !isCaster;
          });
          const aoeCasterTok = aoeCasterTokPre;

          if (isOffensiveAoE && hitOtherTokens.length > 0) {
            let aoeTurnedHostile: string[] = [];
            updateCampaign((prev) => {
              const flipped = flipAttackedNpcsToHostile(prev, hitOtherTokens);
              aoeTurnedHostile = flipped.turnedHostileNames;
              return flipped.nextState;
            });
            aoeTurnedHostile.forEach((npcName) => {
              pushCombatLog({
                category: 'system',
                actorName: npcName,
                actorKind: 'npc',
                actorColor: '#ef4444',
                summary: 'tornou-se Hostil ao ser atingido em área!',
              });
            });
          }

          const aoeCells: Array<{ x: number; y: number }> = [];
          if (!isHeal && choice.damageType && liveMap.elementalSurfaces) {
            for (let gx = 0; gx < liveMap.gridWidth; gx++) {
              for (let gy = 0; gy < liveMap.gridHeight; gy++) {
                const cKey = `${gx},${gy}`;
                if (
                  aoeEffTerrain[cKey] === 'wall' &&
                  !isThinEdgeWall(aoeEffWallMeta[cKey]?.shape || 'full')
                ) {
                  continue;
                }
                if (
                  isTokenInsideAoE(
                    { x: gx, y: gy, size: 1 },
                    choice.aoeShape!,
                    originX,
                    originY,
                    radiusSquares,
                    angleDeg
                  ) &&
                  hasContinuousWallLineOfSight(
                    aoeEffTerrain,
                    aoeEffWallMeta,
                    originX,
                    originY,
                    gx + 0.5,
                    gy + 0.5
                  )
                ) {
                  aoeCells.push({ x: gx, y: gy });
                }
              }
            }
          }

          fireProjectileVfx({
            fromToken: aoeCasterTok,
            toX: originX,
            toY: originY,
            title: choice.actionTitle,
            damageType: choice.damageType,
            applyConditionId: choice.applyConditionId,
            range: choice.range,
            kind: choice.vfxKind || matchingAbilityDef?.vfxKind,
          });
          triggerScreenShake('light');
          triggerShockwave(originX, originY, tmplColor, 150, activeMap.id);

          if (hitTokens.length === 0) {
            showTacticalAlert(`Nenhum alvo encontrado dentro da área de ${choice.actionTitle}.`);
          }

          const resolveAoeWithDuration = (finalDurationRounds: number | undefined) => {
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
                    choice.attackerColor,
                    activeMap.id
                  );
                }, 220);
              }
              if (isOffensiveAoE && hitOtherTokens.length > 0 && !campaignRef.current.combat.active) {
                pendingAutoCombatOnSaveRef.current = {
                  tokenId: aoeCasterTok?.id || choice.attackerTokenId,
                  characterId: choice.attackerCharacterId,
                  actionCost,
                  reason: `${choice.attackerName} conjurou ${choice.actionTitle}`,
                };
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
                    ? resolveFormulaVariablesToRaw(choice.damageFormula, stats, char)
                    : '',
                  damageType: choice.damageType || 'Arcano',
                  halfOnSuccess: choice.halfOnSuccess ?? matchingAbilityDef?.halfOnSuccess ?? true,
                  applyConditionId: choice.applyConditionId,
                  conditionDurationRounds: finalDurationRounds,
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
                  choice.attackerColor,
                  activeMap.id
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
                rollerColor: choice.attackerColor,
                diceSkin: choice.diceSkin || 'gold',
                title: `${choice.actionTitle} (Área ${sizeMeters}m • ${hitTokens.length} alvo(s))`,
                formula: roll.resolvedFormula,
                total: totalVal,
                individualRolls: roll.individualRolls,
                rolledDice: roll.rolledDice,
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
                      finalDurationRounds
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
                      finalDurationRounds
                    );
                  }
                });
              }, 120);
            }

            if (isOffensiveAoE && hitOtherTokens.length > 0 && !campaignRef.current.combat.active) {
              window.setTimeout(() => {
                startCombatFromMapRef.current?.({
                  openingAttacker: {
                    tokenId: aoeCasterTok?.id || choice.attackerTokenId,
                    characterId: choice.attackerCharacterId,
                    actionCost,
                  },
                  reason: `${choice.attackerName} conjurou ${choice.actionTitle}`,
                });
              }, 680);
            }
          };

          if (choice.applyConditionId && choice.conditionDurationFormula && hitTokens.length > 0) {
            const condDef = curr.compendium.conditions.find(
              (c) => c.id === choice.applyConditionId
            );
            const durFormula = choice.conditionDurationFormula;
            openManualRoll({
              title: `Duração: ${choice.actionTitle}`,
              subtitle: condDef
                ? `Turnos completos de ${condDef.icon} ${condDef.name} (${hitTokens.length} alvo(s))`
                : `Turnos completos (${hitTokens.length} alvo(s))`,
              formula: durFormula,
              displayFormula: formatFormulaForDisplay(durFormula, stats, char),
              previewDice: buildPreviewDiceForFormula(durFormula, 'normal'),
              rollerName: choice.attackerName,
              rollerColor: choice.attackerColor,
              diceSkin: choice.diceSkin || 'gold',
              allowAdvantageToggle: false,
              advantageMode: 'normal',
              onExecute: () => {
                const durRes = evaluateFormula(durFormula, stats, char);
                const rolledTurns = Math.max(1, durRes.total);
                sendRoll({
                  rollerName: choice.attackerName,
                  rollerRole: roleRef.current,
                  rollerColor: choice.attackerColor,
                  diceSkin: choice.diceSkin || 'gold',
                  title: `Duração: ${choice.actionTitle} (Área)`,
                  formula: durRes.resolvedFormula,
                  individualRolls: durRes.individualRolls,
                  rolledDice: durRes.rolledDice,
                  total: rolledTurns,
                  isSecret: false,
                  details: `${condDef?.icon || '✨'} ${condDef?.name || choice.actionTitle} em área por ${rolledTurns} ${rolledTurns === 1 ? 'turno completo' : 'turnos completos'}!`,
                });
                resolveAoeWithDuration(rolledTurns);
              },
            });
            return;
          }

          resolveAoeWithDuration(choice.conditionDurationRounds);
        };

        // D&D 5e Counterspell Gate on AoE spells: pauses surfaces, templates, saves & damage until resolved!
        const isAoeSpellCast = Boolean(
          matchingAbilityDef?.category === 'Magia' || (choice.costMp && choice.costMp > 0)
        );
        const matchedCustomAoeUlt = char?.customAbilities?.find(
          (ab) => normalizeAbilityKey(ab.name) === normalizeAbilityKey(choice.actionTitle)
        );
        if (
          !skipCost &&
          (choice.isUltimate ||
            choice.isDomainExpansion ||
            matchedCustomAoeUlt?.isUltimate ||
            matchedCustomAoeUlt?.isDomainExpansion ||
            matchingAbilityDef?.isUltimate ||
            matchingAbilityDef?.isDomainExpansion)
        ) {
          triggerUltimateCutInRef.current?.({
            actorName: choice.attackerName,
            techniqueName: choice.actionTitle,
            catchphrase:
              choice.ultimateCatchphrase ||
              matchedCustomAoeUlt?.ultimateCatchphrase ||
              matchingAbilityDef?.ultimateCatchphrase,
            color:
              choice.ultimateColor ||
              matchedCustomAoeUlt?.ultimateColor ||
              matchingAbilityDef?.ultimateColor ||
              choice.aoeColor ||
              choice.attackerColor,
            portraitUrl:
              choice.ultimateImageUrl ||
              matchedCustomAoeUlt?.ultimateImageUrl ||
              matchingAbilityDef?.ultimateImageUrl ||
              matchingAbilityDef?.imageUrl ||
              char?.portraitUrl ||
              choice.attackerImageUrl,
            style:
              choice.ultimateStyle ||
              matchedCustomAoeUlt?.ultimateStyle ||
              matchingAbilityDef?.ultimateStyle,
            sfxPreset:
              choice.ultimateSfxPreset ||
              matchedCustomAoeUlt?.ultimateSfxPreset ||
              matchingAbilityDef?.ultimateSfxPreset,
            sfxUrl:
              choice.ultimateSfxUrl ||
              matchedCustomAoeUlt?.ultimateSfxUrl ||
              matchingAbilityDef?.ultimateSfxUrl,
            activateDomain: Boolean(
              choice.isDomainExpansion ||
                matchedCustomAoeUlt?.isDomainExpansion ||
                matchingAbilityDef?.isDomainExpansion
            ),
            domainTheme:
              choice.domainTheme ||
              matchedCustomAoeUlt?.domainTheme ||
              matchingAbilityDef?.domainTheme ||
              'sonic',
            domainDurationRounds:
              choice.domainDurationRounds ||
              matchedCustomAoeUlt?.domainDurationRounds ||
              matchingAbilityDef?.domainDurationRounds,
            domainMusicUrl:
              choice.domainMusicUrl ||
              matchedCustomAoeUlt?.domainMusicUrl ||
              matchingAbilityDef?.domainMusicUrl,
            domainMapId: activeMap.id,
            casterCharacterId: char?.id,
            casterTokenId: aoeCasterTokPre?.id,
          });
        }
        if (isAoeSpellCast && aoeCasterTokPre && !skipCost) {
          const pausedByCs = checkAndTriggerCounterspellRef.current?.({
            casterToken: aoeCasterTokPre,
            casterName: choice.attackerName,
            casterColor: choice.attackerColor,
            spellName: choice.actionTitle,
            costMp: choice.costMp || matchingAbilityDef?.costMp || 3,
            activeMap,
            onProceedIfNotCountered: executeAoeSpellBody,
          });
          if (pausedByCs) return;
        }

        executeAoeSpellBody();
      })();
    },
    [applyDamage, pushCombatLog, sendRoll, showTacticalAlert, startTacticalSavePrompt, triggerSlashVfx, updateCampaign]
  );

  const executeTeleportAbility = useCallback(
    (choice: PendingAttackChoice, targetX: number, targetY: number) => {
      const curr = campaignRef.current;
      const viewedIdForTp = resolveViewedMapId(
        curr,
        roleRef.current,
        roleRef.current === 'player' ? choice.attackerCharacterId || activeCharRef.current : undefined
      );
      const activeMap =
        curr.maps.find((m) => m.id === viewedIdForTp) ||
        curr.maps.find((m) => m.id === curr.activeMapId) ||
        curr.maps[0];
      if (!activeMap || !choice.isTeleport) return;

      const char = choice.attackerCharacterId
        ? curr.characters.find((c) => c.id === choice.attackerCharacterId)
        : undefined;
      const casterTok =
        (choice.attackerTokenId && activeMap.tokens.find((t) => t.id === choice.attackerTokenId)) ||
        (choice.attackerCharacterId &&
          activeMap.tokens.find(
            (t) => t.type === 'character' && t.referenceId === choice.attackerCharacterId
          )) ||
        undefined;

      if (!casterTok) {
        setPendingAttackChoice(null);
        showTacticalAlert(`Coloque o token de ${choice.attackerName} no mapa para teletransportar.`);
        return;
      }

      const actionCost = choice.actionCost || 'Bônus';
      const combat = curr.combat;
      const attackerCb = combat.active
        ? combat.combatants.find(
            (cb) =>
              cb.tokenId === casterTok.id ||
              (choice.attackerCharacterId && cb.referenceId === choice.attackerCharacterId)
          )
        : undefined;

      const isReadyTriggerTp = Boolean(
        combat.active &&
          attackerCb &&
          (choice.isReadyReactionTrigger ||
            (actionCost === 'Padrão' &&
              attackerCb.readyAction &&
              attackerCb.reactionAvailable !== false &&
              combat.combatants[combat.currentTurnIndex]?.id !== attackerCb.id))
      );
      if (combat.active && attackerCb) {
        const activeTurnCb = combat.combatants[combat.currentTurnIndex];
        if (
          roleRef.current === 'player' &&
          actionCost !== 'Reação' &&
          actionCost !== 'Livre' &&
          !isReadyTriggerTp &&
          activeTurnCb &&
          activeTurnCb.id !== attackerCb.id
        ) {
          showTacticalAlert(`Aguarde seu turno! Turno atual: ${activeTurnCb.name}.`);
          return;
        }
        if (actionCost === 'Padrão' && !isReadyTriggerTp && attackerCb.actionAvailable === false) {
          showTacticalAlert(`${attackerCb.name} já gastou a Ação Padrão neste turno!`);
          return;
        }
        if (actionCost === 'Bônus' && attackerCb.bonusActionAvailable === false) {
          showTacticalAlert(`${attackerCb.name} já gastou a Ação Bônus neste turno!`);
          return;
        }
        if (
          (actionCost === 'Reação' || isReadyTriggerTp) &&
          attackerCb.reactionAvailable === false
        ) {
          showTacticalAlert(`${attackerCb.name} já gastou a Reação nesta rodada!`);
          return;
        }
      }

      const matchingAbilityDef = curr.compendium.abilities.find(
        (ab) => normalizeAbilityKey(ab.name) === normalizeAbilityKey(choice.actionTitle)
      );
      if (char) {
        const usesCheck = checkAbilityUsesRemaining(char, matchingAbilityDef);
        if (!usesCheck.ok) {
          showTacticalAlert(usesCheck.error);
          return;
        }
        const resCheck = checkCharacterResource(char, choice.costMp, choice.costResourceId, curr);
        if (!resCheck.ok) {
          showTacticalAlert(resCheck.error);
          return;
        }
      }

      const sqM = curr.settings.gridSquareMeters || 1.5;
      const parsedRange = parseAttackRangeMeters(choice.range, choice.actionTitle);
      const maxRangeMeters = parsedRange > sqM ? parsedRange : 9;
      const requiresSight = choice.teleportRequiresSight !== false;

      const validation = validateTeleportDestination({
        map: activeMap,
        casterToken: casterTok,
        casterChar: char,
        targetX,
        targetY,
        maxRangeMeters,
        sqMeters: sqM,
        requiresSight,
        isGm: roleRef.current === 'gm',
        compendiumConditions: curr.compendium.conditions,
      });

      if (!validation.valid) {
        showTacticalAlert(validation.reason || 'Destino de teletransporte inválido.');
        return;
      }

      setPendingAttackChoice(null);

      // D&D 5e Counterspell check on teleport spells (e.g. Passo Nebuloso, Porta Dimensional)
      const matchedCustomTpUlt = char?.customAbilities?.find(
        (ab) => normalizeAbilityKey(ab.name) === normalizeAbilityKey(choice.actionTitle)
      );
      if (
        choice.isUltimate ||
        choice.isDomainExpansion ||
        matchedCustomTpUlt?.isUltimate ||
        matchedCustomTpUlt?.isDomainExpansion ||
        matchingAbilityDef?.isUltimate ||
        matchingAbilityDef?.isDomainExpansion
      ) {
        triggerUltimateCutInRef.current?.({
          actorName: choice.attackerName,
          techniqueName: choice.actionTitle,
          catchphrase:
            choice.ultimateCatchphrase ||
            matchedCustomTpUlt?.ultimateCatchphrase ||
            matchingAbilityDef?.ultimateCatchphrase,
          color:
            choice.ultimateColor ||
            matchedCustomTpUlt?.ultimateColor ||
            matchingAbilityDef?.ultimateColor ||
            choice.attackerColor,
          portraitUrl:
            choice.ultimateImageUrl ||
            matchedCustomTpUlt?.ultimateImageUrl ||
            matchingAbilityDef?.ultimateImageUrl ||
            matchingAbilityDef?.imageUrl ||
            char?.portraitUrl ||
            choice.attackerImageUrl,
          style:
            choice.ultimateStyle ||
            matchedCustomTpUlt?.ultimateStyle ||
            matchingAbilityDef?.ultimateStyle,
          sfxPreset:
            choice.ultimateSfxPreset ||
            matchedCustomTpUlt?.ultimateSfxPreset ||
            matchingAbilityDef?.ultimateSfxPreset,
          sfxUrl:
            choice.ultimateSfxUrl ||
            matchedCustomTpUlt?.ultimateSfxUrl ||
            matchingAbilityDef?.ultimateSfxUrl,
          activateDomain: Boolean(
            choice.isDomainExpansion ||
              matchedCustomTpUlt?.isDomainExpansion ||
              matchingAbilityDef?.isDomainExpansion
          ),
          domainTheme:
            choice.domainTheme ||
            matchedCustomTpUlt?.domainTheme ||
            matchingAbilityDef?.domainTheme ||
            'void',
          domainDurationRounds:
            choice.domainDurationRounds ||
            matchedCustomTpUlt?.domainDurationRounds ||
            matchingAbilityDef?.domainDurationRounds,
          domainMusicUrl:
            choice.domainMusicUrl ||
            matchedCustomTpUlt?.domainMusicUrl ||
            matchingAbilityDef?.domainMusicUrl,
          domainMapId: activeMap.id,
          casterCharacterId: char?.id,
          casterTokenId: casterTok.id,
        });
      }
      const tokSize = Math.max(1, Math.round(casterTok.size || 1));
      const origCx = casterTok.x + tokSize / 2;
      const origCy = casterTok.y + tokSize / 2;
      const destCx = targetX + tokSize / 2;
      const destCy = targetY + tokSize / 2;

      const hadGrappled = Boolean(
        (char?.activeConditionIds || casterTok.activeConditionIds || []).includes('cond-agarrado')
      );
      const selfCondToApply = !choice.aoeShape ? choice.applyConditionId : undefined;
      const selfCondDef = selfCondToApply
        ? curr.compendium.conditions.find((c) => c.id === selfCondToApply)
        : undefined;
      const shouldSetConcentration = Boolean(
        choice.requiresConcentration ?? matchingAbilityDef?.requiresConcentration
      );

      // Spend caster Action/MP/Uses/Charges immediately (D&D 5e: countered teleport still consumes caster's action & slot!)
      updateCampaign((prev) => ({
        ...prev,
        characters: prev.characters.map((c) => {
          if (!char || c.id !== char.id) return c;
          const res = deductCharacterResource(
            c,
            choice.costMp,
            choice.costResourceId,
            prev.compendium.customResources
          );
          return {
            ...c,
            ...res,
            inventory: deductChargedInventoryItem(
              c,
              choice.chargedInventoryEntryId,
              prev.compendium.items
            ),
            abilityUsesRemaining: decrementAbilityUse(c, matchingAbilityDef),
            ...(shouldSetConcentration ? { concentratingSpell: choice.actionTitle } : {}),
          };
        }),
        combat:
          prev.combat.active && attackerCb
            ? {
                ...prev.combat,
                combatants: prev.combat.combatants.map((cb) => {
                  if (cb.id !== attackerCb.id) return cb;
                  const spentCb =
                    isReadyTriggerTp || actionCost !== 'Livre'
                      ? consumeCombatantEconomy(cb, actionCost, {
                          isReadyReaction: isReadyTriggerTp,
                        })
                      : cb;
                  return {
                    ...spentCb,
                    ...(shouldSetConcentration ? { concentratingSpell: choice.actionTitle } : {}),
                  };
                }),
              }
            : prev.combat,
      }));

      const executeTeleportMove = () => {
        updateCampaign((prev) => ({
          ...prev,
          characters: prev.characters.map((c) => {
            if (!char || c.id !== char.id) return c;
            let nextConds = c.activeConditionIds.filter((cid) => cid !== 'cond-agarrado');
            if (selfCondToApply && !nextConds.includes(selfCondToApply)) {
              nextConds = [...nextConds, selfCondToApply];
            }
            return { ...c, activeConditionIds: nextConds };
          }),
          maps: prev.maps.map((m) =>
            m.id !== activeMap.id
              ? m
              : {
                  ...m,
                  tokens: m.tokens.map((t) => {
                    if (t.id !== casterTok.id) return t;
                    let nextConds = (t.activeConditionIds || []).filter(
                      (cid) => cid !== 'cond-agarrado'
                    );
                    if (selfCondToApply && !nextConds.includes(selfCondToApply)) {
                      nextConds = [...nextConds, selfCondToApply];
                    }
                    return {
                      ...t,
                      x: targetX,
                      y: targetY,
                      activeConditionIds: nextConds,
                    };
                  }),
                }
          ),
          combat:
            prev.combat.active && attackerCb && selfCondToApply && selfCondDef
              ? {
                  ...prev.combat,
                  combatants: prev.combat.combatants.map((cb) => {
                    if (cb.id !== attackerCb.id) return cb;
                    return {
                      ...cb,
                      effects: [
                        ...cb.effects.filter((ef) => ef.conditionId !== selfCondToApply),
                        {
                          id: `eff-tp-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                          label: selfCondDef.name,
                          conditionId: selfCondToApply,
                          remainingRounds: choice.conditionDurationRounds || 3,
                          sourceName: choice.actionTitle,
                        },
                      ],
                    };
                  }),
                }
              : prev.combat,
        }));

        // Ethereal Misty Step VFX (departure mist + blink streak + arrival portal) & synced SFX
        triggerShockwave(origCx, origCy, '#38bdf8', 115, activeMap.id);
        fireProjectileVfx({
          fromToken: casterTok,
          toX: destCx,
          toY: destCy,
          title: choice.actionTitle,
          kind: choice.vfxKind || 'arcane',
          range: choice.range,
        });
        window.setTimeout(() => {
          triggerShockwave(destCx, destCy, '#a855f7', 125, activeMap.id);
        }, 130);
        playSyncedAbilitySfx({
          explicitSfxPreset: choice.sfxPreset || matchingAbilityDef?.sfxPreset || 'teleport',
          title: choice.actionTitle,
          damageType: choice.damageType,
          range: choice.range,
        });

        const actorKind: 'hero' | 'monster' | 'npc' =
          casterTok.type === 'character' ? 'hero' : casterTok.type === 'npc' ? 'npc' : 'monster';
        const distM = Math.round(Math.hypot(targetX - casterTok.x, targetY - casterTok.y) * sqM * 10) / 10;
        pushCombatLog({
          category: 'spell',
          actorName: choice.attackerName,
          actorKind,
          actorColor: choice.attackerColor,
          summary: `teletransportou ${distM}m com ${choice.actionTitle}${hadGrappled ? ' (escapou de Agarrado!)' : ''}`,
        });
        showTacticalAlert(
          `✨ ${choice.attackerName} teletransportou com ${choice.actionTitle}!${hadGrappled ? ' (Livre de Agarrado)' : ''}`
        );

        if (choice.aoeShape) {
          const aoeCx = choice.teleportAoeOrigin === 'arrival' ? destCx : origCx;
          const aoeCy = choice.teleportAoeOrigin === 'arrival' ? destCy : origCy;
          window.setTimeout(() => {
            castAoEAbility(choice, aoeCx, aoeCy, 0, { skipCostAndEconomy: true });
          }, 180);
        }
      };

      if (matchingAbilityDef?.category === 'Magia' || (choice.costMp && choice.costMp > 0)) {
        const pausedByCs = checkAndTriggerCounterspellRef.current?.({
          casterToken: casterTok,
          casterName: choice.attackerName,
          casterColor: choice.attackerColor,
          spellName: choice.actionTitle,
          costMp: choice.costMp || matchingAbilityDef?.costMp || 2,
          activeMap,
          onProceedIfNotCountered: executeTeleportMove,
        });
        if (pausedByCs) return;
      }

      executeTeleportMove();
    },
    [
      castAoEAbility,
      fireProjectileVfx,
      playSyncedAbilitySfx,
      pushCombatLog,
      showTacticalAlert,
      triggerShockwave,
      updateCampaign,
    ]
  );

  const adjustHeroInspiration = useCallback(
    (characterId: string, delta: number) => {
      const ch = campaignRef.current.characters.find((c) => c.id === characterId);
      if (!ch) return;
      const cur = getHeroInspirationPoints(ch);
      const nextPts = Math.max(0, Math.min(3, cur + delta));
      if (nextPts === cur) return;
      updateCampaign((prev) => ({
        ...prev,
        characters: prev.characters.map((c) =>
          c.id === characterId
            ? { ...c, inspirationPoints: nextPts, hasInspiration: nextPts > 0 }
            : c
        ),
      }));
      if (nextPts > cur) {
        soundEngine.playSfxPreset('levelup');
        pushCombatLog({
          category: 'system',
          actorName: ch.name,
          actorKind: 'hero',
          actorColor: ch.playerColor || ch.tokenColor,
          summary: `recebeu ★ Inspiração Heroica (${nextPts}/3)!`,
        });
      }
    },
    [pushCombatLog, updateCampaign]
  );

  const toggleHeroInspiration = useCallback(
    (characterId: string) => {
      const ch = campaignRef.current.characters.find((c) => c.id === characterId);
      if (!ch) return;
      const cur = getHeroInspirationPoints(ch);
      adjustHeroInspiration(characterId, cur > 0 ? -1 : 1);
    },
    [adjustHeroInspiration]
  );

  const spendHeroInspiration = useCallback(
    (characterId: string, mode: 'advantage' | 'reroll' = 'advantage') => {
      const ch = campaignRef.current.characters.find((c) => c.id === characterId);
      const cur = getHeroInspirationPoints(ch);
      if (!ch || cur <= 0) return;
      const nextPts = Math.max(0, cur - 1);
      updateCampaign((prev) => ({
        ...prev,
        characters: prev.characters.map((c) =>
          c.id === characterId
            ? {
                ...c,
                inspirationPoints: nextPts,
                hasInspiration: nextPts > 0,
                ...(mode === 'advantage' ? { nextAttackRollOverride: 'advantage' as const } : {}),
              }
            : c
        ),
      }));
      if (mode === 'advantage') {
        setAdvantageMode('advantage');
      }
      soundEngine.playSfxPreset('spell');
      pushCombatLog({
        category: 'system',
        actorName: ch.name,
        actorKind: 'hero',
        actorColor: ch.playerColor || ch.tokenColor,
        summary:
          mode === 'reroll'
            ? `gastou 1 ★ Inspiração Heroica para RE-ROLAR o d20 (${nextPts}/3 restantes)!`
            : `gastou 1 ★ Inspiração Heroica (+Vantagem na próxima rolagem • ${nextPts}/3 restantes)!`,
      });
      showTacticalAlert(
        mode === 'reroll'
          ? `★ ${ch.name} gastou Inspiração para re-rolar o dado! (${nextPts}/3)`
          : `★ ${ch.name} gastou Inspiração: Vantagem ativa na próxima rolagem! (${nextPts}/3)`
      );
    },
    [pushCombatLog, showTacticalAlert, updateCampaign]
  );

  const useChargedItemAbility = useCallback(
    (characterId: string, inventoryEntryId: string) => {
      const curr = campaignRef.current;
      const ch = curr.characters.find((c) => c.id === characterId);
      if (!ch) return;
      const inv = ch.inventory.find((x) => x.id === inventoryEntryId);
      if (!inv || (inv.quantity ?? 1) <= 0) return;
      const itemDef = curr.compendium.items.find((i) => i.id === inv.itemId);
      if (!itemDef?.grantedAbilityId) return;
      const ab = curr.compendium.abilities.find((a) => a.id === itemDef.grantedAbilityId);
      if (!ab) return;

      const maxChg = Math.max(0, Math.floor(itemDef.maxCharges ?? 0));
      const curChg =
        maxChg > 0
          ? typeof inv.chargesRemaining === 'number'
            ? inv.chargesRemaining
            : maxChg
          : 0;
      if (maxChg > 0 && curChg <= 0) {
        showTacticalAlert(`⚡ ${itemDef.name} está sem cargas! Recarregue no descanso.`);
        return;
      }

      const actionCost: ActionEconomyCost = normalizeActionEconomyCost(ab.actionType);

      // Charge is only deducted when the action actually commits (never lost if targeting is cancelled or blocked!)
      rollCharacterAction({
        characterId: ch.id,
        title: ab.name,
        attackFormula: ab.attackFormula,
        damageFormula: ab.damageFormula,
        damageType: ab.damageType,
        costMp: 0,
        chargedInventoryEntryId: inv.id,
        range: ab.range,
        actionCost,
        saveSkillId: ab.saveSkillId,
        saveDcFormula: ab.saveDcFormula,
        applyConditionId: ab.applyConditionId,
        conditionDurationRounds: ab.conditionDurationRounds,
        aoeShape: ab.aoeShape,
        aoeSizeMeters: ab.aoeSizeMeters,
        aoeColor: ab.aoeColor,
        aoePersistent: ab.aoePersistent,
      });
    },
    [rollCharacterAction, showTacticalAlert]
  );

  const rerollDuelAttackWithInspiration = useCallback(() => {
    const duel = activeDuelRef.current;
    if (!duel || duel.phase !== 'attack-result' || !duel.attackerCharacterId) return;
    const ch = campaignRef.current.characters.find((c) => c.id === duel.attackerCharacterId);
    if (!ch || getHeroInspirationPoints(ch) <= 0) return;
    spendHeroInspiration(ch.id, 'reroll');
    const resetDuel: CombatDuelState = {
      ...duel,
      phase: 'ready-attack',
      hitSuccess: false,
      isCrit: false,
      isFumble: false,
      attackTotal: undefined,
      d20Natural: undefined,
      defenderCanShieldReaction: false,
      reactionShieldApplied: duel.reactionShieldApplied,
    };
    activeDuelRef.current = resetDuel;
    emitDuelState(resetDuel);
    window.setTimeout(() => {
      rollDuelAttack();
    }, 60);
  }, [emitDuelState, rollDuelAttack, spendHeroInspiration]);

  const rerollSaveWithInspiration = useCallback(
    (tokenId: string) => {
      const prompt = activeSavePromptRef.current;
      if (!prompt) return;
      const entry = prompt.targets.find((t) => t.tokenId === tokenId);
      if (!entry || entry.status !== 'failed' || !entry.characterId) return;
      const ch = campaignRef.current.characters.find((c) => c.id === entry.characterId);
      if (!ch || getHeroInspirationPoints(ch) <= 0) return;
      spendHeroInspiration(ch.id, 'reroll');
      const resetPrompt: TacticalSavePrompt = {
        ...prompt,
        targets: prompt.targets.map((t) =>
          t.tokenId === tokenId
            ? { ...t, status: 'pending', d20: undefined, total: undefined, applied: false }
            : t
        ),
      };
      activeSavePromptRef.current = resetPrompt;
      emitSavePromptState(resetPrompt);
      window.setTimeout(() => {
        rollSavePromptTarget(tokenId);
      }, 60);
    },
    [emitSavePromptState, rollSavePromptTarget, spendHeroInspiration]
  );

  const triggerDuelShieldReaction = useCallback(() => {
    const duel = activeDuelRef.current;
    if (!duel || duel.reactionShieldApplied || !duel.defenderCanShieldReaction || duel.isCrit) return;
    const curr = campaignRef.current;
    const activeMap =
      curr.maps.find((m) => m.tokens.some((t) => t.id === duel.defenderTokenId)) ||
      curr.maps.find((m) => m.id === curr.activeMapId);
    const defTok = activeMap?.tokens.find((t) => t.id === duel.defenderTokenId);
    const defChar =
      defTok?.type === 'character' && defTok.referenceId
        ? curr.characters.find((c) => c.id === defTok.referenceId)
        : undefined;
    const defCb = curr.combat.active
      ? curr.combat.combatants.find((cb) => cb.tokenId === duel.defenderTokenId)
      : undefined;

    if (defTok && isTokenIncapacitated(defTok, defChar, curr.compendium.conditions)) {
      showTacticalAlert(`${duel.defenderName} está incapacitado e não pode usar Reação!`);
      return;
    }
    if (defCb && defCb.reactionAvailable === false) {
      showTacticalAlert(`${duel.defenderName} já gastou a Reação nesta rodada!`);
      return;
    }

    const shieldAbility = defChar
      ? defChar.knownAbilityIds
          .map((id) => curr.compendium.abilities.find((a) => a.id === id))
          .find((ab) => ab && ab.actionType === 'Reação' && /escudo/i.test(ab.name)) ||
        defChar.customAbilities.find((ab) => ab.actionType === 'Reação' && /escudo/i.test(ab.name))
      : undefined;
    const shieldMpCost = shieldAbility ? Math.max(0, shieldAbility.costMp ?? 2) : 2;
    if (defChar && defChar.mp < shieldMpCost) {
      showTacticalAlert(
        `${curr.settings.resourceName} insuficiente para Escudo Arcano (precisa de ${shieldMpCost}, possui ${defChar.mp}).`
      );
      return;
    }

    const nextDefense = duel.defenderDefense + 5;
    // D&D 5e: Shield blocks Magic Missile / auto-hit spells (attackTotal === undefined) automatically!
    const stillHits =
      duel.attackTotal === undefined
        ? false
        : duel.isCrit || duel.attackTotal >= nextDefense;
    const hasShieldCond = curr.compendium.conditions.some((c) => c.id === 'cond-escudo-arcano');

    updateCampaign((prev) => ({
      ...prev,
      characters: prev.characters.map((c) =>
        defChar && c.id === defChar.id
          ? {
              ...c,
              mp: Math.max(0, c.mp - shieldMpCost),
              // D&D 5e: Shield (+5 CA) persists until the start of the caster's next turn
              activeConditionIds:
                hasShieldCond && !c.activeConditionIds.includes('cond-escudo-arcano')
                  ? [...c.activeConditionIds, 'cond-escudo-arcano']
                  : c.activeConditionIds,
            }
          : c
      ),
      maps:
        hasShieldCond && defTok && activeMap
          ? prev.maps.map((m) =>
              m.id !== activeMap.id
                ? m
                : {
                    ...m,
                    tokens: m.tokens.map((t) =>
                      t.id === defTok.id && !(t.activeConditionIds || []).includes('cond-escudo-arcano')
                        ? {
                            ...t,
                            activeConditionIds: [...(t.activeConditionIds || []), 'cond-escudo-arcano'],
                          }
                        : t
                    ),
                  }
            )
          : prev.maps,
      combat: prev.combat.active
        ? {
            ...prev.combat,
            combatants: prev.combat.combatants.map((cb) =>
              cb.tokenId === duel.defenderTokenId ||
              (defChar && cb.type === 'character' && cb.referenceId === defChar.id)
                ? {
                    ...cb,
                    reactionAvailable: false,
                    effects: hasShieldCond
                      ? [
                          ...cb.effects.filter((ef) => ef.conditionId !== 'cond-escudo-arcano'),
                          {
                            id: `eff-shield-${Date.now()}`,
                            label: 'Escudo Arcano (+5 CA)',
                            conditionId: 'cond-escudo-arcano',
                            remainingRounds: 1,
                            sourceName: duel.defenderName,
                          },
                        ]
                      : cb.effects,
                  }
                : cb
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
        ? `usou Reação: Escudo Arcano (+5 CA até o próximo turno → ${nextDefense}), mas o golpe (${duel.attackTotal}) ainda acertou!`
        : duel.attackTotal === undefined
          ? `usou Reação: Escudo Arcano (+5 CA até o próximo turno → ${nextDefense}) e BLOQUEOU o golpe automático!`
          : `usou Reação: Escudo Arcano (+5 CA até o próximo turno → ${nextDefense}) e BLOQUEOU o golpe (${duel.attackTotal})!`,
    });

    emitDuelState({
      ...duel,
      defenderDefense: nextDefense,
      hitSuccess: stillHits,
      reactionShieldApplied: true,
      defenderCanShieldReaction: false,
      defenderCanUncannyDodge: false,
      defenderReactionDismissed: true,
      situationalModifiers: [
        ...(duel.situationalModifiers || []),
        'Escudo Arcano (+5 CA)',
      ],
    });
  }, [emitDuelState, pushCombatLog, showTacticalAlert, updateCampaign]);

  const triggerDuelUncannyDodgeReaction = useCallback(() => {
    const duel = activeDuelRef.current;
    if (!duel || duel.reactionUncannyDodgeApplied || !duel.hitSuccess) return;
    const curr = campaignRef.current;
    const activeMap =
      curr.maps.find((m) => m.tokens.some((t) => t.id === duel.defenderTokenId)) ||
      curr.maps.find((m) => m.id === curr.activeMapId);
    const defTok = activeMap?.tokens.find((t) => t.id === duel.defenderTokenId);
    const defChar =
      defTok?.type === 'character' && defTok.referenceId
        ? curr.characters.find((c) => c.id === defTok.referenceId)
        : undefined;
    const defCb = curr.combat.active
      ? curr.combat.combatants.find((cb) => cb.tokenId === duel.defenderTokenId)
      : undefined;

    if (defTok && isTokenIncapacitated(defTok, defChar, curr.compendium.conditions)) {
      showTacticalAlert(`${duel.defenderName} está incapacitado e não pode usar Reação!`);
      return;
    }
    if (defCb && defCb.reactionAvailable === false) {
      showTacticalAlert(`${duel.defenderName} já gastou a Reação nesta rodada!`);
      return;
    }

    if (curr.combat.active) {
      updateCampaign((prev) => ({
        ...prev,
        combat: {
          ...prev.combat,
          combatants: prev.combat.combatants.map((cb) =>
            cb.tokenId === duel.defenderTokenId ||
            (defChar && cb.type === 'character' && cb.referenceId === defChar.id)
              ? { ...cb, reactionAvailable: false }
              : cb
          ),
        },
      }));
    }

    soundEngine.playSfxPreset('shield');
    pushCombatLog({
      category: 'condition',
      actorName: duel.defenderName,
      actorKind: defTok?.type === 'character' ? 'hero' : 'monster',
      actorColor: duel.defenderColor,
      summary: 'usou Reação: Esquiva Sobrenatural (dano do ataque reduzido à metade!)',
    });

    emitDuelState({
      ...duel,
      reactionUncannyDodgeApplied: true,
      defenderCanUncannyDodge: false,
      defenderCanShieldReaction: false,
      defenderReactionDismissed: true,
      situationalModifiers: [
        ...(duel.situationalModifiers || []),
        'Esquiva Sobrenatural (½ Dano)',
      ],
    });
  }, [emitDuelState, pushCombatLog, showTacticalAlert, updateCampaign]);

  const dismissDuelReaction = useCallback(() => {
    const duel = activeDuelRef.current;
    if (!duel) return;
    emitDuelState({
      ...duel,
      defenderReactionDismissed: true,
    });
  }, [emitDuelState]);

  const emitFallDamagePrompt = useCallback((prompt: FallDamagePrompt | null) => {
    fallDamagePromptRef.current = prompt;
    setFallDamagePrompt(prompt);
    if (socketRef.current?.connected) {
      socketRef.current.emit('fall:prompt', prompt);
    }
  }, []);

  const emitCounterspellPrompt = useCallback((prompt: CounterspellPrompt | null) => {
    counterspellPromptRef.current = prompt;
    setCounterspellPrompt(prompt);
    if (socketRef.current?.connected) {
      socketRef.current.emit('counterspell:prompt', prompt);
    }
  }, []);

  const setTokenElevation = useCallback(
    (mapId: string, tokenId: string, nextElevationMeters: number) => {
      const clamped = Math.max(0, Math.min(120, Math.round(nextElevationMeters * 10) / 10));
      updateCampaign((prev) => ({
        ...prev,
        maps: prev.maps.map((m) =>
          m.id !== mapId
            ? m
            : {
                ...m,
                tokens: m.tokens.map((t) =>
                  t.id === tokenId ? { ...t, elevationMeters: clamped } : t
                ),
              }
        ),
      }));
    },
    [updateCampaign]
  );

  const triggerFallDamageCheck = useCallback(
    (tokenId: string, mapId?: string, reason?: string) => {
      const curr = campaignRef.current;
      const targetMap =
        curr.maps.find((m) => m.id === (mapId || curr.activeMapId)) || curr.maps[0];
      const tok = targetMap?.tokens.find((t) => t.id === tokenId);
      if (!targetMap || !tok) return;
      const heightMeters = Math.max(0, tok.elevationMeters || 0);
      if (heightMeters <= 0) return;

      // Drop token to ground immediately
      updateCampaign((prev) => ({
        ...prev,
        maps: prev.maps.map((m) =>
          m.id !== targetMap.id
            ? m
            : {
                ...m,
                tokens: m.tokens.map((t) =>
                  t.id === tok.id ? { ...t, elevationMeters: 0 } : t
                ),
              }
        ),
      }));

      // D&D 5e: 1d6 bludgeoning per 3m (10 ft), max 20d6
      const diceCount = Math.min(20, Math.floor(heightMeters / 3));
      if (diceCount <= 0) {
        pushCombatLog({
          category: 'system',
          actorName: tok.name,
          actorKind: tok.type === 'character' ? 'hero' : tok.type === 'npc' ? 'npc' : 'monster',
          actorColor: tok.color,
          summary: `pousou de ${heightMeters}m sem sofrer dano de queda.`,
        });
        return;
      }

      // Check if falling hero OR any conscious ally within 18m has Queda Suave (Feather Fall) + Reaction + MP
      const sqM = curr.settings.gridSquareMeters || 1.5;
      let canFeatherFall = false;
      let featherFallMpCost = 1;
      for (const candidateTok of targetMap.tokens) {
        if (candidateTok.type !== 'character' || !candidateTok.referenceId) continue;
        if (candidateTok.id !== tok.id && !areTokensAllied(candidateTok, tok, curr.npcs)) continue;
        const dist = getToken3DDistance(candidateTok, tok, sqM).meters3D;
        if (dist > 18.05) continue;
        const candChar = curr.characters.find((c) => c.id === candidateTok.referenceId);
        if (!candChar || candChar.hp <= 0) continue;
        if (isTokenIncapacitated(candidateTok, candChar, curr.compendium.conditions)) continue;
        const candCb = curr.combat.active
          ? curr.combat.combatants.find((cb) => cb.tokenId === candidateTok.id)
          : undefined;
        if (candCb && candCb.reactionAvailable === false) continue;
        const ffAb =
          candChar.knownAbilityIds
            .map((id) => curr.compendium.abilities.find((a) => a.id === id))
            .find((ab) => ab && /queda suave|feather fall/i.test(ab.name)) ||
          candChar.customAbilities.find((ab) => /queda suave|feather fall/i.test(ab.name));
        if (ffAb && candChar.mp >= (ffAb.costMp ?? 1)) {
          canFeatherFall = true;
          featherFallMpCost = Math.max(0, ffAb.costMp ?? 1);
          break;
        }
      }

      emitFallDamagePrompt({
        id: `fall-${Date.now()}`,
        mapId: targetMap.id,
        tokenId: tok.id,
        characterId: tok.type === 'character' ? tok.referenceId : undefined,
        name: tok.name,
        color: tok.color,
        heightMeters,
        diceCount,
        canFeatherFall,
        featherFallMpCost,
        reason,
      });
    },
    [emitFallDamagePrompt, pushCombatLog, updateCampaign]
  );

  const rollFallDamageNow = useCallback(() => {
    const prompt = fallDamagePromptRef.current;
    if (!prompt) return;
    const formula = `${prompt.diceCount}d6`;
    const char = prompt.characterId
      ? campaignRef.current.characters.find((c) => c.id === prompt.characterId)
      : undefined;
    openManualRoll({
      title: `Dano de Queda (${prompt.heightMeters}m) — ${prompt.name}`,
      subtitle: `${formula} de Contusão + condição Caído (D&D 5e)`,
      formula,
      displayFormula: formula,
      previewDice: buildPreviewDiceForFormula(formula, 'normal'),
      rollerName: prompt.name,
      rollerColor: prompt.color,
      diceSkin: (char?.diceSkin || 'crimson') as DiceSkin,
      allowAdvantageToggle: false,
      advantageMode: 'normal',
      onExecute: () => {
        const res = evaluateFormula(formula);
        const dmg = Math.max(1, res.total);
        const proneCondId = campaignRef.current.compendium.conditions.some(
          (c) => c.id === 'cond-caido'
        )
          ? 'cond-caido'
          : undefined;
        applyDamage(prompt.tokenId, dmg, false, undefined, 'Contusão', proneCondId);
        triggerSlashVfx(prompt.tokenId, 'hit');
        soundEngine.playSfxPreset('impact');
        sendRoll({
          rollerName: prompt.name,
          rollerRole: roleRef.current,
          rollerColor: prompt.color,
          diceSkin: (char?.diceSkin || 'crimson') as DiceSkin,
          title: `Dano de Queda (${prompt.heightMeters}m)`,
          formula: res.resolvedFormula,
          individualRolls: res.individualRolls,
          rolledDice: res.rolledDice,
          total: dmg,
          damageTotal: dmg,
          damageType: 'Contusão',
          targetName: prompt.name,
          targetTokenId: prompt.tokenId,
          isSecret: false,
          details: `Queda de ${prompt.heightMeters}m: ${dmg} de Contusão e aterrissou Caído.`,
        });
        emitFallDamagePrompt(null);
      },
    });
  }, [applyDamage, emitFallDamagePrompt, openManualRoll, sendRoll, triggerSlashVfx]);

  const useFeatherFallReaction = useCallback(() => {
    const prompt = fallDamagePromptRef.current;
    if (!prompt) return;
    const curr = campaignRef.current;
    const targetMap = curr.maps.find((m) => m.id === prompt.mapId) || curr.maps[0];
    const fallingTok = targetMap?.tokens.find((t) => t.id === prompt.tokenId);
    const sqM = curr.settings.gridSquareMeters || 1.5;

    let casterChar: Character | undefined;
    let casterTokId: string | undefined;
    let mpCost = prompt.featherFallMpCost ?? 1;

    if (targetMap && fallingTok) {
      const elevatedFallingTok: MapToken = {
        ...fallingTok,
        elevationMeters: prompt.heightMeters,
      };
      for (const cand of targetMap.tokens) {
        if (cand.type !== 'character' || !cand.referenceId) continue;
        if (cand.id !== fallingTok.id && !areTokensAllied(cand, fallingTok, curr.npcs)) continue;
        if (getToken3DDistance(cand, elevatedFallingTok, sqM).meters3D > 18.05) continue;
        const ch = curr.characters.find((c) => c.id === cand.referenceId);
        if (!ch || ch.hp <= 0) continue;
        if (isTokenIncapacitated(cand, ch, curr.compendium.conditions)) continue;
        const candCb = curr.combat.active
          ? curr.combat.combatants.find((cb) => cb.tokenId === cand.id)
          : undefined;
        if (candCb && candCb.reactionAvailable === false) continue;
        const ffAb =
          ch.knownAbilityIds
            .map((id) => curr.compendium.abilities.find((a) => a.id === id))
            .find((ab) => ab && /queda suave|feather fall/i.test(ab.name)) ||
          ch.customAbilities.find((ab) => /queda suave|feather fall/i.test(ab.name));
        if (ffAb && ch.mp >= (ffAb.costMp ?? 1)) {
          casterChar = ch;
          casterTokId = cand.id;
          mpCost = Math.max(0, ffAb.costMp ?? 1);
          break;
        }
      }
    }

    if (!casterChar) {
      showTacticalAlert('Nenhum aliado consciente com Reação e PM disponíveis para Queda Suave.');
      return;
    }

    updateCampaign((prev) => ({
      ...prev,
      characters: prev.characters.map((c) =>
        c.id === casterChar!.id ? { ...c, mp: Math.max(0, c.mp - mpCost) } : c
      ),
      combat: prev.combat.active
        ? {
            ...prev.combat,
            combatants: prev.combat.combatants.map((cb) =>
              cb.tokenId === casterTokId ||
              (casterChar && cb.type === 'character' && cb.referenceId === casterChar.id)
                ? { ...cb, reactionAvailable: false }
                : cb
            ),
          }
        : prev.combat,
    }));

    soundEngine.playSfxPreset('magic');
    pushCombatLog({
      category: 'spell',
      actorName: casterChar?.name || prompt.name,
      actorKind: 'hero',
      actorColor: casterChar?.playerColor || prompt.color,
      summary: `usou Reação: Queda Suave! ${prompt.name} pousou suavemente de ${prompt.heightMeters}m sem dano.`,
    });
    emitFallDamagePrompt(null);
  }, [emitFallDamagePrompt, pushCombatLog, updateCampaign]);

  const dismissFallDamagePrompt = useCallback(() => {
    emitFallDamagePrompt(null);
  }, [emitFallDamagePrompt]);

  // Automatic Fall Damage watcher when an elevated token loses Voando or drops to 0 PV
  useEffect(() => {
    const canHostCheck = role === 'gm' || !isConnected;
    const prevMap = prevFlyingTokensRef.current;
    const nextSnapshot = new Map<
      string,
      { mapId: string; flying: boolean; elevation: number; hp: number }
    >();

    for (const m of campaign.maps) {
      for (const tok of m.tokens) {
        const linkedChar =
          tok.type === 'character' && tok.referenceId
            ? campaign.characters.find((c) => c.id === tok.referenceId)
            : undefined;
        const condIds = linkedChar ? linkedChar.activeConditionIds : tok.activeConditionIds || [];
        const isFlying = condIds.some((cid) => {
          if (cid === 'cond-voando') return true;
          const def = campaign.compendium.conditions.find((c) => c.id === cid);
          return Boolean(def && /voando|voo|levit/i.test(def.name));
        });
        const elevation = tok.elevationMeters || 0;
        const hp = linkedChar ? linkedChar.hp : tok.hp;

        const prevEntry = prevMap.get(tok.id);
        if (canHostCheck && prevEntry && elevation > 0 && !fallDamagePromptRef.current) {
          const lostFlight = prevEntry.flying && !isFlying;
          const droppedToZero = prevEntry.hp > 0 && hp <= 0;
          if (lostFlight || droppedToZero) {
            const reason = droppedToZero ? 'Caiu a 0 PV no ar!' : 'Perdeu a condição Voando no ar!';
            window.setTimeout(() => {
              triggerFallDamageCheck(tok.id, m.id, reason);
            }, 60);
          }
        }
        nextSnapshot.set(tok.id, { mapId: m.id, flying: isFlying, elevation, hp });
      }
    }
    prevFlyingTokensRef.current = nextSnapshot;
  }, [campaign.characters, campaign.compendium.conditions, campaign.maps, isConnected, role, triggerFallDamageCheck]);

  const checkAndTriggerCounterspell = useCallback(
    (params: {
      casterToken: MapToken;
      casterName: string;
      casterColor: string;
      spellName: string;
      costMp: number;
      activeMap: CampaignState['maps'][number];
      onProceedIfNotCountered?: () => void;
    }): boolean => {
      const { casterToken, casterName, casterColor, spellName, costMp, activeMap, onProceedIfNotCountered } = params;
      if (/contram[aá]gica|counterspell/i.test(spellName)) return false;
      const curr = campaignRef.current;
      const sqM = curr.settings.gridSquareMeters || 1.5;
      const reactors: CounterspellPrompt['reactors'] = [];

      for (const tok of activeMap.tokens) {
        if (tok.id === casterToken.id || tok.hp <= 0 || tok.isHidden) continue;
        if (!isTokenHostileTo(tok, casterToken, curr.npcs)) continue;
        if (getToken3DDistance(tok, casterToken, sqM).meters3D > 18.05) continue;
        if (evaluateLineOfSightAndCover(activeMap, tok, casterToken, false).blockedByWall) continue;
        if (tok.type !== 'character' || !tok.referenceId) continue;
        const ch = curr.characters.find((c) => c.id === tok.referenceId);
        if (!ch || ch.hp <= 0) continue;
        if (isTokenIncapacitated(tok, ch, curr.compendium.conditions)) continue;
        const cb = curr.combat.active
          ? curr.combat.combatants.find((c) => c.tokenId === tok.id)
          : undefined;
        if (cb && cb.reactionAvailable === false) continue;

        const csAb =
          ch.knownAbilityIds
            .map((id) => curr.compendium.abilities.find((a) => a.id === id))
            .find((ab) => ab && /contram[aá]gica|counterspell/i.test(ab.name)) ||
          ch.customAbilities.find((ab) => /contram[aá]gica|counterspell/i.test(ab.name));
        const csMpCost = csAb ? Math.max(0, csAb.costMp ?? 3) : 3;
        if (!csAb || ch.mp < csMpCost) continue;

        const st = computeCharacterStats(ch, curr);
        const spellMod = Math.max(
          st.attributes['int']?.mod ?? 0,
          st.attributes['sab']?.mod ?? 0,
          st.attributes['car']?.mod ?? 0
        );
        reactors.push({
          tokenId: tok.id,
          characterId: ch.id,
          name: ch.name,
          color: ch.playerColor || ch.tokenColor,
          mpCost: csMpCost,
          spellcastingMod: spellMod,
        });
      }

      if (reactors.length === 0) return false;
      pendingCounterspellActionRef.current = onProceedIfNotCountered || null;
      const estimatedLevel =
        costMp <= 2 ? 1 : costMp <= 3 ? 2 : costMp <= 4 ? 3 : Math.min(9, Math.ceil(costMp / 2) + 1);
      emitCounterspellPrompt({
        id: `cs-${Date.now()}`,
        casterName,
        casterTokenId: casterToken.id,
        casterColor,
        spellName,
        spellLevel: estimatedLevel,
        reactors,
        resolved: null,
      });
      return true;
    },
    [emitCounterspellPrompt]
  );
  checkAndTriggerCounterspellRef.current = checkAndTriggerCounterspell;

  const triggerCounterspellReaction = useCallback(
    (reactorTokenId: string) => {
      const prompt = counterspellPromptRef.current;
      if (!prompt || prompt.resolved) return;
      const reactor = prompt.reactors.find((r) => r.tokenId === reactorTokenId);
      if (!reactor) return;
      const curr = campaignRef.current;
      const ch = reactor.characterId
        ? curr.characters.find((c) => c.id === reactor.characterId)
        : undefined;

      const spendCounterspellResources = () => {
        updateCampaign((prev) => ({
          ...prev,
          characters: prev.characters.map((c) =>
            ch && c.id === ch.id ? { ...c, mp: Math.max(0, c.mp - reactor.mpCost) } : c
          ),
          combat: prev.combat.active
            ? {
                ...prev.combat,
                combatants: prev.combat.combatants.map((cb) =>
                  cb.tokenId === reactor.tokenId ||
                  (ch && cb.type === 'character' && cb.referenceId === ch.id)
                    ? { ...cb, reactionAvailable: false }
                    : cb
                ),
              }
            : prev.combat,
        }));
      };

      // D&D 5e: Spells of 3rd level or lower are countered automatically! 4th+ requires ability check DC 10 + spellLevel
      if (prompt.spellLevel <= 3) {
        spendCounterspellResources();
        pendingCounterspellActionRef.current = null;
        soundEngine.playSfxPreset('shield');
        if (activeDuelRef.current) {
          emitDuelState(null);
        }
        if (activeSavePromptRef.current) {
          emitSavePromptState(null);
        }
        const summary = `${reactor.name} usou Contramágica e ANULOU "${prompt.spellName}" (Nível ${prompt.spellLevel}) automaticamente!`;
        pushCombatLog({
          category: 'spell',
          actorName: reactor.name,
          actorKind: 'hero',
          actorColor: reactor.color,
          summary,
        });
        emitCounterspellPrompt({
          ...prompt,
          resolved: { countered: true, reactorName: reactor.name, summary },
        });
        return;
      }

      const dc = 10 + prompt.spellLevel;
      const formula = `1d20 ${reactor.spellcastingMod >= 0 ? `+ ${reactor.spellcastingMod}` : `- ${Math.abs(reactor.spellcastingMod)}`}`;
      openManualRoll({
        title: `Contramágica vs ${prompt.spellName}`,
        subtitle: `Magia de Nível ${prompt.spellLevel} • Teste de Conjuração contra CD ${dc}`,
        formula,
        displayFormula: formula,
        previewDice: buildPreviewDiceForFormula(formula, 'normal'),
        rollerName: reactor.name,
        rollerColor: reactor.color,
        diceSkin: (ch?.diceSkin || 'arcane') as DiceSkin,
        allowAdvantageToggle: true,
        advantageMode: 'normal',
        onExecute: (chosenMode) => {
          spendCounterspellResources();
          const res = evaluateFormula(formula, undefined, ch, { advantageMode: chosenMode });
          const countered = res.isCrit || (!res.isFumble && res.total >= dc);
          const pendingProceed = pendingCounterspellActionRef.current;
          pendingCounterspellActionRef.current = null;
          if (countered) {
            if (activeDuelRef.current) emitDuelState(null);
            if (activeSavePromptRef.current) emitSavePromptState(null);
          }
          soundEngine.playSfxPreset(countered ? 'shield' : 'magic');
          const summary = countered
            ? `${reactor.name} rolou ${res.total} (CD ${dc}) e ANULOU "${prompt.spellName}"!`
            : `${reactor.name} rolou ${res.total} (CD ${dc}) e NÃO conseguiu anular "${prompt.spellName}".`;
          sendRoll({
            rollerName: reactor.name,
            rollerRole: roleRef.current,
            rollerColor: reactor.color,
            diceSkin: (ch?.diceSkin || 'arcane') as DiceSkin,
            title: `Contramágica vs ${prompt.spellName}`,
            formula: res.resolvedFormula,
            individualRolls: res.individualRolls,
            rolledDice: res.rolledDice,
            d20Natural: res.d20Natural,
            total: res.total,
            isCrit: res.isCrit,
            isFumble: res.isFumble,
            isSecret: false,
            details: summary,
          });
          pushCombatLog({
            category: 'spell',
            actorName: reactor.name,
            actorKind: 'hero',
            actorColor: reactor.color,
            summary,
          });
          emitCounterspellPrompt({
            ...prompt,
            resolved: { countered, reactorName: reactor.name, summary },
          });
          if (!countered && pendingProceed) {
            window.setTimeout(() => pendingProceed(), 120);
          }
        },
      });
    },
    [emitCounterspellPrompt, emitDuelState, emitSavePromptState, openManualRoll, pushCombatLog, sendRoll, updateCampaign]
  );

  const dismissCounterspellPrompt = useCallback(() => {
    const currPrompt = counterspellPromptRef.current;
    const pendingProceed = !currPrompt?.resolved ? pendingCounterspellActionRef.current : null;
    pendingCounterspellActionRef.current = null;
    emitCounterspellPrompt(null);
    if (pendingProceed) {
      window.setTimeout(() => pendingProceed(), 60);
    }
  }, [emitCounterspellPrompt]);

  const dismissCutIn = useCallback(() => {
    if (cutInTimerRef.current) {
      window.clearTimeout(cutInTimerRef.current);
      cutInTimerRef.current = null;
    }
    setActiveCutIn(null);
  }, []);

  const dismissBlackFlash = useCallback(() => {
    if (blackFlashTimerRef.current) {
      window.clearTimeout(blackFlashTimerRef.current);
      blackFlashTimerRef.current = null;
    }
    setActiveBlackFlash(null);
  }, []);

  const dismissExecution = useCallback(() => {
    if (executionTimerRef.current) {
      window.clearTimeout(executionTimerRef.current);
      executionTimerRef.current = null;
    }
    setActiveExecution(null);
  }, []);

  const triggerBlackFlash = useCallback(
    (params: {
      attackerName: string;
      attackerColor?: string;
      targetName?: string;
      targetTokenId?: string;
      damageTotal?: number;
    }) => {
      const curr = campaignRef.current;
      const targetMapId =
        resolveViewedMapId(curr, roleRef.current, activeCharRef.current || undefined) ||
        curr.activeMapId;
      const evt: BlackFlashCinematicEvent = {
        id: `bf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        attackerName: params.attackerName,
        attackerColor: params.attackerColor,
        targetName: params.targetName,
        targetTokenId: params.targetTokenId,
        mapId: targetMapId,
        damageTotal: params.damageTotal,
        createdAt: Date.now(),
      };
      if (socketRef.current?.connected) {
        socketRef.current.emit('cinematic:blackflash', evt);
      } else {
        if (!cinematicEnabledRef.current || inLobbyRef.current) return;
        if (blackFlashTimerRef.current) window.clearTimeout(blackFlashTimerRef.current);
        setActiveBlackFlash(evt);
        soundEngine.playBlackFlashSfx();
        triggerScreenShake('heavy');
        const m = curr.maps.find((mp) => mp.id === targetMapId);
        const tok = evt.targetTokenId
          ? m?.tokens.find((t) => t.id === evt.targetTokenId)
          : undefined;
        if (tok) {
          const cx = tok.x + (tok.size || 1) / 2;
          const cy = tok.y + (tok.size || 1) / 2;
          triggerShockwave(cx, cy, '#dc2626', 180, targetMapId);
          window.setTimeout(() => triggerShockwave(cx, cy, '#050507', 120, targetMapId), 90);
        }
        blackFlashTimerRef.current = window.setTimeout(() => {
          setActiveBlackFlash((cur) => (cur?.id === evt.id ? null : cur));
        }, 780);
      }
    },
    [triggerScreenShake, triggerShockwave]
  );
  triggerBlackFlashRef.current = triggerBlackFlash;

  const clearMapBattleScars = useCallback(
    (mapId?: string) => {
      const curr = campaignRef.current;
      const targetId =
        mapId ||
        resolveViewedMapId(curr, roleRef.current, activeCharRef.current || undefined) ||
        curr.activeMapId;
      updateCampaign((prev) => ({
        ...prev,
        maps: prev.maps.map((m) => (m.id === targetId ? { ...m, battleScars: [] } : m)),
      }));
    },
    [updateCampaign]
  );

  const triggerUltimateCutIn = useCallback(
    (params: {
      kind?: CutInCinematicEvent['kind'];
      actorName: string;
      techniqueName: string;
      catchphrase?: string;
      color?: string;
      portraitUrl?: string;
      style?: CutInStylePreset;
      sfxPreset?: UltimateSfxPreset;
      sfxUrl?: string;
      domainTheme?: DomainThemePreset;
      activateDomain?: boolean;
      domainMapId?: string;
      domainDurationRounds?: number;
      domainMusicUrl?: string;
      casterCharacterId?: string;
      casterTokenId?: string;
    }) => {
      const curr = campaignRef.current;
      const isClash = Boolean(
        params.activateDomain &&
          curr.activeDomain &&
          curr.activeDomain.name.toLowerCase() !== params.techniqueName.toLowerCase()
      );
      const resolvedKind: CutInCinematicEvent['kind'] = isClash
        ? 'domain-clash'
        : params.activateDomain
          ? 'domain'
          : params.kind || 'ultimate';

      const targetMapId =
        params.domainMapId ||
        resolveViewedMapId(curr, roleRef.current, params.casterCharacterId || activeCharRef.current) ||
        curr.activeMapId;
      const color = params.color || '#38bdf8';
      const evt: CutInCinematicEvent = {
        id: `cutin-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        kind: resolvedKind,
        actorName: params.actorName,
        techniqueName: params.techniqueName,
        catchphrase: params.catchphrase,
        color,
        portraitUrl: params.portraitUrl,
        style: params.style,
        sfxPreset: params.sfxPreset,
        sfxUrl: params.sfxUrl,
        casterTokenId: params.casterTokenId,
        mapId: targetMapId,
        domainTheme: params.domainTheme,
        createdAt: Date.now(),
      };

      if (socketRef.current?.connected) {
        socketRef.current.emit('cinematic:cutin', evt);
      } else {
        if (cutInTimerRef.current) window.clearTimeout(cutInTimerRef.current);
        setActiveCutIn(evt);
        const resolvedAudioUrl = evt.sfxUrl ? resolveAssetUrl(evt.sfxUrl) : undefined;
        const defaultSfx: UltimateSfxPreset =
          evt.sfxPreset ||
          (evt.style === 'dimension-rift'
            ? 'dimension-rift'
            : evt.style === 'persona-slash'
              ? 'anime-slash'
              : evt.domainTheme === 'sonic'
                ? 'sonic-boom'
                : 'bass-drop');
        soundEngine.playUltimateSfx(defaultSfx, resolvedAudioUrl);
        cutInTimerRef.current = window.setTimeout(() => {
          setActiveCutIn((cur) => (cur?.id === evt.id ? null : cur));
          triggerScreenShake('heavy');
          const m = campaignRef.current.maps.find((mp) => mp.id === targetMapId);
          const tok =
            (evt.casterTokenId && m?.tokens.find((t) => t.id === evt.casterTokenId)) ||
            m?.tokens.find((t) => t.name === evt.actorName);
          if (tok) {
            const cx = tok.x + (tok.size || 1) / 2;
            const cy = tok.y + (tok.size || 1) / 2;
            triggerShockwave(cx, cy, color, 190);
            window.setTimeout(() => triggerShockwave(cx, cy, '#ffffff', 120), 120);
          }
        }, 3150);
      }

      if (params.activateDomain) {
        const nextDomain: ActiveDomainState = {
          id: `dom-${Date.now()}`,
          mapId: targetMapId,
          name: params.techniqueName,
          catchphrase: params.catchphrase,
          casterName: params.actorName,
          casterCharacterId: params.casterCharacterId,
          casterTokenId: params.casterTokenId,
          color,
          theme: params.domainTheme || 'sonic',
          portraitUrl: params.portraitUrl,
          musicUrl: params.domainMusicUrl,
          remainingRounds: params.domainDurationRounds,
        };
        updateCampaign((prev) => ({
          ...prev,
          activeDomain: nextDomain,
        }));
        pushCombatLog({
          category: 'spell',
          actorName: params.actorName,
          actorKind: params.casterCharacterId ? 'hero' : 'monster',
          actorColor: color,
          summary: isClash
            ? `CONFRONTO DE DOMÍNIOS! Sobrepor domínio com "${params.techniqueName}"!`
            : `expandiu o Domínio: "${params.techniqueName}"!`,
        });
      } else if (resolvedKind === 'ultimate') {
        pushCombatLog({
          category: 'spell',
          actorName: params.actorName,
          actorKind: params.casterCharacterId ? 'hero' : 'monster',
          actorColor: color,
          summary: `liberou Técnica Suprema: "${params.techniqueName}"!`,
        });
      }
    },
    [pushCombatLog, resolveAssetUrl, triggerScreenShake, triggerShockwave, updateCampaign]
  );
  triggerUltimateCutInRef.current = triggerUltimateCutIn;

  const dismissDomainExpansion = useCallback(() => {
    const curr = campaignRef.current;
    if (!curr.activeDomain) return;
    const domName = curr.activeDomain.name;
    updateCampaign((prev) => ({
      ...prev,
      activeDomain: null,
    }));
    pushCombatLog({
      category: 'system',
      actorName: 'Domínio',
      actorKind: 'system',
      summary: `O Domínio "${domName}" se dissipou.`,
    });
  }, [pushCombatLog, updateCampaign]);

  const enterRpSpotlight = useCallback(
    (entry: Omit<RpSpotlightEntry, 'id' | 'updatedAt'>) => {
      const nextEntry: RpSpotlightEntry = {
        ...entry,
        id: `spot-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        updatedAt: Date.now(),
      };
      const cur = rpSpotlightRef.current;
      const nextState: RpSpotlightState = {
        ...cur,
        [entry.slot]: nextEntry,
      };
      rpSpotlightRef.current = nextState;
      setRpSpotlight(nextState);
      if (socketRef.current?.connected) {
        socketRef.current.emit('spotlight:update', nextState);
      }
    },
    []
  );

  const clearRpSpotlight = useCallback((slot: 'left' | 'right' | 'all' = 'all') => {
    const cur = rpSpotlightRef.current;
    const nextState: RpSpotlightState =
      slot === 'all'
        ? { left: null, right: null }
        : {
            ...cur,
            [slot]: null,
          };
    rpSpotlightRef.current = nextState;
    setRpSpotlight(nextState);
    if (socketRef.current?.connected) {
      socketRef.current.emit('spotlight:update', nextState);
    }
  }, []);

  const switchCharacterForm = useCallback(
    (characterId: string, formId: string) => {
      const curr = campaignRef.current;
      const ch = curr.characters.find((c) => c.id === characterId);
      if (!ch || !ch.forms || ch.forms.length === 0) return;
      const form = ch.forms.find((f) => f.id === formId);
      if (!form) return;

      const nextColor = form.tokenColor || ch.playerColor || ch.tokenColor;
      const nextFrame = form.frameStyle || ch.tokenFrameStyle || 'gold';
      const nextPortrait = form.portraitUrl || ch.portraitUrl;

      updateCampaign((prev) => ({
        ...prev,
        characters: prev.characters.map((c) =>
          c.id !== characterId
            ? c
            : {
                ...c,
                activeFormId: form.id,
                portraitUrl: nextPortrait,
                tokenColor: nextColor,
                playerColor: nextColor,
                tokenFrameStyle: nextFrame,
              }
        ),
        maps: prev.maps.map((m) => ({
          ...m,
          tokens: m.tokens.map((t) =>
            t.type === 'character' && t.referenceId === characterId
              ? {
                  ...t,
                  imageUrl: nextPortrait,
                  color: nextColor,
                  frameStyle: nextFrame,
                }
              : t
          ),
        })),
        combat: {
          ...prev.combat,
          combatants: prev.combat.combatants.map((cb) =>
            cb.type === 'character' && cb.referenceId === characterId
              ? {
                  ...cb,
                  imageUrl: nextPortrait,
                  color: nextColor,
                }
              : cb
          ),
        },
      }));

      // If this character is currently in RP Spotlight, live-update their portrait & badge!
      const curSpot = rpSpotlightRef.current;
      let spotChanged = false;
      const updatedSpot: RpSpotlightState = { ...curSpot };
      if (curSpot.left?.characterId === characterId) {
        updatedSpot.left = {
          ...curSpot.left,
          portraitUrl: nextPortrait,
          color: nextColor,
          frameStyle: nextFrame,
          subtitle: form.name,
        };
        spotChanged = true;
      }
      if (curSpot.right?.characterId === characterId) {
        updatedSpot.right = {
          ...curSpot.right,
          portraitUrl: nextPortrait,
          color: nextColor,
          frameStyle: nextFrame,
          subtitle: form.name,
        };
        spotChanged = true;
      }
      if (spotChanged) {
        rpSpotlightRef.current = updatedSpot;
        setRpSpotlight(updatedSpot);
        if (socketRef.current?.connected) {
          socketRef.current.emit('spotlight:update', updatedSpot);
        }
      }

      // Dramatic Transformation Cut-In when switching to a non-default form (or if cinematicTransform is enabled)
      if (form.cinematicTransform ?? !form.isDefault) {
        triggerUltimateCutIn({
          kind: 'transform',
          actorName: ch.name,
          techniqueName: form.name,
          catchphrase: form.catchphrase,
          color: form.auraColor || nextColor,
          portraitUrl: nextPortrait,
          casterCharacterId: ch.id,
        });
      } else {
        soundEngine.playSfxPreset('magic');
      }

      pushCombatLog({
        category: 'condition',
        actorName: ch.name,
        actorKind: 'hero',
        actorColor: nextColor,
        summary: `assumiu a forma: ${form.name}${
          form.bonusAc || form.bonusSpeed
            ? ` (${[
                form.bonusAc ? `${form.bonusAc > 0 ? '+' : ''}${form.bonusAc} CA` : '',
                form.bonusSpeed ? `${form.bonusSpeed > 0 ? '+' : ''}${form.bonusSpeed}m` : '',
              ]
                .filter(Boolean)
                .join(', ')})`
            : ''
        }.`,
      });
    },
    [pushCombatLog, triggerUltimateCutIn, updateCampaign]
  );

  // Unified Consumable Handler (shared by PlayerActionHUD & CharacterSheetModal — enforces turn/Bonus Action/0 PV/Incapacitado, detects Mana vs HP, deducts ONLY on confirm!)
  const useConsumable = useCallback(
    (characterId: string, inventoryEntryId: string, itemId: string) => {
      const curr = campaignRef.current;
      const char = curr.characters.find((c) => c.id === characterId);
      if (!char) return;
      const itemDef = curr.compendium.items.find((i) => i.id === itemId);
      if (!itemDef) return;
      const invEntry = char.inventory.find((x) => x.id === inventoryEntryId);
      if (!invEntry || invEntry.quantity <= 0) {
        showTacticalAlert(`${char.name} não possui mais ${itemDef.name}!`);
        return;
      }

      const charTok = curr.maps
        .flatMap((m) => m.tokens)
        .find((t) => t.type === 'character' && t.referenceId === char.id);
      if (char.hp <= 0 || (charTok && charTok.hp <= 0)) {
        showTacticalAlert(`${char.name} está caído (0 PV) e não pode usar consumíveis!`);
        return;
      }
      if (
        isTokenIncapacitated(
          charTok || ({ activeConditionIds: char.activeConditionIds } as MapToken),
          char,
          curr.compendium.conditions
        )
      ) {
        showTacticalAlert(`${char.name} está incapacitado e não pode usar consumíveis!`);
        return;
      }

      const combat = curr.combat;
      const charCb = combat.active
        ? combat.combatants.find((cb) => cb.type === 'character' && cb.referenceId === char.id)
        : undefined;
      const activeTurnCb = combat.active ? combat.combatants[combat.currentTurnIndex] : undefined;
      if (combat.active) {
        if (roleRef.current !== 'gm') {
          if (!charCb) {
            showTacticalAlert(`${char.name} não está na fila de iniciativa deste combate.`);
            return;
          }
          if (activeTurnCb && activeTurnCb.id !== charCb.id) {
            showTacticalAlert(`Aguarde seu turno (${activeTurnCb.name} está agindo) para usar ${itemDef.name}.`);
            return;
          }
        }
        if (charCb && charCb.bonusActionAvailable === false) {
          showTacticalAlert(`${char.name} já gastou a Ação Bônus neste turno (consumíveis custam Ação Bônus)!`);
          return;
        }
      }

      const stats = computeCharacterStats(char, curr);
      const rawFormula = (itemDef.damageFormula || '').trim();
      const descDiceMatch = (itemDef.description || '').match(/\b(\d+d\d+(?:\s*[+-]\s*\d+)?)\b/i);
      const effectiveFormula = rawFormula || descDiceMatch?.[1] || '';
      const combinedText = `${itemDef.name} ${itemDef.damageType || ''} ${itemDef.description || ''}`;
      const isMpPotion =
        /mana|[ée]ter|\bpm\b|\bmp\b|energia arcana/i.test(`${itemDef.name} ${itemDef.damageType || ''}`) &&
        !/vida|\bpv\b|\bhp\b/i.test(itemDef.name);
      const isHpPotion =
        !isMpPotion &&
        (/cura/i.test(itemDef.damageType || '') || /po[çc][ãa]o|cura|vida|elixir/i.test(combinedText));

      const commitConsumableUse = (rolledTotal?: number, rollRes?: ReturnType<typeof evaluateFormula>) => {
        // Re-check live inventory inside updater to prevent double-spend
        let consumedOk = false;
        updateCampaign((prev) => {
          const liveChar = prev.characters.find((c) => c.id === char.id);
          const liveInv = liveChar?.inventory.find((x) => x.id === inventoryEntryId);
          if (!liveChar || !liveInv || liveInv.quantity <= 0) return prev;
          consumedOk = true;
          const liveStats = computeCharacterStats(liveChar, prev);
          const nextMp =
            isMpPotion && rolledTotal && rolledTotal > 0
              ? Math.min(liveStats.maxMp, liveChar.mp + rolledTotal)
              : liveChar.mp;
          return {
            ...prev,
            characters: prev.characters.map((c) => {
              if (c.id !== char.id) return c;
              return {
                ...c,
                mp: nextMp,
                inventory: c.inventory
                  .map((x) => (x.id === inventoryEntryId ? { ...x, quantity: x.quantity - 1 } : x))
                  .filter((x) => x.quantity > 0),
              };
            }),
            combat:
              prev.combat.active && charCb
                ? {
                    ...prev.combat,
                    combatants: prev.combat.combatants.map((cb) =>
                      cb.id === charCb.id ? consumeCombatantEconomy(cb, 'Bônus') : cb
                    ),
                  }
                : prev.combat,
          };
        });
        if (!consumedOk) {
          showTacticalAlert(`${char.name} não possui mais ${itemDef.name}!`);
          return;
        }

        if (isHpPotion && rolledTotal && rolledTotal > 0) {
          window.setTimeout(() => {
            applyDamage(charTok?.id || char.id, rolledTotal, true, undefined, 'Cura');
            if (charTok) triggerSlashVfx(charTok.id, 'heal');
          }, 60);
          soundEngine.playSfxPreset('heal');
        } else if (isMpPotion) {
          soundEngine.playSfxPreset('magic');
          if (charTok) triggerSlashVfx(charTok.id, 'heal');
        } else {
          soundEngine.playSfxPreset('magic');
        }

        const resShort = campaignRef.current.settings.resourceShort || 'PM';
        const summaryText =
          isMpPotion && rolledTotal
            ? `usou ${itemDef.name} e recuperou +${rolledTotal} ${resShort}`
            : isHpPotion && rolledTotal
              ? `usou ${itemDef.name} e recuperou +${rolledTotal} PV`
              : `consumiu ${itemDef.name}`;

        pushCombatLog({
          category: isHpPotion || isMpPotion ? 'heal' : 'system',
          actorName: char.name,
          actorKind: 'hero',
          actorColor: char.playerColor || char.tokenColor,
          summary: summaryText,
        });

        sendRoll({
          rollerName: char.name,
          rollerRole: roleRef.current,
          rollerColor: char.playerColor || char.tokenColor,
          diceSkin: (char.diceSkin || 'emerald') as DiceSkin,
          title: `Consumível: ${itemDef.name}`,
          formula: rollRes ? rollRes.resolvedFormula : effectiveFormula || 'Consumível',
          individualRolls: rollRes ? rollRes.individualRolls : [],
          rolledDice: rollRes ? rollRes.rolledDice : [],
          total: rolledTotal || 0,
          damageTotal: rolledTotal,
          damageType: isMpPotion ? resShort : isHpPotion ? 'Cura' : undefined,
          isSecret: false,
          details: summaryText + (itemDef.description ? ` • ${itemDef.description}` : ''),
        });
        showTacticalAlert(`🧪 ${char.name} ${summaryText}!`);
      };

      if (effectiveFormula && /\d*d\d+/i.test(effectiveFormula)) {
        openManualRoll({
          title: itemDef.name,
          subtitle: isMpPotion
            ? `Recuperação de ${curr.settings.resourceName} (Ação Bônus)`
            : isHpPotion
              ? 'Poção de Cura (Ação Bônus)'
              : 'Consumível (Ação Bônus)',
          formula: effectiveFormula,
          displayFormula: formatFormulaForDisplay(effectiveFormula, stats, char),
          previewDice: buildPreviewDiceForFormula(effectiveFormula, 'normal'),
          rollerName: char.name,
          rollerColor: char.playerColor || char.tokenColor,
          diceSkin: (char.diceSkin || 'emerald') as DiceSkin,
          allowAdvantageToggle: false,
          advantageMode: 'normal',
          onExecute: () => {
            const res = evaluateFormula(effectiveFormula, stats, char);
            const total = Math.max(1, res.total);
            commitConsumableUse(total, res);
          },
        });
      } else {
        const flatTotal = effectiveFormula
          ? Math.max(1, evaluateFormula(effectiveFormula, stats, char).total)
          : undefined;
        commitConsumableUse(flatTotal);
      }
    },
    [applyDamage, openManualRoll, pushCombatLog, sendRoll, showTacticalAlert, triggerSlashVfx, updateCampaign]
  );

  const hasGmPrivilege = role === 'gm' || isGmHostSession;

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
        viewedMapId,
        theme,
        setTheme,
        role,
        setRole,
        hasGmPrivilege,
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
        recentRollToasts,
        dismissRollToast,
        pendingManualRoll,
        openManualRoll,
        cancelManualRoll,
        executeManualRoll,
        activeAmbientName,
        activeThemeBanner,
        pings,
        tokenSpeeches,
        emitTokenSpeech,
        tempDrawings,
        emitTempDrawing,
        clearMapDrawings,
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
        adjustHeroInspiration,
        spendHeroInspiration,
        useChargedItemAbility,
        useConsumable,
        rerollDuelAttackWithInspiration,
        rerollSaveWithInspiration,
        acceptFailedSaveTarget,
        startTacticalSavePrompt,
        triggerDuelShieldReaction,
        triggerDuelUncannyDodgeReaction,
        dismissDuelReaction,
        fallDamagePrompt,
        setTokenElevation,
        triggerFallDamageCheck,
        rollFallDamageNow,
        useFeatherFallReaction,
        dismissFallDamagePrompt,
        counterspellPrompt,
        triggerCounterspellReaction,
        dismissCounterspellPrompt,
        activeCutIn,
        triggerUltimateCutIn,
        dismissCutIn,
        activeBlackFlash,
        dismissBlackFlash,
        activeExecution,
        dismissExecution,
        clearMapBattleScars,
        dismissDomainExpansion,
        switchCharacterForm,
        rpSpotlight,
        enterRpSpotlight,
        clearRpSpotlight,
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
        moveTokensLive,
        setLocallyDraggedTokenIds,
        deleteCharacter,
        rollDeathSave,
        setDeathSaveManual,
        assistDeathSave,
        gmResolveDeathSave,
        activeSecretPassage,
        triggerSecretPassage,
        dismissSecretPassage,
        moveTokensToMap,
        useBossLegendaryResistance,
        claimTreasureMarker,
        sendRoll,
        quickRollFormula,
        rollCharacterAction,
        pushCombatLog,
        awardXp,
        castAoEAbility,
        executeTeleportAbility,
        applyDamage,
        activeRestBanner,
        dismissRestBanner,
        partyRest,
        projectileVfx,
        screenShakeActive,
        screenShakeIntensity,
        cinematicEnabled,
        setCinematicEnabled,
        autoCameraFocus,
        setAutoCameraFocus,
        shockwaves,
        triggerShockwave,
        triggerScreenShake,
        cameraFocusSignal,
        broadcastCameraFocus,
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
