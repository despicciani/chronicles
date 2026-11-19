import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Crown,
  Download,
  Globe,
  Image as ImageIcon,
  Moon,
  Plus,
  RefreshCw,
  Shield,
  Sparkles,
  Sun,
  Swords,
  Trash2,
  Upload,
  Wifi,
} from 'lucide-react';
import { triggerHeroJsonDownload, useCampaign } from '../context/CampaignContext';
import {
  decodeRoomCode,
  parseHeroPayloadFromJson,
  pickRandomPlayerColor,
  PLAYER_COLOR_PALETTE,
} from '../shared/rulesEngine';
import { FileUploadButton } from './FileUploadButton';
import { OrnateDivider, OrnateFrame } from './OrnateFrame';
import { TokenPortrait } from './TokenPortrait';

interface TitleScene {
  src: string;
  label: string;
  isPixelArt: boolean;
  objectPosition: string;
}

const TITLE_SCENES: TitleScene[] = [
  {
    src: '/title-bg/scene-1.jpg',
    label: 'Estalagem do Vale',
    isPixelArt: false,
    objectPosition: 'center center',
  },
  {
    src: '/title-bg/scene-2.jpg',
    label: 'Vila das Cascatas',
    isPixelArt: true,
    objectPosition: 'center center',
  },
  {
    src: '/title-bg/scene-3.jpg',
    label: 'Bosque Ancestral',
    isPixelArt: false,
    objectPosition: '60% center',
  },
  {
    src: '/title-bg/scene-4.jpg',
    label: 'Cidadela das Montanhas',
    isPixelArt: false,
    objectPosition: '65% center',
  },
  {
    src: '/title-bg/scene-5.jpg',
    label: 'Mirante do Crepúsculo',
    isPixelArt: true,
    objectPosition: 'center center',
  },
  {
    src: '/title-bg/scene-6.jpg',
    label: 'Fortaleza do Penhasco',
    isPixelArt: false,
    objectPosition: '68% center',
  },
];

interface DiscoveredRoom {
  url: string;
  roomCode: string;
  campaignName: string;
  gmName: string;
  coverUrl: string;
  characterCount: number;
  isLocal: boolean;
}

