import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CheckCircle2,
  Dices,
  EyeOff,
  Flame,
  Heart,
  ImagePlus,
  Loader2,
  Lock,
  Maximize2,
  MessageSquare,
  MessageSquareQuote,
  ScrollText,
  Send,
  Shield,
  ShieldAlert,
  Skull,
  Sparkles,
  Swords,
  Trash2,
  X,
} from 'lucide-react';
import { useCampaign } from '../context/CampaignContext';
import {
  computeCharacterStats,
  maskHiddenNameForRole,
  maskHiddenNamesInText,
} from '../shared/rulesEngine';
import { CombatLogEntry } from '../shared/types';
import { FormulaBuilderInput } from './FormulaBuilderInput';
import { OrnateFrame } from './OrnateFrame';

interface RightSidebarProps {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}

const getEntityColorClass = (kind?: CombatLogEntry['actorKind']) => {
  if (kind === 'monster') return 'text-[#e07a7d] font-semibold';
  if (kind === 'npc') return 'text-[#d4ad5c] font-semibold';
  if (kind === 'hero') return 'text-[#8ec5f0] font-semibold';
  return 'text-[#c2b8a6] font-medium';
};

const getCategoryIcon = (cat: CombatLogEntry['category']) => {
  switch (cat) {
    case 'attack':
    case 'damage':
      return <Swords className="w-3 h-3 text-[#d6575b] shrink-0 mt-0.5" />;
    case 'heal':
      return <Heart className="w-3 h-3 text-[#4cb378] shrink-0 mt-0.5" />;
    case 'condition':
      return <Shield className="w-3 h-3 text-[#b589e6] shrink-0 mt-0.5" />;
    case 'death':
      return <Skull className="w-3 h-3 text-[#e05256] shrink-0 mt-0.5" />;
    case 'revive':
      return <Sparkles className="w-3 h-3 text-[#6fd49a] shrink-0 mt-0.5" />;
    case 'spell':
      return <Flame className="w-3 h-3 text-[#d4ad5c] shrink-0 mt-0.5" />;
    case 'xp':
    case 'levelup':
      return <Sparkles className="w-3 h-3 text-[#e8c683] shrink-0 mt-0.5" />;
    default:
      return <ScrollText className="w-3 h-3 text-[#8c8374] shrink-0 mt-0.5" />;
  }
};

