import express from 'express';
import http from 'node:http';
import dgram from 'node:dgram';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import cors from 'cors';
import { Server } from 'socket.io';
import { Tunnel, bin as cloudflaredBin, install as installCloudflared } from 'cloudflared';
import { createBlankCampaign, createStarterCampaign } from '../src/shared/starterSeed';
import {
  applyBg3ReviveActionPenalty,
  applyCharacterRestToState,
  compareInitiativeOrder,
  computeCharacterStats,
  computeConcentrationDc,
  consumeCombatantEconomy,
  encodeRoomCode,
  evaluateFormula,
  findNearestFreeGridCell,
  getCombatantActionsRemaining,
  getConditionExtraEconomy,
  isTokenNameHiddenFromPlayers,
  normalizeHeroCharacter,
  resolveDamageWithAffinities,
  syncCampaignDerivedCharacterStats,
} from '../src/shared/rulesEngine';
import {
  BattleScar,
  BattleScarKind,
  BlackFlashCinematicEvent,
  BossBannerState,
  CampaignState,
  CampaignSummary,
  CardRewardNotification,
  Character,
  ChatMessageEntry,
  CombatDuelState,
  CombatLogEntry,
  ConnectedPlayerInfo,
  CounterspellPrompt,
  CutInCinematicEvent,
  ExecutionCinematicEvent,
  FallDamagePrompt,
  HandoutPayload,
  InitiativeCeremonyState,
  MapPointerState,
  OpportunityAttackPrompt,
  PlayerRequest,
  RollLogEntry,
  RpSpotlightState,
  SavedHeroEntry,
  SkillCheckRequest,
  TacticalSavePrompt,
} from '../src/shared/types';

const PORT = Number(process.env.PORT || 3001);
const DISCOVERY_UDP_PORT = Number(process.env.DISCOVERY_UDP_PORT || 3002);
const DATA_DIR = process.env.CHRONICLES_DATA_DIR
  ? path.resolve(process.env.CHRONICLES_DATA_DIR)
  : path.resolve(process.cwd(), 'server', 'data');
const CAMPAIGNS_DIR = path.join(DATA_DIR, 'campaigns');
const CHARACTERS_DIR = path.join(DATA_DIR, 'characters');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const LEGACY_DATA_FILE = path.join(DATA_DIR, 'campaign-state.json');
const ACTIVE_ID_FILE = path.join(DATA_DIR, 'active-campaign.txt');
const DIST_DIR = process.env.CHRONICLES_DIST_DIR
  ? path.resolve(process.env.CHRONICLES_DIST_DIR)
  : path.resolve(process.cwd(), 'dist');

let campaignState: CampaignState = createStarterCampaign();
let saveQueue: Promise<void> = Promise.resolve();
let activeSkillCheck: SkillCheckRequest | null = null;
let activeSavePrompt: TacticalSavePrompt | null = null;
let activeRpSpotlight: RpSpotlightState = { left: null, right: null };
let pendingRequests: PlayerRequest[] = [];
const activePointers = new Map<string, MapPointerState>();
const connectedPlayers = new Map<string, ConnectedPlayerInfo>();
const recentDeathSaveAuthority = new Map<string, { socketId: string; at: number }>();
const recentDamageAuthority = new Map<
  string,
  { tokenId: string; charId?: string; at: number }
>();
const recentMoveAuthority = new Map<string, { mapId: string; x: number; y: number; socketId: string; at: number }>();
const deletedVaultHeroIds = new Set<string>();
const lastSyncedVaultHash = new Map<string, string>();
const gmHostSocketIds = new Set<string>();
let gmRoomOpen = false;
let gmDisconnectTimer: ReturnType<typeof setTimeout> | null = null;

function isLoopbackRequest(req: express.Request): boolean {
  if (isExternalTunnelRequest(req)) return false;
  const remoteIp = String(req.socket.remoteAddress || '');
  return remoteIp === '127.0.0.1' || remoteIp === '::1' || remoteIp === '::ffff:127.0.0.1';
}

function isSocketGm(socketId: string): boolean {
  return gmHostSocketIds.has(socketId) || connectedPlayers.get(socketId)?.role === 'gm';
}

const ALLOWED_UPLOAD_EXTS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.mp3',
  '.ogg',
  '.wav',
  '.m4a',
]);

function sanitizeUploadExt(filename: string): string | null {
  const ext = path.extname(filename || '').toLowerCase();
  return ALLOWED_UPLOAD_EXTS.has(ext) ? ext : null;
}

/**
 * Projects `CampaignState` for a specific viewer socket so non-GM players NEVER receive
 * GM notes, hidden traps/secrets, unrevealed tokens, other players' whispers, secret rolls,
 * or NPC secret notes over the network.
 */
function sanitizeCampaignForPlayer(
  state: CampaignState,
  viewer?: { playerId?: string; playerName?: string; characterId?: string; characterName?: string }
): CampaignState {
  const viewerPlayerId = viewer?.playerId;
  const viewerCharIds = new Set<string>();
  if (viewer?.characterId) viewerCharIds.add(viewer.characterId);
  if (viewerPlayerId) {
    for (const c of state.characters || []) {
      if (c.ownerPlayerId === viewerPlayerId) viewerCharIds.add(c.id);
    }
  }
  const gmNameLower = (state.gmName || 'Mestre').trim().toLowerCase();

  return {
    ...state,
    gmNotes: [],
    rollLog: (state.rollLog || []).filter((r) => !r.isSecret),
    chatLog: (state.chatLog || []).filter((msg) => {
      if (!msg.isWhisper) return true;
      if (viewerPlayerId && msg.senderPlayerId === viewerPlayerId) return true;
      const targetLower = (msg.recipientName || '').trim().toLowerCase();
      if (targetLower === 'mestre' || targetLower === 'gm' || targetLower === gmNameLower) {
        return false;
      }
      if (msg.recipientPlayerId) {
        return Boolean(viewerPlayerId && msg.recipientPlayerId === viewerPlayerId);
      }
      const pLower = (viewer?.playerName || '').trim().toLowerCase();
      const cLower = (viewer?.characterName || '').trim().toLowerCase();
      return Boolean(targetLower && (targetLower === pLower || targetLower === cLower));
    }),
    npcs: (state.npcs || [])
      .filter((n) => n.revealedToPlayers)
      .map((n) => ({
        ...n,
        secretNotes: '',
      })),
    maps: (state.maps || []).map((m) => ({
      ...m,
      gmMarkers: (m.gmMarkers || []).filter(
        (gm) =>
          gm.revealed ||
          (gm.visibleToCharacterIds || []).some((cid) => viewerCharIds.has(cid))
      ),
      tokens: (m.tokens || []).filter((t) => {
        if (!t.isHidden) return true;
        if (t.type === 'character' && t.referenceId && viewerCharIds.has(t.referenceId)) return true;
        if (t.controlledByCharacterId && viewerCharIds.has(t.controlledByCharacterId)) return true;
        return (t.visibleToCharacterIds || []).some((cid) => viewerCharIds.has(cid));
      }),
    })),
    combat: state.combat
      ? {
          ...state.combat,
          combatants: (state.combat.combatants || []).filter((cb) => !cb.isHidden),
        }
      : state.combat,
  };
}

function sanitizeCampaignForSocket(state: CampaignState, socketId: string): CampaignState {
  if (isSocketGm(socketId)) return state;
  return sanitizeCampaignForPlayer(state, connectedPlayers.get(socketId));
}

function broadcastCampaignUpdated(excludeSocketId?: string): void {
  for (const [sid, s] of io.sockets.sockets) {
    if (excludeSocketId && sid === excludeSocketId) continue;
    s.emit('campaign:updated', sanitizeCampaignForSocket(campaignState, sid));
  }
}

function sanitizeSkillCheckForSocket(
  check: SkillCheckRequest | null,
  socketId: string
): SkillCheckRequest | null {
  if (!check || !check.hideDc || isSocketGm(socketId)) return check;
  return {
    ...check,
    dc: 0,
    results: check.results.map((r) => ({ ...r, passed: false })),
  };
}

function broadcastSkillCheck(): void {
  for (const [sid, s] of io.sockets.sockets) {
    s.emit('check:updated', sanitizeSkillCheckForSocket(activeSkillCheck, sid));
  }
}

function broadcastEphemeralReset(): void {
  activeSkillCheck = null;
  activeSavePrompt = null;
  activeRpSpotlight = { left: null, right: null };
  pendingRequests = [];
  activePointers.clear();
  recentDeathSaveAuthority.clear();
  recentDamageAuthority.clear();
  recentMoveAuthority.clear();
  io.emit('check:updated', null);
  io.emit('save-prompt:updated', null);
  io.emit('request:list', []);
  io.emit('spotlight:updated', activeRpSpotlight);
  io.emit('pointer:bulk', []);
  io.emit('duel:updated', null);
  io.emit('opportunity:prompt', null);
  io.emit('fall:prompt', null);
  io.emit('counterspell:prompt', null);
  io.emit('cinematic:cutin', null);
}

/**
 * When a non-GM player submits a `campaign:patch`, re-attach all GM-only hidden entities
 * (gmNotes, unrevealed NPCs & secretNotes, hidden tokens, unrevealed gmMarkers, hidden combatants)
 * that were intentionally omitted from that player's sanitized view.
 */
function preserveGmSecretsOnPlayerPatch(
  incoming: CampaignState,
  authoritative: CampaignState
): CampaignState {
  const incomingNpcById = new Map((incoming.npcs || []).map((n) => [n.id, n]));
  const mergedNpcs = (authoritative.npcs || []).map((authNpc) => {
    const inc = incomingNpcById.get(authNpc.id);
    if (!inc) return authNpc;
    return {
      ...inc,
      secretNotes: authNpc.secretNotes,
      revealedToPlayers: authNpc.revealedToPlayers,
    };
  });

  const authMapById = new Map((authoritative.maps || []).map((m) => [m.id, m]));
  const mergedMaps = (incoming.maps || []).map((incMap) => {
    const authMap = authMapById.get(incMap.id);
    if (!authMap) return incMap;
    const incTokenIds = new Set((incMap.tokens || []).map((t) => t.id));
    const missingHiddenTokens = (authMap.tokens || []).filter(
      (t) => t.isHidden && !incTokenIds.has(t.id)
    );
    const incMarkerIds = new Set((incMap.gmMarkers || []).map((gm) => gm.id));
    const missingHiddenMarkers = (authMap.gmMarkers || []).filter(
      (gm) => !gm.revealed && !incMarkerIds.has(gm.id)
    );
    return {
      ...incMap,
      tokens: [...(incMap.tokens || []), ...missingHiddenTokens],
      gmMarkers: [...(incMap.gmMarkers || []), ...missingHiddenMarkers],
    };
  });

  const incCombatantIds = new Set((incoming.combat?.combatants || []).map((cb) => cb.id));
  const missingHiddenCombatants = (authoritative.combat?.combatants || []).filter(
    (cb) => cb.isHidden && !incCombatantIds.has(cb.id)
  );
  const mergedCombat =
    incoming.combat && missingHiddenCombatants.length > 0
      ? {
          ...incoming.combat,
          combatants: [...incoming.combat.combatants, ...missingHiddenCombatants].sort(
            compareInitiativeOrder
          ),
        }
      : incoming.combat;

  return {
    ...incoming,
    gmNotes: authoritative.gmNotes,
    npcs: mergedNpcs,
    maps: mergedMaps,
    combat: mergedCombat,
  };
}

function getLocalNetworkAddresses(): Array<{
  name: string;
  address: string;
  url: string;
  roomCode: string;
}> {
  const interfaces = os.networkInterfaces();
  const list: Array<{ name: string; address: string; url: string; roomCode: string }> = [];
  for (const [name, nets] of Object.entries(interfaces)) {
    if (!nets) continue;
    for (const net of nets) {
      if (net.family === 'IPv4' && !net.internal) {
        list.push({
          name,
          address: net.address,
          url: `http://${net.address}:${PORT}`,
          roomCode: encodeRoomCode(net.address, PORT),
        });
      }
    }
  }
  return list;
}

function getCampaignFilePath(id: string): string {
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(CAMPAIGNS_DIR, `${safeId}.json`);
}

function getSavedHeroFilePath(id: string): string {
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(CHARACTERS_DIR, `${safeId}.json`);
}

/**
 * Windows-safe atomic file writer:
 * Writes to a unique sibling temp file, retries fs.rename on transient EPERM/EBUSY/EACCES
 * (e.g. Defender/indexer lock), and falls back to direct overwrite while cleaning up .tmp files.
 */
async function atomicWriteFile(targetFile: string, content: string): Promise<void> {
  const dir = path.dirname(targetFile);
  await fs.mkdir(dir, { recursive: true });
  const tmpFile = `${targetFile}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}.tmp`;
  await fs.writeFile(tmpFile, content, 'utf-8');

  const retryDelays = [40, 90, 160, 240, 350, 500];
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
    try {
      await fs.rename(tmpFile, targetFile);
      return;
    } catch (err: unknown) {
      lastErr = err;
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES') {
        break;
      }
      if (attempt < retryDelays.length) {
        await new Promise((r) => setTimeout(r, retryDelays[attempt]));
      }
    }
  }

  // Fallback on persistent Windows rename lock: write directly in-place and remove temp file
  try {
    await fs.writeFile(targetFile, content, 'utf-8');
  } catch (directErr) {
    await fs.unlink(tmpFile).catch(() => {});
    throw directErr || lastErr;
  }
  await fs.unlink(tmpFile).catch(() => {});
}

async function cleanupOrphanTmpFiles(dir: string): Promise<void> {
  try {
    const files = await fs.readdir(dir);
    for (const file of files) {
      if (file.endsWith('.tmp')) {
        await fs.unlink(path.join(dir, file)).catch(() => {});
      }
    }
  } catch {
    // ignore cleanup errors
  }
}

function isExternalTunnelRequest(req: express.Request): boolean {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').toLowerCase();
  return Boolean(
    req.headers['cf-ray'] ||
      req.headers['cf-connecting-ip'] ||
      host.includes('trycloudflare.com')
  );
}

async function listSavedCharacters(): Promise<SavedHeroEntry[]> {
  await fs.mkdir(CHARACTERS_DIR, { recursive: true });
  const files = await fs.readdir(CHARACTERS_DIR);
  const entries: SavedHeroEntry[] = [];
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    try {
      const raw = await fs.readFile(path.join(CHARACTERS_DIR, file), 'utf-8');
      const parsed = JSON.parse(raw) as SavedHeroEntry;
      if (parsed?.id && parsed?.character?.name) {
        entries.push(parsed);
      }
    } catch {
      // skip invalid file
    }
  }
  entries.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return entries;
}