export const LobbyScreen: React.FC = () => {
  const {
    campaign,
    savedCampaigns,
    refreshSavedCampaigns,
    savedHeroes,
    refreshSavedHeroes,
    saveCharacterToVault,
    deleteSavedHero,
    importSavedHeroIntoCampaign,
    isRemoteTunnelSession,
    createNewCampaign,
    loadSavedCampaign,
    deleteSavedCampaign,
    enterTableAsPlayer,
    myPlayerName,
    myPlayerColor,
    theme,
    setTheme,
    resolveAssetUrl,
  } = useCampaign();

  // Top-level screen flow: 'title' -> 'player' or 'gm'
  const [screen, setScreen] = useState<'title' | 'player' | 'gm'>('title');
  const [sceneIndex, setSceneIndex] = useState<number>(() =>
    Math.floor(Math.random() * TITLE_SCENES.length),
  );
  const currentScene = TITLE_SCENES[sceneIndex] || TITLE_SCENES[0];
  const cycleScene = () => {
    setSceneIndex((prev) => (prev + 1) % TITLE_SCENES.length);
  };
  const [gmTab, setGmTab] = useState<'continue' | 'create' | 'heroes'>('continue');
  const heroUploadRef = useRef<HTMLInputElement | null>(null);
  const [heroVaultToast, setHeroVaultToast] = useState<string | null>(null);

  // Create Campaign State (GM)
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newGmName, setNewGmName] = useState('Mestre');
  const [newCoverUrl, setNewCoverUrl] = useState('');
  const [attrBudget, setAttrBudget] = useState(15);
  const [maxSkills, setMaxSkills] = useState(4);
  const [creating, setCreating] = useState(false);

  // Join Campaign State (Player)
  const [playerNameInput, setPlayerNameInput] = useState(myPlayerName || '');
  const [playerColorInput, setPlayerColorInput] = useState(myPlayerColor);
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [rooms, setRooms] = useState<DiscoveredRoom[]>([]);
  const [scanning, setScanning] = useState(false);
  const [joinError, setJoinError] = useState('');

  const scanRooms = useCallback(async () => {
    setScanning(true);
    try {
      const res = await fetch('/api/discover-rooms');
      if (res.ok) {
        const data = (await res.json()) as { rooms: DiscoveredRoom[] };
        setRooms(data.rooms || []);
      }
    } catch {
      // ignore
    } finally {
      setScanning(false);
    }
  }, []);

  useEffect(() => {
    refreshSavedCampaigns();
    refreshSavedHeroes();
    scanRooms();
  }, [refreshSavedCampaigns, refreshSavedHeroes, scanRooms]);

  const handleImportHeroFileToVault = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const hero = parseHeroPayloadFromJson(parsed, campaign);
        if (!hero) {
          window.alert('Arquivo de herói inválido. Selecione um .hero.json exportado pelo CHRONICLES.');
          return;
        }
        await saveCharacterToVault(hero);
        setHeroVaultToast(`${hero.name} salvo no Cofre de Heróis!`);
        window.setTimeout(() => setHeroVaultToast(null), 3000);
      } catch {
        window.alert('Não foi possível ler este arquivo de personagem.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await createNewCampaign({
        name: newName.trim(),
        description: newDesc.trim(),
        coverUrl: newCoverUrl,
        gmName: newGmName.trim() || 'Mestre',
        attributePointBudget: attrBudget,
        maxTrainedSkills: maxSkills,
      });
    } finally {
      setCreating(false);
    }
  };

  const handleJoinUrl = async (targetUrl: string) => {
    setJoinError('');
    if (!playerNameInput.trim()) {
      setJoinError('Por favor, informe o seu nome antes de entrar na mesa.');
      return;
    }
    await enterTableAsPlayer({
      targetServerUrl: targetUrl,
      playerName: playerNameInput.trim(),
      playerColor: playerColorInput,
    });
  };

  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const decoded = decodeRoomCode(roomCodeInput);
    if (!decoded) {
      setJoinError('Código ou endereço inválido. Peça o código da sala para o seu Mestre.');
      return;
    }
    await handleJoinUrl(decoded);
  };

  return (
    <div className="h-screen w-screen relative overflow-y-auto flex flex-col bg-[#08090e]">
      {/* Full-bleed Random Curated Artwork Backdrop */}
      <div className="fixed inset-0 z-0 pointer-events-none select-none overflow-hidden">
        <img
          src={currentScene.src}
          alt={currentScene.label}
          className={`w-full h-full object-cover ${currentScene.isPixelArt ? 'pixel-art-scene' : ''}`}
          style={{ objectPosition: currentScene.objectPosition }}
          draggable={false}
        />

        {screen === 'title' ? (
          <>
            {/* Directional left scrim so 75% of the artwork stays vivid & unobstructed */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(90deg, rgba(7,8,13,0.92) 0%, rgba(7,8,13,0.74) 26%, rgba(7,8,13,0.22) 54%, rgba(7,8,13,0.04) 100%)',
              }}
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(0deg, rgba(7,8,13,0.58) 0%, rgba(7,8,13,0.12) 22%, transparent 45%)',
              }}
            />
          </>
        ) : (
          <div className="absolute inset-0 bg-[#07080d]/82 backdrop-blur-[2px]" />
        )}
      </div>

      {/* Top Navigation Bar (Only shown on GM/Player subscreens so the Title artwork stays clean) */}
      {screen !== 'title' && (
        <div className="relative z-10 flex items-center justify-between px-6 py-4">
          <button
            onClick={() => setScreen('title')}
            className="rpg-glass-panel px-3.5 py-2 rounded-md text-xs font-display font-bold flex items-center gap-1.5 cursor-pointer hover:brightness-110 transition"
          >
            <ArrowLeft className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
            <span>Voltar ao Início</span>
          </button>

          <button
            onClick={() => setTheme(theme === 'dark-fantasy' ? 'bright-fantasy' : 'dark-fantasy')}
            className="rpg-glass-panel px-3.5 py-2 rounded-md text-xs font-display font-semibold flex items-center gap-2 cursor-pointer"
          >
            {theme === 'dark-fantasy' ? (
              <>
                <Moon className="w-4 h-4 text-amber-400" />
                <span>Dark Fantasy</span>
              </>
            ) : (
              <>
                <Sun className="w-4 h-4 text-amber-600" />
                <span>Bright Fantasy</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* =========================================================
          SCREEN 1: LEFT-ANCHORED GAME TITLE SCREEN ("CHRONICLES")
         ========================================================= */}
      {screen === 'title' && (
        <div className="relative z-10 flex-1 flex flex-col justify-between min-h-screen px-8 sm:px-14 md:px-20 py-10">
          {/* Top spacer for balanced vertical anchoring */}
          <div className="h-4" />

          {/* Main Left Menu Column */}
          <div className="max-w-md w-full space-y-8 animate-ui-enter">
            {/* Wordmark & Minimalist Subtitle */}
            <div className="space-y-3">
              <div className="text-[11px] font-display font-semibold uppercase tracking-[0.34em] text-amber-200/80 drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)]">
                Mesa Tática de RPG
              </div>
              <h1
                className="font-chronicle font-black text-5xl sm:text-6xl md:text-[68px] leading-none tracking-[0.09em] select-none"
                style={{
                  color: '#f5ebd1',
                  textShadow: '0 4px 20px rgba(0,0,0,0.92), 0 1px 0 rgba(0,0,0,0.95)',
                }}
              >
                CHRONICLES
              </h1>
              <div className="w-28 h-[2px] bg-gradient-to-r from-[#d4aa48] via-[#d4aa48]/60 to-transparent" />
            </div>

            {/* Online Tunnel Status Banner (Only when joining via remote link) */}
            {isRemoteTunnelSession && (
              <div className="bg-[#0b0d14]/88 border border-emerald-500/45 rounded-md px-4 py-3 flex items-center justify-between gap-3 backdrop-blur-xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Globe className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-widest font-display font-bold text-emerald-300">
                      Mesa Online Conectada
                    </div>
                    <div className="font-display font-bold text-xs text-amber-100 truncate">
                      {campaign.name} — {campaign.gmName || 'Mestre'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Clean Vertical Game Menu */}
            <nav className="flex flex-col gap-2.5 max-w-[320px]">
              {!isRemoteTunnelSession && (
                <button
                  onClick={() => setScreen('gm')}
                  className="group relative w-full text-left px-4 py-3.5 rounded-sm bg-[#0c0e15]/78 hover:bg-[#151824]/92 border border-amber-500/30 hover:border-amber-400/75 transition-all duration-150 cursor-pointer flex items-center justify-between gap-3 shadow-[0_6px_22px_rgba(0,0,0,0.55)] backdrop-blur-xs"
                >
                  <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-amber-400/45 group-hover:bg-amber-400 transition-colors" />
                  <div className="flex items-center gap-3.5 min-w-0 pl-1">
                    <Crown className="w-5 h-5 text-amber-400/90 group-hover:text-amber-300 shrink-0 transition-colors" />
                    <div className="min-w-0">
                      <div className="font-display font-bold text-sm tracking-[0.12em] text-[#f6eedc] group-hover:text-amber-200 transition-colors">
                        SOU MESTRE
                      </div>
                      <div className="text-[11px] text-[#b4ab97] truncate">
                        Criar ou comandar campanhas
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-amber-400/60 group-hover:text-amber-300 group-hover:translate-x-0.5 transition-all shrink-0" />
                </button>
              )}

              <button
                onClick={() => {
                  setScreen('player');
                  scanRooms();
                }}
                className="group relative w-full text-left px-4 py-3.5 rounded-sm bg-[#0c0e15]/78 hover:bg-[#151824]/92 border border-slate-400/28 hover:border-sky-300/70 transition-all duration-150 cursor-pointer flex items-center justify-between gap-3 shadow-[0_6px_22px_rgba(0,0,0,0.55)] backdrop-blur-xs"
              >
                <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-sky-300/40 group-hover:bg-sky-300 transition-colors" />
                <div className="flex items-center gap-3.5 min-w-0 pl-1">
                  <Swords className="w-5 h-5 text-sky-300/85 group-hover:text-sky-200 shrink-0 transition-colors" />
                  <div className="min-w-0">
                    <div className="font-display font-bold text-sm tracking-[0.12em] text-[#f6eedc] group-hover:text-sky-100 transition-colors">
                      SOU JOGADOR
                    </div>
                    <div className="text-[11px] text-[#b4ab97] truncate">
                      {isRemoteTunnelSession ? 'Entrar nesta mesa online' : 'Conectar em uma mesa ativa'}
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-sky-300/55 group-hover:text-sky-200 group-hover:translate-x-0.5 transition-all shrink-0" />
              </button>
            </nav>
          </div>

          {/* Quiet Footer Bar: Version Left + Subtle Scene/Theme Controls Right */}
          <div className="flex items-center justify-between gap-4 pt-6">
            <div className="text-[11px] font-mono-dice tracking-wider text-[#d4cbb8]/75 drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]">
              CHRONICLES • LOCAL & ONLINE
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={cycleScene}
                title={`Cenário: ${currentScene.label} — clique para trocar`}
                className="px-2.5 py-1.5 rounded-sm bg-[#0a0c12]/72 hover:bg-[#141724]/90 border border-white/15 hover:border-amber-400/50 text-[11px] font-display text-[#e6dec9] flex items-center gap-1.5 cursor-pointer transition backdrop-blur-xs"
              >
                <ImageIcon className="w-3.5 h-3.5 text-amber-300/90" />
                <span className="hidden sm:inline">{currentScene.label}</span>
              </button>

              <button
                type="button"
                onClick={() => setTheme(theme === 'dark-fantasy' ? 'bright-fantasy' : 'dark-fantasy')}
                title="Alternar tema da mesa (Dark / Bright Fantasy)"
                className="px-2.5 py-1.5 rounded-sm bg-[#0a0c12]/72 hover:bg-[#141724]/90 border border-white/15 hover:border-amber-400/50 text-[11px] font-display text-[#e6dec9] flex items-center gap-1.5 cursor-pointer transition backdrop-blur-xs"
              >
                {theme === 'dark-fantasy' ? (
                  <>
                    <Moon className="w-3.5 h-3.5 text-amber-400" />
                    <span className="hidden sm:inline">Dark</span>
                  </>
                ) : (
                  <>
                    <Sun className="w-3.5 h-3.5 text-amber-300" />
                    <span className="hidden sm:inline">Bright</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          SCREEN 2: GM HUB (CONTINUE OR CREATE CAMPAIGN)
         ========================================================= */}
      {screen === 'gm' && (
        <div className="relative z-10 flex-1 max-w-6xl w-full mx-auto px-6 pb-10 space-y-5 animate-ui-enter">
          <div className="text-center space-y-1">
            <h2 className="font-chronicle font-bold text-3xl chronicle-gold-text">
              Santuário do Mestre
            </h2>
            <p className="font-lore text-lg" style={{ color: 'var(--text-secondary)' }}>
              Continue uma crônica salva neste computador ou forje uma nova campanha.
            </p>
          </div>

          <div className="flex items-center justify-center flex-wrap gap-3">
            <button
              onClick={() => setGmTab('continue')}
              className={`px-5 py-2.5 rounded-md text-xs font-display font-bold flex items-center gap-2 cursor-pointer transition ${
                gmTab === 'continue' ? 'rpg-btn-primary' : 'rpg-glass-panel opacity-75 hover:opacity-100'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>Continuar Campanha ({savedCampaigns.length})</span>
            </button>
            <button
              onClick={() => setGmTab('create')}
              className={`px-5 py-2.5 rounded-md text-xs font-display font-bold flex items-center gap-2 cursor-pointer transition ${
                gmTab === 'create' ? 'rpg-btn-crimson' : 'rpg-glass-panel opacity-75 hover:opacity-100'
              }`}
            >
              <Plus className="w-4 h-4" />
              <span>Criar Nova Campanha</span>
            </button>
            <button
              onClick={() => setGmTab('heroes')}
              className={`px-5 py-2.5 rounded-md text-xs font-display font-bold flex items-center gap-2 cursor-pointer transition ${
                gmTab === 'heroes' ? 'rpg-btn-primary' : 'rpg-glass-panel opacity-75 hover:opacity-100'
              }`}
            >
              <Swords className="w-4 h-4" />
              <span>Cofre de Heróis ({savedHeroes.length})</span>
            </button>
          </div>

          {gmTab === 'continue' && (
            <OrnateFrame className="rpg-glass-panel rounded-2xl p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {savedCampaigns.map((camp) => (
                  <div
                    key={camp.id}
                    className="rpg-card rounded-xl overflow-hidden flex flex-col border hover:border-amber-400/70 transition group"
                  >
                    <div
                      className="h-40 relative flex items-end p-3.5 bg-cover bg-center"
                      style={{
                        backgroundImage: camp.coverUrl
                          ? `linear-gradient(to top, rgba(0,0,0,0.9), rgba(0,0,0,0.2)), url(${resolveAssetUrl(camp.coverUrl)})`
                          : 'radial-gradient(circle at 30% 30%, #3b2a14, #10121c)',
                      }}
                    >
                      <div className="min-w-0">
                        <div className="text-[10px] uppercase tracking-widest text-amber-300 font-bold">
                          Mestre: {camp.gmName}
                        </div>
                        <h4 className="font-display font-bold text-base text-white truncate">
                          {camp.name}
                        </h4>
                      </div>
                    </div>
                    <div className="p-4 flex-1 flex flex-col justify-between gap-3 text-xs">
                      <p className="font-lore text-base line-clamp-3 leading-snug" style={{ color: 'var(--text-secondary)' }}>
                        {camp.description || 'Sem descrição cadastrada.'}
                      </p>
                      <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                        <span style={{ color: 'var(--text-muted)' }}>
                          {camp.characterCount} {camp.characterCount === 1 ? 'herói' : 'heróis'}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {savedCampaigns.length > 1 && (
                            <button
                              onClick={() => {
                                if (window.confirm(`Excluir a campanha "${camp.name}"?`)) {
                                  deleteSavedCampaign(camp.id);
                                }
                              }}
                              className="p-1.5 rounded text-red-400 hover:bg-red-500/15 cursor-pointer"
                              title="Excluir campanha salva"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => loadSavedCampaign(camp.id)}
                            className="rpg-btn-primary px-4 py-1.5 rounded-lg text-xs cursor-pointer"
                          >
                            Continuar Mesa
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </OrnateFrame>
          )}

          {gmTab === 'create' && (
            <OrnateFrame className="rpg-glass-panel rounded-2xl p-6 max-w-4xl w-full mx-auto">
              <form onSubmit={handleCreateSubmit} className="space-y-5 text-xs">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
                  <div className="md:col-span-5 space-y-2.5">
                    <label className="font-display font-bold block">Foto / Capa da Campanha</label>
                    <div
                      className="h-48 rounded-xl border flex flex-col items-center justify-center p-4 text-center bg-cover bg-center"
                      style={{
                        borderColor: 'var(--border-ornate)',
                        backgroundImage: newCoverUrl
                          ? `linear-gradient(rgba(0,0,0,0.25), rgba(0,0,0,0.6)), url(${resolveAssetUrl(newCoverUrl)})`
                          : 'radial-gradient(circle, #2a2216, #0b0d14)',
                      }}
                    >
                      {!newCoverUrl && (
                        <span className="font-lore italic text-base text-amber-200/75">
                          Escolha uma arte do seu computador para estampar sua crônica
                        </span>
                      )}
                    </div>
                    <FileUploadButton
                      accept="image/*"
                      label="Escolher Foto do PC"
                      onUploaded={(url) => setNewCoverUrl(url)}
                      className="w-full justify-center"
                    />
                  </div>

                  <div className="md:col-span-7 space-y-3">
                    <div>
                      <label className="font-display font-bold block mb-1">Nome da Campanha *</label>
                      <input
                        required
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="Ex: As Cinzas de Valdris"
                        className="rpg-input w-full text-sm font-display font-bold"
                      />
                    </div>
                    <div>
                      <label className="font-display font-bold block mb-1">Seu Nome (Mestre)</label>
                      <input
                        value={newGmName}
                        onChange={(e) => setNewGmName(e.target.value)}
                        placeholder="Ex: Gabriel"
                        className="rpg-input w-full"
                      />
                    </div>
                    <div>
                      <label className="font-display font-bold block mb-1">Descrição / Sinopse</label>
                      <textarea
                        rows={3}
                        value={newDesc}
                        onChange={(e) => setNewDesc(e.target.value)}
                        placeholder="Conte aos jogadores o clima e o objetivo inicial da aventura..."
                        className="rpg-input w-full"
                      />
                    </div>

                    {/* GM Character Creation Rules */}
                    <div className="rpg-card rounded-xl p-3.5 space-y-2.5">
                      <div className="font-display font-bold text-xs flex items-center gap-1.5" style={{ color: 'var(--accent-primary)' }}>
                        <Sparkles className="w-3.5 h-3.5" />
                        Regras de Criação de Personagem dos Jogadores
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block mb-1 font-semibold">
                            Pontos para Atributos (acima de 10)
                          </label>
                          <div className="flex items-center gap-1.5">
                            {[10, 12, 15, 20].map((v) => (
                              <button
                                key={v}
                                type="button"
                                onClick={() => setAttrBudget(v)}
                                className={`px-2 py-1 rounded text-[11px] font-bold cursor-pointer ${
                                  attrBudget === v ? 'rpg-btn-primary' : 'rpg-card'
                                }`}
                              >
                                {v}
                              </button>
                            ))}
                            <input
                              type="number"
                              min={0}
                              max={60}
                              value={attrBudget}
                              onChange={(e) => setAttrBudget(Math.max(0, Number(e.target.value)))}
                              className="rpg-input w-14 text-center py-1"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block mb-1 font-semibold">
                            Quantidade de Perícias por Herói
                          </label>
                          <div className="flex items-center gap-1.5">
                            {[2, 4, 6, 8].map((v) => (
                              <button
                                key={v}
                                type="button"
                                onClick={() => setMaxSkills(v)}
                                className={`px-2 py-1 rounded text-[11px] font-bold cursor-pointer ${
                                  maxSkills === v ? 'rpg-btn-primary' : 'rpg-card'
                                }`}
                              >
                                {v}
                              </button>
                            ))}
                            <input
                              type="number"
                              min={0}
                              max={22}
                              value={maxSkills}
                              onChange={(e) => setMaxSkills(Math.max(0, Number(e.target.value)))}
                              className="rpg-input w-14 text-center py-1"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <OrnateDivider />

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={creating || !newName.trim()}
                    className="rpg-btn-crimson px-7 py-2.5 rounded-xl text-sm flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <Shield className="w-4 h-4" />
                    <span>{creating ? 'Forjando Mundo...' : 'Criar Campanha & Abrir Mesa'}</span>
                  </button>
                </div>
              </form>
            </OrnateFrame>
          )}

          {gmTab === 'heroes' && (
            <OrnateFrame className="rpg-glass-panel rounded-lg p-6 space-y-4 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-display font-bold text-base text-amber-200 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Cofre Permanente de Heróis (Sincronizado Desktop + Online)</span>
                  </h3>
                  <p className="font-lore text-sm opacity-80">
                    Todos os personagens salvos ficam guardados na pasta <code>server/data/characters/</code> e podem ser trazidos para qualquer campanha.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => heroUploadRef.current?.click()}
                    className="rpg-btn-primary px-3 py-1.5 rounded-md font-display font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Importar Ficha (.json)</span>
                  </button>
                  <input
                    ref={heroUploadRef}
                    type="file"
                    accept="application/json,.json"
                    onChange={handleImportHeroFileToVault}
                    className="hidden"
                  />
                </div>
              </div>

              {heroVaultToast && (
                <div className="p-2.5 rounded-md bg-emerald-950/60 border border-emerald-500/50 text-emerald-200 font-semibold">
                  {heroVaultToast}
                </div>
              )}

              {savedHeroes.length === 0 ? (
                <div className="rpg-card rounded-lg p-6 text-center opacity-75">
                  Nenhum herói salvo no Cofre ainda. Abra a Ficha de um personagem dentro da mesa e clique em &ldquo;Salvar Herói&rdquo;!
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {savedHeroes.map((entry) => {
                    const ch = entry.character;
                    const cls =
                      campaign.compendium.classes.find((c) => c.id === ch.classId)?.name || 'Herói';
                    return (
                      <div
                        key={entry.id}
                        className="rpg-card rounded-lg p-3.5 flex flex-col justify-between gap-3 border hover:border-amber-400/60 transition"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <TokenPortrait
                            name={ch.name}
                            imageUrl={ch.portraitUrl}
                            playerColor={ch.playerColor || '#f59e0b'}
                            frameStyle={ch.tokenFrameStyle || 'gold'}
                            sizePx={48}
                          />
                          <div className="min-w-0">
                            <div className="font-display font-bold text-sm text-amber-100 truncate">
                              {ch.name}
                            </div>
                            <div className="text-[11px] text-amber-300/85 truncate">
                              Nv {ch.level} • {cls} • {ch.playerName}
                            </div>
                            <div className="text-[10px] opacity-65 truncate">
                              Origem: {entry.originCampaignName || 'Cofre Local'}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-1.5 pt-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                          <button
                            type="button"
                            onClick={async () => {
                              importSavedHeroIntoCampaign(ch);
                              await loadSavedCampaign(campaign.id);
                            }}
                            className="rpg-btn-primary px-2.5 py-1 rounded-md text-[11px] font-display font-bold cursor-pointer"
                            title="Inserir na campanha ativa e abrir mesa"
                          >
                            Enviar p/ Mesa Ativa
                          </button>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => triggerHeroJsonDownload(ch)}
                              className="rpg-card px-2 py-1 rounded text-[11px] flex items-center gap-1 cursor-pointer"
                              title="Baixar ficha .json"
                            >
                              <Download className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm(`Remover "${ch.name}" do Cofre de Heróis?`)) {
                                  deleteSavedHero(entry.id);
                                }
                              }}
                              className="p-1 rounded bg-red-950/60 border border-red-500/40 text-red-200 hover:bg-red-900 cursor-pointer"
                              title="Excluir do Cofre"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </OrnateFrame>
          )}
        </div>
      )}

      {/* =========================================================
          SCREEN 3: PLAYER JOIN (SIMPLE FOR LAYPEOPLE)
         ========================================================= */}
      {screen === 'player' && (
        <div className="relative z-10 flex-1 max-w-4xl w-full mx-auto px-6 pb-10 space-y-5 animate-ui-enter">
          <div className="text-center space-y-1">
            <h2 className="font-chronicle font-bold text-3xl text-[#bfd9ef]">
              Chamado à Aventura
            </h2>
            <p className="font-lore text-lg" style={{ color: 'var(--text-secondary)' }}>
              Informe seu nome, escolha sua cor e clique na mesa do seu Mestre para entrar.
            </p>
          </div>

          <OrnateFrame accentColor="#7ca6c9" className="rpg-glass-panel rounded-xl p-6 space-y-5 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end border-b pb-4" style={{ borderColor: 'var(--border-subtle)' }}>
              <div>
                <label className="font-display font-bold block mb-1">1. Qual é o seu Nome? *</label>
                <input
                  value={playerNameInput}
                  onChange={(e) => setPlayerNameInput(e.target.value)}
                  placeholder="Ex: Lucas, Mariana..."
                  className="rpg-input w-full text-sm"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-display font-bold">
                    2. Sua Cor Mágica (borda e bolinha no mapa)
                  </label>
                  <button
                    type="button"
                    onClick={() => setPlayerColorInput(pickRandomPlayerColor())}
                    className="underline text-[11px] cursor-pointer"
                  >
                    Sortear
                  </button>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {PLAYER_COLOR_PALETTE.map((col) => (
                    <button
                      key={col}
                      type="button"
                      onClick={() => setPlayerColorInput(col)}
                      className={`w-7 h-7 rounded-full border-2 cursor-pointer transition ${
                        playerColorInput === col
                          ? 'scale-115 border-white ring-2 ring-amber-400'
                          : 'border-transparent opacity-75 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: col }}
                    />
                  ))}
                  <input
                    type="color"
                    value={playerColorInput}
                    onChange={(e) => setPlayerColorInput(e.target.value)}
                    className="w-8 h-7 rounded cursor-pointer bg-transparent"
                  />
                </div>
              </div>
            </div>

            {joinError && (
              <div className="p-2.5 rounded-lg bg-red-950/60 border border-red-500/50 text-red-200">
                {joinError}
              </div>
            )}

            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="font-display font-bold text-sm flex items-center gap-2">
                  <Wifi className="w-4 h-4 text-emerald-400" />
                  <span>3. Mesas Encontradas Automaticamente</span>
                </div>
                <button
                  type="button"
                  onClick={scanRooms}
                  className="rpg-card px-3 py-1 rounded-full flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
                  <span>Atualizar</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {rooms.map((rm) => (
                  <div
                    key={rm.url}
                    className="rpg-card rounded-xl p-3.5 flex items-center justify-between gap-3 border hover:border-sky-400/70 transition"
                  >
                    <div className="min-w-0">
                      <div className="font-display font-bold text-sm truncate">
                        {rm.campaignName}
                      </div>
                      <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        Mestre: <strong>{rm.gmName}</strong> • {rm.characterCount} heróis
                      </div>
                      <div className="text-[10px] font-mono-dice mt-0.5 opacity-75">
                        Código: {rm.roomCode}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleJoinUrl(rm.isLocal ? '' : rm.url)}
                      className="rpg-btn-primary px-4 py-2 rounded-lg text-xs shrink-0 cursor-pointer"
                    >
                      Entrar
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <form
              onSubmit={handleJoinByCode}
              className="pt-3 border-t flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <span className="font-display font-bold shrink-0">Link do Mestre ou Código:</span>
              <input
                value={roomCodeInput}
                onChange={(e) => setRoomCodeInput(e.target.value)}
                placeholder="Ex: https://....trycloudflare.com ou RUNA-1AED-C79F"
                className="rpg-input flex-1 font-mono-dice"
              />
              <button
                type="submit"
                className="rpg-btn-crimson px-4 py-2 rounded-lg font-semibold cursor-pointer"
              >
                Conectar
              </button>
            </form>

            {/* Player Saved Hero Vault Strip */}
            <div className="pt-3 border-t space-y-2.5" style={{ borderColor: 'var(--border-subtle)' }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-display font-bold text-xs text-amber-200 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Meus Heróis Salvos ({savedHeroes.length}) — Sincronizado Desktop + Online</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => heroUploadRef.current?.click()}
                    className="rpg-card px-2.5 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1 cursor-pointer hover:border-amber-400/60"
                  >
                    <Upload className="w-3 h-3" />
                    <span>Carregar Ficha (.json)</span>
                  </button>
                  <input
                    ref={heroUploadRef}
                    type="file"
                    accept="application/json,.json"
                    onChange={handleImportHeroFileToVault}
                    className="hidden"
                  />
                </div>
              </div>

              {heroVaultToast && (
                <div className="p-2 rounded-md bg-emerald-950/60 border border-emerald-500/50 text-emerald-200 text-[11px]">
                  {heroVaultToast}
                </div>
              )}

              {savedHeroes.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {savedHeroes.slice(0, 6).map((entry) => (
                    <div
                      key={entry.id}
                      className="rpg-card rounded-md px-2.5 py-2 flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <TokenPortrait
                          name={entry.character.name}
                          imageUrl={entry.character.portraitUrl}
                          playerColor={entry.character.playerColor || '#38bdf8'}
                          frameStyle={entry.character.tokenFrameStyle || 'gold'}
                          sizePx={34}
                        />
                        <div className="min-w-0">
                          <div className="font-display font-bold text-xs text-amber-100 truncate">
                            {entry.character.name}
                          </div>
                          <div className="text-[10px] opacity-75 truncate">
                            Nv {entry.character.level} • {entry.originCampaignName || 'Salvo'}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => triggerHeroJsonDownload(entry.character)}
                        className="rpg-card p-1.5 rounded text-[10px] cursor-pointer shrink-0"
                        title="Baixar ficha (.json)"
                      >
                        <Download className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] opacity-70">
                  Ao entrar na mesa, seus heróis criados serão salvos automaticamente no Cofre para usar no Desktop ou em futuras sessões online.
                </p>
              )}
            </div>
          </OrnateFrame>
        </div>
      )}
    </div>
  );
};