export const RightSidebar: React.FC<RightSidebarProps> = ({ open, onOpen, onClose }) => {
  const {
    campaign,
    role,
    myPlayerId,
    myCharacter,
    activeCharacterId,
    connectedPlayers,
    advantageMode,
    setAdvantageMode,
    secretRoll,
    setSecretRoll,
    quickRollFormula,
    applyDamage,
    updateCampaign,
    chatMessages,
    unreadChatCount,
    sendChatMessage,
    markChatRead,
    serverUrl,
    resolveAssetUrl,
  } = useCampaign();

  const [activeTab, setActiveTab] = useState<'combat' | 'dice' | 'chat'>('combat');
  const [combatFilter, setCombatFilter] = useState<'all' | 'combat' | 'effects'>('all');
  const [customFormula, setCustomFormula] = useState('1d20 + FOR + PROF');
  const [chatInput, setChatInput] = useState('');
  const [chatRecipient, setChatRecipient] = useState<string>('');
  const [gmSpeakerKey, setGmSpeakerKey] = useState<string>('');
  const [pendingChatImage, setPendingChatImage] = useState<{ url: string; name: string } | null>(
    null
  );
  const [uploadingChatImage, setUploadingChatImage] = useState(false);
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const chatImageInputRef = useRef<HTMLInputElement | null>(null);
  const combatScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!lightboxImageUrl) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setLightboxImageUrl(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxImageUrl]);

  const combatEntries = campaign.combatLog || [];
  const filteredCombat = useMemo(
    () =>
      combatEntries.filter((e) => {
        if (combatFilter === 'combat') {
          return (
            e.category === 'attack' ||
            e.category === 'damage' ||
            e.category === 'death' ||
            e.category === 'revive' ||
            e.category === 'spell'
          );
        }
        if (combatFilter === 'effects') {
          return (
            e.category === 'condition' ||
            e.category === 'heal' ||
            e.category === 'xp' ||
            e.category === 'levelup'
          );
        }
        return true;
      }),
    [combatEntries, combatFilter]
  );

  useEffect(() => {
    if (open && activeTab === 'chat') {
      markChatRead();
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [open, activeTab, chatMessages.length, markChatRead]);

  useEffect(() => {
    if (open && activeTab === 'combat' && combatScrollRef.current) {
      combatScrollRef.current.scrollTop = combatScrollRef.current.scrollHeight;
    }
  }, [open, activeTab, filteredCombat.length]);

  const recipientOptions = useMemo(() => {
    const seen = new Set<string>();
    const list: Array<{ value: string; label: string }> = [
      { value: '', label: 'Todos na Mesa (Público)' },
    ];
    if (role !== 'gm') {
      list.push({ value: 'Mestre', label: 'Sussurrar: Mestre (Privado)' });
      seen.add('mestre');
      seen.add((campaign.gmName || 'Mestre').trim().toLowerCase());
    }
    connectedPlayers.forEach((p) => {
      // Never list GM under a hero/token name — GM is always represented by "Mestre (Privado)" above
      if (p.role === 'gm') return;
      if (p.playerId === myPlayerId) return;
      const displayName = (p.characterName || p.playerName || '').trim();
      if (!displayName) return;
      const key = displayName.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      list.push({
        value: displayName,
        label: `Sussurrar: ${displayName}`,
      });
    });
    campaign.characters.forEach((c) => {
      if (role === 'player' && myCharacter && c.id === myCharacter.id) return;
      const key = c.name.trim().toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      list.push({
        value: c.name,
        label: `Sussurrar: ${c.name}`,
      });
    });
    return list;
  }, [connectedPlayers, campaign.characters, campaign.gmName, myCharacter, myPlayerId, role]);

  const activeChar =
    role === 'player'
      ? myCharacter
      : campaign.characters.find((c) => c.id === activeCharacterId) ||
        campaign.characters[0];
  const activeStats = activeChar ? computeCharacterStats(activeChar, campaign) : null;

  const diceTypes = [4, 6, 8, 10, 12, 20, 100];

  const handleQuickDie = (sides: number) => {
    quickRollFormula(`Dado d${sides}`, `1d${sides}`);
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customFormula.trim()) return;
    quickRollFormula('Rolagem Customizada', customFormula.trim());
  };

  const uploadChatImageFile = (file: File) => {
    if (!file || !file.type.startsWith('image/')) return;
    setUploadingChatImage(true);
    const fallbackName = file.name || `imagem-${Date.now()}.png`;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result || '');
      if (!dataUrl) {
        setUploadingChatImage(false);
        return;
      }
      try {
        const base = serverUrl || '';
        const res = await fetch(`${base}/api/upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: fallbackName, dataUrl }),
        });
        if (res.ok) {
          const data = (await res.json()) as { url: string; filename?: string };
          setPendingChatImage({ url: data.url, name: data.filename || fallbackName });
        } else {
          setPendingChatImage({ url: dataUrl, name: fallbackName });
        }
      } catch {
        setPendingChatImage({ url: dataUrl, name: fallbackName });
      } finally {
        setUploadingChatImage(false);
      }
    };
    reader.onerror = () => setUploadingChatImage(false);
    reader.readAsDataURL(file);
  };

  const handleChatImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadChatImageFile(file);
    e.target.value = '';
  };

  const handleChatPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          uploadChatImageFile(file);
          return;
        }
      }
    }
  };

  const gmSpeakerOptions = useMemo(() => {
    if (role !== 'gm') return [];
    const activeMap =
      campaign.maps.find((m) => m.id === campaign.activeMapId) || campaign.maps[0];
    const opts: Array<{
      key: string;
      label: string;
      name: string;
      color: string;
      tokenId?: string;
      npcId?: string;
    }> = [];
    const seenNpcIds = new Set<string>();

    (activeMap?.tokens || [])
      .filter((t) => t.type === 'npc' || t.type === 'monster')
      .forEach((tok) => {
        if (tok.type === 'npc' && tok.referenceId) seenNpcIds.add(tok.referenceId);
        opts.push({
          key: `tok:${tok.id}`,
          label: `${tok.name} (${tok.type === 'monster' ? 'Monstro no mapa' : 'NPC no mapa'})`,
          name: tok.name,
          color: tok.color || '#d4ad5c',
          tokenId: tok.id,
          npcId: tok.type === 'npc' ? tok.referenceId : undefined,
        });
      });

    campaign.npcs.forEach((npc) => {
      if (seenNpcIds.has(npc.id)) return;
      const color =
        npc.tokenColor ||
        (npc.disposition === 'Hostil'
          ? '#ef4444'
          : npc.disposition === 'Aliado'
            ? '#22c55e'
            : '#d4ad5c');
      opts.push({
        key: `npc:${npc.id}`,
        label: `${npc.name} (NPC)`,
        name: npc.name,
        color,
        npcId: npc.id,
      });
    });

    return opts;
  }, [campaign.activeMapId, campaign.maps, campaign.npcs, role]);

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (uploadingChatImage) return;
    const trimmed = chatInput.trim();
    if (!trimmed && !pendingChatImage?.url) return;
    const selectedSpeaker =
      role === 'gm' && gmSpeakerKey
        ? gmSpeakerOptions.find((o) => o.key === gmSpeakerKey)
        : undefined;
    sendChatMessage(
      trimmed,
      chatRecipient || undefined,
      pendingChatImage?.url,
      selectedSpeaker
        ? {
            speakerOverride: {
              name: selectedSpeaker.name,
              color: selectedSpeaker.color,
              tokenId: selectedSpeaker.tokenId,
              npcId: selectedSpeaker.npcId,
              fireBubble: true,
            },
          }
        : undefined
    );
    setChatInput('');
    setPendingChatImage(null);
  };

  const visibleLogs = campaign.rollLog.filter((entry) => role === 'gm' || !entry.isSecret);
  const recentMiniFeed = combatEntries.slice(-3);

  // Collapsed State: Anchored top-right Chronicle Tab + Whisper-quiet Bottom-Right Mini Feed (zero overlap!)
  if (!open) {
    return (
      <>
        <div className="fixed top-[54px] right-3 z-25 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              if (unreadChatCount > 0) {
                setActiveTab('chat');
                markChatRead();
              }
              onOpen();
            }}
            className="rpg-rail rounded-md h-8 px-2.5 flex items-center gap-2 text-[11px] font-display font-semibold text-[#ece4d5] hover:border-[#d4ad5c]/65 cursor-pointer transition"
            title="Abrir Crônica (Combate, Dados e Chat) — Atalho: Tab"
          >
            <ScrollText className="w-3.5 h-3.5 text-[#d4ad5c]" />
            <span>Crônica</span>
            {unreadChatCount > 0 ? (
              <span className="px-1.5 py-0.5 rounded bg-[#6b3fa0] text-white text-[9px] font-mono-dice font-bold leading-none">
                {unreadChatCount > 9 ? '9+' : unreadChatCount}
              </span>
            ) : (
              <kbd className="rpg-kbd hidden sm:inline-flex">Tab</kbd>
            )}
          </button>
        </div>

        {/* Quiet 3-line recent combat ticker (bottom-right, clicks open Chronicle > Combate) */}
        {recentMiniFeed.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setActiveTab('combat');
              onOpen();
            }}
            className="fixed bottom-[94px] right-3 z-20 w-[285px] text-left bg-[#0c0e15]/82 hover:bg-[#11141e]/94 border border-[#b89146]/22 hover:border-[#d4ad5c]/48 rounded-md px-2.5 py-2 space-y-1 transition cursor-pointer backdrop-blur-[4px]"
            title="Abrir Registro Completo na Crônica (Tab)"
          >
            <div className="flex items-center justify-between text-[9px] font-display uppercase tracking-[0.14em] text-[#8c8374]">
              <span>Últimos Eventos</span>
              <span className="font-mono-dice">{combatEntries.length}</span>
            </div>
            {recentMiniFeed.map((entry, idx) => (
              <div
                key={entry.id}
                className="flex items-start gap-1.5 text-[11px] leading-tight truncate"
                style={{ opacity: idx === recentMiniFeed.length - 1 ? 1 : 0.65 }}
              >
                {getCategoryIcon(entry.category)}
                <span className="truncate">
                  <span
                    className={getEntityColorClass(entry.actorKind)}
                    style={
                      entry.actorKind === 'hero' && entry.actorColor
                        ? { color: entry.actorColor }
                        : undefined
                    }
                  >
                    {maskHiddenNameForRole(entry.actorName, role, campaign)}
                  </span>{' '}
                  <span className="text-[#d6cec0]">
                    {maskHiddenNamesInText(entry.summary, role, campaign)}
                  </span>
                  {entry.targetName && (
                    <>
                      {' '}
                      <span className={getEntityColorClass(entry.targetKind)}>
                        {maskHiddenNameForRole(entry.targetName, role, campaign)}
                      </span>
                    </>
                  )}
                </span>
              </div>
            ))}
          </button>
        )}
      </>
    );
  }

  return (
    <aside className="fixed top-[52px] right-3 bottom-[92px] z-30 w-[336px] sm:w-[360px] animate-drawer-right pointer-events-auto">
      <OrnateFrame
        accentColor="#b89146"
        cornerSize={12}
        className="rpg-glass-panel rpg-grain rounded-lg h-full flex flex-col overflow-hidden"
      >
        {/* Header + 3-Tab Switcher */}
        <div
          className="px-2.5 py-2 border-b flex items-center justify-between gap-2 shrink-0 bg-[#0d0f16]"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="grid grid-cols-3 gap-1 flex-1 min-w-0">
            <button
              type="button"
              onClick={() => setActiveTab('combat')}
              className={`px-2 py-1.5 rounded text-[11px] font-display font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition ${
                activeTab === 'combat'
                  ? 'rpg-btn-primary'
                  : 'rpg-btn-ghost text-[#a69b88]'
              }`}
            >
              <ScrollText className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Combate</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('dice')}
              className={`px-2 py-1.5 rounded text-[11px] font-display font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition ${
                activeTab === 'dice'
                  ? 'rpg-btn-primary'
                  : 'rpg-btn-ghost text-[#a69b88]'
              }`}
            >
              <Dices className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Dados</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('chat');
                markChatRead();
              }}
              className={`relative px-2 py-1.5 rounded text-[11px] font-display font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition ${
                activeTab === 'chat'
                  ? 'rpg-btn-primary'
                  : 'rpg-btn-ghost text-[#a69b88]'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Chat</span>
              {unreadChatCount > 0 && activeTab !== 'chat' && (
                <span className="px-1 py-0.2 rounded bg-[#6b3fa0] text-white text-[9px] font-mono-dice font-bold leading-none">
                  {unreadChatCount > 9 ? '9+' : unreadChatCount}
                </span>
              )}
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rpg-card w-7 h-7 rounded flex items-center justify-center text-[#a69b88] hover:text-[#ece4d5] cursor-pointer shrink-0"
            title="Recolher Crônica (Tab)"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* TAB 1: UNIFIED COMBAT LOG */}
        {activeTab === 'combat' && (
          <>
            <div
              className="px-3 py-1.5 border-b flex items-center justify-between gap-2 bg-[#0b0d13] shrink-0"
              style={{ borderColor: 'var(--border-hairline)' }}
            >
              <div className="flex items-center gap-1 text-[10px]">
                {(
                  [
                    { id: 'all', label: 'Tudo' },
                    { id: 'combat', label: 'Combate' },
                    { id: 'effects', label: 'Cura / Efeitos' },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setCombatFilter(f.id)}
                    className={`px-2 py-0.5 rounded font-display font-semibold cursor-pointer transition ${
                      combatFilter === f.id
                        ? 'bg-[#221d14] text-[#e8c683] border border-[#b89146]/50'
                        : 'text-[#8c8374] hover:text-[#ece4d5]'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              {role === 'gm' && combatEntries.length > 0 && (
                <button
                  type="button"
                  onClick={() => updateCampaign((prev) => ({ ...prev, combatLog: [] }))}
                  className="p-1 rounded text-[#b35c60] hover:text-[#f0a5a8] hover:bg-[#2d1012] cursor-pointer transition"
                  title="Limpar registro de combate"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div
              ref={combatScrollRef}
              className="flex-1 overflow-y-auto p-3 space-y-1.5 min-h-0 bg-[#090b10]"
            >
              {filteredCombat.length === 0 ? (
                <div className="text-center italic text-[#6c6457] py-12 font-lore text-sm px-4">
                  As ações de combate, magias, condições, mortes e XP aparecerão registradas nesta crônica.
                </div>
              ) : (
                filteredCombat.slice(-100).map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-start gap-2 px-2.5 py-1.5 rounded bg-[#10131c]/80 border border-[#b89146]/10 hover:border-[#b89146]/25 transition text-[11px] leading-snug"
                    title={maskHiddenNamesInText(entry.detail || entry.summary, role, campaign)}
                  >
                    {getCategoryIcon(entry.category)}
                    <div className="min-w-0 flex-1">
                      <span
                        className={getEntityColorClass(entry.actorKind)}
                        style={
                          entry.actorKind === 'hero' && entry.actorColor
                            ? { color: entry.actorColor }
                            : undefined
                        }
                      >
                        {maskHiddenNameForRole(entry.actorName, role, campaign)}
                      </span>{' '}
                      <span
                        className={
                          entry.category === 'death'
                            ? 'text-[#f08b8e] font-semibold'
                            : entry.category === 'heal' || entry.category === 'revive'
                              ? 'text-[#86d9a8]'
                              : entry.category === 'condition'
                                ? 'text-[#c9a8f0]'
                                : entry.category === 'xp' || entry.category === 'levelup'
                                  ? 'text-[#e8c683] font-semibold'
                                  : 'text-[#ddd5c7]'
                        }
                      >
                        {maskHiddenNamesInText(entry.summary, role, campaign)}
                      </span>
                      {entry.targetName && (
                        <>
                          {' '}
                          <span
                            className={getEntityColorClass(entry.targetKind)}
                            style={
                              entry.targetKind === 'hero' && entry.targetColor
                                ? { color: entry.targetColor }
                                : undefined
                            }
                          >
                            {maskHiddenNameForRole(entry.targetName, role, campaign)}
                          </span>
                        </>
                      )}
                      {entry.detail && (
                        <div className="text-[10px] text-[#8c8374] font-mono-dice truncate mt-0.5">
                          {maskHiddenNamesInText(entry.detail, role, campaign)}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {/* TAB 2: DICE TRAY & ROLL HISTORY */}
        {activeTab === 'dice' && (
          <>
            <div
              className="p-3 border-b space-y-2.5 shrink-0 bg-[#0d0f16]"
              style={{ borderColor: 'var(--border-hairline)' }}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-[#a69b88]">Modo de d20</span>
                <div
                  className="flex rounded overflow-hidden border text-[10px] font-display font-semibold"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  <button
                    type="button"
                    onClick={() => setAdvantageMode('normal')}
                    className={`px-2.5 py-1 cursor-pointer transition ${
                      advantageMode === 'normal'
                        ? 'bg-[#2a2316] text-[#e8c683]'
                        : 'bg-[#0a0c11] text-[#8c8374] hover:text-[#ece4d5]'
                    }`}
                  >
                    Normal
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdvantageMode('advantage')}
                    className={`px-2.5 py-1 cursor-pointer transition border-x border-[#b89146]/20 ${
                      advantageMode === 'advantage'
                        ? 'bg-[#123322] text-[#86d9a8]'
                        : 'bg-[#0a0c11] text-[#8c8374] hover:text-[#ece4d5]'
                    }`}
                  >
                    Vant.
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdvantageMode('disadvantage')}
                    className={`px-2.5 py-1 cursor-pointer transition ${
                      advantageMode === 'disadvantage'
                        ? 'bg-[#361316] text-[#f09a9d]'
                        : 'bg-[#0a0c11] text-[#8c8374] hover:text-[#ece4d5]'
                    }`}
                  >
                    Desv.
                  </button>
                </div>
              </div>

              {/* Quick Dice Keys */}
              <div className="grid grid-cols-7 gap-1">
                {diceTypes.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => handleQuickDie(d)}
                    className={`rpg-hotbar-slot py-1.5 rounded text-[11px] font-mono-dice font-bold text-center cursor-pointer ${
                      d === 20 ? 'text-[#e8c683] border-[#b89146]/55' : 'text-[#ece4d5]'
                    }`}
                  >
                    d{d}
                  </button>
                ))}
              </div>

              {/* Formula Builder */}
              <form onSubmit={handleCustomSubmit} className="flex items-start gap-1.5">
                <div className="flex-1 min-w-0">
                  <FormulaBuilderInput
                    value={customFormula}
                    onChange={setCustomFormula}
                    stats={activeStats}
                    character={activeChar}
                    placeholder="Ex: 1d20 + FOR (digite +)"
                    dropdownPosition="bottom"
                  />
                </div>
                <button
                  type="submit"
                  className="rpg-btn-primary h-[34px] px-3 rounded text-xs flex items-center justify-center cursor-pointer shrink-0"
                  title="Rolar Fórmula"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>

              {role === 'gm' && (
                <label className="flex items-center gap-2 text-[11px] text-[#a69b88] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={secretRoll}
                    onChange={(e) => setSecretRoll(e.target.checked)}
                    className="accent-[#b89146]"
                  />
                  <EyeOff className="w-3.5 h-3.5 text-[#b589e6]" />
                  <span>Rolagem Oculta (apenas Mestre)</span>
                </label>
              )}
            </div>

            {/* Roll History */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0 bg-[#090b10]">
              {visibleLogs.map((entry) => {
                const isHeal = entry.damageType?.toLowerCase() === 'cura';
                return (
                  <div
                    key={entry.id}
                    className={`rpg-card rounded-md p-2.5 text-xs ${
                      entry.isSecret ? 'border-[#9561ce]/45 bg-[#161024]' : ''
                    } ${entry.isCrit ? 'border-[#d4ad5c]/75' : ''}`}
                    style={
                      entry.rollerColor && !entry.isSecret
                        ? { borderLeftWidth: '2px', borderLeftColor: entry.rollerColor }
                        : undefined
                    }
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {entry.isSecret && <EyeOff className="w-3 h-3 text-[#b589e6] shrink-0" />}
                        <span className="font-semibold text-[#ece4d5] truncate">
                          {maskHiddenNameForRole(entry.rollerName, role, campaign)}
                        </span>
                        <span className="text-[10px] text-[#6c6457]">• {entry.timestamp}</span>
                      </div>
                      <span className="font-mono-dice text-[10px] px-1.5 py-0.5 rounded bg-[#090b10] text-[#a69b88] border border-[#b89146]/15">
                        {entry.formula}
                      </span>
                    </div>

                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <div className="font-display font-semibold text-xs text-[#d4ad5c] truncate">
                        {maskHiddenNamesInText(entry.title, role, campaign)}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {entry.isCrit && (
                          <span className="px-1.5 py-0.5 rounded bg-[#2a210f] border border-[#d4ad5c]/50 text-[#e8c683] font-display font-bold text-[9px] uppercase tracking-wider">
                            Crítico
                          </span>
                        )}
                        {entry.isFumble && (
                          <span className="px-1.5 py-0.5 rounded bg-[#2e1114] border border-[#9e2427]/55 text-[#f09a9d] font-display font-bold text-[9px] uppercase tracking-wider">
                            Falha
                          </span>
                        )}
                        <span className="text-lg font-mono-dice font-extrabold leading-none text-[#f4ede0]">
                          {entry.total}
                        </span>
                      </div>
                    </div>

                    {(() => {
                      const matchedTargetToken = entry.targetTokenId
                        ? campaign.maps
                            .flatMap((m) => m.tokens)
                            .find((t) => t.id === entry.targetTokenId)
                        : undefined;
                      const matchedNpc =
                        matchedTargetToken?.type === 'npc' && matchedTargetToken.referenceId
                          ? campaign.npcs.find((n) => n.id === matchedTargetToken.referenceId)
                          : entry.targetName
                            ? campaign.npcs.find(
                                (n) => n.name.toLowerCase() === entry.targetName!.toLowerCase()
                              )
                            : undefined;
                      const matchedMon =
                        matchedTargetToken?.type === 'monster' && matchedTargetToken.referenceId
                          ? campaign.compendium.monsters.find(
                              (m) => m.id === matchedTargetToken.referenceId
                            )
                          : entry.targetName
                            ? (() => {
                                const baseName = entry.targetName!
                                  .replace(/\s+#\d+$/, '')
                                  .trim()
                                  .toLowerCase();
                                return campaign.compendium.monsters.find(
                                  (m) => m.name.trim().toLowerCase() === baseName
                                );
                              })()
                            : undefined;
                      const isTargetPlayerChar =
                        matchedTargetToken?.type === 'character' ||
                        Boolean(
                          entry.targetName &&
                            campaign.characters.some(
                              (c) =>
                                c.name.toLowerCase() === entry.targetName!.toLowerCase() ||
                                c.name.split(' ')[0].toLowerCase() === entry.targetName!.toLowerCase()
                            )
                        );
                      const effectiveHideAc =
                        matchedTargetToken?.hideAcFromPlayers !== undefined
                          ? matchedTargetToken.hideAcFromPlayers
                          : matchedNpc?.hideAcFromPlayers !== undefined
                            ? matchedNpc.hideAcFromPlayers
                            : matchedMon?.hideAcFromPlayers !== undefined
                              ? matchedMon.hideAcFromPlayers
                              : !campaign.settings.showEnemyAcToPlayers;
                      const hideTargetAc =
                        role !== 'gm' && !isTargetPlayerChar && Boolean(effectiveHideAc);
                      const rawSafeDetails = hideTargetAc
                        ? (entry.details || '')
                            .replace(/\bvs\s+CA\s+\d+/gi, 'vs CA ??')
                            .replace(/\bCA\s+\d+/gi, 'CA ??')
                        : entry.details;
                      const safeDetails = maskHiddenNamesInText(rawSafeDetails, role, campaign);

                      return (
                        <>
                          {entry.targetName && (
                            <div className="mt-1.5 flex items-center justify-between px-2 py-1 rounded rpg-well text-[11px]">
                              <span className="text-[#a69b88] truncate">
                                Alvo:{' '}
                                <strong className="text-[#ece4d5]">
                                  {maskHiddenNameForRole(
                                    entry.targetName,
                                    role,
                                    campaign,
                                    entry.targetTokenId
                                  )}
                                </strong>
                                {entry.targetDefense != null
                                  ? ` (CA ${hideTargetAc ? '??' : entry.targetDefense})`
                                  : ''}
                              </span>
                              {entry.hitStatus === 'hit' && (
                                <span className="text-[#5fc78c] font-display font-bold flex items-center gap-1 text-[10px] uppercase shrink-0">
                                  <CheckCircle2 className="w-3 h-3" /> Acertou
                                </span>
                              )}
                              {entry.hitStatus === 'miss' && (
                                <span className="text-[#e07a7d] font-display font-bold flex items-center gap-1 text-[10px] uppercase shrink-0">
                                  <ShieldAlert className="w-3 h-3" /> Errou
                                </span>
                              )}
                            </div>
                          )}

                          <div className="mt-1 text-[11px] leading-snug text-[#a69b88]">
                            {safeDetails}
                          </div>
                        </>
                      );
                    })()}

                    {entry.damageTotal &&
                      entry.damageTotal > 0 &&
                      entry.targetTokenId &&
                      role === 'gm' && (
                        <div
                          className="mt-2 pt-2 border-t flex flex-wrap gap-1.5"
                          style={{ borderColor: 'var(--border-hairline)' }}
                        >
                          {isHeal ? (
                            <button
                              type="button"
                              onClick={() =>
                                applyDamage(entry.targetTokenId!, entry.damageTotal!, true, entry.id)
                              }
                              disabled={entry.applied}
                              className="px-2 py-1 rounded bg-[#18472e] hover:bg-[#1f5c3c] border border-[#3ea66b]/50 text-[#d8f5e5] text-[11px] font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-40"
                            >
                              <Heart className="w-3 h-3" />
                              {entry.applied ? 'Cura Aplicada' : `Curar ${entry.damageTotal} PV`}
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  applyDamage(
                                    entry.targetTokenId!,
                                    entry.damageTotal!,
                                    false,
                                    entry.id,
                                    entry.damageType
                                  )
                                }
                                disabled={entry.applied}
                                className="rpg-btn-crimson px-2 py-1 rounded text-[11px] flex items-center gap-1 cursor-pointer disabled:opacity-40"
                              >
                                <Swords className="w-3 h-3" />
                                {entry.applied
                                  ? 'Aplicado'
                                  : `Aplicar ${entry.damageTotal} (${entry.damageType || 'Dano'})`}
                              </button>
                              {!entry.applied && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    applyDamage(
                                      entry.targetTokenId!,
                                      Math.floor(entry.damageTotal! / 2),
                                      false,
                                      entry.id,
                                      entry.damageType
                                    )
                                  }
                                  className="rpg-card px-2 py-1 rounded text-[11px] font-semibold cursor-pointer"
                                >
                                  Metade ({Math.floor(entry.damageTotal / 2)})
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      )}
                  </div>
                );
              })}

              {visibleLogs.length === 0 && (
                <div className="text-center py-12 text-xs text-[#6c6457]">
                  <Dices className="w-6 h-6 mx-auto mb-2 opacity-40" />
                  <p className="font-lore italic text-sm">
                    Nenhuma rolagem registrada. Lance um dado acima.
                  </p>
                </div>
              )}
            </div>
          </>
        )}

        {/* TAB 3: RP CHAT & PRIVATE WHISPERS */}
        {activeTab === 'chat' && (
          <>
            <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0 bg-[#090b10]">
              {chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`rounded-md p-2.5 text-xs border ${
                    msg.isWhisper
                      ? 'border-[#9561ce]/45 bg-[#171124]'
                      : 'rpg-card'
                  }`}
                  style={
                    !msg.isWhisper
                      ? { borderLeftWidth: '2px', borderLeftColor: msg.senderColor || '#d4ad5c' }
                      : undefined
                  }
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {msg.isWhisper && <Lock className="w-3 h-3 text-[#b589e6] shrink-0" />}
                      <span
                        className="font-display font-bold truncate"
                        style={{
                          color: msg.isWhisper ? '#d2b4f8' : msg.senderColor || '#d4ad5c',
                        }}
                      >
                        {maskHiddenNameForRole(msg.senderName, role, campaign, msg.speakerTokenId)}
                      </span>
                      {msg.isWhisper && msg.recipientName && (
                        <span className="text-[10px] text-[#b589e6] truncate">
                          → {msg.recipientName}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-[#6c6457] font-mono-dice shrink-0">
                      {msg.timestamp}
                    </span>
                  </div>
                  {msg.text && (
                    <p
                      className={`mt-1 text-xs whitespace-pre-wrap break-words leading-relaxed ${
                        msg.isWhisper ? 'text-[#e3d2f8] italic font-lore text-sm' : 'text-[#e6dfd1]'
                      }`}
                    >
                      {msg.text}
                    </p>
                  )}
                  {msg.imageUrl && (
                    <button
                      type="button"
                      onClick={() => setLightboxImageUrl(resolveAssetUrl(msg.imageUrl))}
                      className="mt-1.5 group relative block w-full overflow-hidden rounded border border-[#b89146]/30 bg-black/50 hover:border-[#d4ad5c]/75 transition cursor-zoom-in"
                      title="Clique para ampliar a imagem"
                    >
                      <img
                        src={resolveAssetUrl(msg.imageUrl)}
                        alt="Imagem enviada no chat"
                        className="max-h-52 w-full object-contain bg-black/40"
                        loading="lazy"
                      />
                      <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/75 border border-[#b89146]/40 text-[9px] font-display text-[#e8c683] flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                        <Maximize2 className="w-2.5 h-2.5" /> Ampliar
                      </span>
                    </button>
                  )}
                </div>
              ))}

              {chatMessages.length === 0 && (
                <div className="text-center py-12 px-4 text-xs space-y-2 text-[#6c6457]">
                  <MessageSquare className="w-6 h-6 mx-auto opacity-40" />
                  <p className="font-lore italic text-sm">Nenhuma mensagem na crônica de RP.</p>
                  <p className="text-[11px] opacity-80">
                    Use <code className="px-1 py-0.5 rounded bg-[#141722] text-[#e8c683]">/falar texto</code> para balão no token, <code className="px-1 py-0.5 rounded bg-[#141722] text-[#c9a8f0]">/w Mestre texto</code> para sussurro, ou <code className="px-1 py-0.5 rounded bg-[#141722] text-[#e8c683]">Ctrl+V</code> para foto.
                  </p>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <form
              onSubmit={handleChatSubmit}
              className="p-2.5 border-t space-y-2 shrink-0 bg-[#0d0f16]"
              style={{ borderColor: 'var(--border-hairline)' }}
            >
              {role === 'gm' && gmSpeakerOptions.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <MessageSquareQuote
                    className={`w-3.5 h-3.5 shrink-0 ${
                      gmSpeakerKey ? 'text-[#e8c683]' : 'text-[#6c6457]'
                    }`}
                  />
                  <select
                    value={gmSpeakerKey}
                    onChange={(e) => setGmSpeakerKey(e.target.value)}
                    className="rpg-input w-full py-1 text-[11px]"
                    title="Falar como Mestre ou assumir a voz de um NPC/Monstro (com balão no token!)"
                  >
                    <option value="">Falar como: {campaign.gmName || 'Mestre'}</option>
                    {gmSpeakerOptions.map((opt) => (
                      <option key={opt.key} value={opt.key}>
                        Falar como: {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <Lock
                  className={`w-3.5 h-3.5 shrink-0 ${
                    chatRecipient ? 'text-[#b589e6]' : 'text-[#6c6457]'
                  }`}
                />
                <select
                  value={chatRecipient}
                  onChange={(e) => setChatRecipient(e.target.value)}
                  className="rpg-input w-full py-1 text-[11px]"
                >
                  {recipientOptions.map((opt) => (
                    <option key={opt.value || 'public'} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              {(uploadingChatImage || pendingChatImage) && (
                <div className="flex items-center gap-2 p-1.5 rounded bg-[#121622] border border-[#b89146]/35">
                  {uploadingChatImage ? (
                    <div className="flex items-center gap-2 text-[11px] text-[#d4ad5c] px-1 py-1">
                      <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                      <span>Enviando imagem...</span>
                    </div>
                  ) : pendingChatImage ? (
                    <>
                      <img
                        src={resolveAssetUrl(pendingChatImage.url)}
                        alt={pendingChatImage.name}
                        className="w-10 h-10 rounded object-cover border border-[#b89146]/40 shrink-0 bg-black/50"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-semibold text-[#ece4d5] truncate">
                          {pendingChatImage.name}
                        </div>
                        <div className="text-[10px] text-[#8c8374]">
                          Pronta para enviar (legenda opcional)
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPendingChatImage(null)}
                        className="p-1 rounded text-[#a69b88] hover:text-[#f09a9d] hover:bg-[#2d1012] cursor-pointer shrink-0"
                        title="Remover imagem anexada"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : null}
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <input
                  ref={chatImageInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleChatImageChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => chatImageInputRef.current?.click()}
                  disabled={uploadingChatImage}
                  className="rpg-card h-[34px] px-2.5 rounded text-xs flex items-center justify-center text-[#d4ad5c] hover:text-[#f0d89e] hover:border-[#d4ad5c]/55 cursor-pointer disabled:opacity-40 shrink-0 transition"
                  title="Enviar imagem do PC (ou use Ctrl+V no campo de texto)"
                >
                  {uploadingChatImage ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ImagePlus className="w-3.5 h-3.5" />
                  )}
                </button>
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onPaste={handleChatPaste}
                  placeholder={
                    pendingChatImage
                      ? 'Legenda opcional...'
                      : chatRecipient
                        ? `Sussurrar para ${chatRecipient} (ou Ctrl+V)...`
                        : gmSpeakerKey
                          ? 'Fala do personagem (gera balão no token)...'
                          : 'Chat, /falar (balão), /w Nome, ou Ctrl+V...'
                  }
                  className="rpg-input flex-1 py-1.5 text-xs min-w-0"
                />
                <button
                  type="submit"
                  disabled={uploadingChatImage || (!chatInput.trim() && !pendingChatImage?.url)}
                  className="rpg-btn-primary h-[34px] px-3 rounded text-xs flex items-center justify-center cursor-pointer disabled:opacity-40 shrink-0"
                  title="Enviar mensagem"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>
          </>
        )}
      </OrnateFrame>

      {/* Fullscreen Lightbox for Chat Images — rendered via Portal to document.body so sidebar transform/width NEVER clips it! */}
      {lightboxImageUrl &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            data-modal-overlay="true"
            data-sub-overlay="true"
            className="fixed inset-0 z-[120] bg-[#040508]/92 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8"
            onClick={() => setLightboxImageUrl(null)}
          >
            <div
              className="relative max-w-[92vw] max-h-[90vh] flex flex-col items-center animate-modal-unfurl"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setLightboxImageUrl(null)}
                className="absolute -top-3 -right-3 z-10 w-8 h-8 rounded-full bg-[#141722] border border-[#d4ad5c]/65 text-[#ece4d5] hover:bg-[#2a2316] flex items-center justify-center shadow-lg cursor-pointer"
                title="Fechar (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
              <img
                src={lightboxImageUrl}
                alt="Imagem ampliada do chat"
                className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg border border-[#b89146]/50 shadow-[0_24px_80px_rgba(0,0,0,0.95)] bg-black/70"
              />
            </div>
          </div>,
          document.body
        )}
    </aside>
  );
};