async function upsertSavedCharacter(
  char: Character,
  meta?: { originCampaignId?: string; originCampaignName?: string },
  sourceCampaign?: CampaignState
): Promise<SavedHeroEntry> {
  await fs.mkdir(CHARACTERS_DIR, { recursive: true });
  const vaultId = (char.vaultId || char.id).replace(/[^a-zA-Z0-9_-]/g, '_');
  deletedVaultHeroIds.delete(vaultId);
  const now = new Date().toISOString();
  const targetFile = getSavedHeroFilePath(vaultId);
  const campRef = sourceCampaign || campaignState;

  let existingSavedAt = now;
  let existingCampId = meta?.originCampaignId;
  let existingCampName = meta?.originCampaignName;
  try {
    const prevRaw = await fs.readFile(targetFile, 'utf-8');
    const prev = JSON.parse(prevRaw) as SavedHeroEntry;
    if (prev.savedAt) existingSavedAt = prev.savedAt;
    if (!existingCampId) existingCampId = prev.originCampaignId;
    if (!existingCampName) existingCampName = prev.originCampaignName;
  } catch {
    // brand new entry
  }

  const normalizedChar = normalizeHeroCharacter(
    { ...char, vaultId, lastSyncedAt: now },
    campRef
  );
  const entry: SavedHeroEntry = {
    id: vaultId,
    character: normalizedChar,
    savedAt: existingSavedAt,
    updatedAt: now,
    originCampaignId: existingCampId || campRef.id,
    originCampaignName: existingCampName || campRef.name,
  };
  await atomicWriteFile(targetFile, JSON.stringify(entry, null, 2));
  const { lastSyncedAt: _ignored, ...stableChar } = normalizedChar;
  lastSyncedVaultHash.set(vaultId, JSON.stringify(stableChar));
  return entry;
}

async function syncVaultLinkedCharactersToDisk(camp: CampaignState): Promise<boolean> {
  await fs.mkdir(CHARACTERS_DIR, { recursive: true });
  let changed = false;

  for (const ch of camp.characters || []) {
    if (!ch || !ch.id || !ch.name) continue;
    const vaultId = (ch.vaultId || ch.id).replace(/[^a-zA-Z0-9_-]/g, '_');
    // Respect explicit vault deletions — never resurrect deleted vault heroes on unrelated map saves!
    if (deletedVaultHeroIds.has(vaultId)) continue;
    const { lastSyncedAt: _ignored, ...stableChar } = ch;
    const hash = JSON.stringify(stableChar);
    if (lastSyncedVaultHash.get(vaultId) === hash) continue;
    await upsertSavedCharacter(
      ch,
      {
        originCampaignId: camp.id,
        originCampaignName: camp.name,
      },
      camp
    );
    changed = true;
  }
  return changed;
}

function normalizeCampaign(c: CampaignState): CampaignState {
  const existingConds = c.compendium?.conditions || [];
  const hasParalyzed = existingConds.some((cd) => cd.id === 'cond-paralisado');
  const hasHaste = existingConds.some((cd) => cd.id === 'cond-velocidade');
  let nextConds = hasParalyzed
    ? existingConds
    : [
        ...existingConds,
        {
          id: 'cond-paralisado',
          name: 'Paralisado',
          color: '#f97316',
          icon: '⚡',
          description:
            'Incapacitado: ataques contra você têm Vantagem e acertos a 1,5m são Crítico automático.',
          modifiers: [{ target: 'speed' as const, value: -9, label: 'Paralisado' }],
        },
      ];
  if (!hasHaste) {
    nextConds = [
      ...nextConds,
      {
        id: 'cond-velocidade',
        name: 'Velocidade (Haste)',
        color: '#38bdf8',
        icon: '💨',
        description:
          'Deslocamento aumentado, +2 na Defesa (CA) e +1 Ação Padrão adicional por turno.',
        extraActions: 1,
        modifiers: [
          { target: 'defense' as const, value: 2, label: 'Velocidade' },
          { target: 'speed' as const, value: 9, label: 'Velocidade' },
        ],
      },
    ];
  }

  const existingSkills = (c.compendium?.skills || []).map((sk) =>
    sk.id === 'fortitude' && sk.name === 'Fortitude'
      ? { ...sk, name: 'Resiliência' }
      : sk
  );
  const ensureSaves = [
    {
      id: 'salv-forca',
      name: 'Vigor Físico',
      defaultAttributeId: 'for',
      isSavingThrow: true,
      description: 'Resistir a empurrões, agarrões e força bruta.',
    },
    {
      id: 'salv-inteligencia',
      name: 'Lucidez',
      defaultAttributeId: 'int',
      isSavingThrow: true,
      description: 'Resistir a ilusões, labirintos mentais e ataques psíquicos.',
    },
    {
      id: 'salv-carisma',
      name: 'Presença',
      defaultAttributeId: 'car',
      isSavingThrow: true,
      description: 'Resistir a banimento, possessão e drenagem espiritual.',
    },
  ];
  const nextSkills = [
    ...existingSkills,
    ...ensureSaves.filter((sv) => !existingSkills.some((sk) => sk.id === sv.id)),
  ];

  const normalized: CampaignState = {
    ...c,
    coverUrl: c.coverUrl || '',
    gmName: c.gmName || 'Mestre',
    updatedAt: c.updatedAt || new Date().toISOString(),
    settings: {
      ...c.settings,
      attributePointBudget: c.settings?.attributePointBudget ?? 15,
      maxTrainedSkills: c.settings?.maxTrainedSkills ?? 4,
      showEnemyAcToPlayers: c.settings?.showEnemyAcToPlayers ?? false,
      enableFlanking: c.settings?.enableFlanking ?? true,
    },
    compendium: {
      ...c.compendium,
      conditions: nextConds,
      skills: nextSkills,
    },
    customMusicTracks: Array.isArray(c.customMusicTracks) ? c.customMusicTracks : [],
    chatLog: Array.isArray(c.chatLog) ? c.chatLog : [],
    activeBoss: c.activeBoss ?? null,
    maps: (c.maps || []).map((m) => ({
      ...m,
      gmMarkers: Array.isArray(m.gmMarkers) ? m.gmMarkers : [],
      terrainCells: m.terrainCells && typeof m.terrainCells === 'object' ? m.terrainCells : {},
      wallMeta: m.wallMeta && typeof m.wallMeta === 'object' ? m.wallMeta : {},
    })),
    characters: (c.characters || []).map((ch) => ({
      ...ch,
      playerColor: ch.playerColor || ch.tokenColor || '#f59e0b',
      tokenFrameStyle: ch.tokenFrameStyle || 'gold',
      diceSkin: ch.diceSkin || 'gold',
      customAttacks: Array.isArray(ch.customAttacks) ? ch.customAttacks : [],
      customAbilities: Array.isArray(ch.customAbilities) ? ch.customAbilities : [],
      damageResistances: Array.isArray(ch.damageResistances) ? ch.damageResistances : [],
      damageImmunities: Array.isArray(ch.damageImmunities) ? ch.damageImmunities : [],
      damageVulnerabilities: Array.isArray(ch.damageVulnerabilities) ? ch.damageVulnerabilities : [],
      deathSaves: ch.deathSaves || { successes: 0, failures: 0 },
    })),
    combat: c.combat
      ? {
          ...c.combat,
          combatants: (c.combat.combatants || []).map((cb) => ({
            ...cb,
            speedMeters: cb.speedMeters ?? 9,
            remainingMoveMeters: cb.remainingMoveMeters ?? cb.speedMeters ?? 9,
            actionAvailable: cb.actionAvailable ?? true,
            bonusActionAvailable: cb.bonusActionAvailable ?? true,
            reactionAvailable: cb.reactionAvailable ?? true,
            disengaged: cb.disengaged ?? false,
            dodging: cb.dodging ?? false,
          })),
        }
      : { active: false, round: 1, currentTurnIndex: 0, combatants: [] },
  };
  return syncCampaignDerivedCharacterStats(normalized);
}

async function listSavedCampaigns(): Promise<CampaignSummary[]> {
  await fs.mkdir(CAMPAIGNS_DIR, { recursive: true });
  const files = await fs.readdir(CAMPAIGNS_DIR);
  const summaries: CampaignSummary[] = [];

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    try {
      const raw = await fs.readFile(path.join(CAMPAIGNS_DIR, file), 'utf-8');
      const parsed = JSON.parse(raw) as CampaignState;
      summaries.push({
        id: parsed.id,
        name: parsed.name,
        description: parsed.description || '',
        coverUrl: parsed.coverUrl || '',
        gmName: parsed.gmName || 'Mestre',
        updatedAt: parsed.updatedAt || new Date().toISOString(),
        characterCount: parsed.characters?.length || 0,
      });
    } catch {
      // skip corrupted file
    }
  }

  summaries.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return summaries;
}

async function ensureDataLoaded() {
  await fs.mkdir(CAMPAIGNS_DIR, { recursive: true });
  await fs.mkdir(CHARACTERS_DIR, { recursive: true });
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  await cleanupOrphanTmpFiles(CAMPAIGNS_DIR);
  await cleanupOrphanTmpFiles(CHARACTERS_DIR);

  // Migrate legacy single file if campaigns directory is empty
  const existingFiles = (await fs.readdir(CAMPAIGNS_DIR)).filter((f) => f.endsWith('.json'));
  if (existingFiles.length === 0) {
    try {
      const legacyRaw = await fs.readFile(LEGACY_DATA_FILE, 'utf-8');
      const legacyParsed = normalizeCampaign(JSON.parse(legacyRaw) as CampaignState);
      campaignState = legacyParsed;
      await persistState();
      console.log(`[SERVER] Campanha migrada para ${getCampaignFilePath(campaignState.id)}`);
      return;
    } catch {
      campaignState = normalizeCampaign(createStarterCampaign());
      await persistState();
      console.log(`[SERVER] Campanha inicial criada em ${getCampaignFilePath(campaignState.id)}`);
      return;
    }
  }

  // Load last active campaign ID if saved
  try {
    const activeId = (await fs.readFile(ACTIVE_ID_FILE, 'utf-8')).trim();
    const targetFile = getCampaignFilePath(activeId);
    const raw = await fs.readFile(targetFile, 'utf-8');
    campaignState = normalizeCampaign(JSON.parse(raw) as CampaignState);
    console.log(`[SERVER] Campanha ativa carregada: ${campaignState.name}`);
    return;
  } catch {
    // Try each available campaign file in case the first one is corrupted
    for (const file of existingFiles) {
      try {
        const raw = await fs.readFile(path.join(CAMPAIGNS_DIR, file), 'utf-8');
        campaignState = normalizeCampaign(JSON.parse(raw) as CampaignState);
        await atomicWriteFile(ACTIVE_ID_FILE, campaignState.id);
        console.log(`[SERVER] Campanha carregada: ${campaignState.name}`);
        return;
      } catch {
        // skip corrupted campaign file and try next
      }
    }
    campaignState = normalizeCampaign(createStarterCampaign());
    await persistState();
    console.log(`[SERVER] Nenhuma campanha íntegra encontrada; campanha inicial criada.`);
  }
}

function persistState(): Promise<void> {
  campaignState.updatedAt = new Date().toISOString();
  const targetFile = getCampaignFilePath(campaignState.id);
  const snapshot = campaignState;
  // Self-healing queue: a prior failure must NEVER poison future saves!
  const job = saveQueue
    .catch(() => {})
    .then(async () => {
      await atomicWriteFile(targetFile, JSON.stringify(snapshot, null, 2));
      await atomicWriteFile(ACTIVE_ID_FILE, snapshot.id);
      try {
        const vaultSynced = await syncVaultLinkedCharactersToDisk(snapshot);
        if (vaultSynced && io.engine.clientsCount > 0) {
          const list = await listSavedCharacters();
          io.emit('characters:saved-updated', list);
        }
      } catch {
        // non-fatal vault sync error
      }
    });
  saveQueue = job.catch((err) => {
    console.error('[SERVER] Erro ao persistir campanha:', err);
  });
  return job;
}

let debouncedPersistTimer: NodeJS.Timeout | null = null;
function schedulePersistState(delayMs = 900): void {
  if (debouncedPersistTimer) clearTimeout(debouncedPersistTimer);
  debouncedPersistTimer = setTimeout(() => {
    debouncedPersistTimer = null;
    persistState().catch(() => {});
  }, delayMs);
}

async function flushPendingPersist(): Promise<void> {
  if (debouncedPersistTimer) {
    clearTimeout(debouncedPersistTimer);
    debouncedPersistTimer = null;
    await persistState();
  } else {
    await saveQueue.catch(() => {});
  }
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '80mb' }));
app.use(
  '/uploads',
  (_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  },
  express.static(UPLOADS_DIR)
);

const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 80 * 1024 * 1024, // 80MB — matches express.json limit so large campaigns never drop WebSocket!
  pingInterval: 15000, // Keep Cloudflare Quick Tunnels & NATs warm against idle drops
  pingTimeout: 45000, // Tolerate brief Wi-Fi/VPN/tunnel hiccups without disconnecting GM or players
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Health & Network Info
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    campaignId: campaignState.id,
    campaignName: campaignState.name,
    clients: io.engine.clientsCount,
    port: PORT,
    pid: process.pid,
    distDir: DIST_DIR,
    addresses: getLocalNetworkAddresses(),
  });
});

// Loopback-only graceful shutdown so Electron portable upgrades never stay stuck on a stale backend
app.post('/api/internal-shutdown', async (req, res) => {
  const remoteIp = String(req.socket.remoteAddress || '');
  const isLoopback =
    remoteIp === '127.0.0.1' || remoteIp === '::1' || remoteIp === '::ffff:127.0.0.1';
  if (!isLoopback || isExternalTunnelRequest(req)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  try {
    stopPublicTunnel();
    await flushPendingPersist();
  } catch {
    // ignore shutdown flush errors
  }
  res.json({ ok: true });
  setTimeout(() => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 600);
  }, 50);
});

app.get('/api/network-info', (_req, res) => {
  res.json({
    port: PORT,
    addresses: getLocalNetworkAddresses(),
    clients: io.engine.clientsCount,
  });
});

// =========================================================================
// Direct Public Internet Tunnel (Cloudflare Quick Tunnel — Zero Radmin/VPN)
// =========================================================================
type PublicTunnelStatus = 'idle' | 'starting' | 'active' | 'error';

interface PublicTunnelState {
  status: PublicTunnelStatus;
  url: string;
  error?: string;
}

let activeTunnel: Tunnel | null = null;
let publicTunnelState: PublicTunnelState = { status: 'idle', url: '' };
let tunnelStartPromise: Promise<PublicTunnelState> | null = null;

function broadcastTunnelStatus() {
  io.emit('tunnel:status', publicTunnelState);
}

function stopPublicTunnel() {
  if (activeTunnel) {
    try {
      activeTunnel.stop();
    } catch {
      // ignore
    }
    activeTunnel = null;
  }
  tunnelStartPromise = null;
  publicTunnelState = { status: 'idle', url: '' };
  broadcastTunnelStatus();
}

