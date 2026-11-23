import React, { useState } from 'react';
import {
  Coins,
  Eye,
  EyeOff,
  MapPin,
  Plus,
  ScrollText,
  Swords,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useCampaign } from '../context/CampaignContext';
import { DAMAGE_TYPE_OPTIONS, findNearestFreeGridCell } from '../shared/rulesEngine';
import { MonsterAttack, NpcEntry, Quest, SharedLootItem } from '../shared/types';
import { FileUploadButton } from './FileUploadButton';
import { openEntitySheet } from './EntitySheetModal';
import { openTextPrompt } from './PromptDialog';
import { TokenPortrait } from './TokenPortrait';

interface DiaryModalProps {
  onClose: () => void;
  mode?: 'diary' | 'npcs';
}

export const DiaryModal: React.FC<DiaryModalProps> = ({ onClose, mode = 'diary' }) => {
  const { campaign, role, updateCampaign } = useCampaign();
  const [tab, setTab] = useState<'quests' | 'npcs' | 'treasury'>(
    mode === 'npcs' ? 'npcs' : 'quests'
  );
  const activeTab = mode === 'npcs' ? 'npcs' : tab === 'npcs' ? 'quests' : tab;

  const addQuest = async () => {
    const title = await openTextPrompt(
      'Título da Missão / Objetivo:',
      'Investigar a Torre Abandonada'
    );
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

  const addNpc = async () => {
    const name = await openTextPrompt('Nome do NPC:', 'Novo Personagem');
    if (!name) return;
    const npc: NpcEntry = {
      id: `npc-${Date.now()}`,
      name,
      role: 'Habitante Local',
      location: 'Cidade',
      imageUrl: '',
      tokenColor: '#e0b84c',
      publicBio: 'Descrição visível para os jogadores.',
      secretNotes: 'Segredo exclusivo do Mestre.',
      sharedPartyNotes: '',
      revealedToPlayers: role === 'gm' ? false : true,
      disposition: 'Neutro',
      combatEnabled: false,
      maxHp: 15,
      defense: 11,
      speed: 9,
      attacks: [],
    };
    updateCampaign((p) => ({ ...p, npcs: [npc, ...p.npcs] }));
  };

  const updateNpc = (npcId: string, patch: Partial<NpcEntry>) => {
    updateCampaign((p) => ({
      ...p,
      npcs: p.npcs.map((n) => (n.id === npcId ? { ...n, ...patch } : n)),
      maps: p.maps.map((m) => ({
        ...m,
        tokens: m.tokens.map((t) => {
          if (t.type !== 'npc' || t.referenceId !== npcId) return t;
          const nextMaxHp = patch.maxHp ?? t.maxHp;
          return {
            ...t,
            name: patch.name ?? t.name,
            imageUrl: patch.imageUrl !== undefined ? patch.imageUrl : t.imageUrl,
            color: patch.tokenColor ?? t.color,
            maxHp: nextMaxHp,
            hp: Math.min(t.hp, nextMaxHp),
            defense: patch.defense ?? t.defense,
          };
        }),
      })),
    }));
  };

  const placeNpcOnActiveMap = (npc: NpcEntry) => {
    const activeMap = campaign.maps.find((m) => m.id === campaign.activeMapId);
    if (!activeMap) return;
    const npcColor =
      npc.tokenColor ||
      (npc.disposition === 'Hostil'
        ? '#ef4444'
        : npc.disposition === 'Aliado'
          ? '#22c55e'
          : '#e0b84c');
    const npcFrame =
      npc.disposition === 'Hostil'
        ? 'crimson'
        : npc.disposition === 'Aliado'
          ? 'emerald'
          : 'gold';

    updateCampaign((prev) => ({
      ...prev,
      maps: prev.maps.map((m) => {
        if (m.id !== prev.activeMapId) return m;
        const existing = m.tokens.find((t) => t.type === 'npc' && t.referenceId === npc.id);
        if (existing) {
          return {
            ...m,
            tokens: m.tokens.map((t) =>
              t.id === existing.id
                ? {
                    ...t,
                    name: npc.name,
                    imageUrl: npc.imageUrl,
                    color: npcColor,
                    frameStyle: npcFrame,
                    maxHp: npc.maxHp || 15,
                    defense: npc.defense || 11,
                  }
                : t
            ),
          };
        }
        const pos = findNearestFreeGridCell(
          m,
          Math.floor(m.gridWidth / 2),
          Math.floor(m.gridHeight / 2),
          1
        );
        return {
          ...m,
          tokens: [
            ...m.tokens,
            {
              id: `tok-npc-${npc.id}-${Date.now()}`,
              name: npc.name,
              type: 'npc',
              referenceId: npc.id,
              x: pos.x,
              y: pos.y,
              size: 1,
              hp: npc.maxHp || 15,
              maxHp: npc.maxHp || 15,
              defense: npc.defense || 11,
              activeConditionIds: [],
              isHidden: !npc.revealedToPlayers,
              color: npcColor,
              frameStyle: npcFrame,
              imageUrl: npc.imageUrl,
            },
          ],
        };
      }),
    }));
  };

  const addSharedLoot = async () => {
    const name = await openTextPrompt(
      'Nome do item / pista para o Baú do Grupo:',
      'Pergaminho Selado'
    );
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
            {mode === 'npcs' ? (
              <Users className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
            ) : (
              <ScrollText className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
            )}
            <div>
              <h2 className="font-display font-bold text-base leading-none">
                {mode === 'npcs' ? 'Criador & Diretório de NPCs' : 'Diário Compartilhado da Campanha'}
              </h2>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                {mode === 'npcs'
                  ? 'Crie aliados, mercadores e figurantes com foto, história e combate opcional (separado do Bestiário).'
                  : 'Missões ativas e tesouro coletivo do grupo.'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rpg-card p-1.5 rounded cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        {mode !== 'npcs' && (
          <div className="px-4 py-2 border-b flex items-center gap-2 shrink-0" style={{ borderColor: 'var(--border-subtle)' }}>
            <button
              onClick={() => setTab('quests')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'quests' ? 'rpg-btn-primary' : 'rpg-card'
              }`}
            >
              <ScrollText className="w-4 h-4" />
              <span>Mural de Missões ({campaign.quests.length})</span>
            </button>
            <button
              onClick={() => setTab('treasury')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'treasury' ? 'rpg-btn-primary' : 'rpg-card'
              }`}
            >
              <Coins className="w-4 h-4" />
              <span>Tesouro do Grupo ({campaign.groupTreasury.gold} PO)</span>
            </button>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 min-h-0">
          {activeTab === 'quests' && (
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

          {activeTab === 'npcs' && (
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                  {role === 'gm'
                    ? 'Crie NPCs com foto, descrição e combate opcional. Você também pode arrastá-los pro mapa pelo painel esquerdo!'
                    : 'NPCs conhecidos e revelados pelo Mestre durante a aventura.'}
                </span>
                {role === 'gm' && (
                  <button
                    onClick={addNpc}
                    className="rpg-btn-primary px-3 py-1.5 rounded flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Novo NPC
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {visibleNpcs.map((npc) => {
                  const npcColor =
                    npc.tokenColor ||
                    (npc.disposition === 'Hostil'
                      ? '#ef4444'
                      : npc.disposition === 'Aliado'
                        ? '#22c55e'
                        : '#e0b84c');
                  const npcFrame =
                    npc.disposition === 'Hostil'
                      ? 'crimson'
                      : npc.disposition === 'Aliado'
                        ? 'emerald'
                        : 'gold';

                  return (
                    <div
                      key={npc.id}
                      className={`rpg-card rounded-xl p-3.5 space-y-2.5 ${
                        !npc.revealedToPlayers ? 'border-dashed opacity-85' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <TokenPortrait
                            name={npc.name}
                            imageUrl={npc.imageUrl}
                            playerColor={npcColor}
                            frameStyle={npcFrame}
                            sizePx={46}
                          />
                          <div className="min-w-0 flex-1">
                            {role === 'gm' ? (
                              <input
                                value={npc.name}
                                onChange={(e) => updateNpc(npc.id, { name: e.target.value })}
                                className="rpg-input font-display font-bold text-sm py-0.5 w-full"
                                placeholder="Nome do NPC"
                              />
                            ) : (
                              <div className="font-display font-bold text-sm truncate">
                                {npc.name}
                              </div>
                            )}
                            <div className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--accent-primary)' }}>
                              {npc.role} • {npc.location} • {npc.disposition}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => openEntitySheet({ kind: 'npc', id: npc.id })}
                            className="rpg-card px-2 py-1 rounded text-[10px] font-display font-bold text-amber-200 hover:border-amber-400/60 cursor-pointer"
                            title="Abrir Ficha Completa deste NPC"
                          >
                            📜 Ficha
                          </button>
                          {role === 'gm' && (
                            <>
                            <button
                              onClick={() => placeNpcOnActiveMap(npc)}
                              className="rpg-btn-primary px-2 py-1 rounded text-[10px] font-display font-bold flex items-center gap-1 cursor-pointer"
                              title="Colocar este NPC no mapa atual"
                            >
                              <MapPin className="w-3 h-3" /> Mapa
                            </button>
                            <button
                              onClick={() =>
                                updateNpc(npc.id, { revealedToPlayers: !npc.revealedToPlayers })
                              }
                              className={`px-2 py-1 rounded text-[10px] flex items-center gap-1 cursor-pointer ${
                                npc.revealedToPlayers ? 'bg-emerald-700 text-white' : 'rpg-card'
                              }`}
                              title="Controla se os jogadores veem este NPC no Diário"
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
                              title="Excluir NPC"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            </>
                          )}
                        </div>
                      </div>

                      {role === 'gm' && (
                        <>
                          <div className="flex items-center gap-2 flex-wrap">
                            <FileUploadButton
                              accept="image/*"
                              label={npc.imageUrl ? 'Trocar Foto' : 'Subir Foto'}
                              onUploaded={(url) => updateNpc(npc.id, { imageUrl: url })}
                              className="rounded-md"
                            />
                            {npc.imageUrl && (
                              <button
                                type="button"
                                onClick={() => updateNpc(npc.id, { imageUrl: '' })}
                                className="rpg-card px-2 py-1 rounded text-[10px] text-red-400 cursor-pointer"
                              >
                                Remover Foto
                              </button>
                            )}
                            <label className="flex items-center gap-1 text-[10px] ml-auto">
                              <span>Cor:</span>
                              <input
                                type="color"
                                value={npcColor}
                                onChange={(e) => updateNpc(npc.id, { tokenColor: e.target.value })}
                                className="w-6 h-6 rounded bg-transparent cursor-pointer"
                              />
                            </label>
                          </div>

                          <div className="grid grid-cols-3 gap-1.5">
                            <input
                              value={npc.role}
                              onChange={(e) => updateNpc(npc.id, { role: e.target.value })}
                              placeholder="Papel / Cargo"
                              className="rpg-input py-1 text-[11px]"
                            />
                            <input
                              value={npc.location}
                              onChange={(e) => updateNpc(npc.id, { location: e.target.value })}
                              placeholder="Local"
                              className="rpg-input py-1 text-[11px]"
                            />
                            <select
                              value={npc.disposition}
                              onChange={(e) =>
                                updateNpc(npc.id, {
                                  disposition: e.target.value as NpcEntry['disposition'],
                                })
                              }
                              className="rpg-input py-1 text-[11px]"
                            >
                              <option value="Aliado">Aliado</option>
                              <option value="Neutro">Neutro</option>
                              <option value="Hostil">Hostil</option>
                              <option value="Desconhecido">Desconhecido</option>
                            </select>
                          </div>

                          <div>
                            <div className="text-[10px] font-bold uppercase mb-1" style={{ color: 'var(--text-muted)' }}>
                              Descrição Pública (visível aos jogadores quando revelado)
                            </div>
                            <textarea
                              rows={2}
                              value={npc.publicBio}
                              onChange={(e) => updateNpc(npc.id, { publicBio: e.target.value })}
                              className="rpg-input w-full text-xs"
                            />
                          </div>

                          {/* Optional Combat Stats for NPC (GM Only) */}
                          <div className="p-2.5 rounded-lg bg-black/25 border border-amber-500/25 space-y-2">
                            <label className="flex items-center justify-between gap-2 cursor-pointer select-none">
                              <span className="font-display font-bold text-[11px] text-amber-300 flex items-center gap-1.5">
                                <Swords className="w-3.5 h-3.5" />
                                Ficha de Combate (Opcional — só o Mestre vê)
                              </span>
                              <input
                                type="checkbox"
                                checked={Boolean(npc.combatEnabled)}
                                onChange={(e) =>
                                  updateNpc(npc.id, {
                                    combatEnabled: e.target.checked,
                                    maxHp: npc.maxHp || 15,
                                    defense: npc.defense || 11,
                                    speed: npc.speed || 9,
                                  })
                                }
                                className="accent-amber-400"
                              />
                            </label>

                            {npc.combatEnabled && (
                              <div className="space-y-2 pt-1">
                                <div className="grid grid-cols-3 gap-1.5">
                                  <div>
                                    <label className="block text-[10px] opacity-75 mb-0.5">PV Máx</label>
                                    <input
                                      type="number"
                                      min={1}
                                      value={npc.maxHp ?? 15}
                                      onChange={(e) =>
                                        updateNpc(npc.id, { maxHp: Math.max(1, Number(e.target.value) || 1) })
                                      }
                                      className="rpg-input w-full py-1 text-center font-mono-dice"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[10px] opacity-75 mb-0.5">CA</label>
                                    <input
                                      type="number"
                                      min={1}
                                      value={npc.defense ?? 11}
                                      onChange={(e) =>
                                        updateNpc(npc.id, { defense: Math.max(1, Number(e.target.value) || 10) })
                                      }
                                      className="rpg-input w-full py-1 text-center font-mono-dice"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[10px] opacity-75 mb-0.5">Desloc. (m)</label>
                                    <input
                                      type="number"
                                      min={1.5}
                                      step={1.5}
                                      value={npc.speed ?? 9}
                                      onChange={(e) =>
                                        updateNpc(npc.id, { speed: Math.max(1.5, Number(e.target.value) || 9) })
                                      }
                                      className="rpg-input w-full py-1 text-center font-mono-dice"
                                    />
                                  </div>
                                </div>

                                <div className="space-y-1.5">
                                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                                    <span className="text-[10px] font-bold opacity-80">Ataques do NPC</span>
                                    <div className="flex items-center gap-1">
                                      <select
                                        value=""
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          if (!val) return;
                                          const [kind, refId] = val.split('::');
                                          let nextAtk: MonsterAttack | null = null;
                                          if (kind === 'item') {
                                            const it = campaign.compendium.items.find((i) => i.id === refId);
                                            if (it) {
                                              nextAtk = {
                                                name: it.name,
                                                attackBonus: 4,
                                                damageFormula: (it.damageFormula || '1d8').replace(/@\w+/g, '0').replace(/\+\s*0\b/g, '').trim() || '1d8',
                                                damageType: it.damageType || 'Corte',
                                                range: it.range || '1,5m',
                                                sourceItemId: it.id,
                                              };
                                            }
                                          } else if (kind === 'ability') {
                                            const ab = campaign.compendium.abilities.find((a) => a.id === refId);
                                            if (ab) {
                                              const hasNoDamage = !ab.damageType;
                                              const isHeal = ab.damageType?.toLowerCase() === 'cura';
                                              nextAtk = {
                                                name: ab.name,
                                                attackBonus: hasNoDamage || isHeal ? 0 : 4,
                                                damageFormula: hasNoDamage
                                                  ? ''
                                                  : (ab.damageFormula || '1d8').replace(/@\w+/g, '0').replace(/\+\s*0\b/g, '').trim() || '1d8',
                                                damageType: ab.damageType || '',
                                                range: ab.range || 'Pessoal',
                                                sourceAbilityId: ab.id,
                                                applyConditionId: ab.applyConditionId,
                                                conditionDurationRounds: ab.conditionDurationRounds,
                                              };
                                            }
                                          }
                                          if (nextAtk) {
                                            updateNpc(npc.id, {
                                              combatEnabled: true,
                                              attacks: [...(npc.attacks || []), nextAtk],
                                            });
                                          }
                                        }}
                                        className="rpg-input py-0.5 px-1.5 text-[10px] max-w-[160px]"
                                        title="Importar arma ou habilidade criada no Compêndio"
                                      >
                                        <option value="">+ Do Compêndio...</option>
                                        {campaign.compendium.items.filter((i) => i.type === 'Arma').length > 0 && (
                                          <optgroup label="Armas">
                                            {campaign.compendium.items
                                              .filter((i) => i.type === 'Arma')
                                              .map((it) => (
                                                <option key={it.id} value={`item::${it.id}`}>
                                                  ⚔ {it.name}
                                                </option>
                                              ))}
                                          </optgroup>
                                        )}
                                        {campaign.compendium.abilities.length > 0 && (
                                          <optgroup label="Habilidades / Magias">
                                            {campaign.compendium.abilities.map((ab) => (
                                              <option key={ab.id} value={`ability::${ab.id}`}>
                                                ✨ {ab.name}
                                              </option>
                                            ))}
                                          </optgroup>
                                        )}
                                      </select>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const nextAtk: MonsterAttack = {
                                            name: 'Adaga / Golpe',
                                            attackBonus: 3,
                                            damageFormula: '1d4 + 1',
                                            damageType: 'Perfuração',
                                            range: '1,5m',
                                          };
                                          updateNpc(npc.id, {
                                            combatEnabled: true,
                                            attacks: [...(npc.attacks || []), nextAtk],
                                          });
                                        }}
                                        className="rpg-card px-2 py-0.5 rounded text-[10px] cursor-pointer hover:border-amber-400/60"
                                      >
                                        + Ataque
                                      </button>
                                    </div>
                                  </div>

                                  {(npc.attacks || []).map((atk, aIdx) => (
                                    <div key={aIdx} className="grid grid-cols-12 gap-1 items-center">
                                      <input
                                        value={atk.name}
                                        onChange={(e) =>
                                          updateNpc(npc.id, {
                                            attacks: (npc.attacks || []).map((x, i) =>
                                              i === aIdx ? { ...x, name: e.target.value } : x
                                            ),
                                          })
                                        }
                                        placeholder="Ataque"
                                        className="rpg-input col-span-4 py-0.5 text-[10px]"
                                      />
                                      <input
                                        type="number"
                                        value={atk.attackBonus}
                                        onChange={(e) =>
                                          updateNpc(npc.id, {
                                            attacks: (npc.attacks || []).map((x, i) =>
                                              i === aIdx ? { ...x, attackBonus: Number(e.target.value) } : x
                                            ),
                                          })
                                        }
                                        title="Bônus de Ataque"
                                        className="rpg-input col-span-2 py-0.5 text-[10px] text-center font-mono-dice"
                                      />
                                      <input
                                        value={atk.damageFormula}
                                        onChange={(e) =>
                                          updateNpc(npc.id, {
                                            attacks: (npc.attacks || []).map((x, i) =>
                                              i === aIdx ? { ...x, damageFormula: e.target.value } : x
                                            ),
                                          })
                                        }
                                        placeholder="1d6+1"
                                        className="rpg-input col-span-3 py-0.5 text-[10px] font-mono-dice"
                                      />
                                      <select
                                        value={atk.damageType}
                                        onChange={(e) =>
                                          updateNpc(npc.id, {
                                            attacks: (npc.attacks || []).map((x, i) =>
                                              i === aIdx ? { ...x, damageType: e.target.value } : x
                                            ),
                                          })
                                        }
                                        className="rpg-input col-span-2 py-0.5 text-[10px]"
                                      >
                                        {DAMAGE_TYPE_OPTIONS.map((dt) => (
                                          <option key={dt} value={dt}>
                                            {dt}
                                          </option>
                                        ))}
                                      </select>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          updateNpc(npc.id, {
                                            attacks: (npc.attacks || []).filter((_, i) => i !== aIdx),
                                          })
                                        }
                                        className="col-span-1 text-red-400 flex justify-center cursor-pointer"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </>
                      )}

                      {role !== 'gm' && (
                        <p style={{ color: 'var(--text-secondary)' }}>{npc.publicBio}</p>
                      )}

                      {role === 'gm' && (
                        <div className="p-2 rounded bg-red-950/25 border border-red-500/30">
                          <div className="text-[10px] font-bold text-red-400 uppercase mb-1">
                            Segredo do Mestre (oculto dos jogadores)
                          </div>
                          <textarea
                            rows={2}
                            value={npc.secretNotes}
                            onChange={(e) => updateNpc(npc.id, { secretNotes: e.target.value })}
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
                          onChange={(e) => updateNpc(npc.id, { sharedPartyNotes: e.target.value })}
                          className="rpg-input w-full text-xs"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'treasury' && (
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
