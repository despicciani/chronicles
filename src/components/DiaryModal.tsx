import React, { useState } from 'react';
import {
  Coins,
  Eye,
  EyeOff,
  Plus,
  ScrollText,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useCampaign } from '../context/CampaignContext';
import { NpcEntry, Quest, SharedLootItem } from '../shared/types';

interface DiaryModalProps {
  onClose: () => void;
}

export const DiaryModal: React.FC<DiaryModalProps> = ({ onClose }) => {
  const { campaign, role, updateCampaign } = useCampaign();
  const [tab, setTab] = useState<'quests' | 'npcs' | 'treasury'>('quests');

  const addQuest = () => {
    const title = window.prompt('Título da Missão / Objetivo:', 'Investigar a Torre Abandonada');
    if (!title) return;
    const q: Quest = {
      id: `quest-${Date.now()}`,
      title,
      category: 'Principal',
      status: 'Ativa',
      description: 'Descreva o objetivo combinado com o grupo.',
      reward: 'A definir',
      giverName: 'Desconhecido',
    };
    updateCampaign((p) => ({ ...p, quests: [q, ...p.quests] }));
  };

  const addNpc = () => {
    const name = window.prompt('Nome do NPC:', 'Novo Personagem');
    if (!name) return;
    const npc: NpcEntry = {
      id: `npc-${Date.now()}`,
      name,
      role: 'Habitante Local',
      location: 'Cidade',
      imageUrl: '',
      publicBio: 'Descrição visível para os jogadores.',
      secretNotes: 'Segredo exclusivo do Mestre.',
      sharedPartyNotes: '',
      revealedToPlayers: role === 'gm' ? false : true,
      disposition: 'Neutro',
    };
    updateCampaign((p) => ({ ...p, npcs: [npc, ...p.npcs] }));
  };

  const addSharedLoot = () => {
    const name = window.prompt('Nome do item / pista para o Baú do Grupo:', 'Pergaminho Selado');
    if (!name) return;
    const item: SharedLootItem = {
      id: `loot-${Date.now()}`,
      name,
      quantity: 1,
      notes: '',
    };
    updateCampaign((p) => ({
      ...p,
      groupTreasury: {
        ...p.groupTreasury,
        items: [item, ...p.groupTreasury.items],
      },
    }));
  };

  const visibleNpcs = campaign.npcs.filter((n) => role === 'gm' || n.revealedToPlayers);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 md:p-6">
      <div className="rpg-panel rpg-ornate-border rounded-xl w-full max-w-5xl h-[86vh] flex flex-col overflow-hidden">
        <div
          className="px-4 py-3 border-b flex items-center justify-between gap-3 shrink-0"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex items-center gap-2">
            <ScrollText className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
            <div>
              <h2 className="font-display font-bold text-base leading-none">
                Diário Compartilhado da Campanha
              </h2>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                Missões ativas, galeria de NPCs conhecidos com notas do grupo e tesouro coletivo.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rpg-card p-1.5 rounded cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-4 py-2 border-b flex items-center gap-2 shrink-0" style={{ borderColor: 'var(--border-subtle)' }}>
          <button
            onClick={() => setTab('quests')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
              tab === 'quests' ? 'rpg-btn-primary' : 'rpg-card'
            }`}
          >
            <ScrollText className="w-4 h-4" />
            <span>Mural de Missões ({campaign.quests.length})</span>
          </button>
          <button
            onClick={() => setTab('npcs')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
              tab === 'npcs' ? 'rpg-btn-primary' : 'rpg-card'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>NPCs Conhecidos ({visibleNpcs.length})</span>
          </button>
          <button
            onClick={() => setTab('treasury')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
              tab === 'treasury' ? 'rpg-btn-primary' : 'rpg-card'
            }`}
          >
            <Coins className="w-4 h-4" />
            <span>Tesouro do Grupo ({campaign.groupTreasury.gold} PO)</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 min-h-0">
          {tab === 'quests' && (
            <div className="space-y-3 text-xs">
              <div className="flex justify-end">
                <button
                  onClick={addQuest}
                  className="rpg-btn-primary px-3 py-1.5 rounded flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Nova Missão
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {campaign.quests.map((q) => (
                  <div key={q.id} className="rpg-card rounded-xl p-3.5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <input
                        value={q.title}
                        onChange={(e) =>
                          updateCampaign((p) => ({
                            ...p,
                            quests: p.quests.map((x) =>
                              x.id === q.id ? { ...x, title: e.target.value } : x
                            ),
                          }))
                        }
                        className="rpg-input font-display font-bold text-sm flex-1"
                      />
                      <select
                        value={q.status}
                        onChange={(e) =>
                          updateCampaign((p) => ({
                            ...p,
                            quests: p.quests.map((x) =>
                              x.id === q.id ? { ...x, status: e.target.value as Quest['status'] } : x
                            ),
                          }))
                        }
                        className="rpg-input text-xs py-1"
                      >
                        <option value="Ativa">Ativa</option>
                        <option value="Concluída">Concluída</option>
                        <option value="Falhou">Falhou</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        value={q.giverName}
                        onChange={(e) =>
                          updateCampaign((p) => ({
                            ...p,
                            quests: p.quests.map((x) =>
                              x.id === q.id ? { ...x, giverName: e.target.value } : x
                            ),
                          }))
                        }
                        placeholder="Contratante"
                        className="rpg-input"
                      />
                      <input
                        value={q.reward}
                        onChange={(e) =>
                          updateCampaign((p) => ({
                            ...p,
                            quests: p.quests.map((x) =>
                              x.id === q.id ? { ...x, reward: e.target.value } : x
                            ),
                          }))
                        }
                        placeholder="Recompensa"
                        className="rpg-input"
                      />
                    </div>
                    <textarea
                      rows={2}
                      value={q.description}
                      onChange={(e) =>
                        updateCampaign((p) => ({
                          ...p,
                          quests: p.quests.map((x) =>
                            x.id === q.id ? { ...x, description: e.target.value } : x
                          ),
                        }))
                      }
                      className="rpg-input w-full"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'npcs' && (
            <div className="space-y-3 text-xs">
              <div className="flex justify-end">
                <button
                  onClick={addNpc}
                  className="rpg-btn-primary px-3 py-1.5 rounded flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Novo NPC
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {visibleNpcs.map((npc) => (
                  <div
                    key={npc.id}
                    className={`rpg-card rounded-xl p-3.5 space-y-2.5 ${
                      !npc.revealedToPlayers ? 'border-dashed opacity-75' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-display font-bold text-sm">{npc.name}</div>
                        <div className="text-[11px]" style={{ color: 'var(--accent-primary)' }}>
                          {npc.role} • {npc.location} • {npc.disposition}
                        </div>
                      </div>
                      {role === 'gm' && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() =>
                              updateCampaign((p) => ({
                                ...p,
                                npcs: p.npcs.map((n) =>
                                  n.id === npc.id
                                    ? { ...n, revealedToPlayers: !n.revealedToPlayers }
                                    : n
                                ),
                              }))
                            }
                            className={`px-2 py-1 rounded text-[11px] flex items-center gap-1 cursor-pointer ${
                              npc.revealedToPlayers ? 'bg-emerald-600 text-white' : 'rpg-card'
                            }`}
                          >
                            {npc.revealedToPlayers ? (
                              <>
                                <Eye className="w-3 h-3" /> Visível
                              </>
                            ) : (
                              <>
                                <EyeOff className="w-3 h-3" /> Oculto
                              </>
                            )}
                          </button>
                          <button
                            onClick={() =>
                              updateCampaign((p) => ({
                                ...p,
                                npcs: p.npcs.filter((n) => n.id !== npc.id),
                              }))
                            }
                            className="text-red-400 p-1 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    <p style={{ color: 'var(--text-secondary)' }}>{npc.publicBio}</p>

                    {role === 'gm' && (
                      <div className="p-2 rounded bg-red-950/25 border border-red-500/30">
                        <div className="text-[10px] font-bold text-red-400 uppercase mb-1">
                          Segredo do Mestre (oculto dos jogadores)
                        </div>
                        <textarea
                          rows={2}
                          value={npc.secretNotes}
                          onChange={(e) =>
                            updateCampaign((p) => ({
                              ...p,
                              npcs: p.npcs.map((n) =>
                                n.id === npc.id ? { ...n, secretNotes: e.target.value } : n
                              ),
                            }))
                          }
                          className="rpg-input w-full text-xs"
                        />
                      </div>
                    )}

                    <div>
                      <div className="text-[10px] font-bold uppercase mb-1" style={{ color: 'var(--text-muted)' }}>
                        Anotações Compartilhadas do Grupo
                      </div>
                      <textarea
                        rows={2}
                        value={npc.sharedPartyNotes}
                        placeholder="Escreva lembretes do grupo sobre esse NPC..."
                        onChange={(e) =>
                          updateCampaign((p) => ({
                            ...p,
                            npcs: p.npcs.map((n) =>
                              n.id === npc.id ? { ...n, sharedPartyNotes: e.target.value } : n
                            ),
                          }))
                        }
                        className="rpg-input w-full text-xs"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'treasury' && (
            <div className="space-y-4 text-xs">
              <div className="rpg-card rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Coins className="w-6 h-6 text-amber-400" />
                  <div>
                    <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                      Fundo Coletivo do Grupo (Ouro)
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        type="number"
                        value={campaign.groupTreasury.gold}
                        onChange={(e) =>
                          updateCampaign((p) => ({
                            ...p,
                            groupTreasury: {
                              ...p.groupTreasury,
                              gold: Number(e.target.value),
                            },
                          }))
                        }
                        className="rpg-input w-28 font-display font-bold text-base"
                      />
                      <span className="font-bold">PO</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={addSharedLoot}
                  className="rpg-btn-primary px-3 py-1.5 rounded flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Adicionar Item / Pista
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {campaign.groupTreasury.items.map((item) => (
                  <div key={item.id} className="rpg-card rounded-lg p-3 flex items-start justify-between gap-2">
                    <div className="flex-1 space-y-1">
                      <div className="font-bold text-sm">{item.name}</div>
                      <input
                        value={item.notes}
                        onChange={(e) =>
                          updateCampaign((p) => ({
                            ...p,
                            groupTreasury: {
                              ...p.groupTreasury,
                              items: p.groupTreasury.items.map((it) =>
                                it.id === item.id ? { ...it, notes: e.target.value } : it
                              ),
                            },
                          }))
                        }
                        placeholder="Anotações sobre o item ou pista..."
                        className="rpg-input w-full text-xs"
                      />
                    </div>
                    <button
                      onClick={() =>
                        updateCampaign((p) => ({
                          ...p,
                          groupTreasury: {
                            ...p.groupTreasury,
                            items: p.groupTreasury.items.filter((it) => it.id !== item.id),
                          },
                        }))
                      }
                      className="text-red-400 p-1 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