async function startPublicTunnel(): Promise<PublicTunnelState> {
  if (publicTunnelState.status === 'active' && publicTunnelState.url) {
    return publicTunnelState;
  }
  if (tunnelStartPromise) {
    return tunnelStartPromise;
  }

  tunnelStartPromise = (async () => {
    let localTunnelInstance: Tunnel | null = null;
    try {
      publicTunnelState = { status: 'starting', url: '' };
      broadcastTunnelStatus();

      if (!fsSync.existsSync(cloudflaredBin)) {
        fsSync.mkdirSync(path.dirname(cloudflaredBin), { recursive: true });
        await installCloudflared(cloudflaredBin);
      }

      const tunnelInstance = Tunnel.quick(`http://127.0.0.1:${PORT}`, {
        '--no-autoupdate': true,
      });
      localTunnelInstance = tunnelInstance;
      activeTunnel = tunnelInstance;

      const resolvedUrl = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error('Tempo limite ao gerar o link público. Verifique sua conexão com a internet.'));
        }, 25000);

        tunnelInstance.once('url', (url) => {
          clearTimeout(timer);
          resolve(url);
        });

        tunnelInstance.once('error', (err) => {
          clearTimeout(timer);
          reject(err);
        });

        tunnelInstance.once('exit', (code) => {
          if (activeTunnel === tunnelInstance) {
            activeTunnel = null;
            if (publicTunnelState.status === 'active') {
              publicTunnelState = { status: 'idle', url: '' };
              broadcastTunnelStatus();
            }
          }
          clearTimeout(timer);
          reject(new Error(`Túnel encerrado inesperadamente (código ${code ?? 'desconhecido'}).`));
        });
      });

      if (activeTunnel !== tunnelInstance) {
        // Tunnel was intentionally stopped while starting
        return publicTunnelState;
      }

      publicTunnelState = { status: 'active', url: resolvedUrl };
      broadcastTunnelStatus();
      console.log(`[TUNNEL] Link público direto ativo: ${resolvedUrl}`);
      return publicTunnelState;
    } catch (err) {
      // Only transition to 'error' if this tunnel instance was NOT intentionally stopped/replaced!
      if (localTunnelInstance && activeTunnel !== localTunnelInstance) {
        return publicTunnelState;
      }
      stopPublicTunnel();
      publicTunnelState = {
        status: 'error',
        url: '',
        error: err instanceof Error ? err.message : String(err),
      };
      broadcastTunnelStatus();
      return publicTunnelState;
    } finally {
      tunnelStartPromise = null;
    }
  })();

  return tunnelStartPromise;
}

app.get('/api/tunnel/status', (_req, res) => {
  res.json(publicTunnelState);
});

app.post('/api/tunnel/start', async (req, res) => {
  if (!isLoopbackRequest(req)) {
    res.status(403).json({ error: 'Apenas o anfitrião local pode iniciar o túnel público.' });
    return;
  }
  const next = await startPublicTunnel();
  res.status(next.status === 'error' ? 500 : 200).json(next);
});

app.post('/api/tunnel/stop', (req, res) => {
  if (!isLoopbackRequest(req)) {
    res.status(403).json({ error: 'Apenas o anfitrião local pode encerrar o túnel público.' });
    return;
  }
  stopPublicTunnel();
  res.json(publicTunnelState);
});

const shutdownGracefullyOnSignal = () => {
  stopPublicTunnel();
  flushPendingPersist()
    .catch(() => {})
    .finally(() => process.exit(0));
};
process.on('SIGINT', shutdownGracefullyOnSignal);
process.on('SIGTERM', shutdownGracefullyOnSignal);
process.on('exit', () => {
  if (activeTunnel) {
    try {
      activeTunnel.stop();
    } catch {
      // ignore
    }
  }
});

app.get('/api/room-beacon', (_req, res) => {
  res.json({
    ok: true,
    campaignId: campaignState.id,
    campaignName: campaignState.name,
    gmName: campaignState.gmName || 'Mestre',
    coverUrl: campaignState.coverUrl || '',
    characterCount: campaignState.characters.length,
    port: PORT,
  });
});

// UDP Room Discovery Responder + Scanner
function startUdpBeaconResponder() {
  try {
    const udp = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    udp.on('message', (msg, rinfo) => {
      if (msg.toString().trim() === 'RPG_DISCOVER') {
        const reply = Buffer.from(
          JSON.stringify({
            type: 'RPG_OFFER',
            campaignId: campaignState.id,
            campaignName: campaignState.name,
            gmName: campaignState.gmName || 'Mestre',
            coverUrl: campaignState.coverUrl || '',
            characterCount: campaignState.characters.length,
            port: PORT,
          })
        );
        udp.send(reply, 0, reply.length, rinfo.port, rinfo.address);
      }
    });
    udp.on('error', (err) => {
      console.warn('[UDP Beacon] Aviso:', err.message);
    });
    udp.bind(DISCOVERY_UDP_PORT, () => {
      console.log(`[UDP] Beacon de sala ativo na porta ${DISCOVERY_UDP_PORT}`);
    });
  } catch {
    // non-fatal if port already bound
  }
}

app.get('/api/discover-rooms', async (req, res) => {
  // When a player opens the online link (Cloudflare Tunnel), show ONLY the single hosted campaign
  if (isExternalTunnelRequest(req)) {
    res.json({
      rooms: [
        {
          campaignId: campaignState.id,
          url: '',
          roomCode: 'MESA-ONLINE',
          campaignName: campaignState.name,
          gmName: campaignState.gmName || 'Mestre',
          coverUrl: campaignState.coverUrl || '',
          characterCount: campaignState.characters.length,
          isLocal: true,
        },
      ],
    });
    return;
  }

  // Deduplicate by campaignId so multiple network adapters (Loopback, Wi-Fi, Radmin) never create 3 duplicate cards
  const discoveredByCampaign = new Map<
    string,
    {
      campaignId: string;
      url: string;
      roomCode: string;
      campaignName: string;
      gmName: string;
      coverUrl: string;
      characterCount: number;
      isLocal: boolean;
    }
  >();

  // Always include local loopback room for this host's active campaign
  discoveredByCampaign.set(campaignState.id, {
    campaignId: campaignState.id,
    url: `http://127.0.0.1:${PORT}`,
    roomCode: encodeRoomCode('127.0.0.1', PORT),
    campaignName: campaignState.name,
    gmName: campaignState.gmName || 'Mestre',
    coverUrl: campaignState.coverUrl || '',
    characterCount: campaignState.characters.length,
    isLocal: true,
  });

  await new Promise<void>((resolve) => {
    const client = dgram.createSocket('udp4');
    const localIps = new Set(getLocalNetworkAddresses().map((a) => a.address));

    client.on('message', (msg, rinfo) => {
      try {
        const data = JSON.parse(msg.toString());
        if (data.type === 'RPG_OFFER') {
          const cid = String(data.campaignId || `${rinfo.address}:${data.port || PORT}`);
          const isLocalHost =
            cid === campaignState.id ||
            localIps.has(rinfo.address) ||
            rinfo.address === '127.0.0.1';
          if (discoveredByCampaign.has(cid)) return;
          const url = `http://${rinfo.address}:${data.port || PORT}`;
          discoveredByCampaign.set(cid, {
            campaignId: cid,
            url,
            roomCode: encodeRoomCode(rinfo.address, data.port || PORT),
            campaignName: data.campaignName,
            gmName: data.gmName || 'Mestre',
            coverUrl: data.coverUrl || '',
            characterCount: data.characterCount || 0,
            isLocal: isLocalHost,
          });
        }
      } catch {
        // ignore invalid packet
      }
    });

    client.on('error', () => resolve());

    client.bind(0, () => {
      try {
        client.setBroadcast(true);
        const probe = Buffer.from('RPG_DISCOVER');
        client.send(probe, 0, probe.length, DISCOVERY_UDP_PORT, '255.255.255.255');
        for (const net of getLocalNetworkAddresses()) {
          const parts = net.address.split('.');
          if (parts.length === 4) {
            const subBroadcast = `${parts[0]}.${parts[1]}.${parts[2]}.255`;
            client.send(probe, 0, probe.length, DISCOVERY_UDP_PORT, subBroadcast);
          }
        }
      } catch {
        // ignore send errors
      }
      setTimeout(() => {
        try {
          client.close();
        } catch {
          // ignore
        }
        resolve();
      }, 700);
    });
  });

  res.json({ rooms: Array.from(discoveredByCampaign.values()) });
});

