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
  encodeRoomCode,
  evaluateFormula,
} from '../src/shared/rulesEngine';
import {
  BossBannerState,
  CampaignState,
  CampaignSummary,
  CardRewardNotification,
  CombatDuelState,
  HandoutPayload,
  InitiativeCeremonyState,
  MapPointerState,
  OpportunityAttackPrompt,
  PlayerRequest,
  RollLogEntry,
  SkillCheckRequest,
} from '../src/shared/types';

const PORT = Number(process.env.PORT || 3001);
const DISCOVERY_UDP_PORT = Number(process.env.DISCOVERY_UDP_PORT || 3002);
const DATA_DIR = path.resolve(process.cwd(), 'server', 'data');
const CAMPAIGNS_DIR = path.join(DATA_DIR, 'campaigns');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const LEGACY_DATA_FILE = path.join(DATA_DIR, 'campaign-state.json');
const ACTIVE_ID_FILE = path.join(DATA_DIR, 'active-campaign.txt');
const DIST_DIR = path.resolve(process.cwd(), 'dist');

let campaignState: CampaignState = createStarterCampaign();
let saveQueue: Promise<void> = Promise.resolve();
let activeSkillCheck: SkillCheckRequest | null = null;
let pendingRequests: PlayerRequest[] = [];
const activePointers = new Map<string, MapPointerState>();

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

