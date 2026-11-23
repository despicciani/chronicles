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
  computeCharacterStats,
  computeConcentrationDc,
  encodeRoomCode,
  evaluateFormula,
  findNearestFreeGridCell,
  normalizeHeroCharacter,
  resolveDamageWithAffinities,
  syncCampaignDerivedCharacterStats,
} from '../src/shared/rulesEngine';
import {
  BossBannerState,
  CampaignState,
  CampaignSummary,
  CardRewardNotification,
  Character,
  ChatMessageEntry,
  CombatDuelState,
  CombatLogEntry,
  ConnectedPlayerInfo,
  HandoutPayload,
  InitiativeCeremonyState,
  MapPointerState,
  OpportunityAttackPrompt,
  PlayerRequest,
  RollLogEntry,
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
let pendingRequests: PlayerRequest[] = [];
const activePointers = new Map<string, MapPointerState>();
const connectedPlayers = new Map<string, ConnectedPlayerInfo>();
const gmHostSocketIds = new Set<string>();
let gmRoomOpen = false;
let gmDisconnectTimer: ReturnType<typeof setTimeout> | null = null;

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
  meta?: { originCampaignId?: string; originCampaignName?: string }
): Promise<SavedHeroEntry> {
  await fs.mkdir(CHARACTERS_DIR, { recursive: true });
  const vaultId = (char.vaultId || char.id).replace(/[^a-zA-Z0-9_-]/g, '_');
  const now = new Date().toISOString();
  const targetFile = getSavedHeroFilePath(vaultId);

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
    campaignState
  );
  const entry: SavedHeroEntry = {
    id: vaultId,
    character: normalizedChar,
    savedAt: existingSavedAt,
    updatedAt: now,
    originCampaignId: existingCampId || campaignState.id,
    originCampaignName: existingCampName || campaignState.name,
  };
  const tmpFile = `${targetFile}.tmp`;
  await fs.writeFile(tmpFile, JSON.stringify(entry, null, 2), 'utf-8');
  await fs.rename(tmpFile, targetFile);
  return entry;
}

async function syncVaultLinkedCharactersToDisk(camp: CampaignState): Promise<boolean> {
  await fs.mkdir(CHARACTERS_DIR, { recursive: true });
  let changed = false;

  for (const ch of camp.characters || []) {
    if (!ch || !ch.id || !ch.name) continue;
    await upsertSavedCharacter(ch, {
      originCampaignId: camp.id,
      originCampaignName: camp.name,
    });
    changed = true;
  }
  return changed;
}

function normalizeCampaign(c: CampaignState): CampaignState {
  const existingConds = c.compendium?.conditions || [];
  const hasParalyzed = existingConds.some((cd) => cd.id === 'cond-paralisado');
  const nextConds = hasParalyzed
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
    // Load first available campaign file
    const raw = await fs.readFile(path.join(CAMPAIGNS_DIR, existingFiles[0]), 'utf-8');
    campaignState = normalizeCampaign(JSON.parse(raw) as CampaignState);
    await fs.writeFile(ACTIVE_ID_FILE, campaignState.id, 'utf-8');
    console.log(`[SERVER] Campanha carregada: ${campaignState.name}`);
  }
}

function persistState(): Promise<void> {
  campaignState.updatedAt = new Date().toISOString();
  const targetFile = getCampaignFilePath(campaignState.id);
  const snapshot = campaignState;
  saveQueue = saveQueue.then(async () => {
    await fs.mkdir(CAMPAIGNS_DIR, { recursive: true });
    const tmpFile = `${targetFile}.tmp`;
    await fs.writeFile(tmpFile, JSON.stringify(snapshot, null, 2), 'utf-8');
    await fs.rename(tmpFile, targetFile);
    await fs.writeFile(ACTIVE_ID_FILE, snapshot.id, 'utf-8');
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
  return saveQueue;
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '30mb' }));
app.use('/uploads', express.static(UPLOADS_DIR));