// Multi-Campaign Management
app.get('/api/campaigns', async (req, res) => {
  try {
    if (isExternalTunnelRequest(req)) {
      res.json({
        activeId: campaignState.id,
        campaigns: [
          {
            id: campaignState.id,
            name: campaignState.name,
            description: campaignState.description || '',
            coverUrl: campaignState.coverUrl || '',
            gmName: campaignState.gmName || 'Mestre',
            updatedAt: campaignState.updatedAt || new Date().toISOString(),
            characterCount: campaignState.characters.length,
          },
        ],
      });
      return;
    }
    const list = await listSavedCampaigns();
    res.json({ activeId: campaignState.id, campaigns: list });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post('/api/campaigns/create', async (req, res) => {
  if (!isLoopbackRequest(req)) {
    res.status(403).json({ error: 'Apenas o anfitrião local pode criar novas campanhas.' });
    return;
  }
  try {
    await flushPendingPersist();
    const { name, description, coverUrl, gmName, attributePointBudget, maxTrainedSkills } =
      req.body as {
        name: string;
        description: string;
        coverUrl?: string;
        gmName?: string;
        attributePointBudget?: number;
        maxTrainedSkills?: number;
      };
    const next = normalizeCampaign(
      createBlankCampaign({
        name: name || 'Nova Campanha',
        description: description || '',
        coverUrl: coverUrl || '',
        gmName: gmName || 'Mestre',
        attributePointBudget,
        maxTrainedSkills,
      })
    );
    const prevState = campaignState;
    campaignState = next;
    try {
      await persistState();
    } catch (persistErr) {
      campaignState = prevState;
      throw persistErr;
    }
    broadcastEphemeralReset();
    broadcastCampaignUpdated();
    res.json(campaignState);
  } catch (err) {
    console.error('[SERVER] Erro ao criar campanha:', err);
    res.status(500).json({ error: String(err) });
  }
});

app.post('/api/campaigns/load/:id', async (req, res) => {
  if (!isLoopbackRequest(req)) {
    res.status(403).json({ error: 'Apenas o anfitrião local pode trocar de campanha.' });
    return;
  }
  await flushPendingPersist().catch(() => {});
  let parsedCampaign: CampaignState;
  try {
    const file = getCampaignFilePath(req.params.id);
    const raw = await fs.readFile(file, 'utf-8');
    parsedCampaign = normalizeCampaign(JSON.parse(raw) as CampaignState);
  } catch (readErr) {
    console.error('[SERVER] Falha ao ler campanha:', req.params.id, readErr);
    res.status(404).json({ error: 'Campanha não encontrada ou arquivo corrompido.' });
    return;
  }

  const prevState = campaignState;
  try {
    campaignState = parsedCampaign;
    await persistState();
    broadcastEphemeralReset();
    broadcastCampaignUpdated();
    res.json(campaignState);
  } catch (persistErr) {
    campaignState = prevState;
    console.error('[SERVER] Erro ao salvar campanha ativa ao carregar:', persistErr);
    res.status(500).json({ error: `Erro ao ativar campanha: ${String(persistErr)}` });
  }
});

app.delete('/api/campaigns/:id', async (req, res) => {
  if (!isLoopbackRequest(req)) {
    res.status(403).json({ error: 'Apenas o anfitrião local pode excluir campanhas salvas.' });
    return;
  }
  try {
    await flushPendingPersist();
    const targetId = req.params.id;
    const file = getCampaignFilePath(targetId);
    await fs.unlink(file);
    if (campaignState.id === targetId) {
      const remaining = await listSavedCampaigns();
      let loadedNext = false;
      for (const rem of remaining) {
        try {
          const raw = await fs.readFile(getCampaignFilePath(rem.id), 'utf-8');
          campaignState = normalizeCampaign(JSON.parse(raw) as CampaignState);
          loadedNext = true;
          break;
        } catch {
          // try next remaining campaign
        }
      }
      if (!loadedNext) {
        campaignState = normalizeCampaign(createStarterCampaign());
      }
      broadcastEphemeralReset();
      await persistState();
      broadcastCampaignUpdated();
    }
    res.json({ ok: true, activeId: campaignState.id });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Binary File Upload (Fast zero-base64 streaming upload for large MP3/OGG/WAV & HD Maps up to 120MB)
app.post(
  '/api/upload-raw',
  express.raw({ type: '*/*', limit: '120mb' }),
  async (req, res) => {
    try {
      const rawHeader = String(req.headers['x-filename'] || 'arquivo.bin');
      let filename = 'arquivo.bin';
      try {
        filename = decodeURIComponent(rawHeader);
      } catch {
        filename = rawHeader;
      }
      const ext = sanitizeUploadExt(filename);
      if (!ext) {
        res.status(400).json({ error: 'Tipo de arquivo não permitido. Use PNG, JPG, WEBP, GIF, MP3, OGG, WAV ou M4A.' });
        return;
      }
      const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
      if (!buffer.length) {
        res.status(400).json({ error: 'Arquivo vazio.' });
        return;
      }
      const baseName = path
        .basename(filename, path.extname(filename))
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .slice(0, 40) || 'arquivo';
      const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${baseName}${ext}`;
      await fs.mkdir(UPLOADS_DIR, { recursive: true });
      await fs.writeFile(path.join(UPLOADS_DIR, uniqueName), buffer);
      res.json({ url: `/uploads/${uniqueName}`, filename: uniqueName });
    } catch (err) {
      console.error('[SERVER] Erro em /api/upload-raw:', err);
      res.status(500).json({ error: String(err) });
    }
  }
);

// File Upload (Images & Music from PC — JSON base64 fallback)
app.post('/api/upload', async (req, res) => {
  try {
    const { filename, dataUrl } = req.body as { filename: string; dataUrl: string };
    if (!filename || !dataUrl || !dataUrl.includes(',')) {
      res.status(400).json({ error: 'Arquivo inválido.' });
      return;
    }
    const ext = sanitizeUploadExt(filename);
    if (!ext) {
      res.status(400).json({ error: 'Tipo de arquivo não permitido. Use PNG, JPG, WEBP, GIF, MP3, OGG, WAV ou M4A.' });
      return;
    }
    const base64Data = dataUrl.split(',')[1];
    const buffer = Buffer.from(base64Data, 'base64');
    const baseName = path
      .basename(filename, path.extname(filename))
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 40) || 'arquivo';
    const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${baseName}${ext}`;
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
    await fs.writeFile(path.join(UPLOADS_DIR, uniqueName), buffer);
    res.json({ url: `/uploads/${uniqueName}`, filename: uniqueName });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Active Campaign Endpoints
app.get('/api/campaign', (req, res) => {
  if (isLoopbackRequest(req) && req.query.role !== 'player') {
    res.json(campaignState);
    return;
  }
  const playerId = typeof req.query.playerId === 'string' ? req.query.playerId : undefined;
  res.json(sanitizeCampaignForPlayer(campaignState, playerId ? { playerId } : undefined));
});

app.get('/api/room-status', (_req, res) => {
  const hasGm =
    gmHostSocketIds.size > 0 ||
    Array.from(connectedPlayers.values()).some((p) => p.role === 'gm');
  res.json({ open: gmRoomOpen, hasGm });
});

app.post('/api/campaign/update', async (req, res) => {
  try {
    if (isExternalTunnelRequest(req)) {
      res.status(403).json({ error: 'Atualização direta via HTTP bloqueada para clientes externos.' });
      return;
    }
    const next = req.body as CampaignState;
    if (!next || !next.compendium || !next.maps) {
      res.status(400).json({ error: 'Dados de campanha inválidos.' });
      return;
    }
    if (next.id && next.id !== campaignState.id) {
      res.status(409).json({ error: 'ID de campanha divergente da campanha ativa.' });
      return;
    }
    const baseIncoming = isLoopbackRequest(req)
      ? next
      : preserveGmSecretsOnPlayerPatch(next, campaignState);
    campaignState = normalizeCampaign(baseIncoming);
    await persistState();
    broadcastCampaignUpdated();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post('/api/campaign/reset', async (req, res) => {
  if (!isLoopbackRequest(req)) {
    res.status(403).json({ error: 'Apenas o anfitrião local pode restaurar a campanha inicial.' });
    return;
  }
  try {
    await flushPendingPersist();
    campaignState = normalizeCampaign(createStarterCampaign());
    broadcastEphemeralReset();
    await persistState();
    broadcastCampaignUpdated();
    res.json(campaignState);
  } catch (err) {
    console.error('[SERVER] Erro ao resetar campanha:', err);
    res.status(500).json({ error: String(err) });
  }
});

app.post('/api/campaign/import', async (req, res) => {
  if (!isLoopbackRequest(req)) {
    res.status(403).json({ error: 'Apenas o anfitrião local pode importar campanhas JSON.' });
    return;
  }
  try {
    await flushPendingPersist();
    const imported = req.body as CampaignState;
    if (!imported || !imported.compendium || !Array.isArray(imported.characters)) {
      res.status(400).json({ error: 'Arquivo JSON de campanha inválido.' });
      return;
    }
    const safeId =
      typeof imported.id === 'string' && imported.id.trim()
        ? imported.id.trim()
        : `camp-${Date.now()}`;
    campaignState = normalizeCampaign({ ...imported, id: safeId });
    broadcastEphemeralReset();
    await persistState();
    broadcastCampaignUpdated();
    res.json(campaignState);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Character Vault (Persistent Desktop + Online Sync)
app.get('/api/characters/saved', async (_req, res) => {
  try {
    const list = await listSavedCharacters();
    res.json({ characters: list });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post('/api/characters/save', async (req, res) => {
  try {
    const { character, originCampaignId, originCampaignName } = req.body as {
      character: Character;
      originCampaignId?: string;
      originCampaignName?: string;
    };
    if (!character || !character.name) {
      res.status(400).json({ error: 'Dados de personagem inválidos.' });
      return;
    }
    const entry = await upsertSavedCharacter(
      character,
      {
        originCampaignId,
        originCampaignName,
      },
      campaignState
    );
    const list = await listSavedCharacters();
    io.emit('characters:saved-updated', list);
    res.json({ ok: true, entry, characters: list });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.delete('/api/characters/saved/:id', async (req, res) => {
  if (!isLoopbackRequest(req)) {
    res.status(403).json({ error: 'Apenas o anfitrião local pode excluir heróis do Cofre.' });
    return;
  }
  try {
    const safeVaultId = String(req.params.id || '').replace(/[^a-zA-Z0-9_-]/g, '_');
    if (safeVaultId) {
      deletedVaultHeroIds.add(safeVaultId);
      lastSyncedVaultHash.delete(safeVaultId);
    }
    const targetFile = getSavedHeroFilePath(req.params.id);
    try {
      await fs.unlink(targetFile);
    } catch {
      // ignore if already deleted
    }
    const list = await listSavedCharacters();
    io.emit('characters:saved-updated', list);
    res.json({ ok: true, characters: list });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Serve production static files for Desktop Mode and direct IP connections
if (fsSync.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.use((req, res, next) => {
    if (
      req.method !== 'GET' ||
      req.path.startsWith('/api') ||
      req.path.startsWith('/socket.io') ||
      req.path.startsWith('/uploads')
    ) {
      next();
      return;
    }
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

io.on('connection', (socket) => {
  // Initial handshake sends sanitized view until GM identifies via presence:identify / room:gm-open
  const remoteAddr = String(socket.handshake.address || '');
  const isLocalSocket =
    !socket.handshake.headers['cf-connecting-ip'] &&
    (remoteAddr === '127.0.0.1' || remoteAddr === '::1' || remoteAddr === '::ffff:127.0.0.1');
  socket.emit(
    'campaign:updated',
    isLocalSocket ? campaignState : sanitizeCampaignForSocket(campaignState, socket.id)
  );
  listSavedCharacters()
    .then((list) => socket.emit('characters:saved-updated', list))
    .catch(() => {});
  // Always emit ephemeral states unconditionally so reconnecting clients clear stale overlays!
  socket.emit('check:updated', sanitizeSkillCheckForSocket(activeSkillCheck, socket.id));
  socket.emit('save-prompt:updated', activeSavePrompt);
  socket.emit('spotlight:updated', activeRpSpotlight);
  socket.emit('request:list', pendingRequests);
  socket.emit('pointer:bulk', Array.from(activePointers.values()));
  socket.emit('tunnel:status', publicTunnelState);
  socket.emit('presence:list', Array.from(connectedPlayers.values()));
  io.emit('presence:count', io.engine.clientsCount);

  socket.on(
    'presence:identify',
    (info: Omit<ConnectedPlayerInfo, 'socketId'> & { inLobby?: boolean }) => {
      if (!info || !info.playerId) return;
      const isGmRole = info.role === 'gm' && (isLocalSocket || gmHostSocketIds.has(socket.id));
      connectedPlayers.set(socket.id, {
        socketId: socket.id,
        playerId: info.playerId,
        playerName: info.playerName || 'Aventureiro',
        playerColor: info.playerColor || '#f59e0b',
        role: isGmRole ? 'gm' : 'player',
        characterId: info.characterId,
        characterName: info.characterName,
      });
      if (isGmRole && !info.inLobby) {
        gmHostSocketIds.add(socket.id);
        if (gmDisconnectTimer) {
          clearTimeout(gmDisconnectTimer);
          gmDisconnectTimer = null;
        }
        gmRoomOpen = true;
      }
      // Send role-accurate state snapshot immediately after identification (so GM sees secrets & players see their whispers/spotted markers!)
      socket.emit('campaign:updated', sanitizeCampaignForSocket(campaignState, socket.id));
      socket.emit('check:updated', sanitizeSkillCheckForSocket(activeSkillCheck, socket.id));
      io.emit('presence:list', Array.from(connectedPlayers.values()));
    }
  );

  socket.on('room:gm-open', () => {
    if (!isLocalSocket && !gmHostSocketIds.has(socket.id)) return;
    gmHostSocketIds.add(socket.id);
    if (gmDisconnectTimer) {
      clearTimeout(gmDisconnectTimer);
      gmDisconnectTimer = null;
    }
    gmRoomOpen = true;
    socket.emit('campaign:updated', campaignState);
  });

  socket.on('room:gm-leave', () => {
    if (!gmHostSocketIds.has(socket.id) && !isLocalSocket) return;
    gmHostSocketIds.delete(socket.id);
    if (gmDisconnectTimer) {
      clearTimeout(gmDisconnectTimer);
      gmDisconnectTimer = null;
    }
    gmRoomOpen = false;
    io.emit('room:closed', {
      reason: 'O Mestre saiu da mesa — a sala foi encerrada automaticamente.',
    });
  });

  socket.on('campaign:patch', async (nextState: CampaignState) => {
    try {
      if (!nextState || !nextState.compendium) return;
      // Never allow a stale patch from a previous campaign to overwrite or pollute the newly loaded campaign!
      if (nextState.id && nextState.id !== campaignState.id) return;

      const prevRolls = campaignState.rollLog || [];
      const prevCombatLog = campaignState.combatLog || [];
      const prevChatLog = campaignState.chatLog || [];
      const incomingSafe = isSocketGm(socket.id)
        ? nextState
        : preserveGmSecretsOnPlayerPatch(nextState, campaignState);
      const normalized = normalizeCampaign(incomingSafe);

      // Protect recent authoritative server events (Death Save, Damage/Heal, Live Token Move)
      // from being reverted by concurrent or same-client stale campaign:patch snapshots!
      const nowMs = Date.now();
      let protectedChars = normalized.characters;
      let protectedMaps = normalized.maps;
      let protectedCombatants = normalized.combat.combatants;
      let protectedBoss = normalized.activeBoss;
      let restoredAnyAuthoritative = false;

      // 1. Protect recent authoritative Death Save updates (including map tokens!)
      for (const [charId, info] of recentDeathSaveAuthority.entries()) {
        if (nowMs - info.at > 1800) {
          recentDeathSaveAuthority.delete(charId);
          continue;
        }
        if (info.socketId === socket.id) continue;
        const authChar = campaignState.characters.find((c) => c.id === charId);
        if (!authChar) continue;
        restoredAnyAuthoritative = true;
        protectedChars = protectedChars.map((c) =>
          c.id === charId
            ? {
                ...c,
                hp: authChar.hp,
                deathSaves: authChar.deathSaves,
                activeConditionIds: authChar.activeConditionIds,
              }
            : c
        );
        protectedMaps = protectedMaps.map((m) => ({
          ...m,
          tokens: m.tokens.map((t) =>
            t.type === 'character' && t.referenceId === charId
              ? { ...t, hp: authChar.hp, activeConditionIds: authChar.activeConditionIds }
              : t
          ),
        }));
        const authCb = campaignState.combat.combatants.find(
          (cb) => cb.type === 'character' && cb.referenceId === charId
        );
        if (authCb) {
          protectedCombatants = protectedCombatants.map((cb) =>
            cb.type === 'character' && cb.referenceId === charId
              ? {
                  ...cb,
                  hp: authCb.hp,
                  actionAvailable: authCb.actionAvailable,
                  actionsRemaining: authCb.actionsRemaining,
                  revivedLostActionPending: authCb.revivedLostActionPending,
                  deathSaveRolledThisTurn: authCb.deathSaveRolledThisTurn,
                }
              : cb
          );
        }
      }

      // 2. Protect recent authoritative combat:apply-damage updates (even from SAME socket within 700ms so AoE/save follow-up patches never wipe damage!)
      for (const [key, info] of recentDamageAuthority.entries()) {
        if (nowMs - info.at > 1400) {
          recentDamageAuthority.delete(key);
          continue;
        }
        const authTok = campaignState.maps.flatMap((m) => m.tokens).find((t) => t.id === info.tokenId);
        const authChar = info.charId
          ? campaignState.characters.find((c) => c.id === info.charId)
          : undefined;
        const authCb = campaignState.combat.combatants.find(
          (cb) =>
            cb.tokenId === info.tokenId ||
            Boolean(info.charId && cb.type === 'character' && cb.referenceId === info.charId)
        );
        if (authTok) {
          restoredAnyAuthoritative = true;
          protectedMaps = protectedMaps.map((m) => ({
            ...m,
            tokens: m.tokens.map((t) =>
              t.id === info.tokenId
                ? {
                    ...t,
                    hp: authTok.hp,
                    activeConditionIds: authTok.activeConditionIds,
                    bossPhase: authTok.bossPhase,
                    triggeredBossPhaseIds: authTok.triggeredBossPhaseIds,
                    legendaryActionsRemaining: authTok.legendaryActionsRemaining,
                  }
                : t
            ),
          }));
        }
        if (authChar) {
          restoredAnyAuthoritative = true;
          protectedChars = protectedChars.map((c) =>
            c.id === authChar.id
              ? {
                  ...c,
                  hp: authChar.hp,
                  tempHp: authChar.tempHp,
                  deathSaves: authChar.deathSaves,
                  activeConditionIds: authChar.activeConditionIds,
                }
              : c
          );
        }
        if (authCb) {
          restoredAnyAuthoritative = true;
          protectedCombatants = protectedCombatants.map((cb) =>
            cb.id === authCb.id
              ? {
                  ...cb,
                  hp: authCb.hp,
                  effects: authCb.effects,
                  revivedLostActionPending: authCb.revivedLostActionPending,
                  actionAvailable: authCb.actionAvailable,
                  actionsRemaining: authCb.actionsRemaining,
                }
              : cb
          );
        }
        if (campaignState.activeBoss && campaignState.activeBoss.id === info.tokenId) {
          protectedBoss = campaignState.activeBoss;
        }
      }

      // 3. Protect recent live token:move coordinates from other clients' concurrent patches
      for (const [tokId, mv] of recentMoveAuthority.entries()) {
        if (nowMs - mv.at > 1500) {
          recentMoveAuthority.delete(tokId);
          continue;
        }
        if (mv.socketId === socket.id) continue;
        restoredAnyAuthoritative = true;
        protectedMaps = protectedMaps.map((m) =>
          m.id !== mv.mapId
            ? m
            : {
                ...m,
                tokens: m.tokens.map((t) => (t.id === tokId ? { ...t, x: mv.x, y: mv.y } : t)),
              }
        );
      }

      const finalNormalized: CampaignState = restoredAnyAuthoritative
        ? syncCampaignDerivedCharacterStats({
            ...normalized,
            characters: protectedChars,
            maps: protectedMaps,
            activeBoss: protectedBoss,
            combat: { ...normalized.combat, combatants: protectedCombatants },
          })
        : normalized;

      // Preserve rolls sent via roll:send (unless GM explicitly cleared rollLog to [])
      // Put finalNormalized.rollLog FIRST so newest client rolls and updated flags (applied: true) win!
      let mergedRollLog = finalNormalized.rollLog;
      if (finalNormalized.rollLog.length > 0 && prevRolls.length > 0) {
        const seen = new Set<string>();
        const combined: RollLogEntry[] = [];
        for (const r of [...finalNormalized.rollLog, ...prevRolls]) {
          if (!r?.id || seen.has(r.id)) continue;
          seen.add(r.id);
          combined.push(r);
        }
        mergedRollLog = combined.slice(0, 120);
      } else if (!isSocketGm(socket.id) && prevRolls.length > 0) {
        mergedRollLog = prevRolls;
      }

      // Preserve combatLog entries from server actions (unless GM explicitly cleared combatLog to [])
      let mergedCombatLog = finalNormalized.combatLog || [];
      if (mergedCombatLog.length > 0 && prevCombatLog.length > 0) {
        const seenC = new Set<string>();
        const combinedC: CombatLogEntry[] = [];
        for (const c of [...prevCombatLog, ...mergedCombatLog]) {
          if (!c?.id || seenC.has(c.id)) continue;
          seenC.add(c.id);
          combinedC.push(c);
        }
        mergedCombatLog = combinedC.slice(-120);
      } else if (!isSocketGm(socket.id) && prevCombatLog.length > 0) {
        mergedCombatLog = prevCombatLog;
      }

      // Preserve chatLog entries appended by chat:send (which broadcasts chat:new, not campaign:updated)
      let mergedChatLog = finalNormalized.chatLog || [];
      if (prevChatLog.length > 0) {
        const seenChat = new Set<string>();
        const combinedChat: ChatMessageEntry[] = [];
        for (const msg of [...prevChatLog, ...mergedChatLog]) {
          if (!msg?.id || seenChat.has(msg.id)) continue;
          seenChat.add(msg.id);
          combinedChat.push(msg);
        }
        mergedChatLog = combinedChat.slice(-150);
      }

      campaignState = {
        ...finalNormalized,
        rollLog: mergedRollLog,
        combatLog: mergedCombatLog,
        chatLog: mergedChatLog,
      };
      // Broadcast immediately so disk I/O never adds network latency across clients
      if (restoredAnyAuthoritative) {
        broadcastCampaignUpdated();
      } else {
        broadcastCampaignUpdated(socket.id);
      }
      persistState().catch((err) => {
        console.error('[SERVER] Erro ao salvar em campaign:patch:', err);
      });
    } catch (err) {
      console.error('[SERVER] Erro em campaign:patch:', err);
    }
  });

  // Lightweight live token coordinate delta (~80 bytes) so multiple users can drag tokens simultaneously with zero lag
  socket.on(
    'token:move',
    (payload: { mapId: string; moves: Array<{ id: string; x: number; y: number }> }) => {
      try {
        if (!payload?.mapId || !Array.isArray(payload.moves) || payload.moves.length === 0) return;
        const targetMap = campaignState.maps.find((m) => m.id === payload.mapId);
        if (!targetMap) return;

        const moveById = new Map<string, { x: number; y: number }>();
        for (const mv of payload.moves) {
          if (!mv?.id || typeof mv.x !== 'number' || typeof mv.y !== 'number') continue;
          if (!Number.isFinite(mv.x) || !Number.isFinite(mv.y)) continue;
          moveById.set(mv.id, { x: mv.x, y: mv.y });
        }
        if (moveById.size === 0) return;

        const sanitizedMoves: Array<{ id: string; x: number; y: number }> = [];
        let changed = false;
        const nextMaps = campaignState.maps.map((m) => {
          if (m.id !== payload.mapId) return m;
          const nextTokens = m.tokens.map((t) => {
            const mv = moveById.get(t.id);
            if (!mv) return t;
            const sz = Math.max(1, t.size || 1);
            const nx = Math.max(0, Math.min(Math.max(0, m.gridWidth - sz), Math.round(mv.x)));
            const ny = Math.max(0, Math.min(Math.max(0, m.gridHeight - sz), Math.round(mv.y)));
            sanitizedMoves.push({ id: t.id, x: nx, y: ny });
            if (t.x === nx && t.y === ny) return t;
            changed = true;
            return { ...t, x: nx, y: ny };
          });
          return changed ? { ...m, tokens: nextTokens } : m;
        });

        if (changed) {
          campaignState = { ...campaignState, maps: nextMaps };
          const nowMv = Date.now();
          sanitizedMoves.forEach((mv) => {
            recentMoveAuthority.set(mv.id, {
              mapId: payload.mapId,
              x: mv.x,
              y: mv.y,
              socketId: socket.id,
              at: nowMv,
            });
          });
          schedulePersistState(900);
        }
        if (sanitizedMoves.length > 0) {
          socket.broadcast.emit('token:moved', { mapId: payload.mapId, moves: sanitizedMoves });
        }
      } catch (err) {
        console.error('[SERVER] Erro em token:move:', err);
      }
    }
  );

  socket.on('roll:send', (entry: RollLogEntry) => {
    try {
      if (!entry || !entry.id) return;
      campaignState = {
        ...campaignState,
        rollLog: [entry, ...campaignState.rollLog].slice(0, 120),
      };
      // Secret rolls are NEVER leaked to non-GM player sockets!
      if (entry.isSecret) {
        for (const [sid, s] of io.sockets.sockets) {
          if (sid === socket.id || isSocketGm(sid)) {
            s.emit('roll:new', entry);
          }
        }
      } else {
        io.emit('roll:new', entry);
      }
      schedulePersistState(450);
    } catch (err) {
      console.error('[SERVER] Erro em roll:send:', err);
    }
  });

  socket.on(
    'combat:apply-damage',
    async (payload: {
      targetTokenId: string;
      amount: number;
      isHeal?: boolean;
      rollId?: string;
      damageType?: string;
      applyConditionId?: string;
      conditionDurationRounds?: number;
      isCrit?: boolean;
      killerName?: string;
      killerColor?: string;
      killerPortraitUrl?: string;
      suppressExecution?: boolean;
      skipRevivePenalty?: boolean;
    }) => {
      try {
      if (!payload || !payload.targetTokenId || typeof payload.amount !== 'number' || !Number.isFinite(payload.amount)) {
        return;
      }
      const {
        targetTokenId,
        amount,
        isHeal,
        rollId,
        damageType,
        applyConditionId,
        conditionDurationRounds,
        isCrit,
        killerName,
        killerColor,
        killerPortraitUrl,
        suppressExecution,
        skipRevivePenalty,
      } = payload;

      // Locate target token/character/monster/NPC to resolve Damage Resistances / Immunities / Vulnerabilities
      let foundToken = campaignState.maps
        .flatMap((m) => m.tokens)
        .find((t) => t.id === targetTokenId);
      let matchedRefId: string | undefined = foundToken?.referenceId;
      let targetName = foundToken?.name || 'Alvo';

      const targetChar = campaignState.characters.find(
        (c) => c.id === matchedRefId || c.id === targetTokenId
      );
      const targetMonster =
        foundToken?.type === 'monster' && matchedRefId
          ? campaignState.compendium.monsters.find((mon) => mon.id === matchedRefId)
          : undefined;
      const targetNpc =
        foundToken?.type === 'npc' && matchedRefId
          ? campaignState.npcs.find((n) => n.id === matchedRefId)
          : undefined;

      // D&D 5e: ordinary healing cannot revive a permanently dead hero (prevents token/character HP split-brain!)
      const isTargetPermanentlyDead = Boolean(
        targetChar && (targetChar.deathSaves?.dead || (targetChar.deathSaves?.failures ?? 0) >= 3)
      );
      if (isHeal && isTargetPermanentlyDead) {
        io.emit('floating:vfx', {
          tokenId: targetTokenId,
          amount: 0,
          isHeal: false,
          note: 'Morto (requer ressurreição)',
        });
        return;
      }

      let effectiveAmount = Math.abs(amount);
      let affinityNote: string | undefined;

      if (!isHeal && damageType) {
        const res = resolveDamageWithAffinities(effectiveAmount, damageType, {
          immunities:
            targetChar?.damageImmunities ||
            targetMonster?.damageImmunities ||
            targetNpc?.damageImmunities,
          resistances:
            targetChar?.damageResistances ||
            targetMonster?.damageResistances ||
            targetNpc?.damageResistances,
          vulnerabilities:
            targetChar?.damageVulnerabilities ||
            targetMonster?.damageVulnerabilities ||
            targetNpc?.damageVulnerabilities,
          activeConditionIds: [
            ...(foundToken?.activeConditionIds || []),
            ...(targetChar?.activeConditionIds || []),
          ],
          compendiumConditions: campaignState.compendium.conditions,
        });
        effectiveAmount = res.finalAmount;
        affinityNote = res.modifierLabel;
      }

      // D&D 5e Temporary HP absorption before real HP takes damage
      let tempHpAbsorbed = 0;
      let hpDamageAfterTemp = effectiveAmount;
      if (!isHeal && effectiveAmount > 0 && targetChar && (targetChar.tempHp || 0) > 0) {
        tempHpAbsorbed = Math.min(targetChar.tempHp || 0, effectiveAmount);
        hpDamageAfterTemp = effectiveAmount - tempHpAbsorbed;
        if (tempHpAbsorbed > 0) {
          affinityNote = affinityNote
            ? `${affinityNote} • -${tempHpAbsorbed} PV Temp`
            : `Absorvido ${tempHpAbsorbed} PV Temp`;
        }
      }

      const delta = isHeal ? effectiveAmount : -hpDamageAfterTemp;
      let triggeredBossPhaseLog: { name: string; phase: number; title?: string; color?: string } | null = null;
      let triggeredExecutionEvt: ExecutionCinematicEvent | null = null;

      const resolveScarKind = (dmgType?: string, crit?: boolean): BattleScarKind => {
        if (crit) return 'black-flash';
        const dt = (dmgType || '').toLowerCase();
        if (/fogo|chama|radiant|solar|calor/.test(dt)) return 'scorch';
        if (/frio|gelo|gélid/.test(dt)) return 'frost-shatter';
        if (/ácid|acid|venen|necrót|necrot|tóxic/.test(dt)) return 'acid-pool';
        if (/concuss|impact|trov|força|forca|elétric|eletric/.test(dt)) return 'crater';
        return 'blood-slash';
      };

      const updatedMaps = campaignState.maps.map((m) => {
        const autoLootMarkers: typeof m.gmMarkers = [];
        const newBattleScars: BattleScar[] = [];
        const nextTokens = m.tokens.map((t) => {
          const isMatchedCharTok = Boolean(
            targetChar && t.type === 'character' && t.referenceId === targetChar.id
          );
          if (t.id !== targetTokenId && !isMatchedCharTok) return t;
          matchedRefId = t.referenceId;
          targetName = t.name;
          const nextHp = Math.max(0, Math.min(t.maxHp, t.hp + delta));
          let nextPhase = t.bossPhase || 1;
          let nextPhaseTitle = t.bossPhase2Title;
          let nextTriggeredIds = t.triggeredBossPhaseIds ? [...t.triggeredBossPhaseIds] : [];
          let restoreLegActions = false;

          if (t.isBoss && t.maxHp > 0 && nextHp > 0) {
            const hpPct = (nextHp / t.maxHp) * 100;
            if (t.bossPhases && t.bossPhases.length > 0) {
              // Unlimited optional boss phases sorted from highest threshold to lowest
              const sorted = [...t.bossPhases].sort((a, b) => b.hpThresholdPct - a.hpThresholdPct);
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
          if (nextPhase !== (t.bossPhase || 1)) {
            triggeredBossPhaseLog = {
              name: t.name,
              phase: nextPhase,
              title: nextPhaseTitle,
              color: t.color,
            };
          }

          const killedNow = !isHeal && t.hp > 0 && nextHp <= 0;
          if (!isHeal && !suppressExecution && !t.isHidden && effectiveAmount > 0 && (isCrit || killedNow)) {
            newBattleScars.push({
              id: `scar-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              x: t.x,
              y: t.y,
              size: Math.max(1, t.size || 1),
              kind: resolveScarKind(damageType, Boolean(isCrit)),
              rotation: Math.floor(Math.random() * 360),
              createdAt: Date.now(),
            });
          }

          if (killedNow && !suppressExecution && !t.isHidden && t.type !== 'character') {
            const activeCb = campaignState.combat.active
              ? campaignState.combat.combatants[campaignState.combat.currentTurnIndex]
              : undefined;
            const activeHero = activeCb?.referenceId
              ? campaignState.characters.find((c) => c.id === activeCb.referenceId)
              : undefined;
            triggeredExecutionEvt = {
              id: `exec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              killerName: killerName || activeCb?.name || 'Golpe Fatal',
              killerColor: killerColor || activeHero?.playerColor || activeCb?.color || '#f59e0b',
              killerPortraitUrl: killerPortraitUrl || activeHero?.portraitUrl,
              victimName: t.name,
              victimTokenId: t.id,
              isBoss: Boolean(t.isBoss || (t.size || 1) >= 2),
              damageType,
              mapId: m.id,
              createdAt: Date.now(),
            };
          }

          let droppedNow = false;
          if (
            t.type === 'monster' &&
            t.hp > 0 &&
            nextHp === 0 &&
            !t.lootDropped &&
            targetMonster &&
            ((targetMonster.lootGoldFormula && targetMonster.lootGoldFormula.trim()) ||
              (targetMonster.lootItems && targetMonster.lootItems.length > 0))
          ) {
            droppedNow = true;
            const goldRolled = targetMonster.lootGoldFormula?.trim()
              ? Math.max(0, evaluateFormula(targetMonster.lootGoldFormula.trim()).total)
              : 0;
            const lootOwnerLabel = isTokenNameHiddenFromPlayers(t, campaignState)
              ? 'Criatura Derrotada'
              : t.name;
            autoLootMarkers.push({
              id: `loot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              x: t.x,
              y: t.y,
              kind: 'chest',
              title: `Espólio: ${lootOwnerLabel}`,
              description: `Itens e moedas deixados por ${lootOwnerLabel}.`,
              revealed: true,
              lootGold: goldRolled > 0 ? goldRolled : undefined,
              lootItems: targetMonster.lootItems?.map((li) => ({ ...li })),
            });
          }

          return {
            ...t,
            hp: nextHp,
            ...(isHeal && nextHp > 0 && (t.activeConditionIds || []).includes('cond-inconsciente')
              ? {
                  activeConditionIds: (t.activeConditionIds || []).filter(
                    (cid) => cid !== 'cond-inconsciente'
                  ),
                }
              : {}),
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
          ...(newBattleScars.length > 0
            ? { battleScars: [...(m.battleScars || []), ...newBattleScars].slice(-60) }
            : {}),
        };
      });

      const updatedChars = campaignState.characters.map((c) => {
        if (c.id !== matchedRefId && c.id !== targetTokenId) return c;
        targetName = c.name;
        const wasDown = c.hp <= 0;
        const isPermanentlyDead = Boolean(c.deathSaves?.dead || (c.deathSaves?.failures ?? 0) >= 3);
        if (isHeal && isPermanentlyDead) {
          // D&D 5e: ordinary healing cannot revive a permanently dead hero (requires explicit GM resurrection!)
          return c;
        }
        const charMaxHp = Math.max(
          1,
          computeCharacterStats(c, campaignState).maxHp
        );
        const nextTempHp = Math.max(0, (c.tempHp || 0) - tempHpAbsorbed);
        const nextHp = Math.max(0, Math.min(charMaxHp, c.hp + delta));
        let nextDeathSaves = c.deathSaves || { successes: 0, failures: 0 };

        if (nextHp > 0) {
          nextDeathSaves = { successes: 0, failures: 0, stabilized: false, dead: false };
        } else if (!isHeal && hpDamageAfterTemp > 0 && wasDown && !nextDeathSaves.dead) {
          // D&D 5e: taking damage while at 0 PV inflicts 1 Death Save failure (2 on Critical Hit) and breaks stabilization
          const failsToAdd = isCrit ? 2 : 1;
          const nextFails = Math.min(3, (nextDeathSaves.failures || 0) + failsToAdd);
          nextDeathSaves = {
            ...nextDeathSaves,
            failures: nextFails,
            stabilized: false,
            dead: nextFails >= 3,
          };
        }

        const nextConds =
          isHeal && nextHp > 0
            ? c.activeConditionIds.filter((cid) => cid !== 'cond-inconsciente')
            : c.activeConditionIds;

        return { ...c, hp: nextHp, tempHp: nextTempHp, deathSaves: nextDeathSaves, activeConditionIds: nextConds };
      });

      const appliedCondDef = applyConditionId
        ? campaignState.compendium.conditions.find((c) => c.id === applyConditionId)
        : undefined;

      const activeTurnCb = campaignState.combat.active
        ? campaignState.combat.combatants[campaignState.combat.currentTurnIndex]
        : undefined;

      const updatedCombatants = campaignState.combat.combatants.map((cb) => {
        const matchesToken =
          (cb.tokenId && cb.tokenId === targetTokenId) ||
          Boolean(
            cb.type === 'character' &&
              ((matchedRefId && cb.referenceId === matchedRefId) ||
                (targetChar && cb.referenceId === targetChar.id))
          );
        if (!matchesToken) return cb;
        const wasDownCb = cb.hp <= 0;
        const nextHp = Math.max(0, Math.min(cb.maxHp, cb.hp + delta));
        const nextEffects =
          applyConditionId && appliedCondDef
            ? [
                ...cb.effects.filter((ef) => ef.conditionId !== applyConditionId),
                {
                  id: `eff-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                  label: appliedCondDef.name,
                  conditionId: applyConditionId,
                  remainingRounds: conditionDurationRounds || 3,
                  sourceName: 'Combate',
                },
              ]
            : cb.effects;
        const baseCb = { ...cb, hp: nextHp, effects: nextEffects };
        // BG3 Revive Rule: healing a downed combatant from 0 PV spends their Standard Action (unless GM manual +1/+5 override)
        if (campaignState.combat.active && isHeal && !skipRevivePenalty && wasDownCb && nextHp > 0) {
          const isCurrentlyActiveTurn = Boolean(activeTurnCb && activeTurnCb.id === cb.id);
          return applyBg3ReviveActionPenalty(baseCb, isCurrentlyActiveTurn);
        }
        return baseCb;
      });

      const bossPhaseInfo = triggeredBossPhaseLog as {
        name: string;
        phase: number;
        title?: string;
        color?: string;
      } | null;

      const updatedBoss =
        campaignState.activeBoss && campaignState.activeBoss.id === targetTokenId
          ? {
              ...campaignState.activeBoss,
              hp: Math.max(
                0,
                Math.min(campaignState.activeBoss.maxHp, campaignState.activeBoss.hp + delta)
              ),
              ...(bossPhaseInfo?.title
                ? { title: `Fase ${bossPhaseInfo.phase} • ${bossPhaseInfo.title}` }
                : {}),
            }
          : campaignState.activeBoss;

      const updatedRollLog = rollId
        ? campaignState.rollLog.map((r) => (r.id === rollId ? { ...r, applied: true } : r))
        : campaignState.rollLog;

      const isTargetHidden = Boolean(foundToken?.isHidden);
      const sysLog: RollLogEntry = {
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        rollerName: 'Combate',
        rollerRole: 'gm',
        title: isHeal ? `Cura Aplicada em ${targetName}` : `Dano Aplicado em ${targetName}`,
        formula: isHeal ? `+${effectiveAmount} PV` : `-${effectiveAmount} PV`,
        individualRolls: [],
        total: effectiveAmount,
        damageType,
        isSecret: isTargetHidden,
        details: isHeal
          ? `${targetName} recuperou ${effectiveAmount} Pontos de Vida.`
          : affinityNote
            ? `${targetName} sofreu ${effectiveAmount} de dano (${affinityNote}; bruto ${Math.abs(amount)}).`
            : `${targetName} sofreu ${effectiveAmount} de dano${damageType ? ` (${damageType})` : ''}.`,
      };

      const isConditionOnlyZeroAmount = Boolean(applyConditionId && amount === 0 && !isHeal);
      const maxHpForLog = targetChar
        ? Math.max(1, computeCharacterStats(targetChar, campaignState).maxHp)
        : Math.max(1, foundToken?.maxHp ?? 1);
      const prevHpForLog = targetChar ? targetChar.hp : foundToken?.hp ?? 0;
      const nextHpForLog = Math.max(0, Math.min(maxHpForLog, prevHpForLog + delta));
      const actorKindForLog: 'hero' | 'monster' | 'npc' =
        targetChar || foundToken?.type === 'character'
          ? 'hero'
          : foundToken?.type === 'npc'
            ? 'npc'
            : 'monster';
      const nowIsoLog = new Date().toISOString();
      const newBg3Logs: CombatLogEntry[] =
        isConditionOnlyZeroAmount || isTargetHidden
          ? []
          : [
              {
                id: `clog-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                timestamp: nowIsoLog,
                category: (isHeal ? 'heal' : 'damage') as 'heal' | 'damage' | 'death' | 'revive',
                actorName: targetName,
                actorKind: actorKindForLog,
                actorColor: targetChar?.playerColor || foundToken?.color,
                summary: isHeal
                  ? `recuperou +${effectiveAmount} PV`
                  : `sofreu -${effectiveAmount} de dano${damageType ? ` (${damageType})` : ''}${affinityNote ? ` (${affinityNote})` : ''}`,
              },
            ];
      if (!isTargetHidden && !isConditionOnlyZeroAmount && !isHeal && prevHpForLog > 0 && nextHpForLog <= 0) {
        newBg3Logs.push({
          id: `clog-die-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          timestamp: nowIsoLog,
          category: 'death',
          actorName: targetName,
          actorKind: actorKindForLog,
          actorColor: targetChar?.playerColor || foundToken?.color,
          summary: actorKindForLog === 'hero' ? 'caiu inconsciente (0 PV)!' : 'foi derrotado (0 PV)!',
        });
      } else if (!isTargetHidden && bossPhaseInfo) {
        newBg3Logs.push({
          id: `clog-phase-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          timestamp: nowIsoLog,
          category: 'damage',
          actorName: bossPhaseInfo.name,
          actorKind: 'monster',
          actorColor: bossPhaseInfo.color || '#dc2626',
          summary: `entrou na 👑 Fase ${bossPhaseInfo.phase}${bossPhaseInfo.title ? `: ${bossPhaseInfo.title}` : ''}!`,
        });
      } else if (!isTargetHidden && isHeal && prevHpForLog <= 0 && nextHpForLog > 0) {
        newBg3Logs.push({
          id: `clog-rev-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          timestamp: nowIsoLog,
          category: 'revive',
          actorName: targetName,
          actorKind: actorKindForLog,
          actorColor: targetChar?.playerColor || foundToken?.color,
          summary: `levantou / foi revivido (${nextHpForLog} PV)!`,
        });
      }

      const finalMaps = applyConditionId
        ? updatedMaps.map((m) => ({
            ...m,
            tokens: m.tokens.map((t) =>
              (t.id === targetTokenId ||
                Boolean(targetChar && t.type === 'character' && t.referenceId === targetChar.id)) &&
              !(t.activeConditionIds || []).includes(applyConditionId)
                ? { ...t, activeConditionIds: [...(t.activeConditionIds || []), applyConditionId] }
                : t
            ),
          }))
        : updatedMaps;

      const finalChars = applyConditionId
        ? updatedChars.map((c) =>
            (c.id === matchedRefId || c.id === targetTokenId) &&
            !c.activeConditionIds.includes(applyConditionId)
              ? { ...c, activeConditionIds: [...c.activeConditionIds, applyConditionId] }
              : c
          )
        : updatedChars;

      const prevCampaignSnapshot = campaignState;
      const nextRawState = {
        ...campaignState,
        maps: finalMaps,
        characters: finalChars,
        activeBoss: updatedBoss,
        combat: {
          ...campaignState.combat,
          combatants: updatedCombatants,
        },
        rollLog: isConditionOnlyZeroAmount
          ? updatedRollLog
          : [sysLog, ...updatedRollLog].slice(0, 120),
        combatLog:
          newBg3Logs.length > 0
            ? [...(campaignState.combatLog || []).slice(-(120 - newBg3Logs.length)), ...newBg3Logs]
            : campaignState.combatLog || [],
      };
      campaignState =
        applyConditionId || nextHpForLog <= 0
          ? syncCampaignDerivedCharacterStats(nextRawState, prevCampaignSnapshot)
          : nextRawState;

      // Record short-lived damage authority so concurrent or same-client stale campaign:patch never wipes damage!
      const authKey = foundToken?.id || targetTokenId;
      recentDamageAuthority.set(authKey, {
        tokenId: authKey,
        charId: targetChar?.id,
        at: Date.now(),
      });

      // Broadcast immediately before async debounced disk persist to prevent combat race conditions!
      if (!isConditionOnlyZeroAmount) {
        const vfxPayload = {
          tokenId: targetTokenId,
          amount: effectiveAmount,
          isHeal: Boolean(isHeal),
          note: affinityNote,
        };
        if (isTargetHidden) {
          for (const [sid, s] of io.sockets.sockets) {
            if (isSocketGm(sid)) s.emit('floating:vfx', vfxPayload);
          }
        } else {
          io.emit('floating:vfx', vfxPayload);
        }
      }
      broadcastCampaignUpdated();
      schedulePersistState(450);

      // Automatic Spell Concentration Check trigger on damage
      if (!isHeal && effectiveAmount > 0) {
        const updatedTargetChar = campaignState.characters.find(
          (c) => c.id === matchedRefId || c.id === targetTokenId
        );
        const updatedTargetCb = campaignState.combat.combatants.find(
          (cb) =>
            cb.tokenId === targetTokenId ||
            Boolean(cb.type === 'character' && matchedRefId && cb.referenceId === matchedRefId)
        );
        const concSpell =
          updatedTargetChar?.concentratingSpell || updatedTargetCb?.concentratingSpell;
        const stillAlive =
          (updatedTargetChar ? updatedTargetChar.hp > 0 : true) &&
          (updatedTargetCb ? updatedTargetCb.hp > 0 : true);
        if (concSpell) {
          if (!stillAlive) {
            // Unconscious / 0 PV automatically breaks concentration AND cleans up all tracked concentration conditions from targets!
            const trackedConcEffects = (updatedTargetChar?.activeTrackedEffects || []).filter(
              (e) => e.isConcentration
            );
            const condRemByChar = new Map<string, Set<string>>();
            const condRemByTok = new Map<string, Set<string>>();
            trackedConcEffects.forEach((ef) => {
              if (!ef.conditionId) return;
              ef.targetCharacterIds.forEach((cid) => {
                if (!condRemByChar.has(cid)) condRemByChar.set(cid, new Set());
                condRemByChar.get(cid)!.add(ef.conditionId!);
              });
              ef.targetTokenIds.forEach((tid) => {
                if (!condRemByTok.has(tid)) condRemByTok.set(tid, new Set());
                condRemByTok.get(tid)!.add(ef.conditionId!);
              });
            });
            const affectedNames = trackedConcEffects.flatMap((e) => e.targetNames).filter(Boolean);
            const concLog: CombatLogEntry = {
              id: `clog-conc-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
              timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
              category: 'condition',
              actorName: targetName,
              actorKind: updatedTargetChar ? 'hero' : 'monster',
              actorColor: updatedTargetChar?.playerColor || updatedTargetChar?.tokenColor || '#e0b84c',
              summary:
                affectedNames.length > 0
                  ? `caiu a 0 PV e perdeu concentração em ${concSpell} — efeito removido de ${affectedNames.join(', ')}`
                  : `caiu a 0 PV e perdeu concentração em ${concSpell}`,
            };

            campaignState = {
              ...campaignState,
              characters: campaignState.characters.map((c) => {
                let next = c;
                const toRem = condRemByChar.get(c.id);
                if (toRem && toRem.size > 0) {
                  next = {
                    ...next,
                    activeConditionIds: next.activeConditionIds.filter((id) => !toRem.has(id)),
                  };
                }
                if (c.id === updatedTargetChar?.id) {
                  next = {
                    ...next,
                    concentratingSpell: null,
                    activeTrackedEffects: (next.activeTrackedEffects || []).filter(
                      (e) => !e.isConcentration
                    ),
                  };
                }
                return next;
              }),
              maps: campaignState.maps.map((m) => ({
                ...m,
                tokens: m.tokens.map((t) => {
                  const toRem = condRemByTok.get(t.id);
                  if (!toRem || toRem.size === 0) return t;
                  return {
                    ...t,
                    activeConditionIds: (t.activeConditionIds || []).filter((id) => !toRem.has(id)),
                  };
                }),
              })),
              combat: {
                ...campaignState.combat,
                combatants: campaignState.combat.combatants.map((cb) => {
                  let nextCb = cb;
                  if (cb.id === updatedTargetCb?.id) {
                    nextCb = { ...nextCb, concentratingSpell: null };
                  }
                  const toRemTok = cb.tokenId ? condRemByTok.get(cb.tokenId) : undefined;
                  const toRemChar = cb.referenceId ? condRemByChar.get(cb.referenceId) : undefined;
                  if ((toRemTok && toRemTok.size > 0) || (toRemChar && toRemChar.size > 0)) {
                    nextCb = {
                      ...nextCb,
                      effects: nextCb.effects.filter(
                        (ef) =>
                          !(
                            ef.conditionId &&
                            ((toRemTok && toRemTok.has(ef.conditionId)) ||
                              (toRemChar && toRemChar.has(ef.conditionId)))
                          )
                      ),
                    };
                  }
                  return nextCb;
                }),
              },
              combatLog: [...(campaignState.combatLog || []).slice(-119), concLog],
            };
            campaignState = syncCampaignDerivedCharacterStats(campaignState, prevCampaignSnapshot);
            broadcastCampaignUpdated();
            schedulePersistState(450);
          } else {
            io.emit('concentration:trigger', {
              tokenId: targetTokenId,
              characterId: updatedTargetChar?.id,
              name: targetName,
              spellName: concSpell,
              dc: computeConcentrationDc(effectiveAmount),
              damageTaken: effectiveAmount,
            });
          }
        }
      }
      if (triggeredExecutionEvt) {
        io.emit('cinematic:execution', triggeredExecutionEvt);
      }

      } catch (err) {
        console.error('[SERVER] Erro em combat:apply-damage:', err);
      }
    }
  );

  // Live Player Map Pointer (Bolinha colorida)
  socket.on('pointer:move', (pointer: MapPointerState) => {
    if (!pointer || typeof pointer.playerId !== 'string' || !pointer.playerId) return;
    activePointers.set(pointer.playerId, { ...pointer, updatedAt: Date.now() });
    socket.broadcast.emit('pointer:update', pointer);
  });

  socket.on('pointer:hide', (playerId: string) => {
    if (typeof playerId !== 'string' || !playerId) return;
    activePointers.delete(playerId);
    socket.broadcast.emit('pointer:remove', playerId);
  });

  // GM Requests Skill/Attr Check ("O Mestre Pede um Teste!")
  socket.on('check:request', (reqPayload: SkillCheckRequest) => {
    if (!isSocketGm(socket.id) || !reqPayload) return;
    activeSkillCheck = reqPayload;
    broadcastSkillCheck();
  });

  socket.on(
    'check:submit-result',
    (resPayload: {
      checkId: string;
      characterId: string;
      characterName: string;
      playerColor: string;
      total: number;
      d20?: number;
      passed: boolean;
    }) => {
      if (!resPayload || !activeSkillCheck || activeSkillCheck.id !== resPayload.checkId) return;
      const filtered = activeSkillCheck.results.filter(
        (r) => r.characterId !== resPayload.characterId
      );
      activeSkillCheck = {
        ...activeSkillCheck,
        results: [
          ...filtered,
          {
            characterId: resPayload.characterId,
            characterName: resPayload.characterName,
            playerColor: resPayload.playerColor,
            total: resPayload.total,
            d20: resPayload.d20,
            passed: resPayload.passed,
          },
        ],
      };
      broadcastSkillCheck();
    }
  );

  socket.on('check:dismiss', () => {
    if (!isSocketGm(socket.id)) return;
    activeSkillCheck = null;
    io.emit('check:updated', null);
  });

  const applyImportedHeroToServer = async (
    heroPayload: Character,
    requesterPlayerId: string,
    requesterPlayerName?: string,
    playerColor?: string
  ): Promise<string> => {
    const now = new Date().toISOString();
    const normalized = normalizeHeroCharacter(heroPayload, campaignState);
    const vaultId = normalized.vaultId || normalized.id;
    const existingChar = campaignState.characters.find(
      (c) =>
        c.id === normalized.id ||
        (vaultId && c.vaultId === vaultId) ||
        (c.name.toLowerCase() === normalized.name.toLowerCase() &&
          c.ownerPlayerId === requesterPlayerId)
    );
    const finalCharId = existingChar ? existingChar.id : normalized.id;

    const finalChar: Character = {
      ...normalized,
      id: finalCharId,
      vaultId,
      ownerPlayerId: requesterPlayerId,
      playerName: requesterPlayerName?.trim() || normalized.playerName,
      playerColor: playerColor || normalized.playerColor,
      tokenColor: playerColor || normalized.tokenColor,
      lastSyncedAt: now,
    };
    const stats = computeCharacterStats(finalChar, campaignState);
    finalChar.hp = Math.max(0, Math.min(stats.maxHp, finalChar.hp || stats.maxHp));
    finalChar.mp = Math.max(0, Math.min(stats.maxMp, finalChar.mp || stats.maxMp));

    const hasChar = campaignState.characters.some((c) => c.id === finalCharId);
    const nextChars = hasChar
      ? campaignState.characters.map((c) => (c.id === finalCharId ? finalChar : c))
      : [...campaignState.characters, finalChar];

    const nextMaps = campaignState.maps.map((m) => {
      if (m.id !== campaignState.activeMapId) return m;
      const existingTok = m.tokens.find(
        (t) => t.type === 'character' && t.referenceId === finalCharId
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
        2 + (campaignState.characters.length % 3),
        4 + (campaignState.characters.length % 4),
        1
      );
      return {
        ...m,
        tokens: [
          ...m.tokens,
          {
            id: `tok-${finalCharId}`,
            name: finalChar.name.split(' ')[0],
            type: 'character' as const,
            referenceId: finalCharId,
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

    let nextCombatState = campaignState.combat;
    if (campaignState.combat.active) {
      const alreadyInCombat = campaignState.combat.combatants.some(
        (cb) => cb.referenceId === finalCharId || cb.tokenId === `tok-${finalCharId}`
      );
      if (!alreadyInCombat) {
        const spawnedTok = nextMaps
          .find((m) => m.id === campaignState.activeMapId)
          ?.tokens.find((t) => t.type === 'character' && t.referenceId === finalCharId);
        const d20 = Math.floor(Math.random() * 20) + 1;
        const initBonus = stats.initiative;
        const total = d20 + initBonus;
        const extraEcon = getConditionExtraEconomy(finalChar.activeConditionIds || [], campaignState);
        const maxActs = 1 + extraEcon.extraActions;
        const maxBon = 1 + extraEcon.extraBonusActions;
        const newCb = {
          id: `comb-${spawnedTok?.id || finalCharId}-${Date.now().toString(36).slice(-3)}`,
          tokenId: spawnedTok?.id || `tok-${finalCharId}`,
          referenceId: finalCharId,
          type: 'character' as const,
          name: finalChar.name.split(' ')[0],
          initiative: total,
          d20Roll: d20,
          initBonus,
          hp: finalChar.hp,
          maxHp: stats.maxHp,
          defense: stats.defense,
          speedMeters: stats.speed || 9,
          remainingMoveMeters: stats.speed || 9,
          actionsRemaining: maxActs,
          actionAvailable: maxActs > 0,
          bonusActionsRemaining: maxBon,
          bonusActionAvailable: maxBon > 0,
          reactionAvailable: true,
          disengaged: false,
          dodging: false,
          isHidden: false,
          color: finalChar.playerColor || finalChar.tokenColor,
          effects: [],
        };
        const nextCombatants = [...campaignState.combat.combatants];
        let nextTurnIdx = campaignState.combat.currentTurnIndex;
        let insertIdx = nextCombatants.findIndex((cb) => compareInitiativeOrder(newCb, cb) < 0);
        if (insertIdx === -1) insertIdx = nextCombatants.length;
        nextCombatants.splice(insertIdx, 0, newCb);
        if (insertIdx <= nextTurnIdx && nextCombatants.length > 1) {
          nextTurnIdx += 1;
        }
        nextCombatState = {
          ...campaignState.combat,
          combatants: nextCombatants,
          currentTurnIndex: nextTurnIdx,
        };
      }
    }

    campaignState = normalizeCampaign({
      ...campaignState,
      characters: nextChars,
      maps: nextMaps,
      combat: nextCombatState,
    });
    broadcastCampaignUpdated();
    schedulePersistState(300);
    await upsertSavedCharacter(
      finalChar,
      {
        originCampaignId: campaignState.id,
        originCampaignName: campaignState.name,
      },
      campaignState
    ).catch(() => {});
    const savedList = await listSavedCharacters().catch(() => []);
    io.emit('characters:saved-updated', savedList);
    return finalCharId;
  };

  // Player Requests to GM (Descanso Longo, Descanso Curto, Cura/Ajuste, Entrada como Herói)
  socket.on('request:send', async (reqPayload: PlayerRequest) => {
    try {
      if (!reqPayload || !reqPayload.type) return;
      if (reqPayload.type === 'claim-hero' || reqPayload.type === 'import-hero') {
        const hasOnlineGm =
          gmHostSocketIds.size > 0 ||
          Array.from(connectedPlayers.values()).some((p) => p.role === 'gm');
        if (!hasOnlineGm) {
          let resolvedCharId = reqPayload.characterId;
          if (reqPayload.type === 'claim-hero') {
            const target = campaignState.characters.find((c) => c.id === reqPayload.characterId);
            if (target && reqPayload.requesterPlayerId) {
              const now = new Date().toISOString();
              const claimed: Character = {
                ...target,
                ownerPlayerId: reqPayload.requesterPlayerId,
                playerName: reqPayload.requesterPlayerName?.trim() || target.playerName,
                vaultId: target.vaultId || target.id,
                lastSyncedAt: now,
              };
              campaignState = normalizeCampaign({
                ...campaignState,
                characters: campaignState.characters.map((c) => (c.id === target.id ? claimed : c)),
              });
              await persistState();
              await upsertSavedCharacter(
                claimed,
                {
                  originCampaignId: campaignState.id,
                  originCampaignName: campaignState.name,
                },
                campaignState
              ).catch(() => {});
              broadcastCampaignUpdated();
            }
          } else if (reqPayload.type === 'import-hero' && reqPayload.heroPayload && reqPayload.requesterPlayerId) {
            resolvedCharId = await applyImportedHeroToServer(
              reqPayload.heroPayload,
              reqPayload.requesterPlayerId,
              reqPayload.requesterPlayerName,
              reqPayload.playerColor
            );
          }

          io.emit('request:resolved', {
            type: reqPayload.type,
            requesterPlayerId: reqPayload.requesterPlayerId,
            characterId: resolvedCharId,
            characterName: reqPayload.characterName,
            label: reqPayload.label,
            approved: true,
          });
          return;
        }

        // Replace any previous pending hero-join request from the same player
        pendingRequests = [
          ...pendingRequests.filter(
            (r) =>
              !(
                (r.type === 'claim-hero' || r.type === 'import-hero') &&
                r.requesterPlayerId &&
                r.requesterPlayerId === reqPayload.requesterPlayerId
              )
          ),
          reqPayload,
        ];
        io.emit('request:list', pendingRequests);
        return;
      }

      const exists = pendingRequests.some(
        (r) => r.characterId === reqPayload.characterId && r.type === reqPayload.type
      );
      if (!exists) {
        pendingRequests = [...pendingRequests, reqPayload];
      }
      io.emit('request:list', pendingRequests);
    } catch (err) {
      console.error('[SERVER] Erro em request:send:', err);
    }
  });

  socket.on('request:cancel', (payload: { requestId?: string; requesterPlayerId?: string }) => {
    if (!payload) return;
    const senderInfo = connectedPlayers.get(socket.id);
    const gm = isSocketGm(socket.id);
    pendingRequests = pendingRequests.filter((r) => {
      if (payload.requestId && r.id === payload.requestId) {
        if (!gm && r.requesterPlayerId && senderInfo?.playerId && r.requesterPlayerId !== senderInfo.playerId) {
          return true;
        }
        return false;
      }
      if (
        payload.requesterPlayerId &&
        (r.type === 'claim-hero' || r.type === 'import-hero') &&
        r.requesterPlayerId === payload.requesterPlayerId
      ) {
        if (!gm && senderInfo?.playerId && payload.requesterPlayerId !== senderInfo.playerId) {
          return true;
        }
        return false;
      }
      return true;
    });
    io.emit('request:list', pendingRequests);
  });

  socket.on('request:resolve', async (payload: { requestId: string; approved: boolean }) => {
    try {
      if (!isSocketGm(socket.id) || !payload?.requestId) return;
      const reqItem = pendingRequests.find((r) => r.id === payload.requestId);
      pendingRequests = pendingRequests.filter((r) => r.id !== payload.requestId);
      io.emit('request:list', pendingRequests);
      if (!reqItem) return;

      // 1. GM Approval for Claiming an Existing Campaign Hero
      if (reqItem.type === 'claim-hero') {
        if (payload.approved) {
          const target = campaignState.characters.find((c) => c.id === reqItem.characterId);
          if (target && reqItem.requesterPlayerId) {
            const now = new Date().toISOString();
            const claimed: Character = {
              ...target,
              ownerPlayerId: reqItem.requesterPlayerId,
              playerName: reqItem.requesterPlayerName?.trim() || target.playerName,
              vaultId: target.vaultId || target.id,
              lastSyncedAt: now,
            };
            campaignState = normalizeCampaign({
              ...campaignState,
              characters: campaignState.characters.map((c) => (c.id === target.id ? claimed : c)),
            });
            await persistState();
            await upsertSavedCharacter(
              claimed,
              {
                originCampaignId: campaignState.id,
                originCampaignName: campaignState.name,
              },
              campaignState
            ).catch(() => {});
            broadcastCampaignUpdated();
          }
        }
        io.emit('request:resolved', {
          type: reqItem.type,
          requesterPlayerId: reqItem.requesterPlayerId,
          characterId: reqItem.characterId,
          characterName: reqItem.characterName,
          label: reqItem.label,
          approved: payload.approved,
        });
        return;
      }

      // 2. GM Approval for Importing a Previously Saved Hero from Vault / .json
      if (reqItem.type === 'import-hero') {
        let resolvedCharId = reqItem.characterId;
        if (payload.approved && reqItem.heroPayload && reqItem.requesterPlayerId) {
          resolvedCharId = await applyImportedHeroToServer(
            reqItem.heroPayload,
            reqItem.requesterPlayerId,
            reqItem.requesterPlayerName,
            reqItem.playerColor
          );
        }

        io.emit('request:resolved', {
          type: reqItem.type,
          requesterPlayerId: reqItem.requesterPlayerId,
          characterId: resolvedCharId,
          characterName: reqItem.characterName,
          label: reqItem.label,
          approved: payload.approved,
        });
        return;
      }

      if (payload.approved) {
        const char = campaignState.characters.find((c) => c.id === reqItem.characterId);
        const isDownOrDead = Boolean(
          char &&
            (char.hp <= 0 ||
              char.deathSaves?.dead ||
              (char.deathSaves?.failures || 0) >= 3)
        );
        if (
          char &&
          isDownOrDead &&
          (reqItem.type === 'long-rest' || reqItem.type === 'short-rest' || reqItem.type === 'heal-mp')
        ) {
          io.emit('request:resolved', {
            characterId: reqItem.characterId,
            characterName: reqItem.characterName,
            label: `${reqItem.label} bloqueado (${char.name} está caído/morto — use Reviver/Salvar)`,
            approved: false,
          });
          return;
        }
        if (char) {
          const restMode: 'long' | 'short' | 'full' =
            reqItem.type === 'long-rest'
              ? 'long'
              : reqItem.type === 'short-rest'
                ? 'short'
                : 'full';
          const restResult = applyCharacterRestToState(campaignState, char.id, restMode);
          if (restResult) {
            const updatedChar = restResult.nextState.characters.find((c) => c.id === char.id);
            const nextHp = updatedChar?.hp ?? restResult.maxHp;
            const logDetail =
              restMode === 'long'
                ? `${char.name} completou um Descanso Longo (PV ${restResult.maxHp}/${restResult.maxHp}, ${campaignState.settings.resourceShort} ${restResult.maxMp}/${restResult.maxMp}).`
                : restMode === 'short'
                  ? `${char.name} completou um Descanso Curto (+${restResult.healedHp} PV, PV atual ${nextHp}/${restResult.maxHp}).`
                  : `O Mestre restaurou os vitais de ${char.name}.`;

            campaignState = {
              ...restResult.nextState,
              rollLog: [
                {
                  id: `log-${Date.now()}`,
                  timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                  rollerName: 'Mestre',
                  rollerRole: 'gm' as const,
                  title: `${reqItem.label} Aprovado`,
                  formula: reqItem.type === 'long-rest' ? '100%' : 'Descanso',
                  individualRolls: [],
                  total: nextHp,
                  isSecret: false,
                  details: logDetail,
                },
                ...restResult.nextState.rollLog,
              ].slice(0, 120),
            };
            await persistState();
            broadcastCampaignUpdated();
          }
        }
      }

      io.emit('request:resolved', {
        characterId: reqItem.characterId,
        characterName: reqItem.characterName,
        label: reqItem.label,
        approved: payload.approved,
      });
    } catch (err) {
      console.error('[SERVER] Erro em request:resolve:', err);
    }
  });

  // Boss Fight Banner
  socket.on('boss:announce', async (boss: BossBannerState | null) => {
    try {
      if (!isSocketGm(socket.id)) return;
      campaignState = { ...campaignState, activeBoss: boss };
      await persistState();
      const linkedBossTok = boss?.tokenId
        ? campaignState.maps.flatMap((m) => m.tokens).find((t) => t.id === boss.tokenId)
        : undefined;
      if (linkedBossTok?.isHidden) {
        for (const [sid, s] of io.sockets.sockets) {
          if (isSocketGm(sid)) s.emit('boss:announced', boss);
        }
      } else {
        io.emit('boss:announced', boss);
      }
      broadcastCampaignUpdated();
    } catch (err) {
      console.error('[SERVER] Erro em boss:announce:', err);
    }
  });

  // Combat Duel Arena & Initiative Ceremony Broadcasts
  socket.on('duel:show', (duel: CombatDuelState | null) => {
    io.emit('duel:updated', duel);
  });

  socket.on('initiative:ceremony', (ceremony: InitiativeCeremonyState | null) => {
    io.emit('initiative:ceremony', ceremony);
  });

  socket.on('vfx:slash', (payload: { tokenId: string; kind: 'hit' | 'block' | 'heal' }) => {
    io.emit('vfx:slash', payload);
  });

  socket.on('opportunity:prompt', (prompt: OpportunityAttackPrompt | null) => {
    io.emit('opportunity:prompt', prompt);
  });

  socket.on('fall:prompt', (prompt: FallDamagePrompt | null) => {
    io.emit('fall:prompt', prompt);
  });

  socket.on('counterspell:prompt', (prompt: CounterspellPrompt | null) => {
    io.emit('counterspell:prompt', prompt);
  });

  // Synchronized Anime-Style Ultimate Cut-In & Transformation Cinematics
  socket.on('cinematic:cutin', (event: CutInCinematicEvent | null) => {
    io.emit('cinematic:cutin', event);
  });

  // Synchronized Black Flash (Natural 20 Critical) & Execution ("How Do You Want To Do This?")
  socket.on('cinematic:blackflash', (event: BlackFlashCinematicEvent | null) => {
    io.emit('cinematic:blackflash', event);
  });
  socket.on('cinematic:execution', (event: ExecutionCinematicEvent | null) => {
    io.emit('cinematic:execution', event);
  });

  // Live RP Portrait Spotlight (Visual Novel Dual-Slot Stage)
  socket.on('spotlight:update', (state: RpSpotlightState) => {
    activeRpSpotlight = state || { left: null, right: null };
    io.emit('spotlight:updated', activeRpSpotlight);
  });

  // Authoritative Death Save Sync (Player rolls & GM manual pip adjustments)
  socket.on(
    'character:deathSave',
    async (payload: {
      characterId: string;
      hp: number;
      deathSaves: Character['deathSaves'];
      consumeAction?: boolean;
      applyRevivePenalty?: boolean;
      clearRevivePenalty?: boolean;
    }) => {
      try {
        const char = campaignState.characters.find((c) => c.id === payload.characterId);
        if (!char) return;
        const nextHp = Math.max(0, payload.hp);
        const activeTurnCb = campaignState.combat.active
          ? campaignState.combat.combatants[campaignState.combat.currentTurnIndex]
          : undefined;
        recentDeathSaveAuthority.set(char.id, {
          socketId: socket.id,
          at: Date.now(),
        });
        campaignState = normalizeCampaign({
          ...campaignState,
          characters: campaignState.characters.map((c) =>
            c.id !== char.id
              ? c
              : {
                  ...c,
                  hp: nextHp,
                  activeConditionIds:
                    nextHp > 0
                      ? c.activeConditionIds.filter((cid) => cid !== 'cond-inconsciente')
                      : c.activeConditionIds,
                  deathSaves: {
                    successes: Math.max(0, Math.min(3, payload.deathSaves?.successes || 0)),
                    failures: Math.max(0, Math.min(3, payload.deathSaves?.failures || 0)),
                    stabilized: Boolean(payload.deathSaves?.stabilized),
                    dead: Boolean(payload.deathSaves?.dead),
                    assistedBy: payload.deathSaves?.assistedBy,
                  },
                }
          ),
          maps: campaignState.maps.map((m) => ({
            ...m,
            tokens: m.tokens.map((t) =>
              t.type === 'character' && t.referenceId === char.id
                ? {
                    ...t,
                    hp: nextHp,
                    activeConditionIds:
                      nextHp > 0
                        ? (t.activeConditionIds || []).filter((cid) => cid !== 'cond-inconsciente')
                        : t.activeConditionIds,
                  }
                : t
            ),
          })),
          combat: {
            ...campaignState.combat,
            combatants: campaignState.combat.combatants.map((cb) => {
              if (!(cb.type === 'character' && cb.referenceId === char.id)) return cb;
              let nextCb = { ...cb, hp: nextHp };
              if (campaignState.combat.active && payload.consumeAction) {
                nextCb = {
                  ...consumeCombatantEconomy(nextCb, 'Padrão'),
                  actionsRemaining: 0,
                  actionAvailable: false,
                  deathSaveRolledThisTurn: true,
                };
              }
              if (campaignState.combat.active && payload.applyRevivePenalty && nextHp > 0) {
                const isActiveTurn = Boolean(activeTurnCb && activeTurnCb.id === cb.id);
                nextCb = applyBg3ReviveActionPenalty(nextCb, isActiveTurn);
              }
              if (payload.clearRevivePenalty) {
                const isActiveTurn = Boolean(activeTurnCb && activeTurnCb.id === cb.id);
                nextCb = {
                  ...nextCb,
                  revivedLostActionPending: false,
                  deathSaveRolledThisTurn: false,
                  ...(isActiveTurn && nextHp > 0
                    ? {
                        actionsRemaining: Math.max(1, getCombatantActionsRemaining(nextCb)),
                        actionAvailable: true,
                      }
                    : {}),
                };
              }
              return nextCb;
            }),
          },
        });
        broadcastCampaignUpdated();
        schedulePersistState(450);
      } catch (err) {
        console.error('[SERVER] Erro em character:deathSave:', err);
      }
    }
  );

  // Unified Hybrid Save Prompt (Traps, AoE Spells, Concentration Checks)
  socket.on('save-prompt:update', (prompt: TacticalSavePrompt | null) => {
    activeSavePrompt = prompt;
    io.emit('save-prompt:updated', activeSavePrompt);
  });

  // RP Chat & Private Whispers (/w) — supports text, images, or both
  socket.on('chat:send', async (msg: ChatMessageEntry) => {
    try {
      const hasText = Boolean(msg?.text && msg.text.trim());
      const hasImage = Boolean(msg?.imageUrl && msg.imageUrl.trim());
      if (!msg || (!hasText && !hasImage)) return;
      const sanitizedMsg: ChatMessageEntry = {
        ...msg,
        text: (msg.text || '').trim(),
        imageUrl: hasImage ? msg.imageUrl!.trim() : undefined,
      };
      campaignState = {
        ...campaignState,
        chatLog: [...(campaignState.chatLog || []), sanitizedMsg].slice(-150),
      };
      schedulePersistState(400);

      if (!sanitizedMsg.isWhisper) {
        io.emit('chat:new', sanitizedMsg);
        return;
      }

      const targetLower = (sanitizedMsg.recipientName || '').trim().toLowerCase();
      const gmNameLower = (campaignState.gmName || 'Mestre').trim().toLowerCase();
      const isTargetGm = targetLower === 'mestre' || targetLower === 'gm' || targetLower === gmNameLower;

      // Resolve ownerPlayerId from campaign characters if recipient was selected by hero name
      const matchedCharOwnerId = !isTargetGm && targetLower
        ? campaignState.characters.find((c) => c.name.trim().toLowerCase() === targetLower)?.ownerPlayerId
        : undefined;
      const resolvedRecipientPlayerId = sanitizedMsg.recipientPlayerId || matchedCharOwnerId;

      for (const [sid, s] of io.sockets.sockets) {
        if (sid === socket.id) {
          s.emit('chat:new', sanitizedMsg);
          continue;
        }
        const info = connectedPlayers.get(sid);
        // Always recognize GM socket via BOTH connectedPlayers role AND gmHostSocketIds
        const isGm = info?.role === 'gm' || gmHostSocketIds.has(sid);
        if (isGm) {
          // GM always receives whispers to Mestre and monitors table whispers (D&D VTT standard)
          s.emit('chat:new', sanitizedMsg);
          continue;
        }
        if (isTargetGm) {
          // Whispers to the GM are NEVER delivered to any other player!
          continue;
        }
        // Strict recipient matching: when recipientPlayerId is known, NEVER fall back to name collision!
        const matchesRecipient = resolvedRecipientPlayerId
          ? info?.playerId === resolvedRecipientPlayerId
          : Boolean(
              targetLower !== '' &&
                ((info?.playerName || '').trim().toLowerCase() === targetLower ||
                  (info?.characterName || '').trim().toLowerCase() === targetLower)
            );
        if (matchesRecipient) {
          s.emit('chat:new', sanitizedMsg);
        }
      }
    } catch (err) {
      console.error('[SERVER] Erro em chat:send:', err);
    }
  });

  // Magic Card Reward Animation (GM only)
  socket.on('reward:grant', (reward: CardRewardNotification) => {
    if (!isSocketGm(socket.id) || !reward) return;
    io.emit('reward:received', reward);
  });

  // Character Theme Music
  socket.on(
    'music:play-character-theme',
    (payload: { characterName: string; characterColor: string; title: string; url: string }) => {
      if (!payload) return;
      io.emit('music:theme-playing', payload);
    }
  );

  socket.on('handout:show', (handout: HandoutPayload) => {
    try {
      if (!isSocketGm(socket.id) || !handout) return;
      const targetCharIds = handout.recipientCharacterIds || [];
      const targetNameLower = (handout.targetPlayerName || '').trim().toLowerCase();
      const isTargeted = targetCharIds.length > 0 || targetNameLower.length > 0;
      if (!isTargeted) {
        io.emit('handout:received', handout);
        return;
      }
      const targetOwnerIds = new Set(
        campaignState.characters
          .filter((c) => targetCharIds.includes(c.id) && c.ownerPlayerId)
          .map((c) => c.ownerPlayerId!)
      );
      for (const [sid, s] of io.sockets.sockets) {
        if (isSocketGm(sid) || sid === socket.id) {
          s.emit('handout:received', handout);
          continue;
        }
        const info = connectedPlayers.get(sid);
        const matched =
          (info?.playerId && targetOwnerIds.has(info.playerId)) ||
          (info?.characterId && targetCharIds.includes(info.characterId)) ||
          (targetNameLower &&
            ((info?.playerName || '').trim().toLowerCase() === targetNameLower ||
              (info?.characterName || '').trim().toLowerCase() === targetNameLower));
        if (matched) {
          s.emit('handout:received', handout);
        }
      }
    } catch (err) {
      console.error('[SERVER] Erro em handout:show:', err);
    }
  });

  // Notify GM sockets whenever a player steps on a secret passage (even if unrevealed!)
  socket.on('passage:triggered', (payload: unknown) => {
    try {
      if (!payload) return;
      for (const [sid, s] of io.sockets.sockets) {
        if (isSocketGm(sid) && sid !== socket.id) {
          s.emit('passage:triggered', payload);
        }
      }
    } catch (err) {
      console.error('[SERVER] Erro em passage:triggered:', err);
    }
  });

  socket.on(
    'camera:focus',
    (payload: { id: string; mapId: string; x: number; y: number; label?: string }) => {
      io.emit('camera:focus', payload);
    }
  );

  socket.on(
    'sound:trigger',
    (payload: {
      action: 'ambient' | 'sfx' | 'stop-ambient';
      presetKey: string;
      name: string;
      customUrl?: string;
    }) => {
      io.emit('sound:play', payload);
    }
  );

  socket.on('map:ping', (payload: { mapId: string; x: number; y: number; color: string; sender: string }) => {
    io.emit('map:ping', payload);
  });

  // Live ephemeral token speech bubbles & quick reactions (zero disk overhead)
  socket.on('token:speech', (payload: unknown) => {
    io.emit('token:speech', payload);
  });

  // Live ephemeral tactical map drawings ("Tinta Mágica", auto-fades after ~8s)
  socket.on('map:draw', (stroke: unknown) => {
    io.emit('map:draw', stroke);
  });

  socket.on('map:draw-clear', (payload: { mapId: string }) => {
    io.emit('map:draw-clear', payload);
  });

  socket.on('rest:announce', (payload: { id: string; kind: 'short' | 'long'; summary: string; affectedCount: number }) => {
    if (!isSocketGm(socket.id) || !payload) return;
    io.emit('rest:banner', payload);
  });

  socket.on('vfx:projectile', (payload: unknown) => {
    if (!payload) return;
    io.emit('vfx:projectile', payload);
  });

  socket.on('combat:mvp-summary', (payload: unknown) => {
    if (!isSocketGm(socket.id)) return;
    io.emit('combat:mvp-summary', payload);
  });

  socket.on('disconnect', () => {
    const leaving = connectedPlayers.get(socket.id);
    const wasGmHost = gmHostSocketIds.delete(socket.id) || leaving?.role === 'gm';
    connectedPlayers.delete(socket.id);
    if (leaving?.playerId && activePointers.has(leaving.playerId)) {
      activePointers.delete(leaving.playerId);
      io.emit('pointer:remove', leaving.playerId);
    }
    io.emit('presence:list', Array.from(connectedPlayers.values()));
    io.emit('presence:count', io.engine.clientsCount);

    if (wasGmHost && gmRoomOpen) {
      const anyOtherGm =
        gmHostSocketIds.size > 0 ||
        Array.from(connectedPlayers.values()).some((p) => p.role === 'gm');
      if (!anyOtherGm) {
        if (gmDisconnectTimer) clearTimeout(gmDisconnectTimer);
        // 20s grace period so brief Wi-Fi/Cloudflare tunnel hiccups or F5 refreshes never kick players,
        // while intentional exit (room:gm-leave) still closes the room immediately!
        gmDisconnectTimer = setTimeout(() => {
          gmDisconnectTimer = null;
          const gmBack =
            gmHostSocketIds.size > 0 ||
            Array.from(connectedPlayers.values()).some((p) => p.role === 'gm');
          if (!gmBack && gmRoomOpen) {
            gmRoomOpen = false;
            io.emit('room:closed', {
              reason: 'O Mestre desconectou — a sala foi encerrada automaticamente.',
            });
          }
        }, 20000);
      }
    }
  });
});

process.on('unhandledRejection', (reason) => {
  console.error('[SERVER] Unhandled rejection:', reason);
});

server.on('error', (err: NodeJS.ErrnoException) => {
  console.error('[SERVER] Erro fatal no servidor HTTP:', err.code || err.message);
  if (err.code === 'EADDRINUSE') {
    console.error(`[SERVER] Porta ${PORT} já está em uso.`);
  }
  process.exit(1);
});

ensureDataLoaded().then(() => {
  startUdpBeaconResponder();
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[SERVER] Crônicas d20 rodando em http://localhost:${PORT}`);
  });
});