function normalizeCampaign(c: CampaignState): CampaignState {
  return {
    ...c,
    coverUrl: c.coverUrl || '',
    gmName: c.gmName || 'Mestre',
    updatedAt: c.updatedAt || new Date().toISOString(),
    settings: {
      ...c.settings,
      attributePointBudget: c.settings?.attributePointBudget ?? 15,
      maxTrainedSkills: c.settings?.maxTrainedSkills ?? 4,
    },
    customMusicTracks: Array.isArray(c.customMusicTracks) ? c.customMusicTracks : [],
    activeBoss: c.activeBoss ?? null,
    maps: (c.maps || []).map((m) => ({
      ...m,
      gmMarkers: Array.isArray(m.gmMarkers) ? m.gmMarkers : [],
    })),
    characters: (c.characters || []).map((ch) => ({
      ...ch,
      playerColor: ch.playerColor || ch.tokenColor || '#f59e0b',
      tokenFrameStyle: ch.tokenFrameStyle || 'gold',
      diceSkin: ch.diceSkin || 'gold',
      customAttacks: Array.isArray(ch.customAttacks) ? ch.customAttacks : [],
      customAbilities: Array.isArray(ch.customAbilities) ? ch.customAbilities : [],
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
  saveQueue = saveQueue.then(async () => {
    await fs.mkdir(CAMPAIGNS_DIR, { recursive: true });
    const tmpFile = `${targetFile}.tmp`;
    await fs.writeFile(tmpFile, JSON.stringify(campaignState, null, 2), 'utf-8');
    await fs.rename(tmpFile, targetFile);
    await fs.writeFile(ACTIVE_ID_FILE, campaignState.id, 'utf-8');
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

app.get('/api/discover-rooms', async (_req, res) => {
  const discovered = new Map<
    string,
    {
      url: string;
      roomCode: string;
      campaignName: string;
      gmName: string;
      coverUrl: string;
      characterCount: number;
      isLocal: boolean;
    }
  >();

  // Always include local loopback room if running
  discovered.set(`http://127.0.0.1:${PORT}`, {
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
          const url = `http://${rinfo.address}:${data.port || PORT}`;
          discovered.set(url, {
            url,
            roomCode: encodeRoomCode(rinfo.address, data.port || PORT),
            campaignName: data.campaignName,
            gmName: data.gmName || 'Mestre',
            coverUrl: data.coverUrl || '',
            characterCount: data.characterCount || 0,
            isLocal: localIps.has(rinfo.address) || rinfo.address === '127.0.0.1',
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

  res.json({ rooms: Array.from(discovered.values()) });
});

// Multi-Campaign Management
app.get('/api/campaigns', async (_req, res) => {
  try {
    const list = await listSavedCampaigns();
    res.json({ activeId: campaignState.id, campaigns: list });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post('/api/campaigns/create', async (req, res) => {
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
  if (activeSkillCheck) {
    socket.emit('check:updated', activeSkillCheck);
  }
  socket.emit('request:list', pendingRequests);
  socket.emit('pointer:bulk', Array.from(activePointers.values()));
  socket.emit('tunnel:status', publicTunnelState);
  io.emit('presence:count', io.engine.clientsCount);

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
    async (payload: { targetTokenId: string; amount: number; isHeal?: boolean; rollId?: string }) => {
      const { targetTokenId, amount, isHeal, rollId } = payload;
      const delta = isHeal ? Math.abs(amount) : -Math.abs(amount);

      let matchedRefId: string | undefined;
      let targetName = 'Alvo';

      const updatedMaps = campaignState.maps.map((m) => ({
        ...m,
        tokens: m.tokens.map((t) => {
          if (t.id !== targetTokenId) return t;
          matchedRefId = t.referenceId;
          targetName = t.name;
          const nextHp = Math.max(0, Math.min(t.maxHp, t.hp + delta));
          return { ...t, hp: nextHp };
        }),
      }));

      const updatedChars = campaignState.characters.map((c) => {
        if (c.id !== matchedRefId && c.id !== targetTokenId) return c;
        targetName = c.name;
        const wasDown = c.hp <= 0;
        const nextHp = Math.max(0, c.hp + delta);
        let nextDeathSaves = c.deathSaves || { successes: 0, failures: 0 };

        if (nextHp > 0) {
          nextDeathSaves = { successes: 0, failures: 0, stabilized: false, dead: false };
        } else if (!isHeal && amount > 0 && wasDown && !nextDeathSaves.dead) {
          // D&D 5e: taking damage while at 0 PV inflicts 1 Death Save failure and breaks stabilization
          const nextFails = Math.min(3, (nextDeathSaves.failures || 0) + 1);
          nextDeathSaves = {
            ...nextDeathSaves,
            failures: nextFails,
            stabilized: false,
            dead: nextFails >= 3,
          };
        }

        return { ...c, hp: nextHp, deathSaves: nextDeathSaves };
      });

      const updatedCombatants = campaignState.combat.combatants.map((cb) => {
        const matchesToken = cb.tokenId
          ? cb.tokenId === targetTokenId
          : Boolean(matchedRefId && cb.referenceId === matchedRefId);
        if (!matchesToken) return cb;
        const nextHp = Math.max(0, Math.min(cb.maxHp, cb.hp + delta));
        return { ...cb, hp: nextHp };
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
        formula: isHeal ? `+${Math.abs(amount)} PV` : `-${Math.abs(amount)} PV`,
        individualRolls: [],
        total: Math.abs(amount),
        isSecret: false,
        details: isHeal
          ? `${targetName} recuperou ${Math.abs(amount)} Pontos de Vida.`
          : `${targetName} sofreu ${Math.abs(amount)} de dano.`,
      };

      campaignState = {
        ...campaignState,
        maps: updatedMaps,
        characters: updatedChars,
        activeBoss: updatedBoss,
        combat: {
          ...campaignState.combat,
          combatants: updatedCombatants,
        },
        rollLog: [sysLog, ...updatedRollLog].slice(0, 120),
      };

      await persistState();
      io.emit('floating:vfx', {
        tokenId: targetTokenId,
        amount: Math.abs(amount),
        isHeal: Boolean(isHeal),
      });
      io.emit('campaign:updated', campaignState);
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

  // Player Requests to GM (Descanso Longo, Descanso Curto, Cura/Ajuste)
  socket.on('request:send', (reqPayload: PlayerRequest) => {
    const exists = pendingRequests.some(
      (r) => r.characterId === reqPayload.characterId && r.type === reqPayload.type
    );
    if (!exists) {
      pendingRequests = [...pendingRequests, reqPayload];
    }
    io.emit('request:list', pendingRequests);
  });

  socket.on('request:resolve', async (payload: { requestId: string; approved: boolean }) => {
    const reqItem = pendingRequests.find((r) => r.id === payload.requestId);
    pendingRequests = pendingRequests.filter((r) => r.id !== payload.requestId);
    io.emit('request:list', pendingRequests);
    if (!reqItem) return;

    if (payload.approved) {
      const char = campaignState.characters.find((c) => c.id === reqItem.characterId);
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

  socket.on('disconnect', () => {
    io.emit('presence:count', io.engine.clientsCount);
  });
});

ensureDataLoaded().then(() => {
  startUdpBeaconResponder();
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[SERVER] Crônicas d20 rodando em http://localhost:${PORT}`);
  });
});