const server = http.createServer(app);
const io = new Server(server, {
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
    addresses: getLocalNetworkAddresses(),
  });
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

      publicTunnelState = { status: 'active', url: resolvedUrl };
      broadcastTunnelStatus();
      console.log(`[TUNNEL] Link público direto ativo: ${resolvedUrl}`);
      return publicTunnelState;
    } catch (err) {
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

app.post('/api/tunnel/start', async (_req, res) => {
  const next = await startPublicTunnel();
  res.status(next.status === 'error' ? 500 : 200).json(next);
});

app.post('/api/tunnel/stop', (_req, res) => {
  stopPublicTunnel();
  res.json(publicTunnelState);
});

process.on('SIGINT', () => {
  stopPublicTunnel();
  process.exit(0);
});
process.on('SIGTERM', () => {
  stopPublicTunnel();
  process.exit(0);
});
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
  if (isExternalTunnelRequest(req)) {
    res.status(403).json({ error: 'Apenas o anfitrião local pode criar novas campanhas.' });
    return;
  }
  try {
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
    campaignState = next;
    activeSkillCheck = null;
    await persistState();
    io.emit('campaign:updated', campaignState);
    res.json(campaignState);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post('/api/campaigns/load/:id', async (req, res) => {
  if (isExternalTunnelRequest(req)) {
    res.status(403).json({ error: 'Apenas o anfitrião local pode trocar de campanha.' });
    return;
  }
  try {
    const file = getCampaignFilePath(req.params.id);
    const raw = await fs.readFile(file, 'utf-8');
    campaignState = normalizeCampaign(JSON.parse(raw) as CampaignState);
    activeSkillCheck = null;
    await persistState();
    io.emit('campaign:updated', campaignState);
    res.json(campaignState);
  } catch (err) {
    res.status(404).json({ error: 'Campanha não encontrada.' });
  }
});

app.delete('/api/campaigns/:id', async (req, res) => {
  if (isExternalTunnelRequest(req)) {
    res.status(403).json({ error: 'Apenas o anfitrião local pode excluir campanhas salvas.' });
    return;
  }
  try {
    const targetId = req.params.id;
    const file = getCampaignFilePath(targetId);
    await fs.unlink(file);
    if (campaignState.id === targetId) {
      const remaining = await listSavedCampaigns();
      if (remaining.length > 0) {
        const raw = await fs.readFile(getCampaignFilePath(remaining[0].id), 'utf-8');
        campaignState = normalizeCampaign(JSON.parse(raw) as CampaignState);
      } else {
        campaignState = normalizeCampaign(createStarterCampaign());
      }
      await persistState();
      io.emit('campaign:updated', campaignState);
    }
    res.json({ ok: true, activeId: campaignState.id });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// File Upload (Images & Music from PC)
app.post('/api/upload', async (req, res) => {
  try {
    const { filename, dataUrl } = req.body as { filename: string; dataUrl: string };
    if (!filename || !dataUrl || !dataUrl.includes(',')) {
      res.status(400).json({ error: 'Arquivo inválido.' });
      return;
    }
    const base64Data = dataUrl.split(',')[1];
    const buffer = Buffer.from(base64Data, 'base64');
    const ext = path.extname(filename).toLowerCase() || '.bin';
    const baseName = path
      .basename(filename, ext)
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 40);
    const uniqueName = `${Date.now()}-${baseName}${ext}`;
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
    await fs.writeFile(path.join(UPLOADS_DIR, uniqueName), buffer);
    res.json({ url: `/uploads/${uniqueName}`, filename: uniqueName });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Active Campaign Endpoints
app.get('/api/campaign', (_req, res) => {
  res.json(campaignState);
});

app.get('/api/room-status', (_req, res) => {
  const hasGm = Array.from(connectedPlayers.values()).some((p) => p.role === 'gm');
  res.json({ open: gmRoomOpen, hasGm });
});

app.post('/api/campaign/update', async (req, res) => {
  try {
    const next = req.body as CampaignState;
    if (!next || !next.compendium || !next.maps) {
      res.status(400).json({ error: 'Dados de campanha inválidos.' });
      return;
    }
    campaignState = normalizeCampaign(next);
    await persistState();
    io.emit('campaign:updated', campaignState);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post('/api/campaign/reset', async (_req, res) => {
  campaignState = normalizeCampaign(createStarterCampaign());
  activeSkillCheck = null;
  await persistState();
  io.emit('campaign:updated', campaignState);
  res.json(campaignState);
});

app.post('/api/campaign/import', async (req, res) => {
  try {
    const imported = req.body as CampaignState;
    if (!imported || !imported.compendium || !Array.isArray(imported.characters)) {
      res.status(400).json({ error: 'Arquivo JSON de campanha inválido.' });
      return;
    }
    campaignState = normalizeCampaign(imported);
    activeSkillCheck = null;
    await persistState();
    io.emit('campaign:updated', campaignState);
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
    const entry = await upsertSavedCharacter(character, {
      originCampaignId,
      originCampaignName,
    });
    const list = await listSavedCharacters();
    io.emit('characters:saved-updated', list);
    res.json({ ok: true, entry, characters: list });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.delete('/api/characters/saved/:id', async (req, res) => {
  try {
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
  socket.emit('campaign:updated', campaignState);
  listSavedCharacters()
    .then((list) => socket.emit('characters:saved-updated', list))
    .catch(() => {});
  if (activeSkillCheck) {
    socket.emit('check:updated', activeSkillCheck);
  }
  if (activeSavePrompt) {
    socket.emit('save-prompt:updated', activeSavePrompt);
  }
  socket.emit('request:list', pendingRequests);
  socket.emit('pointer:bulk', Array.from(activePointers.values()));
  socket.emit('tunnel:status', publicTunnelState);
  socket.emit('presence:list', Array.from(connectedPlayers.values()));
  io.emit('presence:count', io.engine.clientsCount);

  socket.on(
    'presence:identify',
    (info: Omit<ConnectedPlayerInfo, 'socketId'> & { inLobby?: boolean }) => {
      if (!info || !info.playerId) return;
      const isGmRole = info.role === 'gm';
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
      io.emit('presence:list', Array.from(connectedPlayers.values()));
    }
  );

  socket.on('room:gm-open', () => {
    gmHostSocketIds.add(socket.id);
    if (gmDisconnectTimer) {
      clearTimeout(gmDisconnectTimer);
      gmDisconnectTimer = null;
    }
    gmRoomOpen = true;
  });

  socket.on('room:gm-leave', () => {
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
    if (!nextState || !nextState.compendium) return;
    campaignState = normalizeCampaign(nextState);
    await persistState();
    socket.broadcast.emit('campaign:updated', campaignState);
  });

  socket.on('roll:send', async (entry: RollLogEntry) => {
    campaignState = {
      ...campaignState,
      rollLog: [entry, ...campaignState.rollLog].slice(0, 120),
    };
    await persistState();
    io.emit('roll:new', entry);
    io.emit('campaign:updated', campaignState);
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
    }) => {
      const {
        targetTokenId,
        amount,
        isHeal,
        rollId,
        damageType,
        applyConditionId,
        conditionDurationRounds,
      } = payload;

      // Locate target token/character/monster to resolve Damage Resistances / Immunities / Vulnerabilities
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

      let effectiveAmount = Math.abs(amount);
      let affinityNote: string | undefined;

      if (!isHeal && damageType) {
        const res = resolveDamageWithAffinities(effectiveAmount, damageType, {
          immunities: targetChar?.damageImmunities || targetMonster?.damageImmunities,
          resistances: targetChar?.damageResistances || targetMonster?.damageResistances,
          vulnerabilities: targetChar?.damageVulnerabilities || targetMonster?.damageVulnerabilities,
          activeConditionIds: [
            ...(foundToken?.activeConditionIds || []),
            ...(targetChar?.activeConditionIds || []),
          ],
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

      const updatedMaps = campaignState.maps.map((m) => ({
        ...m,
        tokens: m.tokens.map((t) => {
          if (t.id !== targetTokenId) return t;
          matchedRefId = t.referenceId;
          targetName = t.name;
          const nextHp = Math.max(0, Math.min(t.maxHp, t.hp + delta));
          const phase2Pct = t.bossPhase2HpPct ?? 50;
          const shouldEnterPhase2 =
            Boolean(t.isBoss) &&
            (t.bossPhase || 1) < 2 &&
            t.maxHp > 0 &&
            nextHp > 0 &&
            (nextHp / t.maxHp) * 100 <= phase2Pct;
          return {
            ...t,
            hp: nextHp,
            ...(shouldEnterPhase2
              ? {
                  bossPhase: 2,
                  legendaryActionsRemaining: t.legendaryActionsMax ?? t.legendaryActionsRemaining,
                }
              : {}),
          };
        }),
      }));

      const updatedChars = campaignState.characters.map((c) => {
        if (c.id !== matchedRefId && c.id !== targetTokenId) return c;
        targetName = c.name;
        const wasDown = c.hp <= 0;
        const charMaxHp = Math.max(
          1,
          foundToken?.maxHp || c.maxHpOverride || computeCharacterStats(c, campaignState).maxHp
        );
        const nextTempHp = Math.max(0, (c.tempHp || 0) - tempHpAbsorbed);
        const nextHp = Math.max(0, Math.min(charMaxHp, c.hp + delta));
        let nextDeathSaves = c.deathSaves || { successes: 0, failures: 0 };

        if (nextHp > 0) {
          nextDeathSaves = { successes: 0, failures: 0, stabilized: false, dead: false };
        } else if (!isHeal && effectiveAmount > 0 && wasDown && !nextDeathSaves.dead) {
          // D&D 5e: taking damage while at 0 PV inflicts 1 Death Save failure and breaks stabilization
          const nextFails = Math.min(3, (nextDeathSaves.failures || 0) + 1);
          nextDeathSaves = {
            ...nextDeathSaves,
            failures: nextFails,
            stabilized: false,
            dead: nextFails >= 3,
          };
        }

        return { ...c, hp: nextHp, tempHp: nextTempHp, deathSaves: nextDeathSaves };
      });

      const appliedCondDef = applyConditionId
        ? campaignState.compendium.conditions.find((c) => c.id === applyConditionId)
        : undefined;

      const updatedCombatants = campaignState.combat.combatants.map((cb) => {
        const matchesToken = cb.tokenId
          ? cb.tokenId === targetTokenId
          : Boolean(matchedRefId && cb.referenceId === matchedRefId);
        if (!matchesToken) return cb;
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
        return { ...cb, hp: nextHp, effects: nextEffects };
      });

      const updatedBoss =
        campaignState.activeBoss && campaignState.activeBoss.id === targetTokenId
          ? {
              ...campaignState.activeBoss,
              hp: Math.max(
                0,
                Math.min(campaignState.activeBoss.maxHp, campaignState.activeBoss.hp + delta)
              ),
            }
          : campaignState.activeBoss;

      const updatedRollLog = rollId
        ? campaignState.rollLog.map((r) => (r.id === rollId ? { ...r, applied: true } : r))
        : campaignState.rollLog;

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
        isSecret: false,
        details: isHeal
          ? `${targetName} recuperou ${effectiveAmount} Pontos de Vida.`
          : affinityNote
            ? `${targetName} sofreu ${effectiveAmount} de dano (${affinityNote}; bruto ${Math.abs(amount)}).`
            : `${targetName} sofreu ${effectiveAmount} de dano${damageType ? ` (${damageType})` : ''}.`,
      };

      const prevHpForLog = targetChar ? targetChar.hp : foundToken?.hp ?? 0;
      const nextHpForLog = Math.max(0, prevHpForLog + delta);
      const actorKindForLog: 'hero' | 'monster' | 'npc' =
        targetChar || foundToken?.type === 'character'
          ? 'hero'
          : foundToken?.type === 'npc'
            ? 'npc'
            : 'monster';
      const nowIsoLog = new Date().toISOString();
      const newBg3Logs = [
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
      if (!isHeal && prevHpForLog > 0 && nextHpForLog <= 0) {
        newBg3Logs.push({
          id: `clog-die-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          timestamp: nowIsoLog,
          category: 'death',
          actorName: targetName,
          actorKind: actorKindForLog,
          actorColor: targetChar?.playerColor || foundToken?.color,
          summary: actorKindForLog === 'hero' ? 'caiu inconsciente (0 PV)!' : 'foi derrotado (0 PV)!',
        });
      } else if (isHeal && prevHpForLog <= 0 && nextHpForLog > 0) {
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
              t.id === targetTokenId && !(t.activeConditionIds || []).includes(applyConditionId)
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

      campaignState = {
        ...campaignState,
        maps: finalMaps,
        characters: finalChars,
        activeBoss: updatedBoss,
        combat: {
          ...campaignState.combat,
          combatants: updatedCombatants,
        },
        rollLog: [sysLog, ...updatedRollLog].slice(0, 120),
        combatLog: [...(campaignState.combatLog || []).slice(-(120 - newBg3Logs.length)), ...newBg3Logs],
      };

      await persistState();
      io.emit('floating:vfx', {
        tokenId: targetTokenId,
        amount: effectiveAmount,
        isHeal: Boolean(isHeal),
        note: affinityNote,
      });
      io.emit('campaign:updated', campaignState);

      // Automatic Spell Concentration Check trigger on damage
      if (!isHeal && effectiveAmount > 0) {
        const updatedTargetChar = campaignState.characters.find(
          (c) => c.id === matchedRefId || c.id === targetTokenId
        );
        const updatedTargetCb = campaignState.combat.combatants.find(
          (cb) =>
            cb.tokenId === targetTokenId ||
            Boolean(matchedRefId && cb.referenceId === matchedRefId)
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
              maps: campaignState.maps.map((m) =>
                m.id !== campaignState.activeMapId
                  ? m
                  : {
                      ...m,
                      tokens: m.tokens.map((t) => {
                        const toRem = condRemByTok.get(t.id);
                        if (!toRem || toRem.size === 0) return t;
                        return {
                          ...t,
                          activeConditionIds: (t.activeConditionIds || []).filter(
                            (id) => !toRem.has(id)
                          ),
                        };
                      }),
                    }
              ),
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
            await persistState();
            io.emit('campaign:updated', campaignState);
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
    }
  );

  // Live Player Map Pointer (Bolinha colorida)
  socket.on('pointer:move', (pointer: MapPointerState) => {
    activePointers.set(pointer.playerId, { ...pointer, updatedAt: Date.now() });
    socket.broadcast.emit('pointer:update', pointer);
  });

  socket.on('pointer:hide', (playerId: string) => {
    activePointers.delete(playerId);
    socket.broadcast.emit('pointer:remove', playerId);
  });

  // GM Requests Skill/Attr Check ("O Mestre Pede um Teste!")
  socket.on('check:request', (reqPayload: SkillCheckRequest) => {
    activeSkillCheck = reqPayload;
    io.emit('check:updated', activeSkillCheck);
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
      if (!activeSkillCheck || activeSkillCheck.id !== resPayload.checkId) return;
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
      io.emit('check:updated', activeSkillCheck);
    }
  );

  socket.on('check:dismiss', () => {
    activeSkillCheck = null;
    io.emit('check:updated', null);
  });

  // Player Requests to GM (Descanso Longo, Descanso Curto, Cura/Ajuste, Entrada como Herói)
  socket.on('request:send', async (reqPayload: PlayerRequest) => {
    if (reqPayload.type === 'claim-hero' || reqPayload.type === 'import-hero') {
      // Check if there is actually a GM connected on the server; if not, auto-approve so nobody gets stuck waiting for a nonexistent GM
      const hasOnlineGm = Array.from(connectedPlayers.values()).some((p) => p.role === 'gm');
      if (!hasOnlineGm) {
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
            await upsertSavedCharacter(claimed, {
              originCampaignId: campaignState.id,
              originCampaignName: campaignState.name,
            }).catch(() => {});
            io.emit('campaign:updated', campaignState);
          }
        } else if (reqPayload.type === 'import-hero' && reqPayload.heroPayload) {
          const now = new Date().toISOString();
          const finalChar: Character = {
            ...reqPayload.heroPayload,
            ownerPlayerId: reqPayload.requesterPlayerId || reqPayload.heroPayload.ownerPlayerId,
            playerName: reqPayload.requesterPlayerName?.trim() || reqPayload.heroPayload.playerName,
            lastSyncedAt: now,
          };
          const existsInCampaign = campaignState.characters.some((c) => c.id === finalChar.id);
          campaignState = normalizeCampaign({
            ...campaignState,
            characters: existsInCampaign
              ? campaignState.characters.map((c) => (c.id === finalChar.id ? finalChar : c))
              : [...campaignState.characters, finalChar],
          });
          await persistState();
          await upsertSavedCharacter(finalChar, {
            originCampaignId: campaignState.id,
            originCampaignName: campaignState.name,
          }).catch(() => {});
          io.emit('campaign:updated', campaignState);
        }

        io.emit('request:resolved', {
          type: reqPayload.type,
          requesterPlayerId: reqPayload.requesterPlayerId,
          characterId: reqPayload.characterId,
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
  });

  socket.on('request:cancel', (payload: { requestId?: string; requesterPlayerId?: string }) => {
    pendingRequests = pendingRequests.filter((r) => {
      if (payload.requestId && r.id === payload.requestId) return false;
      if (
        payload.requesterPlayerId &&
        (r.type === 'claim-hero' || r.type === 'import-hero') &&
        r.requesterPlayerId === payload.requesterPlayerId
      ) {
        return false;
      }
      return true;
    });
    io.emit('request:list', pendingRequests);
  });

  socket.on('request:resolve', async (payload: { requestId: string; approved: boolean }) => {
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
          await upsertSavedCharacter(claimed, {
            originCampaignId: campaignState.id,
            originCampaignName: campaignState.name,
          }).catch(() => {});
          io.emit('campaign:updated', campaignState);
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
        const now = new Date().toISOString();
        const normalized = normalizeHeroCharacter(reqItem.heroPayload, campaignState);
        const vaultId = normalized.vaultId || normalized.id;
        const existingChar = campaignState.characters.find(
          (c) =>
            c.id === normalized.id ||
            (vaultId && c.vaultId === vaultId) ||
            (c.name.toLowerCase() === normalized.name.toLowerCase() &&
              c.ownerPlayerId === reqItem.requesterPlayerId)
        );
        const finalCharId = existingChar ? existingChar.id : normalized.id;
        resolvedCharId = finalCharId;

        const finalChar: Character = {
          ...normalized,
          id: finalCharId,
          vaultId,
          ownerPlayerId: reqItem.requesterPlayerId,
          playerName: reqItem.requesterPlayerName?.trim() || normalized.playerName,
          playerColor: reqItem.playerColor || normalized.playerColor,
          tokenColor: reqItem.playerColor || normalized.tokenColor,
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

        campaignState = normalizeCampaign({
          ...campaignState,
          characters: nextChars,
          maps: nextMaps,
        });
        await persistState();
        await upsertSavedCharacter(finalChar, {
          originCampaignId: campaignState.id,
          originCampaignName: campaignState.name,
        }).catch(() => {});
        const savedList = await listSavedCharacters().catch(() => []);
        io.emit('characters:saved-updated', savedList);
        io.emit('campaign:updated', campaignState);
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
        const stats = computeCharacterStats(char, campaignState);
        const charClass = campaignState.compendium.classes.find((cl) => cl.id === char.classId);

        let nextHp = char.hp;
        let nextMp = char.mp;
        let nextConds = char.activeConditionIds;
        let nextDeath = char.deathSaves;
        let logDetail = `${char.name} teve "${reqItem.label}" aprovado pelo Mestre.`;

        if (reqItem.type === 'long-rest') {
          nextHp = stats.maxHp;
          nextMp = stats.maxMp;
          nextConds = char.activeConditionIds.filter((id) => id !== 'cond-exausto');
          nextDeath = { successes: 0, failures: 0, stabilized: false, dead: false };
          logDetail = `${char.name} completou um Descanso Longo (PV ${stats.maxHp}/${stats.maxHp}, ${campaignState.settings.resourceShort} ${stats.maxMp}/${stats.maxMp}).`;
        } else if (reqItem.type === 'short-rest') {
          const healFormula = `1d${charClass?.hitDie || 8} + ${stats.attributes['con']?.mod || 0}`;
          const res = evaluateFormula(healFormula, stats, char);
          const healed = Math.max(1, res.total);
          nextHp = Math.min(stats.maxHp, char.hp + healed);
          nextMp = Math.min(stats.maxMp, char.mp + Math.ceil(stats.maxMp / 3));
          nextDeath = { successes: 0, failures: 0, stabilized: false, dead: false };
          logDetail = `${char.name} completou um Descanso Curto (+${healed} PV, PV atual ${nextHp}/${stats.maxHp}).`;
        } else if (reqItem.type === 'heal-mp') {
          nextHp = stats.maxHp;
          nextMp = stats.maxMp;
          nextDeath = { successes: 0, failures: 0, stabilized: false, dead: false };
          logDetail = `O Mestre restaurou os vitais de ${char.name}.`;
        }

        campaignState = {
          ...campaignState,
          characters: campaignState.characters.map((c) =>
            c.id === char.id
              ? {
                  ...c,
                  hp: nextHp,
                  mp: nextMp,
                  activeConditionIds: nextConds,
                  deathSaves: nextDeath,
                }
              : c
          ),
          maps: campaignState.maps.map((m) => ({
            ...m,
            tokens: m.tokens.map((t) =>
              t.referenceId === char.id ? { ...t, hp: nextHp, maxHp: stats.maxHp } : t
            ),
          })),
          combat: {
            ...campaignState.combat,
            combatants: campaignState.combat.combatants.map((cb) =>
              cb.referenceId === char.id ? { ...cb, hp: nextHp, maxHp: stats.maxHp } : cb
            ),
          },
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
            ...campaignState.rollLog,
          ].slice(0, 120),
        };
        await persistState();
        io.emit('campaign:updated', campaignState);
      }
    }

    io.emit('request:resolved', {
      characterId: reqItem.characterId,
      characterName: reqItem.characterName,
      label: reqItem.label,
      approved: payload.approved,
    });
  });

  // Boss Fight Banner
  socket.on('boss:announce', async (boss: BossBannerState | null) => {
    campaignState = { ...campaignState, activeBoss: boss };
    await persistState();
    io.emit('boss:announced', boss);
    io.emit('campaign:updated', campaignState);
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

  // Authoritative Death Save Sync (Player rolls & GM manual pip adjustments)
  socket.on(
    'character:deathSave',
    async (payload: {
      characterId: string;
      hp: number;
      deathSaves: Character['deathSaves'];
    }) => {
      const char = campaignState.characters.find((c) => c.id === payload.characterId);
      if (!char) return;
      const nextHp = Math.max(0, payload.hp);
      campaignState = normalizeCampaign({
        ...campaignState,
        characters: campaignState.characters.map((c) =>
          c.id !== char.id
            ? c
            : {
                ...c,
                hp: nextHp,
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
              ? { ...t, hp: nextHp }
              : t
          ),
        })),
        combat: {
          ...campaignState.combat,
          combatants: campaignState.combat.combatants.map((cb) =>
            cb.type === 'character' && cb.referenceId === char.id
              ? { ...cb, hp: nextHp }
              : cb
          ),
        },
      });
      await persistState();
      io.emit('campaign:updated', campaignState);
    }
  );

  // Unified Hybrid Save Prompt (Traps, AoE Spells, Concentration Checks)
  socket.on('save-prompt:update', (prompt: TacticalSavePrompt | null) => {
    activeSavePrompt = prompt;
    io.emit('save-prompt:updated', activeSavePrompt);
  });

  // RP Chat & Private Whispers (/w)
  socket.on('chat:send', async (msg: ChatMessageEntry) => {
    if (!msg || !msg.text || !msg.text.trim()) return;
    campaignState = {
      ...campaignState,
      chatLog: [...(campaignState.chatLog || []), msg].slice(-150),
    };
    await persistState();

    if (!msg.isWhisper) {
      io.emit('chat:new', msg);
      return;
    }

    const targetLower = (msg.recipientName || '').trim().toLowerCase();
    for (const [sid, s] of io.sockets.sockets) {
      if (sid === socket.id) {
        s.emit('chat:new', msg);
        continue;
      }
      const info = connectedPlayers.get(sid);
      const isGm = info?.role === 'gm';
      const matchesRecipient =
        Boolean(msg.recipientPlayerId && info?.playerId === msg.recipientPlayerId) ||
        (targetLower !== '' &&
          ((info?.playerName || '').toLowerCase() === targetLower ||
            (info?.characterName || '').toLowerCase() === targetLower ||
            (targetLower === 'mestre' && isGm)));
      if (isGm || matchesRecipient) {
        s.emit('chat:new', msg);
      }
    }
  });

  // Magic Card Reward Animation
  socket.on('reward:grant', (reward: CardRewardNotification) => {
    io.emit('reward:received', reward);
  });

  // Character Theme Music
  socket.on(
    'music:play-character-theme',
    (payload: { characterName: string; characterColor: string; title: string; url: string }) => {
      io.emit('music:theme-playing', payload);
    }
  );

  socket.on('handout:show', (handout: HandoutPayload) => {
    io.emit('handout:received', handout);
  });

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

  socket.on('rest:announce', (payload: { id: string; kind: 'short' | 'long'; summary: string; affectedCount: number }) => {
    io.emit('rest:banner', payload);
  });

  socket.on('vfx:projectile', (payload: unknown) => {
    io.emit('vfx:projectile', payload);
  });

  socket.on('combat:mvp-summary', (payload: unknown) => {
    io.emit('combat:mvp-summary', payload);
  });

  socket.on('disconnect', () => {
    const leaving = connectedPlayers.get(socket.id);
    const wasGmHost = gmHostSocketIds.delete(socket.id) || leaving?.role === 'gm';
    connectedPlayers.delete(socket.id);
    io.emit('presence:list', Array.from(connectedPlayers.values()));
    io.emit('presence:count', io.engine.clientsCount);

    if (wasGmHost && gmRoomOpen) {
      const anyOtherGm =
        gmHostSocketIds.size > 0 ||
        Array.from(connectedPlayers.values()).some((p) => p.role === 'gm');
      if (!anyOtherGm) {
        if (gmDisconnectTimer) clearTimeout(gmDisconnectTimer);
        // Short 2.5s grace period so an accidental F5 refresh by GM doesn't kick players,
        // while closing the app or losing connection cleanly closes the room!
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
        }, 2500);
      }
    }
  });
});

ensureDataLoaded().then(() => {
  startUdpBeaconResponder();
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[SERVER] Crônicas d20 rodando em http://localhost:${PORT}`);
  });
});
