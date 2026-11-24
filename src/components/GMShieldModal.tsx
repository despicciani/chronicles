import React, { useState } from 'react';
import {
  Dices,
  Eye,
  FileText,
  Gift,
  Music,
  Plus,
  Send,
  Shield,
  Skull,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import { useCampaign } from '../context/CampaignContext';
import { openAlertDialog } from './PromptDialog';
import { computeCharacterStats } from '../shared/rulesEngine';
import { GmNote, NpcEntry } from '../shared/types';
import { FileUploadButton } from './FileUploadButton';

interface GMShieldModalProps {
  onClose: () => void;
}

const FIRST_NAMES = ['Aldric', 'Mira', 'Thoren', 'Vespera', 'Garrick', 'Isolde', 'Kaelen', 'Bram', 'Sylvi', 'Dorian'];
const LAST_NAMES = ['Corvo-Branco', 'Pedra-Fria', 'Lâmina-Ágil', 'Vento-Sul', 'Ouro-Velho', 'Sombraluz', 'Ferro-Forte'];
const OCCUPATIONS = ['Ferreiro', 'Alquimista', 'Contrabandista', 'Escriba Real', 'Mercador de Relíquias', 'Guarda da Ponte', 'Herbalista', 'Bardo Errante'];
const TRAITS = ['Fala sussurrando como se tivesse medo de paredes', 'Ri nervosamente antes de dar más notícias', 'Coleciona moedas antigas de reinos caídos', 'Tem uma cicatriz rúnica que brilha levemente perto de magia', 'Sempre oferece chá de ervas amargas'];
const SECRETS = ['Deve uma dívida de sangue à Guilda dos Ladrões', 'Testemunhou o assassinato do antigo conselheiro', 'Possui a chave de uma passagem secreta na cripta', 'É um desertor disfarçado de outra província', 'Esconde um artefato amaldiçoado no porão'];

const TAVERN_ADJ = ['Dourado', 'Caolho', 'Ébrio', 'Sombrio', 'Cantante', 'Enferrujado', 'Afortunado'];
const TAVERN_NOUN = ['Javali', 'Grifo', 'Barril', 'Corvo', 'Dragão', 'Cálice', 'Lobo'];
const TAVERN_RUMORS = [
  'Caravanas têm desaparecido perto da ponte velha durante a lua nova.',
  'O prefeito contratou mercenários estrangeiros em segredo ontem à noite.',
  'Luzes azuladas foram vistas saindo do topo da torre abandonada.',
  'Um colecionador paga o triplo por moedas gravadas com o símbolo da coroa partida.',
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export const GMShieldModal: React.FC<GMShieldModalProps> = ({ onClose }) => {
  const {
    campaign,
    updateCampaign,
    sendHandout,
    requestSkillCheck,
    announceBoss,
    playCharacterTheme,
  } = useCampaign();
  const [tab, setTab] = useState<'party' | 'boss' | 'improv' | 'handouts' | 'wiki'>('party');

  // Skill Check Request state
  const [checkSkillId, setCheckSkillId] = useState('percepcao');
  const [checkDc, setCheckDc] = useState(14);

  // Boss Fight Banner state
  const [bossName, setBossName] = useState(campaign.activeBoss?.name || 'Lorde Malakor');
  const [bossTitle, setBossTitle] = useState(campaign.activeBoss?.title || 'O Senhor das Cinzas');
  const [bossMaxHp, setBossMaxHp] = useState(campaign.activeBoss?.maxHp || 180);
  const [bossImage, setBossImage] = useState(campaign.activeBoss?.imageUrl || '');

  // Improv states
  const [generatedNpc, setGeneratedNpc] = useState<{
    name: string;
    race: string;
    role: string;
    trait: string;
    secret: string;
  } | null>(null);
  const [generatedTavern, setGeneratedTavern] = useState<{
    name: string;
    special: string;
    rumor: string;
  } | null>(null);
  const [generatedLoot, setGeneratedLoot] = useState<string | null>(null);

  // Handout states
  const [handoutTitle, setHandoutTitle] = useState('Carta Lacrada com Cera Carmesim');
  const [handoutText, setHandoutText] = useState(
    '"Encontrem-me à meia-noite atrás da capela em ruínas. Não confiem nos guardas do portão leste."'
  );
  const [handoutImage, setHandoutImage] = useState('');
  const [handoutRecipientIds, setHandoutRecipientIds] = useState<string[]>([]);

  // Gift Item state
  const [giftItemMap, setGiftItemMap] = useState<Record<string, string>>({});

  // Wiki note state
  const [selectedNoteId, setSelectedNoteId] = useState<string>(campaign.gmNotes[0]?.id || '');

  const generateNpc = () => {
    setGeneratedNpc({
      name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
      race: pick(campaign.compendium.races).name || 'Humano',
      role: pick(OCCUPATIONS),
      trait: pick(TRAITS),
      secret: pick(SECRETS),
    });
  };

  const saveGeneratedNpc = () => {
    if (!generatedNpc) return;
    const entry: NpcEntry = {
      id: `npc-${Date.now()}`,
      name: generatedNpc.name,
      role: `${generatedNpc.race} • ${generatedNpc.role}`,
      location: 'Improviso na Sessão',
      imageUrl: '',
      publicBio: generatedNpc.trait,
      secretNotes: generatedNpc.secret,
      sharedPartyNotes: '',
      revealedToPlayers: false,
      disposition: 'Neutro',
    };
    updateCampaign((prev) => ({ ...prev, npcs: [entry, ...prev.npcs] }));
    openAlertDialog(`${entry.name} salvo nos NPCs da campanha (oculto até você revelar)!`, 'NPC Salvo');
  };

  const generateTavern = () => {
    const noun = pick(TAVERN_NOUN);
    const adj = pick(TAVERN_ADJ);
    setGeneratedTavern({
      name: `O ${noun} ${adj}`,
      special: pick([
        'Ensopado de javali com cerveja escura (3 PP)',
        'Torta de cogumelos da floresta + hidromel quente (5 PP)',
        'Costela assada na brasa com especiarias (8 PP)',
      ]),
      rumor: pick(TAVERN_RUMORS),
    });
  };

  const generateLoot = () => {
    const gold = Math.floor(Math.random() * 80) + 15;
    const randomItem = pick(campaign.compendium.items);
    const gem = pick(['Ágata Musgosa (25 PO)', 'Rubi Lascado (60 PO)', 'Cálice de Prata (40 PO)', 'Pergaminho Cifrado']);
    setGeneratedLoot(`${gold} Peças de Ouro + ${gem} + 1x ${randomItem.name}`);
  };

  const adjustCharStat = (charId: string, field: 'hp' | 'mp', delta: number) => {
    updateCampaign((prev) => ({
      ...prev,
      characters: prev.characters.map((c) => {
        if (c.id !== charId) return c;
        const stats = computeCharacterStats(c, prev);
        if (field === 'hp') {
          return { ...c, hp: Math.max(0, Math.min(stats.maxHp, c.hp + delta)) };
        }
        return { ...c, mp: Math.max(0, Math.min(stats.maxMp, c.mp + delta)) };
      }),
    }));
  };

  const giveItemToChar = (charId: string) => {
    const itemId = giftItemMap[charId] || campaign.compendium.items[0]?.id;
    if (!itemId) return;
    updateCampaign((prev) => ({
      ...prev,
      characters: prev.characters.map((c) =>
        c.id === charId
          ? {
              ...c,
              inventory: [
                ...c.inventory,
                { id: `inv-${Date.now()}`, itemId, quantity: 1, equipped: false },
              ],
            }
          : c
      ),
    }));
  };

  const selectedNote =
    campaign.gmNotes.find((n) => n.id === selectedNoteId) || campaign.gmNotes[0];

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 md:p-6">
      <div className="rpg-panel rpg-ornate-border rounded-xl w-full max-w-6xl h-[88vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div
          className="px-4 py-3 border-b flex items-center justify-between gap-3 shrink-0"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-red-400" />
            <div>
              <h2 className="font-display font-bold text-base leading-none">
                Escudo do Mestre Digital
              </h2>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                Monitoramento em tempo real do grupo, geradores de improviso, handouts e anotações secretas.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rpg-card p-1.5 rounded cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-4 py-2 border-b flex items-center gap-2 overflow-x-auto shrink-0" style={{ borderColor: 'var(--border-subtle)' }}>
          {[
            { id: 'party', label: 'Monitor & Pedir Teste', icon: <Eye className="w-4 h-4" /> },
            { id: 'boss', label: 'Anunciar Boss Fight', icon: <Skull className="w-4 h-4" /> },
            { id: 'improv', label: 'Gerador de Improviso', icon: <Wand2 className="w-4 h-4" /> },
            { id: 'handouts', label: 'Projetar Handouts / Pistas', icon: <Send className="w-4 h-4" /> },
            { id: 'wiki', label: 'Wiki Secreta do Mestre', icon: <FileText className="w-4 h-4" /> },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as typeof tab)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer ${
                tab === t.id ? 'rpg-btn-crimson' : 'rpg-card hover:opacity-85'
              }`}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 min-h-0">
          {tab === 'party' && (
            <div className="space-y-4">
              {/* Tactical Combat Rules Toggles */}
              <div className="rpg-glass-panel rounded-lg p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div>
                  <div className="font-display font-bold text-xs text-amber-200">
                    Regras Táticas da Campanha (D&amp;D 5e)
                  </div>
                  <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    Desvantagem à distância colado (1,5m), Condições automáticas e Resistências já estão ativas.
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      updateCampaign((prev) => ({
                        ...prev,
                        settings: {
                          ...prev.settings,
                          enableFlanking: !(prev.settings.enableFlanking ?? true),
                        },
                      }))
                    }
                    className={`px-3 py-1.5 rounded-md font-display font-bold text-[11px] border cursor-pointer transition ${
                      (campaign.settings.enableFlanking ?? true)
                        ? 'bg-emerald-950/85 border-emerald-400/70 text-emerald-200'
                        : 'rpg-card opacity-75'
                    }`}
                  >
                    Flanqueamento: {(campaign.settings.enableFlanking ?? true) ? 'Ligado (Vantagem)' : 'Desligado'}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      updateCampaign((prev) => ({
                        ...prev,
                        settings: {
                          ...prev.settings,
                          showEnemyAcToPlayers: !prev.settings.showEnemyAcToPlayers,
                        },
                      }))
                    }
                    className={`px-3 py-1.5 rounded-md font-display font-bold text-[11px] border cursor-pointer transition ${
                      campaign.settings.showEnemyAcToPlayers
                        ? 'bg-amber-950/85 border-amber-400/70 text-amber-200'
                        : 'rpg-card opacity-85'
                    }`}
                  >
                    CA dos Inimigos: {campaign.settings.showEnemyAcToPlayers ? 'Visível' : 'Oculta (??)'}
                  </button>
                </div>
              </div>

              {/* "O Mestre Pede um Teste!" (#1) */}
              <div className="rpg-glass-panel rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <Dices className="w-5 h-5 text-amber-400" />
                  <div>
                    <div className="font-display font-bold text-sm" style={{ color: 'var(--accent-primary)' }}>
                      Pedir Teste na Tela dos Jogadores
                    </div>
                    <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                      Exibe um botão gigante na tela de todos para rolar em 1 clique.
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    value={checkSkillId}
                    onChange={(e) => setCheckSkillId(e.target.value)}
                    className="rpg-input py-1.5"
                  >
                    <optgroup label="Perícias & Resistências">
                      {campaign.compendium.skills.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Atributos">
                      {campaign.compendium.attributes.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({a.shortName})
                        </option>
                      ))}
                    </optgroup>
                  </select>
                  <div className="flex items-center gap-1">
                    <span>CD:</span>
                    <input
                      type="number"
                      value={checkDc}
                      onChange={(e) => setCheckDc(Number(e.target.value))}
                      className="rpg-input w-14 text-center py-1.5"
                    />
                  </div>
                  <button
                    onClick={() => {
                      const sk = campaign.compendium.skills.find((s) => s.id === checkSkillId);
                      const at = campaign.compendium.attributes.find((a) => a.id === checkSkillId);
                      requestSkillCheck(checkSkillId, sk?.name || at?.name || checkSkillId, checkDc);
                      onClose();
                    }}
                    className="rpg-btn-primary px-3.5 py-1.5 rounded-lg font-bold cursor-pointer"
                  >
                    Pedir Teste Agora
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {campaign.characters.map((ch) => {
                  const stats = computeCharacterStats(ch, campaign);
                  const activeConds = campaign.compendium.conditions.filter((cd) =>
                    ch.activeConditionIds.includes(cd.id)
                  );
                  return (
                    <div key={ch.id} className="rpg-card rounded-xl p-3.5 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="font-display font-bold text-sm flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: ch.playerColor || ch.tokenColor }}
                            />
                            <span>{ch.name}</span>
                            {ch.themeMusicUrl && (
                              <button
                                onClick={() => playCharacterTheme(ch)}
                                className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] flex items-center gap-1 cursor-pointer"
                              >
                                <Music className="w-3 h-3" /> Tema
                              </button>
                            )}
                          </div>
                          <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                            Jogador: {ch.playerName} • Nv {ch.level} • CA {stats.defense} • Perc. Passiva{' '}
                            <strong style={{ color: 'var(--accent-primary)' }}>{stats.passivePerception}</strong>
                          </div>
                        </div>
                      <div className="text-right text-xs font-mono-dice">
                        <div>FOR {stats.attributes['for']?.mod >= 0 ? `+${stats.attributes['for']?.mod}` : stats.attributes['for']?.mod}</div>
                        <div>DES {stats.attributes['des']?.mod >= 0 ? `+${stats.attributes['des']?.mod}` : stats.attributes['des']?.mod}</div>
                      </div>
                    </div>

                    {/* Quick HP & MP adjusters */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2 rounded bg-black/20 flex items-center justify-between">
                        <span className="text-emerald-400 font-bold">
                          PV {ch.hp}/{stats.maxHp}
                        </span>
                        <div className="flex gap-1">
                          <button
                            onClick={() => adjustCharStat(ch.id, 'hp', -5)}
                            className="px-1.5 py-0.5 rounded bg-red-900/60 hover:bg-red-800 cursor-pointer"
                          >
                            -5
                          </button>
                          <button
                            onClick={() => adjustCharStat(ch.id, 'hp', -1)}
                            className="px-1.5 py-0.5 rounded bg-red-900/40 cursor-pointer"
                          >
                            -1
                          </button>
                          <button
                            onClick={() => adjustCharStat(ch.id, 'hp', 1)}
                            className="px-1.5 py-0.5 rounded bg-emerald-900/40 cursor-pointer"
                          >
                            +1
                          </button>
                          <button
                            onClick={() => adjustCharStat(ch.id, 'hp', 5)}
                            className="px-1.5 py-0.5 rounded bg-emerald-900/60 cursor-pointer"
                          >
                            +5
                          </button>
                        </div>
                      </div>

                      <div className="p-2 rounded bg-black/20 flex items-center justify-between">
                        <span className="text-sky-400 font-bold">
                          {campaign.settings.resourceShort} {ch.mp}/{stats.maxMp}
                        </span>
                        <div className="flex gap-1">
                          <button
                            onClick={() => adjustCharStat(ch.id, 'mp', -1)}
                            className="px-1.5 py-0.5 rounded bg-black/40 cursor-pointer"
                          >
                            -1
                          </button>
                          <button
                            onClick={() => adjustCharStat(ch.id, 'mp', 2)}
                            className="px-1.5 py-0.5 rounded bg-sky-900/50 cursor-pointer"
                          >
                            +2
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Active conditions */}
                    {activeConds.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {activeConds.map((cd) => (
                          <span
                            key={cd.id}
                            className="text-[10px] px-2 py-0.5 rounded-full border"
                            style={{ borderColor: cd.color, backgroundColor: `${cd.color}20` }}
                          >
                            {cd.icon} {cd.name}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Gift Item directly to player */}
                    <div className="flex items-center gap-1.5 pt-1 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                      <Gift className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <select
                        value={giftItemMap[ch.id] || campaign.compendium.items[0]?.id || ''}
                        onChange={(e) =>
                          setGiftItemMap((prev) => ({ ...prev, [ch.id]: e.target.value }))
                        }
                        className="rpg-input text-xs py-1 flex-1"
                      >
                        {campaign.compendium.items.map((it) => (
                          <option key={it.id} value={it.id}>
                            {it.name}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => giveItemToChar(ch.id)}
                        className="rpg-btn-primary px-2.5 py-1 rounded text-[11px] cursor-pointer"
                      >
                        Entregar
                      </button>
                    </div>
                  </div>
                );
              })}
              </div>
            </div>
          )}

          {tab === 'boss' && (
            <div className="max-w-xl mx-auto rpg-card rounded-xl p-5 space-y-3.5 text-xs">
              <div className="flex items-center gap-2 font-display font-bold text-base text-red-400">
                <Skull className="w-5 h-5" />
                <span>Entrada Cinematográfica de Boss &amp; Barra Gigante</span>
              </div>
              <p style={{ color: 'var(--text-secondary)' }}>
                Ativa uma barra de vida épica no topo da tela para todos os jogadores com som dramático!
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1">Nome do Chefe</label>
                  <input
                    value={bossName}
                    onChange={(e) => setBossName(e.target.value)}
                    className="rpg-input w-full"
                  />
                </div>
                <div>
                  <label className="block mb-1">Título Épico</label>
                  <input
                    value={bossTitle}
                    onChange={(e) => setBossTitle(e.target.value)}
                    className="rpg-input w-full"
                  />
                </div>
                <div>
                  <label className="block mb-1">PV Máximo do Chefe</label>
                  <input
                    type="number"
                    value={bossMaxHp}
                    onChange={(e) => setBossMaxHp(Number(e.target.value))}
                    className="rpg-input w-full"
                  />
                </div>
                <div>
                  <label className="block mb-1">Retrato do Boss (Opcional)</label>
                  <FileUploadButton
                    accept="image/*"
                    label="Subir Imagem do PC"
                    onUploaded={(url) => setBossImage(url)}
                    className="w-full justify-center"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={() => {
                    announceBoss({
                      id: `boss-${Date.now()}`,
                      name: bossName || 'Chefe',
                      title: bossTitle || 'Guardião',
                      hp: bossMaxHp,
                      maxHp: bossMaxHp,
                      imageUrl: bossImage,
                      color: '#dc2626',
                      active: true,
                    });
                    onClose();
                  }}
                  className="rpg-btn-crimson px-4 py-2 rounded-lg font-bold cursor-pointer"
                >
                  🐉 Anunciar Chefe Agora!
                </button>
                {campaign.activeBoss && (
                  <button
                    onClick={() => announceBoss(null)}
                    className="rpg-card px-3 py-2 rounded-lg cursor-pointer"
                  >
                    Ocultar Barra de Boss
                  </button>
                )}
              </div>
            </div>
          )}

          {tab === 'improv' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* NPC Generator */}
              <div className="rpg-card rounded-xl p-4 space-y-3">
                <h3 className="font-display font-bold text-sm">Gerador Instantâneo de NPC</h3>
                <button onClick={generateNpc} className="rpg-btn-primary w-full py-2 rounded text-xs cursor-pointer">
                  🎲 Sortear NPC Completo
                </button>
                {generatedNpc && (
                  <div className="space-y-2 text-xs p-3 rounded bg-black/20">
                    <div className="font-bold text-sm" style={{ color: 'var(--accent-primary)' }}>
                      {generatedNpc.name}
                    </div>
                    <div>
                      <strong>Raça / Ocupação:</strong> {generatedNpc.race} • {generatedNpc.role}
                    </div>
                    <div>
                      <strong>Traço Marcante:</strong> {generatedNpc.trait}
                    </div>
                    <div className="text-red-300">
                      <strong>Segredo Oculto:</strong> {generatedNpc.secret}
                    </div>
                    <button
                      onClick={saveGeneratedNpc}
                      className="rpg-card w-full py-1.5 rounded font-semibold hover:opacity-80 cursor-pointer"
                    >
                      + Salvar nos NPCs da Campanha
                    </button>
                  </div>
                )}
              </div>

              {/* Tavern Generator */}
              <div className="rpg-card rounded-xl p-4 space-y-3">
                <h3 className="font-display font-bold text-sm">Gerador de Taverna &amp; Rumores</h3>
                <button onClick={generateTavern} className="rpg-btn-primary w-full py-2 rounded text-xs cursor-pointer">
                  🍺 Sortear Taverna
                </button>
                {generatedTavern && (
                  <div className="space-y-2 text-xs p-3 rounded bg-black/20">
                    <div className="font-bold text-sm" style={{ color: 'var(--accent-primary)' }}>
                      {generatedTavern.name}
                    </div>
                    <div>
                      <strong>Prato do Dia:</strong> {generatedTavern.special}
                    </div>
                    <div>
                      <strong>Rumor na Mesa ao Lado:</strong> "{generatedTavern.rumor}"
                    </div>
                  </div>
                )}
              </div>

              {/* Loot Generator */}
              <div className="rpg-card rounded-xl p-4 space-y-3">
                <h3 className="font-display font-bold text-sm">Gerador de Tesouro / Saque</h3>
                <button onClick={generateLoot} className="rpg-btn-primary w-full py-2 rounded text-xs cursor-pointer">
                  💰 Sortear Tesouro
                </button>
                {generatedLoot && (
                  <div className="space-y-2 text-xs p-3 rounded bg-black/20">
                    <div className="font-bold flex items-center gap-1" style={{ color: 'var(--accent-primary)' }}>
                      <Sparkles className="w-3.5 h-3.5" /> Recompensa Encontrada:
                    </div>
                    <p>{generatedLoot}</p>
                    <button
                      onClick={() =>
                        updateCampaign((prev) => ({
                          ...prev,
                          groupTreasury: {
                            ...prev.groupTreasury,
                            items: [
                              ...prev.groupTreasury.items,
                              { id: `loot-${Date.now()}`, name: generatedLoot, quantity: 1, notes: 'Saque de encontro' },
                            ],
                          },
                        }))
                      }
                      className="rpg-card w-full py-1.5 rounded font-semibold cursor-pointer"
                    >
                      + Enviar ao Tesouro do Grupo
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'handouts' && (
            <div className="max-w-2xl mx-auto rpg-card rounded-xl p-4 space-y-3 text-xs">
              <h3 className="font-display font-bold text-sm">
                Projetar Pista / Carta / Imagem na Tela dos Jogadores
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1">Título do Handout</label>
                  <input
                    value={handoutTitle}
                    onChange={(e) => setHandoutTitle(e.target.value)}
                    className="rpg-input w-full"
                  />
                </div>
                <div>
                  <label className="block mb-1">
                    Enviar Para ({handoutRecipientIds.length === 0 ? 'Todos os Jogadores' : `${handoutRecipientIds.length} selecionado(s) — Sussurro Secreto`})
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setHandoutRecipientIds([])}
                      className={`px-2 py-1 rounded text-[11px] border cursor-pointer ${
                        handoutRecipientIds.length === 0
                          ? 'bg-amber-600/35 border-amber-400 text-amber-100 font-bold'
                          : 'rpg-card opacity-75 hover:opacity-100'
                      }`}
                    >
                      Todos
                    </button>
                    {campaign.characters.map((c) => {
                      const active = handoutRecipientIds.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() =>
                            setHandoutRecipientIds((prev) =>
                              prev.includes(c.id) ? prev.filter((id) => id !== c.id) : [...prev, c.id]
                            )
                          }
                          className={`px-2 py-1 rounded text-[11px] border cursor-pointer ${
                            active
                              ? 'bg-purple-600/40 border-purple-400 text-purple-100 font-bold'
                              : 'rpg-card opacity-75 hover:opacity-100'
                          }`}
                        >
                          {active ? '👁️ ' : ''}{c.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="block">Imagem (Mapa, Retrato, Carta — Opcional)</label>
                <div className="flex items-center gap-2">
                  <input
                    value={handoutImage}
                    onChange={(e) => setHandoutImage(e.target.value)}
                    placeholder="https://... ou envie um arquivo"
                    className="rpg-input flex-1"
                  />
                  <FileUploadButton
                    accept="image/*"
                    label="Upload"
                    onUploaded={(url) => setHandoutImage(url)}
                  />
                </div>
              </div>
              <div>
                <label className="block mb-1">Texto / Mensagem</label>
                <textarea
                  rows={4}
                  value={handoutText}
                  onChange={(e) => setHandoutText(e.target.value)}
                  className="rpg-input w-full"
                />
              </div>
              <button
                onClick={() =>
                  sendHandout({
                    title: handoutTitle,
                    text: handoutText,
                    imageUrl: handoutImage || undefined,
                    recipientCharacterIds:
                      handoutRecipientIds.length > 0 ? handoutRecipientIds : undefined,
                  })
                }
                className="rpg-btn-crimson px-4 py-2 rounded font-semibold flex items-center gap-2 cursor-pointer"
              >
                <Send className="w-4 h-4" />
                {handoutRecipientIds.length > 0
                  ? `Enviar Sussurro Secreto (${handoutRecipientIds.length})`
                  : 'Exibir na Tela de Todos Agora'}
              </button>
            </div>
          )}

          {tab === 'wiki' && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 h-full">
              <div className="md:col-span-4 space-y-2">
                <button
                  onClick={() => {
                    const note: GmNote = {
                      id: `note-${Date.now()}`,
                      title: 'Nova Anotação Secreta',
                      folder: 'Trama',
                      content: 'Escreva aqui os detalhes do capítulo, armadilhas ou segredos...',
                      updatedAt: new Date().toLocaleDateString('pt-BR'),
                    };
                    updateCampaign((p) => ({ ...p, gmNotes: [note, ...p.gmNotes] }));
                    setSelectedNoteId(note.id);
                  }}
                  className="rpg-btn-primary w-full py-1.5 rounded text-xs flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Nova Nota do Mestre
                </button>
                <div className="space-y-1.5">
                  {campaign.gmNotes.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => setSelectedNoteId(n.id)}
                      className={`w-full text-left p-2.5 rounded-lg border text-xs cursor-pointer ${
                        selectedNote?.id === n.id ? 'rpg-ornate-border bg-amber-500/10' : 'rpg-card'
                      }`}
                    >
                      <div className="font-bold truncate">{n.title}</div>
                      <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        Pasta: {n.folder}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {selectedNote && (
                <div className="md:col-span-8 rpg-card rounded-xl p-4 space-y-3 text-xs flex flex-col">
                  <div className="flex items-center gap-2">
                    <input
                      value={selectedNote.title}
                      onChange={(e) =>
                        updateCampaign((p) => ({
                          ...p,
                          gmNotes: p.gmNotes.map((n) =>
                            n.id === selectedNote.id ? { ...n, title: e.target.value } : n
                          ),
                        }))
                      }
                      className="rpg-input flex-1 font-display font-bold text-sm"
                    />
                    <select
                      value={selectedNote.folder}
                      onChange={(e) =>
                        updateCampaign((p) => ({
                          ...p,
                          gmNotes: p.gmNotes.map((n) =>
                            n.id === selectedNote.id
                              ? { ...n, folder: e.target.value as GmNote['folder'] }
                              : n
                          ),
                        }))
                      }
                      className="rpg-input"
                    >
                      <option value="Trama">Trama</option>
                      <option value="Locais">Locais</option>
                      <option value="Facções">Facções</option>
                      <option value="Segredos">Segredos</option>
                      <option value="Encontros">Encontros</option>
                    </select>
                    <button
                      onClick={() =>
                        updateCampaign((p) => ({
                          ...p,
                          gmNotes: p.gmNotes.filter((n) => n.id !== selectedNote.id),
                        }))
                      }
                      className="text-red-400 p-1.5 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <textarea
                    value={selectedNote.content}
                    onChange={(e) =>
                      updateCampaign((p) => ({
                        ...p,
                        gmNotes: p.gmNotes.map((n) =>
                          n.id === selectedNote.id ? { ...n, content: e.target.value } : n
                        ),
                      }))
                    }
                    className="rpg-input flex-1 w-full min-h-[260px] leading-relaxed"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
