import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Compass,
  Copy,
  Crown,
  Download,
  Eye,
  Globe,
  Menu,
  Moon,
  RotateCcw,
  ScrollText,
  Shield,
  Skull,
  Sun,
  Swords,
  Undo2,
  Upload,
  User,
  Users,
  Volume2,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { useCampaign } from '../context/CampaignContext';
import { PLAYER_COLOR_PALETTE } from '../shared/rulesEngine';
import { DraggablePanel, DragGripBadge } from './DraggablePanel';
import { openEntitySheet } from './EntitySheetModal';
import { OrnateFrame } from './OrnateFrame';
import { openAlertDialog, openConfirmDialog } from './PromptDialog';

export type ActiveModalType =
  | null
  | 'sheet'
  | 'compendium'
  | 'bestiary'
  | 'npcs'
  | 'gm-shield'
  | 'diary'
  | 'quests'
  | 'soundboard';

interface TopHeaderProps {
  activeModal: ActiveModalType;
  setActiveModal: (modal: ActiveModalType) => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({ activeModal, setActiveModal }) => {
  const {
    campaign,
    setInLobby,
    isConnected,
    connectedClients,
    connectedPlayers,
    serverUrl,
    setServerUrl,
    networkAddresses,
    publicTunnel,
    startPublicTunnel,
    stopPublicTunnel,
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
    activeAmbientName,
    resetCampaign,
    importCampaign,
    canUndo,
    undoCount,
    undoLastAction,
    partyRest,
  } = useCampaign();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [showNetworkModal, setShowNetworkModal] = useState(false);
  const [showOnlineRoster, setShowOnlineRoster] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showMainMenu, setShowMainMenu] = useState(false);
  const [showRestMenu, setShowRestMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const restMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!showMainMenu && !showRestMenu) return;
    const onDocDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMainMenu(false);
      }
      if (restMenuRef.current && !restMenuRef.current.contains(e.target as Node)) {
        setShowRestMenu(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowMainMenu(false);
        setShowRestMenu(false);
      }
    };
    window.addEventListener('mousedown', onDocDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDocDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [showMainMenu, showRestMenu]);
  const [remoteInput, setRemoteInput] = useState(serverUrl);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [hasGmPrivilege, setHasGmPrivilege] = useState(() => role === 'gm');

  useEffect(() => {
    if (role === 'gm') {
      setHasGmPrivilege(true);
    }
  }, [role]);

  const toggleModal = (modal: ActiveModalType) => {
    if (modal === 'sheet' && role === 'gm' && targetTokenId) {
      const activeMap =
        campaign.maps.find((m) => m.id === campaign.activeMapId) || campaign.maps[0];
      const tok = activeMap?.tokens.find((t) => t.id === targetTokenId);
      if (tok?.type === 'monster' && tok.referenceId) {
        setActiveModal(null);
        openEntitySheet({ kind: 'monster', id: tok.referenceId });
        return;
      }
      if (tok?.type === 'npc' && tok.referenceId) {
        setActiveModal(null);
        openEntitySheet({ kind: 'npc', id: tok.referenceId });
        return;
      }
      if (tok?.type === 'character' && tok.referenceId) {
        setActiveCharacterId(tok.referenceId);
      }
    }
    setActiveModal(activeModal === modal ? null : modal);
  };

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(campaign, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${campaign.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        await importCampaign(parsed);
      } catch {
        openAlertDialog('Erro ao importar arquivo JSON da campanha.', 'Erro de Importação');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const copyValue = (val: string, key: string) => {
    navigator.clipboard.writeText(val);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const navButtons: Array<{
    id: ActiveModalType;
    label: string;
    icon: React.ReactNode;
    gmOnly?: boolean;
  }> = [
    { id: 'sheet', label: 'Ficha', icon: <User className="w-4 h-4" /> },
    { id: 'compendium', label: 'Regras', icon: <BookOpen className="w-4 h-4" /> },
    { id: 'bestiary', label: 'Bestiário', icon: <Skull className="w-4 h-4" />, gmOnly: true },
    { id: 'npcs', label: 'NPCs', icon: <Users className="w-4 h-4" /> },
    { id: 'quests', label: 'Missões', icon: <Compass className="w-4 h-4" /> },
    { id: 'diary', label: 'Diário', icon: <ScrollText className="w-4 h-4" /> },
    { id: 'gm-shield', label: 'Escudo GM', icon: <Shield className="w-4 h-4" />, gmOnly: true },
    { id: 'soundboard', label: 'Som', icon: <Volume2 className="w-4 h-4" /> },
  ];

  const currentColor =
    role === 'player' ? myCharacter?.playerColor || myPlayerColor : myPlayerColor || '#e0b84c';

  return (
    <>
      <header className="rpg-panel h-14 px-3 flex items-center justify-between gap-2 border-b z-30 shrink-0 select-none relative">
        {/* Left: Lobby Back + Brand + Nav */}
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            onClick={() => setInLobby(true)}
            className="rpg-card px-2 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1 hover:opacity-85 cursor-pointer shrink-0"
            title="Voltar ao Lobby de Campanhas"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Lobby</span>
          </button>

          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center rpg-ornate-border bg-black/40 shadow-[0_0_12px_rgba(224,184,76,0.2)]">
              <Swords className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
            </div>
            <div className="hidden md:block leading-tight">
              <div className="flex items-center gap-1.5">
                <span className="font-chronicle font-bold text-[10px] tracking-[0.2em] chronicle-gold-text">
                  CHRONICLES
                </span>
                <span className="text-[10px] opacity-40">•</span>
                <span className="font-display font-bold text-xs tracking-wide truncate max-w-[165px]">
                  {campaign.name}
                </span>
              </div>
              <div className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                Mestre: {campaign.gmName || 'Mestre'}
              </div>
            </div>
          </div>

          {/* Collapsible Top Menu Button */}
          <div ref={menuRef} className="relative ml-1">
            <button
              type="button"
              onClick={() => setShowMainMenu((v) => !v)}
              className={`px-3 py-1.5 rounded-md text-xs font-display font-bold flex items-center gap-2 transition cursor-pointer ${
                showMainMenu || activeModal ? 'rpg-btn-primary shadow-sm' : 'rpg-card hover:border-amber-400/60'
              }`}
              title="Abrir menu de opções (Ficha, Regras, Bestiário, NPCs, Diário, Som)"
            >
              <Menu className="w-4 h-4" />
              <span>
                {activeModal
                  ? navButtons.find((b) => b.id === activeModal)?.label || 'Menu'
                  : 'Menu'}
              </span>
              {activeAmbientName && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.75)]" />
              )}
            </button>

            {showMainMenu && (
              <div className="absolute left-0 top-full mt-2 w-56 rpg-glass-panel rounded-lg p-1.5 shadow-2xl border border-amber-500/40 z-50 animate-popover space-y-1">
                {navButtons.map((btn) => {
                  if (btn.gmOnly && role !== 'gm') return null;
                  const active = activeModal === btn.id;
                  return (
                    <button
                      key={btn.id}
                      type="button"
                      onClick={() => {
                        toggleModal(btn.id);
                        setShowMainMenu(false);
                      }}
                      className={`w-full px-3 py-2 rounded-md text-xs font-display font-semibold flex items-center justify-between gap-2 transition cursor-pointer text-left ${
                        active ? 'rpg-btn-primary' : 'hover:bg-white/8'
                      }`}
                      style={!active ? { color: 'var(--text-primary)' } : undefined}
                    >
                      <span className="flex items-center gap-2.5">
                        {btn.icon}
                        <span>{btn.label}</span>
                      </span>
                      {btn.id === 'soundboard' && activeAmbientName && (
                        <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.75)]" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: Color Swatch, Char Selector, Role Switch, Theme, Network */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Player Color Picker */}
          <div className="relative">
            <button
              onClick={() => setShowColorPicker((v) => !v)}
              className="rpg-card px-2 py-1 rounded-md flex items-center gap-1.5 text-xs cursor-pointer"
              title="Sua Cor (Borda do Herói & Bolinha do Mapa)"
            >
              <span
                className="w-3.5 h-3.5 rounded-full border border-white/60"
                style={{ backgroundColor: currentColor }}
              />
              <span className="hidden xl:inline text-[11px]">Minha Cor</span>
            </button>

            {showColorPicker && (
              <div className="absolute right-0 top-10 z-50 rpg-glass-panel rounded-xl p-3 w-52 space-y-2 shadow-2xl">
                <div className="text-[11px] font-bold">Escolha sua Cor Mágica</div>
                <div className="flex flex-wrap gap-1.5">
                  {PLAYER_COLOR_PALETTE.map((col) => (
                    <button
                      key={col}
                      onClick={() => {
                        setMyPlayerColor(col);
                        setShowColorPicker(false);
                      }}
                      className="w-6 h-6 rounded-full border border-white/50 cursor-pointer hover:scale-110 transition"
                      style={{ backgroundColor: col }}
                    />
                  ))}
                  <input
                    type="color"
                    value={currentColor}
                    onChange={(e) => setMyPlayerColor(e.target.value)}
                    className="w-6 h-6 rounded cursor-pointer bg-transparent"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Character selector (GM can pick any; Player locked to their single character) */}
          {role === 'gm' ? (
            campaign.characters.length > 0 && (
              <select
                value={activeCharacterId}
                onChange={(e) => setActiveCharacterId(e.target.value)}
                className="rpg-input text-xs py-1 max-w-[145px]"
                title="Selecionar personagem ativo"
              >
                {campaign.characters.map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    {ch.name} (Nv {ch.level})
                  </option>
                ))}
              </select>
            )
          ) : (
            myCharacter && (
              <span className="rpg-card px-2.5 py-1 rounded text-xs font-semibold truncate max-w-[140px]">
                {myCharacter.name}
              </span>
            )
          )}

          {/* Role Badge (+ GM preview toggle for GMs only) */}
          <div className="flex items-center gap-1.5">
            <div
              className={`px-2.5 py-1 rounded-md text-xs font-display font-bold flex items-center gap-1.5 border ${
                role === 'gm'
                  ? 'bg-red-950/70 border-amber-500/40 text-amber-200 shadow-[0_0_12px_rgba(220,38,38,0.2)]'
                  : 'bg-amber-950/40 border-amber-400/30 text-amber-200'
              }`}
            >
              {role === 'gm' ? (
                <>
                  <Crown className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden lg:inline">Mestre</span>
                </>
              ) : (
                <>
                  <User className="w-3.5 h-3.5 text-amber-300" />
                  <span className="hidden lg:inline">Jogador</span>
                </>
              )}
            </div>

            {hasGmPrivilege && (
              <button
                onClick={() => setRole(role === 'gm' ? 'player' : 'gm')}
                className="rpg-card px-2 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1 cursor-pointer hover:opacity-85"
                title={
                  role === 'gm'
                    ? 'Simular visão de Jogador na mesa'
                    : 'Voltar para o modo Mestre'
                }
              >
                <Eye className="w-3.5 h-3.5 text-sky-400" />
                <span className="hidden xl:inline">
                  {role === 'gm' ? 'Visão Jogador' : 'Voltar Mestre'}
                </span>
              </button>
            )}
          </div>

          {/* GM Quick Party Rest (Short / Long) */}
          {role === 'gm' && campaign.characters.length > 0 && (
            <div ref={restMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setShowRestMenu((v) => !v)}
                className="rpg-card px-2.5 py-1 rounded-md text-xs font-display font-semibold flex items-center gap-1.5 hover:border-amber-400/60 cursor-pointer"
                title="Conceder Descanso Curto ou Longo para todo o grupo"
              >
                <Moon className="w-3.5 h-3.5 text-amber-300" />
                <span className="hidden xl:inline">Descanso</span>
              </button>
              {showRestMenu && (
                <div className="absolute right-0 top-full mt-2 w-60 rpg-glass-panel rounded-lg p-2 shadow-2xl border border-amber-500/40 z-50 animate-popover space-y-1.5">
                  <div className="text-[10px] font-display uppercase tracking-wider text-amber-300/90 px-1.5">
                    Descanso em Grupo
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      setShowRestMenu(false);
                      const ok = await openConfirmDialog(
                        'Aplicar Descanso Curto para todos os heróis vivos? (Recupera Dado de Vida, 1/3 de energia e cargas de descanso curto)',
                        'Descanso Curto da Party',
                        { confirmLabel: 'Descanso Curto', cancelLabel: 'Cancelar' }
                      );
                      if (ok) partyRest('short');
                    }}
                    className="w-full px-2.5 py-2 rounded-md text-left hover:bg-amber-500/12 border border-amber-500/25 flex items-center gap-2 cursor-pointer transition"
                  >
                    <Sun className="w-4 h-4 text-amber-400 shrink-0" />
                    <div className="leading-tight">
                      <div className="text-xs font-display font-bold text-amber-200">
                        Descanso Curto
                      </div>
                      <div className="text-[10px] opacity-75">
                        Dado de Vida + 1/3 MP + cargas curtas
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setShowRestMenu(false);
                      const ok = await openConfirmDialog(
                        'Aplicar Descanso Longo para todos os heróis vivos? (Restaura 100% PV, MP, recursos, usos de habilidades, remove Exaustão e encerra concentrações)',
                        'Descanso Longo da Party',
                        { confirmLabel: 'Descanso Longo', cancelLabel: 'Cancelar' }
                      );
                      if (ok) partyRest('long');
                    }}
                    className="w-full px-2.5 py-2 rounded-md text-left hover:bg-indigo-500/15 border border-indigo-400/25 flex items-center gap-2 cursor-pointer transition"
                  >
                    <Moon className="w-4 h-4 text-indigo-300 shrink-0" />
                    <div className="leading-tight">
                      <div className="text-xs font-display font-bold text-indigo-200">
                        Descanso Longo
                      </div>
                      <div className="text-[10px] opacity-75">
                        100% PV/MP + todas as cargas + zera fadiga
                      </div>
                    </div>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* GM Quick Undo (Ctrl+Z) */}
          {role === 'gm' && (
            <button
              onClick={undoLastAction}
              disabled={!canUndo}
              className="rpg-card px-2 py-1.5 rounded-md text-xs font-display font-semibold flex items-center gap-1 cursor-pointer hover:border-amber-400/60 disabled:opacity-35 disabled:cursor-not-allowed"
              title={`Desfazer última ação do Mestre (Ctrl+Z)${undoCount > 0 ? ` — ${undoCount} no histórico` : ''}`}
            >
              <Undo2 className="w-3.5 h-3.5 text-amber-300" />
              <span className="hidden lg:inline">Desfazer</span>
            </button>
          )}

          {/* Dual Theme Switcher */}
          <button
            onClick={() => setTheme(theme === 'dark-fantasy' ? 'bright-fantasy' : 'dark-fantasy')}
            className="rpg-card p-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 cursor-pointer hover:opacity-90"
            title="Alternar Dark Fantasy / Bright Fantasy"
          >
            {theme === 'dark-fantasy' ? (
              <Moon className="w-3.5 h-3.5 text-amber-400" />
            ) : (
              <Sun className="w-3.5 h-3.5 text-amber-600" />
            )}
          </button>

          {/* Export / Import / Reset */}
          <div className="hidden xl:flex items-center gap-1">
            <button
              onClick={handleExportJson}
              className="rpg-card p-1.5 rounded-md hover:opacity-80 cursor-pointer"
              title="Exportar Campanha (JSON)"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="rpg-card p-1.5 rounded-md hover:opacity-80 cursor-pointer"
              title="Importar Campanha (JSON)"
            >
              <Upload className="w-3.5 h-3.5" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              onChange={handleImportFile}
              className="hidden"
            />
            {role === 'gm' && (
              <button
                onClick={async () => {
                  if (
                    await openConfirmDialog(
                      'Restaurar esta campanha para o pacote inicial padrão?',
                      'Restaurar Campanha'
                    )
                  ) {
                    resetCampaign();
                  }
                }}
                className="rpg-card p-1.5 rounded-md hover:opacity-80 cursor-pointer text-red-400"
                title="Restaurar Seed Inicial"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Online Players Roster Toggle Button */}
          <button
            onClick={() => setShowOnlineRoster((v) => !v)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-display font-bold cursor-pointer transition ${
              showOnlineRoster ? 'rpg-btn-primary' : 'rpg-card hover:border-amber-400/60'
            }`}
            title="Mostrar/Ocultar lista de todos os jogadores online e conectados"
          >
            <Users className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden md:inline">
              Online ({connectedPlayers.length || connectedClients})
            </span>
          </button>

          {/* Room / Invite Modal Trigger */}
          <button
            onClick={() => {
              setRemoteInput(serverUrl);
              setShowNetworkModal(true);
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold rpg-card hover:opacity-90 cursor-pointer"
            title="Código de Convite da Sala / Conexão"
          >
            {isConnected ? (
              <Wifi className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <WifiOff className="w-3.5 h-3.5 text-amber-400" />
            )}
            <span className="hidden sm:inline">Convidar</span>
          </button>
        </div>
      </header>

      {/* Draggable Floating Online Players Roster Panel */}
      {showOnlineRoster && (
        <DraggablePanel
          storageKey="online-players-panel"
          className="fixed top-16 right-4 z-45 w-72 pointer-events-auto"
        >
          <OrnateFrame
            accentColor="#10b981"
            cornerSize={14}
            className="rpg-glass-panel rounded-lg p-3 space-y-2.5 text-xs shadow-[0_18px_48px_rgba(0,0,0,0.92)]"
          >
            <div
              className="flex items-center justify-between gap-2 border-b pb-2"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.75)] shrink-0" />
                <span className="font-display font-bold text-xs uppercase tracking-wider text-emerald-300 truncate">
                  Jogadores Online ({connectedPlayers.length || connectedClients})
                </span>
              </div>
              <div className="flex items-center gap-1">
                <DragGripBadge />
                <button
                  onClick={() => setShowOnlineRoster(false)}
                  className="rpg-card p-1 rounded cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {connectedPlayers.length === 0 ? (
                <div className="text-[11px] font-lore italic opacity-75 py-2 text-center">
                  Conectado localmente ({connectedClients} na sala).
                </div>
              ) : (
                connectedPlayers.map((plr) => (
                  <div
                    key={plr.socketId}
                    onClick={() => {
                      if (role === 'gm' && plr.characterId) {
                        setActiveCharacterId(plr.characterId);
                      }
                    }}
                    className={`rpg-card rounded-md px-2.5 py-2 flex items-center justify-between gap-2 ${
                      role === 'gm' && plr.characterId ? 'cursor-pointer hover:border-amber-400/60' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-3 h-3 rounded-full border border-white/70 shrink-0"
                        style={{
                          backgroundColor: plr.playerColor,
                          boxShadow: `0 0 8px ${plr.playerColor}`,
                        }}
                      />
                      <div className="min-w-0">
                        <div className="font-display font-bold text-xs text-amber-100 truncate">
                          {plr.playerName}
                        </div>
                        <div className="text-[10px] truncate" style={{ color: 'var(--text-secondary)' }}>
                          {plr.role === 'gm'
                            ? 'Mestre da Mesa'
                            : plr.characterName
                              ? `Herói: ${plr.characterName}`
                              : 'Criando Personagem...'}
                        </div>
                      </div>
                    </div>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-display font-bold shrink-0 ${
                        plr.role === 'gm'
                          ? 'bg-amber-500/20 border border-amber-400/50 text-amber-200'
                          : 'bg-emerald-950/75 border border-emerald-500/40 text-emerald-200'
                      }`}
                    >
                      {plr.role === 'gm' ? 'Mestre' : 'Online'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </OrnateFrame>
        </DraggablePanel>
      )}

      {/* Network / Friendly Room Code Modal */}
      {showNetworkModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <DraggablePanel
            storageKey="network-invite-modal"
            className="rpg-glass-panel rounded-2xl max-w-lg w-full p-5 space-y-4 text-xs"
          >
            <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--border-subtle)' }}>
              <div className="flex items-center gap-2">
                <Globe className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
                <div>
                  <h3 className="font-display font-bold text-base">
                    Convidar Jogadores &amp; Conexão Simples
                  </h3>
                  <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    Jogadores na mesma rede/VPN encontram a sala automaticamente no Lobby!
                  </p>
                </div>
              </div>
              <button onClick={() => setShowNetworkModal(false)} className="rpg-card p-1.5 rounded cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="rpg-card rounded-xl p-3.5 space-y-2.5 border-amber-400/50">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="font-display font-bold text-sm text-amber-300 flex items-center gap-1.5">
                    <Globe className="w-4 h-4" />
                    <span>Link Direto pela Internet (Sem Radmin / VPN)</span>
                  </div>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    Seus jogadores abrem o link direto no navegador ou colam no Lobby — sem instalar VPN!
                  </p>
                </div>
              </div>

              {publicTunnel.status === 'active' && publicTunnel.url ? (
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-md bg-emerald-950/50 border border-emerald-500/50">
                    <span className="font-mono-dice font-bold text-xs text-emerald-200 truncate select-all">
                      {publicTunnel.url}
                    </span>
                    <button
                      onClick={() => copyValue(publicTunnel.url, 'tunnel-url')}
                      className="rpg-btn-primary px-2.5 py-1 rounded text-[11px] flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      <Copy className="w-3 h-3" />
                      {copiedKey === 'tunnel-url' ? 'Link Copiado!' : 'Copiar Link'}
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[10px]">
                    <span className="text-emerald-300/90">
                      Túnel ativo! Envie no WhatsApp ou Discord para os jogadores entrarem.
                    </span>
                    <button
                      onClick={stopPublicTunnel}
                      className="px-2 py-1 rounded bg-red-950/80 border border-red-500/40 text-red-200 hover:bg-red-900 cursor-pointer shrink-0"
                    >
                      Encerrar Link
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 pt-1">
                  {publicTunnel.status === 'error' && publicTunnel.error && (
                    <div className="px-2.5 py-1.5 rounded bg-red-950/70 border border-red-500/50 text-red-200 text-[11px]">
                      {publicTunnel.error}
                    </div>
                  )}
                  <button
                    onClick={startPublicTunnel}
                    disabled={publicTunnel.status === 'starting'}
                    className="w-full rpg-btn-primary px-3 py-2 rounded-md text-xs font-display font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                  >
                    <Globe className="w-4 h-4" />
                    <span>
                      {publicTunnel.status === 'starting'
                        ? 'Abrindo link público da mesa (aguarde alguns segundos)...'
                        : 'Gerar Link Público da Mesa (1 Clique)'}
                    </span>
                  </button>
                </div>
              )}
            </div>

            <div className="rpg-card rounded-xl p-3.5 space-y-2">
              <div className="font-display font-bold text-sm" style={{ color: 'var(--accent-primary)' }}>
                Ou Códigos Locais / VPN (Wi-Fi / Radmin)
              </div>
              <div className="space-y-1.5 pt-1">
                {networkAddresses.map((addr) => (
                  <div
                    key={addr.url}
                    className="flex items-center justify-between gap-2 px-2.5 py-2 rounded bg-black/25"
                  >
                    <div className="min-w-0">
                      <div className="text-[10px] opacity-70">[{addr.name}] • {addr.url}</div>
                      <div className="font-mono-dice font-bold text-sm text-amber-300">
                        {addr.roomCode}
                      </div>
                    </div>
                    <button
                      onClick={() => copyValue(addr.roomCode, addr.roomCode)}
                      className="rpg-btn-primary px-2.5 py-1 rounded text-[11px] flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      <Copy className="w-3 h-3" />
                      {copiedKey === addr.roomCode ? 'Copiado!' : 'Copiar Código'}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="rpg-card rounded-xl p-3.5 space-y-2">
              <div className="font-display font-bold text-sm">
                Conectar a Outro Mestre Manualmente
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={remoteInput}
                  onChange={(e) => setRemoteInput(e.target.value)}
                  placeholder="Ex: http://26.237.199.159:3001 (vazio = local)"
                  className="rpg-input flex-1 font-mono-dice"
                />
                <button
                  onClick={() => {
                    setServerUrl(remoteInput);
                    setShowNetworkModal(false);
                  }}
                  className="rpg-btn-primary px-3 py-1.5 rounded cursor-pointer"
                >
                  Conectar
                </button>
              </div>
            </div>
          </DraggablePanel>
        </div>
      )}
    </>
  );
};
