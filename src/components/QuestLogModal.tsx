import React, { useState } from 'react';
import {
  CheckCircle2,
  Coins,
  Compass,
  Plus,
  ScrollText,
  Sparkles,
  Trash2,
  Trophy,
  X,
  XCircle,
} from 'lucide-react';
import { useCampaign } from '../context/CampaignContext';
import { QuestEntry } from '../shared/types';
import { GrimoireModal } from './GrimoireModal';
import { openConfirmDialog } from './PromptDialog';

interface QuestLogModalProps {
  onClose: () => void;
}

const CATEGORY_LABELS: Record<QuestEntry['category'], { label: string; color: string }> = {
  principal: { label: 'Missão Principal', color: '#f59e0b' },
  secundaria: { label: 'Secundária', color: '#38bdf8' },
  guilda: { label: 'Contrato / Guilda', color: '#a855f7' },
};

export const QuestLogModal: React.FC<QuestLogModalProps> = ({ onClose }) => {
  const { campaign, role, updateCampaign, awardXp, pushCombatLog, triggerSound } = useCampaign();
  const quests = campaign.questLog || [];
  const [tab, setTab] = useState<'active' | 'completed' | 'failed'>('active');
  const [selectedId, setSelectedId] = useState<string | null>(() => quests[0]?.id || null);
  const [newObjText, setNewObjText] = useState('');

  const filtered = quests.filter((q) => q.status === tab);
  const selected =
    filtered.find((q) => q.id === selectedId) ||
    quests.find((q) => q.id === selectedId && q.status === tab) ||
    filtered[0] ||
    null;

  const activeCount = quests.filter((q) => q.status === 'active').length;
  const completedCount = quests.filter((q) => q.status === 'completed').length;
  const failedCount = quests.filter((q) => q.status === 'failed').length;

  const patchQuest = (questId: string, patch: Partial<QuestEntry>) => {
    updateCampaign((prev) => ({
      ...prev,
      questLog: (prev.questLog || []).map((q) => (q.id === questId ? { ...q, ...patch } : q)),
    }));
  };

  const handleCreateQuest = () => {
    const id = `quest-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    const fresh: QuestEntry = {
      id,
      title: 'Nova Missão',
      giver: '',
      category: 'principal',
      status: 'active',
      description: 'Descreva o gancho da missão, pistas e contexto para o grupo...',
      objectives: [{ id: `obj-${Date.now()}`, text: 'Investigar o local', completed: false }],
      rewardXp: 150,
      rewardGold: 50,
      rewardsDelivered: false,
      createdAt: new Date().toLocaleDateString('pt-BR'),
    };
    updateCampaign((prev) => ({
      ...prev,
      questLog: [fresh, ...(prev.questLog || [])],
    }));
    setTab('active');
    setSelectedId(id);
  };

  const handleDeleteQuest = async (quest: QuestEntry) => {
    const ok = await openConfirmDialog(
      `Excluir permanentemente a missão "${quest.title}"?`,
      'Excluir Missão',
      { confirmLabel: 'Excluir', cancelLabel: 'Cancelar' }
    );
    if (!ok) return;
    updateCampaign((prev) => ({
      ...prev,
      questLog: (prev.questLog || []).filter((q) => q.id !== quest.id),
    }));
    if (selectedId === quest.id) setSelectedId(null);
  };

  const handleCompleteAndDeliver = async (quest: QuestEntry) => {
    const alreadyDelivered = Boolean(quest.rewardsDelivered);
    const xp = alreadyDelivered ? 0 : Math.max(0, quest.rewardXp || 0);
    const gold = alreadyDelivered ? 0 : Math.max(0, quest.rewardGold || 0);
    const msg =
      xp > 0 || gold > 0
        ? `Concluir "${quest.title}" e entregar +${xp} XP e +${gold} PO para cada herói vivo do grupo?`
        : alreadyDelivered
          ? `Marcar "${quest.title}" como Concluída novamente? (As recompensas já foram entregues anteriormente.)`
          : `Marcar a missão "${quest.title}" como Concluída?`;
    const ok = await openConfirmDialog(msg, 'Concluir Missão', {
      confirmLabel: xp > 0 || gold > 0 ? 'Concluir & Recompensar' : 'Concluir',
      cancelLabel: 'Cancelar',
    });
    if (!ok) return;

    updateCampaign((prev) => ({
      ...prev,
      questLog: (prev.questLog || []).map((q) =>
        q.id === quest.id
          ? {
              ...q,
              status: 'completed',
              rewardsDelivered: true,
              objectives: q.objectives.map((o) => ({ ...o, completed: true })),
            }
          : q
      ),
      characters:
        gold > 0
          ? prev.characters.map((c) =>
              c.hp > 0 && !c.deathSaves?.dead ? { ...c, gold: (c.gold || 0) + gold } : c
            )
          : prev.characters,
    }));

    if (xp > 0) {
      window.setTimeout(() => {
        awardXp('all', xp);
      }, 90);
    }

    triggerSound({ action: 'sfx', presetKey: gold > 0 ? 'coin' : 'levelup', name: quest.title });
    pushCombatLog({
      category: 'xp',
      actorName: 'Crônica',
      actorKind: 'system',
      actorColor: '#f59e0b',
      summary: `Missão Concluída: "${quest.title}"${xp > 0 || gold > 0 ? ` (+${xp} XP • +${gold} PO por herói)` : ''}!`,
    });
    setTab('completed');
    setSelectedId(quest.id);
  };

  const handleAddObjective = () => {
    if (!selected || !newObjText.trim()) return;
    patchQuest(selected.id, {
      objectives: [
        ...selected.objectives,
        { id: `obj-${Date.now()}`, text: newObjText.trim(), completed: false },
      ],
    });
    setNewObjText('');
  };

  return (
    <GrimoireModal
      title="Quadro de Missões"
      subtitle="Objetivos ativos da campanha, contratos e recompensas do grupo"
      icon={<Compass className="w-4 h-4" />}
      onClose={onClose}
      size="xl"
      bodyClassName="flex flex-col overflow-hidden"
      headerActions={
        role === 'gm' ? (
          <button
            type="button"
            onClick={handleCreateQuest}
            className="rpg-btn-primary px-3 py-1.5 rounded text-xs flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nova Missão</span>
          </button>
        ) : undefined
      }
    >
      {/* Status Tabs */}
      <div
        className="px-4 py-2 border-b flex items-center gap-1.5 shrink-0 bg-[#0d0f16]"
        style={{ borderColor: 'var(--border-hairline)' }}
      >
        {(
          [
            { id: 'active', label: `Ativas (${activeCount})` },
            { id: 'completed', label: `Concluídas (${completedCount})` },
            { id: 'failed', label: `Falhas (${failedCount})` },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3 py-1 rounded text-xs font-display font-semibold transition cursor-pointer ${
              tab === t.id ? 'rpg-btn-primary' : 'rpg-btn-ghost'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Body: Left Quest List + Right Quest Details */}
      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[260px_1fr] overflow-hidden">
            {/* Quest List */}
            <div
              className="border-r overflow-y-auto p-3 space-y-2"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              {filtered.length === 0 ? (
                <div className="text-center py-10 px-3 space-y-2 opacity-65">
                  <ScrollText className="w-8 h-8 mx-auto text-amber-400/60" />
                  <div className="text-xs font-display">
                    Nenhuma missão nesta aba.
                  </div>
                  {role === 'gm' && tab === 'active' && (
                    <button
                      type="button"
                      onClick={handleCreateQuest}
                      className="rpg-card px-2.5 py-1 rounded text-[11px] text-amber-300 hover:border-amber-400 cursor-pointer"
                    >
                      + Criar primeira missão
                    </button>
                  )}
                </div>
              ) : (
                filtered.map((q) => {
                  const doneCount = q.objectives.filter((o) => o.completed).length;
                  const cat = CATEGORY_LABELS[q.category] || CATEGORY_LABELS.principal;
                  const isSel = selected?.id === q.id;
                  return (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => setSelectedId(q.id)}
                      className={`w-full text-left p-2.5 rounded-lg border transition cursor-pointer ${
                        isSel
                          ? 'bg-amber-500/12 border-amber-400/75 shadow-[0_0_16px_rgba(212,170,72,0.18)]'
                          : 'rpg-card hover:border-amber-400/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span
                          className="text-[9px] font-display font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border"
                          style={{
                            borderColor: `${cat.color}66`,
                            color: cat.color,
                            backgroundColor: `${cat.color}18`,
                          }}
                        >
                          {cat.label}
                        </span>
                        {q.objectives.length > 0 && (
                          <span className="text-[10px] font-mono-dice opacity-75">
                            {doneCount}/{q.objectives.length}
                          </span>
                        )}
                      </div>
                      <div className="font-display font-bold text-xs text-amber-100 truncate">
                        {q.title}
                      </div>
                      {q.giver && (
                        <div className="text-[10px] opacity-65 truncate mt-0.5">
                          Contratante: {q.giver}
                        </div>
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {/* Quest Detail Pane */}
            <div className="overflow-y-auto p-5 space-y-4">
              {!selected ? (
                <div className="h-full flex flex-col items-center justify-center text-center opacity-55 py-12">
                  <Compass className="w-10 h-10 text-amber-400/50 mb-2" />
                  <p className="text-xs font-display">
                    Selecione uma missão à esquerda para ver os detalhes.
                  </p>
                </div>
              ) : (
                <>
                  {/* Title & Category */}
                  <div className="space-y-2">
                    {role === 'gm' ? (
                      <div className="grid grid-cols-1 sm:grid-cols-[1fr_165px] gap-2">
                        <input
                          value={selected.title}
                          onChange={(e) => patchQuest(selected.id, { title: e.target.value })}
                          className="rpg-input font-display font-bold text-base"
                          placeholder="Título da Missão"
                        />
                        <select
                          value={selected.category}
                          onChange={(e) =>
                            patchQuest(selected.id, {
                              category: e.target.value as QuestEntry['category'],
                            })
                          }
                          className="rpg-input text-xs"
                        >
                          <option value="principal">Missão Principal</option>
                          <option value="secundaria">Secundária</option>
                          <option value="guilda">Contrato / Guilda</option>
                        </select>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-chronicle font-bold text-lg text-amber-200">
                          {selected.title}
                        </h3>
                        <span
                          className="text-[10px] font-display font-bold uppercase tracking-wider px-2 py-0.5 rounded border"
                          style={{
                            borderColor: `${(CATEGORY_LABELS[selected.category] || CATEGORY_LABELS.principal).color}66`,
                            color: (CATEGORY_LABELS[selected.category] || CATEGORY_LABELS.principal).color,
                          }}
                        >
                          {(CATEGORY_LABELS[selected.category] || CATEGORY_LABELS.principal).label}
                        </span>
                      </div>
                    )}

                    {role === 'gm' ? (
                      <input
                        value={selected.giver || ''}
                        onChange={(e) => patchQuest(selected.id, { giver: e.target.value })}
                        className="rpg-input w-full text-xs"
                        placeholder="Contratante / Local (ex: Capitão Aldric • Taverna do Javali)"
                      />
                    ) : (
                      selected.giver && (
                        <div className="text-xs text-amber-300/80 font-display">
                          Contratante: {selected.giver}
                        </div>
                      )
                    )}
                  </div>

                  {/* Description */}
                  <div>
                    <div className="text-[10px] font-display uppercase tracking-wider text-amber-300/80 mb-1">
                      Crônica & Contexto
                    </div>
                    {role === 'gm' ? (
                      <textarea
                        rows={3}
                        value={selected.description}
                        onChange={(e) => patchQuest(selected.id, { description: e.target.value })}
                        className="rpg-input w-full text-xs leading-relaxed"
                      />
                    ) : (
                      <div className="rpg-card rounded-lg p-3 text-xs leading-relaxed whitespace-pre-wrap">
                        {selected.description}
                      </div>
                    )}
                  </div>

                  {/* Objectives */}
                  <div className="space-y-2">
                    <div className="text-[10px] font-display uppercase tracking-wider text-amber-300/80">
                      Objetivos ({selected.objectives.filter((o) => o.completed).length}/
                      {selected.objectives.length})
                    </div>
                    <div className="space-y-1.5">
                      {selected.objectives.map((obj) => (
                        <div
                          key={obj.id}
                          className="rpg-card rounded-md px-3 py-2 flex items-center justify-between gap-2 text-xs"
                        >
                          <label
                            className={`flex items-center gap-2 flex-1 ${
                              role === 'gm' ? 'cursor-pointer' : ''
                            }`}
                          >
                            <input
                              type="checkbox"
                              disabled={role !== 'gm'}
                              checked={obj.completed}
                              onChange={(e) =>
                                patchQuest(selected.id, {
                                  objectives: selected.objectives.map((o) =>
                                    o.id === obj.id ? { ...o, completed: e.target.checked } : o
                                  ),
                                })
                              }
                              className="accent-amber-400"
                            />
                            <span
                              className={
                                obj.completed ? 'line-through opacity-55 text-emerald-300' : ''
                              }
                            >
                              {obj.text}
                            </span>
                          </label>
                          {role === 'gm' && (
                            <button
                              type="button"
                              onClick={() =>
                                patchQuest(selected.id, {
                                  objectives: selected.objectives.filter((o) => o.id !== obj.id),
                                })
                              }
                              className="text-red-400/70 hover:text-red-300 cursor-pointer"
                              title="Remover objetivo"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    {role === 'gm' && (
                      <div className="flex items-center gap-2">
                        <input
                          value={newObjText}
                          onChange={(e) => setNewObjText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddObjective();
                            }
                          }}
                          placeholder="Adicionar novo objetivo..."
                          className="rpg-input flex-1 text-xs"
                        />
                        <button
                          type="button"
                          onClick={handleAddObjective}
                          className="rpg-card px-3 py-1.5 rounded-md text-xs font-display font-bold hover:border-amber-400 cursor-pointer"
                        >
                          + Adicionar
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Rewards */}
                  <div className="rpg-card rounded-lg p-3 border border-amber-500/30 space-y-2">
                    <div className="text-[10px] font-display uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                      <Trophy className="w-3.5 h-3.5" />
                      <span>Recompensas por Herói</span>
                      {selected.rewardsDelivered && (
                        <span className="ml-auto text-emerald-300 text-[10px]">
                          ✓ Entregues ao Grupo
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                        {role === 'gm' ? (
                          <input
                            type="number"
                            min={0}
                            value={selected.rewardXp ?? 0}
                            onChange={(e) =>
                              patchQuest(selected.id, {
                                rewardXp: Math.max(0, Number(e.target.value) || 0),
                              })
                            }
                            className="rpg-input w-full font-mono-dice"
                          />
                        ) : (
                          <span className="font-mono-dice font-bold text-amber-200">
                            +{selected.rewardXp || 0} XP
                          </span>
                        )}
                        <span className="text-[10px] opacity-70">XP</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Coins className="w-4 h-4 text-yellow-400 shrink-0" />
                        {role === 'gm' ? (
                          <input
                            type="number"
                            min={0}
                            value={selected.rewardGold ?? 0}
                            onChange={(e) =>
                              patchQuest(selected.id, {
                                rewardGold: Math.max(0, Number(e.target.value) || 0),
                              })
                            }
                            className="rpg-input w-full font-mono-dice"
                          />
                        ) : (
                          <span className="font-mono-dice font-bold text-yellow-200">
                            +{selected.rewardGold || 0} PO
                          </span>
                        )}
                        <span className="text-[10px] opacity-70">Ouro</span>
                      </div>
                    </div>
                  </div>

                  {/* GM Footer Actions */}
                  {role === 'gm' && (
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/10">
                      <div className="flex items-center gap-2">
                        {selected.status === 'active' ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleCompleteAndDeliver(selected)}
                              className="rpg-btn-primary px-3 py-1.5 rounded-md text-xs font-display font-bold flex items-center gap-1.5 cursor-pointer"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              <span>Concluir & Entregar Recompensa</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                patchQuest(selected.id, { status: 'failed' });
                                setTab('failed');
                              }}
                              className="rpg-card px-2.5 py-1.5 rounded-md text-xs text-red-300 hover:border-red-400 flex items-center gap-1 cursor-pointer"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Marcar Falha</span>
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              patchQuest(selected.id, { status: 'active' });
                              setTab('active');
                            }}
                            className="rpg-card px-3 py-1.5 rounded-md text-xs hover:border-amber-400 cursor-pointer"
                          >
                            Reabrir Missão
                          </button>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteQuest(selected)}
                        className="rpg-card px-2.5 py-1.5 rounded-md text-xs text-red-400 hover:border-red-400 flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Excluir</span>
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
    </GrimoireModal>
  );
};
