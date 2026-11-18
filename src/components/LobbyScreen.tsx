import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Crown,
  Moon,
  Plus,
  RefreshCw,
  Shield,
  Sparkles,
  Sun,
  Swords,
  Trash2,
  Wifi,
} from 'lucide-react';
import { useCampaign } from '../context/CampaignContext';
import {
  decodeRoomCode,
  pickRandomPlayerColor,
  PLAYER_COLOR_PALETTE,
} from '../shared/rulesEngine';
import { FantasyParticlesBackground } from './FantasyEffects';
import { FileUploadButton } from './FileUploadButton';
import { OrnateDivider, OrnateFrame } from './OrnateFrame';

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
    savedCampaigns,
    refreshSavedCampaigns,
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
  const [gmTab, setGmTab] = useState<'continue' | 'create'>('continue');

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
    scanRooms();
  }, [refreshSavedCampaigns, scanRooms]);

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
    <div className="h-screen w-screen relative overflow-y-auto flex flex-col">
      <FantasyParticlesBackground intensity="high" />

      {/* Top Subtle Theme Switcher & Back */}
      <div className="relative z-10 flex items-center justify-between px-6 py-4">
        <div>
          {screen !== 'title' && (
            <button
              onClick={() => setScreen('title')}
              className="rpg-glass-panel px-3.5 py-2 rounded-md text-xs font-display font-bold flex items-center gap-1.5 cursor-pointer hover:brightness-110 transition"
            >
              <ArrowLeft className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
              <span>Voltar ao Início</span>
            </button>
          )}
        </div>

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

      {/* =========================================================
          SCREEN 1: CINEMATIC TITLE SCREEN ("CHRONICLE")
         ========================================================= */}
      {screen === 'title' && (
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 pb-12 text-center">
          {/* Carved Heraldic d20 & Sword Crest */}
          <div className="relative w-28 h-28 flex items-center justify-center mb-4 animate-title-emblem">
            <svg viewBox="0 0 120 120" className="w-full h-full" style={{ color: 'var(--accent-primary)' }}>
              {/* Outer Octagonal Brass Frame */}
              <polygon
                points="38,8 82,8 112,38 112,82 82,112 38,112 8,82 8,38"
                fill="rgba(16,14,10,0.65)"
                stroke="currentColor"
                strokeWidth="2"
              />
              <polygon
                points="42,15 78,15 105,42 105,78 78,105 42,105 15,78 15,42"
                fill="none"
                stroke="currentColor"
                strokeOpacity="0.45"
                strokeWidth="1"
              />
              {/* Faceted d20 Sacred Geometry */}
              <polygon
                points="60,18 96,42 84,88 36,88 24,42"
                fill="none"
                stroke="currentColor"
                strokeOpacity="0.55"
                strokeWidth="1.2"
              />
              <polyline points="24,42 96,42 60,72 24,42" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1" />
              <line x1="60" y1="18" x2="60" y2="72" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1" />
              <line x1="36" y1="88" x2="60" y2="72" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1" />
              <line x1="84" y1="88" x2="60" y2="72" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-12 h-12 rounded-md rpg-glass-panel flex items-center justify-center shadow-[0_8px_24px_rgba(0,0,0,0.85)]">
                <Swords className="w-6 h-6" style={{ color: 'var(--accent-primary)' }} />
              </div>
            </div>
          </div>

          {/* Animated Fantasy Title: CHRONICLE */}
          <h1 className="font-chronicle font-black text-5xl sm:text-7xl md:text-8xl tracking-widest chronicle-gold-text animate-title-reveal select-none">
            CHRONICLE
          </h1>

          <div className="max-w-lg w-full mt-3 mb-2 animate-title-reveal">
            <OrnateDivider />
          </div>

          <p
            className="font-lore italic text-xl sm:text-2xl max-w-xl animate-title-reveal"
            style={{ color: 'var(--text-secondary)' }}
          >
            Forje lendas, domine batalhas táticas e viva suas crônicas em tempo real.
          </p>

          {/* The Two Ornate Portals: SOU JOGADOR | SOU MESTRE */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-3xl w-full mt-10 animate-portals-up">
            {/* Portal Jogador */}
            <button
              onClick={() => {
                setScreen('player');
                scanRooms();
              }}
              className="text-left group cursor-pointer focus:outline-none"
            >
              <OrnateFrame
                accentColor="#7ca6c9"
                className="rpg-glass-panel rounded-xl p-7 transition-all duration-300 group-hover:-translate-y-1.5 group-hover:shadow-[0_18px_45px_rgba(0,0,0,0.85)]"
              >
                <div className="flex flex-col items-center text-center gap-3">
                  <div className="w-14 h-14 rounded-lg bg-[#142030] border border-[#7ca6c9]/50 flex items-center justify-center group-hover:scale-105 transition-transform duration-300 shadow-inner">
                    <Swords className="w-7 h-7 text-[#9bc4e6]" />
                  </div>
                  <div className="font-chronicle font-bold text-2xl tracking-wider text-[#bfd9ef]">
                    SOU JOGADOR
                  </div>
                  <p className="font-lore text-base leading-snug" style={{ color: 'var(--text-secondary)' }}>
                    Entre facilmente na mesa do seu Mestre, crie seu herói e role dados em batalha.
                  </p>
                  <span className="mt-1 px-4 py-1.5 rounded-md bg-[#162436] border border-[#7ca6c9]/45 text-xs font-display font-bold text-[#c7e0f5] group-hover:border-[#9bc4e6] transition">
                    Entrar em uma Aventura →
                  </span>
                </div>
              </OrnateFrame>
            </button>

            {/* Portal Mestre */}
            <button
              onClick={() => setScreen('gm')}
              className="text-left group cursor-pointer focus:outline-none"
            >
              <OrnateFrame
                accentColor="#e4ba52"
                className="rpg-glass-panel rounded-xl p-7 transition-all duration-300 group-hover:-translate-y-1.5 group-hover:shadow-[0_18px_45px_rgba(0,0,0,0.85)]"
              >
                <div className="flex flex-col items-center text-center gap-3">
                  <div className="w-14 h-14 rounded-lg bg-[#241b0c] border border-amber-500/50 flex items-center justify-center group-hover:scale-105 transition-transform duration-300 shadow-inner">
                    <Crown className="w-7 h-7" style={{ color: 'var(--accent-primary)' }} />
                  </div>
                  <div className="font-chronicle font-bold text-2xl tracking-wider" style={{ color: 'var(--accent-primary)' }}>
                    SOU MESTRE
                  </div>
                  <p className="font-lore text-base leading-snug" style={{ color: 'var(--text-secondary)' }}>
                    Crie um novo mundo com suas regras, gerencie mapas, monstros e comande a história.
                  </p>
                  <span className="mt-1 px-4 py-1.5 rounded-md bg-[#261d0d] border border-amber-500/45 text-xs font-display font-bold text-amber-200 group-hover:border-amber-300 transition">
                    Criar ou Continuar Mesa →
                  </span>
                </div>
              </OrnateFrame>
            </button>
          </div>
        </div>
      )}

      {/* =========================================================
          SCREEN 2: GM HUB (CONTINUE OR CREATE CAMPAIGN)
         ========================================================= */}
      {screen === 'gm' && (
        <div className="relative z-10 flex-1 max-w-6xl w-full mx-auto px-6 pb-10 space-y-5 animate-dice-tumble">
          <div className="text-center space-y-1">
            <h2 className="font-chronicle font-bold text-3xl chronicle-gold-text">
              Santuário do Mestre
            </h2>
            <p className="font-lore text-lg" style={{ color: 'var(--text-secondary)' }}>
              Continue uma crônica salva neste computador ou forje uma nova campanha.
            </p>
          </div>

          <div className="flex items-center justify-center gap-3">
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
        </div>
      )}

      {/* =========================================================
          SCREEN 3: PLAYER JOIN (SIMPLE FOR LAYPEOPLE)
         ========================================================= */}
      {screen === 'player' && (
        <div className="relative z-10 flex-1 max-w-4xl w-full mx-auto px-6 pb-10 space-y-5 animate-dice-tumble">
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
          </OrnateFrame>
        </div>
      )}
    </div>
  );
};
