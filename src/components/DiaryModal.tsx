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
import {
  buildMonsterAttackFromAbility,
  findNearestFreeGridCell,
  getCampaignDamageTypes,
} from '../shared/rulesEngine';
import { MonsterAttack, NpcEntry, Quest, SharedLootItem } from '../shared/types';
import { FileUploadButton } from './FileUploadButton';
import { openEntitySheet } from './EntitySheetModal';
import { GrimoireModal } from './GrimoireModal';
import { openInspectNpc } from './InspectEntityModal';
import { openTextPrompt } from './PromptDialog';
import { TokenPortrait } from './TokenPortrait';

interface DiaryModalProps {
  onClose: () => void;
  mode?: 'diary' | 'npcs';
}

export const DiaryModal: React.FC<DiaryModalProps> = ({ onClose, mode = 'diary' }) => {
  const { campaign, role, updateCampaign } = useCampaign();
  const [tab, setTab] = useState<'chronicle' | 'npcs' | 'treasury'>(
    mode === 'npcs' ? 'npcs' : 'chronicle'
  );
  const activeTab = mode === 'npcs' ? 'npcs' : tab;

  const addNpc = async () => {
    const name = await openTextPrompt('Nome do NPC:', 'Novo Personagem');
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
            ...(patch.revealedToPlayers !== undefined
              ? { isHidden: !patch.revealedToPlayers }
              : {}),
            hideNameFromPlayers:
              patch.hideNameFromPlayers !== undefined
                ? patch.hideNameFromPlayers
                : t.hideNameFromPlayers,
            hideAcFromPlayers:
              patch.hideAcFromPlayers !== undefined ? patch.hideAcFromPlayers : t.hideAcFromPlayers,
            hideHpFromPlayers:
              patch.hideHpFromPlayers !== undefined ? patch.hideHpFromPlayers : t.hideHpFromPlayers,
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
                    hp: Math.min(t.hp, npc.maxHp || 15),
                    defense: npc.defense || 11,
                    hideNameFromPlayers: npc.hideNameFromPlayers,
                    hideAcFromPlayers: npc.hideAcFromPlayers,
                    hideHpFromPlayers: npc.hideHpFromPlayers,
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
              hideNameFromPlayers: npc.hideNameFromPlayers,
              hideAcFromPlayers: npc.hideAcFromPlayers,
              hideHpFromPlayers: npc.hideHpFromPlayers,
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
    <GrimoireModal
      title={mode === 'npcs' ? 'Diretório de NPCs' : 'Diário & Tesouro do Grupo'}
      subtitle={
        mode === 'npcs'
          ? 'Aliados, mercadores e figurantes com história e combate opcional'
          : 'Tesouro coletivo e estoque compartilhado do grupo'
      }
      icon={mode === 'npcs' ? <Users className="w-4 h-4" /> : <ScrollText className="w-4 h-4" />}
      onClose={onClose}
      size="xl"
      bodyClassName="flex flex-col overflow-hidden"
    >
      {/* Tabs */}
      {mode !== 'npcs' && (
        <div
          className="px-4 py-2 border-b flex items-center gap-2 shrink-0 bg-[#0d0f16]"
          style={{ borderColor: 'var(--border-hairline)' }}
        >
          <button
            type="button"
            onClick={() => setTab('chronicle')}
            className={`px-3 py-1 rounded text-xs font-display font-semibold flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'chronicle' ? 'rpg-btn-primary' : 'rpg-btn-ghost'
            }`}
          >
            <ScrollText className="w-3.5 h-3.5" />
            <span>Crônica &amp; Notas</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('treasury')}
            className={`px-3 py-1 rounded text-xs font-display font-semibold flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'treasury' ? 'rpg-btn-primary' : 'rpg-btn-ghost'
            }`}
          >
            <Coins className="w-3.5 h-3.5" />
            <span>Tesouro do Grupo ({campaign.groupTreasury.gold} PO)</span>
          </button>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 min-h-0">
          {activeTab === 'chronicle' && (
            <div className="space-y-4 text-xs">
              <div className="rpg-card rounded-xl p-4 space-y-2">
                <div className="font-display font-bold text-sm text-amber-200 flex items-center gap-2">
                  <ScrollText className="w-4 h-4 text-amber-400" />
                  <span>Sinopse &amp; Diário da Campanha — {campaign.name}</span>
                </div>
                {role === 'gm' ? (
                  <textarea
                    rows={5}
                    value={campaign.description || ''}
                    onChange={(e) =>
                      updateCampaign((p) => ({ ...p, description: e.target.value }))
                    }
                    placeholder="Escreva aqui o resumo dos capítulos, acontecimentos marcantes e notas públicas do grupo..."
                    className="rpg-input w-full text-xs leading-relaxed"
                  />
                ) : (
                  <div className="rpg-well rounded p-3 font-lore text-sm leading-relaxed whitespace-pre-wrap text-[#ece4d5]">
                    {campaign.description || 'Nenhuma crônica pública registrada ainda.'}
                  </div>
                )}
              </div>

              {(campaign.questLog || []).length > 0 && (
                <div className="rpg-card rounded-xl p-4 space-y-2">
                  <div className="font-display font-bold text-xs uppercase tracking-wider text-amber-300">
                    Missões Registradas ({(campaign.questLog || []).length})
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {(campaign.questLog || []).map((q) => (
                      <div key={q.id} className="rpg-socket rounded-lg p-2.5 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-display font-bold text-amber-100 truncate">
                            {q.title}
                          </span>
                          <span
                            className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-display font-bold ${
                              q.status === 'completed'
                                ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-500/40'
                                : q.status === 'failed'
                                  ? 'bg-red-950/70 text-red-300 border border-red-500/40'
                                  : 'bg-amber-950/70 text-amber-300 border border-amber-500/40'
                            }`}
                          >
                            {q.status === 'completed'
                              ? 'Concluída'
                              : q.status === 'failed'
                                ? 'Falha'
                                : 'Ativa'}
                          </span>
                        </div>
                        {q.description && (
                          <p className="text-[11px] opacity-80 line-clamp-2">{q.description}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {visibleNpcs.some((n) => n.sharedPartyNotes?.trim()) && (
                <div className="rpg-card rounded-xl p-4 space-y-2">
                  <div className="font-display font-bold text-xs uppercase tracking-wider text-sky-300">
                    Anotações do Grupo sobre NPCs
                  </div>
                  <div className="space-y-2">
                    {visibleNpcs
                      .filter((n) => n.sharedPartyNotes?.trim())
                      .map((n) => (
                        <div key={n.id} className="rpg-socket rounded-lg p-2.5 space-y-0.5">
                          <div className="font-display font-bold text-amber-200">
                            {role !== 'gm' && n.hideNameFromPlayers ? '???' : n.name}
                          </div>
                          <p className="text-[11px] whitespace-pre-wrap opacity-90">
                            {n.sharedPartyNotes}
                          </p>
                        </div>
                      ))}
                  </div>
                </div>
              )}
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
                            name={role !== 'gm' && npc.hideNameFromPlayers ? '???' : npc.name}
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
                                {npc.hideNameFromPlayers ? '???' : npc.name}
                              </div>
                            )}
                            <div className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--accent-primary)' }}>
                              {role !== 'gm' && npc.hideNameFromPlayers
                                ? 'Identidade Desconhecida'
                                : `${npc.role} • ${npc.location} • ${npc.disposition}`}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {role === 'gm' ? (
                            <button
                              type="button"
                              onClick={() => openEntitySheet({ kind: 'npc', id: npc.id })}
                              className="rpg-card px-2 py-1 rounded text-[10px] font-display font-semibold text-[#e8c683] flex items-center gap-1 cursor-pointer"
                              title="Abrir Ficha Completa deste NPC (Mestre)"
                            >
                              <ScrollText className="w-3 h-3" />
                              <span>Ficha</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openInspectNpc(npc.id)}
                              className="rpg-card px-2 py-1 rounded text-[10px] font-display font-semibold text-[#e8c683] flex items-center gap-1 cursor-pointer"
                              title="Inspecionar informações públicas deste NPC"
                            >
                              <Eye className="w-3 h-3" />
                              <span>Inspecionar</span>
                            </button>
                          )}
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
                                updateCampaign((p) => {
                                  const removedTokIds = new Set(
                                    p.maps
                                      .flatMap((m) => m.tokens)
                                      .filter((t) => t.type === 'npc' && t.referenceId === npc.id)
                                      .map((t) => t.id)
                                  );
                                  const remainingCbs = p.combat.combatants.filter(
                                    (cb) =>
                                      !(
                                        (cb.tokenId && removedTokIds.has(cb.tokenId)) ||
                                        (cb.type !== 'character' && cb.referenceId === npc.id)
                                      )
                                  );
                                  return {
                                    ...p,
                                    npcs: p.npcs.filter((n) => n.id !== npc.id),
                                    maps: p.maps.map((m) => ({
                                      ...m,
                                      tokens: m.tokens.filter(
                                        (t) => !(t.type === 'npc' && t.referenceId === npc.id)
                                      ),
                                    })),
                                    combat: {
                                      ...p.combat,
                                      combatants: remainingCbs,
                                      currentTurnIndex: Math.min(
                                        p.combat.currentTurnIndex,
                                        Math.max(0, remainingCbs.length - 1)
                                      ),
                                    },
                                  };
                                })
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

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                            <label className="rpg-card rounded px-2.5 py-1.5 flex items-center justify-between gap-2 text-[11px] cursor-pointer select-none">
                              <span className="text-[#d6ccb8]">Ocultar Nome (???)</span>
                              <input
                                type="checkbox"
                                checked={Boolean(npc.hideNameFromPlayers)}
                                onChange={(e) =>
                                  updateNpc(npc.id, { hideNameFromPlayers: e.target.checked })
                                }
                                className="accent-[#a855f7]"
                              />
                            </label>
                            <label className="rpg-card rounded px-2.5 py-1.5 flex items-center justify-between gap-2 text-[11px] cursor-pointer select-none">
                              <span className="text-[#d6ccb8]">Ocultar C.A.</span>
                              <input
                                type="checkbox"
                                checked={Boolean(npc.hideAcFromPlayers)}
                                onChange={(e) =>
                                  updateNpc(npc.id, { hideAcFromPlayers: e.target.checked })
                                }
                                className="accent-[#d4ad5c]"
                              />
                            </label>
                            <label className="rpg-card rounded px-2.5 py-1.5 flex items-center justify-between gap-2 text-[11px] cursor-pointer select-none">
                              <span className="text-[#d6ccb8]">Ocultar Vida (PV)</span>
                              <input
                                type="checkbox"
                                checked={Boolean(npc.hideHpFromPlayers)}
                                onChange={(e) =>
                                  updateNpc(npc.id, { hideHpFromPlayers: e.target.checked })
                                }
                                className="accent-[#d4ad5c]"
                              />
                            </label>
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
                                              nextAtk = buildMonsterAttackFromAbility(ab, 4);
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
                                        <option value="">Nenhum</option>
                                        {getCampaignDamageTypes(campaign).map((dt) => (
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

                      {role !== 'gm' && !npc.hideNameFromPlayers && (
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
                        min={0}
                        value={campaign.groupTreasury.gold}
                        onChange={(e) =>
                          updateCampaign((p) => ({
                            ...p,
                            groupTreasury: {
                              ...p.groupTreasury,
                              gold: Math.max(0, Number(e.target.value) || 0),
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
    </GrimoireModal>
  );
};
