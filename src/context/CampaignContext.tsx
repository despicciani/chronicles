import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  ActionEconomyCost,
  BossBannerState,
  CampaignState,
  CampaignSummary,
  CardRewardNotification,
  Character,
  CombatDuelState,
  DiceSkin,
  HandoutPayload,
  InitiativeCeremonyState,
  MapPointerState,
  MapToken,
  OpportunityAttackPrompt,
  PendingAttackChoice,
  PlayerRequest,
  RollLogEntry,
  RolledDieVisual,
  SkillCheckRequest,
  ThemeMode,
  UserRole,
} from '../shared/types';
import { createStarterCampaign } from '../shared/starterSeed';
import {
  computeCharacterStats,
  evaluateFormula,
  getGridSpanDistance,
  parseAttackRangeMeters,
  pickRandomPlayerColor,
  RollAdvantageMode,
} from '../shared/rulesEngine';
import { soundEngine } from '../utils/soundEngine';

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
  inLobby: boolean;
  setInLobby: (v: boolean) => void;
  loading: boolean;
  isConnected: boolean;
  connectedClients: number;
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
  triggerOpportunityPrompt: (prompt: OpportunityAttackPrompt | null) => void;
  performCombatManeuver: (maneuver: 'dash' | 'disengage' | 'dodge' | 'action-surge') => void;
  activeDuel: CombatDuelState | null;
  startCombatDuel: (choice: PendingAttackChoice, defenderToken: MapToken) => void;
  rollDuelDamage: () => void;
  advanceDuelPhase: (phase: CombatDuelState['phase']) => void;
  dismissDuel: () => void;
  initiativeCeremony: InitiativeCeremonyState | null;
  showInitiativeCeremony: (ceremony: InitiativeCeremonyState | null) => void;

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
  assistDeathSave: (helperCharacterId: string, targetCharacterId: string) => void;
  gmResolveDeathSave: (
    characterId: string,
    mode: 'stabilize' | 'save-full' | 'revive-1' | 'revive-full'
  ) => void;
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
    applyConditionId?: string;
    conditionDurationRounds?: number;
    extraBonus?: number;
    extraDice?: string[];
  }) => void;
  applyDamage: (targetTokenId: string, amount: number, isHeal?: boolean, rollId?: string) => void;
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
  const [inLobby, setInLobby] = useState<boolean>(true);
  const [loading, setLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [connectedClients, setConnectedClients] = useState(1);
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
  const [activeAmbientName, setActiveAmbientName] = useState<string | null>(null);
  const [activeThemeBanner, setActiveThemeBanner] = useState<ThemeMusicBanner | null>(null);
  const [pings, setPings] = useState<MapPing[]>([]);
  const [activePointers, setActivePointers] = useState<Record<string, MapPointerState>>({});
  const [activeSkillCheck, setActiveSkillCheck] = useState<SkillCheckRequest | null>(null);
  const [pendingRequests, setPendingRequests] = useState<PlayerRequest[]>([]);
  const [requestToast, setRequestToast] = useState<{
    id: string;
    label: string;
    approved: boolean;
  } | null>(null);
  const [activeReward, setActiveReward] = useState<CardRewardNotification | null>(null);
  const [floatingVfx, setFloatingVfx] = useState<FloatingCombatVfx[]>([]);
  const [slashVfx, setSlashVfx] = useState<SlashVfxEvent[]>([]);
  const [mapBannerName, setMapBannerName] = useState<string | null>(null);
  const [pendingAttackChoice, setPendingAttackChoice] = useState<PendingAttackChoice | null>(null);
  const [tacticalAlert, setTacticalAlert] = useState<{ id: string; message: string } | null>(null);
  const [opportunityPrompt, setOpportunityPrompt] = useState<OpportunityAttackPrompt | null>(null);
  const [activeDuel, setActiveDuel] = useState<CombatDuelState | null>(null);
  const [initiativeCeremony, setInitiativeCeremony] = useState<InitiativeCeremonyState | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const roleRef = useRef(role);
  const activeCharRef = useRef(activeCharacterId);
  const campaignRef = useRef(campaign);
  const serverUrlRef = useRef(serverUrl);
  const prevMapIdRef = useRef<string>(campaign.activeMapId);
  const activeDuelRef = useRef<CombatDuelState | null>(null);
  const pendingAttackRef = useRef<PendingAttackChoice | null>(null);

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
    return () => window.clearTimeout(t);
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

  // Locate player's single character when in player role
  const myCharacter = campaign.characters.find(
    (c) =>
      c.ownerPlayerId === myPlayerId ||
      (role === 'player' &&
        myPlayerName.trim() !== '' &&
        c.playerName.toLowerCase() === myPlayerName.trim().toLowerCase())
  );

  useEffect(() => {
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

  useEffect(() => {
    let mounted = true;
    const base = serverUrl || '';

    fetch(`${base}/api/campaign`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: CampaignState | null) => {
        if (mounted && data && data.compendium) {
          setCampaign(data);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setLoading(false);
      });

    refreshSavedCampaigns();

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
      if (mounted) setIsConnected(true);
    });

    socket.on('disconnect', () => {
      if (mounted) setIsConnected(false);
    });

    socket.on('presence:count', (count: number) => {
      if (mounted) setConnectedClients(count);
    });

    socket.on('tunnel:status', (st: { status: 'idle' | 'starting' | 'active' | 'error'; url: string; error?: string }) => {
      if (mounted && st?.status) setPublicTunnel(st);
    });

    socket.on('campaign:updated', (next: CampaignState) => {
      if (mounted && next && next.compendium) {
        setCampaign(next);
      }
    });

    socket.on('roll:new', (entry: RollLogEntry) => {
      if (!mounted) return;
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
      setOpportunityPrompt(prompt);
    });

    socket.on('floating:vfx', (vfx: { tokenId: string; amount: number; isHeal: boolean }) => {
      if (!mounted) return;
      const id = `fvfx-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
      setFloatingVfx((prev) => [...prev, { ...vfx, id }]);
      window.setTimeout(() => {
        setFloatingVfx((prev) => prev.filter((x) => x.id !== id));
      }, 1700);
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
      setPendingRequests(list || []);
    });

    socket.on(
      'request:resolved',
      (res: { characterId: string; characterName: string; label: string; approved: boolean }) => {
        if (!mounted) return;
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
  }, [serverUrl, refreshSavedCampaigns]);

  const updateCampaign = useCallback((updater: (prev: CampaignState) => CampaignState) => {
    setCampaign((prev) => {
      const next = updater(prev);
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
      return next;
    });
  }, []);

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
      const res = evaluateFormula(formula, stats, activeChar, { advantageMode });

      let dmgTotal: number | undefined;
      let details = `${res.individualRolls.join(' | ')}`;
      const allRolledDice: RolledDieVisual[] = [...res.rolledDice];

      if (damageFormula) {
        const dmgRes = evaluateFormula(damageFormula, stats, activeChar, {
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
      if (targetToken && formula.toLowerCase().includes('d20')) {
        hitStatus =
          res.isCrit || (!res.isFumble && res.total >= targetToken.defense) ? 'hit' : 'miss';
      }

      sendRoll({
        rollerName:
          rollerName || (roleRef.current === 'gm' ? 'Mestre' : activeChar?.name || myPlayerName),
        rollerRole: roleRef.current,
        rollerColor: roleRef.current === 'gm' ? '#e0b84c' : activeChar?.playerColor || myPlayerColor,
        diceSkin: (activeChar?.diceSkin || 'gold') as DiceSkin,
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
    [advantageMode, myPlayerColor, myPlayerName, secretRoll, sendRoll, targetTokenId]
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
      applyConditionId,
      conditionDurationRounds,
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

      if (costMp && costMp > 0 && char.mp < costMp) {
        showTacticalAlert(
          `${campaignRef.current.settings.resourceName} insuficiente (${char.mp}/${costMp} ${campaignRef.current.settings.resourceShort}).`
        );
        return;
      }

      const targetToken = activeMap?.tokens.find((t) => t.id === targetTokenId);
      const isOffensiveAction = Boolean(attackFormula || (damageFormula && damageType?.toLowerCase() !== 'cura'));

      if (isOffensiveAction && !applyConditionId) {
        const choice: PendingAttackChoice = {
          attackerTokenId: myToken?.id,
          attackerName: char.name,
          attackerColor: char.playerColor || char.tokenColor,
          attackerImageUrl: char.portraitUrl,
          attackerFrame: char.tokenFrameStyle || 'gold',
          attackerCharacterId: char.id,
          diceSkin: char.diceSkin || 'gold',
          actionTitle: title,
          attackFormula,
          damageFormula,
          damageType,
          range,
          actionCost,
          costMp,
        };
        if (activeMap && activeMap.tokens.length > 0) {
          // Always require explicit target selection on map for every new attack
          setTargetTokenId(null);
          setPendingAttackChoice(choice);
          return;
        }
      }

      const stats = computeCharacterStats(char, campaignRef.current);

      updateCampaign((prev) => ({
        ...prev,
        characters: prev.characters.map((c) =>
          c.id === char.id && costMp && costMp > 0 ? { ...c, mp: Math.max(0, c.mp - costMp) } : c
        ),
        combat:
          prev.combat.active && charCb && actionCost !== 'Livre'
            ? {
                ...prev.combat,
                combatants: prev.combat.combatants.map((cb) =>
                  cb.id !== charCb.id
                    ? cb
                    : {
                        ...cb,
                        actionAvailable: actionCost === 'Padrão' ? false : cb.actionAvailable,
                        bonusActionAvailable:
                          actionCost === 'Bônus' ? false : cb.bonusActionAvailable,
                        reactionAvailable:
                          actionCost === 'Reação' ? false : cb.reactionAvailable,
                      }
                ),
              }
            : prev.combat,
      }));

      if (applyConditionId) {
        const condDef = campaignRef.current.compendium.conditions.find(
          (c) => c.id === applyConditionId
        );
        if (condDef) {
          updateCampaign((prev) => {
            const targetCharId =
              targetToken?.type === 'character' ? targetToken.referenceId : char.id;
            return {
              ...prev,
              characters: prev.characters.map((c) => {
                if (c.id !== targetCharId) return c;
                if (c.activeConditionIds.includes(applyConditionId)) return c;
                return { ...c, activeConditionIds: [...c.activeConditionIds, applyConditionId] };
              }),
              combat: prev.combat.active
                ? {
                    ...prev.combat,
                    combatants: prev.combat.combatants.map((cb) => {
                      if (
                        (targetToken && cb.tokenId === targetToken.id) ||
                        (!targetToken && cb.referenceId === char.id)
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
            };
          });
        }
      }

      const combinedExtraBonus = (extraBonus || 0) + (attackFormula ? stats.attackBonusExtra : 0);
      const combinedDice = [
        ...(extraDice || []),
        ...(attackFormula ? stats.attackDiceBonuses : []),
      ];

      const attackRes = attackFormula
        ? evaluateFormula(attackFormula, stats, char, {
            advantageMode,
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
    },
    [advantageMode, secretRoll, sendRoll, targetTokenId, updateCampaign]
  );

  const applyDamage = useCallback(
    (targetTokenIdParam: string, amount: number, isHeal = false, rollId?: string) => {
      if (socketRef.current?.connected) {
        socketRef.current.emit('combat:apply-damage', {
          targetTokenId: targetTokenIdParam,
          amount,
          isHeal,
          rollId,
        });
      } else {
        const delta = isHeal ? Math.abs(amount) : -Math.abs(amount);
        updateCampaign((prev) => ({
          ...prev,
          maps: prev.maps.map((m) => ({
            ...m,
            tokens: m.tokens.map((t) =>
              t.id === targetTokenIdParam
                ? { ...t, hp: Math.max(0, Math.min(t.maxHp, t.hp + delta)) }
                : t
            ),
          })),
          rollLog: rollId
            ? prev.rollLog.map((r) => (r.id === rollId ? { ...r, applied: true } : r))
            : prev.rollLog,
        }));
      }
    },
    [updateCampaign]
  );

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
        color: roleRef.current === 'gm' ? '#e0b84c' : char?.playerColor || myPlayerColor,
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
      setMyPlayerName(params.playerName.trim() || 'Aventureiro');
      setMyPlayerColorState(params.playerColor);
      localStorage.setItem('rpg_player_color', params.playerColor);
      setRole('player');
      setServerUrl(params.targetServerUrl);
      const base = params.targetServerUrl.trim().replace(/\/+$/, '');
      try {
        const res = await fetch(`${base}/api/campaign`);
        if (res.ok) {
          const data = (await res.json()) as CampaignState;
          setCampaign(data);
        }
      } catch {
        // socket will sync once connected
      }
      setInLobby(false);
    },
    [setMyPlayerName, setRole, setServerUrl]
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
        campaignRef.current.characters.find((c) => c.id === activeCharRef.current) ||
        campaignRef.current.characters[0];
      if (!char) return;
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
    setOpportunityPrompt(prompt);
    if (socketRef.current?.connected) {
      socketRef.current.emit('opportunity:prompt', prompt);
    }
  }, []);

  const performCombatManeuver = useCallback(
    (maneuver: 'dash' | 'disengage' | 'dodge' | 'action-surge') => {
      const char =
        roleRef.current === 'player'
          ? campaignRef.current.characters.find((c) => c.ownerPlayerId === myPlayerId) ||
            campaignRef.current.characters.find((c) => c.id === activeCharRef.current)
          : campaignRef.current.characters.find((c) => c.id === activeCharRef.current) ||
            campaignRef.current.characters[0];

      const combat = campaignRef.current.combat;
      if (!combat.active) {
        showTacticalAlert('As manobras de combate (Disparada, Desengajar, Esquivar) ficam ativas durante o combate.');
        return;
      }

      const activeTurnCb = combat.combatants[combat.currentTurnIndex];
      const targetCb =
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

      // 2. Self-Attack Guard (prevent attacking own token unless healing)
      const isHealingAction = choice.damageType?.toLowerCase() === 'cura';
      const isSelfTarget =
        (attackerToken && attackerToken.id === defenderToken.id) ||
        Boolean(
          choice.attackerCharacterId &&
            defenderToken.type === 'character' &&
            defenderToken.referenceId === choice.attackerCharacterId
        );
      if (isSelfTarget && !isHealingAction) {
        showTacticalAlert('Você não pode atacar a si mesmo! Clique em um inimigo no mapa.');
        return;
      }

      // 3. Range Validation (D&D Melee 1.5m vs Ranged Xm)
      if (attackerToken && attackerToken.id !== defenderToken.id) {
        const maxRangeMeters = parseAttackRangeMeters(choice.range, choice.actionTitle);
        const { meters: distMeters } = getGridSpanDistance(
          attackerToken.x,
          attackerToken.y,
          attackerToken.size,
          defenderToken.x,
          defenderToken.y,
          defenderToken.size,
          currCampaign.settings.gridSquareMeters || 1.5
        );
        if (distMeters > maxRangeMeters + 0.05) {
          showTacticalAlert(
            `Alvo fora de alcance! ${defenderToken.name} está a ${distMeters}m, mas "${choice.actionTitle}" alcança até ${maxRangeMeters}m.`
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

      if (choice.costMp && choice.costMp > 0 && char && char.mp < choice.costMp) {
        showTacticalAlert(
          `${currCampaign.settings.resourceName} insuficiente (${char.mp}/${choice.costMp}).`
        );
        return;
      }

      setPendingAttackChoice(null);
      setTargetTokenId(null);
      if (actionCost === 'Reação') {
        triggerOpportunityPrompt(null);
      }

      const stats = char ? computeCharacterStats(char, currCampaign) : undefined;

      updateCampaign((prev) => ({
        ...prev,
        characters: prev.characters.map((c) =>
          choice.costMp && choice.costMp > 0 && char && c.id === char.id
            ? { ...c, mp: Math.max(0, c.mp - choice.costMp) }
            : c
        ),
        combat:
          prev.combat.active && attackerCb && actionCost !== 'Livre'
            ? {
                ...prev.combat,
                combatants: prev.combat.combatants.map((cb) =>
                  cb.id !== attackerCb.id
                    ? cb
                    : {
                        ...cb,
                        actionAvailable: actionCost === 'Padrão' ? false : cb.actionAvailable,
                        bonusActionAvailable:
                          actionCost === 'Bônus' ? false : cb.bonusActionAvailable,
                        reactionAvailable:
                          actionCost === 'Reação' ? false : cb.reactionAvailable,
                      }
                ),
              }
            : prev.combat,
      }));

      // If defender used Esquivar (Dodge), impose disadvantage unless attacker already had advantage (cancel to normal)
      const effectiveAdvMode: RollAdvantageMode = defenderCb?.dodging
        ? advantageMode === 'advantage'
          ? 'normal'
          : 'disadvantage'
        : advantageMode;

      const hasAttackRoll = Boolean(choice.attackFormula && choice.attackFormula.trim());
      const attackRes = hasAttackRoll
        ? evaluateFormula(choice.attackFormula!, stats, char, {
            advantageMode: effectiveAdvMode,
            extraFlatBonus: stats?.attackBonusExtra,
            extraDiceBonuses: stats?.attackDiceBonuses,
          })
        : null;

      const hitSuccess = !attackRes
        ? true
        : attackRes.isCrit || (!attackRes.isFumble && attackRes.total >= defenderToken.defense);

      const duel: CombatDuelState = {
        id: `duel-${Date.now()}`,
        attackerName: choice.attackerName,
        attackerColor: choice.attackerColor,
        attackerImageUrl: choice.attackerImageUrl,
        attackerFrame: choice.attackerFrame,
        defenderTokenId: defenderToken.id,
        defenderName: defenderToken.name,
        defenderColor: defenderToken.color,
        defenderImageUrl: defenderToken.imageUrl,
        defenderFrame: defenderToken.frameStyle,
        defenderDefense: defenderToken.defense,
        defenderHpBefore: defenderToken.hp,
        defenderMaxHp: defenderToken.maxHp,
        actionTitle: choice.actionTitle,
        diceSkin: choice.diceSkin,
        attackFormula: attackRes?.resolvedFormula,
        attackRolledDice: attackRes?.rolledDice || [],
        attackTotal: attackRes?.total,
        d20Natural: attackRes?.d20Natural,
        isCrit: attackRes?.isCrit || false,
        isFumble: attackRes?.isFumble || false,
        hitSuccess,
        damageFormula: choice.damageFormula,
        damageType: choice.damageType,
        phase: hasAttackRoll ? 'rolling-attack' : 'rolling-damage',
      };

      activeDuelRef.current = duel;
      emitDuelState(duel);
      soundEngine.playSfxPreset('dice');

      if (attackRes) {
        sendRoll({
          rollerName: choice.attackerName,
          rollerRole: roleRef.current,
          rollerColor: choice.attackerColor,
          diceSkin: choice.diceSkin,
          title: `${choice.actionTitle} → ${defenderToken.name}`,
          formula: attackRes.resolvedFormula,
          individualRolls: attackRes.individualRolls,
          rolledDice: attackRes.rolledDice,
          d20Natural: attackRes.d20Natural,
          total: attackRes.total,
          isCrit: attackRes.isCrit,
          isFumble: attackRes.isFumble,
          targetName: defenderToken.name,
          targetTokenId: defenderToken.id,
          targetDefense: defenderToken.defense,
          hitStatus: hitSuccess ? 'hit' : 'miss',
          isSecret: false,
          details: hitSuccess
            ? `ACERTOU! (${attackRes.total} vs CA ${defenderToken.defense})`
            : `BLOQUEADO! (${attackRes.total} vs CA ${defenderToken.defense})`,
        });

        window.setTimeout(() => {
          setActiveDuel((curr) =>
            curr && curr.id === duel.id ? { ...curr, phase: 'attack-result' } : curr
          );
          if (!hitSuccess) {
            triggerSlashVfx(defenderToken.id, 'block');
          } else {
            soundEngine.playSfxPreset('sword');
          }
        }, 680);
      } else if (choice.damageFormula) {
        // Direct spell/heal without d20 attack roll: roll damage directly!
        const isHealing = choice.damageType?.toLowerCase() === 'cura';
        const dmgRes = evaluateFormula(choice.damageFormula, stats, char);
        const dmgTotal = Math.max(1, dmgRes.total);
        const dmgDuel: CombatDuelState = {
          ...duel,
          damageRolledDice: dmgRes.rolledDice,
          damageTotal: dmgTotal,
          phase: 'rolling-damage',
        };
        emitDuelState(dmgDuel);

        window.setTimeout(() => {
          setActiveDuel((curr) =>
            curr && curr.id === dmgDuel.id
              ? { ...curr, phase: 'damage-result', damageApplied: true }
              : curr
          );
          applyDamage(defenderToken.id, dmgTotal, isHealing);
          triggerSlashVfx(defenderToken.id, isHealing ? 'heal' : 'hit');
          soundEngine.playSfxPreset(isHealing ? 'heal' : 'fireball');
        }, 680);
      }
    },
    [advantageMode, applyDamage, emitDuelState, sendRoll, showTacticalAlert, triggerOpportunityPrompt, triggerSlashVfx, updateCampaign]
  );

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
      phase: 'rolling-damage',
    };
    emitDuelState(nextDuel);
    soundEngine.playSfxPreset('dice');

    window.setTimeout(() => {
      setActiveDuel((curr) =>
        curr && curr.id === nextDuel.id
          ? { ...curr, phase: 'damage-result', damageApplied: true }
          : curr
      );
      applyDamage(duel.defenderTokenId, dmgTotal, isHealing);
      triggerSlashVfx(duel.defenderTokenId, isHealing ? 'heal' : 'hit');
      soundEngine.playSfxPreset(isHealing ? 'heal' : duel.damageType?.toLowerCase().includes('fogo') ? 'fireball' : 'sword');

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
        details: `${dmgTotal} de ${duel.damageType || 'Dano'} aplicado automaticamente em ${duel.defenderName}!`,
        applied: true,
      });
    }, 680);
  }, [applyDamage, emitDuelState, sendRoll, triggerSlashVfx]);

  const advanceDuelPhase = useCallback((phase: CombatDuelState['phase']) => {
    setActiveDuel((curr) => (curr ? { ...curr, phase } : null));
  }, []);

  const dismissDuel = useCallback(() => {
    emitDuelState(null);
    setTargetTokenId(null);
  }, [emitDuelState]);

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
      const res = evaluateFormula('1d20', stats, char, {
        advantageMode: hasAid ? 'advantage' : 'normal',
      });
      const nat = res.d20Natural ?? res.total;

      let nextSucc = prevDs.successes || 0;
      let nextFail = prevDs.failures || 0;
      let nextHp = char.hp;
      let nextStabilized = false;
      let nextDead = false;
      let msg = '';

      if (nat === 20) {
        nextHp = 1;
        nextSucc = 0;
        nextFail = 0;
        msg = '20 NATURAL! Levantou consciente com 1 PV!';
      } else if (nat === 1) {
        nextFail = Math.min(3, nextFail + 2);
        nextDead = nextFail >= 3;
        msg = nextDead
          ? '1 NATURAL! Duas falhas — O herói sucumbiu nos Portões da Morte (3/3 Falhas)!'
          : `1 NATURAL! Duas falhas nos Portões da Morte (${nextFail}/3).`;
      } else if (nat >= 10) {
        nextSucc = Math.min(3, nextSucc + 1);
        nextStabilized = nextSucc >= 3;
        msg = nextStabilized
          ? '3º Sucesso! Personagem ESTABILIZADO (0 PV, fora de perigo).'
          : `Sucesso contra a Morte (${nextSucc}/3).`;
      } else {
        nextFail = Math.min(3, nextFail + 1);
        nextDead = nextFail >= 3;
        msg = nextDead
          ? `3ª Falha (${nat}) — O personagem MORREU!`
          : `Falha contra a Morte (${nextFail}/3).`;
      }

      updateCampaign((prev) => ({
        ...prev,
        characters: prev.characters.map((c) =>
          c.id !== char.id
            ? c
            : {
                ...c,
                hp: nextHp,
                deathSaves: {
                  successes: nextSucc,
                  failures: nextFail,
                  stabilized: nextStabilized,
                  dead: nextDead,
                  assistedBy: undefined,
                },
              }
        ),
        maps:
          nextHp > 0
            ? prev.maps.map((m) => ({
                ...m,
                tokens: m.tokens.map((t) =>
                  t.type === 'character' && t.referenceId === char.id
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
                  cb.type === 'character' && cb.referenceId === char.id
                    ? { ...cb, hp: nextHp }
                    : cb
                ),
              }
            : prev.combat,
      }));

      const activeMap = camp.maps.find((m) => m.id === camp.activeMapId);
      const charTok = activeMap?.tokens.find(
        (t) => t.type === 'character' && t.referenceId === char.id
      );
      if (nat === 20 || nextStabilized) {
        soundEngine.playSfxPreset('heal');
        if (charTok) triggerSlashVfx(charTok.id, 'heal');
      }

      sendRoll({
        rollerName: char.name,
        rollerRole: roleRef.current,
        rollerColor: char.playerColor || char.tokenColor,
        diceSkin: char.diceSkin || 'blood',
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
    [sendRoll, showTacticalAlert, triggerSlashVfx, updateCampaign]
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

      updateCampaign((prev) => ({
        ...prev,
        characters: prev.characters.map((c) => {
          if (c.id !== target.id) return c;
          if (isCritWake) {
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
          if (stabilizedNow) {
            return {
              ...c,
              deathSaves: {
                ...(c.deathSaves || { successes: 0, failures: 0 }),
                successes: 3,
                stabilized: true,
                dead: false,
                assistedBy: helper.name,
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
        maps: isCritWake
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
            if (isCritWake && cb.type === 'character' && cb.referenceId === target.id) {
              return { ...cb, hp: 1 };
            }
            if (prev.combat.active && cb.referenceId === helper.id) {
              return { ...cb, actionAvailable: false };
            }
            return cb;
          }),
        },
      }));

      if (isCritWake || stabilizedNow) {
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
            ? `SUCESSO (${res.total} vs CD 10)! ${helper.name} estabilizou ${target.name} nos Portões da Morte!`
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
        mode === 'stabilize'
          ? 0
          : mode === 'revive-1'
            ? 1
            : stats.maxHp;

      const nextDeathSaves =
        mode === 'stabilize'
          ? {
              successes: 3,
              failures: 0,
              stabilized: true,
              dead: false,
              assistedBy: undefined,
            }
          : {
              successes: 0,
              failures: 0,
              stabilized: false,
              dead: false,
              assistedBy: undefined,
            };

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

  useEffect(() => {
    startDuelRef.current = startCombatDuel;
  }, [startCombatDuel]);

  return (
    <CampaignContext.Provider
      value={{
        campaign,
        savedCampaigns,
        refreshSavedCampaigns,
        inLobby,
        setInLobby,
        loading,
        isConnected,
        connectedClients,
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
        triggerOpportunityPrompt,
        performCombatManeuver,
        activeDuel,
        startCombatDuel,
        rollDuelDamage,
        advanceDuelPhase,
        dismissDuel,
        initiativeCeremony,
        showInitiativeCeremony,
        createNewCampaign,
        loadSavedCampaign,
        deleteSavedCampaign,
        enterTableAsPlayer,
        updateCampaign,
        deleteCharacter,
        rollDeathSave,
        assistDeathSave,
        gmResolveDeathSave,
        sendRoll,
        quickRollFormula,
        rollCharacterAction,
        applyDamage,
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
