import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  ChevronDown,
  Compass,
  Copy,
  Crown,
  Download,
  Eye,
  Globe,
  Keyboard,
  Moon,
  Palette,
  RotateCcw,
  ScrollText,
  Settings,
  Shield,
  Skull,
  Sun,
  Swords,
  Type,
  Undo2,
  Upload,
  User,
  Users,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { useCampaign } from '../context/CampaignContext';
import { PLAYER_COLOR_PALETTE } from '../shared/rulesEngine';
import { soundEngine } from '../utils/soundEngine';
import { openEntitySheet } from './EntitySheetModal';
import { GrimoireModal } from './GrimoireModal';
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
    role,
    hasGmPrivilege,
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
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showRestMenu, setShowRestMenu] = useState(false);
  const [showGrimoireMenu, setShowGrimoireMenu] = useState(false);

  const settingsRef = useRef<HTMLDivElement | null>(null);
  const restMenuRef = useRef<HTMLDivElement | null>(null);
  const onlineRef = useRef<HTMLDivElement | null>(null);
  const grimoireRef = useRef<HTMLDivElement | null>(null);

  const [remoteInput, setRemoteInput] = useState(serverUrl);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [audioMuted, setAudioMuted] = useState(() => soundEngine.getMuted());
  const [musicVol, setMusicVol] = useState(() => Math.round(soundEngine.getMusicVolume() * 100));
  const [sfxVol, setSfxVol] = useState(() => Math.round(soundEngine.getSfxVolume() * 100));

  useEffect(() => {
    if (!showSettingsMenu) return;
    setAudioMuted(soundEngine.getMuted());
    setMusicVol(Math.round(soundEngine.getMusicVolume() * 100));
    setSfxVol(Math.round(soundEngine.getSfxVolume() * 100));
  }, [showSettingsMenu]);

  const handleToggleQuickMute = () => {
    const next = !soundEngine.getMuted();
    soundEngine.setMuted(next);
    setAudioMuted(next);
  };
  const [uiFont, setUiFont] = useState<string>(() => {
    try {
      return localStorage.getItem('chronicles_ui_font') || 'philosopher';
    } catch {
      return 'philosopher';
    }
  });

  const UI_FONT_OPTIONS = [
    { id: 'philosopher', label: 'Philosopher', note: 'Semi-serifa fantasia', css: "'Philosopher', Georgia, serif" },
    { id: 'marcellus', label: 'Marcellus', note: 'Clássica RPG', css: "'Marcellus', Georgia, serif" },
    { id: 'spectral', label: 'Spectral', note: 'Serifa sombria', css: "'Spectral', Georgia, serif" },
    { id: 'eb-garamond', label: 'EB Garamond', note: 'Grimório clássico', css: "'EB Garamond', Georgia, serif" },
    { id: 'lora', label: 'Lora', note: 'Serifa suave', css: "'Lora', Georgia, serif" },
    { id: 'jakarta', label: 'Jakarta Sans', note: 'Moderna nítida', css: "'Plus Jakarta Sans', system-ui, sans-serif" },
  ] as const;

  const applyUiFont = (fontId: string) => {
    setUiFont(fontId);
    document.documentElement.setAttribute('data-ui-font', fontId);
    try {
      localStorage.setItem('chronicles_ui_font', fontId);
    } catch {
      // ignore storage errors
    }
  };

  useEffect(() => {
    if (!showSettingsMenu && !showRestMenu && !showOnlineRoster && !showGrimoireMenu) return;
    const onDocDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (settingsRef.current && !settingsRef.current.contains(target)) {
        setShowSettingsMenu(false);
      }
      if (restMenuRef.current && !restMenuRef.current.contains(target)) {
        setShowRestMenu(false);
      }
      if (onlineRef.current && !onlineRef.current.contains(target)) {
        setShowOnlineRoster(false);
      }
      if (grimoireRef.current && !grimoireRef.current.contains(target)) {
        setShowGrimoireMenu(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowSettingsMenu(false);
        setShowRestMenu(false);
        setShowOnlineRoster(false);
        setShowGrimoireMenu(false);
      }
    };
    window.addEventListener('mousedown', onDocDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDocDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [showSettingsMenu, showRestMenu, showOnlineRoster, showGrimoireMenu]);

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

  const grimoireItems: Array<{
    id: ActiveModalType;
    label: string;
    desc: string;
    icon: React.ReactNode;
    gmOnly?: boolean;
  }> = [
    {
      id: 'compendium',
      label: 'Regras & Compêndio',
      desc: 'Atributos, perícias, magias e itens',
      icon: <BookOpen className="w-4 h-4" />,
    },
    {
      id: 'bestiary',
      label: 'Bestiário',
      desc: 'Criaturas, chefes e encontros',
      icon: <Skull className="w-4 h-4" />,
      gmOnly: true,
    },
    {
      id: 'npcs',
      label: 'NPCs',
      desc: 'Aliados, mercadores e facções',
      icon: <Users className="w-4 h-4" />,
    },
    {
      id: 'quests',
      label: 'Missões',
      desc: 'Objetivos ativos e recompensas',
      icon: <Compass className="w-4 h-4" />,
    },
    {
      id: 'diary',
      label: 'Diário',
      desc: 'Crônicas, notas e arquivos',
      icon: <ScrollText className="w-4 h-4" />,
    },
    {
      id: 'gm-shield',
      label: 'Escudo do Mestre',
      desc: 'Testes, handouts e controle secreto',
      icon: <Shield className="w-4 h-4" />,
      gmOnly: true,
    },
    {
      id: 'soundboard',
      label: 'Som & Ambiente',
      desc: activeAmbientName ? `Tocando: ${activeAmbientName}` : 'Trilhas sonoras e efeitos',
      icon: <Volume2 className="w-4 h-4" />,
    },
  ];

  const visibleGrimoireItems = grimoireItems.filter((item) => !item.gmOnly || role === 'gm');
  const activeGrimoireItem = visibleGrimoireItems.find((item) => item.id === activeModal);

  const currentColor =
    role === 'player' ? myCharacter?.playerColor || myPlayerColor : myPlayerColor || '#d4ad5c';

  return (
    <>
      <header
        className="fixed top-0 inset-x-0 h-[44px] px-3 flex items-center justify-between gap-2 z-35 select-none bg-[#0c0e15]/94 backdrop-blur-[8px] border-b"
        style={{
          borderColor: 'rgba(184, 145, 70, 0.28)',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.72)',
        }}
      >
        {/* Left: Lobby chevron + Brand + Clean 2-Item Nav ("Ficha" + "Grimório" dropdown) */}
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => setInLobby(true)}
            className="rpg-btn-ghost w-7 h-7 rounded flex items-center justify-center cursor-pointer shrink-0"
            title="Voltar ao Lobby de Campanhas"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2 shrink-0 pr-2.5 border-r" style={{ borderColor: 'var(--border-hairline)' }}>
            <div className="w-6 h-6 rounded rpg-socket flex items-center justify-center text-[#d4ad5c]">
              <Swords className="w-3.5 h-3.5" />
            </div>
            <div className="hidden sm:flex flex-col leading-none">
              <span className="font-chronicle font-bold text-[10px] tracking-[0.2em] chronicle-gold-text">
                CHRONICLES
              </span>
              <span className="text-[11px] font-medium text-[#b6ab97] truncate max-w-[155px] mt-0.5">
                {campaign.name}
              </span>
            </div>
          </div>

          {/* Lean Navigation: Direct "Ficha" + "Grimório" Dropdown */}
          <nav className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => {
                setShowGrimoireMenu(false);
                toggleModal('sheet');
              }}
              className={`relative h-[44px] px-3 flex items-center gap-1.5 text-[13px] font-semibold tracking-wide transition cursor-pointer shrink-0 ${
                activeModal === 'sheet'
                  ? 'text-[#f0d89d] bg-[#d4ad5c]/10'
                  : 'text-[#c7bda9] hover:text-[#f3ece0] hover:bg-white/[0.04]'
              }`}
              title="Abrir Ficha do Personagem (C)"
            >
              <User className={`w-3.5 h-3.5 ${activeModal === 'sheet' ? 'text-[#d4ad5c]' : 'opacity-80'}`} />
              <span>Ficha</span>
              {activeModal === 'sheet' && (
                <span className="absolute bottom-0 inset-x-2 h-[2px] bg-[#d4ad5c]" />
              )}
            </button>

            <div ref={grimoireRef} className="relative">
              <button
                type="button"
                onClick={() => setShowGrimoireMenu((v) => !v)}
                className={`relative h-[44px] px-3 flex items-center gap-1.5 text-[13px] font-semibold tracking-wide transition cursor-pointer shrink-0 ${
                  showGrimoireMenu || activeGrimoireItem
                    ? 'text-[#f0d89d] bg-[#d4ad5c]/10'
                    : 'text-[#c7bda9] hover:text-[#f3ece0] hover:bg-white/[0.04]'
                }`}
                title="Abrir Grimório (Regras, NPCs, Missões, Diário, Som...)"
              >
                <BookOpen
                  className={`w-3.5 h-3.5 ${
                    showGrimoireMenu || activeGrimoireItem ? 'text-[#d4ad5c]' : 'opacity-80'
                  }`}
                />
                <span>{activeGrimoireItem ? activeGrimoireItem.label.split(' ')[0] : 'Grimório'}</span>
                {activeAmbientName && (
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-[#3ea66b]"
                    title={`Tocando: ${activeAmbientName}`}
                  />
                )}
                <ChevronDown
                  className={`w-3.5 h-3.5 opacity-75 transition-transform duration-150 ${
                    showGrimoireMenu ? 'rotate-180 text-[#d4ad5c]' : ''
                  }`}
                />
                {activeGrimoireItem && (
                  <span className="absolute bottom-0 inset-x-2 h-[2px] bg-[#d4ad5c]" />
                )}
              </button>

              {showGrimoireMenu && (
                <div className="absolute left-0 top-full mt-2 w-64 rpg-glass-panel rounded-lg p-1.5 z-50 animate-popover space-y-0.5">
                  <div className="px-2.5 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8f8574]">
                    Grimório da Campanha
                  </div>
                  {visibleGrimoireItems.map((item) => {
                    const isOpen = activeModal === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setShowGrimoireMenu(false);
                          toggleModal(item.id);
                        }}
                        className={`w-full px-2.5 py-2 rounded-md text-left flex items-center gap-2.5 transition cursor-pointer ${
                          isOpen
                            ? 'bg-[#d4ad5c]/15 border border-[#d4ad5c]/45 text-[#f2dba4]'
                            : 'border border-transparent hover:bg-white/[0.05] text-[#e5ddd0]'
                        }`}
                      >
                        <span
                          className={`shrink-0 ${
                            isOpen ? 'text-[#d4ad5c]' : 'text-[#a69b88]'
                          }`}
                        >
                          {item.icon}
                        </span>
                        <div className="min-w-0 flex-1 leading-tight">
                          <div className="text-xs font-semibold flex items-center gap-1.5">
                            <span className="truncate">{item.label}</span>
                            {item.id === 'soundboard' && activeAmbientName && (
                              <span className="w-1.5 h-1.5 rounded-full bg-[#3ea66b] shrink-0" />
                            )}
                          </div>
                          <div className="text-[10px] text-[#8f8574] truncate mt-0.5">
                            {item.desc}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </nav>
        </div>

        {/* Right: Lean Tactical Controls + Settings Cog */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Active Character Selector (GM) or Player Hero Badge */}
          {role === 'gm' ? (
            campaign.characters.length > 0 && (
              <select
                value={activeCharacterId}
                onChange={(e) => setActiveCharacterId(e.target.value)}
                className="rpg-input h-7 py-0 px-2 text-[11px] max-w-[138px] hidden xl:block"
                title="Personagem ativo para atalhos da Ficha"
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
              <button
                type="button"
                onClick={() => toggleModal('sheet')}
                className="hidden md:flex items-center gap-1.5 h-7 px-2.5 rounded rpg-card text-[11px] font-display font-semibold text-[#ece4d5] cursor-pointer"
                title="Abrir Ficha (C)"
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: currentColor }}
                />
                <span className="truncate max-w-[120px]">{myCharacter.name}</span>
              </button>
            )
          )}

          {/* Role Indicator + GM Player-View Toggle */}
          <div className="flex items-center gap-1">
            <div
              className={`h-7 px-2 rounded text-[11px] font-display font-bold flex items-center gap-1.5 border ${
                role === 'gm'
                  ? 'bg-[#251114] border-[#9e2427]/60 text-[#e8c683]'
                  : 'bg-[#151822] border-[#b89146]/35 text-[#d6c9b2]'
              }`}
            >
              {role === 'gm' ? (
                <Crown className="w-3.5 h-3.5 text-[#d4ad5c]" />
              ) : (
                <User className="w-3.5 h-3.5 text-[#a69b88]" />
              )}
              <span className="hidden lg:inline">{role === 'gm' ? 'Mestre' : 'Jogador'}</span>
            </div>

            {hasGmPrivilege && (
              <button
                type="button"
                onClick={() => setRole(role === 'gm' ? 'player' : 'gm')}
                className={`h-7 px-2 rounded text-[11px] font-medium flex items-center gap-1 cursor-pointer transition border ${
                  role === 'player'
                    ? 'bg-[#1c2838] border-[#4a90d9]/60 text-[#c9e1f8]'
                    : 'rpg-btn-ghost'
                }`}
                title={
                  role === 'gm'
                    ? 'Simular visão de Jogador na mesa'
                    : 'Voltar para o modo Mestre'
                }
              >
                <Eye className="w-3.5 h-3.5" />
                <span className="hidden 2xl:inline">
                  {role === 'gm' ? 'Ver Jogador' : 'Voltar Mestre'}
                </span>
              </button>
            )}
          </div>

          <div className="w-px h-4 bg-[#b89146]/20 mx-0.5 hidden sm:block" />

          {/* GM Quick Party Rest */}
          {role === 'gm' && campaign.characters.length > 0 && (
            <div ref={restMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setShowRestMenu((v) => !v)}
                className={`h-7 px-2 rounded text-[11px] font-display font-semibold flex items-center gap-1.5 cursor-pointer transition ${
                  showRestMenu
                    ? 'rpg-btn-primary'
                    : 'rpg-btn-ghost'
                }`}
                title="Conceder Descanso Curto ou Longo para o grupo"
              >
                <Moon className="w-3.5 h-3.5" />
                <span className="hidden xl:inline">Descanso</span>
              </button>

              {showRestMenu && (
                <div className="absolute right-0 top-full mt-2 w-64 rpg-glass-panel rounded-lg p-2 z-50 animate-popover space-y-1.5">
                  <div className="text-[10px] font-display font-bold uppercase tracking-[0.14em] text-[#a69b88] px-2 pt-0.5">
                    Descanso em Grupo
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      setShowRestMenu(false);
                      const ok = await openConfirmDialog(
                        'Aplicar Descanso Curto para todos os heróis vivos? (Recupera Dado de Vida, 1/3 de energia e cargas curtas)',
                        'Descanso Curto da Party',
                        { confirmLabel: 'Descanso Curto', cancelLabel: 'Cancelar' }
                      );
                      if (ok) partyRest('short');
                    }}
                    className="w-full px-2.5 py-2 rounded text-left rpg-card hover:border-[#d4ad5c]/60 flex items-center gap-2.5 cursor-pointer"
                  >
                    <Sun className="w-4 h-4 text-[#d4ad5c] shrink-0" />
                    <div className="leading-tight">
                      <div className="text-xs font-display font-bold text-[#ece4d5]">
                        Descanso Curto
                      </div>
                      <div className="text-[10px] text-[#a69b88] mt-0.5">
                        Dado de Vida + 1/3 recurso + cargas curtas
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setShowRestMenu(false);
                      const ok = await openConfirmDialog(
                        'Aplicar Descanso Longo para todos os heróis vivos? (Restaura 100% PV, recurso, cargas, remove Exaustão e encerra concentrações)',
                        'Descanso Longo da Party',
                        { confirmLabel: 'Descanso Longo', cancelLabel: 'Cancelar' }
                      );
                      if (ok) partyRest('long');
                    }}
                    className="w-full px-2.5 py-2 rounded text-left rpg-card hover:border-[#4a90d9]/60 flex items-center gap-2.5 cursor-pointer"
                  >
                    <Moon className="w-4 h-4 text-[#6ba3dc] shrink-0" />
                    <div className="leading-tight">
                      <div className="text-xs font-display font-bold text-[#ece4d5]">
                        Descanso Longo
                      </div>
                      <div className="text-[10px] text-[#a69b88] mt-0.5">
                        100% PV/PM + todas as cargas + zera fadiga
                      </div>
                    </div>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* GM Quick Undo */}
          {role === 'gm' && (
            <button
              type="button"
              onClick={undoLastAction}
              disabled={!canUndo}
              className="rpg-btn-ghost w-7 h-7 rounded flex items-center justify-center cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              title={`Desfazer última ação do Mestre (Ctrl+Z)${undoCount > 0 ? ` — ${undoCount} no histórico` : ''}`}
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Quick Mute / Unmute Button (Works for BOTH Players and GM without stopping ambient music!) */}
          <button
            type="button"
            onClick={handleToggleQuickMute}
            className={`w-7 h-7 rounded flex items-center justify-center cursor-pointer transition border ${
              audioMuted
                ? 'bg-[#2d1012] border-[#9e2427]/65 text-[#f09a9d]'
                : 'rpg-btn-ghost border-transparent text-[#d4ad5c]'
            }`}
            title={
              audioMuted
                ? 'Som desativado — clique para reativar música e efeitos'
                : 'Silenciar temporariamente (música volta de onde parou ao reativar)'
            }
          >
            {audioMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>

          {/* Anchored Online Roster Popover */}
          <div ref={onlineRef} className="relative">
            <button
              type="button"
              onClick={() => setShowOnlineRoster((v) => !v)}
              className={`h-7 px-2 rounded text-[11px] font-mono-dice font-semibold flex items-center gap-1.5 cursor-pointer transition ${
                showOnlineRoster ? 'rpg-btn-primary' : 'rpg-btn-ghost'
              }`}
              title="Jogadores conectados na sala"
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isConnected ? 'bg-[#3ea66b]' : 'bg-[#d4ad5c]'
                }`}
              />
              <span>{connectedPlayers.length || connectedClients}</span>
            </button>

            {showOnlineRoster && (
              <div className="absolute right-0 top-full mt-2 w-72 rpg-glass-panel rounded-lg p-3 z-50 animate-popover space-y-2.5 text-xs">
                <div
                  className="flex items-center justify-between pb-2 border-b"
                  style={{ borderColor: 'var(--border-hairline)' }}
                >
                  <div className="flex items-center gap-2">
                    <Users className="w-3.5 h-3.5 text-[#d4ad5c]" />
                    <span className="font-display font-bold text-[11px] uppercase tracking-[0.12em] text-[#ece4d5]">
                      Conectados ({connectedPlayers.length || connectedClients})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowOnlineRoster(false)}
                    className="text-[#a69b88] hover:text-[#ece4d5] cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {connectedPlayers.length === 0 ? (
                    <div className="text-[11px] font-lore italic text-[#a69b88] py-3 text-center">
                      Sessão local ativa ({connectedClients} na sala).
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
                        className={`rpg-card rounded px-2.5 py-2 flex items-center justify-between gap-2 ${
                          role === 'gm' && plr.characterId ? 'cursor-pointer' : ''
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/40"
                            style={{ backgroundColor: plr.playerColor }}
                          />
                          <div className="min-w-0">
                            <div className="font-display font-bold text-xs text-[#ece4d5] truncate">
                              {plr.playerName}
                            </div>
                            <div className="text-[10px] text-[#a69b88] truncate">
                              {plr.role === 'gm'
                                ? 'Mestre da Mesa'
                                : plr.characterName
                                  ? plr.characterName
                                  : 'Criando Personagem...'}
                            </div>
                          </div>
                        </div>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-display font-semibold uppercase tracking-wider shrink-0 border ${
                            plr.role === 'gm'
                              ? 'bg-[#241c10] border-[#b89146]/50 text-[#e8c683]'
                              : 'bg-[#102219] border-[#2f8556]/45 text-[#86d9a8]'
                          }`}
                        >
                          {plr.role === 'gm' ? 'Mestre' : 'Online'}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Invite / Connection Button */}
          <button
            type="button"
            onClick={() => {
              setRemoteInput(serverUrl);
              setShowNetworkModal(true);
            }}
            className="h-7 px-2.5 rounded rpg-card hover:border-[#d4ad5c]/60 text-[11px] font-display font-semibold flex items-center gap-1.5 cursor-pointer"
            title="Convidar Jogadores / Link da Sala"
          >
            {isConnected ? (
              <Wifi className="w-3.5 h-3.5 text-[#3ea66b]" />
            ) : (
              <WifiOff className="w-3.5 h-3.5 text-[#d4ad5c]" />
            )}
            <span className="hidden md:inline">Convidar</span>
          </button>

          {/* Settings / Utilities Popover */}
          <div ref={settingsRef} className="relative">
            <button
              type="button"
              onClick={() => setShowSettingsMenu((v) => !v)}
              className={`w-7 h-7 rounded flex items-center justify-center cursor-pointer transition ${
                showSettingsMenu ? 'rpg-btn-primary' : 'rpg-btn-ghost'
              }`}
              title="Configurações, Cor, Backup JSON e Atalhos"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>

            {showSettingsMenu && (
              <div className="absolute right-0 top-full mt-2 w-72 rpg-glass-panel rounded-lg p-3 z-50 animate-popover space-y-3 text-xs">
                {/* Player Color */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-[10px] font-display font-bold uppercase tracking-[0.14em] text-[#a69b88]">
                    <Palette className="w-3 h-3 text-[#d4ad5c]" />
                    <span>Sua Cor na Mesa</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {PLAYER_COLOR_PALETTE.map((col) => (
                      <button
                        key={col}
                        type="button"
                        onClick={() => setMyPlayerColor(col)}
                        className={`w-5 h-5 rounded-full cursor-pointer transition border ${
                          currentColor.toLowerCase() === col.toLowerCase()
                            ? 'border-white scale-110 ring-1 ring-[#d4ad5c]'
                            : 'border-white/30 hover:scale-105'
                        }`}
                        style={{ backgroundColor: col }}
                      />
                    ))}
                    <input
                      type="color"
                      value={currentColor}
                      onChange={(e) => setMyPlayerColor(e.target.value)}
                      className="w-5 h-5 rounded cursor-pointer bg-transparent border-0"
                      title="Cor personalizada"
                    />
                  </div>
                </div>

                <div className="h-px bg-[#b89146]/18" />

                {/* Live UI Font Selector */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#a69b88]">
                    <Type className="w-3 h-3 text-[#d4ad5c]" />
                    <span>Fonte da Interface</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {UI_FONT_OPTIONS.map((opt) => {
                      const active = uiFont === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => applyUiFont(opt.id)}
                          className={`px-2 py-1.5 rounded text-left cursor-pointer transition border ${
                            active
                              ? 'bg-[#2a2112] border-[#d4ad5c] text-[#f3dfb0]'
                              : 'rpg-card hover:border-[#d4ad5c]/50 text-[#dcd4c6]'
                          }`}
                        >
                          <div
                            className="text-[13px] font-semibold leading-tight truncate"
                            style={{ fontFamily: opt.css }}
                          >
                            {opt.label}
                          </div>
                          <div className="text-[10px] text-[#8f8574] truncate mt-0.5">
                            {opt.note}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="h-px bg-[#b89146]/18" />

                {/* Individual Audio Mixer (Music & SFX Volume + Mute for Players & GM) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-[10px] font-display font-bold uppercase tracking-[0.14em] text-[#a69b88]">
                      {audioMuted ? (
                        <VolumeX className="w-3 h-3 text-[#e07a7d]" />
                      ) : (
                        <Volume2 className="w-3 h-3 text-[#d4ad5c]" />
                      )}
                      <span>Volume Pessoal</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleToggleQuickMute}
                      className={`px-2 py-0.5 rounded text-[10px] font-display font-semibold cursor-pointer border ${
                        audioMuted
                          ? 'bg-[#2d1012] border-[#9e2427]/65 text-[#f0a5a8]'
                          : 'rpg-card text-[#d4ad5c]'
                      }`}
                    >
                      {audioMuted ? 'Reativar Som' : 'Silenciar'}
                    </button>
                  </div>
                  <label className="block space-y-0.5">
                    <div className="flex items-center justify-between text-[11px] text-[#c7beae]">
                      <span>Música / Ambiente</span>
                      <span className="font-mono-dice text-[10px] text-[#d4ad5c]">{musicVol}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={musicVol}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setMusicVol(v);
                        soundEngine.setMusicVolume(v / 100);
                        if (v > 0 && soundEngine.getMuted()) {
                          soundEngine.setMuted(false);
                          setAudioMuted(false);
                        }
                      }}
                      className="w-full accent-[#d4ad5c] cursor-pointer"
                    />
                  </label>
                  <label className="block space-y-0.5">
                    <div className="flex items-center justify-between text-[11px] text-[#c7beae]">
                      <span>Efeitos Sonoros (SFX)</span>
                      <span className="font-mono-dice text-[10px] text-[#d4ad5c]">{sfxVol}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={sfxVol}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setSfxVol(v);
                        soundEngine.setSfxVolume(v / 100);
                      }}
                      className="w-full accent-[#d4ad5c] cursor-pointer"
                    />
                  </label>
                </div>

                {role === 'gm' && (
                  <>
                    <div className="h-px bg-[#b89146]/18" />

                    {/* Campaign Backup Actions (GM Only) */}
                    <div className="space-y-1">
                      <div className="text-[10px] font-display font-bold uppercase tracking-[0.14em] text-[#a69b88] mb-1.5">
                        Campanha &amp; Backup
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          handleExportJson();
                          setShowSettingsMenu(false);
                        }}
                        className="w-full px-2.5 py-1.5 rounded rpg-btn-ghost flex items-center gap-2 text-xs cursor-pointer text-left"
                      >
                        <Download className="w-3.5 h-3.5 text-[#d4ad5c]" />
                        <span>Exportar Campanha (JSON)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          fileInputRef.current?.click();
                          setShowSettingsMenu(false);
                        }}
                        className="w-full px-2.5 py-1.5 rounded rpg-btn-ghost flex items-center gap-2 text-xs cursor-pointer text-left"
                      >
                        <Upload className="w-3.5 h-3.5 text-[#d4ad5c]" />
                        <span>Importar Campanha (JSON)</span>
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          setShowSettingsMenu(false);
                          if (
                            await openConfirmDialog(
                              'Restaurar esta campanha para o pacote inicial padrão?',
                              'Restaurar Campanha'
                            )
                          ) {
                            resetCampaign();
                          }
                        }}
                        className="w-full px-2.5 py-1.5 rounded hover:bg-[#3a1215] border border-transparent hover:border-[#9e2427]/50 text-[#e07a7d] flex items-center gap-2 text-xs cursor-pointer text-left transition"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Restaurar Seed Inicial</span>
                      </button>
                    </div>
                  </>
                )}

                <div className="h-px bg-[#b89146]/18" />

                {/* Keyboard Shortcuts Reference */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[10px] font-display font-bold uppercase tracking-[0.14em] text-[#a69b88]">
                    <Keyboard className="w-3 h-3 text-[#d4ad5c]" />
                    <span>Atalhos de Teclado</span>
                  </div>
                  <div className="grid grid-cols-2 gap-y-1 gap-x-2 text-[11px] text-[#a69b88]">
                    <div className="flex items-center justify-between">
                      <span>Ficha</span>
                      <kbd className="rpg-kbd">C</kbd>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Crônica</span>
                      <kbd className="rpg-kbd">Tab</kbd>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Ações</span>
                      <kbd className="rpg-kbd">1–9</kbd>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Turno</span>
                      <kbd className="rpg-kbd">Espaço</kbd>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Fechar</span>
                      <kbd className="rpg-kbd">Esc</kbd>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Desfazer</span>
                      <kbd className="rpg-kbd">Ctrl+Z</kbd>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            onChange={handleImportFile}
            className="hidden"
          />
        </div>
      </header>

      {/* Network / Room Invite Modal (Unified Grimoire Shell) */}
      {showNetworkModal && (
        <GrimoireModal
          title="Convidar Jogadores"
          subtitle="Link público pela internet ou código local / VPN"
          icon={<Globe className="w-4 h-4" />}
          onClose={() => setShowNetworkModal(false)}
          size="md"
          bodyClassName="p-4 space-y-3.5 text-xs"
        >
          {/* Public Tunnel & Host LAN/VPN Codes (GM Host Only) */}
          {hasGmPrivilege && (
            <>
              <div className="rpg-card rounded-md p-3.5 space-y-2.5 border-[#b89146]/40">
                <div>
                  <div className="font-display font-bold text-xs uppercase tracking-wider text-[#e8c683] flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5" />
                    <span>Link Direto pela Internet (Sem VPN)</span>
                  </div>
                  <p className="text-[11px] text-[#a69b88] mt-1">
                    Seus jogadores entram direto pelo navegador ou colam o link no Lobby.
                  </p>
                </div>

                {publicTunnel.status === 'active' && publicTunnel.url ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 px-3 py-2 rounded bg-[#0c1c14] border border-[#2f8556]/55">
                      <span className="font-mono-dice font-semibold text-xs text-[#9ae2b8] truncate select-all">
                        {publicTunnel.url}
                      </span>
                      <button
                        type="button"
                        onClick={() => copyValue(publicTunnel.url, 'tunnel-url')}
                        className="rpg-btn-primary px-2.5 py-1 rounded text-[11px] flex items-center gap-1 cursor-pointer shrink-0"
                      >
                        <Copy className="w-3 h-3" />
                        {copiedKey === 'tunnel-url' ? 'Copiado' : 'Copiar'}
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[10px]">
                      <span className="text-[#86d9a8]">Túnel ativo — compartilhe com a mesa.</span>
                      <button
                        type="button"
                        onClick={stopPublicTunnel}
                        className="px-2 py-1 rounded bg-[#2d1012] border border-[#9e2427]/55 text-[#f0a5a8] hover:bg-[#3f1518] cursor-pointer shrink-0"
                      >
                        Encerrar Link
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {publicTunnel.status === 'error' && publicTunnel.error && (
                      <div className="px-2.5 py-1.5 rounded bg-[#2d1012] border border-[#9e2427]/60 text-[#f2b3b5] text-[11px]">
                        {publicTunnel.error}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={startPublicTunnel}
                      disabled={publicTunnel.status === 'starting'}
                      className="w-full rpg-btn-primary px-3 py-2 rounded text-xs flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Globe className="w-3.5 h-3.5" />
                      <span>
                        {publicTunnel.status === 'starting'
                          ? 'Abrindo link público...'
                          : 'Gerar Link Público da Mesa'}
                      </span>
                    </button>
                  </div>
                )}
              </div>

              {/* Local / VPN Codes */}
              <div className="rpg-card rounded-md p-3.5 space-y-2">
                <div className="font-display font-bold text-xs uppercase tracking-wider text-[#d4ad5c]">
                  Códigos Locais / VPN (Wi-Fi ou Radmin)
                </div>
                <div className="space-y-1.5">
                  {networkAddresses.map((addr) => (
                    <div
                      key={addr.url}
                      className="flex items-center justify-between gap-2 px-2.5 py-2 rounded rpg-well"
                    >
                      <div className="min-w-0">
                        <div className="text-[10px] text-[#a69b88] truncate">
                          {addr.name} • {addr.url}
                        </div>
                        <div className="font-mono-dice font-bold text-sm text-[#e8c683]">
                          {addr.roomCode}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyValue(addr.roomCode, addr.roomCode)}
                        className="rpg-btn-primary px-2.5 py-1 rounded text-[11px] flex items-center gap-1 cursor-pointer shrink-0"
                      >
                        <Copy className="w-3 h-3" />
                        {copiedKey === addr.roomCode ? 'Copiado' : 'Copiar'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Manual Connect */}
          <div className="rpg-card rounded-md p-3.5 space-y-2">
            <div className="font-display font-bold text-xs uppercase tracking-wider text-[#ece4d5]">
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
                type="button"
                onClick={() => {
                  setServerUrl(remoteInput);
                  setShowNetworkModal(false);
                }}
                className="rpg-btn-primary px-3 py-1.5 rounded text-xs cursor-pointer"
              >
                Conectar
              </button>
            </div>
          </div>
        </GrimoireModal>
      )}
    </>
  );
};
